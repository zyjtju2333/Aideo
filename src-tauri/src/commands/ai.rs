use tauri::{AppHandle, State};
use crate::state::AppState;
use crate::models::ai::*;
use crate::error::AppError;

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    request: AiChatRequest,
) -> Result<AiChatResponse, AppError> {
    state.ai_service.chat(request).await
}

#[tauri::command]
pub async fn ai_chat_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    request: AiChatRequest,
) -> Result<(), AppError> {
    state.ai_service.chat_stream(&app, request).await
}

#[tauri::command]
pub fn get_ai_functions() -> Vec<FunctionInfo> {
    crate::services::function_call::get_function_infos()
}

#[derive(serde::Serialize)]
pub struct FunctionInfo {
    pub name: String,
    pub description: String,
}
