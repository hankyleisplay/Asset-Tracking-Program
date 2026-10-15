// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod github_sync;
mod models;
mod storage;

use std::sync::{Arc, Mutex};
use storage::StorageManager;

fn main() {
    let storage_manager = StorageManager::new();
    let app_state = Arc::new(Mutex::new(storage_manager));

    tauri::Builder::default()
        .manage(app_state)
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
            commands::sync_to_github_now,
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
            commands::clear_all_system_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
