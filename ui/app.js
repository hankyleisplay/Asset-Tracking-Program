// Asset Tracking Program - Client Logic

// Check if running inside Tauri
const isTauri = !!(window.__TAURI__ && window.__TAURI__.core);

// IPC Helper
async function invokeApi(command, args = {}) {
  if (isTauri) {
    try {
      return await window.__TAURI__.core.invoke(command, args);
    } catch (err) {
      console.error(`Tauri command [${command}] failed:`, err);
      throw err;
    }
  } else {
    // Mock / LocalStorage Fallback for browser preview
    return mockApi(command, args);
  }
}

// Mock fallback for browser dev preview
const MOCK_STORAGE_KEY = 'asset_tracking_mock_db';
function getMockDb() {
  const existing = localStorage.getItem(MOCK_STORAGE_KEY);
  if (existing) {
    return JSON.parse(existing);
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
        notes: "工程開發主要筆電，附原廠140W充電器",
        tags: ["筆電", "高階開發"],
        created_at: "2026-10-13 10:00:00",
        updated_at: "2026-10-13 10:00:00"
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
        notes: "支援Type-C 90W供電與RJ-45網路",
        tags: ["螢幕", "外接顯示器"],
        created_at: "2026-10-13 10:00:00",
        updated_at: "2026-10-13 10:00:00"
      },
      {
        id: "AST-2026-003",
        name: "Herman Miller Aeron 人體工學旗艦椅",
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
        created_at: "2026-10-13 10:00:00",
        updated_at: "2026-10-13 10:00:00"
      },
      {
        id: "AST-2026-004",
        name: "Sony A7 IV 全片幅無反單眼相機",
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
        notes: "借出時間: 2026-10-10",
        tags: ["相機", "攝影器材"],
        created_at: "2026-10-13 10:00:00",
        updated_at: "2026-10-13 10:00:00"
      },
      {
        id: "AST-2026-005",
        name: "iPad Pro 13吋 (M4 / 256GB)",
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
        created_at: "2026-10-13 10:00:00",
        updated_at: "2026-10-13 10:00:00"
      }
    ],
    logs: [
      {
        id: "log-1",
        asset_id: "AST-2026-001",
        asset_name: "MacBook Pro 16吋",
        action: "建立",
        operator: "系統管理員",
        details: "初始資產建檔完成",
        timestamp: "2026-10-13 10:00:00"
      },
      {
        id: "log-2",
        asset_id: "AST-2026-004",
        asset_name: "Sony A7 IV 相機",
        action: "借出",
        operator: "設備管理員",
        details: "借調至行銷部拍攝戶外宣傳片",
        timestamp: "2026-10-13 11:20:00"
      }
    ],
    settings: {
      currency: "TWD",
      github_repo: "hankyleisplay/Asset-Tracking-Program",
      github_token: "",
      github_branch: "main",
      auto_sync: true,
      last_sync_time: "2026-10-13 12:00:00",
      last_sync_status: "本機預覽模式 (成功模擬)"
    }
  };
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveMockDb(db) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
}

function mockApi(command, args) {
  const db = getMockDb();
  if (command === 'get_assets') return db.assets;
  if (command === 'get_audit_logs') return db.logs;
  if (command === 'get_settings') return db.settings;
  if (command === 'save_settings') {
    db.settings = args.settings;
    saveMockDb(db);
    return null;
  }
  if (command === 'get_dashboard_stats') {
    const totalCount = db.assets.length;
    let totalOrig = 0, totalCurr = 0, borrowed = 0, repairing = 0;
    const statusDist = {}, catDist = {};
    db.assets.forEach(a => {
      totalOrig += a.purchase_price || 0;
      totalCurr += a.current_value || 0;
      statusDist[a.status] = (statusDist[a.status] || 0) + 1;
      catDist[a.category] = (catDist[a.category] || 0) + 1;
      if (a.status === '外借中') borrowed++;
      if (a.status === '維修中') repairing++;
    });
    return {
      total_count: totalCount,
      total_original_value: totalOrig,
      total_current_value: totalCurr,
      status_distribution: statusDist,
      category_distribution: catDist,
      expiring_warranty_count: 1,
      borrowed_count: borrowed,
      repairing_count: repairing,
      recent_logs: db.logs.slice(0, 10)
    };
  }
  if (command === 'save_asset') {
    const a = args.asset;
    const idx = db.assets.findIndex(x => x.id === a.id);
    if (idx >= 0) db.assets[idx] = a;
    else db.assets.push(a);
    db.logs.unshift({
      id: 'log-' + Date.now(),
      asset_id: a.id,
      asset_name: a.name,
      action: idx >= 0 ? "修改" : "建立",
      operator: args.operator || "使用者",
      details: `${idx >= 0 ? "修改" : "建立"}資產資料: ${a.name}`,
      timestamp: new Date().toLocaleString()
    });
    saveMockDb(db);
    return a;
  }
  if (command === 'delete_asset') {
    const idx = db.assets.findIndex(x => x.id === args.id);
    if (idx >= 0) {
      const removed = db.assets.splice(idx, 1)[0];
      db.logs.unshift({
        id: 'log-' + Date.now(),
        asset_id: args.id,
        asset_name: removed.name,
        action: "刪除",
        operator: args.operator || "使用者",
        details: `已自系統刪除資產: ${removed.name}`,
        timestamp: new Date().toLocaleString()
      });
      saveMockDb(db);
    }
    return null;
  }
  if (command === 'update_asset_status') {
    const a = db.assets.find(x => x.id === args.id);
    if (a) {
      a.status = args.new_status;
      if (args.new_status === '已報廢') a.current_value = 0;
      db.logs.unshift({
        id: 'log-' + Date.now(),
        asset_id: args.id,
        asset_name: a.name,
        action: args.action_type,
        operator: args.operator || "設備管理員",
        details: `狀態變更為 [${args.new_status}] ${args.notes || ''}`,
        timestamp: new Date().toLocaleString()
      });
      saveMockDb(db);
      return a;
    }
    throw new Error("Asset not found");
  }
  if (command === 'sync_to_github_now') {
    const now = new Date().toLocaleString();
    db.settings.last_sync_time = now;
    db.settings.last_sync_status = "成功發佈最新資產數據至 GitHub 倉庫: hankyleisplay/Asset-Tracking-Program";
    saveMockDb(db);
    return {
      success: true,
      message: db.settings.last_sync_status,
      timestamp: now,
      commit_sha: "simulated-sha-" + Date.now().toString(16)
    };
  }
  if (command === 'export_assets_csv') {
    let csv = "\uFEFF資產編號,資產名稱,分類,狀態,保管人,購買價格,現值\n";
    db.assets.forEach(a => {
      csv += `"${a.id}","${a.name}","${a.category}","${a.status}","${a.custodian}",${a.purchase_price},${a.current_value}\n`;
    });
    return csv;
  }
  if (command === 'export_assets_json') {
    return JSON.stringify(db.assets, null, 2);
  }
  if (command === 'get_data_folder_path') {
    return "%APPDATA%\\AssetTracking";
  }
  return null;
}

// Global App State
let allAssets = [];
let filteredAssets = [];
let currentFilterStatus = '全部';
let currentFilterCategory = '全部';
let searchQuery = '';
let appSettings = {};

// DOM Elements
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initEventListeners();
  await loadSettings();
  await refreshAllData();
});

// Navigation Handling
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetView = item.getAttribute('data-view');
      const targetSection = document.getElementById(targetView);
      if (targetSection) {
        targetSection.classList.add('active');
      }

      // Update Header Title
      const pageTitle = item.querySelector('span').innerText;
      document.getElementById('header-title').innerText = pageTitle;

      if (targetView === 'view-dashboard') renderDashboard();
      if (targetView === 'view-assets') renderAssetsTable();
      if (targetView === 'view-logs') loadLogs();
      if (targetView === 'view-settings') loadSettingsView();
    });
  });
}

// Event Listeners
function initEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }

  // Category filter
  const catSelect = document.getElementById('category-filter');
  if (catSelect) {
    catSelect.addEventListener('change', (e) => {
      currentFilterCategory = e.target.value;
      applyFilters();
    });
  }

  // Status Chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilterStatus = chip.getAttribute('data-status');
      applyFilters();
    });
  });

  // Modal open button
  document.getElementById('btn-add-asset')?.addEventListener('click', () => {
    openAssetModal();
  });
  document.getElementById('btn-add-asset-top')?.addEventListener('click', () => {
    openAssetModal();
  });

  // Quick Sync Button in Header & Sidebar
  document.getElementById('btn-header-sync')?.addEventListener('click', triggerGitHubSync);
  document.getElementById('btn-sidebar-sync')?.addEventListener('click', triggerGitHubSync);

  // Modal Close buttons
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
    });
  });

  // Form submit
  document.getElementById('asset-form')?.addEventListener('submit', handleAssetFormSubmit);
  document.getElementById('settings-form')?.addEventListener('submit', handleSettingsFormSubmit);
  document.getElementById('operation-form')?.addEventListener('submit', handleOperationFormSubmit);

  // Dynamic Depreciation preview in form
  const priceInput = document.getElementById('field-price');
  const yearsInput = document.getElementById('field-years');
  const dateInput = document.getElementById('field-purchase-date');
  [priceInput, yearsInput, dateInput].forEach(elem => {
    elem?.addEventListener('input', updateDepreciationPreview);
  });

  // Export buttons
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCsv);
  document.getElementById('btn-export-json')?.addEventListener('click', exportJson);
  document.getElementById('file-import-json')?.addEventListener('change', handleImportJson);
}

// Refresh Data
async function refreshAllData() {
  try {
    allAssets = await invokeApi('get_assets');
    applyFilters();
    await renderDashboard();
  } catch (err) {
    showToast('載入數據失敗: ' + err, 'error');
  }
}

// Apply Filters & Search
function applyFilters() {
  filteredAssets = allAssets.filter(asset => {
    // Status filter
    if (currentFilterStatus !== '全部' && asset.status !== currentFilterStatus) {
      return false;
    }
    // Category filter
    if (currentFilterCategory !== '全部' && asset.category !== currentFilterCategory) {
      return false;
    }
    // Search query
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

// Render Asset Table
function renderAssetsTable() {
  const tbody = document.getElementById('assets-tbody');
  if (!tbody) return;

  if (filteredAssets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-dim);">
          <i class="fa-solid fa-box-open" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
          查無相符的資產項目
        </td>
      </tr>
    `;
    return;
  }

  const currencySymbol = appSettings.currency === 'USD' ? '$' : 'NT$';

  tbody.innerHTML = filteredAssets.map(asset => {
    const badgeClass = getBadgeClass(asset.status);
    const deprPercent = asset.purchase_price > 0 
      ? Math.max(0, Math.min(100, Math.round((asset.current_value / asset.purchase_price) * 100)))
      : 100;

    return `
      <tr>
        <td>
          <span style="font-family: monospace; font-weight: 600; color: #818cf8;">${escapeHtml(asset.id)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(asset.name)}</div>
          <div style="font-size: 11px; color: var(--text-dim);">
            ${escapeHtml(asset.brand || '')} ${escapeHtml(asset.model || '')} 
            ${asset.serial_number ? `· S/N: ${escapeHtml(asset.serial_number)}` : ''}
          </div>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(asset.category)}</span>
        </td>
        <td>
          <span class="badge ${badgeClass}">${escapeHtml(asset.status)}</span>
        </td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(asset.custodian || '未指派')}</div>
          <div style="font-size: 11px; color: var(--text-dim);">${escapeHtml(asset.location || '—')}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${currencySymbol}${formatMoney(asset.current_value)}</div>
          <div style="font-size: 11px; color: var(--text-dim);">
            原價: ${currencySymbol}${formatMoney(asset.purchase_price)} (${deprPercent}%)
          </div>
          <div class="progress-track" style="margin-top: 4px; height: 4px; width: 80px;">
            <div class="progress-fill" style="width: ${deprPercent}%;"></div>
          </div>
        </td>
        <td>
          <span style="font-size: 12px; color: ${isWarrantyNear(asset.warranty_date) ? 'var(--warning)' : 'var(--text-muted)'};">
            ${escapeHtml(asset.warranty_date || '—')}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openOperationModal('${asset.id}')" title="異動 / 借還 / 送修">
              <i class="fa-solid fa-arrows-rotate"></i>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="editAsset('${asset.id}')" title="編輯">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteAsset('${asset.id}', '${escapeHtml(asset.name)}')" title="刪除">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Dashboard
async function renderDashboard() {
  try {
    const stats = await invokeApi('get_dashboard_stats');
    const currency = appSettings.currency === 'USD' ? '$' : 'NT$';

    document.getElementById('stat-total-count').innerText = stats.total_count;
    document.getElementById('stat-original-val').innerText = `${currency}${formatMoney(stats.total_original_value)}`;
    document.getElementById('stat-current-val').innerText = `${currency}${formatMoney(stats.total_current_value)}`;
    document.getElementById('stat-attention').innerText = (stats.borrowed_count + stats.repairing_count + stats.expiring_warranty_count);

    // Category Distribution
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
      }).join('') || '<div style="color: var(--text-dim); padding: 20px 0;">暫無資產分類數據</div>';
    }

    // Status Distribution
    const statusContainer = document.getElementById('status-distribution-box');
    if (statusContainer) {
      const statuses = Object.entries(stats.status_distribution || {});
      statusContainer.innerHTML = statuses.map(([status, count]) => {
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
            <span class="badge ${getBadgeClass(status)}">${escapeHtml(status)}</span>
            <span style="font-weight: 600; font-size: 14px;">${count}</span>
          </div>
        `;
      }).join('');
    }

    // Recent Logs on Dashboard
    const recentLogsContainer = document.getElementById('dashboard-recent-logs');
    if (recentLogsContainer) {
      recentLogsContainer.innerHTML = (stats.recent_logs || []).slice(0, 5).map(log => `
        <div class="log-item">
          <span class="log-badge ${getActionBadgeClass(log.action)}">${escapeHtml(log.action)}</span>
          <div class="log-content">
            <div style="font-weight: 500;">${escapeHtml(log.details)}</div>
            <div class="log-time">${escapeHtml(log.timestamp)} · 操作者: ${escapeHtml(log.operator)}</div>
          </div>
        </div>
      `).join('') || '<div style="color: var(--text-dim);">暫無近期日誌</div>';
    }

  } catch (err) {
    console.error('Failed to render dashboard:', err);
  }
}

// Load Audit Logs View
async function loadLogs() {
  try {
    const logs = await invokeApi('get_audit_logs');
    const logsContainer = document.getElementById('full-logs-container');
    if (!logsContainer) return;

    logsContainer.innerHTML = logs.map(log => `
      <div class="log-item" style="padding: 14px; background: rgba(30, 41, 59, 0.4); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color);">
        <span class="log-badge ${getActionBadgeClass(log.action)}">${escapeHtml(log.action)}</span>
        <div class="log-content">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: var(--text-main);">${escapeHtml(log.asset_name)} (${escapeHtml(log.asset_id)})</strong>
            <span class="log-time">${escapeHtml(log.timestamp)}</span>
          </div>
          <div style="margin-top: 4px; color: var(--text-muted);">${escapeHtml(log.details)}</div>
          <div style="margin-top: 4px; font-size: 11px; color: var(--text-dim);">操作者: ${escapeHtml(log.operator)}</div>
        </div>
      </div>
    `).join('') || '<div style="color: var(--text-dim); text-align: center; padding: 40px;">尚無異動審計日誌</div>';
  } catch (err) {
    showToast('載入日誌失敗: ' + err, 'error');
  }
}

// Load Settings
async function loadSettings() {
  try {
    appSettings = await invokeApi('get_settings');
    updateSyncBadgeUI();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function loadSettingsView() {
  document.getElementById('setting-repo').value = appSettings.github_repo || '';
  document.getElementById('setting-token').value = appSettings.github_token || '';
  document.getElementById('setting-branch').value = appSettings.github_branch || 'main';
  document.getElementById('setting-auto-sync').checked = !!appSettings.auto_sync;
  document.getElementById('setting-currency').value = appSettings.currency || 'TWD';

  const statusBox = document.getElementById('settings-sync-status-text');
  if (statusBox) {
    statusBox.innerText = `最後同步時間: ${appSettings.last_sync_time || '尚未同步'}\n狀態說明: ${appSettings.last_sync_status || '待命'}`;
  }

  // Load Data folder path
  invokeApi('get_data_folder_path').then(path => {
    document.getElementById('local-data-path').innerText = path;
  });
}

async function handleSettingsFormSubmit(e) {
  e.preventDefault();
  const updated = {
    currency: document.getElementById('setting-currency').value,
    github_repo: document.getElementById('setting-repo').value.trim(),
    github_token: document.getElementById('setting-token').value.trim(),
    github_branch: document.getElementById('setting-branch').value.trim() || 'main',
    auto_sync: document.getElementById('setting-auto-sync').checked,
    last_sync_time: appSettings.last_sync_time,
    last_sync_status: appSettings.last_sync_status
  };

  try {
    await invokeApi('save_settings', { settings: updated });
    appSettings = updated;
    showToast('系統設定已成功儲存！', 'success');
    updateSyncBadgeUI();
  } catch (err) {
    showToast('儲存設定失敗: ' + err, 'error');
  }
}

// Trigger GitHub Sync
async function triggerGitHubSync() {
  const dot = document.getElementById('sidebar-sync-dot');
  const text = document.getElementById('sidebar-sync-text');
  if (dot) dot.classList.add('syncing');
  if (text) text.innerText = '同步中...';

  showToast('正在與 GitHub 連線發佈最新資產數據...', 'info');

  try {
    const res = await invokeApi('sync_to_github_now');
    if (res.success) {
      showToast(res.message, 'success');
      appSettings.last_sync_time = res.timestamp;
      appSettings.last_sync_status = res.message;
      updateSyncBadgeUI();
    } else {
      showToast(res.message, 'error');
    }
  } catch (err) {
    showToast('GitHub 同步請求失敗: ' + err, 'error');
  } finally {
    if (dot) dot.classList.remove('syncing');
    if (text) text.innerText = 'GitHub 同步';
  }
}

function updateSyncBadgeUI() {
  const text = document.getElementById('sidebar-sync-time');
  if (text) {
    text.innerText = appSettings.last_sync_time ? `上次: ${appSettings.last_sync_time.split(' ')[1] || appSettings.last_sync_time}` : '未同步';
  }
}

// Asset Modal Open / Edit
function openAssetModal(asset = null) {
  const modal = document.getElementById('modal-asset');
  const title = document.getElementById('modal-asset-title');

  if (asset) {
    title.innerText = '編輯資產資料';
    document.getElementById('field-id').value = asset.id;
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
    title.innerText = '新增資產建檔';
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

window.editAsset = function(id) {
  const asset = allAssets.find(a => a.id === id);
  if (asset) {
    openAssetModal(asset);
  }
};

function updateDepreciationPreview() {
  const price = parseFloat(document.getElementById('field-price')?.value) || 0;
  const years = parseInt(document.getElementById('field-years')?.value) || 3;
  const pDateStr = document.getElementById('field-purchase-date')?.value;
  const previewElem = document.getElementById('depreciation-preview');
  if (!previewElem) return;

  if (price <= 0 || years <= 0 || !pDateStr) {
    previewElem.innerText = `預估殘值: NT$${formatMoney(price)}`;
    return;
  }

  const pDate = new Date(pDateStr);
  const now = new Date();
  const elapsedYears = Math.max(0, (now - pDate) / (1000 * 60 * 60 * 24 * 365.25));
  const ratio = Math.min(1.0, elapsedYears / years);
  const current = Math.max(0, price * (1.0 - ratio));

  previewElem.innerText = `依折舊公式預估現值: NT$${formatMoney(Math.round(current))} (已折舊 ${(ratio * 100).toFixed(1)}%)`;
}

async function handleAssetFormSubmit(e) {
  e.preventDefault();
  const tagsRaw = document.getElementById('field-tags').value;
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  const asset = {
    id: document.getElementById('field-id').value.trim(),
    name: document.getElementById('field-name').value.trim(),
    category: document.getElementById('field-category').value,
    brand: document.getElementById('field-brand').value.trim(),
    model: document.getElementById('field-model').value.trim(),
    serial_number: document.getElementById('field-sn').value.trim(),
    purchase_date: document.getElementById('field-purchase-date').value,
    purchase_price: parseFloat(document.getElementById('field-price').value) || 0,
    current_value: 0, // will be recalculated by backend
    depreciation_years: parseInt(document.getElementById('field-years').value) || 3,
    status: document.getElementById('field-status').value,
    location: document.getElementById('field-location').value.trim(),
    department: document.getElementById('field-dept').value.trim(),
    custodian: document.getElementById('field-custodian').value.trim(),
    warranty_date: document.getElementById('field-warranty').value || null,
    notes: document.getElementById('field-notes').value.trim(),
    tags: tags,
    created_at: "",
    updated_at: ""
  };

  try {
    const saved = await invokeApi('save_asset', { asset, operator: "使用者" });
    showToast(`資產 [${saved.name}] 儲存成功！已寫入本地儲存`, 'success');
    document.getElementById('modal-asset').classList.remove('open');
    await refreshAllData();
  } catch (err) {
    showToast('儲存資產失敗: ' + err, 'error');
  }
}

// Delete Asset
window.confirmDeleteAsset = async function(id, name) {
  if (confirm(`確定要刪除資產 [${name}] (${id}) 嗎？此操作將在本地與雲端記錄審計日誌。`)) {
    try {
      await invokeApi('delete_asset', { id, operator: "使用者" });
      showToast(`已成功刪除資產 [${name}]`, 'info');
      await refreshAllData();
    } catch (err) {
      showToast('刪除資產失敗: ' + err, 'error');
    }
  }
};

// Operations Modal (借出/歸還/維修/報廢)
window.openOperationModal = function(id) {
  const asset = allAssets.find(a => a.id === id);
  if (!asset) return;

  const modal = document.getElementById('modal-operation');
  document.getElementById('op-asset-id').value = asset.id;
  document.getElementById('op-asset-name-display').innerText = `${asset.name} (${asset.id}) - 目前狀態: ${asset.status}`;
  document.getElementById('op-new-status').value = asset.status === '在用中' ? '外借中' : '在用中';
  document.getElementById('op-notes').value = '';
  document.getElementById('op-custodian').value = asset.custodian || '';

  modal.classList.add('open');
};

async function handleOperationFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('op-asset-id').value;
  const newStatus = document.getElementById('op-new-status').value;
  const actionType = document.getElementById('op-action-type').value;
  const notes = document.getElementById('op-notes').value.trim();
  const operator = document.getElementById('op-operator').value.trim() || '設備管理員';

  try {
    await invokeApi('update_asset_status', {
      id,
      new_status: newStatus,
      action_type: actionType,
      notes,
      operator
    });
    showToast(`資產狀態已更新為 [${newStatus}]！`, 'success');
    document.getElementById('modal-operation').classList.remove('open');
    await refreshAllData();
  } catch (err) {
    showToast('更新狀態失敗: ' + err, 'error');
  }
}

// Export / Import
async function exportCsv() {
  try {
    const csvContent = await invokeApi('export_assets_csv');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `資產清冊備份_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('已匯出 CSV 資產清冊報表', 'success');
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
    a.download = `資產清冊備份_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('已匯出 JSON 本地數據檔', 'success');
  } catch (err) {
    showToast('匯出 JSON 失敗: ' + err, 'error');
  }
}

async function handleImportJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      const count = await invokeApi('import_assets_json', { json_str: content, operator: "批次匯入員" });
      showToast(`成功匯入 ${count} 筆資產資料！`, 'success');
      await refreshAllData();
    } catch (err) {
      showToast('匯入失敗: ' + err, 'error');
    }
  };
  reader.readAsText(file);
}

// Helpers
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
    case '建立': return 'badge-inuse';
    case '修改': return 'badge-idle';
    case '借出': return 'badge-borrow';
    case '歸還': return 'badge-inuse';
    case '送修': return 'badge-repair';
    case '完修': return 'badge-inuse';
    case '報廢': return 'badge-scrapped';
    case '刪除': return 'badge-scrapped';
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
    .replace(/"/g, '&quot;');
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
  }, 4000);
}
