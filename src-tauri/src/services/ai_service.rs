use tauri::{AppHandle, Emitter};
use reqwest::Client;
use futures::StreamExt;
use serde_json::json;
use std::sync::Arc;

use crate::models::ai::*;
use crate::models::settings::Settings;
use crate::db::{TodoRepository, SettingsRepository};
use crate::services::function_call::{FunctionExecutor, get_function_definitions};
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

        // Function Call 循环，最多 5 次
        for _ in 0..5 {
            let response = self.call_api(&settings, &messages, false).await?;
            let choice = response.choices.first()
                .ok_or_else(|| AppError::ApiError("No response choice".into()))?;

            // 检查是否有 function_call
            if let Some(ref fc) = choice.message.function_call {
                // 执行 function
                let result = self.function_executor.execute(&fc.name, &fc.arguments)?;

                function_results.push(FunctionResult {
                    function_name: fc.name.clone(),
                    success: true,
                    result: result.clone(),
                });

                // 将 assistant 的 function_call 消息添加到历史
                messages.push(choice.message.clone());

                // 将 function 结果添加到历史
                messages.push(ChatMessage {
                    role: "function".to_string(),
                    name: Some(fc.name.clone()),
                    content: Some(serde_json::to_string(&result)?),
                    function_call: None,
                });

                // 继续循环，让 AI 处理 function 结果
                continue;
            }

            // 没有 function_call，返回最终响应
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

        let req_body = ChatCompletionRequest {
            model: settings.model.clone(),
            messages,
            functions: Some(get_function_definitions()),
            function_call: Some("auto".to_string()),
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

        let req_body = ChatCompletionRequest {
            model: settings.model.clone(),
            messages: messages.to_vec(),
            functions: Some(get_function_definitions()),
            function_call: Some("auto".to_string()),
            temperature: Some(settings.temperature),
            max_tokens: Some(settings.max_tokens),
            stream: Some(stream),
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
            log::error!("AI API error (status {}): {}", status, error_text);
            return Err(AppError::ApiError(error_text));
        }

        let result = response.json().await?;
        Ok(result)
    }
}
