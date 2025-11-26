use tauri::State;
use crate::state::AppState;
use crate::models::todo::*;
use crate::error::AppError;

#[tauri::command]
pub fn create_todo(
    state: State<'_, AppState>,
    text: String,
    priority: Option<Priority>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Todo, AppError> {
    let request = CreateTodoRequest {
        text,
        priority,
        due_date,
        tags,
    };
    state.todo_repo.create(request)
}

#[tauri::command]
pub fn get_todos(
    state: State<'_, AppState>,
    filter: Option<TodoFilter>,
) -> Result<Vec<Todo>, AppError> {
    state.todo_repo.get_all(filter)
}

#[tauri::command]
pub fn get_todo(
    state: State<'_, AppState>,
    id: String,
) -> Result<Todo, AppError> {
    state.todo_repo.get_by_id(&id)
}

#[tauri::command]
pub fn update_todo(
    state: State<'_, AppState>,
    id: String,
    updates: UpdateTodoRequest,
) -> Result<Todo, AppError> {
    state.todo_repo.update(&id, updates)
}

#[tauri::command]
pub fn delete_todo(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.todo_repo.delete(&id)
}

#[tauri::command]
pub fn batch_create_todos(
    state: State<'_, AppState>,
    todos: Vec<CreateTodoRequest>,
) -> Result<Vec<Todo>, AppError> {
    state.todo_repo.batch_create(todos)
}

#[tauri::command]
pub fn delete_completed_todos(
    state: State<'_, AppState>,
) -> Result<u32, AppError> {
    state.todo_repo.delete_completed()
}

#[tauri::command]
pub fn get_todo_statistics(
    state: State<'_, AppState>,
) -> Result<TodoStatistics, AppError> {
    state.todo_repo.get_statistics()
}
