# 📦 資產追蹤系統 (Asset Tracking Program)

[![Built with Tauri](https://img.shields.io/badge/Tauri-v2-blue.svg?logo=tauri)](https://tauri.app/)
[![Powered by Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg?logo=rust)](https://www.rust-lang.org/)
[![Local Storage](https://img.shields.io/badge/Storage-Local%20AppData-emerald.svg)](https://github.com/hankyleisplay/Asset-Tracking-Program)
[![GitHub Sync](https://img.shields.io/badge/GitHub-Auto%20Sync-purple.svg?logo=github)](https://github.com/hankyleisplay/Asset-Tracking-Program)

一套使用 **Tauri v2 + Rust** 開發的高效能跨平台桌面資產追蹤與管理系統。所有核心數據均儲存在本機電腦硬碟，具備完整隱私控制與原子寫入保護，並內建 **GitHub 自動同步機制**，每次資產異動時皆可自動發佈備份至 GitHub 倉庫。

---

## ✨ 核心功能亮點

- 💻 **本機持久化儲存 (Local Storage)**
  - 數據保存在本機使用者目錄（預設 `%APPDATA%\AssetTracking\`），不依賴外部資料庫服務，具備原子性安全寫入，保證斷電或閃退不損壞數據。
- 📉 **智慧折舊與價值試算 (Depreciation Calculation)**
  - 內建直線折舊攤銷演算法，輸入購置日期、原價與預估折舊年限後，系統自動根據今日日期動態計算當前資產現值與累計折舊百分比。
- 🔄 **資產生命週期與異動登記 (Asset Lifecycle & Operations)**
  - 支援資產**借出 (Check-out)**、**歸還 (Check-in)**、**送修 (Maintenance)**、**完修**與**報廢 (Scrap)** 快速作業，並即時變更保管人與地點。
- ⚠️ **保固到期預警 (Warranty Alerts)**
  - 自動篩選 60 天內即將過保之關鍵設備，於儀表板即時警示，方便提前安排續保或設備汰換。
- 📜 **完整審計歷史日誌 (Audit History Logs)**
  - 每一筆資產的建立、編輯、狀態異動與刪除皆有精確的時間戳記、操作者與變更詳情紀錄，企業審計一目了然。
- ☁️ **GitHub 雲端即時同步 (Auto GitHub Sync)**
  - 內建 GitHub REST API 同步引擎，設定 Token 與倉庫後，每次資產異動皆會自動在背景將資料提交（Commit）至 GitHub，兼顧本地隱私與雲端異地備援。
- 📊 **現代化可視化儀表板 (Modern Dashboard)**
  - 統計指標卡片、資產分類佔比進度條、狀態分佈概況、即時搜尋過濾與狀態標籤快速切換。
- 📁 **批次導入與導出 (Data Import & Export)**
  - 支援一鍵匯出繁體中文 UTF-8 BOM CSV 清冊報表與完整 JSON 數據檔，亦支援從 JSON 備份檔批次還原。

---

## 🛠️ 技術架構

```
Asset-Tracking-Program/
├── src-tauri/               # Rust 後端與 Tauri 核心配置
│   ├── src/
│   │   ├── main.rs          # 應用程式主入口與 IPC 指令註冊
│   │   ├── models.rs        # 資料模型 (Asset, AssetLog, AppSettings, DashboardStats)
│   │   ├── storage.rs       # 本地 JSON 資料庫管理器與折舊計算器
│   │   ├── github_sync.rs   # GitHub REST API 備份與自動發佈引擎
│   │   └── commands.rs      # Tauri 前端呼叫接口 (IPC Command Handlers)
│   ├── Cargo.toml           # Rust 依賴套件清單 (Tauri, Serde, Reqwest, Chrono, Uuid)
│   ├── tauri.conf.json      # Tauri 視窗與打包設定
│   └── icons/               # 桌面應用程式圖示
├── ui/                      # 桌面端前端使用者介面
│   ├── index.html           # 現代化單頁 UI 結構
│   ├── styles.css           # 深色磨砂玻璃美學 (Glassmorphism) 樣式
│   └── app.js               # 前端業務邏輯、IPC 通訊與圖表渲染
├── scripts/                 # 便捷管理腳本
│   ├── run.ps1              # 快速啟動開發模式
│   ├── build.ps1            # 打包編譯正式發行 EXE
│   └── sync-to-github.ps1   # 程式碼一鍵推送到 GitHub
├── package.json             # NPM 專案配置
└── README.md                # 專案詳細說明文件
```

---

## 🚀 快速開始

### 1. 環境需求
請確認電腦已安裝：
- [Node.js](https://nodejs.org/) (建議 LTS 版本)
- [Rust & Cargo](https://rustup.rs/)
- C++ 編譯工具鏈（Windows 建議使用 **Visual Studio C++ Build Tools**）

### 2. 安裝相依套件
在專案根目錄執行：
```powershell
npm install
```

### 3. 本地啟動開發模式
```powershell
npm run dev
# 或直接執行:
.\scripts\run.ps1
```
Tauri 將會編譯 Rust 後端並啟動高反應性的桌面視窗應用程式。

### 4. 打包生產版本 (產生 Windows 安裝檔 / EXE)
```powershell
npm run build
# 或直接執行:
.\scripts\build.ps1
```
產出的 Windows 執行檔將位於 `src-tauri/target/release/bundle/`。

---

## ⚙️ GitHub 同步設定說明

1. 開啟應用程式中的 **「GitHub 同步與設定」** 頁面。
2. 填寫 GitHub 倉庫名稱：`hankyleisplay/Asset-Tracking-Program`
3. 填入您的 GitHub Personal Access Token (GHT)（需勾選 `repo` 權限）。
4. 開啟 **「每次改動自動發佈到 GitHub (Auto-Sync)」**。
5. 點擊「儲存設定」或點擊側邊欄/頂部的「同步至 GitHub」按鈕即可即時驗證發佈狀態！

---

## 📄 授權條款
本專案採用 [MIT License](LICENSE) 條款開放。