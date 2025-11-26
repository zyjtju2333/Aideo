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
            // 获取用户数据目录
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");

            // 确保目录存在
            std::fs::create_dir_all(&app_data_dir)?;

            // 数据库路径
            let db_path = app_data_dir.join("aideo.db");

            // 初始化应用状态
            let state = AppState::new(db_path.to_str().unwrap())
                .expect("Failed to initialize app state");

            // 注册状态
            app.manage(state);

            log::info!("Aideo initialized, database at: {:?}", db_path);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Todo commands
            commands::todo::create_todo,
            commands::todo::get_todos,
            commands::todo::get_todo,
            commands::todo::update_todo,
            commands::todo::delete_todo,
            commands::todo::batch_create_todos,
            commands::todo::delete_completed_todos,
            commands::todo::get_todo_statistics,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::test_api_connection,
            // AI commands
            commands::ai::ai_chat,
            commands::ai::ai_chat_stream,
            commands::ai::get_ai_functions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
