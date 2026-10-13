use crate::models::{AppSettings, Asset, AssetLog, DashboardStats};
use chrono::{Datelike, Local, NaiveDate};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct StorageManager {
    data_dir: PathBuf,
}

impl StorageManager {
    pub fn new() -> Self {
        let base_dir = dirs::data_dir()
            .map(|p| p.join("AssetTracking"))
            .unwrap_or_else(|| PathBuf::from("./data"));

        if !base_dir.exists() {
            let _ = fs::create_dir_all(&base_dir);
        }

        let manager = Self { data_dir: base_dir };
        manager.init_defaults();
        manager
    }

    pub fn get_data_dir(&self) -> PathBuf {
        self.data_dir.clone()
    }

    fn assets_file(&self) -> PathBuf {
        self.data_dir.join("assets.json")
    }

    fn logs_file(&self) -> PathBuf {
        self.data_dir.join("logs.json")
    }

    fn settings_file(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    fn write_atomic<P: AsRef<Path>>(&self, path: P, content: &str) -> Result<(), String> {
        let path = path.as_ref();
        let tmp_path = path.with_extension("tmp");
        {
            let mut file = File::create(&tmp_path).map_err(|e| e.to_string())?;
            file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
            file.flush().map_err(|e| e.to_string())?;
        }
        fs::rename(tmp_path, path).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn init_defaults(&self) {
        // Init settings if missing
        let settings_path = self.settings_file();
        if !settings_path.exists() {
            let default_settings = AppSettings::default();
            if let Ok(json) = serde_json::to_string_pretty(&default_settings) {
                let _ = self.write_atomic(&settings_path, &json);
            }
        }

        // Init sample assets if missing or empty
        let assets_path = self.assets_file();
        if !assets_path.exists() {
            let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let sample_assets = vec![
                Asset {
                    id: "AST-2026-001".to_string(),
                    name: "MacBook Pro 16吋 (M4 Max / 64GB / 2TB)".to_string(),
                    category: "3C與電腦".to_string(),
                    brand: "Apple".to_string(),
                    model: "MacBook Pro 16".to_string(),
                    serial_number: "C02XYZ987KLA".to_string(),
                    purchase_date: "2025-11-15".to_string(),
                    purchase_price: 114900.0,
                    current_value: 95750.0,
                    depreciation_years: 3,
                    status: "在用中".to_string(),
                    location: "台北研發中心 4F-A區".to_string(),
                    department: "技術研發部".to_string(),
                    custodian: "hankyle".to_string(),
                    warranty_date: Some("2028-11-15".to_string()),
                    notes: "工程開發主要筆電，附原廠140W充電器與MagSafe線".to_string(),
                    tags: vec!["筆電".to_string(), "高階開發".to_string()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                },
                Asset {
                    id: "AST-2026-002".to_string(),
                    name: "Dell UltraSharp 32吋 4K 專業螢幕".to_string(),
                    category: "3C與電腦".to_string(),
                    brand: "Dell".to_string(),
                    model: "U3223QE".to_string(),
                    serial_number: "CN0482914801".to_string(),
                    purchase_date: "2025-06-20".to_string(),
                    purchase_price: 24900.0,
                    current_value: 19500.0,
                    depreciation_years: 4,
                    status: "在用中".to_string(),
                    location: "台北研發中心 4F-A區".to_string(),
                    department: "技術研發部".to_string(),
                    custodian: "hankyle".to_string(),
                    warranty_date: Some("2028-06-20".to_string()),
                    notes: "支援Type-C 90W供電與RJ-45網路輸出".to_string(),
                    tags: vec!["螢幕".to_string(), "外接顯示器".to_string()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                },
                Asset {
                    id: "AST-2026-003".to_string(),
                    name: "Herman Miller Aeron 人體工學旗艦辦公椅".to_string(),
                    category: "辦公家具".to_string(),
                    brand: "Herman Miller".to_string(),
                    model: "Aeron B Size".to_string(),
                    serial_number: "HM-AERON-202509".to_string(),
                    purchase_date: "2025-01-10".to_string(),
                    purchase_price: 52000.0,
                    current_value: 46800.0,
                    depreciation_years: 10,
                    status: "在用中".to_string(),
                    location: "台北研發中心 主管辦公室".to_string(),
                    department: "管理部".to_string(),
                    custodian: "hankyle".to_string(),
                    warranty_date: Some("2037-01-10".to_string()),
                    notes: "12年原廠結構保固".to_string(),
                    tags: vec!["辦公椅".to_string(), "人體工學".to_string()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                },
                Asset {
                    id: "AST-2026-004".to_string(),
                    name: "Synology DS923+ 4-Bay 網路儲存伺服器".to_string(),
                    category: "伺服器與網路".to_string(),
                    brand: "Synology".to_string(),
                    model: "DS923+".to_string(),
                    serial_number: "22B0SDN91823".to_string(),
                    purchase_date: "2024-08-05".to_string(),
                    purchase_price: 38800.0,
                    current_value: 23280.0,
                    depreciation_years: 3,
                    status: "在用中".to_string(),
                    location: "機房 機架A-02".to_string(),
                    department: "資訊維運部".to_string(),
                    custodian: "網管工程師".to_string(),
                    warranty_date: Some("2027-08-05".to_string()),
                    notes: "裝載4顆Seagate IronWolf 16TB，RAID 6配置".to_string(),
                    tags: vec!["NAS".to_string(), "本地備份".to_string()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                },
                Asset {
                    id: "AST-2026-005".to_string(),
                    name: "Sony A7 IV 全片幅無反單眼相機機身".to_string(),
                    category: "視聽攝影設備".to_string(),
                    brand: "Sony".to_string(),
                    model: "ILCE-7M4".to_string(),
                    serial_number: "S01-4920194".to_string(),
                    purchase_date: "2024-12-01".to_string(),
                    purchase_price: 64980.0,
                    current_value: 45000.0,
                    depreciation_years: 4,
                    status: "外借中".to_string(),
                    location: "外借 (行銷活動拍攝)".to_string(),
                    department: "行銷公關部".to_string(),
                    custodian: "林攝影師".to_string(),
                    warranty_date: Some("2026-12-01".to_string()),
                    notes: "借出時間: 2026-10-10，預計2026-10-20歸還".to_string(),
                    tags: vec!["相機".to_string(), "攝影器材".to_string()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                },
                Asset {
                    id: "AST-2026-006".to_string(),
                    name: "iPad Pro 13吋 (M4 / 256GB / Wi-Fi)".to_string(),
                    category: "3C與電腦".to_string(),
                    brand: "Apple".to_string(),
                    model: "iPad Pro 13 (2024)".to_string(),
                    serial_number: "DMPT9081KA".to_string(),
                    purchase_date: "2024-09-10".to_string(),
                    purchase_price: 45900.0,
                    current_value: 32000.0,
                    depreciation_years: 3,
                    status: "維修中".to_string(),
                    location: "原廠授權維修中心".to_string(),
                    department: "產品設計部".to_string(),
                    custodian: "王UI設計師".to_string(),
                    warranty_date: Some("2026-10-25".to_string()), // 即將到期保固
                    notes: "觸控螢幕異常送修中，維修單號: RE-2026-891".to_string(),
                    tags: vec!["平板".to_string(), "設計測試".to_string()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                },
            ];

            if let Ok(json) = serde_json::to_string_pretty(&sample_assets) {
                let _ = self.write_atomic(&assets_path, &json);
            }

            // Init sample logs
            let sample_logs = vec![
                AssetLog {
                    id: Uuid::new_v4().to_string(),
                    asset_id: "AST-2026-001".to_string(),
                    asset_name: "MacBook Pro 16吋 (M4 Max / 64GB / 2TB)".to_string(),
                    action: "建立".to_string(),
                    operator: "系統管理員".to_string(),
                    details: "初始資產建檔完成，指派保管人: hankyle".to_string(),
                    timestamp: now.clone(),
                },
                AssetLog {
                    id: Uuid::new_v4().to_string(),
                    asset_id: "AST-2026-005".to_string(),
                    asset_name: "Sony A7 IV 全片幅無反單眼相機機身".to_string(),
                    action: "借出".to_string(),
                    operator: "設備管理員".to_string(),
                    details: "借調至行銷部拍攝戶外活動宣傳片，保管人變更為: 林攝影師".to_string(),
                    timestamp: now.clone(),
                },
                AssetLog {
                    id: Uuid::new_v4().to_string(),
                    asset_id: "AST-2026-006".to_string(),
                    asset_name: "iPad Pro 13吋 (M4 / 256GB / Wi-Fi)".to_string(),
                    action: "送修".to_string(),
                    operator: "資訊維運部".to_string(),
                    details: "觸控面板反應延遲，送回原廠授權維修檢測".to_string(),
                    timestamp: now.clone(),
                },
            ];

            let logs_path = self.logs_file();
            if let Ok(json) = serde_json::to_string_pretty(&sample_logs) {
                let _ = self.write_atomic(&logs_path, &json);
            }
        }
    }

    pub fn calculate_depreciation(asset: &mut Asset) {
        if asset.depreciation_years == 0 || asset.purchase_price <= 0.0 {
            return;
        }

        if asset.status == "已報廢" {
            asset.current_value = 0.0;
            return;
        }

        if let Ok(p_date) = NaiveDate::parse_from_str(&asset.purchase_date, "%Y-%m-%d") {
            let today = Local::now().date_naive();
            if today > p_date {
                let elapsed_days = (today - p_date).num_days() as f64;
                let total_depr_days = (asset.depreciation_years as f64) * 365.25;
                let ratio = (elapsed_days / total_depr_days).clamp(0.0, 1.0);
                let current = asset.purchase_price * (1.0 - ratio);
                asset.current_value = (current * 100.0).round() / 100.0;
            } else {
                asset.current_value = asset.purchase_price;
            }
        }
    }

    pub fn load_assets(&self) -> Vec<Asset> {
        let path = self.assets_file();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(mut list) = serde_json::from_str::<Vec<Asset>>(&content) {
                for asset in &mut list {
                    Self::calculate_depreciation(asset);
                }
                return list;
            }
        }
        Vec::new()
    }

    pub fn save_assets(&self, assets: &[Asset]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(assets).map_err(|e| e.to_string())?;
        self.write_atomic(self.assets_file(), &json)
    }

    pub fn load_logs(&self) -> Vec<AssetLog> {
        let path = self.logs_file();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(list) = serde_json::from_str::<Vec<AssetLog>>(&content) {
                return list;
            }
        }
        Vec::new()
    }

    pub fn add_log(&self, log: AssetLog) -> Result<(), String> {
        let mut logs = self.load_logs();
        logs.insert(0, log); // Newest first
        if logs.len() > 1000 {
            logs.truncate(1000);
        }
        let json = serde_json::to_string_pretty(&logs).map_err(|e| e.to_string())?;
        self.write_atomic(self.logs_file(), &json)
    }

    pub fn load_settings(&self) -> AppSettings {
        let path = self.settings_file();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
        AppSettings::default()
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        self.write_atomic(self.settings_file(), &json)
    }

    pub fn get_dashboard_stats(&self) -> DashboardStats {
        let assets = self.load_assets();
        let logs = self.load_logs();

        let total_count = assets.len();
        let mut total_original_value = 0.0;
        let mut total_current_value = 0.0;
        let mut status_distribution = HashMap::new();
        let mut category_distribution = HashMap::new();
        let mut borrowed_count = 0;
        let mut repairing_count = 0;
        let mut expiring_warranty_count = 0;

        let today = Local::now().date_naive();
        let notice_limit = today + chrono::Duration::days(60);

        for asset in &assets {
            total_original_value += asset.purchase_price;
            total_current_value += asset.current_value;

            *status_distribution.entry(asset.status.clone()).or_insert(0) += 1;
            *category_distribution.entry(asset.category.clone()).or_insert(0) += 1;

            if asset.status == "外借中" {
                borrowed_count += 1;
            } else if asset.status == "維修中" {
                repairing_count += 1;
            }

            if let Some(ref w_str) = asset.warranty_date {
                if let Ok(w_date) = NaiveDate::parse_from_str(w_str, "%Y-%m-%d") {
                    if w_date >= today && w_date <= notice_limit {
                        expiring_warranty_count += 1;
                    }
                }
            }
        }

        let recent_logs = logs.into_iter().take(10).collect();

        DashboardStats {
            total_count,
            total_original_value: (total_original_value * 100.0).round() / 100.0,
            total_current_value: (total_current_value * 100.0).round() / 100.0,
            status_distribution,
            category_distribution,
            expiring_warranty_count,
            borrowed_count,
            repairing_count,
            recent_logs,
        }
    }
}

pub type AppState = Arc<Mutex<StorageManager>>;
