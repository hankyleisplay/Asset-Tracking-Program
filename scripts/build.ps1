# build.ps1 - 打包發行版應用程式 (EXE)
Write-Host "=== 打包資產追蹤系統 (Asset Tracking Program) ===" -ForegroundColor Cyan

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

if (-not (Test-Path "node_modules")) {
    Write-Host "正在安裝前端與 CLI 相依套件..." -ForegroundColor Yellow
    npm install
}

$env:CARGO_INCREMENTAL = "0"
Write-Host "開始編譯生產版本 (Release Build)..." -ForegroundColor Green
npx tauri build

Write-Host "=== 編譯完成！安裝檔位於 src-tauri\target\release\bundle ===" -ForegroundColor Cyan
