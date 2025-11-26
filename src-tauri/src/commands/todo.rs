use tauri::State;
use crate::state::AppState;
use crate::models::todo::*;
use crate::error::AppError;

// 在专用的阻塞线程池中执行数据库操作，避免阻塞主异步运行时线程
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
pub async fn create_todo(
    state: State<'_, AppState>,
    text: String,
    priority: Option<Priority>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Todo, AppError> {
    let repo = state.todo_repo.clone();
    let request = CreateTodoRequest { text, priority, due_date, tags };

    run_db(move || repo.create(request)).await
}

#[tauri::command]
pub async fn get_todos(
    state: State<'_, AppState>,
    filter: Option<TodoFilter>,
) -> Result<Vec<Todo>, AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.get_all(filter)).await
}

#[tauri::command]
pub async fn get_todo(
    state: State<'_, AppState>,
    id: String,
) -> Result<Todo, AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.get_by_id(&id)).await
}

#[tauri::command]
pub async fn update_todo(
    state: State<'_, AppState>,
    id: String,
    updates: UpdateTodoRequest,
) -> Result<Todo, AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.update(&id, updates)).await
}

#[tauri::command]
pub async fn delete_todo(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.delete(&id)).await
}

#[tauri::command]
pub async fn batch_create_todos(
    state: State<'_, AppState>,
    todos: Vec<CreateTodoRequest>,
) -> Result<Vec<Todo>, AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.batch_create(todos)).await
}

#[tauri::command]
pub async fn delete_completed_todos(
    state: State<'_, AppState>,
) -> Result<u32, AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.delete_completed()).await
}

#[tauri::command]
pub async fn get_todo_statistics(
    state: State<'_, AppState>,
) -> Result<TodoStatistics, AppError> {
    let repo = state.todo_repo.clone();

    run_db(move || repo.get_statistics()).await
}
