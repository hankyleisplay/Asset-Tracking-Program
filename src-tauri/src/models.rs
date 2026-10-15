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
    pub action: String, // 建立, 修改, 借出, 歸還, 送修, 完修, 報廢, 刪除, 買入股票, 賣出股票, 更新股價
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
    pub stock_color_mode: String, // "tw" (紅漲綠跌) 或 "us" (綠漲紅跌)
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
            stock_color_mode: "tw".to_string(), // 預設台灣習慣紅漲綠跌
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
    // 證券與總資產淨值整合
    pub stock_summary: StockSummary,
    pub total_net_worth_twd: f64, // 實體資產現值 + 股票投資市值
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub timestamp: String,
    pub commit_sha: Option<String>,
}
