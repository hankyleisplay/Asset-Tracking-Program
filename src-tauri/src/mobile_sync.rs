use crate::backup_engine::BackupEngine;
use crate::models::{
    Asset, AssetLog, DividendRecord, FinancialGoal, MobileSyncStatus, StockAsset, SyncPayload,
};
use crate::storage::{AppState, StorageManager};
use chrono::Local;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::thread;
use std::time::Duration;
use uuid::Uuid;

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static ACTIVE_PORT: AtomicU16 = AtomicU16::new(18888);

const UI_INDEX_HTML: &str = include_str!("../../ui/index.html");
const UI_STYLES_CSS: &str = include_str!("../../ui/styles.css");
const UI_APP_JS: &str = include_str!("../../ui/app.js");
const UI_LOGO_PNG: &[u8] = include_bytes!("../../ui/app-logo.png");
const UI_FAVICON_PNG: &[u8] = include_bytes!("../../ui/favicon.png");

pub fn detect_local_ips() -> Vec<String> {
    let mut ips = Vec::new();

    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip().to_string();
                if ip != "127.0.0.1" && ip != "0.0.0.0" {
                    ips.push(ip);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("ipconfig").output() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("IPv4") {
                    if let Some(pos) = line.find(':') {
                        let ip = line[pos + 1..].trim().to_string();
                        if !ip.is_empty()
                            && ip != "127.0.0.1"
                            && !ip.starts_with("169.254.")
                            && !ips.contains(&ip)
                        {
                            ips.push(ip);
                        }
                    }
                }
            }
        }
    }

    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }

    ips
}

pub fn get_sync_status(state: &AppState) -> MobileSyncStatus {
    let ips = detect_local_ips();
    let primary_ip = ips
        .first()
        .cloned()
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let port = ACTIVE_PORT.load(Ordering::SeqCst);

    let (pin, last_sync_time, sync_revision) = if let Ok(storage) = state.lock() {
        let s = storage.load_settings();
        (
            s.mobile_sync_pin.clone(),
            s.last_mobile_sync_time.clone(),
            storage.get_revision(),
        )
    } else {
        ("8888".to_string(), None, 1)
    };

    MobileSyncStatus {
        running: SERVER_RUNNING.load(Ordering::SeqCst),
        local_ips: ips,
        primary_ip: primary_ip.clone(),
        port,
        pin,
        web_url: format!("http://{}:{}", primary_ip, port),
        apk_download_url: "https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest/download/Asset-Tracking-Mobile_v2.0.0.apk".to_string(),
        last_sync_time,
        sync_revision,
    }
}

pub fn start_mobile_sync_server(app_state: AppState) {
    if SERVER_RUNNING.load(Ordering::SeqCst) {
        return;
    }

    let configured_port = if let Ok(storage) = app_state.lock() {
        storage.load_settings().mobile_sync_port
    } else {
        18888
    };

    thread::spawn(move || {
        let mut bound_listener = None;
        let ports_to_try = [configured_port, 18888, 18889, 18890, 19888];

        for &port in &ports_to_try {
            if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{}", port)) {
                ACTIVE_PORT.store(port, Ordering::SeqCst);
                SERVER_RUNNING.store(true, Ordering::SeqCst);
                bound_listener = Some(listener);
                break;
            }
        }

        let listener = match bound_listener {
            Some(l) => l,
            None => return,
        };

        for stream in listener.incoming().flatten() {
            let state_clone = app_state.clone();
            thread::spawn(move || {
                let _ = handle_client(stream, state_clone);
            });
        }
    });
}

fn handle_client(mut stream: TcpStream, state: AppState) -> Result<(), String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let mut buffer = Vec::new();
    let mut temp = [0u8; 4096];
    let mut header_end = None;
    let mut content_length = 0usize;

    loop {
        match stream.read(&mut temp) {
            Ok(0) => break,
            Ok(n) => {
                buffer.extend_from_slice(&temp[..n]);
                if header_end.is_none() {
                    if let Some(pos) = find_subsequence(&buffer, b"\r\n\r\n") {
                        header_end = Some(pos + 4);
                        let header_str = String::from_utf8_lossy(&buffer[..pos]);
                        for line in header_str.lines() {
                            if line.to_ascii_lowercase().starts_with("content-length:") {
                                if let Some(val) = line.split(':').nth(1) {
                                    content_length = val.trim().parse::<usize>().unwrap_or(0);
                                }
                            }
                        }
                    }
                }
                if let Some(h_end) = header_end {
                    if buffer.len() >= h_end + content_length {
                        break;
                    }
                }
                if buffer.len() > 10 * 1024 * 1024 {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    if buffer.is_empty() {
        return Ok(());
    }

    let h_end = header_end.unwrap_or(buffer.len());
    let header_str = String::from_utf8_lossy(&buffer[..h_end]).to_string();
    let body_bytes = if buffer.len() > h_end {
        &buffer[h_end..]
    } else {
        &[]
    };

    let first_line = header_str.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }

    let method = parts[0].to_uppercase();
    let full_path = parts[1];
    let (path, query) = match full_path.split_once('?') {
        Some((p, q)) => (p, q),
        None => (full_path, ""),
    };

    if method == "OPTIONS" {
        return send_response(&mut stream, 200, "text/plain", b"OK");
    }

    // Extract PIN from header or query if provided
    let mut provided_pin = String::new();
    for line in header_str.lines() {
        if line.to_ascii_lowercase().starts_with("x-sync-pin:") {
            if let Some(val) = line.split(':').nth(1) {
                provided_pin = val.trim().to_string();
            }
        }
    }
    if provided_pin.is_empty() {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "pin" {
                    provided_pin = v.trim().to_string();
                }
            }
        }
    }

    // Serve static files for Mobile Web App / PWA
    if method == "GET" && !path.starts_with("/api/") {
        match path {
            "/" | "/index.html" => {
                return send_response(
                    &mut stream,
                    200,
                    "text/html; charset=utf-8",
                    UI_INDEX_HTML.as_bytes(),
                );
            }
            "/styles.css" => {
                return send_response(
                    &mut stream,
                    200,
                    "text/css; charset=utf-8",
                    UI_STYLES_CSS.as_bytes(),
                );
            }
            "/app.js" => {
                return send_response(
                    &mut stream,
                    200,
                    "application/javascript; charset=utf-8",
                    UI_APP_JS.as_bytes(),
                );
            }
            "/app-logo.png" => {
                return send_response(&mut stream, 200, "image/png", UI_LOGO_PNG);
            }
            "/favicon.png" => {
                return send_response(&mut stream, 200, "image/png", UI_FAVICON_PNG);
            }
            "/manifest.json" => {
                let manifest = json!({
                    "name": "資產與證券追蹤系統",
                    "short_name": "資產追蹤",
                    "start_url": "/",
                    "display": "standalone",
                    "background_color": "#060913",
                    "theme_color": "#6366f1",
                    "icons": [
                        { "src": "/app-logo.png", "sizes": "512x512", "type": "image/png" }
                    ]
                });
                return send_json(&mut stream, 200, &manifest);
            }
            _ => {
                return send_response(
                    &mut stream,
                    200,
                    "text/html; charset=utf-8",
                    UI_INDEX_HTML.as_bytes(),
                );
            }
        }
    }

    // API Endpoints
    if path == "/api/ping" {
        let (require_pin, rev, last_sync) = if let Ok(storage) = state.lock() {
            let s = storage.load_settings();
            (
                !s.mobile_sync_pin.trim().is_empty(),
                storage.get_revision(),
                s.last_mobile_sync_time,
            )
        } else {
            (false, 1, None)
        };
        let resp = json!({
            "status": "ok",
            "app": "Asset Tracking Program",
            "version": "2.0.0",
            "require_pin": require_pin,
            "sync_revision": rev,
            "last_sync_time": last_sync,
            "server_time": Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
        });
        return send_json(&mut stream, 200, &resp);
    }

    if path == "/api/sync/pull" && method == "GET" {
        let storage = state.lock().map_err(|e| e.to_string())?;
        let settings = storage.load_settings();
        if !settings.mobile_sync_pin.trim().is_empty()
            && !provided_pin.is_empty()
            && provided_pin != settings.mobile_sync_pin
        {
            return send_json(
                &mut stream,
                401,
                &json!({ "error": "同步連線 PIN 碼驗證錯誤，請確認電腦端設定的 PIN 碼" }),
            );
        }

        let resp = json!({
            "version": "2.0.0",
            "timestamp": Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            "sync_revision": storage.get_revision(),
            "assets": storage.load_assets(),
            "stocks": storage.load_stocks(),
            "dividends": storage.load_dividends(),
            "goals": storage.load_goals(),
            "logs": storage.load_logs(),
            "settings": settings,
            "stats": storage.get_dashboard_stats()
        });
        return send_json(&mut stream, 200, &resp);
    }

    if path == "/api/sync/push" && method == "POST" {
        let body_str = String::from_utf8_lossy(body_bytes);
        let payload: SyncPayload = match serde_json::from_str(&body_str) {
            Ok(p) => p,
            Err(e) => {
                return send_json(
                    &mut stream,
                    400,
                    &json!({ "error": format!("同步封包解析失敗: {}", e) }),
                );
            }
        };

        let result = apply_mobile_sync(&state, payload);
        match result {
            Ok(resp_val) => return send_json(&mut stream, 200, &resp_val),
            Err(err_msg) => return send_json(&mut stream, 400, &json!({ "error": err_msg })),
        }
    }

    if path == "/api/rpc" && method == "POST" {
        let body_str = String::from_utf8_lossy(body_bytes);
        let req: Value = serde_json::from_str(&body_str).unwrap_or_else(|_| json!({}));
        let cmd = req.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
        let args = req.get("args").cloned().unwrap_or_else(|| json!({}));

        match handle_mobile_rpc(&state, cmd, args) {
            Ok(data) => return send_json(&mut stream, 200, &json!({ "ok": true, "data": data })),
            Err(err) => return send_json(&mut stream, 400, &json!({ "ok": false, "error": err })),
        }
    }

    send_json(&mut stream, 404, &json!({ "error": "Not Found" }))
}

pub fn apply_mobile_sync(state: &AppState, payload: SyncPayload) -> Result<Value, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let storage = state.lock().map_err(|e| e.to_string())?;
    let mut settings = storage.load_settings();

    if let Some(ref req_pin) = payload.pin {
        if !settings.mobile_sync_pin.trim().is_empty()
            && !req_pin.trim().is_empty()
            && req_pin.trim() != settings.mobile_sync_pin.trim()
        {
            return Err("同步 PIN 碼不正確，請確認電腦端設定的 4 位數配對碼".to_string());
        }
    }

    let mode = payload.sync_mode.as_deref().unwrap_or("merge");
    let deleted = &payload.deleted_ids;

    // 1. Sync Assets
    let mut current_assets = if mode == "overwrite" {
        Vec::new()
    } else {
        storage
            .load_assets()
            .into_iter()
            .filter(|a| !deleted.contains(&a.id))
            .collect()
    };

    for mut inc in payload.assets {
        if deleted.contains(&inc.id) {
            continue;
        }
        if inc.updated_at.is_empty() {
            inc.updated_at = now.clone();
        }
        StorageManager::calculate_depreciation(&mut inc);
        if let Some(pos) = current_assets.iter().position(|a| a.id == inc.id) {
            if inc.updated_at >= current_assets[pos].updated_at || mode == "overwrite" {
                current_assets[pos] = inc;
            }
        } else {
            current_assets.push(inc);
        }
    }
    storage.save_assets(&current_assets)?;

    // 2. Sync Stocks
    let mut current_stocks = if mode == "overwrite" {
        Vec::new()
    } else {
        storage
            .load_stocks()
            .into_iter()
            .filter(|s| !deleted.contains(&s.id))
            .collect()
    };

    for mut inc in payload.stocks {
        if deleted.contains(&inc.id) {
            continue;
        }
        if inc.updated_at.is_empty() {
            inc.updated_at = now.clone();
        }
        StorageManager::calculate_stock_metrics(&mut inc);
        if let Some(pos) = current_stocks
            .iter()
            .position(|s| s.id == inc.id || s.symbol == inc.symbol)
        {
            if inc.updated_at >= current_stocks[pos].updated_at || mode == "overwrite" {
                current_stocks[pos] = inc;
            }
        } else {
            current_stocks.push(inc);
        }
    }
    storage.save_stocks(&current_stocks)?;

    // 3. Sync Dividends
    let mut current_dividends = if mode == "overwrite" {
        Vec::new()
    } else {
        storage
            .load_dividends()
            .into_iter()
            .filter(|d| !deleted.contains(&d.id))
            .collect()
    };

    for inc in payload.dividends {
        if deleted.contains(&inc.id) {
            continue;
        }
        if let Some(pos) = current_dividends.iter().position(|d| d.id == inc.id) {
            current_dividends[pos] = inc;
        } else {
            current_dividends.push(inc);
        }
    }
    storage.save_dividends(&current_dividends)?;

    // 4. Sync Goals
    let mut current_goals = if mode == "overwrite" {
        Vec::new()
    } else {
        storage
            .load_goals()
            .into_iter()
            .filter(|g| !deleted.contains(&g.id))
            .collect()
    };

    for inc in payload.goals {
        if deleted.contains(&inc.id) {
            continue;
        }
        if let Some(pos) = current_goals.iter().position(|g| g.id == inc.id) {
            current_goals[pos] = inc;
        } else {
            current_goals.push(inc);
        }
    }
    storage.save_goals(&current_goals)?;

    // Update last sync time
    settings.last_mobile_sync_time = Some(now.clone());
    if let Some(inc_settings) = payload.settings {
        settings.theme_preset = inc_settings.theme_preset;
        settings.custom_primary_color = inc_settings.custom_primary_color;
        settings.custom_accent_color = inc_settings.custom_accent_color;
        settings.stock_color_mode = inc_settings.stock_color_mode;
    }
    storage.save_settings(&settings)?;

    let device = if payload.device_name.trim().is_empty() {
        "Android 手機端 App".to_string()
    } else {
        payload.device_name
    };

    let _ = storage.add_log(AssetLog {
        id: Uuid::new_v4().to_string(),
        asset_id: "MOBILE-SYNC".to_string(),
        asset_name: "手機與電腦雙向同步".to_string(),
        action: "手機同步".to_string(),
        operator: device,
        details: format!(
            "完成雙向同步 (資產: {} 筆, 股票: {} 檔, 股息: {} 筆, 目標: {} 項)",
            current_assets.len(),
            current_stocks.len(),
            current_dividends.len(),
            current_goals.len()
        ),
        timestamp: now.clone(),
    });

    if settings.auto_backup {
        let _ = BackupEngine::create_backup(&storage, "手機同步自動備份");
    }

    Ok(json!({
        "status": "ok",
        "timestamp": now,
        "sync_revision": storage.get_revision(),
        "assets": current_assets,
        "stocks": current_stocks,
        "dividends": current_dividends,
        "goals": current_goals,
        "logs": storage.load_logs(),
        "settings": settings,
        "stats": storage.get_dashboard_stats()
    }))
}

fn handle_mobile_rpc(state: &AppState, cmd: &str, args: Value) -> Result<Value, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let storage = state.lock().map_err(|e| e.to_string())?;

    match cmd {
        "get_assets" => Ok(serde_json::to_value(storage.load_assets()).unwrap_or_default()),
        "get_stocks" => Ok(serde_json::to_value(storage.load_stocks()).unwrap_or_default()),
        "get_dividends" => Ok(serde_json::to_value(storage.load_dividends()).unwrap_or_default()),
        "get_goals" => Ok(serde_json::to_value(storage.load_goals()).unwrap_or_default()),
        "get_audit_logs" => Ok(serde_json::to_value(storage.load_logs()).unwrap_or_default()),
        "get_settings" => Ok(serde_json::to_value(storage.load_settings()).unwrap_or_default()),
        "get_dashboard_stats" => {
            Ok(serde_json::to_value(storage.get_dashboard_stats()).unwrap_or_default())
        }
        "get_stock_summary" => {
            Ok(serde_json::to_value(storage.get_stock_summary()).unwrap_or_default())
        }
        "save_asset" => {
            let mut asset: Asset = serde_json::from_value(
                args.get("asset").cloned().unwrap_or_else(|| json!({})),
            )
            .map_err(|e| e.to_string())?;
            let operator = args
                .get("operator")
                .and_then(|v| v.as_str())
                .unwrap_or("手機端使用者")
                .to_string();

            let mut assets = storage.load_assets();
            if asset.id.trim().is_empty() {
                asset.id = format!(
                    "AST-{}-{}",
                    Local::now().format("%Y%m%d"),
                    &Uuid::new_v4().to_string()[..4].to_uppercase()
                );
                asset.created_at = now.clone();
            }
            asset.updated_at = now.clone();
            StorageManager::calculate_depreciation(&mut asset);

            if let Some(pos) = assets.iter().position(|a| a.id == asset.id) {
                assets[pos] = asset.clone();
            } else {
                assets.push(asset.clone());
            }
            storage.save_assets(&assets)?;

            let mut s = storage.load_settings();
            s.last_mobile_sync_time = Some(now.clone());
            let _ = storage.save_settings(&s);

            let _ = storage.add_log(AssetLog {
                id: Uuid::new_v4().to_string(),
                asset_id: asset.id.clone(),
                asset_name: asset.name.clone(),
                action: "修改".to_string(),
                operator,
                details: format!("透過手機端儲存資產: {} ({})", asset.name, asset.id),
                timestamp: now,
            });
            Ok(serde_json::to_value(asset).unwrap_or_default())
        }
        "delete_asset" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut assets = storage.load_assets();
            assets.retain(|a| a.id != id);
            storage.save_assets(&assets)?;
            Ok(json!(true))
        }
        "update_asset_status" => {
            let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let new_status = args
                .get("new_status")
                .and_then(|v| v.as_str())
                .unwrap_or("在用中");
            let mut assets = storage.load_assets();
            if let Some(pos) = assets.iter().position(|a| a.id == id) {
                assets[pos].status = new_status.to_string();
                assets[pos].updated_at = now.clone();
                if new_status == "已報廢" {
                    assets[pos].current_value = 0.0;
                }
                let updated = assets[pos].clone();
                storage.save_assets(&assets)?;
                Ok(serde_json::to_value(updated).unwrap_or_default())
            } else {
                Err("找不到該資產".to_string())
            }
        }
        "save_stock" => {
            let mut stock: StockAsset = serde_json::from_value(
                args.get("stock").cloned().unwrap_or_else(|| json!({})),
            )
            .map_err(|e| e.to_string())?;
            let operator = args
                .get("operator")
                .and_then(|v| v.as_str())
                .unwrap_or("手機端投資人")
                .to_string();

            if stock.id.trim().is_empty() {
                stock.id = format!("STK-{}", stock.symbol.to_uppercase());
            }
            stock.updated_at = now.clone();
            StorageManager::calculate_stock_metrics(&mut stock);

            let mut stocks = storage.load_stocks();
            if let Some(pos) = stocks
                .iter()
                .position(|s| s.id == stock.id || s.symbol == stock.symbol)
            {
                stocks[pos] = stock.clone();
            } else {
                stocks.push(stock.clone());
            }
            storage.save_stocks(&stocks)?;

            let mut s = storage.load_settings();
            s.last_mobile_sync_time = Some(now.clone());
            let _ = storage.save_settings(&s);

            let _ = storage.add_log(AssetLog {
                id: Uuid::new_v4().to_string(),
                asset_id: stock.symbol.clone(),
                asset_name: stock.name.clone(),
                action: "更新股票".to_string(),
                operator,
                details: format!(
                    "透過手機端更新持股: {} ({}) 股數: {}",
                    stock.name, stock.symbol, stock.shares
                ),
                timestamp: now,
            });
            Ok(serde_json::to_value(stock).unwrap_or_default())
        }
        "delete_stock" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut stocks = storage.load_stocks();
            stocks.retain(|s| s.id != id);
            storage.save_stocks(&stocks)?;
            Ok(json!(true))
        }
        "save_dividend" => {
            let mut div: DividendRecord = serde_json::from_value(
                args.get("dividend").cloned().unwrap_or_else(|| json!({})),
            )
            .map_err(|e| e.to_string())?;
            if div.id.trim().is_empty() {
                div.id = format!("DIV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
                div.created_at = now.clone();
            }
            let mut divs = storage.load_dividends();
            if let Some(pos) = divs.iter().position(|d| d.id == div.id) {
                divs[pos] = div.clone();
            } else {
                divs.insert(0, div.clone());
            }
            storage.save_dividends(&divs)?;
            Ok(serde_json::to_value(div).unwrap_or_default())
        }
        "delete_dividend" => {
            let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let mut divs = storage.load_dividends();
            divs.retain(|d| d.id != id);
            storage.save_dividends(&divs)?;
            Ok(json!(true))
        }
        "save_goal" => {
            let mut goal: FinancialGoal =
                serde_json::from_value(args.get("goal").cloned().unwrap_or_else(|| json!({})))
                    .map_err(|e| e.to_string())?;
            if goal.id.trim().is_empty() {
                goal.id = format!("GOAL-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            }
            goal.updated_at = now;
            let mut goals = storage.load_goals();
            if let Some(pos) = goals.iter().position(|g| g.id == goal.id) {
                goals[pos] = goal.clone();
            } else {
                goals.push(goal.clone());
            }
            storage.save_goals(&goals)?;
            Ok(serde_json::to_value(goal).unwrap_or_default())
        }
        "delete_goal" => {
            let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let mut goals = storage.load_goals();
            goals.retain(|g| g.id != id);
            storage.save_goals(&goals)?;
            Ok(json!(true))
        }
        "save_settings" => {
            let settings = serde_json::from_value(
                args.get("settings").cloned().unwrap_or_else(|| json!({})),
            )
            .map_err(|e| e.to_string())?;
            storage.save_settings(&settings)?;
            Ok(json!(true))
        }
        "list_local_backups" => {
            let list = BackupEngine::list_backups(&storage)?;
            Ok(serde_json::to_value(list).unwrap_or_default())
        }
        "create_local_backup" => {
            let note = args
                .get("note")
                .and_then(|v| v.as_str())
                .unwrap_or("手機端觸發備份");
            let info = BackupEngine::create_backup(&storage, note)?;
            Ok(serde_json::to_value(info).unwrap_or_default())
        }
        _ => Err(format!("未支援的遠端指令: {}", cmd)),
    }
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn send_json(stream: &mut TcpStream, status: u16, value: &Value) -> Result<(), String> {
    let body = serde_json::to_string(value).map_err(|e| e.to_string())?;
    send_response(
        stream,
        status,
        "application/json; charset=utf-8",
        body.as_bytes(),
    )
}

fn send_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> Result<(), String> {
    let status_text = match status {
        200 => "200 OK",
        204 => "204 No Content",
        400 => "400 Bad Request",
        401 => "401 Unauthorized",
        404 => "404 Not Found",
        _ => "500 Internal Server Error",
    };

    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Sync-Pin\r\nConnection: close\r\n\r\n",
        status_text,
        content_type,
        body.len()
    );

    stream
        .write_all(header.as_bytes())
        .map_err(|e| e.to_string())?;
    stream.write_all(body).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    Ok(())
}
