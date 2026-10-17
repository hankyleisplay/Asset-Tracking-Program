// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup_engine;
mod commands;
mod mobile_sync;
mod models;
mod storage;

use std::sync::{Arc, Mutex};
use storage::StorageManager;
use tauri::Manager;

fn main() {
    let storage_manager = StorageManager::new();
    let app_state = Arc::new(Mutex::new(storage_manager));

    // 啟動區域網路手機與電腦雙向同步伺服器
    mobile_sync::start_mobile_sync_server(app_state.clone());

    tauri::Builder::default()
        .manage(app_state)
        .setup(|app| {
            if let Some(icon) = app.default_window_icon().cloned() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_icon(icon);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_assets,
            commands::get_asset,
            commands::save_asset,
            commands::delete_asset,
            commands::update_asset_status,
            commands::get_audit_logs,
            commands::get_dashboard_stats,
            commands::get_settings,
            commands::save_settings,
            commands::create_local_backup,
            commands::list_local_backups,
            commands::restore_local_backup,
            commands::delete_local_backup,
            commands::export_full_backup_json,
            commands::export_assets_json,
            commands::export_assets_csv,
            commands::import_assets_json,
            commands::get_data_folder_path,
            commands::get_stocks,
            commands::get_stock_summary,
            commands::save_stock,
            commands::delete_stock,
            commands::batch_update_stock_prices,
            commands::export_stocks_csv,
            commands::fetch_stock_quote,
            commands::auto_update_all_live_quotes,
            commands::clear_all_system_data,
            commands::get_dividends,
            commands::save_dividend,
            commands::delete_dividend,
            commands::get_goals,
            commands::save_goal,
            commands::delete_goal,
            commands::get_mobile_sync_status,
            commands::apply_mobile_sync_cmd,
            commands::check_app_update,
            commands::download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
