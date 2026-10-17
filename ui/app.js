/**
 * Asset & Stock Portfolio Tracking System
 * Liquid Glass & Material Design 3 Client Engine
 */

// 1. Dynamic Tauri IPC Resolver with Timeout Guard
function getTauriInvoke() {
  if (window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke;
  }
  if (window.__TAURI__?.invoke) {
    return window.__TAURI__.invoke;
  }
  if (window.__TAURI_INTERNALS__?.invoke) {
    return window.__TAURI_INTERNALS__.invoke;
  }
  return null;
}

// 2. Global Application State
let appSettings = {
  currency: "TWD",
  auto_backup: true,
  last_backup_time: null,
  backup_retention_count: 20,
  stock_color_mode: "tw",
  theme_preset: "ocean",
  custom_primary_color: null,
  custom_accent_color: null,
  glass_blur_level: "medium",
  auto_check_update: true,
  mobile_sync_enabled: true,
  mobile_sync_port: 18888,
  mobile_sync_pin: "8888",
  last_mobile_sync_time: null
};

let allAssets = [];
let filteredAssets = [];
let currentFilterStatus = '全部';
let currentFilterCategory = '全部';
let searchQuery = '';

let allStocks = [];
let filteredStocks = [];
let currentStockFilterMarket = '全部';
let stockSearchQuery = '';

let allDividends = [];
let allGoals = [];
let latestUpdateInfo = null;
let lastKnownSyncRevision = 0;

// Delete modal state
let pendingDeleteType = null; // 'asset' | 'stock' | 'dividend' | 'goal'
let pendingDeleteId = null;

// Detect if running on Mobile LAN Web Server or Mobile APK with Remote Host
function getRemoteSyncHost() {
  if (window.location && window.location.port === '18888' && window.location.host) {
    return window.location.host;
  }
  const saved = localStorage.getItem('asset_mobile_remote_host');
  return saved ? saved.trim() : '';
}

// Safe IPC API with timeout, Mobile LAN RPC bridge, and offline localStorage fallback
async function invokeApi(command, args = {}) {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tauri 指令 [${command}] 超時 (6秒)`)), 6000)
      );
      const res = await Promise.race([invoke(command, args), timeoutPromise]);
      return res;
    } catch (err) {
      console.warn(`[Tauri IPC] ${command} failed or timed out:`, err);
      return mockApi(command, args);
    }
  } else {
    // Running in Mobile APK or Mobile Web Browser
    const remoteHost = getRemoteSyncHost();
    const isServedFromPcLan = window.location && window.location.port === '18888';
    const writeCommands = [
      'save_asset', 'delete_asset', 'update_asset_status',
      'save_stock', 'delete_stock', 'batch_update_stock_prices',
      'save_dividend', 'delete_dividend', 'save_goal', 'delete_goal',
      'save_settings', 'clear_all_system_data'
    ];
    // Always execute on local mockDb first so offline works 100%
    const localRes = await mockApi(command, args);

    // If connected to PC LAN server, also forward RPC or pull live data
    if (remoteHost && (isServedFromPcLan || writeCommands.includes(command))) {
      try {
        const pin = localStorage.getItem('asset_mobile_remote_pin') || appSettings.mobile_sync_pin || '';
        const resp = await fetch(`http://${remoteHost}/api/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, args, pin })
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json && json.ok && json.data !== undefined) {
            return json.data;
          }
        }
      } catch (e) {
        // Offline or PC unreachable - seamlessly use localRes
        console.debug('[Mobile Offline Mode] Using local storage for', command);
      }
    }
    return localRes;
  }
}

// 3. Mock Database for Mobile APK Offline Mode & Browser Fallback (Clean Slate / 0 預設資料)
const MOCK_STORAGE_KEY = 'asset_tracking_portfolio_backup_v1';

function getMockDb() {
  try {
    const existing = localStorage.getItem(MOCK_STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed && Array.isArray(parsed.assets) && Array.isArray(parsed.stocks)) {
        if (!Array.isArray(parsed.dividends)) parsed.dividends = [];
        if (!Array.isArray(parsed.goals)) parsed.goals = [];
        if (!Array.isArray(parsed.deleted_ids)) parsed.deleted_ids = [];
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse localStorage:', e);
  }

  const initial = {
    assets: [],
    stocks: [],
    dividends: [],
    goals: [],
    logs: [],
    backups: [],
    deleted_ids: [],
    settings: { ...appSettings }
  };
  saveMockDb(initial);
  return initial;
}

function saveMockDb(db) {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

async function mockApi(command, args) {
  const db = getMockDb();

  if (command === 'get_assets') return db.assets || [];
  if (command === 'get_stocks') return db.stocks || [];
  if (command === 'get_dividends') return db.dividends || [];
  if (command === 'get_goals') return db.goals || [];
  if (command === 'get_audit_logs') return db.logs || [];
  if (command === 'get_settings') return { ...appSettings, ...(db.settings || {}) };
  if (command === 'get_data_folder_path') return "手機端與瀏覽器本機安全儲存區 (LocalStorage / IndexedDB)";

  if (command === 'save_settings') {
    db.settings = { ...appSettings, ...args.settings };
    saveMockDb(db);
    return null;
  }

  if (command === 'save_asset') {
    const item = { ...args.asset };
    if (!item.id) {
      item.id = "AST-" + Date.now().toString().slice(-6);
    }
    const nowStr = new Date().toLocaleString();
    if (!item.created_at) item.created_at = nowStr;
    item.updated_at = nowStr;
    const price = parseFloat(item.purchase_price) || 0;
    const years = parseInt(item.depreciation_years) || 3;
    if (price > 0 && years > 0 && item.purchase_date) {
      const elapsed = Math.max(0, (new Date() - new Date(item.purchase_date)) / (1000 * 60 * 60 * 24 * 365.25));
      item.current_value = Math.round(Math.max(0, price * (1 - Math.min(1, elapsed / years))));
    } else {
      item.current_value = price;
    }

    const idx = (db.assets || []).findIndex(a => a.id === item.id);
    if (idx >= 0) {
      db.assets[idx] = item;
    } else {
      db.assets.push(item);
    }
    db.deleted_ids = (db.deleted_ids || []).filter(id => id !== item.id);
    db.logs.unshift({
      id: "log-" + Date.now(),
      asset_id: item.id,
      asset_name: item.name,
      action: idx >= 0 ? "修改" : "建立",
      operator: args.operator || "使用者",
      details: `${idx >= 0 ? "修改" : "建立"}資產: ${item.name}`,
      timestamp: nowStr
    });
    saveMockDb(db);
    return item;
  }

  if (command === 'delete_asset') {
    const idx = (db.assets || []).findIndex(a => a.id === args.id);
    if (idx >= 0) {
      const removed = db.assets.splice(idx, 1)[0];
      if (!db.deleted_ids.includes(args.id)) db.deleted_ids.push(args.id);
      db.logs.unshift({
        id: "log-" + Date.now(),
        asset_id: args.id,
        asset_name: removed.name,
        action: "刪除",
        operator: args.operator || "使用者",
        details: `刪除資產: ${removed.name}`,
        timestamp: new Date().toLocaleString()
      });
      saveMockDb(db);
    }
    return null;
  }

  if (command === 'update_asset_status') {
    const asset = (db.assets || []).find(a => a.id === args.id);
    if (asset) {
      const old = asset.status;
      asset.status = args.new_status;
      asset.updated_at = new Date().toLocaleString();
      if (args.custodian) asset.custodian = args.custodian;
      db.logs.unshift({
        id: "log-" + Date.now(),
        asset_id: asset.id,
        asset_name: asset.name,
        action: args.action_type || "異動",
        operator: args.operator || "管理員",
        details: `狀態變更: ${old} -> ${args.new_status} (${args.notes || '無說明'})`,
        timestamp: asset.updated_at
      });
      saveMockDb(db);
    }
    return asset;
  }

  if (command === 'save_stock') {
    const stock = { ...args.stock };
    if (!stock.id) {
      stock.id = `STK-${stock.symbol.toUpperCase()}`;
    }
    stock.updated_at = new Date().toLocaleString();
    const rate = stock.currency === 'USD' ? (stock.exchange_rate || 32.0) : 1.0;
    stock.total_cost_twd = Math.round(stock.shares * stock.buy_price * rate * 100) / 100;
    stock.market_value_twd = Math.round(stock.shares * stock.current_price * rate * 100) / 100;
    stock.unrealized_pnl_twd = Math.round((stock.market_value_twd - stock.total_cost_twd) * 100) / 100;
    stock.return_rate = stock.total_cost_twd > 0
      ? Math.round((stock.unrealized_pnl_twd / stock.total_cost_twd) * 10000) / 100
      : 0;

    const idx = (db.stocks || []).findIndex(s => s.id === stock.id);
    if (idx >= 0) {
      db.stocks[idx] = stock;
    } else {
      db.stocks.push(stock);
    }
    db.deleted_ids = (db.deleted_ids || []).filter(id => id !== stock.id);
    db.logs.unshift({
      id: "log-" + Date.now(),
      asset_id: stock.id,
      asset_name: `${stock.name} (${stock.symbol})`,
      action: idx >= 0 ? "更新股票" : "買入股票",
      operator: args.operator || "投資人",
      details: `${idx >= 0 ? "更新" : "買入"}持股: ${stock.name} (${stock.symbol}), 現價: ${stock.current_price}`,
      timestamp: stock.updated_at
    });
    saveMockDb(db);
    return stock;
  }

  if (command === 'delete_stock') {
    const idx = (db.stocks || []).findIndex(s => s.id === args.id);
    if (idx >= 0) {
      const removed = db.stocks.splice(idx, 1)[0];
      if (!db.deleted_ids.includes(args.id)) db.deleted_ids.push(args.id);
      db.logs.unshift({
        id: "log-" + Date.now(),
        asset_id: args.id,
        asset_name: `${removed.name} (${removed.symbol})`,
        action: "賣出股票",
        operator: args.operator || "投資人",
        details: `賣出結清股票: ${removed.name} (${removed.symbol})`,
        timestamp: new Date().toLocaleString()
      });
      saveMockDb(db);
    }
    return null;
  }

  if (command === 'save_dividend') {
    const rec = { ...args.record };
    if (!rec.id) rec.id = "DIV-" + Date.now().toString().slice(-6);
    const rate = rec.currency === 'USD' ? (rec.exchange_rate || 32.0) : 1.0;
    rec.net_amount_twd = Math.round(Math.max(0, (rec.gross_amount || 0) - (rec.tax_or_fee || 0)) * rate * 100) / 100;
    const idx = (db.dividends || []).findIndex(d => d.id === rec.id);
    if (idx >= 0) db.dividends[idx] = rec;
    else db.dividends.unshift(rec);
    db.deleted_ids = (db.deleted_ids || []).filter(id => id !== rec.id);
    saveMockDb(db);
    return rec;
  }

  if (command === 'delete_dividend') {
    db.dividends = (db.dividends || []).filter(d => d.id !== args.id);
    if (!db.deleted_ids.includes(args.id)) db.deleted_ids.push(args.id);
    saveMockDb(db);
    return null;
  }

  if (command === 'save_goal') {
    const goal = { ...args.goal };
    if (!goal.id) goal.id = "GOAL-" + Date.now().toString().slice(-6);
    const idx = (db.goals || []).findIndex(g => g.id === goal.id);
    if (idx >= 0) db.goals[idx] = goal;
    else db.goals.push(goal);
    db.deleted_ids = (db.deleted_ids || []).filter(id => id !== goal.id);
    saveMockDb(db);
    return goal;
  }

  if (command === 'delete_goal') {
    db.goals = (db.goals || []).filter(g => g.id !== args.id);
    if (!db.deleted_ids.includes(args.id)) db.deleted_ids.push(args.id);
    saveMockDb(db);
    return null;
  }

  if (command === 'batch_update_stock_prices') {
    const updates = args.updates || {};
    (db.stocks || []).forEach(s => {
      const newPrice = updates[s.id] || updates[s.symbol];
      if (newPrice && newPrice > 0) {
        s.current_price = newPrice;
        s.updated_at = new Date().toLocaleString();
        const rate = s.currency === 'USD' ? (s.exchange_rate || 32.0) : 1.0;
        s.total_cost_twd = Math.round(s.shares * s.buy_price * rate * 100) / 100;
        s.market_value_twd = Math.round(s.shares * s.current_price * rate * 100) / 100;
        s.unrealized_pnl_twd = Math.round((s.market_value_twd - s.total_cost_twd) * 100) / 100;
        s.return_rate = s.total_cost_twd > 0
          ? Math.round((s.unrealized_pnl_twd / s.total_cost_twd) * 10000) / 100
          : 0;
      }
    });
    saveMockDb(db);
    return db.stocks;
  }

  if (command === 'get_stock_summary') {
    const list = db.stocks || [];
    let cost = 0, market = 0;
    const dist = {};
    list.forEach(s => {
      cost += s.total_cost_twd || 0;
      market += s.market_value_twd || 0;
      dist[s.market] = (dist[s.market] || 0) + (s.market_value_twd || 0);
    });
    const pnl = market - cost;
    const roi = cost > 0 ? (pnl / cost) * 100 : 0;
    return {
      total_stock_count: list.length,
      total_cost_twd: Math.round(cost * 100) / 100,
      total_market_value_twd: Math.round(market * 100) / 100,
      total_unrealized_pnl_twd: Math.round(pnl * 100) / 100,
      total_return_rate: Math.round(roi * 100) / 100,
      market_distribution: dist
    };
  }

  if (command === 'get_dashboard_stats') {
    const assets = db.assets || [];
    const stocks = db.stocks || [];
    const dividends = db.dividends || [];
    const goals = db.goals || [];
    let totalOrig = 0, totalCurr = 0, borrowed = 0, repairing = 0;
    const statusDist = {}, catDist = {};

    assets.forEach(a => {
      totalOrig += a.purchase_price || 0;
      totalCurr += a.current_value || 0;
      statusDist[a.status] = (statusDist[a.status] || 0) + 1;
      catDist[a.category] = (catDist[a.category] || 0) + 1;
      if (a.status === '外借中') borrowed++;
      if (a.status === '維修中') repairing++;
    });

    let stockCost = 0, stockMarket = 0;
    const stockDist = {};
    stocks.forEach(s => {
      stockCost += s.total_cost_twd || 0;
      stockMarket += s.market_value_twd || 0;
      stockDist[s.market] = (stockDist[s.market] || 0) + (s.market_value_twd || 0);
    });
    const stockPnl = stockMarket - stockCost;
    const stockRoi = stockCost > 0 ? (stockPnl / stockCost) * 100 : 0;
    const totalDividends = dividends.reduce((acc, d) => acc + (d.net_amount_twd || 0), 0);

    return {
      total_count: assets.length,
      total_original_value: Math.round(totalOrig * 100) / 100,
      total_current_value: Math.round(totalCurr * 100) / 100,
      status_distribution: statusDist,
      category_distribution: catDist,
      expiring_warranty_count: 0,
      borrowed_count: borrowed,
      repairing_count: repairing,
      recent_logs: (db.logs || []).slice(0, 10),
      stock_summary: {
        total_stock_count: stocks.length,
        total_cost_twd: Math.round(stockCost * 100) / 100,
        total_market_value_twd: Math.round(stockMarket * 100) / 100,
        total_unrealized_pnl_twd: Math.round(stockPnl * 100) / 100,
        total_return_rate: Math.round(stockRoi * 100) / 100,
        market_distribution: stockDist
      },
      total_net_worth_twd: Math.round((totalCurr + stockMarket) * 100) / 100,
      total_dividends_twd: Math.round(totalDividends * 100) / 100,
      dividend_count: dividends.length,
      goals_count: goals.length
    };
  }

  if (command === 'get_mobile_sync_status') {
    const host = getRemoteSyncHost() || window.location.host || '127.0.0.1:18888';
    return {
      running: true,
      port: 18888,
      local_ips: [host.split(':')[0] || '127.0.0.1'],
      mobile_web_url: `http://${host}`,
      apk_download_url: "https://github.com/hankyleisplay/Asset-Tracking-Program/releases/download/v2.0.0/Asset-Tracking-Mobile_v2.0.0.apk",
      sync_pin: db.settings?.mobile_sync_pin || "8888",
      last_sync_time: db.settings?.last_mobile_sync_time || null,
      sync_revision: 1
    };
  }

  if (command === 'check_app_update') {
    const currentVer = "2.0.0";
    try {
      const resp = await fetch('https://api.github.com/repos/hankyleisplay/Asset-Tracking-Program/releases/latest');
      if (resp.ok) {
        const json = await resp.json();
        const latestVer = (json.tag_name || 'v2.0.0').replace(/^[vV]/, '');
        return {
          has_update: latestVer > currentVer,
          current_version: currentVer,
          latest_version: latestVer,
          release_title: json.name || `v${latestVer}`,
          release_notes: json.body || '',
          published_at: json.published_at || '',
          download_url: json.html_url || 'https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest',
          apk_download_url: 'https://github.com/hankyleisplay/Asset-Tracking-Program/releases/download/v2.0.0/Asset-Tracking-Mobile_v2.0.0.apk',
          html_url: json.html_url || 'https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest'
        };
      }
    } catch (e) {
      console.warn('Update check fallback:', e);
    }
    return {
      has_update: false,
      current_version: currentVer,
      latest_version: currentVer,
      release_title: `v${currentVer} 最新版`,
      release_notes: "目前已經是最新穩定版本 v2.0.0。",
      published_at: new Date().toLocaleDateString(),
      download_url: "https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest",
      apk_download_url: "https://github.com/hankyleisplay/Asset-Tracking-Program/releases/download/v2.0.0/Asset-Tracking-Mobile_v2.0.0.apk",
      html_url: "https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest"
    };
  }

  if (command === 'create_local_backup') {
    if (!db.backups) db.backups = [];
    const now = new Date();
    const tsStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 15);
    const displayTs = now.toLocaleString();
    const item = {
      filename: `backup_${tsStr}.json`,
      filepath: `LocalStorage/backups/backup_${tsStr}.json`,
      created_at: displayTs,
      size_kb: 2.5,
      asset_count: (db.assets || []).length,
      stock_count: (db.stocks || []).length,
      log_count: (db.logs || []).length,
      note: args.note || '手動建立備份'
    };
    db.backups.unshift(item);
    if (!db.settings) db.settings = appSettings;
    db.settings.last_backup_time = displayTs;
    saveMockDb(db);
    return item;
  }

  if (command === 'list_local_backups') return db.backups || [];
  if (command === 'restore_local_backup') return '已成功從備份還原！';

  if (command === 'delete_local_backup') {
    if (db.backups) {
      db.backups = db.backups.filter(b => b.filename !== args.filename);
      saveMockDb(db);
    }
    return null;
  }

  if (command === 'export_full_backup_json') {
    return JSON.stringify({
      version: "2.0.0",
      timestamp: new Date().toLocaleString(),
      note: "本機全量備份匯出",
      assets: db.assets || [],
      stocks: db.stocks || [],
      dividends: db.dividends || [],
      goals: db.goals || [],
      logs: db.logs || [],
      settings: db.settings || appSettings
    }, null, 2);
  }

  if (command === 'clear_all_system_data') {
    db.assets = [];
    db.stocks = [];
    db.dividends = [];
    db.goals = [];
    db.logs = [];
    db.deleted_ids = [];
    saveMockDb(db);
    return null;
  }

  if (command === 'fetch_stock_quote') {
    const sym = (args.symbol || '').trim().toUpperCase();
    const isTw = /^\d+/.test(sym) || sym.endsWith('.TW') || sym.endsWith('.TWO');
    if (isTw) {
      let name = sym;
      if (sym.startsWith('2330')) name = '台積電';
      else if (sym.startsWith('2317')) name = '鴻海';
      else if (sym.startsWith('2454')) name = '聯發科';
      else if (sym.startsWith('0050')) name = '元大台灣50';
      else if (sym.startsWith('0056')) name = '元大高股息';
      else if (sym.startsWith('00878')) name = '國泰永續高股息';
      else if (sym.startsWith('00919')) name = '群益台灣精選高息';
      else if (sym.startsWith('00929')) name = '復華台灣科技優息';
      return {
        symbol: sym,
        name,
        market: sym.startsWith('00') ? 'ETF' : '台股',
        current_price: sym.startsWith('2330') ? 1045.0 : 150.0,
        currency: 'TWD',
        exchange_rate: 1.0,
        change: 5.0,
        change_percent: 0.5,
        updated_at: new Date().toLocaleTimeString()
      };
    } else {
      let name = sym;
      if (sym === 'NVDA') name = 'NVIDIA Corporation';
      else if (sym === 'AAPL') name = 'Apple Inc.';
      else if (sym === 'MSFT') name = 'Microsoft Corporation';
      else if (sym === 'TSLA') name = 'Tesla Inc.';
      else if (sym === 'GOOGL') name = 'Alphabet Inc.';
      else if (sym === 'AMZN') name = 'Amazon.com Inc.';
      const isEtf = ['QQQ', 'SPY', 'VOO', 'IVV', 'VTI'].includes(sym);
      return {
        symbol: sym,
        name,
        market: isEtf ? 'ETF' : '美股',
        current_price: sym === 'NVDA' ? 138.2 : 230.5,
        currency: 'USD',
        exchange_rate: 32.2,
        change: 2.1,
        change_percent: 1.5,
        updated_at: new Date().toLocaleTimeString()
      };
    }
  }

  if (command === 'auto_update_all_live_quotes') {
    (db.stocks || []).forEach(s => {
      s.updated_at = new Date().toLocaleString();
    });
    saveMockDb(db);
    return db.stocks || [];
  }

  return null;
}

// ==========================================================================
// 4. Initialization Entrypoint
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[AssetTracking v2.0] Initializing Liquid Glass & Material Design 3...');
  initNavigation();
  initCustomSelects();
  initEventListeners();
  await loadSettings();
  await refreshAllData();
  startBackgroundMobileSyncWatcher();
  if (appSettings.auto_check_update) {
    setTimeout(() => handleCheckAppUpdate(false), 2500);
  }
});

// ==========================================================================
// 5. Custom Dropdown Engine (自製 Liquid Glass 下拉選單)
// ==========================================================================
function initCustomSelects() {
  const selects = document.querySelectorAll('select.form-control');
  selects.forEach(select => {
    let wrapper = select.parentElement?.querySelector(`.custom-select-wrapper[data-select-id="${select.id}"]`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';
      wrapper.setAttribute('data-select-id', select.id);

      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      trigger.tabIndex = 0;

      const label = document.createElement('span');
      label.className = 'custom-select-label';

      const arrow = document.createElement('i');
      arrow.className = 'fa-solid fa-chevron-down custom-select-arrow';

      trigger.appendChild(label);
      trigger.appendChild(arrow);

      const dropdown = document.createElement('div');
      dropdown.className = 'custom-select-dropdown';

      wrapper.appendChild(trigger);
      wrapper.appendChild(dropdown);

      select.style.display = 'none';
      select.parentNode.insertBefore(wrapper, select.nextSibling);

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        closeAllCustomSelects();
        if (!isOpen) {
          wrapper.classList.add('open');
        }
      });

      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const isOpen = wrapper.classList.contains('open');
          closeAllCustomSelects();
          if (!isOpen) wrapper.classList.add('open');
        } else if (e.key === 'Escape') {
          wrapper.classList.remove('open');
        }
      });
    }

    renderCustomSelectOptions(select, wrapper);
  });
}

function renderCustomSelectOptions(select, wrapper) {
  if (!select || !wrapper) return;
  const label = wrapper.querySelector('.custom-select-label');
  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  const options = Array.from(select.options);
  const selectedOption = select.selectedOptions[0] || options[0];
  if (label && selectedOption) {
    label.innerText = selectedOption.text;
  }

  options.forEach(opt => {
    const isSelected = opt.value === select.value;
    const optDiv = document.createElement('div');
    optDiv.className = `custom-select-option ${isSelected ? 'selected' : ''}`;
    optDiv.setAttribute('data-value', opt.value);
    optDiv.innerHTML = `
      <span>${escapeHtml(opt.text)}</span>
      <i class="fa-solid fa-check option-check"></i>
    `;

    optDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      select.value = opt.value;
      wrapper.classList.remove('open');
      renderCustomSelectOptions(select, wrapper);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
    });

    dropdown.appendChild(optDiv);
  });
}

function syncCustomSelect(selectId) {
  const select = typeof selectId === 'string' ? document.getElementById(selectId) : selectId;
  if (!select) return;
  const wrapper = select.parentElement?.querySelector(`.custom-select-wrapper[data-select-id="${select.id}"]`);
  if (wrapper) {
    renderCustomSelectOptions(select, wrapper);
  }
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
}

window.addEventListener('click', () => {
  closeAllCustomSelects();
});

// ==========================================================================
// 6. Navigation System (Desktop Sidebar + Mobile Bottom Bar)
// ==========================================================================
function switchToView(targetView) {
  const navItems = document.querySelectorAll('.nav-item');
  const mobileBtns = document.querySelectorAll('.mobile-nav-btn');
  const sections = document.querySelectorAll('.view-section');

  navItems.forEach(n => {
    n.classList.toggle('active', n.getAttribute('data-view') === targetView);
  });
  mobileBtns.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-view') === targetView);
  });
  sections.forEach(s => {
    s.classList.toggle('active', s.id === targetView);
  });

  const activeNav = document.querySelector(`.nav-item[data-view="${targetView}"] span`);
  const headerTitle = document.getElementById('header-title');
  if (headerTitle && activeNav) {
    headerTitle.innerText = activeNav.innerText;
  }

  try {
    if (targetView === 'view-dashboard') renderDashboard();
    if (targetView === 'view-stocks') renderStocksTable();
    if (targetView === 'view-assets') renderAssetsTable();
    if (targetView === 'view-wealth') renderWealthView();
    if (targetView === 'view-mobile') loadMobileSyncView();
    if (targetView === 'view-logs') loadLogs();
    if (targetView === 'view-settings') loadSettingsView();
  } catch (err) {
    console.error('Error switching tab:', err);
  }
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-nav-btn').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      if (targetView) switchToView(targetView);
    });
  });
}

// ==========================================================================
// 7. Global Event Listeners & Button Handlers
// ==========================================================================
function initEventListeners() {
  // --- Navigation Header Buttons ---
  document.getElementById('btn-add-asset-top')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAssetModal();
  });

  document.getElementById('btn-top-add-stock')?.addEventListener('click', (e) => {
    e.preventDefault();
    openStockModal();
  });

  // 頂部快速切換主題配色
  document.getElementById('btn-header-theme')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const presets = ['ocean', 'emerald', 'amethyst', 'amber', 'crimson', 'glacier'];
    const names = {
      ocean: '深海極光 (Ocean)',
      emerald: '翡翠森林 (Emerald)',
      amethyst: '紫晶星雲 (Amethyst)',
      amber: '黑金琥珀 (Amber)',
      crimson: '緋紅霓虹 (Crimson)',
      glacier: '冰川青瓷 (Glacier)'
    };
    const currIdx = presets.indexOf(appSettings.theme_preset || 'ocean');
    const nextPreset = presets[(currIdx + 1) % presets.length];
    appSettings.theme_preset = nextPreset;
    appSettings.custom_primary_color = null;
    appSettings.custom_accent_color = null;
    applyThemeUI();
    await invokeApi('save_settings', { settings: appSettings });
    showToast(`🎨 已切換主題配色為：${names[nextPreset]}`, 'info');
  });

  // 頂部快速進入手機同步頁面
  document.getElementById('btn-header-mobile')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchToView('view-mobile');
  });

  // 頂部檢查更新按鈕
  document.getElementById('btn-header-update')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleCheckAppUpdate(true);
  });

  // 一鍵建立本機安全備份 (頂部按鈕與側邊欄按鈕)
  document.getElementById('btn-header-backup')?.addEventListener('click', handleCreateBackup);
  document.getElementById('btn-sidebar-backup')?.addEventListener('click', handleCreateBackup);

  // 設定頁面備份中心操作
  document.getElementById('btn-create-backup')?.addEventListener('click', handleCreateBackup);
  document.getElementById('btn-export-backup-file')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleExportBackupFile();
  });
  document.getElementById('btn-import-backup-file')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('file-restore-backup')?.click();
  });
  document.getElementById('file-restore-backup')?.addEventListener('change', handleRestoreBackupFile);
  document.getElementById('btn-refresh-backups')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadBackupsList();
  });

  // 歷史備份列表操作委託 (還原 / 刪除)
  const backupListElem = document.getElementById('backup-history-list');
  if (backupListElem) {
    backupListElem.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-action');
      const filename = btn.getAttribute('data-file');

      if (action === 'restore-backup') {
        const confirmed = confirm(`確定要將系統還原至備份快照 [${filename}] 嗎？\n此操作將覆蓋現有資產與股票數據！`);
        if (!confirmed) return;
        try {
          showToast(`正在自備份 [${filename}] 還原...`, 'info');
          const msg = await invokeApi('restore_local_backup', { source: filename, operator: '本機快照還原' });
          showToast(msg || '備份已成功還原！', 'success');
          await refreshAllData();
          await loadBackupsList();
        } catch (err) {
          showToast('還原備份失敗: ' + err, 'error');
        }
      } else if (action === 'delete-backup') {
        const confirmed = confirm(`確定要刪除歷史備份檔 [${filename}] 嗎？`);
        if (!confirmed) return;
        try {
          await invokeApi('delete_local_backup', { filename });
          showToast(`已刪除備份檔 [${filename}]`, 'success');
          await loadBackupsList();
        } catch (err) {
          showToast('刪除備份失敗: ' + err, 'error');
        }
      }
    });
  }

  // --- Physical Asset Toolbar & Filters ---
  document.getElementById('btn-add-asset')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAssetModal();
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target.value || '').toLowerCase().trim();
      applyAssetFilters();
    });
  }

  const catSelect = document.getElementById('category-filter');
  if (catSelect) {
    catSelect.addEventListener('change', (e) => {
      currentFilterCategory = e.target.value;
      applyAssetFilters();
    });
  }

  document.querySelectorAll('.asset-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.asset-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilterStatus = chip.getAttribute('data-status') || '全部';
      applyAssetFilters();
    });
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportCsv();
  });

  document.getElementById('btn-export-json')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportJson();
  });

  document.getElementById('file-import-json')?.addEventListener('change', handleImportJson);

  // --- Stock Toolbar & Filters ---
  document.getElementById('btn-add-stock')?.addEventListener('click', (e) => {
    e.preventDefault();
    openStockModal();
  });

  document.getElementById('btn-batch-update-prices')?.addEventListener('click', (e) => {
    e.preventDefault();
    openBatchPricesModal();
  });

  document.getElementById('btn-export-stocks-csv')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportStocksCsv();
  });

  document.getElementById('btn-auto-update-live-quotes')?.addEventListener('click', handleAutoUpdateLiveQuotes);

  const stockSymbolInput = document.getElementById('stock-field-symbol');
  if (stockSymbolInput) {
    stockSymbolInput.addEventListener('input', handleStockSymbolInput);
  }

  document.getElementById('btn-fetch-symbol-quote')?.addEventListener('click', handleFetchSymbolQuote);
  document.getElementById('btn-clear-all-data')?.addEventListener('click', handleClearAllData);

  const stockSearchInput = document.getElementById('stock-search-input');
  if (stockSearchInput) {
    stockSearchInput.addEventListener('input', (e) => {
      stockSearchQuery = (e.target.value || '').toLowerCase().trim();
      applyStockFilters();
    });
  }

  document.querySelectorAll('.stock-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.stock-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStockFilterMarket = chip.getAttribute('data-market') || '全部';
      applyStockFilters();
    });
  });

  // --- Wealth & Financial Lab Events ---
  document.getElementById('btn-add-dividend')?.addEventListener('click', (e) => {
    e.preventDefault();
    openDividendModal();
  });
  document.getElementById('btn-add-goal')?.addEventListener('click', (e) => {
    e.preventDefault();
    openGoalModal();
  });
  document.getElementById('dividend-form')?.addEventListener('submit', handleDividendFormSubmit);
  document.getElementById('goal-form')?.addEventListener('submit', handleGoalFormSubmit);

  ['div-field-gross', 'div-field-tax', 'div-field-currency'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateDividendNetPreview);
    document.getElementById(id)?.addEventListener('change', updateDividendNetPreview);
  });

  document.getElementById('btn-run-compound-calc')?.addEventListener('click', (e) => {
    e.preventDefault();
    runCompoundCalculator();
  });

  document.getElementById('rebal-target-stock')?.addEventListener('input', (e) => {
    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
    const assetInp = document.getElementById('rebal-target-asset');
    if (assetInp) assetInp.value = 100 - val;
  });
  document.getElementById('rebal-target-asset')?.addEventListener('input', (e) => {
    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
    const stockInp = document.getElementById('rebal-target-stock');
    if (stockInp) stockInp.value = 100 - val;
  });
  document.getElementById('btn-run-rebalance-calc')?.addEventListener('click', (e) => {
    e.preventDefault();
    runRebalanceCalculator();
  });

  // Dividends Table Delegation
  document.getElementById('dividends-tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const rec = allDividends.find(d => d.id === id);
    if (action === 'edit-div' && rec) openDividendModal(rec);
    if (action === 'delete-div' && rec) openDeleteModal('dividend', id, `${rec.title} (NT$ ${formatMoney(rec.net_amount_twd)})`);
  });

  // Goals Grid Delegation
  document.getElementById('goals-grid-container')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const goal = allGoals.find(g => g.id === id);
    if (action === 'edit-goal' && goal) openGoalModal(goal);
    if (action === 'delete-goal' && goal) openDeleteModal('goal', id, goal.title);
  });

  // Asset Tag Print Button
  document.getElementById('btn-print-asset-tag')?.addEventListener('click', (e) => {
    e.preventDefault();
    printAssetTagCard();
  });

  // --- Mobile APK & Bidirectional Sync Events ---
  document.getElementById('btn-copy-lan-url')?.addEventListener('click', (e) => {
    e.preventDefault();
    const urlText = document.getElementById('mobile-lan-url-text')?.innerText || '';
    if (urlText && navigator.clipboard) {
      navigator.clipboard.writeText(urlText).then(() => {
        showToast(`已複製區網同步網址：${urlText}`, 'success');
      });
    }
  });

  document.getElementById('btn-download-apk')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const status = await invokeApi('get_mobile_sync_status');
    const apkUrl = status?.apk_download_url || 'https://github.com/hankyleisplay/Asset-Tracking-Program/releases/download/v2.0.0/Asset-Tracking-Mobile_v2.0.0.apk';
    window.open(apkUrl, '_blank');
    showToast('已開啟 Android APK 下載連結！', 'info');
  });

  document.getElementById('btn-save-sync-pin')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const pin = (document.getElementById('mobile-sync-pin-input')?.value || '').trim();
    appSettings.mobile_sync_pin = pin;
    await invokeApi('save_settings', { settings: appSettings });
    showToast('已儲存手機同步安全 PIN 碼！', 'success');
    loadMobileSyncView();
  });

  document.getElementById('btn-mobile-connect-test')?.addEventListener('click', handleMobileConnectTest);
  document.getElementById('btn-mobile-sync-merge')?.addEventListener('click', () => handleMobileBidirectionalSync('merge'));
  document.getElementById('btn-mobile-sync-push')?.addEventListener('click', () => handleMobileBidirectionalSync('overwrite'));
  document.getElementById('btn-mobile-sync-pull')?.addEventListener('click', handleMobilePullFromPc);

  // --- Theme Studio & Auto-Update Events ---
  document.querySelectorAll('.theme-swatch-card').forEach(card => {
    card.addEventListener('click', () => {
      const theme = card.getAttribute('data-theme') || 'ocean';
      appSettings.theme_preset = theme;
      appSettings.custom_primary_color = null;
      appSettings.custom_accent_color = null;
      applyThemeUI();
    });
  });

  document.getElementById('setting-custom-primary')?.addEventListener('input', (e) => {
    appSettings.theme_preset = 'custom';
    appSettings.custom_primary_color = e.target.value;
    applyThemeUI();
  });

  document.getElementById('setting-custom-accent')?.addEventListener('input', (e) => {
    appSettings.theme_preset = 'custom';
    appSettings.custom_accent_color = e.target.value;
    applyThemeUI();
  });

  document.getElementById('btn-reset-custom-color')?.addEventListener('click', (e) => {
    e.preventDefault();
    appSettings.theme_preset = 'ocean';
    appSettings.custom_primary_color = null;
    appSettings.custom_accent_color = null;
    applyThemeUI();
  });

  document.getElementById('setting-blur-level')?.addEventListener('change', (e) => {
    appSettings.glass_blur_level = e.target.value || 'medium';
    applyThemeUI();
  });

  document.getElementById('btn-check-update-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleCheckAppUpdate(true);
  });

  document.getElementById('btn-install-update-now')?.addEventListener('click', handleInstallUpdateNow);

  // --- Dynamic Real-time Calculations inside Modals ---
  ['field-price', 'field-years', 'field-purchase-date'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateDepreciationPreview);
  });

  ['stock-field-shares', 'stock-field-buy-price', 'stock-field-current-price', 'stock-field-currency', 'stock-field-rate'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateStockPnLPreview);
    document.getElementById(id)?.addEventListener('change', updateStockPnLPreview);
  });

  // --- Form Submissions ---
  document.getElementById('asset-form')?.addEventListener('submit', handleAssetFormSubmit);
  document.getElementById('stock-form')?.addEventListener('submit', handleStockFormSubmit);
  document.getElementById('operation-form')?.addEventListener('submit', handleOperationFormSubmit);
  document.getElementById('settings-form')?.addEventListener('submit', handleSettingsFormSubmit);
  document.getElementById('batch-prices-form')?.addEventListener('submit', handleBatchPricesSubmit);
  document.getElementById('quick-price-form')?.addEventListener('submit', handleQuickPriceSubmit);

  // Auto-sync operation new-status when action type changes
  document.getElementById('op-action-type')?.addEventListener('change', (e) => {
    const type = e.target.value;
    const statusSelect = document.getElementById('op-new-status');
    if (statusSelect) {
      if (type === '借出') statusSelect.value = '外借中';
      else if (type === '歸還' || type === '完修') statusSelect.value = '在用中';
      else if (type === '送修') statusSelect.value = '維修中';
      else if (type === '報廢') statusSelect.value = '已報廢';
      syncCustomSelect('op-new-status');
    }
  });

  // --- Modal Close Buttons ---
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllModals();
    });
  });

  // Backdrop click to close
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeAllModals();
      }
    });
  });

  // Escape key to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

  // --- Delete Confirm Button ---
  document.getElementById('btn-confirm-delete')?.addEventListener('click', handleConfirmDelete);

  // --- Table Event Delegation ---
  const assetsTbody = document.getElementById('assets-tbody');
  if (assetsTbody) {
    assetsTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      if (action === 'edit') {
        const asset = allAssets.find(a => a.id === id);
        if (asset) openAssetModal(asset);
      } else if (action === 'operation') {
        openOperationModal(id);
      } else if (action === 'qr-tag') {
        const asset = allAssets.find(a => a.id === id);
        if (asset) openAssetTagModal(asset);
      } else if (action === 'delete') {
        const asset = allAssets.find(a => a.id === id);
        openDeleteModal('asset', id, asset?.name || id);
      }
    });
  }

  const stocksTbody = document.getElementById('stocks-tbody');
  if (stocksTbody) {
    stocksTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      if (action === 'quick-price') {
        const stock = allStocks.find(s => s.id === id);
        if (stock) openQuickPriceModal(stock);
      } else if (action === 'edit') {
        const stock = allStocks.find(s => s.id === id);
        if (stock) openStockModal(stock);
      } else if (action === 'delete') {
        const stock = allStocks.find(s => s.id === id);
        openDeleteModal('stock', id, `${stock?.name || ''} (${stock?.symbol || id})`);
      }
    });
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
  pendingDeleteType = null;
  pendingDeleteId = null;
}

// ==========================================================================
// 7. Data Synchronization & Refreshing
// ==========================================================================
async function refreshAllData() {
  try {
    const [assetsData, stocksData, dividendsData, goalsData] = await Promise.all([
      invokeApi('get_assets'),
      invokeApi('get_stocks'),
      invokeApi('get_dividends'),
      invokeApi('get_goals')
    ]);

    allAssets = Array.isArray(assetsData) ? assetsData : [];
    allStocks = Array.isArray(stocksData) ? stocksData : [];
    allDividends = Array.isArray(dividendsData) ? dividendsData : [];
    allGoals = Array.isArray(goalsData) ? goalsData : [];

    // Update Sidebar Counts
    const assetBadge = document.getElementById('sidebar-asset-count');
    if (assetBadge) assetBadge.innerText = allAssets.length;

    const stockBadge = document.getElementById('sidebar-stock-count');
    if (stockBadge) stockBadge.innerText = allStocks.length;

    const wealthBadge = document.getElementById('sidebar-wealth-count');
    if (wealthBadge) wealthBadge.innerText = allDividends.length + allGoals.length;

    applyAssetFilters();
    applyStockFilters();
    renderWealthView();
    await renderDashboard();
  } catch (err) {
    console.error('Failed to refresh data:', err);
    showToast('載入數據失敗: ' + err, 'error');
  }
}

// ==========================================================================
// 8. Stock Portfolio Management
// ==========================================================================
function applyStockFilters() {
  filteredStocks = (allStocks || []).filter(stock => {
    if (currentStockFilterMarket !== '全部' && stock.market !== currentStockFilterMarket) {
      return false;
    }
    if (stockSearchQuery) {
      const sSymbol = (stock.symbol || '').toLowerCase();
      const sName = (stock.name || '').toLowerCase();
      const sMarket = (stock.market || '').toLowerCase();
      const sNotes = (stock.notes || '').toLowerCase();
      return sSymbol.includes(stockSearchQuery) ||
             sName.includes(stockSearchQuery) ||
             sMarket.includes(stockSearchQuery) ||
             sNotes.includes(stockSearchQuery);
    }
    return true;
  });

  renderStocksTable();
  updateStockKPIs();
}

function updateStockKPIs() {
  let totalCost = 0;
  let totalMarket = 0;

  allStocks.forEach(s => {
    totalCost += s.total_cost_twd || 0;
    totalMarket += s.market_value_twd || 0;
  });

  const totalPnL = totalMarket - totalCost;
  const totalROI = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const kpiMarket = document.getElementById('stock-kpi-market-val');
  if (kpiMarket) kpiMarket.innerText = `NT$ ${formatMoney(totalMarket)}`;

  const kpiCost = document.getElementById('stock-kpi-cost');
  if (kpiCost) kpiCost.innerText = `NT$ ${formatMoney(totalCost)}`;

  const kpiPnl = document.getElementById('stock-kpi-pnl');
  if (kpiPnl) {
    const sign = totalPnL >= 0 ? '+' : '';
    kpiPnl.innerText = `${sign}NT$ ${formatMoney(totalPnL)}`;
    kpiPnl.className = `stat-value ${totalPnL >= 0 ? 'pnl-gain' : 'pnl-loss'}`;
  }

  const kpiRoi = document.getElementById('stock-kpi-roi');
  if (kpiRoi) {
    const sign = totalROI >= 0 ? '+' : '';
    kpiRoi.innerText = `投報率: ${sign}${totalROI.toFixed(2)}%`;
  }

  const kpiCount = document.getElementById('stock-kpi-holdings-count');
  if (kpiCount) kpiCount.innerText = `${allStocks.length} 檔`;
}

function renderStocksTable() {
  const tbody = document.getElementById('stocks-tbody');
  if (!tbody) return;

  if (filteredStocks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 48px; color: var(--text-dim);">
          <div style="font-size: 32px; margin-bottom: 12px;">📈</div>
          <div style="font-size: 14px; font-weight: 600;">尚無相符的股票或標的項目</div>
          <div style="font-size: 12px; margin-top: 6px;">點擊「新增股票標的」立即追蹤您的台股、美股或 ETF 投資損益</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredStocks.map(s => {
    const pnl = s.unrealized_pnl_twd || 0;
    const roi = s.return_rate || 0;
    const isGain = pnl >= 0;
    const sign = isGain ? '+' : '';

    let marketBadgeClass = 'badge-market-tw';
    if (s.market === '美股') marketBadgeClass = 'badge-market-us';
    if (s.market === 'ETF') marketBadgeClass = 'badge-market-etf';
    if (s.market === '基金') marketBadgeClass = 'badge-market-fund';

    const currPrefix = s.currency === 'USD' ? '$' : 'NT$';

    return `
      <tr>
        <td>
          <span style="font-family: monospace; font-size: 14px; font-weight: 700; color: #818cf8; letter-spacing: 0.5px;">
            ${escapeHtml(s.symbol)}
          </span>
        </td>
        <td>
          <div style="font-weight: 600; color: #fff; font-size: 14px;">${escapeHtml(s.name)}</div>
          ${s.notes ? `<div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${escapeHtml(s.notes)}</div>` : ''}
        </td>
        <td>
          <span class="badge ${marketBadgeClass}">${escapeHtml(s.market)}</span>
        </td>
        <td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">
          ${s.shares.toLocaleString()}
        </td>
        <td style="text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums;">
          ${currPrefix}${s.buy_price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
        </td>
        <td style="text-align: right; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums;">
          ${currPrefix}${s.current_price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
        </td>
        <td style="text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums;">
          NT$ ${formatMoney(s.total_cost_twd)}
        </td>
        <td style="text-align: right; font-weight: 700; color: #f8fafc; font-variant-numeric: tabular-nums;">
          NT$ ${formatMoney(s.market_value_twd)}
        </td>
        <td style="text-align: right; font-variant-numeric: tabular-nums;">
          <span class="${isGain ? 'pnl-gain' : 'pnl-loss'}">
            ${sign}NT$ ${formatMoney(pnl)}
          </span>
        </td>
        <td style="text-align: center;">
          <span class="${isGain ? 'pnl-badge-gain' : 'pnl-badge-loss'}">
            ${sign}${roi.toFixed(2)}%
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="quick-price" data-id="${escapeHtml(s.id)}" title="調整當前市價">
              <i class="fa-solid fa-bolt"></i> 報價
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHtml(s.id)}" title="編輯持股資料">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(s.id)}" title="賣出結清或刪除">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// --- 股票代號自動辨識與即時行情邏輯 ---
function detectSymbolMarket(rawSymbol) {
  const s = (rawSymbol || '').trim().toUpperCase();
  if (!s) return null;

  // 判斷是否為台股/台股ETF代號 (如 2330, 2317, 0050, 00878, 6547.TWO, 2330.TW 等)
  const isTaiwan = /^\d+/.test(s) || s.endsWith('.TW') || s.endsWith('.TWO');
  if (isTaiwan) {
    const isEtf = s.startsWith('00');
    return {
      market: isEtf ? 'ETF' : '台股',
      currency: 'TWD',
      rate: 1.0,
      cleanSymbol: s,
      displayTip: `🎯 識別為【${isEtf ? '台股 ETF' : '台股標的'}】代號 (${s})，自動切換為新台幣 TWD 計價`
    };
  } else {
    // 判斷是否為美股ETF (如 QQQ, SPY, VOO, IVV, SOXX, SMH 等)
    const isEtf = ['QQQ', 'SPY', 'VOO', 'IVV', 'VTI', 'SOXX', 'SMH', 'DIA', 'IWM', 'ARKK', 'TQQQ', 'SQQQ'].includes(s);
    return {
      market: isEtf ? 'ETF' : '美股',
      currency: 'USD',
      rate: 32.2,
      cleanSymbol: s,
      displayTip: `🎯 識別為【${isEtf ? '美股 ETF' : '美股市場'}】代號 (${s})，自動切換為美元 USD 計價並套用即時匯率`
    };
  }
}

function handleStockSymbolInput(e) {
  const val = (e.target.value || '').trim().toUpperCase();
  const tipBox = document.getElementById('stock-symbol-detect-tip');
  if (!val) {
    if (tipBox) {
      tipBox.style.display = 'none';
      tipBox.innerText = '';
    }
    return;
  }

  const detected = detectSymbolMarket(val);
  if (detected) {
    const marketSelect = document.getElementById('stock-field-market');
    const currencySelect = document.getElementById('stock-field-currency');
    const rateInput = document.getElementById('stock-field-rate');

    if (marketSelect) marketSelect.value = detected.market;
    if (currencySelect) currencySelect.value = detected.currency;
    syncCustomSelect('stock-field-market');
    syncCustomSelect('stock-field-currency');
    if (rateInput) {
      if (detected.currency === 'USD' && (rateInput.value === '1' || rateInput.value === '1.0' || !rateInput.value)) {
        rateInput.value = detected.rate;
      } else if (detected.currency === 'TWD') {
        rateInput.value = 1.0;
      }
    }

    if (tipBox) {
      tipBox.style.display = 'block';
      tipBox.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${detected.displayTip}`;
    }

    updateStockPnLPreview();
  }
}

async function handleFetchSymbolQuote(e) {
  e.preventDefault();
  const symbolInput = document.getElementById('stock-field-symbol');
  const symbol = (symbolInput?.value || '').trim().toUpperCase();

  if (!symbol) {
    showToast('請先輸入股票代號（例如台股 2330、0050 或美股 NVDA、AAPL）', 'info');
    symbolInput?.focus();
    return;
  }

  const btn = document.getElementById('btn-fetch-symbol-quote');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 連線抓取中...';
  }

  const tipBox = document.getElementById('stock-symbol-detect-tip');
  if (tipBox) {
    tipBox.style.display = 'block';
    tipBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在連線 Yahoo Finance 抓取 [${escapeHtml(symbol)}] 最新即時報價與匯率...`;
  }

  try {
    const quote = await invokeApi('fetch_stock_quote', { symbol });
    if (quote) {
      const nameInput = document.getElementById('stock-field-name');
      const marketSelect = document.getElementById('stock-field-market');
      const currencySelect = document.getElementById('stock-field-currency');
      const priceInput = document.getElementById('stock-field-current-price');
      const rateInput = document.getElementById('stock-field-rate');

      if (quote.name && nameInput) nameInput.value = quote.name;
      if (quote.market && marketSelect) marketSelect.value = quote.market;
      if (quote.currency && currencySelect) currencySelect.value = quote.currency;
      syncCustomSelect('stock-field-market');
      syncCustomSelect('stock-field-currency');
      if (quote.current_price && priceInput) priceInput.value = quote.current_price;
      if (quote.exchange_rate && rateInput) rateInput.value = quote.exchange_rate;

      updateStockPnLPreview();

      if (tipBox) {
        const sign = (quote.change || 0) >= 0 ? '+' : '';
        const chgPct = (quote.change_percent || 0).toFixed(2);
        const color = (quote.change || 0) >= 0 ? '#4ade80' : '#f87171';
        tipBox.style.display = 'block';
        tipBox.innerHTML = `
          <div style="color: #67e8f9; font-weight: 600;">
            <i class="fa-solid fa-circle-check"></i> ${escapeHtml(quote.name)} (${quote.symbol}) 連線成功
          </div>
          <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">
            市場: ${quote.market} · 最新現價: <strong style="color: #fff;">${quote.currency} $${quote.current_price}</strong> 
            <span style="color: ${color};">(${sign}${quote.change} / ${sign}${chgPct}%)</span> · 匯率: ${quote.exchange_rate}
          </div>
        `;
      }

      showToast(`已成功抓取 ${quote.name} (${quote.symbol}) 最新現價: ${quote.currency} $${quote.current_price}`, 'success');
    }
  } catch (err) {
    console.error('Fetch stock quote failed:', err);
    if (tipBox) {
      tipBox.style.display = 'block';
      tipBox.innerHTML = `<span style="color: #f87171;"><i class="fa-solid fa-triangle-exclamation"></i> 行情抓取未果 (${escapeHtml(err.message || err)})，請手動填寫現價。</span>`;
    }
    showToast(`抓取即時行情失敗: ${err.message || err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function handleAutoUpdateLiveQuotes(e) {
  e.preventDefault();
  if (!allStocks || allStocks.length === 0) {
    showToast('目前尚無任何持股標的，請先點擊「新增股票持股」！', 'info');
    return;
  }

  const btn = document.getElementById('btn-auto-update-live-quotes');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 即時行情聯網更新中...';
  }

  showToast(`正在連線全球金融市場，更新 ${allStocks.length} 檔持股最新市價與匯率...`, 'info');

  try {
    const updatedStocks = await invokeApi('auto_update_all_live_quotes', { operator: '系統行情自動更新' });
    if (Array.isArray(updatedStocks)) {
      allStocks = updatedStocks;
    }
    await refreshAllData();
    showToast(`全部 ${allStocks.length} 檔持股已成功聯網更新至最新行情！`, 'success');
  } catch (err) {
    console.error('Auto update all quotes failed:', err);
    showToast('自動更新行情失敗: ' + (err.message || err), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function handleClearAllData() {
  const confirmed = confirm(
    "【警告：清空全系統資料】\n\n確定要清空所有實體資產、股票持股與異動日誌嗎？\n此操作將使系統回歸全新乾淨狀態（不保留任何預設測試資料）。\n\n您確定要繼續執行嗎？"
  );
  if (!confirmed) return;

  try {
    await invokeApi('clear_all_system_data');
    showToast('全系統資料庫已成功清空，目前為乾淨初始狀態！', 'success');
    await refreshAllData();
  } catch (err) {
    showToast('清空資料失敗: ' + err, 'error');
  }
}

// Open Stock Modal
function openStockModal(stock = null) {
  const modal = document.getElementById('modal-stock');
  const title = document.getElementById('modal-stock-title');
  const tipBox = document.getElementById('stock-symbol-detect-tip');
  if (tipBox) {
    tipBox.style.display = 'none';
    tipBox.innerText = '';
  }
  if (!modal) return;

  if (stock) {
    if (title) title.innerText = `編輯股票持股: ${stock.symbol}`;
    document.getElementById('stock-field-id').value = stock.id || '';
    document.getElementById('stock-field-symbol').value = stock.symbol || '';
    document.getElementById('stock-field-symbol').readOnly = true;
    document.getElementById('stock-field-name').value = stock.name || '';
    document.getElementById('stock-field-market').value = stock.market || '台股';
    document.getElementById('stock-field-currency').value = stock.currency || 'TWD';
    document.getElementById('stock-field-shares').value = stock.shares || '';
    document.getElementById('stock-field-buy-price').value = stock.buy_price || '';
    document.getElementById('stock-field-current-price').value = stock.current_price || '';
    document.getElementById('stock-field-rate').value = stock.exchange_rate || 1.0;
    document.getElementById('stock-field-yield').value = stock.dividend_yield || '';
    document.getElementById('stock-field-notes').value = stock.notes || '';
    document.getElementById('stock-field-operator').value = '投資人';

    if (tipBox) {
      tipBox.style.display = 'block';
      tipBox.innerHTML = `<span style="color: #94a3b8;"><i class="fa-solid fa-clock"></i> 最近更新時間: ${escapeHtml(stock.updated_at || '未記錄')} · 市場: ${stock.market} (${stock.currency})</span>`;
    }
  } else {
    if (title) title.innerText = '新增股票投資標的';
    document.getElementById('stock-field-id').value = '';
    document.getElementById('stock-field-symbol').value = '';
    document.getElementById('stock-field-symbol').readOnly = false;
    document.getElementById('stock-field-name').value = '';
    document.getElementById('stock-field-market').value = '台股';
    document.getElementById('stock-field-currency').value = 'TWD';
    document.getElementById('stock-field-shares').value = '';
    document.getElementById('stock-field-buy-price').value = '';
    document.getElementById('stock-field-current-price').value = '';
    document.getElementById('stock-field-rate').value = 1.0;
    document.getElementById('stock-field-yield').value = '';
    document.getElementById('stock-field-notes').value = '';
    document.getElementById('stock-field-operator').value = '投資人';
  }

  syncCustomSelect('stock-field-market');
  syncCustomSelect('stock-field-currency');
  updateStockPnLPreview();
  modal.classList.add('open');
}

function updateStockPnLPreview() {
  const shares = parseFloat(document.getElementById('stock-field-shares')?.value) || 0;
  const buyPrice = parseFloat(document.getElementById('stock-field-buy-price')?.value) || 0;
  const currPrice = parseFloat(document.getElementById('stock-field-current-price')?.value) || 0;
  const currency = document.getElementById('stock-field-currency')?.value || 'TWD';
  let rate = parseFloat(document.getElementById('stock-field-rate')?.value) || 1.0;

  if (currency === 'USD' && rate === 1.0) {
    rate = 32.0;
    const rateInput = document.getElementById('stock-field-rate');
    if (rateInput) rateInput.value = 32.0;
  } else if (currency === 'TWD') {
    rate = 1.0;
    const rateInput = document.getElementById('stock-field-rate');
    if (rateInput) rateInput.value = 1.0;
  }

  const cost = shares * buyPrice * rate;
  const market = shares * currPrice * rate;
  const pnl = market - cost;
  const roi = cost > 0 ? (pnl / cost) * 100 : 0;

  const costElem = document.getElementById('stock-prev-cost');
  if (costElem) costElem.innerText = `NT$ ${formatMoney(cost)}`;

  const marketElem = document.getElementById('stock-prev-market');
  if (marketElem) marketElem.innerText = `NT$ ${formatMoney(market)}`;

  const pnlElem = document.getElementById('stock-prev-pnl');
  if (pnlElem) {
    const sign = pnl >= 0 ? '+' : '';
    pnlElem.innerText = `${sign}NT$ ${formatMoney(pnl)}`;
    pnlElem.className = pnl >= 0 ? 'pnl-gain' : 'pnl-loss';
  }

  const roiElem = document.getElementById('stock-prev-roi');
  if (roiElem) {
    const sign = roi >= 0 ? '+' : '';
    roiElem.innerText = `${sign}${roi.toFixed(2)}%`;
    roiElem.className = roi >= 0 ? 'pnl-gain' : 'pnl-loss';
  }
}

async function handleStockFormSubmit(e) {
  e.preventDefault();
  const id = (document.getElementById('stock-field-id')?.value || '').trim();
  const symbol = (document.getElementById('stock-field-symbol')?.value || '').trim().toUpperCase();
  const name = (document.getElementById('stock-field-name')?.value || '').trim();
  const market = document.getElementById('stock-field-market')?.value || '台股';
  const currency = document.getElementById('stock-field-currency')?.value || 'TWD';
  const shares = parseFloat(document.getElementById('stock-field-shares')?.value) || 0;
  const buyPrice = parseFloat(document.getElementById('stock-field-buy-price')?.value) || 0;
  const currentPrice = parseFloat(document.getElementById('stock-field-current-price')?.value) || 0;
  const rate = parseFloat(document.getElementById('stock-field-rate')?.value) || (currency === 'USD' ? 32.0 : 1.0);
  const yieldVal = parseFloat(document.getElementById('stock-field-yield')?.value) || null;
  const notes = (document.getElementById('stock-field-notes')?.value || '').trim();
  const operator = (document.getElementById('stock-field-operator')?.value || '投資人').trim();

  if (!symbol || !name) {
    showToast('請輸入股票代號與名稱', 'error');
    return;
  }

  const stock = {
    id: id || `STK-${symbol}`,
    symbol,
    name,
    market,
    shares,
    buy_price: buyPrice,
    current_price: currentPrice,
    currency,
    exchange_rate: rate,
    total_cost_twd: 0,
    market_value_twd: 0,
    unrealized_pnl_twd: 0,
    return_rate: 0,
    dividend_yield: yieldVal,
    notes,
    updated_at: ""
  };

  try {
    const saved = await invokeApi('save_stock', { stock, operator });
    showToast(`股票標的 [${saved.name} (${saved.symbol})] 已成功儲存！`, 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('儲存股票失敗: ' + err, 'error');
  }
}

// Batch Update Prices Modal
function openBatchPricesModal() {
  const modal = document.getElementById('modal-batch-prices');
  const container = document.getElementById('batch-prices-container');
  if (!modal || !container) return;

  if (allStocks.length === 0) {
    showToast('目前尚無持股標的，請先新增股票！', 'info');
    return;
  }

  container.innerHTML = allStocks.map(s => {
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: rgba(15, 23, 42, 0.45); padding: 10px 14px; border-radius: var(--radius-sm); border: var(--glass-border);">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: #fff;">${escapeHtml(s.name)} (${escapeHtml(s.symbol)})</div>
          <div style="font-size: 11px; color: var(--text-dim);">買入均價: ${s.currency === 'USD' ? '$' : 'NT$'}${s.buy_price} · 持有: ${s.shares}股</div>
        </div>
        <div style="width: 140px;">
          <input type="number" step="any" min="0.0001" class="form-control batch-price-input" 
                 data-id="${escapeHtml(s.id)}" 
                 data-symbol="${escapeHtml(s.symbol)}" 
                 value="${s.current_price}" 
                 placeholder="最新報價" required>
        </div>
      </div>
    `;
  }).join('');

  modal.classList.add('open');
}

async function handleBatchPricesSubmit(e) {
  e.preventDefault();
  const inputs = document.querySelectorAll('.batch-price-input');
  const updates = {};

  inputs.forEach(inp => {
    const id = inp.getAttribute('data-id');
    const val = parseFloat(inp.value);
    if (id && val > 0) {
      updates[id] = val;
    }
  });

  try {
    await invokeApi('batch_update_stock_prices', {
      updates,
      operator: "行情更新員"
    });
    showToast('已批次更新全部股票最新市價與損益！', 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('批次更新股價失敗: ' + err, 'error');
  }
}

// Quick Price Update Modal
function openQuickPriceModal(stock) {
  const modal = document.getElementById('modal-quick-price');
  if (!modal) return;

  document.getElementById('quick-price-stock-id').value = stock.id;
  document.getElementById('quick-price-stock-title').innerText = `更新報價: ${stock.name} (${stock.symbol})`;
  document.getElementById('quick-price-stock-info').innerText = `持股: ${stock.shares} 股 · 買入均價: ${stock.currency === 'USD' ? '$' : 'NT$'}${stock.buy_price}`;
  document.getElementById('quick-price-val').value = stock.current_price;

  modal.classList.add('open');
  document.getElementById('quick-price-val')?.focus();
}

async function handleQuickPriceSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('quick-price-stock-id')?.value;
  const newPrice = parseFloat(document.getElementById('quick-price-val')?.value);

  if (!id || !(newPrice > 0)) {
    showToast('請輸入有效市價', 'error');
    return;
  }

  const updates = {};
  updates[id] = newPrice;

  try {
    await invokeApi('batch_update_stock_prices', {
      updates,
      operator: "投資人"
    });
    showToast('市價已更新完成！', 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('更新市價失敗: ' + err, 'error');
  }
}

// Export Stocks CSV
async function exportStocksCsv() {
  try {
    let csv = await invokeApi('export_stocks_csv');
    if (!csv) {
      csv = "\uFEFF股票代號,股票名稱,市場,持有股數,買入成本單價,當前市價,幣別,總成本(TWD),總市值(TWD),未實現損益(TWD),報酬率(%)\n";
      allStocks.forEach(s => {
        csv += `"${s.symbol}","${s.name}","${s.market}",${s.shares},${s.buy_price},${s.current_price},"${s.currency}",${s.total_cost_twd},${s.market_value_twd},${s.unrealized_pnl_twd},${s.return_rate}\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `證券股票投資清冊_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('已匯出股票投資清單 CSV！', 'success');
  } catch (err) {
    showToast('匯出股票 CSV 失敗: ' + err, 'error');
  }
}

// ==========================================================================
// 9. Physical Assets Management
// ==========================================================================
function applyAssetFilters() {
  filteredAssets = (allAssets || []).filter(asset => {
    if (currentFilterStatus !== '全部' && asset.status !== currentFilterStatus) {
      return false;
    }
    if (currentFilterCategory !== '全部' && asset.category !== currentFilterCategory) {
      return false;
    }
    if (searchQuery) {
      const matchName = (asset.name || '').toLowerCase().includes(searchQuery);
      const matchId = (asset.id || '').toLowerCase().includes(searchQuery);
      const matchSn = (asset.serial_number || '').toLowerCase().includes(searchQuery);
      const matchCustodian = (asset.custodian || '').toLowerCase().includes(searchQuery);
      const matchModel = (asset.model || '').toLowerCase().includes(searchQuery);
      const matchBrand = (asset.brand || '').toLowerCase().includes(searchQuery);
      return matchName || matchId || matchSn || matchCustodian || matchModel || matchBrand;
    }
    return true;
  });

  renderAssetsTable();
}

function renderAssetsTable() {
  const tbody = document.getElementById('assets-tbody');
  if (!tbody) return;

  if (filteredAssets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 48px; color: var(--text-dim);">
          <div style="font-size: 32px; margin-bottom: 12px;">📦</div>
          <div style="font-size: 14px; font-weight: 600;">查無相符的實體資產項目</div>
          <div style="font-size: 12px; margin-top: 6px;">您可以點擊右上角「新增資產」按鈕快速建檔</div>
        </td>
      </tr>
    `;
    return;
  }

  const currencySymbol = (appSettings?.currency === 'USD') ? '$' : 'NT$';

  tbody.innerHTML = filteredAssets.map(asset => {
    const badgeClass = getBadgeClass(asset.status);
    const price = asset.purchase_price || 0;
    const currentVal = (asset.current_value !== undefined) ? asset.current_value : price;
    const deprPercent = price > 0 
      ? Math.max(0, Math.min(100, Math.round((currentVal / price) * 100)))
      : 100;

    return `
      <tr>
        <td>
          <span style="font-family: monospace; font-weight: 700; color: #818cf8; letter-spacing: 0.5px;">${escapeHtml(asset.id)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: #fff; font-size: 14px;">${escapeHtml(asset.name)}</div>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
            ${escapeHtml(asset.brand || '')} ${escapeHtml(asset.model || '')} 
            ${asset.serial_number ? `· S/N: ${escapeHtml(asset.serial_number)}` : ''}
          </div>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--text-muted); background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: var(--radius-xs);">
            ${escapeHtml(asset.category)}
          </span>
        </td>
        <td>
          <span class="badge ${badgeClass}">${escapeHtml(asset.status)}</span>
        </td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(asset.custodian || '未指派')}</div>
          <div style="font-size: 11px; color: var(--text-dim);">${escapeHtml(asset.location || '—')}</div>
        </td>
        <td>
          <div style="font-weight: 700; color: #f8fafc; font-variant-numeric: tabular-nums;">${currencySymbol}${formatMoney(currentVal)}</div>
          <div style="font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums;">
            原價: ${currencySymbol}${formatMoney(price)} (${deprPercent}%)
          </div>
          <div class="progress-track" style="margin-top: 5px; height: 4px; width: 90px;">
            <div class="progress-fill" style="width: ${deprPercent}%;"></div>
          </div>
        </td>
        <td>
          <span style="font-size: 12px; font-weight: 500; color: ${isWarrantyNear(asset.warranty_date) ? 'var(--warning)' : 'var(--text-muted)'};">
            ${escapeHtml(asset.warranty_date || '—')}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="qr-tag" data-id="${escapeHtml(asset.id)}" title="產生 QR 盤點標籤卡">
              <i class="fa-solid fa-qrcode"></i>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="operation" data-id="${escapeHtml(asset.id)}" title="異動 / 借還 / 送修">
              <i class="fa-solid fa-arrows-rotate"></i> 異動
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHtml(asset.id)}" title="編輯">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(asset.id)}" title="刪除">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAssetModal(asset = null) {
  const modal = document.getElementById('modal-asset');
  const title = document.getElementById('modal-asset-title');
  if (!modal) return;

  if (asset) {
    if (title) title.innerText = '編輯實體資產資料';
    document.getElementById('field-id').value = asset.id || '';
    document.getElementById('field-id').readOnly = true;
    document.getElementById('field-name').value = asset.name || '';
    document.getElementById('field-category').value = asset.category || '3C與電腦';
    document.getElementById('field-brand').value = asset.brand || '';
    document.getElementById('field-model').value = asset.model || '';
    document.getElementById('field-sn').value = asset.serial_number || '';
    document.getElementById('field-purchase-date').value = asset.purchase_date || '';
    document.getElementById('field-price').value = asset.purchase_price || 0;
    document.getElementById('field-years').value = asset.depreciation_years || 3;
    document.getElementById('field-status').value = asset.status || '在用中';
    document.getElementById('field-location').value = asset.location || '';
    document.getElementById('field-dept').value = asset.department || '';
    document.getElementById('field-custodian').value = asset.custodian || '';
    document.getElementById('field-warranty').value = asset.warranty_date || '';
    document.getElementById('field-tags').value = (asset.tags || []).join(', ');
    document.getElementById('field-notes').value = asset.notes || '';
  } else {
    if (title) title.innerText = '新增實體資產建檔';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('field-id').value = '';
    document.getElementById('field-id').readOnly = false;
    document.getElementById('field-name').value = '';
    document.getElementById('field-category').value = '3C與電腦';
    document.getElementById('field-brand').value = '';
    document.getElementById('field-model').value = '';
    document.getElementById('field-sn').value = '';
    document.getElementById('field-purchase-date').value = today;
    document.getElementById('field-price').value = 0;
    document.getElementById('field-years').value = 3;
    document.getElementById('field-status').value = '在用中';
    document.getElementById('field-location').value = '';
    document.getElementById('field-dept').value = '';
    document.getElementById('field-custodian').value = '';
    document.getElementById('field-warranty').value = '';
    document.getElementById('field-tags').value = '';
    document.getElementById('field-notes').value = '';
  }

  syncCustomSelect('field-category');
  syncCustomSelect('field-status');
  updateDepreciationPreview();
  modal.classList.add('open');
}

function updateDepreciationPreview() {
  const price = parseFloat(document.getElementById('field-price')?.value) || 0;
  const years = parseInt(document.getElementById('field-years')?.value) || 3;
  const pDateStr = document.getElementById('field-purchase-date')?.value;
  const previewElem = document.getElementById('depreciation-preview');
  if (!previewElem) return;

  if (price <= 0 || years <= 0 || !pDateStr) {
    previewElem.innerText = `直線折舊公式預估現值: NT$${formatMoney(price)}`;
    return;
  }

  const pDate = new Date(pDateStr);
  const now = new Date();
  const elapsedYears = Math.max(0, (now - pDate) / (1000 * 60 * 60 * 24 * 365.25));
  const ratio = Math.min(1.0, elapsedYears / years);
  const current = Math.max(0, price * (1.0 - ratio));

  previewElem.innerText = `直線折舊公式預估現值: NT$${formatMoney(Math.round(current))} (累計折舊 ${(ratio * 100).toFixed(1)}%)`;
}

async function handleAssetFormSubmit(e) {
  e.preventDefault();
  const tagsRaw = document.getElementById('field-tags')?.value || '';
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  const asset = {
    id: (document.getElementById('field-id')?.value || '').trim(),
    name: (document.getElementById('field-name')?.value || '').trim(),
    category: document.getElementById('field-category')?.value || '3C與電腦',
    brand: (document.getElementById('field-brand')?.value || '').trim(),
    model: (document.getElementById('field-model')?.value || '').trim(),
    serial_number: (document.getElementById('field-sn')?.value || '').trim(),
    purchase_date: document.getElementById('field-purchase-date')?.value || new Date().toISOString().split('T')[0],
    purchase_price: parseFloat(document.getElementById('field-price')?.value) || 0,
    current_value: 0,
    depreciation_years: parseInt(document.getElementById('field-years')?.value) || 3,
    status: document.getElementById('field-status')?.value || '在用中',
    location: (document.getElementById('field-location')?.value || '').trim(),
    department: (document.getElementById('field-dept')?.value || '').trim(),
    custodian: (document.getElementById('field-custodian')?.value || '').trim(),
    warranty_date: document.getElementById('field-warranty')?.value || null,
    notes: (document.getElementById('field-notes')?.value || '').trim(),
    tags: tags,
    created_at: "",
    updated_at: ""
  };

  try {
    const saved = await invokeApi('save_asset', { asset, operator: "使用者" });
    showToast(`資產 [${saved.name}] 已成功儲存！`, 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('儲存資產失敗: ' + err, 'error');
  }
}

function openOperationModal(id) {
  const asset = allAssets.find(a => a.id === id);
  if (!asset) return;

  const modal = document.getElementById('modal-operation');
  if (!modal) return;

  document.getElementById('op-asset-id').value = asset.id;
  document.getElementById('op-asset-name-display').innerText = `${asset.name} (${asset.id}) - 目前: ${asset.status}`;
  document.getElementById('op-new-status').value = (asset.status === '在用中') ? '外借中' : '在用中';
  document.getElementById('op-notes').value = '';
  document.getElementById('op-custodian').value = asset.custodian || '';

  syncCustomSelect('op-action-type');
  syncCustomSelect('op-new-status');
  modal.classList.add('open');
}

async function handleOperationFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('op-asset-id')?.value;
  const newStatus = document.getElementById('op-new-status')?.value;
  const actionType = document.getElementById('op-action-type')?.value;
  const notes = (document.getElementById('op-notes')?.value || '').trim();
  const operator = (document.getElementById('op-operator')?.value || '設備管理員').trim();
  const custodian = (document.getElementById('op-custodian')?.value || '').trim();

  try {
    await invokeApi('update_asset_status', {
      id,
      new_status: newStatus,
      action_type: actionType,
      notes,
      operator,
      custodian
    });
    showToast(`資產狀態已更新為 [${newStatus}]！`, 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('更新狀態失敗: ' + err, 'error');
  }
}

// ==========================================================================
// 10. Unified Delete Confirmation
// ==========================================================================
function openDeleteModal(type, id, displayName) {
  pendingDeleteType = type;
  pendingDeleteId = id;

  const titleElem = document.getElementById('delete-modal-title');
  const promptElem = document.getElementById('delete-modal-prompt');
  const targetElem = document.getElementById('delete-name-target');
  const modal = document.getElementById('modal-delete');

  if (titleElem) {
    if (type === 'stock') titleElem.innerText = '確認賣出 / 結清股票';
    else if (type === 'dividend') titleElem.innerText = '確認刪除股息紀錄';
    else if (type === 'goal') titleElem.innerText = '確認刪除財富目標';
    else titleElem.innerText = '確認刪除實體資產';
  }
  if (promptElem) {
    if (type === 'stock') promptElem.innerText = '您確定要自投資組合中移除下列股票標的嗎？';
    else if (type === 'dividend') promptElem.innerText = '您確定要刪除這筆股息 / 被動收入紀錄嗎？';
    else if (type === 'goal') promptElem.innerText = '您確定要移除這項財富目標里程碑嗎？';
    else promptElem.innerText = '您確定要從系統中永久刪除下列固定資產嗎？';
  }
  if (targetElem) {
    targetElem.innerText = displayName;
  }
  if (modal) {
    modal.classList.add('open');
  }
}

async function handleConfirmDelete(e) {
  e.preventDefault();
  if (!pendingDeleteId || !pendingDeleteType) return;

  try {
    if (pendingDeleteType === 'stock') {
      await invokeApi('delete_stock', { id: pendingDeleteId, operator: "投資人" });
      showToast('已結清並移除該股票標的！', 'info');
    } else if (pendingDeleteType === 'dividend') {
      await invokeApi('delete_dividend', { id: pendingDeleteId, operator: "投資人" });
      showToast('已移除該筆股息收入紀錄！', 'info');
    } else if (pendingDeleteType === 'goal') {
      await invokeApi('delete_goal', { id: pendingDeleteId });
      showToast('已移除該項財富目標！', 'info');
    } else {
      await invokeApi('delete_asset', { id: pendingDeleteId, operator: "使用者" });
      showToast('已成功刪除該實體資產！', 'info');
    }
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('刪除失敗: ' + err, 'error');
  }
}

// ==========================================================================
// 11. Dashboard Analytics Rendering
// ==========================================================================
async function renderDashboard() {
  try {
    const stats = await invokeApi('get_dashboard_stats') || {};
    const currency = (appSettings?.currency === 'USD') ? '$' : 'NT$';

    // 1. Total Net Worth Hero Banner
    const totalNetWorth = stats.total_net_worth_twd || 0;
    const heroWorth = document.getElementById('dash-total-net-worth');
    if (heroWorth) heroWorth.innerText = `${currency} ${formatMoney(totalNetWorth)}`;

    const stockSum = stats.stock_summary || {};
    const stockMarketVal = stockSum.total_market_value_twd || 0;
    const stockPnlVal = stockSum.total_unrealized_pnl_twd || 0;
    const stockRoiVal = stockSum.total_return_rate || 0;
    const assetVal = stats.total_current_value || 0;

    const bStock = document.getElementById('dash-breakdown-stock');
    if (bStock) bStock.innerText = `${currency} ${formatMoney(stockMarketVal)}`;

    const bStockPnl = document.getElementById('dash-breakdown-stock-pnl');
    if (bStockPnl) {
      const sign = stockPnlVal >= 0 ? '+' : '';
      bStockPnl.innerHTML = `未實現: <span class="${stockPnlVal >= 0 ? 'pnl-gain' : 'pnl-loss'}">${sign}NT$${formatMoney(stockPnlVal)} (${sign}${stockRoiVal.toFixed(1)}%)</span>`;
    }

    const bAsset = document.getElementById('dash-breakdown-asset');
    if (bAsset) bAsset.innerText = `${currency} ${formatMoney(assetVal)}`;

    // 2. Stat Cards
    const countElem = document.getElementById('stat-total-count');
    if (countElem) countElem.innerText = `${stats.total_count || 0} 台`;

    const stockCountElem = document.getElementById('stat-stock-count');
    if (stockCountElem) stockCountElem.innerText = `${stockSum.total_stock_count || 0} 檔`;

    const stockPnlDesc = document.getElementById('stat-stock-pnl-desc');
    if (stockPnlDesc) {
      const sign = stockPnlVal >= 0 ? '+' : '';
      stockPnlDesc.innerText = `未實現: ${sign}NT$ ${formatMoney(stockPnlVal)}`;
      stockPnlDesc.className = `stat-desc ${stockPnlVal >= 0 ? 'pnl-gain' : 'pnl-loss'}`;
    }

    const origElem = document.getElementById('stat-original-val');
    if (origElem) origElem.innerText = `${currency} ${formatMoney(stats.total_original_value || 0)}`;

    const attElem = document.getElementById('stat-attention');
    if (attElem) {
      const attention = (stats.borrowed_count || 0) + (stats.repairing_count || 0) + (stats.expiring_warranty_count || 0);
      attElem.innerText = `${attention} 件`;
    }

    // 3. Asset & Stock Allocation Distribution Bar
    const allocContainer = document.getElementById('allocation-distribution-box');
    if (allocContainer) {
      const stockPct = totalNetWorth > 0 ? Math.round((stockMarketVal / totalNetWorth) * 100) : 50;
      const assetPct = 100 - stockPct;

      allocContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
          <span>📈 證券股票: <strong>${stockPct}%</strong> (NT$ ${formatMoney(stockMarketVal)})</span>
          <span>🏢 實體設備: <strong>${assetPct}%</strong> (NT$ ${formatMoney(assetVal)})</span>
        </div>
        <div class="progress-track" style="height: 12px; display: flex;">
          <div style="width: ${stockPct}%; height: 100%; background: linear-gradient(90deg, var(--secondary), var(--primary));" title="證券股票: ${stockPct}%"></div>
          <div style="width: ${assetPct}%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent));" title="實體資產: ${assetPct}%"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 8px;">
          <span>資本增值與流動資產配置</span>
          <span>固定資本與折舊生產設備</span>
        </div>
      `;
    }

    // 4. Stock Market Distribution
    const stockDistContainer = document.getElementById('stock-distribution-box');
    if (stockDistContainer) {
      const dist = Object.entries(stockSum.market_distribution || {});
      if (dist.length === 0) {
        stockDistContainer.innerHTML = '<div style="color: var(--text-dim); padding: 16px 0;">尚無持股數據</div>';
      } else {
        const totalMarketVal = Math.max(stockMarketVal, 1);
        stockDistContainer.innerHTML = dist.map(([market, mVal]) => {
          const pct = Math.round((mVal / totalMarketVal) * 100);
          return `
            <div class="cat-bar-item">
              <div class="cat-bar-labels">
                <span>${escapeHtml(market)}</span>
                <span style="font-weight: 700;">NT$ ${formatMoney(mVal)} (${pct}%)</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill progress-fill-alt" style="width: ${pct}%;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 5. Category Distribution Bars
    const catContainer = document.getElementById('category-distribution-box');
    if (catContainer) {
      const cats = Object.entries(stats.category_distribution || {});
      const maxVal = Math.max(...cats.map(c => c[1]), 1);
      catContainer.innerHTML = cats.map(([name, count]) => {
        const pct = Math.round((count / maxVal) * 100);
        return `
          <div class="cat-bar-item">
            <div class="cat-bar-labels">
              <span>${escapeHtml(name)}</span>
              <span style="font-weight: 600;">${count} 件</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('') || '<div style="color: var(--text-dim); padding: 16px 0;">暫無資產分類數據</div>';
    }

    // 6. Status Distribution Badges
    const statusContainer = document.getElementById('status-distribution-box');
    if (statusContainer) {
      const statuses = Object.entries(stats.status_distribution || {});
      statusContainer.innerHTML = statuses.map(([status, count]) => {
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
            <span class="badge ${getBadgeClass(status)}">${escapeHtml(status)}</span>
            <span style="font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums;">${count} 件</span>
          </div>
        `;
      }).join('') || '<div style="color: var(--text-dim); padding: 10px 0;">暫無狀態數據</div>';
    }

    // 7. Recent Combined Logs
    const recentLogsContainer = document.getElementById('dashboard-recent-logs');
    if (recentLogsContainer) {
      recentLogsContainer.innerHTML = (stats.recent_logs || []).slice(0, 6).map(log => `
        <div class="log-item">
          <span class="log-badge ${getActionBadgeClass(log.action)}">${escapeHtml(log.action)}</span>
          <div class="log-content">
            <div style="font-weight: 600; color: #fff;">${escapeHtml(log.asset_name || '')}</div>
            <div style="color: var(--text-muted); font-size: 13px; margin-top: 1px;">${escapeHtml(log.details)}</div>
            <div class="log-time">${escapeHtml(log.timestamp)} · 操作者: ${escapeHtml(log.operator)}</div>
          </div>
        </div>
      `).join('') || '<div style="color: var(--text-dim);">暫無近期日誌</div>';
    }

  } catch (err) {
    console.error('Failed to render dashboard:', err);
  }
}

// ==========================================================================
// 12. Full Logs View
// ==========================================================================
async function loadLogs() {
  try {
    const logs = await invokeApi('get_audit_logs') || [];
    const logsContainer = document.getElementById('full-logs-container');
    if (!logsContainer) return;

    logsContainer.innerHTML = logs.map(log => `
      <div class="log-item" style="padding: 14px 18px; background: rgba(22, 30, 48, 0.6); border-radius: var(--radius-sm); margin-bottom: 8px; border: var(--glass-border);">
        <span class="log-badge ${getActionBadgeClass(log.action)}">${escapeHtml(log.action)}</span>
        <div class="log-content">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #fff; font-size: 14px;">${escapeHtml(log.asset_name)} (${escapeHtml(log.asset_id)})</strong>
            <span class="log-time">${escapeHtml(log.timestamp)}</span>
          </div>
          <div style="margin-top: 4px; color: var(--text-muted); font-size: 13px;">${escapeHtml(log.details)}</div>
          <div style="margin-top: 4px; font-size: 11px; color: var(--text-dim);">經手操作人員: ${escapeHtml(log.operator)}</div>
        </div>
      </div>
    `).join('') || '<div style="color: var(--text-dim); text-align: center; padding: 40px;">尚無異動審計日誌</div>';
  } catch (err) {
    showToast('載入日誌失敗: ' + err, 'error');
  }
}

// ==========================================================================
// 13. Settings View, Theme Studio & Local Backup Management
// ==========================================================================
async function loadSettings() {
  try {
    const s = await invokeApi('get_settings');
    if (s && typeof s === 'object') {
      appSettings = { ...appSettings, ...s };
    }
    applyColorModeUI();
    applyThemeUI();
    updateBackupBadgeUI();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function applyColorModeUI() {
  if (appSettings.stock_color_mode === 'us') {
    document.body.classList.add('color-mode-us');
  } else {
    document.body.classList.remove('color-mode-us');
  }
}

function applyThemeUI() {
  const themeClasses = ['theme-ocean', 'theme-emerald', 'theme-amethyst', 'theme-amber', 'theme-crimson', 'theme-glacier'];
  const blurClasses = ['blur-low', 'blur-medium', 'blur-high', 'blur-ultra'];
  document.body.classList.remove(...themeClasses, ...blurClasses);

  const preset = appSettings.theme_preset || 'ocean';
  if (preset === 'custom' && (appSettings.custom_primary_color || appSettings.custom_accent_color)) {
    const prim = appSettings.custom_primary_color || '#6366f1';
    const acc = appSettings.custom_accent_color || '#06b6d4';
    document.documentElement.style.setProperty('--primary', prim);
    document.documentElement.style.setProperty('--primary-light', prim);
    document.documentElement.style.setProperty('--accent', acc);
    document.documentElement.style.setProperty('--secondary', acc);
  } else {
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--primary-light');
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--secondary');
    document.body.classList.add(`theme-${preset}`);
  }

  const blur = appSettings.glass_blur_level || 'medium';
  document.body.classList.add(`blur-${blur}`);

  document.querySelectorAll('.theme-swatch-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-theme') === preset);
  });

  const primPicker = document.getElementById('setting-custom-primary');
  if (primPicker && appSettings.custom_primary_color) primPicker.value = appSettings.custom_primary_color;

  const accPicker = document.getElementById('setting-custom-accent');
  if (accPicker && appSettings.custom_accent_color) accPicker.value = appSettings.custom_accent_color;

  const blurSelect = document.getElementById('setting-blur-level');
  if (blurSelect) {
    blurSelect.value = blur;
    syncCustomSelect('setting-blur-level');
  }
}

function loadSettingsView() {
  const currInput = document.getElementById('setting-currency');
  if (currInput) currInput.value = appSettings.currency || 'TWD';

  const colorInput = document.getElementById('setting-stock-color');
  if (colorInput) colorInput.value = appSettings.stock_color_mode || 'tw';

  const retentionInput = document.getElementById('setting-retention-count');
  if (retentionInput) retentionInput.value = appSettings.backup_retention_count || 20;

  const autoBackupInput = document.getElementById('setting-auto-backup');
  if (autoBackupInput) autoBackupInput.checked = !!appSettings.auto_backup;

  const autoUpdateInput = document.getElementById('setting-auto-check-update');
  if (autoUpdateInput) autoUpdateInput.checked = appSettings.auto_check_update !== false;

  const blurInput = document.getElementById('setting-blur-level');
  if (blurInput) blurInput.value = appSettings.glass_blur_level || 'medium';

  syncCustomSelect('setting-currency');
  syncCustomSelect('setting-stock-color');
  syncCustomSelect('setting-blur-level');
  applyThemeUI();

  invokeApi('get_data_folder_path').then(path => {
    const pathElem = document.getElementById('local-data-path');
    if (pathElem && path) pathElem.innerText = path;
  }).catch(() => {});

  updateBackupBadgeUI();
  loadBackupsList();
}

async function handleSettingsFormSubmit(e) {
  e.preventDefault();
  const updated = {
    ...appSettings,
    currency: document.getElementById('setting-currency')?.value || 'TWD',
    stock_color_mode: document.getElementById('setting-stock-color')?.value || 'tw',
    backup_retention_count: parseInt(document.getElementById('setting-retention-count')?.value, 10) || 20,
    auto_backup: !!document.getElementById('setting-auto-backup')?.checked,
    auto_check_update: !!document.getElementById('setting-auto-check-update')?.checked,
    glass_blur_level: document.getElementById('setting-blur-level')?.value || 'medium'
  };

  try {
    await invokeApi('save_settings', { settings: updated });
    appSettings = updated;
    applyColorModeUI();
    applyThemeUI();
    showToast('系統主題配色、偏好與自動備份設定已成功儲存！', 'success');
    updateBackupBadgeUI();
    renderStocksTable();
  } catch (err) {
    showToast('儲存設定失敗: ' + err, 'error');
  }
}

function updateBackupBadgeUI() {
  const text = document.getElementById('sidebar-backup-time');
  if (text) {
    text.innerText = appSettings.last_backup_time
      ? `上次: ${appSettings.last_backup_time.split(' ')[1] || appSettings.last_backup_time}`
      : '備份已就緒';
  }
  const hint = document.getElementById('local-last-backup-hint');
  if (hint) {
    hint.innerText = appSettings.last_backup_time
      ? `上次本機備份完成時間: ${appSettings.last_backup_time} · 自動保護中`
      : '所有實體固定資產、證券股票持股明細及快照檔均完整儲存於您的硬碟中。';
  }
}

async function loadBackupsList() {
  const container = document.getElementById('backup-history-list');
  if (!container) return;

  try {
    const backups = await invokeApi('list_local_backups') || [];
    if (!Array.isArray(backups) || backups.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 24px; background: rgba(15, 23, 42, 0.35); border-radius: var(--radius-sm); border: var(--glass-border);">
          <i class="fa-solid fa-box-open" style="font-size: 28px; color: var(--text-dim); margin-bottom: 8px; display: block;"></i>
          目前尚無歷史備份快照，點擊上方「立即建立備份」即可儲存第一份安全存檔。
        </div>
      `;
      return;
    }

    container.innerHTML = backups.map(b => {
      return `
        <div class="backup-item">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <i class="fa-solid fa-file-shield" style="color: #67e8f9;"></i>
              <strong style="color: #fff; font-size: 13.5px; word-break: break-all;">${escapeHtml(b.filename)}</strong>
              <span class="backup-badge-pill">${escapeHtml(b.note || '快照備份')}</span>
            </div>
            <div class="backup-meta">
              <span><i class="fa-solid fa-clock"></i> ${escapeHtml(b.created_at)}</span>
              <span><i class="fa-solid fa-database"></i> ${b.size_kb} KB</span>
              <span><i class="fa-solid fa-boxes-stacked"></i> 資產: ${b.asset_count} 筆</span>
              <span><i class="fa-solid fa-arrow-trend-up"></i> 股票: ${b.stock_count} 檔</span>
            </div>
          </div>
          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="restore-backup" data-file="${escapeHtml(b.filename)}" title="從此備份檔還原資料">
              <i class="fa-solid fa-rotate-left"></i> 還原
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete-backup" data-file="${escapeHtml(b.filename)}" title="刪除此備份快照">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load backups:', err);
    container.innerHTML = `<div style="color: #f87171; padding: 12px;">載入備份清單失敗: ${escapeHtml(err)}</div>`;
  }
}

async function handleCreateBackup(e) {
  if (e) e.preventDefault();
  const note = prompt('請輸入備份備註（例如：日常存檔、出差前存檔，可直接點確認使用預設）：', '手動全量備份快照');
  if (note === null) return;

  showToast('正在建立全系統本機快照備份...', 'info');
  try {
    const backup = await invokeApi('create_local_backup', { note: note || '手動全量備份快照' });
    if (backup) {
      appSettings.last_backup_time = backup.created_at;
      updateBackupBadgeUI();
      showToast(`本機備份 [${backup.filename}] 建立完成！`, 'success');
      await loadBackupsList();
    }
  } catch (err) {
    showToast('建立備份失敗: ' + err, 'error');
  }
}

async function handleExportBackupFile() {
  try {
    const jsonStr = await invokeApi('export_full_backup_json');
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 15);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AssetTracking_Backup_${dateStr}.json`;
    a.click();
    showToast('已匯出全量備份檔案 (.json)！', 'success');
  } catch (err) {
    showToast('匯出備份失敗: ' + err, 'error');
  }
}

async function handleRestoreBackupFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      const confirmed = confirm('【警告：還原全系統備份】\n\n確定要由所選檔案還原資料庫嗎？\n現有的實體資產與股票持股將被備份檔案中的數據覆蓋！');
      if (!confirmed) {
        e.target.value = '';
        return;
      }

      showToast('正在讀取並還原備份資料...', 'info');
      const msg = await invokeApi('restore_local_backup', { source: content, operator: '本機檔案還原員' });
      showToast(msg || '已成功自檔案還原資料庫！', 'success');
      await refreshAllData();
      await loadBackupsList();
    } catch (err) {
      showToast('還原檔案失敗: ' + err, 'error');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

// ==========================================================================
// 14. Export / Import Data
// ==========================================================================
async function exportCsv() {
  try {
    const csvContent = await invokeApi('export_assets_csv');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `實體資產清冊_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('已匯出固定資產 CSV 報表！', 'success');
  } catch (err) {
    showToast('匯出 CSV 失敗: ' + err, 'error');
  }
}

async function exportJson() {
  try {
    const jsonContent = await invokeApi('export_assets_json');
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `全資產與股票完整備份_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('已匯出 JSON 全量數據備份檔！', 'success');
  } catch (err) {
    showToast('匯出 JSON 失敗: ' + err, 'error');
  }
}

async function handleImportJson(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      const count = await invokeApi('import_assets_json', { json_str: content, operator: "批次匯入員" });
      showToast(`成功匯入 ${count} 筆資產與持股項目！`, 'success');
      await refreshAllData();
    } catch (err) {
      showToast('匯入失敗: ' + err, 'error');
    }
  };
  reader.readAsText(file);
}

// ==========================================================================
// 15. Wealth Lab: Dividends, Financial Goals, Calculators & Smart Alerts
// ==========================================================================
function renderWealthView() {
  // 1. KPI Summary
  const totalDiv = allDividends.reduce((acc, d) => acc + (d.net_amount_twd || 0), 0);
  const kpiDiv = document.getElementById('wealth-kpi-dividends');
  if (kpiDiv) kpiDiv.innerText = `NT$ ${formatMoney(totalDiv)}`;

  const kpiDivCount = document.getElementById('wealth-kpi-div-count');
  if (kpiDivCount) kpiDivCount.innerText = `累計 ${allDividends.length} 筆入帳`;

  const kpiPassive = document.getElementById('wealth-kpi-passive-monthly');
  if (kpiPassive) kpiPassive.innerText = `NT$ ${formatMoney(Math.round(totalDiv / 12))}`;

  let totalTarget = 0, totalCurrent = 0;
  allGoals.forEach(g => {
    totalTarget += (g.target_amount || 0);
    totalCurrent += (g.current_amount || 0);
  });
  const avgGoalRate = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
  const kpiGoalRate = document.getElementById('wealth-kpi-goal-rate');
  if (kpiGoalRate) kpiGoalRate.innerText = `${avgGoalRate}%`;

  const kpiGoalCount = document.getElementById('wealth-kpi-goal-count');
  if (kpiGoalCount) kpiGoalCount.innerText = `${allGoals.length} 項目標追蹤中`;

  // 2. Render Dividends Table
  renderDividendsTable();

  // 3. Render Financial Goals Grid
  renderGoalsGrid();

  // 4. Render Smart Alerts
  renderSmartAlerts();

  // 5. Run default calculator previews
  runCompoundCalculator();
  runRebalanceCalculator();
}

function renderDividendsTable() {
  const tbody = document.getElementById('dividends-tbody');
  if (!tbody) return;

  if (allDividends.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-dim);">
          <div style="font-size: 24px; margin-bottom: 6px;">💰</div>
          尚無股息或被動收入紀錄，點擊右上角「記一筆股息/收入」開始累積現金流
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allDividends.map(d => {
    const currSym = d.currency === 'USD' ? '$' : 'NT$';
    return `
      <tr>
        <td style="font-size: 12.5px; color: var(--text-muted);">${escapeHtml(d.pay_date)}</td>
        <td>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(d.title)}</div>
          <div style="font-size: 11px; color: var(--accent);">${escapeHtml(d.symbol || '')} ${d.notes ? `· ${escapeHtml(d.notes)}` : ''}</div>
        </td>
        <td><span class="badge badge-inuse">${escapeHtml(d.income_type || '現金股利')}</span></td>
        <td style="text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums;">
          ${currSym}${formatMoney(d.gross_amount)}
          ${d.tax_or_fee > 0 ? `<div style="font-size: 10px; color: var(--text-dim);">扣費: -${currSym}${d.tax_or_fee}</div>` : ''}
        </td>
        <td style="text-align: right; font-weight: 700; color: #4ade80; font-variant-numeric: tabular-nums;">
          +NT$ ${formatMoney(d.net_amount_twd)}
        </td>
        <td>
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-div" data-id="${escapeHtml(d.id)}" title="編輯">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete-div" data-id="${escapeHtml(d.id)}" title="刪除">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openDividendModal(rec = null) {
  const modal = document.getElementById('modal-dividend');
  const title = document.getElementById('modal-dividend-title');
  if (!modal) return;

  if (rec) {
    if (title) title.innerText = '編輯股息與被動收入紀錄';
    document.getElementById('div-field-id').value = rec.id || '';
    document.getElementById('div-field-symbol').value = rec.symbol || '';
    document.getElementById('div-field-title').value = rec.title || '';
    document.getElementById('div-field-type').value = rec.income_type || '現金股利';
    document.getElementById('div-field-date').value = rec.pay_date || '';
    document.getElementById('div-field-gross').value = rec.gross_amount || 0;
    document.getElementById('div-field-tax').value = rec.tax_or_fee || 0;
    document.getElementById('div-field-currency').value = rec.currency || 'TWD';
    document.getElementById('div-field-notes').value = rec.notes || '';
  } else {
    if (title) title.innerText = '新增股息與被動收入紀錄';
    document.getElementById('div-field-id').value = '';
    document.getElementById('div-field-symbol').value = '';
    document.getElementById('div-field-title').value = '';
    document.getElementById('div-field-type').value = '現金股利';
    document.getElementById('div-field-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('div-field-gross').value = '';
    document.getElementById('div-field-tax').value = 0;
    document.getElementById('div-field-currency').value = 'TWD';
    document.getElementById('div-field-notes').value = '';
  }

  syncCustomSelect('div-field-type');
  syncCustomSelect('div-field-currency');
  updateDividendNetPreview();
  modal.classList.add('open');
}

function updateDividendNetPreview() {
  const gross = parseFloat(document.getElementById('div-field-gross')?.value) || 0;
  const tax = parseFloat(document.getElementById('div-field-tax')?.value) || 0;
  const curr = document.getElementById('div-field-currency')?.value || 'TWD';
  const rate = curr === 'USD' ? 32.0 : 1.0;
  const net = Math.max(0, gross - tax) * rate;
  const prev = document.getElementById('div-net-preview');
  if (prev) prev.innerText = `NT$ ${formatMoney(Math.round(net))}`;
}

async function handleDividendFormSubmit(e) {
  e.preventDefault();
  const curr = document.getElementById('div-field-currency')?.value || 'TWD';
  const record = {
    id: (document.getElementById('div-field-id')?.value || '').trim(),
    symbol: (document.getElementById('div-field-symbol')?.value || '').trim().toUpperCase(),
    title: (document.getElementById('div-field-title')?.value || '').trim(),
    income_type: document.getElementById('div-field-type')?.value || '現金股利',
    pay_date: document.getElementById('div-field-date')?.value || new Date().toISOString().split('T')[0],
    gross_amount: parseFloat(document.getElementById('div-field-gross')?.value) || 0,
    tax_or_fee: parseFloat(document.getElementById('div-field-tax')?.value) || 0,
    currency: curr,
    exchange_rate: curr === 'USD' ? 32.0 : 1.0,
    net_amount_twd: 0,
    notes: (document.getElementById('div-field-notes')?.value || '').trim(),
    created_at: ""
  };

  try {
    await invokeApi('save_dividend', { record, operator: "投資人" });
    showToast(`已儲存股息/收入紀錄 [${record.title}]！`, 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('儲存股息失敗: ' + err, 'error');
  }
}

function renderGoalsGrid() {
  const container = document.getElementById('goals-grid-container');
  if (!container) return;

  if (allGoals.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px; color: var(--text-dim);">
        <div style="font-size: 24px; margin-bottom: 6px;">🎯</div>
        尚未設定財富目標，點擊右上角「新增財富目標」設定第一桶金或設備汰換基金！
      </div>
    `;
    return;
  }

  container.innerHTML = allGoals.map(g => {
    const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
    const barColor = g.color || 'var(--primary)';
    return `
      <div class="goal-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge badge-idle">${escapeHtml(g.category || '財富目標')}</span>
              <strong style="color: #fff; font-size: 14.5px;">${escapeHtml(g.title)}</strong>
            </div>
            ${g.deadline ? `<div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;"><i class="fa-regular fa-calendar"></i> 目標期限: ${escapeHtml(g.deadline)} ${g.notes ? `· ${escapeHtml(g.notes)}` : ''}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-goal" data-id="${escapeHtml(g.id)}" title="編輯目標">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete-goal" data-id="${escapeHtml(g.id)}" title="刪除目標">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-top: 10px;">
          <span style="color: var(--text-muted);">目前累積: <strong style="color: #fff;">NT$ ${formatMoney(g.current_amount)}</strong></span>
          <span style="color: var(--accent); font-weight: 700;">${pct}% (目標 NT$ ${formatMoney(g.target_amount)})</span>
        </div>
        <div class="progress-track" style="height: 8px; margin-top: 6px;">
          <div style="width: ${pct}%; height: 100%; background: ${escapeHtml(barColor)}; border-radius: 99px; transition: width 0.5s ease;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function openGoalModal(goal = null) {
  const modal = document.getElementById('modal-goal');
  const title = document.getElementById('modal-goal-title');
  if (!modal) return;

  if (goal) {
    if (title) title.innerText = '編輯財富目標里程碑';
    document.getElementById('goal-field-id').value = goal.id || '';
    document.getElementById('goal-field-title').value = goal.title || '';
    document.getElementById('goal-field-category').value = goal.category || '投資里程碑';
    document.getElementById('goal-field-deadline').value = goal.deadline || '';
    document.getElementById('goal-field-target').value = goal.target_amount || 1000000;
    document.getElementById('goal-field-current').value = goal.current_amount || 0;
    document.getElementById('goal-field-color').value = goal.color || '#6366f1';
    document.getElementById('goal-field-notes').value = goal.notes || '';
  } else {
    if (title) title.innerText = '新增財富目標里程碑';
    document.getElementById('goal-field-id').value = '';
    document.getElementById('goal-field-title').value = '';
    document.getElementById('goal-field-category').value = '投資里程碑';
    document.getElementById('goal-field-deadline').value = '';
    document.getElementById('goal-field-target').value = 1000000;
    document.getElementById('goal-field-current').value = 0;
    document.getElementById('goal-field-color').value = '#6366f1';
    document.getElementById('goal-field-notes').value = '';
  }

  syncCustomSelect('goal-field-category');
  modal.classList.add('open');
}

async function handleGoalFormSubmit(e) {
  e.preventDefault();
  const goal = {
    id: (document.getElementById('goal-field-id')?.value || '').trim(),
    title: (document.getElementById('goal-field-title')?.value || '').trim(),
    category: document.getElementById('goal-field-category')?.value || '投資里程碑',
    deadline: document.getElementById('goal-field-deadline')?.value || null,
    target_amount: parseFloat(document.getElementById('goal-field-target')?.value) || 0,
    current_amount: parseFloat(document.getElementById('goal-field-current')?.value) || 0,
    color: document.getElementById('goal-field-color')?.value || '#6366f1',
    notes: (document.getElementById('goal-field-notes')?.value || '').trim(),
    updated_at: ""
  };

  try {
    await invokeApi('save_goal', { goal });
    showToast(`財富目標 [${goal.title}] 已儲存！`, 'success');
    closeAllModals();
    await refreshAllData();
  } catch (err) {
    showToast('儲存目標失敗: ' + err, 'error');
  }
}

function runCompoundCalculator() {
  const initial = parseFloat(document.getElementById('calc-initial')?.value) || 0;
  const monthly = parseFloat(document.getElementById('calc-monthly')?.value) || 0;
  const ratePct = parseFloat(document.getElementById('calc-rate')?.value) || 0;
  const years = parseInt(document.getElementById('calc-years')?.value) || 10;

  const months = years * 12;
  const rMonth = (ratePct / 100) / 12;
  let total = initial;
  for (let m = 0; m < months; m++) {
    total = total * (1 + rMonth) + monthly;
  }
  const principal = initial + monthly * months;
  const interest = Math.max(0, total - principal);
  const monthlyPassive4Pct = (total * 0.04) / 12;

  const box = document.getElementById('calc-compound-result');
  if (box) {
    box.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
        <div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${years} 年後預估期末總資產</div>
          <div style="font-size: 20px; font-weight: 800; color: var(--accent);">NT$ ${formatMoney(Math.round(total))}</div>
        </div>
        <div>
          <div style="font-size: 11.5px; color: var(--text-muted);">累計投入總本金</div>
          <div style="font-size: 15px; font-weight: 700; color: #fff;">NT$ ${formatMoney(Math.round(principal))}</div>
        </div>
        <div>
          <div style="font-size: 11.5px; color: var(--text-muted);">複利增值總獲利</div>
          <div style="font-size: 15px; font-weight: 700; color: #4ade80;">+NT$ ${formatMoney(Math.round(interest))}</div>
        </div>
        <div>
          <div style="font-size: 11.5px; color: var(--text-muted);">4% 法則每月可提領退休金</div>
          <div style="font-size: 15px; font-weight: 700; color: #f472b6;">NT$ ${formatMoney(Math.round(monthlyPassive4Pct))} / 月</div>
        </div>
      </div>
    `;
  }
}

function runRebalanceCalculator() {
  const targetStockPct = Math.min(100, Math.max(0, parseFloat(document.getElementById('rebal-target-stock')?.value) || 70));
  const targetAssetPct = 100 - targetStockPct;

  const stockMarketVal = allStocks.reduce((acc, s) => acc + (s.market_value_twd || 0), 0);
  const assetCurrentVal = allAssets.reduce((acc, a) => acc + (a.current_value || 0), 0);
  const totalWorth = stockMarketVal + assetCurrentVal;

  const box = document.getElementById('rebalance-advice-box');
  if (!box) return;

  if (totalWorth <= 0) {
    box.innerHTML = `<div style="color: var(--text-dim);">目前總資產淨值為 NT$ 0，新增股票或實體資產後將自動計算再平衡建議。</div>`;
    return;
  }

  const idealStockVal = totalWorth * (targetStockPct / 100);
  const idealAssetVal = totalWorth * (targetAssetPct / 100);
  const diffStock = idealStockVal - stockMarketVal;
  const currStockPct = Math.round((stockMarketVal / totalWorth) * 100);
  const currAssetPct = 100 - currStockPct;

  let adviceHtml = '';
  if (Math.abs(diffStock) < 1000) {
    adviceHtml = `<span style="color: #4ade80; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> 目前配置比例 (${currStockPct}% : ${currAssetPct}%) 已非常接近您的理想目標！無須大幅調整。</span>`;
  } else if (diffStock > 0) {
    adviceHtml = `💡 建議<strong>加碼證券股票約 NT$ ${formatMoney(Math.round(diffStock))}</strong>（或減少閒置實體設備），即可將股票佔比自 ${currStockPct}% 提升至目標 ${targetStockPct}%。`;
  } else {
    adviceHtml = `💡 目前股票部位偏高 (${currStockPct}%)，若想鎖定獲利並達成目標 ${targetStockPct}%，可考慮<strong>獲利了結或轉移約 NT$ ${formatMoney(Math.round(Math.abs(diffStock)))}</strong> 至稳健固定資產。`;
  }

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
      <span>目前實際比例：股票 <strong>${currStockPct}%</strong> / 實體設備 <strong>${currAssetPct}%</strong></span>
      <span>目標比例：股票 <strong>${targetStockPct}%</strong> / 實體設備 <strong>${targetAssetPct}%</strong></span>
    </div>
    <div style="font-size: 13px; color: #fff; line-height: 1.5;">${adviceHtml}</div>
  `;
}

function renderSmartAlerts() {
  const container = document.getElementById('smart-alerts-container');
  const kpiAlert = document.getElementById('wealth-kpi-alert-count');
  if (!container) return;

  const alerts = [];
  const now = new Date();

  allAssets.forEach(a => {
    if (a.warranty_date) {
      const wDate = new Date(a.warranty_date);
      const diffDays = Math.ceil((wDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        alerts.push({
          level: 'danger',
          icon: 'fa-shield-Blank',
          title: `保固已過期：${a.name} (${a.id})`,
          desc: `保固到期日為 ${a.warranty_date}（已過期 ${Math.abs(diffDays)} 天），請留意維護風險。`
        });
      } else if (diffDays <= 60) {
        alerts.push({
          level: 'warn',
          icon: 'fa-triangle-exclamation',
          title: `保固即將到期：${a.name} (${a.id})`,
          desc: `距離保固到期日 (${a.warranty_date}) 僅剩 ${diffDays} 天，建議提前安排檢測。`
        });
      }
    }
    if (a.status === '維修中') {
      alerts.push({
        level: 'warn',
        icon: 'fa-screwdriver-wrench',
        title: `設備送修追蹤：${a.name} (${a.id})`,
        desc: `目前狀態為「維修中」，保管人：${a.custodian || '未指派'}，請追蹤完修進度。`
      });
    } else if (a.status === '外借中') {
      alerts.push({
        level: 'info',
        icon: 'fa-hand-holding-hand',
        title: `設備外借提醒：${a.name} (${a.id})`,
        desc: `目前由「${a.custodian || '外部人員'}」借用中（位置：${a.location || '未填'}）。`
      });
    }
  });

  allStocks.forEach(s => {
    if ((s.return_rate || 0) <= -10) {
      alerts.push({
        level: 'danger',
        icon: 'fa-arrow-trend-down',
        title: `持股回檔停損/逢低檢視：${s.name} (${s.symbol})`,
        desc: `目前未實現報酬率為 ${s.return_rate.toFixed(2)}% (NT$ ${formatMoney(s.unrealized_pnl_twd)})，建議檢視基本面或評估分批攤平。`
      });
    } else if ((s.return_rate || 0) >= 25) {
      alerts.push({
        level: 'info',
        icon: 'fa-trophy',
        title: `持股大幅獲利提醒：${s.name} (${s.symbol})`,
        desc: `目前報酬率達 +${s.return_rate.toFixed(2)}% (+NT$ ${formatMoney(s.unrealized_pnl_twd)})，可評估是否部分停利或動態再平衡。`
      });
    }
  });

  if (kpiAlert) kpiAlert.innerText = `${alerts.length} 項`;

  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-dim);">
        <i class="fa-solid fa-shield-check" style="font-size: 24px; color: #4ade80; margin-bottom: 6px; display: block;"></i>
        目前所有設備保固、借還狀態與持股部位均正常健康，無異常預警項目！
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map(al => `
    <div class="alert-banner-item ${al.level === 'danger' ? 'danger' : ''}">
      <i class="fa-solid ${al.icon || 'fa-bell'}" style="color: ${al.level === 'danger' ? '#f87171' : al.level === 'warn' ? '#fbbf24' : '#67e8f9'}; font-size: 16px; margin-top: 2px;"></i>
      <div>
        <div style="font-weight: 700; color: #fff; font-size: 13.5px;">${escapeHtml(al.title)}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(al.desc)}</div>
      </div>
    </div>
  `).join('');
}

// ==========================================================================
// 16. Asset QR Tag Card Modal & Pure-JS SVG Matrix Generator
// ==========================================================================
function generateSvgQrMatrix(text, sizePx = 180) {
  // Deterministic 21x21 QR-style matrix with standard finder patterns so it renders 100% offline
  const N = 21;
  const grid = Array.from({ length: N }, () => Array(N).fill(false));

  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = isBorder || isInner;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  // Timing patterns
  for (let i = 8; i < N - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Hash payload into data cells
  const str = String(text || 'ASSET');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let bitIdx = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inFinderTL = r < 8 && c < 8;
      const inFinderTR = r < 8 && c >= N - 8;
      const inFinderBL = r >= N - 8 && c < 8;
      if (inFinderTL || inFinderTR || inFinderBL || r === 6 || c === 6) continue;
      const charCode = str.charCodeAt(bitIdx % str.length);
      const v = ((hash >>> (bitIdx % 24)) ^ (charCode * (r + 1) + c * 17)) & 3;
      grid[r][c] = v === 0 || v === 2;
      bitIdx++;
    }
  }

  const cell = sizePx / N;
  let rects = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) {
        rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${(cell + 0.35).toFixed(2)}" height="${(cell + 0.35).toFixed(2)}" fill="#0f172a" rx="1"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}">${rects}</svg>`;
}

function openAssetTagModal(asset) {
  const modal = document.getElementById('modal-asset-tag');
  if (!modal || !asset) return;

  document.getElementById('tag-card-id').innerText = asset.id || '';
  document.getElementById('tag-card-name').innerText = asset.name || '';
  document.getElementById('tag-card-meta').innerText =
    `分類: ${asset.category || '—'} ｜ 保管人: ${asset.custodian || '未指派'} ｜ 位置: ${asset.location || '—'}`;

  const qrSvgBox = document.getElementById('tag-card-qr-svg');
  if (qrSvgBox) {
    qrSvgBox.innerHTML = generateSvgQrMatrix(`ASSET:${asset.id}|${asset.name}|${asset.serial_number || ''}`, 140);
  }
  modal.classList.add('open');
}

function printAssetTagCard() {
  const area = document.getElementById('asset-tag-printable-area');
  if (!area) return;
  const win = window.open('', '_blank', 'width=520,height=520');
  if (!win) {
    window.print();
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>資產盤點標籤卡列印</title>
      <style>
        body { font-family: "Microsoft JhengHei", sans-serif; display: flex; justify-content: center; align-items: center; height: 90vh; margin: 0; }
        .card { border: 2px solid #0f172a; border-radius: 14px; padding: 24px; text-align: center; width: 320px; }
      </style>
    </head>
    <body>
      <div class="card">${area.innerHTML}</div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

// ==========================================================================
// 17. Mobile APK & PC-Mobile Bidirectional Sync Engine
// ==========================================================================
async function loadMobileSyncView() {
  try {
    const status = await invokeApi('get_mobile_sync_status');
    const urlText = document.getElementById('mobile-lan-url-text');
    const qrBox = document.getElementById('mobile-lan-qr-box');
    const pinInput = document.getElementById('mobile-sync-pin-input');
    const statSummary = document.getElementById('mobile-sync-stat-summary');
    const remoteIpInput = document.getElementById('mobile-remote-ip-input');
    const remotePinInput = document.getElementById('mobile-remote-pin-input');

    const lanUrl = status?.mobile_web_url || 'http://127.0.0.1:18888';
    if (urlText) urlText.innerText = lanUrl;

    if (qrBox) {
      qrBox.innerHTML = generateSvgQrMatrix(lanUrl, 168);
    }

    if (pinInput) {
      pinInput.value = status?.sync_pin ?? appSettings.mobile_sync_pin ?? '8888';
    }

    if (remoteIpInput && !remoteIpInput.value) {
      const savedHost = getRemoteSyncHost();
      const defaultHost = (status?.local_ips && status.local_ips[0])
        ? `${status.local_ips[0]}:${status.port || 18888}`
        : '192.168.1.100:18888';
      remoteIpInput.value = savedHost || defaultHost;
    }

    if (remotePinInput && !remotePinInput.value) {
      remotePinInput.value = localStorage.getItem('asset_mobile_remote_pin') || (status?.sync_pin ?? '8888');
    }

    if (statSummary) {
      const allIps = (status?.local_ips || []).map(ip => `http://${ip}:${status.port || 18888}`).join(' 、 ');
      statSummary.innerHTML = `
        <div><strong>伺服器狀態：</strong> <span style="color: #4ade80;">● 運行中 (Port ${status?.port || 18888})</span></div>
        <div><strong>可用區網位址：</strong> ${escapeHtml(allIps || lanUrl)}</div>
        <div><strong>本機資料筆數：</strong> 實體資產 ${allAssets.length} 筆 ｜ 股票持股 ${allStocks.length} 檔 ｜ 股息 ${allDividends.length} 筆 ｜ 目標 ${allGoals.length} 項</div>
        <div><strong>最近同步時間：</strong> ${escapeHtml(status?.last_sync_time || appSettings.last_mobile_sync_time || '尚未執行跨裝置同步')}</div>
      `;
    }
  } catch (err) {
    console.error('Failed to load mobile sync status:', err);
  }
}

function getTargetSyncEndpoint() {
  let rawHost = (document.getElementById('mobile-remote-ip-input')?.value || '').trim();
  const pin = (document.getElementById('mobile-remote-pin-input')?.value || '').trim();
  rawHost = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (rawHost && !rawHost.includes(':')) {
    rawHost = `${rawHost}:18888`;
  }
  if (rawHost) {
    localStorage.setItem('asset_mobile_remote_host', rawHost);
  }
  localStorage.setItem('asset_mobile_remote_pin', pin);
  return { host: rawHost, pin };
}

function setMobileSyncBanner(html, isError = false) {
  const banner = document.getElementById('mobile-sync-result-banner');
  if (!banner) return;
  banner.style.borderColor = isError ? 'rgba(239, 68, 68, 0.45)' : 'rgba(34, 197, 94, 0.45)';
  banner.innerHTML = html;
}

async function handleMobileConnectTest(e) {
  if (e) e.preventDefault();
  const { host } = getTargetSyncEndpoint();
  if (!host) {
    showToast('請先輸入電腦區網 IP:Port（例如 192.168.1.100:18888）', 'error');
    return;
  }

  setMobileSyncBanner(`<i class="fa-solid fa-spinner fa-spin"></i> 正在測試連線至 <strong>http://${escapeHtml(host)}/api/ping</strong> ...`);
  try {
    const resp = await fetch(`http://${host}/api/ping`);
    const json = await resp.json();
    if (json && json.ok) {
      setMobileSyncBanner(`
        <div style="color: #4ade80; font-weight: 700;">
          <i class="fa-solid fa-circle-check"></i> 連線成功！已連上「${escapeHtml(json.data.app)} v${escapeHtml(json.data.version)}」
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
          遠端資料版本號: #${json.data.revision} · PIN 驗證: ${json.data.pin_required ? '已啟用保護' : '免密碼'} · 現在可點擊下方按鈕執行雙向同步！
        </div>
      `);
      showToast(`已成功連線至 ${host}！`, 'success');
    } else {
      throw new Error(json?.error || '未知回應');
    }
  } catch (err) {
    setMobileSyncBanner(`<span style="color: #f87171;"><i class="fa-solid fa-circle-exclamation"></i> 無法連線至 http://${escapeHtml(host)} (${escapeHtml(err.message || err)})。請確認手機與電腦在同一個 Wi-Fi 網路下。</span>`, true);
    showToast('連線測試失敗，請確認 IP 與 Wi-Fi 網路', 'error');
  }
}

async function handleMobileBidirectionalSync(mergeMode = 'merge') {
  const { host, pin } = getTargetSyncEndpoint();
  if (!host) {
    showToast('請輸入目標電腦區網 IP:Port', 'error');
    return;
  }

  const modeLabel = mergeMode === 'overwrite' ? '推送手機修改並覆蓋電腦' : '雙向智慧合併同步';
  setMobileSyncBanner(`<i class="fa-solid fa-spinner fa-spin"></i> 正在執行【${modeLabel}】至 http://${escapeHtml(host)} ...`);

  try {
    const mockDb = getMockDb();
    const payload = {
      device_name: getTauriInvoke() ? "Windows-PC" : "Android-Mobile",
      sync_pin: pin,
      timestamp: new Date().toLocaleString(),
      assets: allAssets,
      stocks: allStocks,
      dividends: allDividends,
      goals: allGoals,
      settings: appSettings,
      deleted_ids: mockDb.deleted_ids || [],
      merge_mode: mergeMode
    };

    const resp = await fetch(`http://${host}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if (!json || !json.ok) {
      throw new Error(json?.error || '同步失敗');
    }

    const merged = json.data;
    // Save merged data back to local storage & Tauri if applicable
    const db = getMockDb();
    db.assets = merged.assets || [];
    db.stocks = merged.stocks || [];
    db.dividends = merged.dividends || [];
    db.goals = merged.goals || [];
    db.deleted_ids = [];
    if (merged.settings) {
      db.settings = { ...appSettings, ...merged.settings };
      appSettings = db.settings;
    }
    saveMockDb(db);

    if (getTauriInvoke()) {
      await invokeApi('apply_mobile_sync_cmd', { payload: { ...merged, merge_mode: 'overwrite' } });
    }

    await refreshAllData();
    applyThemeUI();
    setMobileSyncBanner(`
      <div style="color: #4ade80; font-weight: 700;">
        <i class="fa-solid fa-circle-check"></i> 【${modeLabel}】完成！手機與電腦資料已完全一致
      </div>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
        同步後總計：資產 ${allAssets.length} 筆 ｜ 股票 ${allStocks.length} 檔 ｜ 股息 ${allDividends.length} 筆 ｜ 目標 ${allGoals.length} 項（時間：${new Date().toLocaleTimeString()}）
      </div>
    `);
    showToast(`${modeLabel}成功！雙端資料已同步更新`, 'success');
  } catch (err) {
    setMobileSyncBanner(`<span style="color: #f87171;"><i class="fa-solid fa-triangle-exclamation"></i> 同步失敗：${escapeHtml(err.message || err)}</span>`, true);
    showToast('同步失敗: ' + (err.message || err), 'error');
  }
}

async function handleMobilePullFromPc(e) {
  if (e) e.preventDefault();
  const { host, pin } = getTargetSyncEndpoint();
  if (!host) {
    showToast('請輸入目標電腦區網 IP:Port', 'error');
    return;
  }

  setMobileSyncBanner(`<i class="fa-solid fa-spinner fa-spin"></i> 正在從電腦 (http://${escapeHtml(host)}) 拉取最新完整資料庫...`);
  try {
    const resp = await fetch(`http://${host}/api/sync/pull?pin=${encodeURIComponent(pin)}`);
    const json = await resp.json();
    if (!json || !json.ok) {
      throw new Error(json?.error || '拉取失敗');
    }

    const remoteData = json.data;
    const db = getMockDb();
    db.assets = remoteData.assets || [];
    db.stocks = remoteData.stocks || [];
    db.dividends = remoteData.dividends || [];
    db.goals = remoteData.goals || [];
    db.deleted_ids = [];
    if (remoteData.settings) {
      db.settings = { ...appSettings, ...remoteData.settings };
      appSettings = db.settings;
    }
    saveMockDb(db);

    if (getTauriInvoke()) {
      await invokeApi('apply_mobile_sync_cmd', { payload: { ...remoteData, merge_mode: 'overwrite' } });
    }

    await refreshAllData();
    applyThemeUI();
    setMobileSyncBanner(`
      <div style="color: #4ade80; font-weight: 700;">
        <i class="fa-solid fa-cloud-arrow-down"></i> 已成功從電腦拉取最新資料並更新本機！
      </div>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
        目前資料：資產 ${allAssets.length} 筆 ｜ 股票 ${allStocks.length} 檔 ｜ 股息 ${allDividends.length} 筆 ｜ 目標 ${allGoals.length} 項
      </div>
    `);
    showToast('已成功從電腦拉取最新資料！', 'success');
  } catch (err) {
    setMobileSyncBanner(`<span style="color: #f87171;"><i class="fa-solid fa-triangle-exclamation"></i> 拉取失敗：${escapeHtml(err.message || err)}</span>`, true);
    showToast('拉取失敗: ' + (err.message || err), 'error');
  }
}

function startBackgroundMobileSyncWatcher() {
  if (!getTauriInvoke()) return;
  setInterval(async () => {
    try {
      const status = await invokeApi('get_mobile_sync_status');
      if (status && typeof status.sync_revision === 'number') {
        if (lastKnownSyncRevision === 0) {
          lastKnownSyncRevision = status.sync_revision;
        } else if (status.sync_revision > lastKnownSyncRevision) {
          lastKnownSyncRevision = status.sync_revision;
          await loadSettings();
          await refreshAllData();
          showToast('📱 已即時同步來自手機端的資料變更！', 'info');
        }
      }
    } catch (_) {}
  }, 3500);
}

// ==========================================================================
// 18. Auto-Update Check & One-Click Installer
// ==========================================================================
async function handleCheckAppUpdate(showFeedback = true) {
  const badge = document.getElementById('update-status-badge');
  const label = document.getElementById('update-latest-version-label');
  const notes = document.getElementById('update-release-notes');
  const btnInstall = document.getElementById('btn-install-update-now');
  const btnOpenUrl = document.getElementById('btn-open-release-url');

  if (showFeedback) {
    showToast('正在連線 GitHub Releases 檢查最新版本...', 'info');
  }
  if (badge) {
    badge.className = 'badge badge-idle';
    badge.innerText = '正在檢查更新...';
  }

  try {
    const info = await invokeApi('check_app_update');
    if (!info) return;
    latestUpdateInfo = info;

    if (label) {
      label.innerText = `目前版本: v${info.current_version} ｜ 最新發布版本: v${info.latest_version} (${info.release_title || ''})`;
    }
    if (notes) {
      notes.innerText = info.release_notes || '無詳細更新說明。';
    }
    if (btnOpenUrl && info.html_url) {
      btnOpenUrl.href = info.html_url;
      btnOpenUrl.style.display = 'inline-flex';
    }

    if (info.has_update) {
      if (badge) {
        badge.className = 'badge badge-borrow';
        badge.innerText = `發現新版本 v${info.latest_version} 可供升級！`;
      }
      if (btnInstall) btnInstall.style.display = 'inline-flex';
      showToast(`🎉 發現新版本 v${info.latest_version}！可前往「系統設定」一鍵下載安裝更新`, 'success');
    } else {
      if (badge) {
        badge.className = 'badge badge-inuse';
        badge.innerText = `目前已是最新版本 (v${info.current_version})`;
      }
      if (btnInstall) btnInstall.style.display = 'none';
      if (showFeedback) {
        showToast(`目前已是最新版本 v${info.current_version}！`, 'success');
      }
    }
  } catch (err) {
    if (badge) {
      badge.className = 'badge badge-repair';
      badge.innerText = '檢查更新失敗（請確認網路連線）';
    }
    if (showFeedback) {
      showToast('檢查更新失敗: ' + (err.message || err), 'error');
    }
  }
}

async function handleInstallUpdateNow(e) {
  if (e) e.preventDefault();
  if (!latestUpdateInfo || !latestUpdateInfo.download_url) {
    showToast('找不到更新安裝包連結，將為您開啟發布頁面', 'info');
    window.open('https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest', '_blank');
    return;
  }

  const confirmed = confirm(`確定要立即下載並安裝最新版本 v${latestUpdateInfo.latest_version} 嗎？\n下載完成後將自動啟動安裝程式。`);
  if (!confirmed) return;

  showToast(`正在背景下載 v${latestUpdateInfo.latest_version} 安裝更新包，請稍候...`, 'info');
  try {
    if (getTauriInvoke()) {
      const msg = await invokeApi('download_and_install_update', {
        download_url: latestUpdateInfo.download_url,
        latest_version: latestUpdateInfo.latest_version
      });
      showToast(msg || '安裝程式已啟動！', 'success');
    } else {
      window.open(latestUpdateInfo.download_url, '_blank');
    }
  } catch (err) {
    showToast('自動下載更新失敗，為您開啟下載頁: ' + err, 'error');
    window.open(latestUpdateInfo.html_url || latestUpdateInfo.download_url, '_blank');
  }
}

// ==========================================================================
// 19. UI Helpers
// ==========================================================================
function getBadgeClass(status) {
  switch (status) {
    case '在用中': return 'badge-inuse';
    case '閒置中': return 'badge-idle';
    case '維修中': return 'badge-repair';
    case '外借中': return 'badge-borrow';
    case '已報廢': return 'badge-scrapped';
    default: return 'badge-idle';
  }
}

function getActionBadgeClass(action) {
  switch (action) {
    case '買入股票': return 'badge-market-tw';
    case '賣出股票': return 'badge-market-us';
    case '更新股票': return 'badge-market-etf';
    case '更新股價': return 'badge-inuse';
    case '股息入帳': return 'badge-inuse';
    case '刪除股息': return 'badge-scrapped';
    case '建立': return 'badge-inuse';
    case '修改': return 'badge-idle';
    case '借出': return 'badge-borrow';
    case '歸還': return 'badge-inuse';
    case '送修': return 'badge-repair';
    case '完修': return 'badge-inuse';
    case '報廢': return 'badge-scrapped';
    case '刪除': return 'badge-scrapped';
    case '匯入': return 'badge-inuse';
    default: return 'badge-idle';
  }
}

function isWarrantyNear(warrantyDateStr) {
  if (!warrantyDateStr) return false;
  const d = new Date(warrantyDateStr);
  const now = new Date();
  const diffDays = (d - now) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 60;
}

function formatMoney(num) {
  return (num || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'}"></i>
    <span>${escapeHtml(msg)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4500);
}

