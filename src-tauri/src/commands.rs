use crate::github_sync::GitHubSyncEngine;
use crate::models::{AppSettings, Asset, AssetLog, DashboardStats, StockAsset, StockQuote, StockSummary, SyncResult};
use crate::storage::{AppState, StorageManager};
use chrono::Local;
use std::collections::HashMap;
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
    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
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

    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
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
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
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
    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
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
    let (settings, assets, stocks, logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        (
            storage.load_settings(),
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    let result = GitHubSyncEngine::sync_to_github(&settings, &assets, &stocks, &logs).await;

    if let Ok(storage) = state.lock() {
        let mut s = storage.load_settings();
        s.last_sync_time = Some(result.timestamp.clone());
        s.last_sync_status = Some(result.message.clone());
        let _ = storage.save_settings(&s);
    }

    Ok(result)
}

#[tauri::command]
pub fn get_stocks(state: State<AppState>) -> Result<Vec<StockAsset>, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.load_stocks())
}

#[tauri::command]
pub fn get_stock_summary(state: State<AppState>) -> Result<StockSummary, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.get_stock_summary())
}

#[tauri::command]
pub async fn save_stock(
    state: State<'_, AppState>,
    mut stock: StockAsset,
    operator: String,
) -> Result<StockAsset, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let is_new = stock.id.trim().is_empty();
    if is_new {
        stock.id = format!("STK-{}", stock.symbol.trim().to_uppercase());
    }
    stock.updated_at = now.clone();

    StorageManager::calculate_stock_metrics(&mut stock);

    let (saved_stock, _action, _details) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let mut stocks = storage.load_stocks();

        let (act, det) = if is_new {
            stocks.push(stock.clone());
            (
                "買入股票".to_string(),
                format!(
                    "新增持股: {} ({}), 股數: {}, 成本單價: {} {}",
                    stock.name, stock.symbol, stock.shares, stock.buy_price, stock.currency
                ),
            )
        } else {
            if let Some(pos) = stocks.iter().position(|s| s.id == stock.id) {
                stocks[pos] = stock.clone();
                (
                    "更新股票".to_string(),
                    format!(
                        "修改持股: {} ({}), 現價: {} {}, 市值: NT$ {:.2}",
                        stock.name, stock.symbol, stock.current_price, stock.currency, stock.market_value_twd
                    ),
                )
            } else {
                stocks.push(stock.clone());
                (
                    "買入股票".to_string(),
                    format!("新增持股: {} ({})", stock.name, stock.symbol),
                )
            }
        };

        storage.save_stocks(&stocks)?;

        let op = if operator.trim().is_empty() {
            "投資人".to_string()
        } else {
            operator
        };

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: stock.id.clone(),
            asset_name: format!("{} ({})", stock.name, stock.symbol),
            action: act.clone(),
            operator: op,
            details: det.clone(),
            timestamp: now.clone(),
        };
        let _ = storage.add_log(log);

        (stock, act, det)
    };

    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
        if let Ok(storage) = state.lock() {
            let mut s = storage.load_settings();
            s.last_sync_time = Some(res.timestamp);
            s.last_sync_status = Some(res.message);
            let _ = storage.save_settings(&s);
        }
    }

    Ok(saved_stock)
}

#[tauri::command]
pub async fn delete_stock(
    state: State<'_, AppState>,
    id: String,
    operator: String,
) -> Result<(), String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let op = if operator.trim().is_empty() {
        "投資人".to_string()
    } else {
        operator
    };

    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let mut stocks = storage.load_stocks();
        let deleted_name = if let Some(pos) = stocks.iter().position(|s| s.id == id) {
            let name = format!("{} ({})", stocks[pos].name, stocks[pos].symbol);
            stocks.remove(pos);
            storage.save_stocks(&stocks)?;
            name
        } else {
            return Err(format!("找不到股票 ID: {}", id));
        };

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: id.clone(),
            asset_name: deleted_name.clone(),
            action: "賣出股票".to_string(),
            operator: op,
            details: format!("已自投資清單結清/刪除標的: {}", deleted_name),
            timestamp: now,
        };
        let _ = storage.add_log(log);

        let s = storage.load_settings();
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
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
pub async fn batch_update_stock_prices(
    state: State<'_, AppState>,
    updates: HashMap<String, f64>,
    operator: String,
) -> Result<Vec<StockAsset>, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let op = if operator.trim().is_empty() {
        "行情更新員".to_string()
    } else {
        operator
    };

    let updated_stocks = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let mut stocks = storage.load_stocks();
        let mut count = 0;

        for s in &mut stocks {
            if let Some(&new_price) = updates.get(&s.id).or_else(|| updates.get(&s.symbol)) {
                if new_price > 0.0 {
                    s.current_price = new_price;
                    s.updated_at = now.clone();
                    StorageManager::calculate_stock_metrics(s);
                    count += 1;
                }
            }
        }

        storage.save_stocks(&stocks)?;

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: "STOCK-PRICE-UPDATE".to_string(),
            asset_name: "更新股票市價".to_string(),
            action: "更新股價".to_string(),
            operator: op,
            details: format!("批次更新 {} 檔證券當前市場行情", count),
            timestamp: now,
        };
        let _ = storage.add_log(log);

        stocks
    };

    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
        if let Ok(storage) = state.lock() {
            let mut s = storage.load_settings();
            s.last_sync_time = Some(res.timestamp);
            s.last_sync_status = Some(res.message);
            let _ = storage.save_settings(&s);
        }
    }

    Ok(updated_stocks)
}

#[tauri::command]
pub fn export_stocks_csv(state: State<AppState>) -> Result<String, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    let stocks = storage.load_stocks();
    let mut csv = String::from(
        "\u{FEFF}股票代號,股票名稱,市場分類,持有股數,買入成本單價,當前市場單價,幣別,匯率,總成本(TWD),總市值(TWD),未實現損益(TWD),投資報酬率(%),最後更新時間,筆記\n",
    );
    for s in stocks {
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",{},{},{},\"{}\",{},{},{},{},{},\"{}\",\"{}\"\n",
            s.symbol.replace('"', "\"\""),
            s.name.replace('"', "\"\""),
            s.market.replace('"', "\"\""),
            s.shares,
            s.buy_price,
            s.current_price,
            s.currency,
            s.exchange_rate,
            s.total_cost_twd,
            s.market_value_twd,
            s.unrealized_pnl_twd,
            s.return_rate,
            s.updated_at,
            s.notes.replace('"', "\"\"")
        ));
    }
    Ok(csv)
}

#[tauri::command]
pub fn export_assets_json(state: State<AppState>) -> Result<String, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    let assets = storage.load_assets();
    let stocks = storage.load_stocks();
    let payload = serde_json::json!({
        "assets": assets,
        "stocks": stocks,
        "exported_at": Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    });
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
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
    let parsed: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON 格式解析錯誤: {}", e))?;

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let op = if operator.trim().is_empty() {
        "批次匯入員".to_string()
    } else {
        operator
    };

    let storage = state.lock().map_err(|e| e.to_string())?;
    let mut total_imported = 0;

    // Check if it's an object with "assets" or a raw array of assets
    let assets_to_import: Vec<Asset> = if let Some(arr) = parsed.get("assets") {
        serde_json::from_value(arr.clone()).unwrap_or_default()
    } else if parsed.is_array() {
        serde_json::from_value(parsed.clone()).unwrap_or_default()
    } else {
        Vec::new()
    };

    if !assets_to_import.is_empty() {
        let mut current_assets = storage.load_assets();
        let count = assets_to_import.len();
        for mut new_item in assets_to_import {
            StorageManager::calculate_depreciation(&mut new_item);
            if let Some(pos) = current_assets.iter().position(|a| a.id == new_item.id) {
                current_assets[pos] = new_item;
            } else {
                current_assets.push(new_item);
            }
        }
        storage.save_assets(&current_assets)?;
        total_imported += count;
    }

    // Check if it contains "stocks"
    if let Some(stocks_val) = parsed.get("stocks") {
        if let Ok(stocks_to_import) = serde_json::from_value::<Vec<StockAsset>>(stocks_val.clone()) {
            let mut current_stocks = storage.load_stocks();
            let count = stocks_to_import.len();
            for mut new_stock in stocks_to_import {
                StorageManager::calculate_stock_metrics(&mut new_stock);
                if let Some(pos) = current_stocks.iter().position(|s| s.id == new_stock.id) {
                    current_stocks[pos] = new_stock;
                } else {
                    current_stocks.push(new_stock);
                }
            }
            storage.save_stocks(&current_stocks)?;
            total_imported += count;
        }
    }

    let log = AssetLog {
        id: Uuid::new_v4().to_string(),
        asset_id: "BATCH-IMPORT".to_string(),
        asset_name: format!("批次匯入 {} 筆項目", total_imported),
        action: "匯入".to_string(),
        operator: op,
        details: format!("成功從 JSON 匯入/更新 {} 筆資產及股票資料", total_imported),
        timestamp: now,
    };
    let _ = storage.add_log(log);

    Ok(total_imported)
}

#[tauri::command]
pub fn get_data_folder_path(state: State<AppState>) -> Result<String, String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    Ok(storage.get_data_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn clear_all_system_data(state: State<'_, AppState>) -> Result<(), String> {
    let storage = state.lock().map_err(|e| e.to_string())?;
    storage.clear_all_data()
}

fn lookup_tw_stock_name(code: &str) -> Option<&'static str> {
    match code {
        "2330" => Some("台積電 (TSMC)"),
        "2317" => Some("鴻海 (Hon Hai)"),
        "2454" => Some("聯發科 (MediaTek)"),
        "2308" => Some("台達電"),
        "2382" => Some("廣達 (Quanta)"),
        "2412" => Some("中華電 (Chunghwa Telecom)"),
        "2881" => Some("富邦金"),
        "2882" => Some("國泰金"),
        "2886" => Some("兆豐金"),
        "2891" => Some("中信金"),
        "2603" => Some("長榮海運"),
        "2609" => Some("陽明海運"),
        "2615" => Some("萬海航運"),
        "2303" => Some("聯電 (UMC)"),
        "3231" => Some("緯創 (Wistron)"),
        "2357" => Some("華碩 (ASUS)"),
        "3008" => Some("大立光 (Largan)"),
        "3711" => Some("日月光投控 (ASE)"),
        "2002" => Some("中鋼"),
        "6505" => Some("台塑化"),
        "0050" => Some("元大台灣50 ETF"),
        "0056" => Some("元大高股息 ETF"),
        "00878" => Some("國泰永續高股息 ETF"),
        "00919" => Some("群益台灣精選高息 ETF"),
        "00929" => Some("復華台灣科技優息 ETF"),
        "00940" => Some("元大台灣價值高息 ETF"),
        "006208" => Some("富邦台灣采吉50 ETF"),
        "00713" => Some("元大台灣高息低波 ETF"),
        "00679B" => Some("元大美債20年 ETF"),
        "00687B" => Some("國泰20年美債 ETF"),
        _ => None,
    }
}

async fn query_yahoo_finance(
    client: &reqwest::Client,
    ticker: &str,
) -> Result<(String, f64, f64, f64, String), String> {
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1d",
        ticker
    );

    let resp = client
        .get(&url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("網絡請求失敗 ({}): {}", ticker, e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "查詢股票代號 [{}] 失敗，HTTP 代碼: {}",
            ticker,
            resp.status()
        ));
    }

    let json_val: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析市場數據失敗: {}", e))?;

    let result = json_val
        .get("chart")
        .and_then(|c| c.get("result"))
        .and_then(|r| r.get(0))
        .ok_or_else(|| format!("未找到 [{}] 的市場報價資訊", ticker))?;

    let meta = result
        .get("meta")
        .ok_or_else(|| format!("報價缺少元資料 [{}]", ticker))?;

    let price = meta
        .get("regularMarketPrice")
        .and_then(|p| p.as_f64())
        .unwrap_or(0.0);

    if price <= 0.0 {
        return Err(format!("標的 [{}] 目前無有效市價行情", ticker));
    }

    let currency = meta
        .get("currency")
        .and_then(|c| c.as_str())
        .unwrap_or("TWD")
        .to_string();

    let name = meta
        .get("longName")
        .or_else(|| meta.get("shortName"))
        .and_then(|n| n.as_str())
        .unwrap_or(ticker)
        .to_string();

    let change = meta
        .get("fulldayChange")
        .or_else(|| meta.get("regularMarketChange"))
        .and_then(|c| c.as_f64())
        .unwrap_or(0.0);

    let change_percent = meta
        .get("regularMarketChangePercent")
        .or_else(|| meta.get("fulldayChangePercent"))
        .and_then(|c| c.as_f64())
        .unwrap_or(0.0);

    Ok((name, price, change, change_percent, currency))
}

async fn fetch_single_quote(
    client: &reqwest::Client,
    symbol_input: &str,
) -> Result<StockQuote, String> {
    let raw = symbol_input.trim().to_uppercase();
    if raw.is_empty() {
        return Err("股票代號不能為空".to_string());
    }

    let is_numeric = raw.chars().all(|c| c.is_ascii_digit());
    let (market, is_tw, primary_ticker, fallback_ticker) = if is_numeric
        || raw.ends_with(".TW")
        || raw.ends_with(".TWO")
    {
        let base = raw.trim_end_matches(".TW").trim_end_matches(".TWO");
        let m = if base.starts_with("00") {
            "ETF".to_string()
        } else {
            "台股".to_string()
        };
        (m, true, format!("{}.TW", base), Some(format!("{}.TWO", base)))
    } else {
        ("美股".to_string(), false, raw.clone(), None)
    };

    let mut quote_res = query_yahoo_finance(client, &primary_ticker).await;
    if quote_res.is_err() && fallback_ticker.is_some() {
        if let Some(ref fb) = fallback_ticker {
            if let Ok(res) = query_yahoo_finance(client, fb).await {
                quote_res = Ok(res);
            }
        }
    }

    let (mut quote_name, current_price, change, change_percent, currency) = quote_res?;

    let (currency_out, exchange_rate) = if is_tw {
        ("TWD".to_string(), 1.0)
    } else {
        let rate = match query_yahoo_finance(client, "USDTWD=X").await {
            Ok((_, r, _, _, _)) if r > 0.0 => (r * 100.0).round() / 100.0,
            _ => 32.2,
        };
        (currency, rate)
    };

    if is_tw {
        let base_sym = raw.trim_end_matches(".TW").trim_end_matches(".TWO");
        if let Some(tw_name) = lookup_tw_stock_name(base_sym) {
            quote_name = tw_name.to_string();
        }
    }

    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    Ok(StockQuote {
        symbol: raw,
        name: quote_name,
        market,
        current_price,
        currency: currency_out,
        exchange_rate,
        change,
        change_percent,
        updated_at: now_str,
    })
}

#[tauri::command]
pub async fn fetch_stock_quote(symbol: String) -> Result<StockQuote, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    fetch_single_quote(&client, &symbol).await
}

#[tauri::command]
pub async fn auto_update_all_live_quotes(
    state: State<'_, AppState>,
    operator: String,
) -> Result<Vec<StockAsset>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let stocks = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        storage.load_stocks()
    };

    if stocks.is_empty() {
        return Ok(Vec::new());
    }

    let live_rate = match query_yahoo_finance(&client, "USDTWD=X").await {
        Ok((_, r, _, _, _)) if r > 0.0 => (r * 100.0).round() / 100.0,
        _ => 32.2,
    };

    let mut updated_stocks = stocks;
    let mut updated_count = 0;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    for stock in &mut updated_stocks {
        if let Ok(quote) = fetch_single_quote(&client, &stock.symbol).await {
            stock.current_price = quote.current_price;
            if stock.currency == "USD" {
                stock.exchange_rate = live_rate;
            }
            stock.updated_at = now.clone();
            StorageManager::calculate_stock_metrics(stock);
            updated_count += 1;
        }
    }

    {
        let storage = state.lock().map_err(|e| e.to_string())?;
        storage.save_stocks(&updated_stocks)?;

        let op = if operator.trim().is_empty() {
            "行情自動連線".to_string()
        } else {
            operator
        };

        let log = AssetLog {
            id: Uuid::new_v4().to_string(),
            asset_id: "STOCK-AUTO-REFRESH".to_string(),
            asset_name: "自動更新系統市場行情".to_string(),
            action: "更新股價".to_string(),
            operator: op,
            details: format!("已自動連線抓取 {} 檔標的最新市場即時報價", updated_count),
            timestamp: now,
        };
        let _ = storage.add_log(log);
    }

    // Auto-sync if configured
    let (auto_sync, settings, all_assets, all_stocks, all_logs) = {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let s = storage.load_settings();
        (
            s.auto_sync,
            s,
            storage.load_assets(),
            storage.load_stocks(),
            storage.load_logs(),
        )
    };

    if auto_sync {
        let res = GitHubSyncEngine::sync_to_github(&settings, &all_assets, &all_stocks, &all_logs).await;
        if let Ok(storage) = state.lock() {
            let mut s = storage.load_settings();
            s.last_sync_time = Some(res.timestamp);
            s.last_sync_status = Some(res.message);
            let _ = storage.save_settings(&s);
        }
    }

    Ok(updated_stocks)
}
