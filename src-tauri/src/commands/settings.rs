use tauri::State;
use crate::state::AppState;
use crate::models::settings::Settings;
use crate::error::AppError;

#[tauri::command]
pub fn get_settings(
    state: State<'_, AppState>,
) -> Result<Settings, AppError> {
    state.settings_repo.get()
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), AppError> {
    state.settings_repo.save(&settings)
}

#[tauri::command]
pub async fn test_api_connection(
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let settings = state.settings_repo.get()?;

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
