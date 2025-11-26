# Aideo 后端实现计划

## 一、Cargo.toml 依赖配置

```toml
[package]
name = "aideo"
version = "0.1.0"
description = "AI-powered Todo Application"
authors = ["you"]
edition = "2021"

[lib]
name = "aideo_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Tauri 核心
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# 数据库
rusqlite = { version = "0.31", features = ["bundled"] }

# 异步运行时
tokio = { version = "1", features = ["full"] }

# HTTP 客户端
reqwest = { version = "0.12", features = ["json", "stream"] }

# 时间处理
chrono = { version = "0.4", features = ["serde"] }

# UUID 生成
uuid = { version = "1", features = ["v4", "serde"] }

# 异步流处理
futures = "0.3"
async-stream = "0.3"

# 错误处理
thiserror = "1"
anyhow = "1"

# 日志
log = "0.4"
env_logger = "0.11"
```

---

## 二、模块结构设计

```
src-tauri/src/
├── main.rs                 # 程序入口
├── lib.rs                  # Tauri 应用配置和启动
├── error.rs                # 错误类型定义
├── state.rs                # 应用状态管理
│
├── models/                 # 数据模型
│   ├── mod.rs
│   ├── todo.rs
│   ├── settings.rs
│   └── ai.rs
│
├── db/                     # 数据库模块
│   ├── mod.rs
│   ├── todo_repo.rs
│   └── settings_repo.rs
│
├── commands/               # Tauri Commands
│   ├── mod.rs
│   ├── todo.rs
│   ├── settings.rs
│   └── ai.rs
│
└── services/               # 业务服务层
    ├── mod.rs
    ├── ai_service.rs
    └── function_call.rs
```

---

## 三、数据库 Schema

### todos 表
```sql
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    tags TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
```

### settings 表
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

## 四、数据模型

### models/todo.rs
```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    #[default]
    Pending,
    InProgress,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    #[default]
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub status: TodoStatus,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoRequest {
    pub text: String,
    pub priority: Option<Priority>,
    pub due_date: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoRequest {
    pub text: Option<String>,
    pub completed: Option<bool>,
    pub status: Option<TodoStatus>,
    pub priority: Option<Priority>,
    pub due_date: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TodoFilter {
    pub status: Option<TodoStatus>,
    pub completed: Option<bool>,
    pub priority: Option<Priority>,
    pub search: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoStatistics {
    pub total: u32,
    pub completed: u32,
    pub pending: u32,
    pub in_progress: u32,
    pub cancelled: u32,
}
```

### models/settings.rs
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub api_key: Option<String>,
    pub api_base_url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub system_prompt: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_key: None,
            api_base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            temperature: 0.7,
            max_tokens: 2048,
            system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
        }
    }
}

pub const DEFAULT_SYSTEM_PROMPT: &str = r#"你是一个智能任务助手。你可以帮助用户管理他们的待办事项。
你有以下能力：
- 添加新任务 (add_todos)
- 完成任务 (complete_todo)
- 删除任务 (delete_todo)
- 查询任务 (query_todos)
- 获取统计信息 (get_statistics)

请根据用户的自然语言请求，调用适当的函数来帮助他们管理任务。回复时使用简洁友好的中文。"#;
```

### models/ai.rs
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub functions: Option<Vec<FunctionDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<FunctionCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Serialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

// 流式响应
#[derive(Debug, Deserialize)]
pub struct StreamChunk {
    pub choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
pub struct StreamChoice {
    pub delta: StreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StreamDelta {
    pub content: Option<String>,
    pub function_call: Option<PartialFunctionCall>,
}

#[derive(Debug, Deserialize)]
pub struct PartialFunctionCall {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

// 前端交互
#[derive(Debug, Deserialize)]
pub struct AiChatRequest {
    pub message: String,
    pub history: Option<Vec<ChatMessage>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResponse {
    pub message: String,
    pub function_results: Option<Vec<FunctionResult>>,
    pub updated_todos: Option<Vec<super::todo::Todo>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionResult {
    pub function_name: String,
    pub success: bool,
    pub result: serde_json::Value,
}
```

---

## 五、Tauri Commands

### commands/todo.rs
```rust
use tauri::State;
use crate::state::AppState;
use crate::models::todo::*;
use crate::error::AppError;

#[tauri::command]
pub async fn create_todo(
    state: State<'_, AppState>,
    text: String,
    priority: Option<Priority>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Todo, AppError> {
    let request = CreateTodoRequest { text, priority, due_date, tags };
    state.todo_repo.create(request).await
}

#[tauri::command]
pub async fn get_todos(
    state: State<'_, AppState>,
    filter: Option<TodoFilter>,
) -> Result<Vec<Todo>, AppError> {
    state.todo_repo.get_all(filter).await
}

#[tauri::command]
pub async fn update_todo(
    state: State<'_, AppState>,
    id: String,
    updates: UpdateTodoRequest,
) -> Result<Todo, AppError> {
    state.todo_repo.update(&id, updates).await
}

#[tauri::command]
pub async fn delete_todo(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.todo_repo.delete(&id).await
}

#[tauri::command]
pub async fn batch_create_todos(
    state: State<'_, AppState>,
    todos: Vec<CreateTodoRequest>,
) -> Result<Vec<Todo>, AppError> {
    state.todo_repo.batch_create(todos).await
}

#[tauri::command]
pub async fn get_todo_statistics(
    state: State<'_, AppState>,
) -> Result<TodoStatistics, AppError> {
    state.todo_repo.get_statistics().await
}
```

### commands/ai.rs
```rust
use tauri::{AppHandle, State, Emitter};
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
```

---

## 六、Function Call 实现

### services/function_call.rs
```rust
use serde_json::{json, Value};
use crate::models::ai::FunctionDefinition;
use crate::db::todo_repo::TodoRepository;
use crate::error::AppError;
use std::sync::Arc;

pub fn get_function_definitions() -> Vec<FunctionDefinition> {
    vec![
        FunctionDefinition {
            name: "add_todos".to_string(),
            description: "批量添加一个或多个待办任务".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "要添加的任务列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": { "type": "string", "description": "任务内容" },
                                "priority": { "type": "string", "enum": ["low", "medium", "high"] }
                            },
                            "required": ["text"]
                        }
                    }
                },
                "required": ["todos"]
            }),
        },
        FunctionDefinition {
            name: "complete_todo".to_string(),
            description: "将指定任务标记为已完成".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                    "search": { "type": "string", "description": "通过关键词搜索任务" }
                }
            }),
        },
        FunctionDefinition {
            name: "delete_todo".to_string(),
            description: "删除指定任务".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                    "search": { "type": "string", "description": "通过关键词搜索任务" }
                }
            }),
        },
        FunctionDefinition {
            name: "query_todos".to_string(),
            description: "查询待办任务".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] },
                    "completed": { "type": "boolean" },
                    "search": { "type": "string" }
                }
            }),
        },
        FunctionDefinition {
            name: "get_statistics".to_string(),
            description: "获取任务统计信息".to_string(),
            parameters: json!({ "type": "object", "properties": {} }),
        },
    ]
}

pub struct FunctionExecutor {
    todo_repo: Arc<TodoRepository>,
}

impl FunctionExecutor {
    pub fn new(todo_repo: Arc<TodoRepository>) -> Self {
        Self { todo_repo }
    }

    pub async fn execute(&self, name: &str, arguments: &str) -> Result<Value, AppError> {
        let args: Value = serde_json::from_str(arguments)?;

        match name {
            "add_todos" => self.add_todos(args).await,
            "complete_todo" => self.complete_todo(args).await,
            "delete_todo" => self.delete_todo(args).await,
            "query_todos" => self.query_todos(args).await,
            "get_statistics" => self.get_statistics().await,
            _ => Err(AppError::UnknownFunction(name.to_string())),
        }
    }

    async fn add_todos(&self, args: Value) -> Result<Value, AppError> {
        // 实现批量添加逻辑
        let todos = args["todos"].as_array()
            .ok_or(AppError::InvalidArgument("todos must be array".into()))?;

        let mut created = Vec::new();
        for todo in todos {
            let text = todo["text"].as_str().unwrap_or_default();
            let result = self.todo_repo.create(CreateTodoRequest {
                text: text.to_string(),
                priority: None,
                due_date: None,
                tags: None,
            }).await?;
            created.push(result);
        }

        Ok(json!({ "created_count": created.len(), "todos": created }))
    }

    // ... 其他方法实现
}
```

---

## 七、AI Service (含流式响应)

### services/ai_service.rs
```rust
use tauri::{AppHandle, Emitter};
use reqwest::Client;
use futures::StreamExt;
use crate::models::ai::*;
use crate::models::settings::Settings;
use crate::db::{TodoRepository, SettingsRepository};
use crate::services::function_call::{FunctionExecutor, get_function_definitions};
use crate::error::AppError;
use std::sync::Arc;

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

    pub async fn chat(&self, request: AiChatRequest) -> Result<AiChatResponse, AppError> {
        let settings = self.settings_repo.get().await?;
        let mut messages = self.build_messages(&settings, &request);
        let mut function_results = Vec::new();

        // Function Call 循环
        for _ in 0..5 {
            let response = self.call_api(&settings, &messages, false).await?;
            let choice = response.choices.first()
                .ok_or(AppError::ApiError("No response".into()))?;

            if let Some(ref fc) = choice.message.function_call {
                let result = self.function_executor.execute(&fc.name, &fc.arguments).await?;
                function_results.push(FunctionResult {
                    function_name: fc.name.clone(),
                    success: true,
                    result: result.clone(),
                });

                messages.push(choice.message.clone());
                messages.push(ChatMessage {
                    role: "function".to_string(),
                    name: Some(fc.name.clone()),
                    content: Some(serde_json::to_string(&result)?),
                    function_call: None,
                });
                continue;
            }

            let todos = self.todo_repo.get_all(None).await?;
            return Ok(AiChatResponse {
                message: choice.message.content.clone().unwrap_or_default(),
                function_results: if function_results.is_empty() { None } else { Some(function_results) },
                updated_todos: Some(todos),
            });
        }

        Err(AppError::TooManyFunctionCalls)
    }

    pub async fn chat_stream(&self, app: &AppHandle, request: AiChatRequest) -> Result<(), AppError> {
        let settings = self.settings_repo.get().await?;
        let messages = self.build_messages(&settings, &request);

        let api_key = settings.api_key.as_ref()
            .ok_or(AppError::MissingApiKey)?;

        let req = ChatCompletionRequest {
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
            .json(&req)
            .send()
            .await?;

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if line.starts_with("data: ") {
                    let data = &line[6..];
                    if data == "[DONE]" {
                        app.emit("ai-stream-done", ())?;
                        break;
                    }

                    if let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) {
                        if let Some(choice) = chunk.choices.first() {
                            if let Some(content) = &choice.delta.content {
                                buffer.push_str(content);
                                app.emit("ai-stream-chunk", json!({ "content": content }))?;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn build_messages(&self, settings: &Settings, request: &AiChatRequest) -> Vec<ChatMessage> {
        let mut messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: Some(settings.system_prompt.clone()),
                name: None,
                function_call: None,
            }
        ];

        if let Some(history) = &request.history {
            messages.extend(history.clone());
        }

        messages.push(ChatMessage {
            role: "user".to_string(),
            content: Some(request.message.clone()),
            name: None,
            function_call: None,
        });

        messages
    }

    async fn call_api(&self, settings: &Settings, messages: &[ChatMessage], stream: bool) -> Result<ChatCompletionResponse, AppError> {
        let api_key = settings.api_key.as_ref()
            .ok_or(AppError::MissingApiKey)?;

        let req = ChatCompletionRequest {
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
            .json(&req)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(response)
    }
}
```

---

## 八、错误处理

### error.rs
```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Missing API key")]
    MissingApiKey,

    #[error("Unknown function: {0}")]
    UnknownFunction(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Too many function calls")]
    TooManyFunctionCalls,

    #[error("Todo not found: {0}")]
    TodoNotFound(String),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", &self.error_code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl AppError {
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::Database(_) => "DATABASE_ERROR",
            Self::Serialization(_) => "SERIALIZATION_ERROR",
            Self::Http(_) => "HTTP_ERROR",
            Self::ApiError(_) => "API_ERROR",
            Self::MissingApiKey => "MISSING_API_KEY",
            Self::UnknownFunction(_) => "UNKNOWN_FUNCTION",
            Self::InvalidArgument(_) => "INVALID_ARGUMENT",
            Self::TooManyFunctionCalls => "TOO_MANY_FUNCTION_CALLS",
            Self::TodoNotFound(_) => "TODO_NOT_FOUND",
            Self::Tauri(_) => "TAURI_ERROR",
        }
    }
}
```

---

## 九、应用入口 (lib.rs)

```rust
mod commands;
mod db;
mod error;
mod models;
mod services;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("aideo.db");
            let state = AppState::new(db_path.to_str().unwrap())?;

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::todo::create_todo,
            commands::todo::get_todos,
            commands::todo::update_todo,
            commands::todo::delete_todo,
            commands::todo::batch_create_todos,
            commands::todo::get_todo_statistics,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::ai::ai_chat,
            commands::ai::ai_chat_stream,
            commands::ai::get_ai_functions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 十、实现优先级

### P0 - 核心基础
1. Cargo.toml 依赖
2. error.rs 错误处理
3. models/ 数据模型
4. db/ 数据库层
5. commands/todo.rs

### P1 - 设置和基础 AI
1. commands/settings.rs
2. services/function_call.rs (Function 定义)
3. services/ai_service.rs (基础聊天)

### P2 - 完整 AI 功能
1. Function Call 执行器
2. 流式响应
3. commands/ai.rs

### P3 - 优化
1. 日志记录
2. 连接池
3. 错误处理完善
