use serde_json::{json, Value};
use crate::db::TodoRepository;
use crate::models::todo::*;
use crate::models::ai::FunctionDefinition;
use crate::error::AppError;
use crate::commands::ai::FunctionInfo;
use std::sync::Arc;

pub fn get_function_definitions() -> Vec<FunctionDefinition> {
    vec![
        FunctionDefinition {
            name: "add_todos".to_string(),
            description: "批量添加一个或多个待办任务。当用户说'帮我创建'、'添加任务'、'生成计划'时使用此函数。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "要添加的任务列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {
                                    "type": "string",
                                    "description": "任务内容，应该具体、可执行"
                                },
                                "priority": {
                                    "type": "string",
                                    "enum": ["low", "medium", "high"],
                                    "description": "优先级"
                                }
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
            description: "将指定任务标记为已完成。当用户说'完成了'、'做完了'、'标记完成'时使用。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "任务ID（如果已知）"
                    },
                    "search": {
                        "type": "string",
                        "description": "通过关键词搜索任务（如果不知道ID）"
                    }
                }
            }),
        },
        FunctionDefinition {
            name: "delete_todo".to_string(),
            description: "删除指定任务。当用户说'删除'、'移除'、'不要了'时使用。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "任务ID（如果已知）"
                    },
                    "search": {
                        "type": "string",
                        "description": "通过关键词搜索任务（如果不知道ID）"
                    },
                    "delete_all_completed": {
                        "type": "boolean",
                        "description": "是否删除所有已完成的任务"
                    }
                }
            }),
        },
        FunctionDefinition {
            name: "query_todos".to_string(),
            description: "查询待办任务列表。当用户询问'有什么任务'、'任务列表'、'待办事项'时使用。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "cancelled"],
                        "description": "按状态过滤"
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "是否已完成"
                    },
                    "search": {
                        "type": "string",
                        "description": "关键词搜索"
                    }
                }
            }),
        },
        FunctionDefinition {
            name: "get_statistics".to_string(),
            description: "获取任务统计信息。当用户询问'统计'、'完成了多少'、'进度如何'时使用。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        },
    ]
}

pub fn get_function_infos() -> Vec<FunctionInfo> {
    get_function_definitions()
        .into_iter()
        .map(|f| FunctionInfo {
            name: f.name,
            description: f.description,
        })
        .collect()
}

pub struct FunctionExecutor {
    todo_repo: Arc<TodoRepository>,
}

impl FunctionExecutor {
    pub fn new(todo_repo: Arc<TodoRepository>) -> Self {
        Self { todo_repo }
    }

    pub fn execute(&self, name: &str, arguments: &str) -> Result<Value, AppError> {
        let args: Value = serde_json::from_str(arguments)
            .unwrap_or_else(|_| json!({}));

        match name {
            "add_todos" => self.add_todos(&args),
            "complete_todo" => self.complete_todo(&args),
            "delete_todo" => self.delete_todo(&args),
            "query_todos" => self.query_todos(&args),
            "get_statistics" => self.get_statistics(),
            _ => Err(AppError::UnknownFunction(name.to_string())),
        }
    }

    fn add_todos(&self, args: &Value) -> Result<Value, AppError> {
        let todos = args["todos"]
            .as_array()
            .ok_or_else(|| AppError::InvalidArgument("todos must be an array".into()))?;

        let mut created = Vec::new();
        for todo in todos {
            let text = todo["text"]
                .as_str()
                .ok_or_else(|| AppError::InvalidArgument("text is required".into()))?;

            let priority = todo.get("priority")
                .and_then(|p| p.as_str())
                .map(|p| match p {
                    "high" => Priority::High,
                    "medium" => Priority::Medium,
                    _ => Priority::Low,
                });

            let request = CreateTodoRequest {
                text: text.to_string(),
                priority,
                due_date: None,
                tags: None,
            };

            let result = self.todo_repo.create(request)?;
            created.push(result);
        }

        Ok(json!({
            "success": true,
            "created_count": created.len(),
            "message": format!("成功创建了 {} 个任务", created.len()),
            "todos": created
        }))
    }

    fn complete_todo(&self, args: &Value) -> Result<Value, AppError> {
        // 通过 ID 或搜索关键词找到任务
        let todo = if let Some(id) = args.get("id").and_then(|v| v.as_str()) {
            self.todo_repo.get_by_id(id)?
        } else if let Some(search) = args.get("search").and_then(|v| v.as_str()) {
            let results = self.todo_repo.search(search)?;
            results.into_iter().next()
                .ok_or_else(|| AppError::TodoNotFound(search.to_string()))?
        } else {
            return Err(AppError::InvalidArgument("id or search required".into()));
        };

        // 更新为已完成
        let updated = self.todo_repo.update(&todo.id, UpdateTodoRequest {
            completed: Some(true),
            status: Some(TodoStatus::Completed),
            ..Default::default()
        })?;

        Ok(json!({
            "success": true,
            "message": format!("已完成任务: {}", updated.text),
            "todo": updated
        }))
    }

    fn delete_todo(&self, args: &Value) -> Result<Value, AppError> {
        // 检查是否删除所有已完成
        if args.get("delete_all_completed").and_then(|v| v.as_bool()).unwrap_or(false) {
            let count = self.todo_repo.delete_completed()?;
            return Ok(json!({
                "success": true,
                "deleted_count": count,
                "message": format!("已删除 {} 个已完成的任务", count)
            }));
        }

        // 通过 ID 或搜索关键词找到任务
        let todo = if let Some(id) = args.get("id").and_then(|v| v.as_str()) {
            self.todo_repo.get_by_id(id)?
        } else if let Some(search) = args.get("search").and_then(|v| v.as_str()) {
            let results = self.todo_repo.search(search)?;
            results.into_iter().next()
                .ok_or_else(|| AppError::TodoNotFound(search.to_string()))?
        } else {
            return Err(AppError::InvalidArgument("id or search required".into()));
        };

        let text = todo.text.clone();
        self.todo_repo.delete(&todo.id)?;

        Ok(json!({
            "success": true,
            "message": format!("已删除任务: {}", text)
        }))
    }

    fn query_todos(&self, args: &Value) -> Result<Value, AppError> {
        let filter = TodoFilter {
            status: args.get("status")
                .and_then(|v| v.as_str())
                .map(TodoStatus::from_str),
            completed: args.get("completed")
                .and_then(|v| v.as_bool()),
            priority: None,
            search: args.get("search")
                .and_then(|v| v.as_str())
                .map(String::from),
            tag: None,
        };

        let todos = self.todo_repo.get_all(Some(filter))?;

        Ok(json!({
            "success": true,
            "count": todos.len(),
            "todos": todos
        }))
    }

    fn get_statistics(&self) -> Result<Value, AppError> {
        let stats = self.todo_repo.get_statistics()?;

        Ok(json!({
            "success": true,
            "statistics": {
                "total": stats.total,
                "completed": stats.completed,
                "pending": stats.pending,
                "in_progress": stats.in_progress,
                "cancelled": stats.cancelled
            },
            "message": format!(
                "共 {} 个任务，已完成 {}，待办 {}，进行中 {}",
                stats.total, stats.completed, stats.pending, stats.in_progress
            )
        }))
    }
}
