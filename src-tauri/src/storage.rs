use crate::models::{
    AppSettings, Asset, AssetLog, DashboardStats, DividendRecord, FinancialGoal, StockAsset,
    StockSummary,
};
use chrono::{Local, NaiveDate};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub struct StorageManager {
    data_dir: PathBuf,
    sync_revision: AtomicU64,
}

impl StorageManager {
    pub fn new() -> Self {
        let base_dir = dirs::data_dir()
            .map(|p| p.join("AssetTracking"))
            .unwrap_or_else(|| PathBuf::from("./data"));

        if !base_dir.exists() {
            let _ = fs::create_dir_all(&base_dir);
        }

        let manager = Self {
            data_dir: base_dir,
            sync_revision: AtomicU64::new(1),
        };
        manager.init_defaults();
        manager
    }

    pub fn bump_revision(&self) -> u64 {
        self.sync_revision.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn get_revision(&self) -> u64 {
        self.sync_revision.load(Ordering::SeqCst)
    }

    pub fn get_data_dir(&self) -> PathBuf {
        self.data_dir.clone()
    }

    pub fn backups_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("backups");
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        dir
    }

    fn assets_file(&self) -> PathBuf {
        self.data_dir.join("assets.json")
    }

    fn stocks_file(&self) -> PathBuf {
        self.data_dir.join("stocks.json")
    }

    fn dividends_file(&self) -> PathBuf {
        self.data_dir.join("dividends.json")
    }

    fn goals_file(&self) -> PathBuf {
        self.data_dir.join("goals.json")
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
        self.bump_revision();
        Ok(())
    }

    fn init_defaults(&self) {
        let settings_path = self.settings_file();
        if !settings_path.exists() {
            let default_settings = AppSettings::default();
            if let Ok(json) = serde_json::to_string_pretty(&default_settings) {
                let _ = self.write_atomic(&settings_path, &json);
            }
        }

        let stocks_path = self.stocks_file();
        if !stocks_path.exists() {
            let empty_stocks: Vec<StockAsset> = Vec::new();
            if let Ok(json) = serde_json::to_string_pretty(&empty_stocks) {
                let _ = self.write_atomic(&stocks_path, &json);
            }
        }

        let assets_path = self.assets_file();
        if !assets_path.exists() {
            let empty_assets: Vec<Asset> = Vec::new();
            if let Ok(json) = serde_json::to_string_pretty(&empty_assets) {
                let _ = self.write_atomic(&assets_path, &json);
            }
        }

        let dividends_path = self.dividends_file();
        if !dividends_path.exists() {
            let empty_dividends: Vec<DividendRecord> = Vec::new();
            if let Ok(json) = serde_json::to_string_pretty(&empty_dividends) {
                let _ = self.write_atomic(&dividends_path, &json);
            }
        }

        let goals_path = self.goals_file();
        if !goals_path.exists() {
            let empty_goals: Vec<FinancialGoal> = Vec::new();
            if let Ok(json) = serde_json::to_string_pretty(&empty_goals) {
                let _ = self.write_atomic(&goals_path, &json);
            }
        }

        let logs_path = self.logs_file();
        if !logs_path.exists() {
            let empty_logs: Vec<AssetLog> = Vec::new();
            if let Ok(json) = serde_json::to_string_pretty(&empty_logs) {
                let _ = self.write_atomic(&logs_path, &json);
            }
        }
    }

    pub fn clear_all_data(&self) -> Result<(), String> {
        self.save_assets(&[])?;
        self.save_stocks(&[])?;
        self.save_dividends(&[])?;
        self.save_goals(&[])?;
        self.write_atomic(self.logs_file(), "[]")?;
        Ok(())
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

    pub fn calculate_stock_metrics(stock: &mut StockAsset) {
        let rate = if stock.currency == "USD" {
            if stock.exchange_rate > 0.0 {
                stock.exchange_rate
            } else {
                32.0
            }
        } else {
            1.0
        };

        stock.total_cost_twd = (stock.shares * stock.buy_price * rate * 100.0).round() / 100.0;
        stock.market_value_twd =
            (stock.shares * stock.current_price * rate * 100.0).round() / 100.0;
        stock.unrealized_pnl_twd =
            ((stock.market_value_twd - stock.total_cost_twd) * 100.0).round() / 100.0;

        if stock.total_cost_twd > 0.0 {
            stock.return_rate =
                ((stock.unrealized_pnl_twd / stock.total_cost_twd) * 10000.0).round() / 100.0;
        } else {
            stock.return_rate = 0.0;
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

    pub fn load_stocks(&self) -> Vec<StockAsset> {
        let path = self.stocks_file();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(mut list) = serde_json::from_str::<Vec<StockAsset>>(&content) {
                for stock in &mut list {
                    Self::calculate_stock_metrics(stock);
                }
                return list;
            }
        }
        Vec::new()
    }

    pub fn save_stocks(&self, stocks: &[StockAsset]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(stocks).map_err(|e| e.to_string())?;
        self.write_atomic(self.stocks_file(), &json)
    }

    pub fn load_dividends(&self) -> Vec<DividendRecord> {
        let path = self.dividends_file();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(mut list) = serde_json::from_str::<Vec<DividendRecord>>(&content) {
                list.sort_by(|a, b| b.ex_date.cmp(&a.ex_date));
                return list;
            }
        }
        Vec::new()
    }

    pub fn save_dividends(&self, dividends: &[DividendRecord]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(dividends).map_err(|e| e.to_string())?;
        self.write_atomic(self.dividends_file(), &json)
    }

    pub fn load_goals(&self) -> Vec<FinancialGoal> {
        let path = self.goals_file();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(list) = serde_json::from_str::<Vec<FinancialGoal>>(&content) {
                return list;
            }
        }
        Vec::new()
    }

    pub fn save_goals(&self, goals: &[FinancialGoal]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(goals).map_err(|e| e.to_string())?;
        self.write_atomic(self.goals_file(), &json)
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
        logs.insert(0, log);
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

    pub fn get_stock_summary(&self) -> StockSummary {
        let stocks = self.load_stocks();
        let total_stock_count = stocks.len();
        let mut total_cost_twd = 0.0;
        let mut total_market_value_twd = 0.0;
        let mut market_distribution = HashMap::new();

        for s in &stocks {
            total_cost_twd += s.total_cost_twd;
            total_market_value_twd += s.market_value_twd;
            *market_distribution.entry(s.market.clone()).or_insert(0.0) += s.market_value_twd;
        }

        let total_unrealized_pnl_twd =
            ((total_market_value_twd - total_cost_twd) * 100.0).round() / 100.0;
        let total_return_rate = if total_cost_twd > 0.0 {
            ((total_unrealized_pnl_twd / total_cost_twd) * 10000.0).round() / 100.0
        } else {
            0.0
        };

        StockSummary {
            total_stock_count,
            total_cost_twd: (total_cost_twd * 100.0).round() / 100.0,
            total_market_value_twd: (total_market_value_twd * 100.0).round() / 100.0,
            total_unrealized_pnl_twd,
            total_return_rate,
            market_distribution,
        }
    }

    pub fn get_dashboard_stats(&self) -> DashboardStats {
        let assets = self.load_assets();
        let logs = self.load_logs();
        let dividends = self.load_dividends();
        let goals = self.load_goals();
        let stock_summary = self.get_stock_summary();

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
            *category_distribution
                .entry(asset.category.clone())
                .or_insert(0) += 1;

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

        let total_dividends_twd: f64 = dividends.iter().map(|d| d.amount_twd).sum();
        let total_net_worth_twd =
            ((total_current_value + stock_summary.total_market_value_twd) * 100.0).round() / 100.0;
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
            stock_summary,
            total_net_worth_twd,
            total_dividends_twd: (total_dividends_twd * 100.0).round() / 100.0,
            dividend_count: dividends.len(),
            goals_count: goals.len(),
        }
    }
}

pub type AppState = std::sync::Arc<std::sync::Mutex<StorageManager>>;
