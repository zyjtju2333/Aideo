use std::sync::Arc;
use crate::db::{Database, TodoRepository, SettingsRepository};
use crate::services::{AiService, FunctionExecutor};
use crate::error::AppError;

pub struct AppState {
    pub todo_repo: Arc<TodoRepository>,
    pub settings_repo: Arc<SettingsRepository>,
    pub ai_service: Arc<AiService>,
}

impl AppState {
    pub fn new(db_path: &str) -> Result<Self, AppError> {
        // 初始化数据库
        let db = Arc::new(Database::new(db_path)?);

        // 初始化 Schema
        db.init_schema()?;

        // 初始化 Repositories
        let todo_repo = Arc::new(TodoRepository::new(db.clone()));
        let settings_repo = Arc::new(SettingsRepository::new(db.clone()));

        // 初始化 Function Executor
        let function_executor = Arc::new(FunctionExecutor::new(todo_repo.clone()));

        // 初始化 AI Service
        let ai_service = Arc::new(AiService::new(
            settings_repo.clone(),
            todo_repo.clone(),
            function_executor,
        ));

        Ok(Self {
            todo_repo,
            settings_repo,
            ai_service,
        })
    }
}
