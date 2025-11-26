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
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let repo = state.settings_repo.clone();
    let settings = run_db(move || repo.get()).await?;

    if settings.api_key.is_none() {
        return Err(AppError::MissingApiKey);
    }

    // 发送一个简单的测试请求
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/models", settings.api_base_url))
        .header("Authorization", format!("Bearer {}", settings.api_key.unwrap()))
        .send()
        .await?;

    Ok(response.status().is_success())
}
