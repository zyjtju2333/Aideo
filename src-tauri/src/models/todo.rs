use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    #[default]
    Pending,
    InProgress,
    Completed,
    Cancelled,
}

impl TodoStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TodoStatus::Pending => "pending",
            TodoStatus::InProgress => "in_progress",
            TodoStatus::Completed => "completed",
            TodoStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => TodoStatus::Pending,
            "in_progress" => TodoStatus::InProgress,
            "completed" => TodoStatus::Completed,
            "cancelled" => TodoStatus::Cancelled,
            _ => TodoStatus::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    #[default]
    Low,
    Medium,
    High,
}

impl Priority {
    pub fn as_i32(&self) -> i32 {
        match self {
            Priority::Low => 0,
            Priority::Medium => 1,
            Priority::High => 2,
        }
    }

    pub fn from_i32(v: i32) -> Self {
        match v {
            0 => Priority::Low,
            1 => Priority::Medium,
            2 => Priority::High,
            _ => Priority::Low,
        }
    }
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
