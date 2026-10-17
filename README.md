# 📦 資產與證券追蹤系統 (Asset Tracking Program)

[![Built with Tauri](https://img.shields.io/badge/Tauri-v2-blue.svg?logo=tauri)](https://tauri.app/)
[![Powered by Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg?logo=rust)](https://www.rust-lang.org/)
[![Local Storage](https://img.shields.io/badge/Storage-100%25%20Local%20Safe-emerald.svg)](https://github.com/hankyleisplay/Asset-Tracking-Program)
[![Mobile Sync](https://img.shields.io/badge/Sync-LAN%20Wi--Fi%202--Way-cyan.svg)](https://github.com/hankyleisplay/Asset-Tracking-Program)
[![WinGet Package](https://img.shields.io/badge/WinGet-hankyle.AssetTrackingProgram-0078D4.svg?logo=windows)](https://github.com/microsoft/winget-pkgs/pull/454574)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一套專為個人與工作室設計的高效能**實體固定資產、全球證券股票投資、被動現金流與財務目標追蹤管理系統**。
採用 **Tauri v2 + Rust** 與 **Liquid Glass & Material Design 3** 現代磨砂玻璃視覺風格開發。

> **🔒 100% 本地隱私與安全**：所有資產、持股與日誌資料皆 **100% 儲存在您的本機電腦硬碟**（預設 `%APPDATA%\AssetTracking\`），具備本地自動快照備份保護，**已完全移除任何第三方雲端（如 GitHub 等）的數據同步**，確保您的私人財務與資產數據絕對安全不外洩！

---

## ✨ 核心功能亮點

### 1. 🏢 實體固定資產管理與智慧折舊
- **動態折舊試算**：輸入購置日期、原價與折舊年限，直線折舊演算法即時推算設備現值與累計折舊率。
- **資產生命週期維護**：支援借出、歸還、送修、完修、報廢等快速異動，即時變更保管人與地點。
- **🏷️ QR 盤點標籤卡產生器**：一鍵產生每項實體設備的專屬 2D 矩陣 QR 標籤卡，可直接列印貼於設備上盤點。
- **完整審計歷史日誌**：每次資產異動均留下時間戳記、操作者與詳細變更摘要。

### 2. 📈 全球證券股票投資組合追蹤
- **代號智慧辨識**：輸入股票代號自動辨識台股（含台股 ETF）或美股（含美股 ETF），自動切換計價幣別與即時匯率。
- **一鍵聯網更新最新行情**：連線金融市場即時更新現價，自動計算總成本、總市值、未實現損益與 ROI 報酬率。
- **紅綠配色自訂**：支援台灣股市習慣（紅漲綠跌）與國際美股習慣（綠漲紅跌）一鍵切換。

### 3. 📱 手機版 APK 與電腦區網 Wi-Fi 雙向同步
- **手機端自由新增 / 編輯 / 刪除**：外出時手機版可獨立離線建檔與查閱。
- **三種同步模式**：
  - 🔄 **雙向智慧合併**：以最新修改時間戳記智慧合併手機與電腦雙方新增或變更的項目。
  - ⬆️ **推送手機修改至電腦**：以手機最新數據完整覆蓋同步至電腦端。
  - ⬇️ **從電腦拉取最新資料**：一鍵將電腦端的完整資料庫同步下載到手機。
- **免安裝掃碼即連**：電腦版內建區網伺服器（預設 Port `18888`），手機鏡頭掃描畫面上顯示的 QR Code 即可秒開行動端。

### 4. 💎 財富增值與現金流實驗室
- **💰 股息與被動收入帳本**：詳細記錄現金股利、股票配息、債息與租金收入，統計扣稅實領台幣淨額與月均被動現金流。
- **🎯 財富目標與里程碑**：設定第一桶金、退休準備金或設備汰換基金，彩色進度條視覺化追蹤達成率。
- **🧮 定期定額複利試算機**：試算每月投資之期末資產、累積本金與獲利，以及依 4% 法則每月可提領退休金。
- **⚖️ 資產配置再平衡試算器**：輸入股票與實體資產的目標比例，系統自動給出加碼/減碼金額建議。
- **🔔 智慧到期與異動預警**：自動掃描保固即將到期/已過期設備、送修中/外借中資產，以及持股大跌停損或大漲獲利提示。

### 5. 🎨 Liquid Glass 主題工坊
- 內建 **6 款磨砂玻璃主題**：深海極光 (Ocean)、翡翠森林 (Emerald)、紫晶星雲 (Amethyst)、黑金琥珀 (Amber)、緋紅霓虹 (Crimson)、冰川青瓷 (Glacier)。
- **自訂調色盤**：自訂主色調與次要強調色。
- **4 段毛玻璃模糊強度**：Low / Medium / High / Ultra 自由調節。

### 6. 🛡️ 本地備份與自動更新中心
- **本機快照備份**：一鍵建立全系統時間戳記快照，支援備份列表管理、一鍵還原與備份檔 (.json) 匯出/匯入。
- **🔄 自動檢查更新**：啟動時自動比對 GitHub Releases 最新版本，提供一鍵下載安裝升級。

---

## 🚀 下載與安裝方式

### 方式 1：Windows 官方套件管理員 (WinGet 一鍵安裝)
Windows 10 / 11 系統可直接於 PowerShell 或 Windows Terminal 執行以下指令自動完成下載與安裝：
```powershell
winget install hankyle.AssetTrackingProgram
```
> 📌 *已提交至微軟官方社群倉庫 [microsoft/winget-pkgs#454574](https://github.com/microsoft/winget-pkgs/pull/454574) 審核中。*

### 方式 2：下載 Windows 電腦版安裝檔或免安裝版
前往 [GitHub Releases 最新發布頁面 (v2.0.0)](https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest)：
- **推薦安裝版 (NSIS Setup)**：下載 `Asset.Tracking.Program_2.0.0_x64-setup.exe`，標準 Windows 桌面程式安裝精靈，自動建立桌面捷徑並整合完整更新支援。
- **免安裝版 (Portable Single EXE)**：下載 `asset-tracking-program.exe`，免安裝直接雙擊即可使用。

### 方式 3：Android 行動版
- **原生 APK 安裝包**：下載 `Asset-Tracking-Mobile_v2.0.0.apk` 安裝至 Android 手機。
- **免安裝區網直連**：在電腦版開啟「手機 APK 與同步」功能，手機連上同一個 Wi-Fi 掃描螢幕上的 QR Code 即可免安裝開啟 Web 介面。

---

## 🛠️ 開發與編譯

### 環境需求
- [Node.js](https://nodejs.org/) (建議 v18+)
- [Rust & Cargo](https://rustup.rs/) (建議 1.80+)
- Windows C++ Build Tools (Visual Studio)

### 本地啟動開發模式
```bash
npm install
npm run dev
```

### 本地編譯生產安裝包
```bash
npm run build
```

---

## 📄 授權條款
本專案採用 [MIT License](LICENSE) 開放授權。