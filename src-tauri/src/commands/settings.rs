use tauri::State;
use crate::state::AppState;
use crate::models::settings::Settings;
use crate::error::AppError;

// 复用 todo 命令中的阻塞线程池执行器
async fn run_db<F, T>(f: F) -> Result<T, AppError>
where
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::ApiError(format!("DB task join error: {}", e)))?
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<Settings, AppError> {
    let repo = state.settings_repo.clone();
    run_db(move || repo.get()).await
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), AppError> {
    let repo = state.settings_repo.clone();
    run_db(move || repo.save(&settings)).await
}

#[tauri::command]
pub async fn test_api_connection(
    settings: Settings,
) -> Result<bool, AppError> {
    // 验证 API key 已提供且非空
    if settings.api_key.is_none() || settings.api_key.as_ref().unwrap().trim().is_empty() {
        return Err(AppError::MissingApiKey);
    }

    // 验证 API base URL 非空
    if settings.api_base_url.trim().is_empty() {
        return Err(AppError::InvalidArgument("API base URL cannot be empty".to_string()));
    }

    // 发送一个简单的测试请求
    let client = reqwest::Client::new();
    let url = format!("{}/models", settings.api_base_url.trim_end_matches('/'));

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", settings.api_key.unwrap().trim()))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?;

    Ok(response.status().is_success())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCallTestResult {
    pub success: bool,
    pub message: String,
    pub api_format_detected: String,  // "tools" | "functions" | "text" | "none" | "error"
    pub function_called: bool,
    pub function_name: Option<String>,
    pub todos_created: u32,
    pub raw_response_sample: Option<String>,
    pub recommendations: Vec<String>,
}

#[tauri::command]
pub async fn test_function_calling(
    state: State<'_, AppState>,
) -> Result<FunctionCallTestResult, AppError> {
    use crate::models::ai::*;

    log::info!("Testing function calling capability");

    let settings_repo = state.settings_repo.clone();
    let settings = run_db(move || settings_repo.get()).await?;

    // Verify API key exists
    if settings.api_key.is_none() {
        return Ok(FunctionCallTestResult {
            success: false,
            message: "未配置 API Key".to_string(),
            api_format_detected: "error".to_string(),
            function_called: false,
            function_name: None,
            todos_created: 0,
            raw_response_sample: None,
            recommendations: vec!["请先在设置中配置 API Key".to_string()],
        });
    }

    // Send a test request that should trigger add_todos
    let test_request = AiChatRequest {
        message: "请帮我添加一个测试任务：测试函数调用功能".to_string(),
        history: None,
    };

    let todo_repo = state.todo_repo.clone();
    let before_count = run_db(move || {
        let todos = todo_repo.get_all(None)?;
        Ok::<usize, AppError>(todos.len())
    }).await?;

    match state.ai_service.chat(test_request).await {
        Ok(response) => {
            let todo_repo = state.todo_repo.clone();
            let after_count = run_db(move || {
                let todos = todo_repo.get_all(None)?;
                Ok::<usize, AppError>(todos.len())
            }).await?;

            let todos_created = (after_count - before_count) as u32;

            let api_format = if let Some(ref results) = response.function_results {
                if !results.is_empty() {
                    if response.warnings.as_ref().map(|w| w.iter().any(|s| s.contains("text"))).unwrap_or(false) {
                        "text"  // Fallback was used
                    } else {
                        "tools"  // Structured format (could be tools or functions)
                    }
                } else {
                    "none"
                }
            } else {
                "none"
            };

            let function_name = response.function_results.as_ref()
                .and_then(|r| r.first())
                .map(|f| f.function_name.clone());

            let success = todos_created > 0;

            let mut recommendations = Vec::new();

            if !success {
                recommendations.push("函数调用未执行。您的 API 可能不支持函数调用功能。".to_string());
                recommendations.push("建议：尝试使用 OpenAI 官方 API 或其他完全兼容的 API。".to_string());
            } else if api_format == "text" {
                recommendations.push("函数调用通过文本解析实现（降级模式）。".to_string());
                recommendations.push("建议：检查 API 是否支持新版 tools 格式或旧版 functions 格式。".to_string());
            } else {
                recommendations.push("函数调用工作正常！".to_string());
            }

            Ok(FunctionCallTestResult {
                success,
                message: if success {
                    format!("测试成功！成功创建了 {} 个任务", todos_created)
                } else {
                    "测试失败：函数未被调用".to_string()
                },
                api_format_detected: api_format.to_string(),
                function_called: function_name.is_some(),
                function_name,
                todos_created,
                raw_response_sample: Some(response.message.chars().take(200).collect()),
                recommendations,
            })
        }
        Err(e) => {
            Ok(FunctionCallTestResult {
                success: false,
                message: format!("测试失败：{}", e),
                api_format_detected: "error".to_string(),
                function_called: false,
                function_name: None,
                todos_created: 0,
                raw_response_sample: None,
                recommendations: vec![
                    "API 调用失败。请检查：".to_string(),
                    "1. API Key 是否正确".to_string(),
                    "2. API Base URL 是否正确".to_string(),
                    "3. 网络连接是否正常".to_string(),
                ],
            })
        }
    }
}
