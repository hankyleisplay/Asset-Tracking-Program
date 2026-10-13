# run.ps1 - 啟動開發伺服器與桌面應用
Write-Host "=== 啟動資產追蹤系統 (Asset Tracking Program) ===" -ForegroundColor Cyan

# 確保環境變數包含必要工具路徑
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# 檢查是否已安裝 node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安裝前端與 CLI 相依套件..." -ForegroundColor Yellow
    npm install
}

Write-Host "啟動 Tauri 開發模式..." -ForegroundColor Green
npx tauri dev
