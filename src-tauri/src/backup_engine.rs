use crate::models::{AssetLog, BackupInfo, BackupPayload};
use crate::storage::StorageManager;
use chrono::Local;
use std::fs;
use std::path::Path;

pub struct BackupEngine;

impl BackupEngine {
    /// 建立完整本機備份 (Snapshot JSON)
    pub fn create_backup(storage: &StorageManager, note: &str) -> Result<BackupInfo, String> {
        let backups_dir = storage.backups_dir();
        let now = Local::now();
        let file_ts = now.format("%Y%m%d_%H%M%S").to_string();
        let display_ts = now.format("%Y-%m-%d %H:%M:%S").to_string();
        let filename = format!("backup_{}.json", file_ts);
        let filepath = backups_dir.join(&filename);

        let assets = storage.load_assets();
        let stocks = storage.load_stocks();
        let logs = storage.load_logs();
        let mut settings = storage.load_settings();

        let asset_count = assets.len();
        let stock_count = stocks.len();
        let log_count = logs.len();

        let payload = BackupPayload {
            version: "1.0.0".to_string(),
            timestamp: display_ts.clone(),
            note: if note.is_empty() { "手動建立備份".to_string() } else { note.to_string() },
            assets,
            stocks,
            logs,
            settings: settings.clone(),
        };

        let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
        fs::write(&filepath, json.as_bytes()).map_err(|e| e.to_string())?;

        let size_kb = (json.len() as f64 / 1024.0 * 10.0).round() / 10.0;

        // 更新設定中的最後備份時間
        settings.last_backup_time = Some(display_ts.clone());
        let _ = storage.save_settings(&settings);

        // 自動清理超過保留份數的舊備份
        Self::prune_old_backups(storage, settings.backup_retention_count as usize);

        Ok(BackupInfo {
            filename,
            filepath: filepath.to_string_lossy().to_string(),
            created_at: display_ts,
            size_kb,
            asset_count,
            stock_count,
            log_count,
            note: payload.note,
        })
    }

    /// 列出所有本機歷史備份
    pub fn list_backups(storage: &StorageManager) -> Result<Vec<BackupInfo>, String> {
        let backups_dir = storage.backups_dir();
        let mut list = Vec::new();

        if let Ok(entries) = fs::read_dir(backups_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(payload) = serde_json::from_str::<BackupPayload>(&content) {
                            let size_kb = (content.len() as f64 / 1024.0 * 10.0).round() / 10.0;
                            list.push(BackupInfo {
                                filename,
                                filepath: path.to_string_lossy().to_string(),
                                created_at: payload.timestamp,
                                size_kb,
                                asset_count: payload.assets.len(),
                                stock_count: payload.stocks.len(),
                                log_count: payload.logs.len(),
                                note: payload.note,
                            });
                        }
                    }
                }
            }
        }

        // 依建立時間新至舊排序
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(list)
    }

    /// 還原指定備份檔或 JSON 字串
    pub fn restore_backup(
        storage: &StorageManager,
        source: &str,
        operator: &str,
    ) -> Result<String, String> {
        let content = if source.trim_start().starts_with('{') {
            source.to_string()
        } else {
            let path = storage.backups_dir().join(source);
            if !path.exists() {
                // Try as raw path
                if Path::new(source).exists() {
                    fs::read_to_string(source).map_err(|e| e.to_string())?
                } else {
                    return Err(format!("找不到指定的備份檔案: {}", source));
                }
            } else {
                fs::read_to_string(path).map_err(|e| e.to_string())?
            }
        };

        let payload: BackupPayload = serde_json::from_str(&content)
            .map_err(|e| format!("備份檔案格式解析失敗: {}", e))?;

        let asset_count = payload.assets.len();
        let stock_count = payload.stocks.len();

        storage.save_assets(&payload.assets)?;
        storage.save_stocks(&payload.stocks)?;

        let mut logs = payload.logs;
        logs.insert(
            0,
            AssetLog {
                id: format!("log-restore-{}", Local::now().timestamp_millis()),
                asset_id: "SYSTEM_RESTORE".to_string(),
                asset_name: "全系統本機備份還原".to_string(),
                action: "還原備份".to_string(),
                operator: if operator.is_empty() { "系統管理員".to_string() } else { operator.to_string() },
                details: format!(
                    "成功從備份快照 ({}) 還原，共恢復 {} 筆實體資產與 {} 檔證券持股。",
                    payload.timestamp, asset_count, stock_count
                ),
                timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            },
        );

        for log in logs {
            let _ = storage.add_log(log);
        }

        Ok(format!(
            "已成功還原！恢復實體資產 {} 筆、證券持股 {} 檔。",
            asset_count, stock_count
        ))
    }

    /// 刪除指定歷史備份
    pub fn delete_backup(storage: &StorageManager, filename: &str) -> Result<(), String> {
        let path = storage.backups_dir().join(filename);
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// 匯出全量備份 JSON
    pub fn export_full_backup_json(storage: &StorageManager) -> Result<String, String> {
        let assets = storage.load_assets();
        let stocks = storage.load_stocks();
        let logs = storage.load_logs();
        let settings = storage.load_settings();

        let payload = BackupPayload {
            version: "1.0.0".to_string(),
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            note: "本機全量備份匯出".to_string(),
            assets,
            stocks,
            logs,
            settings,
        };

        serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
    }

    /// 自動清理最舊備份
    fn prune_old_backups(storage: &StorageManager, max_keep: usize) {
        if max_keep == 0 {
            return;
        }
        if let Ok(mut backups) = Self::list_backups(storage) {
            if backups.len() > max_keep {
                backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                for old in backups.iter().skip(max_keep) {
                    let path = storage.backups_dir().join(&old.filename);
                    let _ = fs::remove_file(path);
                }
            }
        }
    }
}
