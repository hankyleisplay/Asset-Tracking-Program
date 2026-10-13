use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub category: String,
    pub brand: String,
    pub model: String,
    pub serial_number: String,
    pub purchase_date: String,
    pub purchase_price: f64,
    pub current_value: f64,
    pub depreciation_years: u32,
    pub status: String, // 在用中, 閒置中, 維修中, 外借中, 已報廢
    pub location: String,
    pub department: String,
    pub custodian: String,
    pub warranty_date: Option<String>,
    pub notes: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetLog {
    pub id: String,
    pub asset_id: String,
    pub asset_name: String,
    pub action: String, // 建立, 修改, 借出, 歸還, 送修, 完修, 報廢, 刪除
    pub operator: String,
    pub details: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub currency: String,
    pub github_repo: String,
    pub github_token: String,
    pub github_branch: String,
    pub auto_sync: bool,
    pub last_sync_time: Option<String>,
    pub last_sync_status: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            currency: "TWD".to_string(),
            github_repo: "hankyleisplay/Asset-Tracking-Program".to_string(),
            github_token: String::new(),
            github_branch: "main".to_string(),
            auto_sync: true,
            last_sync_time: None,
            last_sync_status: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_count: usize,
    pub total_original_value: f64,
    pub total_current_value: f64,
    pub status_distribution: HashMap<String, usize>,
    pub category_distribution: HashMap<String, usize>,
    pub expiring_warranty_count: usize,
    pub borrowed_count: usize,
    pub repairing_count: usize,
    pub recent_logs: Vec<AssetLog>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub timestamp: String,
    pub commit_sha: Option<String>,
}
