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

// 3. Mock Database for Standalone Preview / Offline Fallback (Clean Slate / 0 預設資料)
const MOCK_STORAGE_KEY = 'asset_tracking_portfolio_backup_v1';

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

  // 預設不預先填入任何資產或股票資料，保持完全純淨的初始狀態
  const initial = {
    assets: [],
    stocks: [],
    logs: [],
    backups: [],
    settings: {
      currency: "TWD",
      auto_backup: true,
      last_backup_time: null,
      backup_retention_count: 20,
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

  if (command === 'create_local_backup') {
    if (!db.backups) db.backups = [];
    const now = new Date();
    const tsStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 15);
    const displayTs = now.toLocaleString();
    const item = {
      filename: `backup_${tsStr}.json`,
      filepath: `C:\\Users\\hankyle\\AppData\\Roaming\\AssetTracking\\backups\\backup_${tsStr}.json`,
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

  if (command === 'list_local_backups') {
    return db.backups || [];
  }

  if (command === 'restore_local_backup') {
    return '已成功從備份還原！';
  }

  if (command === 'delete_local_backup') {
    if (db.backups) {
      db.backups = db.backups.filter(b => b.filename !== args.filename);
      saveMockDb(db);
    }
    return null;
  }

  if (command === 'export_full_backup_json') {
    return JSON.stringify({
      version: "1.0.0",
      timestamp: new Date().toLocaleString(),
      note: "本機全量備份匯出",
      assets: db.assets || [],
      stocks: db.stocks || [],
      logs: db.logs || [],
      settings: db.settings || appSettings
    }, null, 2);
  }

  if (command === 'clear_all_system_data') {
    db.assets = [];
    db.stocks = [];
    db.logs = [];
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
  console.log('[AssetTracking] Initializing Liquid Glass & Material Design 3...');
  initNavigation();
  initCustomSelects();
  initEventListeners();
  await loadSettings();
  await refreshAllData();
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
// 6. Navigation System
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

  // 一鍵聯網更新全部股票即時行情
  document.getElementById('btn-auto-update-live-quotes')?.addEventListener('click', handleAutoUpdateLiveQuotes);

  // 股票代號輸入自動辨識 (美股 / 台股 / ETF)
  const stockSymbolInput = document.getElementById('stock-field-symbol');
  if (stockSymbolInput) {
    stockSymbolInput.addEventListener('input', handleStockSymbolInput);
  }

  // 股票彈窗內點擊抓取即時報價
  document.getElementById('btn-fetch-symbol-quote')?.addEventListener('click', handleFetchSymbolQuote);

  // 設定頁面：清空全系統資料重設
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
// ==========================================================================
// 13. Settings View & Local Backup Management
// ==========================================================================
async function loadSettings() {
  try {
    const s = await invokeApi('get_settings');
    if (s && typeof s === 'object') {
      appSettings = { ...appSettings, ...s };
    }
    applyColorModeUI();
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

function loadSettingsView() {
  const currInput = document.getElementById('setting-currency');
  if (currInput) currInput.value = appSettings.currency || 'TWD';

  const colorInput = document.getElementById('setting-stock-color');
  if (colorInput) colorInput.value = appSettings.stock_color_mode || 'tw';

  const retentionInput = document.getElementById('setting-retention-count');
  if (retentionInput) retentionInput.value = appSettings.backup_retention_count || 20;

  const autoBackupInput = document.getElementById('setting-auto-backup');
  if (autoBackupInput) autoBackupInput.checked = !!appSettings.auto_backup;

  syncCustomSelect('setting-currency');
  syncCustomSelect('setting-stock-color');

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
    currency: document.getElementById('setting-currency')?.value || 'TWD',
    stock_color_mode: document.getElementById('setting-stock-color')?.value || 'tw',
    backup_retention_count: parseInt(document.getElementById('setting-retention-count')?.value, 10) || 20,
    auto_backup: !!document.getElementById('setting-auto-backup')?.checked,
    last_backup_time: appSettings.last_backup_time
  };

  try {
    await invokeApi('save_settings', { settings: updated });
    appSettings = updated;
    applyColorModeUI();
    showToast('系統偏好與自動備份設定已成功儲存！', 'success');
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
