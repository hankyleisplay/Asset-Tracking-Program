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
  github_repo: "hankyleisplay/Asset-Tracking-Program",
  github_token: "",
  github_branch: "main",
  auto_sync: true,
  last_sync_time: null,
  last_sync_status: "待命",
  stock_color_mode: "tw"
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

// Delete modal state
let pendingDeleteType = null; // 'asset' or 'stock'
let pendingDeleteId = null;

// Safe IPC API with timeout and mock fallback
async function invokeApi(command, args = {}) {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      // 6-second timeout promise race so UI never hangs
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tauri 指令 [${command}] 超時 (6秒)`)), 6000)
      );
      const res = await Promise.race([invoke(command, args), timeoutPromise]);
      return res;
    } catch (err) {
      console.warn(`[Tauri IPC] ${command} failed or timed out:`, err);
      // Fallback to local mock database
      return mockApi(command, args);
    }
  } else {
    return mockApi(command, args);
  }
}

// 3. Mock Database for Standalone Preview / Offline Fallback
const MOCK_STORAGE_KEY = 'asset_tracking_portfolio_mock_v3';

function getMockDb() {
  try {
    const existing = localStorage.getItem(MOCK_STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed && Array.isArray(parsed.assets) && Array.isArray(parsed.stocks)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse localStorage:', e);
  }

  const initial = {
    assets: [
      {
        id: "AST-2026-001",
        name: "MacBook Pro 16吋 (M4 Max / 64GB / 2TB)",
        category: "3C與電腦",
        brand: "Apple",
        model: "MacBook Pro 16",
        serial_number: "C02XYZ987KLA",
        purchase_date: "2025-11-15",
        purchase_price: 114900.0,
        current_value: 95750.0,
        depreciation_years: 3,
        status: "在用中",
        location: "台北研發中心 4F-A區",
        department: "技術研發部",
        custodian: "hankyle",
        warranty_date: "2028-11-15",
        notes: "工程開發主要筆電，附原廠140W充電器與MagSafe線",
        tags: ["筆電", "高階開發"],
        created_at: "2026-10-15 10:00:00",
        updated_at: "2026-10-15 10:00:00"
      },
      {
        id: "AST-2026-002",
        name: "Dell UltraSharp 32吋 4K 專業螢幕",
        category: "3C與電腦",
        brand: "Dell",
        model: "U3223QE",
        serial_number: "CN0482914801",
        purchase_date: "2025-06-20",
        purchase_price: 24900.0,
        current_value: 19500.0,
        depreciation_years: 4,
        status: "在用中",
        location: "台北研發中心 4F-A區",
        department: "技術研發部",
        custodian: "hankyle",
        warranty_date: "2028-06-20",
        notes: "支援Type-C 90W供電與RJ-45網路輸出",
        tags: ["螢幕", "外接顯示器"],
        created_at: "2026-10-15 10:00:00",
        updated_at: "2026-10-15 10:00:00"
      },
      {
        id: "AST-2026-003",
        name: "Herman Miller Aeron 人體工學旗艦辦公椅",
        category: "辦公家具",
        brand: "Herman Miller",
        model: "Aeron B Size",
        serial_number: "HM-AERON-202509",
        purchase_date: "2025-01-10",
        purchase_price: 52000.0,
        current_value: 46800.0,
        depreciation_years: 10,
        status: "在用中",
        location: "主管辦公室",
        department: "管理部",
        custodian: "hankyle",
        warranty_date: "2037-01-10",
        notes: "12年原廠結構保固",
        tags: ["辦公椅", "人體工學"],
        created_at: "2026-10-15 10:00:00",
        updated_at: "2026-10-15 10:00:00"
      },
      {
        id: "AST-2026-004",
        name: "Synology DS923+ 4-Bay 網路儲存伺服器",
        category: "伺服器與網路",
        brand: "Synology",
        model: "DS923+",
        serial_number: "22B0SDN91823",
        purchase_date: "2024-08-05",
        purchase_price: 38800.0,
        current_value: 23280.0,
        depreciation_years: 3,
        status: "在用中",
        location: "機房 機架A-02",
        department: "資訊維運部",
        custodian: "網管工程師",
        warranty_date: "2027-08-05",
        notes: "裝載4顆Seagate IronWolf 16TB，RAID 6配置",
        tags: ["NAS", "本地備份"],
        created_at: "2026-10-15 10:00:00",
        updated_at: "2026-10-15 10:00:00"
      },
      {
        id: "AST-2026-005",
        name: "Sony A7 IV 全片幅無反單眼相機機身",
        category: "視聽攝影設備",
        brand: "Sony",
        model: "ILCE-7M4",
        serial_number: "S01-4920194",
        purchase_date: "2024-12-01",
        purchase_price: 64980.0,
        current_value: 45000.0,
        depreciation_years: 4,
        status: "外借中",
        location: "外借 (行銷活動拍攝)",
        department: "行銷公關部",
        custodian: "林攝影師",
        warranty_date: "2026-12-01",
        notes: "借出時間: 2026-10-10，預計2026-10-20歸還",
        tags: ["相機", "攝影器材"],
        created_at: "2026-10-15 10:00:00",
        updated_at: "2026-10-15 10:00:00"
      },
      {
        id: "AST-2026-006",
        name: "iPad Pro 13吋 (M4 / 256GB / Wi-Fi)",
        category: "3C與電腦",
        brand: "Apple",
        model: "iPad Pro 13 (2024)",
        serial_number: "DMPT9081KA",
        purchase_date: "2024-09-10",
        purchase_price: 45900.0,
        current_value: 32000.0,
        depreciation_years: 3,
        status: "維修中",
        location: "原廠授權維修中心",
        department: "產品設計部",
        custodian: "王UI設計師",
        warranty_date: "2026-10-25",
        notes: "觸控螢幕異常送修中",
        tags: ["平板", "設計測試"],
        created_at: "2026-10-15 10:00:00",
        updated_at: "2026-10-15 10:00:00"
      }
    ],
    stocks: [
      {
        id: "STK-2330",
        symbol: "2330",
        name: "台積電 (TSMC)",
        market: "台股",
        shares: 1000.0,
        buy_price: 920.0,
        current_price: 1050.0,
        currency: "TWD",
        exchange_rate: 1.0,
        total_cost_twd: 920000.0,
        market_value_twd: 1050000.0,
        unrealized_pnl_twd: 130000.0,
        return_rate: 14.13,
        dividend_yield: 1.8,
        notes: "全球晶圓代工龍頭，AI晶片主流供應鏈",
        updated_at: "2026-10-15 14:30:00"
      },
      {
        id: "STK-0050",
        symbol: "0050",
        name: "元大台灣卓越50 ETF",
        market: "ETF",
        shares: 2000.0,
        buy_price: 175.0,
        current_price: 192.5,
        currency: "TWD",
        exchange_rate: 1.0,
        total_cost_twd: 350000.0,
        market_value_twd: 385000.0,
        unrealized_pnl_twd: 35000.0,
        return_rate: 10.0,
        dividend_yield: 3.2,
        notes: "台灣前50大權值股，核心指數投資",
        updated_at: "2026-10-15 14:30:00"
      },
      {
        id: "STK-NVDA",
        symbol: "NVDA",
        name: "NVIDIA Corporation",
        market: "美股",
        shares: 60.0,
        buy_price: 118.0,
        current_price: 138.5,
        currency: "USD",
        exchange_rate: 32.0,
        total_cost_twd: 226560.0,
        market_value_twd: 265920.0,
        unrealized_pnl_twd: 39360.0,
        return_rate: 17.37,
        dividend_yield: 0.1,
        notes: "GPU與AI運算架構絕對領先者",
        updated_at: "2026-10-15 14:30:00"
      },
      {
        id: "STK-AAPL",
        symbol: "AAPL",
        name: "Apple Inc.",
        market: "美股",
        shares: 40.0,
        buy_price: 215.0,
        current_price: 232.0,
        currency: "USD",
        exchange_rate: 32.0,
        total_cost_twd: 275200.0,
        market_value_twd: 296960.0,
        unrealized_pnl_twd: 21760.0,
        return_rate: 7.91,
        dividend_yield: 0.5,
        notes: "消費性電子與服務生態圈長線持股",
        updated_at: "2026-10-15 14:30:00"
      }
    ],
    logs: [
      {
        id: "log-1",
        asset_id: "STK-2330",
        asset_name: "台積電 (2330)",
        action: "買入股票",
        operator: "投資人",
        details: "買入 1,000 股，成交均價 NT$920",
        timestamp: "2026-10-15 09:30:00"
      },
      {
        id: "log-2",
        asset_id: "AST-2026-001",
        asset_name: "MacBook Pro 16吋 (M4 Max / 64GB / 2TB)",
        action: "建立",
        operator: "系統管理員",
        details: "初始固定資產建檔完成，指派保管人: hankyle",
        timestamp: "2026-10-15 10:00:00"
      }
    ],
    settings: {
      currency: "TWD",
      github_repo: "hankyleisplay/Asset-Tracking-Program",
      github_token: "",
      github_branch: "main",
      auto_sync: true,
      last_sync_time: "2026-10-15 12:00:00",
      last_sync_status: "本地已就緒",
      stock_color_mode: "tw"
    }
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

function mockApi(command, args) {
  const db = getMockDb();

  if (command === 'get_assets') return db.assets || [];
  if (command === 'get_stocks') return db.stocks || [];
  if (command === 'get_audit_logs') return db.logs || [];
  if (command === 'get_settings') return db.settings || appSettings;
  if (command === 'get_data_folder_path') return "C:\\Users\\hankyle\\AppData\\Roaming\\AssetTracking";

  if (command === 'save_settings') {
    db.settings = args.settings;
    saveMockDb(db);
    return null;
  }

  if (command === 'save_asset') {
    const item = { ...args.asset };
    if (!item.id) {
      item.id = "AST-" + Date.now().toString().slice(-6);
    }
    const idx = (db.assets || []).findIndex(a => a.id === item.id);
    if (idx >= 0) {
      db.assets[idx] = item;
    } else {
      db.assets.push(item);
    }
    db.logs.unshift({
      id: "log-" + Date.now(),
      asset_id: item.id,
      asset_name: item.name,
      action: idx >= 0 ? "修改" : "建立",
      operator: args.operator || "使用者",
      details: `${idx >= 0 ? "修改" : "建立"}資產: ${item.name}`,
      timestamp: new Date().toLocaleString()
    });
    saveMockDb(db);
    return item;
  }

  if (command === 'delete_asset') {
    const idx = (db.assets || []).findIndex(a => a.id === args.id);
    if (idx >= 0) {
      const removed = db.assets.splice(idx, 1)[0];
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
      if (args.custodian) asset.custodian = args.custodian;
      db.logs.unshift({
        id: "log-" + Date.now(),
        asset_id: asset.id,
        asset_name: asset.name,
        action: args.action_type || "異動",
        operator: args.operator || "管理員",
        details: `狀態變更: ${old} -> ${args.new_status} (${args.notes || '無說明'})`,
        timestamp: new Date().toLocaleString()
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
    db.logs.unshift({
      id: "log-" + Date.now(),
      asset_id: stock.id,
      asset_name: `${stock.name} (${stock.symbol})`,
      action: idx >= 0 ? "更新股票" : "買入股票",
      operator: args.operator || "投資人",
      details: `${idx >= 0 ? "更新" : "買入"}持股: ${stock.name} (${stock.symbol}), 現價: ${stock.current_price}`,
      timestamp: new Date().toLocaleString()
    });
    saveMockDb(db);
    return stock;
  }

  if (command === 'delete_stock') {
    const idx = (db.stocks || []).findIndex(s => s.id === args.id);
    if (idx >= 0) {
      const removed = db.stocks.splice(idx, 1)[0];
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

  if (command === 'batch_update_stock_prices') {
    const updates = args.updates || {};
    (db.stocks || []).forEach(s => {
      const newPrice = updates[s.id] || updates[s.symbol];
      if (newPrice && newPrice > 0) {
        s.current_price = newPrice;
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

    return {
      total_count: assets.length,
      total_original_value: Math.round(totalOrig * 100) / 100,
      total_current_value: Math.round(totalCurr * 100) / 100,
      status_distribution: statusDist,
      category_distribution: catDist,
      expiring_warranty_count: 1,
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
      total_net_worth_twd: Math.round((totalCurr + stockMarket) * 100) / 100
    };
  }

  if (command === 'sync_to_github_now') {
    return {
      success: true,
      message: "本地離線模擬: 數據已就緒",
      timestamp: new Date().toLocaleString(),
      commit_sha: "local-preview-sha"
    };
  }

  return null;
}

// ==========================================================================
// 4. Initialization Entrypoint
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[AssetTracking] Initializing Liquid Glass & Material Design 3...');
  initNavigation();
  initEventListeners();
  await loadSettings();
  await refreshAllData();
});

// ==========================================================================
// 5. Navigation System
// ==========================================================================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetView = item.getAttribute('data-view');
      const targetSection = document.getElementById(targetView);
      if (targetSection) {
        targetSection.classList.add('active');
      }

      const pageTitle = item.querySelector('span')?.innerText || '資產與證券系統';
      const headerTitle = document.getElementById('header-title');
      if (headerTitle) {
        headerTitle.innerText = pageTitle;
      }

      try {
        if (targetView === 'view-dashboard') renderDashboard();
        if (targetView === 'view-stocks') renderStocksTable();
        if (targetView === 'view-assets') renderAssetsTable();
        if (targetView === 'view-logs') loadLogs();
        if (targetView === 'view-settings') loadSettingsView();
      } catch (err) {
        console.error('Error switching tab:', err);
      }
    });
  });
}

// ==========================================================================
// 6. Global Event Listeners & Button Handlers
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

  document.getElementById('btn-header-sync')?.addEventListener('click', (e) => {
    e.preventDefault();
    triggerGitHubSync();
  });

  document.getElementById('btn-sidebar-sync')?.addEventListener('click', (e) => {
    e.preventDefault();
    triggerGitHubSync();
  });

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

  // --- Table Event Delegation (Ensures edit/delete buttons ALWAYS respond) ---
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
    const [assetsData, stocksData] = await Promise.all([
      invokeApi('get_assets'),
      invokeApi('get_stocks')
    ]);

    allAssets = Array.isArray(assetsData) ? assetsData : [];
    allStocks = Array.isArray(stocksData) ? stocksData : [];

    // Update Sidebar Counts
    const assetBadge = document.getElementById('sidebar-asset-count');
    if (assetBadge) assetBadge.innerText = allAssets.length;

    const stockBadge = document.getElementById('sidebar-stock-count');
    if (stockBadge) stockBadge.innerText = allStocks.length;

    applyAssetFilters();
    applyStockFilters();
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

// Open Stock Modal
function openStockModal(stock = null) {
  const modal = document.getElementById('modal-stock');
  const title = document.getElementById('modal-stock-title');
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
    titleElem.innerText = (type === 'stock') ? '確認賣出 / 結清股票' : '確認刪除實體資產';
  }
  if (promptElem) {
    promptElem.innerText = (type === 'stock')
      ? '您確定要自投資組合中移除下列股票標的嗎？'
      : '您確定要從系統中永久刪除下列固定資產嗎？';
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
          <div style="width: ${stockPct}%; height: 100%; background: linear-gradient(90deg, #ec4899, #8b5cf6);" title="證券股票: ${stockPct}%"></div>
          <div style="width: ${assetPct}%; height: 100%; background: linear-gradient(90deg, #6366f1, #06b6d4);" title="實體資產: ${assetPct}%"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 8px;">
          <span>資本增值與流動資產配置</span>
          <span>固定資本與折舊生產設備</span>
        </div>
      `;
    }

    // 4. Stock Market Distribution (TW vs US vs ETF vs Fund)
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
// 13. Settings View & GitHub Auto-Sync
// ==========================================================================
async function loadSettings() {
  try {
    const s = await invokeApi('get_settings');
    if (s && typeof s === 'object') {
      appSettings = { ...appSettings, ...s };
    }
    applyColorModeUI();
    updateSyncBadgeUI();
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

function loadSettingsView() {
  const repoInput = document.getElementById('setting-repo');
  if (repoInput) repoInput.value = appSettings.github_repo || '';

  const tokenInput = document.getElementById('setting-token');
  if (tokenInput) tokenInput.value = appSettings.github_token || '';

  const branchInput = document.getElementById('setting-branch');
  if (branchInput) branchInput.value = appSettings.github_branch || 'main';

  const autoSyncInput = document.getElementById('setting-auto-sync');
  if (autoSyncInput) autoSyncInput.checked = !!appSettings.auto_sync;

  const currInput = document.getElementById('setting-currency');
  if (currInput) currInput.value = appSettings.currency || 'TWD';

  const colorInput = document.getElementById('setting-stock-color');
  if (colorInput) colorInput.value = appSettings.stock_color_mode || 'tw';

  const statusBox = document.getElementById('settings-sync-status-text');
  if (statusBox) {
    statusBox.innerText = `最後發佈時間: ${appSettings.last_sync_time || '尚未同步'}\n發佈狀態回應: ${appSettings.last_sync_status || '待命中'}`;
  }

  invokeApi('get_data_folder_path').then(path => {
    const pathElem = document.getElementById('local-data-path');
    if (pathElem && path) pathElem.innerText = path;
  }).catch(() => {});
}

async function handleSettingsFormSubmit(e) {
  e.preventDefault();
  const updated = {
    currency: document.getElementById('setting-currency')?.value || 'TWD',
    github_repo: (document.getElementById('setting-repo')?.value || '').trim(),
    github_token: (document.getElementById('setting-token')?.value || '').trim(),
    github_branch: (document.getElementById('setting-branch')?.value || 'main').trim(),
    auto_sync: !!document.getElementById('setting-auto-sync')?.checked,
    stock_color_mode: document.getElementById('setting-stock-color')?.value || 'tw',
    last_sync_time: appSettings.last_sync_time,
    last_sync_status: appSettings.last_sync_status
  };

  try {
    await invokeApi('save_settings', { settings: updated });
    appSettings = updated;
    applyColorModeUI();
    showToast('系統與同步設定已成功儲存！', 'success');
    updateSyncBadgeUI();
    renderStocksTable();
  } catch (err) {
    showToast('儲存設定失敗: ' + err, 'error');
  }
}

async function triggerGitHubSync() {
  const dot = document.getElementById('sidebar-sync-dot');
  const text = document.getElementById('sidebar-sync-text');
  if (dot) dot.classList.add('syncing');
  if (text) text.innerText = '同步中...';

  showToast('正在將資產與股票數據發佈至 GitHub...', 'info');

  try {
    const res = await invokeApi('sync_to_github_now') || {};
    if (res.success) {
      showToast(res.message || '發佈成功！', 'success');
      appSettings.last_sync_time = res.timestamp;
      appSettings.last_sync_status = res.message;
      updateSyncBadgeUI();
    } else {
      showToast(res.message || '同步失敗', 'error');
    }
  } catch (err) {
    showToast('GitHub 請求失敗: ' + err, 'error');
  } finally {
    if (dot) dot.classList.remove('syncing');
    if (text) text.innerText = 'GitHub 雲端同步';
  }
}

function updateSyncBadgeUI() {
  const text = document.getElementById('sidebar-sync-time');
  if (text) {
    text.innerText = appSettings.last_sync_time
      ? `上次: ${appSettings.last_sync_time.split(' ')[1] || appSettings.last_sync_time}`
      : '未同步';
  }
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
// 15. UI Helpers
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
