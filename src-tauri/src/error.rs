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

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
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
            Self::Io(_) => "IO_ERROR",
        }
    }
}
