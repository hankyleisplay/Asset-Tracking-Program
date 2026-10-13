# sync-to-github.ps1 - 將專案程式碼改動發佈並推送到 GitHub 倉庫
param (
    [string]$Message = "更新資產追蹤系統功能與界面"
)

Write-Host "=== 發佈專案改動到 GitHub ===" -ForegroundColor Cyan

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

git add .
$status = git status --porcelain
if ($status) {
    git commit -m $Message
    Write-Host "正在推送至 GitHub: https://github.com/hankyleisplay/Asset-Tracking-Program.git ..." -ForegroundColor Yellow
    git push origin main
    Write-Host "=== 成功發佈至 GitHub！ ===" -ForegroundColor Green
} else {
    Write-Host "沒有需要提交的改動。" -ForegroundColor DarkGray
}
