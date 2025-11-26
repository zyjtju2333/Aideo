use crate::db::Database;
use crate::error::AppError;
use crate::models::todo::*;
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

pub struct TodoRepository {
    db: Arc<Database>,
}

impl TodoRepository {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn create(&self, request: CreateTodoRequest) -> Result<Todo, AppError> {
        let conn = self.db.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();
        let priority = request.priority.unwrap_or_default();
        let tags = request.tags.unwrap_or_default();
        let tags_json = serde_json::to_string(&tags)?;

        conn.execute(
            "INSERT INTO todos (id, text, completed, status, priority, due_date, tags, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (
                &id,
                &request.text,
                0,
                TodoStatus::Pending.as_str(),
                priority.as_i32(),
                &request.due_date,
                &tags_json,
                &now,
                &now,
            ),
        )?;

        Ok(Todo {
            id,
            text: request.text,
            completed: false,
            status: TodoStatus::Pending,
            priority,
            due_date: request.due_date,
            tags,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn batch_create(&self, requests: Vec<CreateTodoRequest>) -> Result<Vec<Todo>, AppError> {
        let mut todos = Vec::new();
        for request in requests {
            let todo = self.create(request)?;
            todos.push(todo);
        }
        Ok(todos)
    }

    pub fn get_all(&self, filter: Option<TodoFilter>) -> Result<Vec<Todo>, AppError> {
        let conn = self.db.conn.lock().unwrap();

        let mut sql = "SELECT id, text, completed, status, priority, due_date, tags, created_at, updated_at FROM todos WHERE 1=1".to_string();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref f) = filter {
            if let Some(ref status) = f.status {
                sql.push_str(" AND status = ?");
                params.push(Box::new(status.as_str().to_string()));
            }
            if let Some(completed) = f.completed {
                sql.push_str(" AND completed = ?");
                params.push(Box::new(if completed { 1 } else { 0 }));
            }
            if let Some(ref priority) = f.priority {
                sql.push_str(" AND priority = ?");
                params.push(Box::new(priority.as_i32()));
            }
            if let Some(ref search) = f.search {
                sql.push_str(" AND text LIKE ?");
                params.push(Box::new(format!("%{}%", search)));
            }
            if let Some(ref tag) = f.tag {
                sql.push_str(" AND tags LIKE ?");
                params.push(Box::new(format!("%\"{}%", tag)));
            }
        }

        sql.push_str(" ORDER BY completed ASC, created_at DESC");

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;

        let todos = stmt.query_map(params_refs.as_slice(), |row| {
            let tags_json: String = row.get(6)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(Todo {
                id: row.get(0)?,
                text: row.get(1)?,
                completed: row.get::<_, i32>(2)? != 0,
                status: TodoStatus::from_str(&row.get::<_, String>(3)?),
                priority: Priority::from_i32(row.get(4)?),
                due_date: row.get(5)?,
                tags,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for todo in todos {
            result.push(todo?);
        }
        Ok(result)
    }

    pub fn get_by_id(&self, id: &str) -> Result<Todo, AppError> {
        let conn = self.db.conn.lock().unwrap();

        let todo = conn.query_row(
            "SELECT id, text, completed, status, priority, due_date, tags, created_at, updated_at FROM todos WHERE id = ?1",
            [id],
            |row| {
                let tags_json: String = row.get(6)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

                Ok(Todo {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    completed: row.get::<_, i32>(2)? != 0,
                    status: TodoStatus::from_str(&row.get::<_, String>(3)?),
                    priority: Priority::from_i32(row.get(4)?),
                    due_date: row.get(5)?,
                    tags,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        ).map_err(|_| AppError::TodoNotFound(id.to_string()))?;

        Ok(todo)
    }

    pub fn update(&self, id: &str, request: UpdateTodoRequest) -> Result<Todo, AppError> {
        let conn = self.db.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        // 先获取现有数据
        let existing = self.get_by_id_internal(&conn, id)?;

        let text = request.text.unwrap_or(existing.text);
        let completed = request.completed.unwrap_or(existing.completed);
        let status = request.status.unwrap_or(existing.status);
        let priority = request.priority.unwrap_or(existing.priority);
        let due_date = request.due_date.or(existing.due_date);
        let tags = request.tags.unwrap_or(existing.tags);
        let tags_json = serde_json::to_string(&tags)?;

        conn.execute(
            "UPDATE todos SET text = ?1, completed = ?2, status = ?3, priority = ?4, due_date = ?5, tags = ?6, updated_at = ?7 WHERE id = ?8",
            (
                &text,
                if completed { 1 } else { 0 },
                status.as_str(),
                priority.as_i32(),
                &due_date,
                &tags_json,
                &now,
                id,
            ),
        )?;

        Ok(Todo {
            id: id.to_string(),
            text,
            completed,
            status,
            priority,
            due_date,
            tags,
            created_at: existing.created_at,
            updated_at: now,
        })
    }

    fn get_by_id_internal(&self, conn: &rusqlite::Connection, id: &str) -> Result<Todo, AppError> {
        let todo = conn.query_row(
            "SELECT id, text, completed, status, priority, due_date, tags, created_at, updated_at FROM todos WHERE id = ?1",
            [id],
            |row| {
                let tags_json: String = row.get(6)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

                Ok(Todo {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    completed: row.get::<_, i32>(2)? != 0,
                    status: TodoStatus::from_str(&row.get::<_, String>(3)?),
                    priority: Priority::from_i32(row.get(4)?),
                    due_date: row.get(5)?,
                    tags,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        ).map_err(|_| AppError::TodoNotFound(id.to_string()))?;

        Ok(todo)
    }

    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        let conn = self.db.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM todos WHERE id = ?1", [id])?;

        if rows == 0 {
            return Err(AppError::TodoNotFound(id.to_string()));
        }

        Ok(())
    }

    pub fn delete_completed(&self) -> Result<u32, AppError> {
        let conn = self.db.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM todos WHERE completed = 1", [])?;
        Ok(rows as u32)
    }

    pub fn search(&self, keyword: &str) -> Result<Vec<Todo>, AppError> {
        self.get_all(Some(TodoFilter {
            search: Some(keyword.to_string()),
            ..Default::default()
        }))
    }

    pub fn get_statistics(&self) -> Result<TodoStatistics, AppError> {
        let conn = self.db.conn.lock().unwrap();

        let total: u32 = conn.query_row("SELECT COUNT(*) FROM todos", [], |row| row.get(0))?;
        let completed: u32 = conn.query_row("SELECT COUNT(*) FROM todos WHERE completed = 1", [], |row| row.get(0))?;
        let pending: u32 = conn.query_row("SELECT COUNT(*) FROM todos WHERE status = 'pending'", [], |row| row.get(0))?;
        let in_progress: u32 = conn.query_row("SELECT COUNT(*) FROM todos WHERE status = 'in_progress'", [], |row| row.get(0))?;
        let cancelled: u32 = conn.query_row("SELECT COUNT(*) FROM todos WHERE status = 'cancelled'", [], |row| row.get(0))?;

        Ok(TodoStatistics {
            total,
            completed,
            pending,
            in_progress,
            cancelled,
        })
    }
}
