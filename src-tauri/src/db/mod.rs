pub mod todo_repo;
pub mod settings_repo;

pub use todo_repo::TodoRepository;
pub use settings_repo::SettingsRepository;

use crate::error::AppError;
use rusqlite::Connection;
use std::sync::{Condvar, Mutex};

pub struct Database {
    pool: Mutex<Vec<Connection>>,
    available: Condvar,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        const POOL_SIZE: usize = 4;

        log::info!("Opening SQLite database at {:?} with pool size {}", path, POOL_SIZE);

        let mut connections = Vec::with_capacity(POOL_SIZE);
        for _ in 0..POOL_SIZE {
            let conn = Connection::open(path)?;

            // 启用 WAL 模式以提高并发性能
            conn.execute_batch("PRAGMA journal_mode=WAL;")?;

            connections.push(conn);
        }

        Ok(Self {
            pool: Mutex::new(connections),
            available: Condvar::new(),
        })
    }

    /// 从连接池中借出一个连接，执行闭包逻辑后归还连接。
    /// 闭包使用统一的 `AppError` 错误类型，内部可以通过 `?` 自动从 `rusqlite::Error` 等转换。
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&Connection) -> Result<T, AppError>,
    {
        // 等待直到有可用连接
        let mut guard = self.pool.lock().unwrap();
        while guard.is_empty() {
            guard = self.available.wait(guard).unwrap();
        }

        // 取出一个连接
        let conn = guard.pop().expect("connection pool unexpectedly empty");
        drop(guard);

        // 使用连接执行用户逻辑
        let result = f(&conn);

        // 归还连接
        let mut guard = self.pool.lock().unwrap();
        guard.push(conn);
        self.available.notify_one();

        result
    }

    pub fn init_schema(&self) -> Result<(), AppError> {
        self.with_conn(|conn| {
            // 创建 todos 表
            conn.execute(
                "CREATE TABLE IF NOT EXISTS todos (
                    id TEXT PRIMARY KEY,
                    text TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    priority INTEGER NOT NULL DEFAULT 0,
                    due_date TEXT,
                    tags TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )",
                [],
            )?;

            // 创建索引
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed)",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at)",
                [],
            )?;

            // 创建 settings 表
            conn.execute(
                "CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )",
                [],
            )?;

            Ok(())
        })
    }
}
