use crate::db::Database;
use crate::error::AppError;
use crate::models::settings::Settings;
use chrono::Utc;
use std::sync::Arc;

pub struct SettingsRepository {
    db: Arc<Database>,
}

impl SettingsRepository {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn get(&self) -> Result<Settings, AppError> {
        self.db.with_conn(|conn| {
            let mut settings = Settings::default();

            // 尝试获取各个设置项
            if let Ok(value) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'api_key'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                if !value.is_empty() {
                    settings.api_key = Some(value);
                }
            }

            if let Ok(value) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'api_base_url'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                settings.api_base_url = value;
            }

            if let Ok(value) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'model'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                settings.model = value;
            }

            if let Ok(value) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'temperature'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                if let Ok(temp) = value.parse::<f32>() {
                    settings.temperature = temp;
                }
            }

            if let Ok(value) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'max_tokens'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                if let Ok(tokens) = value.parse::<u32>() {
                    settings.max_tokens = tokens;
                }
            }

            if let Ok(value) = conn.query_row(
                "SELECT value FROM settings WHERE key = 'system_prompt'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                settings.system_prompt = value;
            }

            Ok(settings)
        })
    }

    pub fn save(&self, settings: &Settings) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();

        self.db.with_conn(|conn| {
            // 保存各个设置项
            self.upsert_setting(conn, "api_key", settings.api_key.as_deref().unwrap_or(""), &now)?;
            self.upsert_setting(conn, "api_base_url", &settings.api_base_url, &now)?;
            self.upsert_setting(conn, "model", &settings.model, &now)?;
            self.upsert_setting(conn, "temperature", &settings.temperature.to_string(), &now)?;
            self.upsert_setting(conn, "max_tokens", &settings.max_tokens.to_string(), &now)?;
            self.upsert_setting(conn, "system_prompt", &settings.system_prompt, &now)?;

            Ok(())
        })
    }

    fn upsert_setting(
        &self,
        conn: &rusqlite::Connection,
        key: &str,
        value: &str,
        updated_at: &str,
    ) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            [key, value, updated_at],
        )?;
        Ok(())
    }
}
