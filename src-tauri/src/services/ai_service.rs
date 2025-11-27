use tauri::{AppHandle, Emitter};
use reqwest::Client;
use futures::StreamExt;
use serde_json::json;
use std::sync::Arc;

use crate::models::ai::*;
use crate::models::settings::Settings;
use crate::db::{TodoRepository, SettingsRepository};
use crate::services::function_call::{FunctionExecutor, get_function_definitions, get_tools};
use crate::error::AppError;

pub struct AiService {
    http_client: Client,
    settings_repo: Arc<SettingsRepository>,
    todo_repo: Arc<TodoRepository>,
    function_executor: Arc<FunctionExecutor>,
}

impl AiService {
    pub fn new(
        settings_repo: Arc<SettingsRepository>,
        todo_repo: Arc<TodoRepository>,
        function_executor: Arc<FunctionExecutor>,
    ) -> Self {
        Self {
            http_client: Client::new(),
            settings_repo,
            todo_repo,
            function_executor,
        }
    }

    /// 构建消息列表
    fn build_messages(&self, settings: &Settings, request: &AiChatRequest, todos: &[crate::models::todo::Todo]) -> Vec<ChatMessage> {
        let mut messages = Vec::new();

        // 系统提示词，包含当前任务上下文
        let todo_context = if todos.is_empty() {
            "当前没有任何待办任务。".to_string()
        } else {
            let pending: Vec<_> = todos.iter()
                .filter(|t| !t.completed)
                .take(10)
                .map(|t| format!("- [{}] {} (ID: {})", if t.completed { "x" } else { " " }, t.text, &t.id[..8]))
                .collect();

            format!("当前待办任务:\n{}", pending.join("\n"))
        };

        let system_prompt = format!(
            "{}\n\n---\n{}",
            settings.system_prompt,
            todo_context
        );

        messages.push(ChatMessage {
            role: "system".to_string(),
            content: Some(system_prompt),
            name: None,
            function_call: None,
            tool_calls: None,
            tool_call_id: None,
        });

        // 添加历史消息
        if let Some(history) = &request.history {
            for msg in history {
                messages.push(msg.clone());
            }
        }

        // 添加用户消息
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: Some(request.message.clone()),
            name: None,
            function_call: None,
            tool_calls: None,
            tool_call_id: None,
        });

        messages
    }

    /// 非流式聊天（支持 Function Call 循环）
    pub async fn chat(&self, request: AiChatRequest) -> Result<AiChatResponse, AppError> {
        log::info!("AI chat request received");

        let settings = self.settings_repo.get()?;
        let todos = self.todo_repo.get_all(None)?;
        let mut messages = self.build_messages(&settings, &request, &todos);
        let mut function_results = Vec::new();
        let mut warnings = Vec::new();

        // Function Call 循环，最多 5 次
        for iteration in 0..5 {
            log::debug!("Function call loop iteration {}", iteration);

            let response = self.call_api(&settings, &messages, false).await?;
            let choice = response.choices.first()
                .ok_or_else(|| AppError::ApiError("No response choice".into()))?;

            log::debug!("Response finish_reason: {:?}", choice.finish_reason);

            // Check for function calls in modern tools format
            if let Some(ref tool_calls) = choice.message.tool_calls {
                log::info!("Detected {} tool calls (modern format)", tool_calls.len());

                for tool_call in tool_calls {
                    if tool_call.tool_type == "function" {
                        let result = self.function_executor.execute(
                            &tool_call.function.name,
                            &tool_call.function.arguments
                        )?;

                        function_results.push(FunctionResult {
                            function_name: tool_call.function.name.clone(),
                            success: true,
                            result: result.clone(),
                        });

                        // Add assistant message with tool call
                        messages.push(choice.message.clone());

                        // Add tool response message
                        messages.push(ChatMessage {
                            role: "tool".to_string(),
                            name: Some(tool_call.function.name.clone()),
                            content: Some(serde_json::to_string(&result)?),
                            function_call: None,
                            tool_calls: None,
                            tool_call_id: Some(tool_call.id.clone()),
                        });
                    }
                }

                continue; // Continue loop for AI to process results
            }

            // Check for function call in legacy format
            if let Some(ref fc) = choice.message.function_call {
                log::info!("Detected function call (legacy format): {}", fc.name);

                let result = self.function_executor.execute(&fc.name, &fc.arguments)?;

                function_results.push(FunctionResult {
                    function_name: fc.name.clone(),
                    success: true,
                    result: result.clone(),
                });

                // Add assistant message
                messages.push(choice.message.clone());

                // Add function result
                messages.push(ChatMessage {
                    role: "function".to_string(),
                    name: Some(fc.name.clone()),
                    content: Some(serde_json::to_string(&result)?),
                    function_call: None,
                    tool_calls: None,
                    tool_call_id: None,
                });

                continue; // Continue loop
            }

            // No structured function call detected - check text fallback if enabled
            if settings.enable_text_fallback {
                if let Some(ref content) = choice.message.content {
                    let extracted = crate::services::function_call::parse_function_calls_from_text(content);

                    if !extracted.is_empty() {
                        log::warn!("Extracted {} function calls from text (fallback mode)", extracted.len());
                        warnings.push(
                            "Function calls were parsed from text instead of structured format. Your API may not fully support function calling.".to_string()
                        );

                        let mut cleaned_content = content.clone();

                        for call in extracted {
                            let result = self.function_executor.execute(&call.name, &call.arguments)?;

                            function_results.push(FunctionResult {
                                function_name: call.name.clone(),
                                success: true,
                                result: result.clone(),
                            });

                            // Remove the function call from text
                            cleaned_content = cleaned_content.replace(&call.original_text, "");
                        }

                        // Add message with cleaned text
                        messages.push(ChatMessage {
                            role: "assistant".to_string(),
                            content: Some(cleaned_content.trim().to_string()),
                            name: None,
                            function_call: None,
                            tool_calls: None,
                            tool_call_id: None,
                        });

                        // Add function results to message history
                        for result in &function_results {
                            messages.push(ChatMessage {
                                role: "function".to_string(),
                                name: Some(result.function_name.clone()),
                                content: Some(serde_json::to_string(&result.result)?),
                                function_call: None,
                                tool_calls: None,
                                tool_call_id: None,
                            });
                        }

                        continue; // Continue loop
                    }
                }
            }

            // No function call detected - return final response
            let final_message = choice.message.content.clone().unwrap_or_default();
            let updated_todos = self.todo_repo.get_all(None)?;

            return Ok(AiChatResponse {
                message: final_message,
                function_results: if function_results.is_empty() {
                    None
                } else {
                    Some(function_results)
                },
                updated_todos: Some(updated_todos),
                warnings: if warnings.is_empty() {
                    None
                } else {
                    Some(warnings)
                },
            });
        }

        Err(AppError::TooManyFunctionCalls)
    }

    /// 流式聊天
    pub async fn chat_stream(&self, app: &AppHandle, request: AiChatRequest) -> Result<(), AppError> {
        log::info!("AI streaming chat request received");

        let settings = self.settings_repo.get()?;
        let todos = self.todo_repo.get_all(None)?;
        let messages = self.build_messages(&settings, &request, &todos);

        let api_key = settings.api_key.as_ref()
            .ok_or(AppError::MissingApiKey)?;

        // Determine which format to use (same logic as call_api)
        let (use_tools_format, use_functions_format) = match settings.function_calling_mode.as_str() {
            "tools" => (true, false),
            "functions" => (false, true),
            "disabled" => (false, false),
            _ => (true, true),  // "auto"
        };

        let req_body = ChatCompletionRequest {
            model: settings.model.clone(),
            messages,
            functions: if use_functions_format {
                Some(get_function_definitions())
            } else {
                None
            },
            function_call: if use_functions_format {
                Some("auto".to_string())
            } else {
                None
            },
            tools: if use_tools_format {
                Some(get_tools())
            } else {
                None
            },
            tool_choice: if use_tools_format {
                Some("auto".to_string())
            } else {
                None
            },
            temperature: Some(settings.temperature),
            max_tokens: Some(settings.max_tokens),
            stream: Some(true),
        };

        let response = self.http_client
            .post(format!("{}/chat/completions", settings.api_base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&req_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            log::error!("AI stream API error (status {}): {}", status, error_text);
            return Err(AppError::ApiError(error_text));
        }

        let mut stream = response.bytes_stream();
        let mut content_buffer = String::new();
        let mut function_name = String::new();
        let mut function_args = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if !line.starts_with("data: ") {
                    continue;
                }

                let data = &line[6..];
                if data == "[DONE]" {
                    // 流结束
                    if !function_name.is_empty() {
                        // 执行 function call
                        let result = self.function_executor.execute(&function_name, &function_args)?;
                        app.emit("ai-stream-chunk", json!({
                            "function_call": {
                                "name": function_name,
                                "result": result
                            }
                        }))?;
                    }

                    app.emit("ai-stream-done", json!({
                        "content": content_buffer
                    }))?;
                    break;
                }

                if let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) {
                    if let Some(choice) = chunk.choices.first() {
                        // 处理普通内容
                        if let Some(content) = &choice.delta.content {
                            content_buffer.push_str(content);
                            app.emit("ai-stream-chunk", json!({
                                "content": content
                            }))?;
                        }

                        // 处理 function call
                        if let Some(ref fc) = choice.delta.function_call {
                            if let Some(name) = &fc.name {
                                function_name = name.clone();
                            }
                            if let Some(args) = &fc.arguments {
                                function_args.push_str(args);
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// 调用 OpenAI 兼容 API
    async fn call_api(
        &self,
        settings: &Settings,
        messages: &[ChatMessage],
        stream: bool,
    ) -> Result<ChatCompletionResponse, AppError> {
        let api_key = settings.api_key.as_ref()
            .ok_or(AppError::MissingApiKey)?;

        // Determine which format to use
        let (use_tools_format, use_functions_format) = match settings.function_calling_mode.as_str() {
            "tools" => (true, false),
            "functions" => (false, true),
            "disabled" => (false, false),
            _ => (true, true),  // "auto" - try tools first, include functions as fallback
        };

        let req_body = ChatCompletionRequest {
            model: settings.model.clone(),
            messages: messages.to_vec(),
            functions: if use_functions_format {
                Some(get_function_definitions())
            } else {
                None
            },
            function_call: if use_functions_format {
                Some("auto".to_string())
            } else {
                None
            },
            tools: if use_tools_format {
                Some(get_tools())
            } else {
                None
            },
            tool_choice: if use_tools_format {
                Some("auto".to_string())
            } else {
                None
            },
            temperature: Some(settings.temperature),
            max_tokens: Some(settings.max_tokens),
            stream: Some(stream),
        };

        // Debug logging before sending request
        log::debug!("Sending API request to {}", settings.api_base_url);
        log::debug!("Model: {}, Tools: {}, Functions: {}",
            req_body.model,
            use_tools_format,
            use_functions_format
        );

        let response = self.http_client
            .post(format!("{}/chat/completions", settings.api_base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&req_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            log::error!("AI API error (status {}): {}", status, error_text);
            return Err(AppError::ApiError(format!("HTTP {}: {}", status, error_text)));
        }

        // Parse response with detailed logging
        let response_text = response.text().await?;
        log::debug!("Raw API response: {}", response_text);

        let result: ChatCompletionResponse = serde_json::from_str(&response_text)
            .map_err(|e| {
                log::error!("Failed to parse API response: {}", e);
                AppError::ApiError(format!("Invalid JSON response: {}", e))
            })?;

        Ok(result)
    }
}
