use serde::{Deserialize, Serialize};

pub const DEFAULT_SYSTEM_PROMPT: &str = r#"你是一个智能任务助手。你可以帮助用户管理他们的待办事项。

你有以下能力：
- 添加新任务 (add_todos)
- 完成任务 (complete_todo)
- 删除任务 (delete_todo)
- 查询任务 (query_todos)
- 获取统计信息 (get_statistics)

请根据用户的自然语言请求，调用适当的函数来帮助他们管理任务。回复时使用简洁友好的中文。

当用户请求创建任务时，请仔细理解他们的意图，将大目标拆解为具体可执行的小任务。"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub api_key: Option<String>,
    pub api_base_url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub system_prompt: String,

    #[serde(default = "default_function_calling_mode")]
    pub function_calling_mode: String,  // "auto" | "tools" | "functions" | "disabled"

    #[serde(default = "default_true")]
    pub enable_text_fallback: bool,  // Parse function calls from text if structured fails
}

fn default_function_calling_mode() -> String {
    "auto".to_string()
}

fn default_true() -> bool {
    true
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
            function_calling_mode: default_function_calling_mode(),
            enable_text_fallback: default_true(),
        }
    }
}
