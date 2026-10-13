use crate::github_sync::GitHubSyncEngine;
use crate::models::{AppSettings, Asset, AssetLog, DashboardStats, SyncResult};
use crate::storage::{AppState, StorageManager};
use chrono::Local;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_assets(state: State<AppState>) -> Result<Vec<Asset>, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.load_assets())
}

#[tauri::command]
pub fn get_asset(state: State<AppState>, id: String) -> Result<Option<Asset>, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    let assets = storage.load_assets();
    Ok(assets.into_iter().find(|a| a.id == id))
}

#[tauri::command]
pub async fn save_asset(
    state: State<'_, AppState>,
    mut asset: Asset,
    operator: String,
) -> Result<Asset, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let (is_new, _old_name, old_status) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let assets = storage.load_assets();
        let existing = assets.iter().find(|a| a.id == asset.id);
        match existing {
            Some(ex) => (false, ex.name.clone(), ex.status.clone()),
            None => (true, String::new(), String::new()),
        }
    };

    if is_new && asset.id.trim().is_empty() {
        let date_prefix = Local::now().format("%Y%m%d").to_string();
        let short_uuid = &Uuid::new_v4().to_string()[..4];
        asset.id = format!("AST-{}-{}", date_prefix, short_uuid).to_uppercase();
    }

    asset.updated_at = now.clone();
    if is_new {
        asset.created_at = now.clone();
    }

    // Calculate current depreciated value
    StorageManager::calculate_depreciation(&mut asset);

    let (saved_asset, _log_action, _log_details) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let mut assets = storage.load_assets();

        let (action, details) = if is_new {
            assets.push(asset.clone());
            ("建立".to_string(), format!("新資產建檔: {} ({})", asset.name, asset.id))
        } else {
            if let Some(pos) = assets.iter().position(|a| a.id == asset.id) {
                let status_change = if old_status != asset.status {
                    format!(" [狀態變更: {} -> {}]", old_status, asset.status)
                } else {
                    String::new()
                };
                assets[pos] = asset.clone();
                (
                    "修改".to_string(),
                    format!("更新資產資料: {}{}", asset.name, status_change),
                )
            } else {
                assets.push(asset.clone());
                ("建立".to_string(), format!("新資產建檔: {} ({})", asset.name, asset.id))
            }
        };

        storage.save_assets(&assets)?;

        let op = if operator.trim().is_empty() {
            "系統使用者".to_string()
        } else {
            operator
        };

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: asset.id.clone(),
            asset_name: asset.name.clone(),
            action: action.clone(),
            operator: op,
            details: details.clone(),
            timestamp: now.clone(),
        };

        let _ = storage.add_log(log);

        (asset, action, details)
    };

    // Auto-sync to GitHub if configured
    let (auto_sync, settings, all_assets, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (s.auto_sync, s, storage.load_assets(), storage.load_logs())
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_logs).await;
        if let Ok(storage) = state.lock() {
            let mut s = storage.load_settings();
            s.last_sync_time = Some(res.timestamp);
            s.last_sync_status = Some(res.message);
            let _ = storage.save_settings(&s);
        }
    }

    Ok(saved_asset)
}

#[tauri::command]
pub async fn delete_asset(
    state: State<'_, AppState>,
    id: String,
    operator: String,
) -> Result<(), String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let op = if operator.trim().is_empty() {
        "系統使用者".to_string()
    } else {
        operator
    };

    let (auto_sync, settings, all_assets, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let mut assets = storage.load_assets();
        let deleted_name = if let Some(pos) = assets.iter().position(|a| a.id == id) {
            let name = assets[pos].name.clone();
            assets.remove(pos);
            storage.save_assets(&assets)?;
            name
        } else {
            return Err(format!("找不到資產 ID: {}", id));
        };

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: id.clone(),
            asset_name: deleted_name.clone(),
            action: "刪除".to_string(),
            operator: op,
            details: format!("已自系統刪除資產: {} ({})", deleted_name, id),
            timestamp: now,
        };
        let _ = storage.add_log(log);

        let s = storage.load_settings();
        (s.auto_sync, s, storage.load_assets(), storage.load_logs())
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_logs).await;
        if let Ok(storage) = state.lock() {
            let mut s = storage.load_settings();
            s.last_sync_time = Some(res.timestamp);
            s.last_sync_status = Some(res.message);
            let _ = storage.save_settings(&s);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn update_asset_status(
    state: State<'_, AppState>,
    id: String,
    new_status: String,
    action_type: String,
    notes: String,
    operator: String,
) -> Result<Asset, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let op = if operator.trim().is_empty() {
        "設備管理員".to_string()
    } else {
        operator
    };

    let updated_asset = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let mut assets = storage.load_assets();
        let pos = assets
            .iter()
            .position(|a| a.id == id)
            .ok_or_else(|| format!("找不到資產 ID: {}", id))?;

        let old_status = assets[pos].status.clone();
        assets[pos].status = new_status.clone();
        assets[pos].updated_at = now.clone();

        if new_status == "已報廢" {
            assets[pos].current_value = 0.0;
        }

        let asset = assets[pos].clone();
        storage.save_assets(&assets)?;

        let details = if notes.trim().is_empty() {
            format!("狀態變更: {} -> {}", old_status, new_status)
        } else {
            format!("狀態變更: {} -> {} | 說明: {}", old_status, new_status, notes)
        };

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: id,
            asset_name: asset.name.clone(),
            action: action_type,
            operator: op,
            details,
            timestamp: now,
        };
        let _ = storage.add_log(log);

        asset
    };

    // Auto-sync
    let (auto_sync, settings, all_assets, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (s.auto_sync, s, storage.load_assets(), storage.load_logs())
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_logs).await;
        if let Ok(storage) = state.lock() {
            let mut s = storage.load_settings();
            s.last_sync_time = Some(res.timestamp);
            s.last_sync_status = Some(res.message);
            let _ = storage.save_settings(&s);
        }
    }

    Ok(updated_asset)
}

#[tauri::command]
pub fn get_audit_logs(state: State<AppState>) -> Result<Vec<AssetLog>, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.load_logs())
}

#[tauri::command]
pub fn get_dashboard_stats(state: State<AppState>) -> Result<DashboardStats, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.get_dashboard_stats())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.load_settings())
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    storage.save_settings(&settings)
}

#[tauri::command]
pub async fn sync_to_github_now(state: State<'_, AppState>) -> Result<SyncResult, String> {
    let (settings, assets, logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        (
            storage.load_settings(),
            storage.load_assets(),
            storage.load_logs(),
        )
    };

    let result = GitHubSyncEngine::sync_to_github(&settings, &assets, &logs).await;

    if let Ok(storage) = state.lock() {
        let mut s = storage.load_settings();
        s.last_sync_time = Some(result.timestamp.clone());
        s.last_sync_status = Some(result.message.clone());
        let _ = storage.save_settings(&s);
    }

    Ok(result)
}

#[tauri::command]
pub fn export_assets_json(state: State<AppState>) -> Result<String, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    let assets = storage.load_assets();
    serde_json::to_string_pretty(&assets).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_assets_csv(state: State<AppState>) -> Result<String, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    let assets = storage.load_assets();
    let mut csv = String::from(
        "\u{FEFF}資產編號,資產名稱,分類,品牌,型號,序號,購買日期,購買價格,當前預估殘值,折舊年限,狀態,存放地點,保管部門,保管人,保固截止日,備註\n",
    );
    for a in assets {
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",{},{},{},\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            a.id.replace('"', "\"\""),
            a.name.replace('"', "\"\""),
            a.category.replace('"', "\"\""),
            a.brand.replace('"', "\"\""),
            a.model.replace('"', "\"\""),
            a.serial_number.replace('"', "\"\""),
            a.purchase_date,
            a.purchase_price,
            a.current_value,
            a.depreciation_years,
            a.status.replace('"', "\"\""),
            a.location.replace('"', "\"\""),
            a.department.replace('"', "\"\""),
            a.custodian.replace('"', "\"\""),
            a.warranty_date.unwrap_or_default(),
            a.notes.replace('"', "\"\"")
        ));
    }
    Ok(csv)
}

#[tauri::command]
pub fn import_assets_json(
    state: State<AppState>,
    json_str: String,
    operator: String,
) -> Result<usize, String> {
    let imported_list: Vec<Asset> =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON 格式解析錯誤: {}", e))?;

    let count = imported_list.len();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let op = if operator.trim().is_empty() {
        "批次匯入員".to_string()
    } else {
        operator
    };

    let storage = state.lock().map_err(|e| e.to_string())?;
    let mut current_assets = storage.load_assets();

    for mut new_item in imported_list {
        StorageManager::calculate_depreciation(&mut new_item);
        if let Some(pos) = current_assets.iter().position(|a| a.id == new_item.id) {
            current_assets[pos] = new_item;
        } else {
            current_assets.push(new_item);
        }
    }

    storage.save_assets(&current_assets)?;

    let log = AssetLog {
        id: Uuid::new_v4().to_string(),
        asset_id: "BATCH-IMPORT".to_string(),
        asset_name: format!("批次匯入 {} 筆資產", count),
        action: "匯入".to_string(),
        operator: op,
        details: format!("成功從 JSON 匯入/更新 {} 筆資產資料", count),
        timestamp: now,
    };
    let _ = storage.add_log(log);

    Ok(count)
}

#[tauri::command]
pub fn get_data_folder_path(state: State<AppState>) -> Result<String, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.get_data_dir().to_string_lossy().to_string())
}
