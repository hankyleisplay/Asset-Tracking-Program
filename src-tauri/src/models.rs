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
pub struct StockAsset {
    pub id: String,
    pub symbol: String, // 股票代號: 2330, NVDA, 0050, AAPL
    pub name: String,   // 股票名稱: 台積電, NVIDIA, 元大台灣50
    pub market: String, // 市場分類: 台股, 美股, ETF, 基金
    pub shares: f64,    // 持有股數
    pub buy_price: f64, // 平均買進成本單價
    pub current_price: f64, // 當前市價
    pub currency: String,   // 幣別: TWD, USD
    pub exchange_rate: f64, // 換算匯率 (若是USD則轉為本幣TWD，預設 32.0)
    pub total_cost_twd: f64, // 換算後總成本
    pub market_value_twd: f64, // 換算後總市值
    pub unrealized_pnl_twd: f64, // 未實現損益 (市值 - 成本)
    pub return_rate: f64,   // 報酬率 %
    pub dividend_yield: Option<f64>, // 年化殖利率 %
    pub notes: String,      // 投資筆記與停損停利目標
    pub updated_at: String, // 最後報價/更新時間
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DividendRecord {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub ex_date: String,         // 除息或發放日 YYYY-MM-DD
    pub dividend_type: String,   // 現金股利, 股票股利, 配息再投入
    pub amount_twd: f64,         // 折合台幣實領總額
    pub currency: String,        // TWD, USD
    pub original_amount: f64,    // 原幣領息金額
    pub notes: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialGoal {
    pub id: String,
    pub title: String,
    pub category: String, // 總淨值目標, 證券市值目標, 年領股息目標, 自訂儲蓄目標
    pub target_amount: f64,
    pub current_manual_amount: f64,
    pub deadline: Option<String>,
    pub icon: String,
    pub notes: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockQuote {
    pub symbol: String,
    pub name: String,
    pub market: String, // 台股, 美股, ETF
    pub current_price: f64,
    pub currency: String, // TWD, USD
    pub exchange_rate: f64,
    pub change: f64,
    pub change_percent: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockSummary {
    pub total_stock_count: usize,
    pub total_cost_twd: f64,
    pub total_market_value_twd: f64,
    pub total_unrealized_pnl_twd: f64,
    pub total_return_rate: f64,
    pub market_distribution: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetLog {
    pub id: String,
    pub asset_id: String,
    pub asset_name: String,
    pub action: String, // 建立, 修改, 借出, 歸還, 送修, 完修, 報廢, 刪除, 買入股票, 賣出股票, 更新股價, 領取股息, 手機同步
    pub operator: String,
    pub details: String,
    pub timestamp: String,
}

fn default_currency() -> String { "TWD".to_string() }
fn default_true() -> bool { true }
fn default_retention() -> u32 { 20 }
fn default_stock_color() -> String { "tw".to_string() }
fn default_theme_preset() -> String { "ocean".to_string() }
fn default_primary_color() -> String { "#6366f1".to_string() }
fn default_accent_color() -> String { "#06b6d4".to_string() }
fn default_blur_level() -> String { "high".to_string() }
fn default_sync_port() -> u16 { 18888 }
fn default_sync_pin() -> String { "8888".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default = "default_true")]
    pub auto_backup: bool,
    #[serde(default)]
    pub last_backup_time: Option<String>,
    #[serde(default = "default_retention")]
    pub backup_retention_count: u32,
    #[serde(default = "default_stock_color")]
    pub stock_color_mode: String, // "tw" (紅漲綠跌) 或 "us" (綠漲紅跌)
    // 主題與配色設定
    #[serde(default = "default_theme_preset")]
    pub theme_preset: String, // ocean, emerald, amethyst, amber, crimson, glacier, custom
    #[serde(default = "default_primary_color")]
    pub custom_primary_color: String,
    #[serde(default = "default_accent_color")]
    pub custom_accent_color: String,
    #[serde(default = "default_blur_level")]
    pub glass_blur_level: String, // low, medium, high, ultra
    // 自動更新設定
    #[serde(default = "default_true")]
    pub auto_check_update: bool,
    // 手機電腦雙向同步設定
    #[serde(default = "default_true")]
    pub mobile_sync_enabled: bool,
    #[serde(default = "default_sync_port")]
    pub mobile_sync_port: u16,
    #[serde(default = "default_sync_pin")]
    pub mobile_sync_pin: String,
    #[serde(default)]
    pub last_mobile_sync_time: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            currency: "TWD".to_string(),
            auto_backup: true,
            last_backup_time: None,
            backup_retention_count: 20,
            stock_color_mode: "tw".to_string(),
            theme_preset: "ocean".to_string(),
            custom_primary_color: "#6366f1".to_string(),
            custom_accent_color: "#06b6d4".to_string(),
            glass_blur_level: "high".to_string(),
            auto_check_update: true,
            mobile_sync_enabled: true,
            mobile_sync_port: 18888,
            mobile_sync_pin: "8888".to_string(),
            last_mobile_sync_time: None,
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
    pub stock_summary: StockSummary,
    pub total_net_worth_twd: f64,
    pub total_dividends_twd: f64,
    pub dividend_count: usize,
    pub goals_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub filename: String,
    pub filepath: String,
    pub created_at: String,
    pub size_kb: f64,
    pub asset_count: usize,
    pub stock_count: usize,
    pub log_count: usize,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPayload {
    pub version: String,
    pub timestamp: String,
    pub note: String,
    pub assets: Vec<Asset>,
    pub stocks: Vec<StockAsset>,
    #[serde(default)]
    pub dividends: Vec<DividendRecord>,
    #[serde(default)]
    pub goals: Vec<FinancialGoal>,
    pub logs: Vec<AssetLog>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub html_url: String,
    pub download_url_setup: Option<String>,
    pub download_url_portable: Option<String>,
    pub download_url_apk: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileSyncStatus {
    pub running: bool,
    pub local_ips: Vec<String>,
    pub primary_ip: String,
    pub port: u16,
    pub pin: String,
    pub web_url: String,
    pub apk_download_url: String,
    pub last_sync_time: Option<String>,
    pub sync_revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPayload {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub device_name: String,
    #[serde(default)]
    pub pin: Option<String>,
    #[serde(default)]
    pub sync_mode: Option<String>, // "merge" | "overwrite"
    #[serde(default)]
    pub assets: Vec<Asset>,
    #[serde(default)]
    pub stocks: Vec<StockAsset>,
    #[serde(default)]
    pub dividends: Vec<DividendRecord>,
    #[serde(default)]
    pub goals: Vec<FinancialGoal>,
    #[serde(default)]
    pub deleted_ids: Vec<String>,
    #[serde(default)]
    pub settings: Option<AppSettings>,
}
