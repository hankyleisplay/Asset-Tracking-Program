#!/usr/bin/env node

/**
 * Asset Tracking Program CLI Launcher
 * Launches the Windows native desktop app (Liquid Glass & Material Design 3)
 * Automatically sets up Desktop & Start Menu shortcuts for 1-click permanent access.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, execFileSync } = require('child_process');

const VERSION = '2.0.2';
const args = process.argv.slice(2);

if (args.includes('-v') || args.includes('--version')) {
  console.log(`v${VERSION}`);
  process.exit(0);
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
Asset Tracking Program CLI v${VERSION}
Usage:
  npx asset-tracking-program       啟動資產與證券系統桌面版
  atp                              啟動系統 (需先 npm i -g asset-tracking-program)

Options:
  --no-shortcut                    不自動建立桌面捷徑
  --shortcut                       強制重新建立桌面與開始功能表捷徑
  -v, --version                    顯示版本號
  -h, --help                       顯示此說明
`);
  process.exit(0);
}

console.log('\x1b[36m%s\x1b[0m', '===========================================================');
console.log('\x1b[35m%s\x1b[0m', `  Asset Tracking Program v${VERSION} (資產與證券追蹤系統)`);
console.log('\x1b[36m%s\x1b[0m', '  Liquid Glass & Material Design 3 桌面應用程式');
console.log('\x1b[36m%s\x1b[0m', '===========================================================');

if (process.platform !== 'win32') {
  console.error('\x1b[31m%s\x1b[0m', '❌ 錯誤：Asset Tracking Program 桌面版專為 Windows (x64) 設計。');
  console.log('   手機用戶請至 GitHub Releases 下載 Android APK：');
  console.log('   https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest\n');
  process.exit(1);
}

const bundledExePath = path.join(__dirname, 'asset-tracking-program.exe');
const permanentDir = path.join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'AssetTracking', 'bin');
const permanentExePath = path.join(permanentDir, 'asset-tracking-program.exe');
const RELEASE_EXE_URL = `https://github.com/hankyleisplay/Asset-Tracking-Program/releases/download/v2.0.0/asset-tracking-program.exe`;

function ensurePermanentBinary() {
  if (!fs.existsSync(permanentDir)) {
    fs.mkdirSync(permanentDir, { recursive: true });
  }

  // If running from bundled package, copy to permanent directory if not already there or updated
  if (fs.existsSync(bundledExePath)) {
    let needCopy = false;
    if (!fs.existsSync(permanentExePath)) {
      needCopy = true;
    } else {
      const srcStat = fs.statSync(bundledExePath);
      const destStat = fs.statSync(permanentExePath);
      if (srcStat.size !== destStat.size) needCopy = true;
    }
    if (needCopy) {
      try {
        fs.copyFileSync(bundledExePath, permanentExePath);
      } catch (_) {
        // If file locked by running app, keep using bundled
      }
    }
  }
}

function createWindowsShortcut(shortcutPath, targetPath, description) {
  const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
$Shortcut.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
$Shortcut.WorkingDirectory = "${path.dirname(targetPath).replace(/\\/g, '\\\\')}"
$Shortcut.IconLocation = "${targetPath.replace(/\\/g, '\\\\')},0"
$Shortcut.Description = "${description}"
$Shortcut.Save()
`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
    return true;
  } catch (e) {
    return false;
  }
}

function setupShortcuts(exeTarget) {
  if (args.includes('--no-shortcut')) return;

  const force = args.includes('--shortcut');
  const userProfile = process.env.USERPROFILE || '';
  const appData = process.env.APPDATA || '';

  let createdAny = false;

  // 1. Desktop shortcut
  if (userProfile) {
    const desktopPath = path.join(userProfile, 'Desktop', '資產與證券系統.lnk');
    if (force || !fs.existsSync(desktopPath)) {
      if (createWindowsShortcut(desktopPath, exeTarget, '資產與證券追蹤系統 (Liquid Glass & Material Design 3)')) {
        createdAny = true;
      }
    }
  }

  // 2. Start Menu shortcut
  if (appData) {
    const startMenuPath = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', '資產與證券系統.lnk');
    if (force || !fs.existsSync(startMenuPath)) {
      if (createWindowsShortcut(startMenuPath, exeTarget, '資產與證券追蹤系統 (Liquid Glass & Material Design 3)')) {
        createdAny = true;
      }
    }
  }

  if (createdAny) {
    console.log('\x1b[32m%s\x1b[0m', '📌 [捷徑建立] 已自動為您在「桌面」與「開始功能表」建立「資產與證券系統」捷徑圖示！');
  }
}

function launchExe(exeTarget) {
  console.log('\x1b[32m%s\x1b[0m', `🚀 正在啟動應用程式...`);
  setupShortcuts(exeTarget);

  const cleanArgs = args.filter(a => a !== '--shortcut' && a !== '--no-shortcut');
  const child = spawn(exeTarget, cleanArgs, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  console.log('\x1b[32m%s\x1b[0m', '✨ 應用程式已成功啟動！');
  console.log('\x1b[36m%s\x1b[0m', '💡 提示：日後您可直接雙擊【桌面圖示】，或在終端機輸入【atp】隨時開啟系統。');
  process.exit(0);
}

function downloadBinary(url, dest, callback) {
  console.log('\x1b[33m%s\x1b[0m', '📥 正在自 GitHub Releases 獲取 Windows 執行檔 (約 13.3 MB)...');
  if (!fs.existsSync(path.dirname(dest))) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
  }

  const file = fs.createWriteStream(dest);
  const request = (currUrl) => {
    https.get(currUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        request(response.headers.location);
        return;
      }
      if (response.statusCode !== 200) {
        console.error('\x1b[31m%s\x1b[0m', `❌ 下載失敗，HTTP 狀態碼: ${response.statusCode}`);
        process.exit(1);
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastPct = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.floor((downloaded / total) * 100);
          if (pct >= lastPct + 15) {
            lastPct = pct;
            process.stdout.write(`   下載進度: ${pct}% (${(downloaded / (1024 * 1024)).toFixed(1)} MB / ${(total / (1024 * 1024)).toFixed(1)} MB)\r`);
          }
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          console.log('\n\x1b[32m%s\x1b[0m', '✅ 下載完成！');
          callback();
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      console.error('\x1b[31m%s\x1b[0m', `❌ 下載錯誤: ${err.message}`);
      process.exit(1);
    });
  };

  request(url);
}

// 1. Ensure permanent binary location exists
ensurePermanentBinary();

// 2. Determine target executable
if (fs.existsSync(permanentExePath)) {
  launchExe(permanentExePath);
} else if (fs.existsSync(bundledExePath)) {
  launchExe(bundledExePath);
} else {
  downloadBinary(RELEASE_EXE_URL, permanentExePath, () => {
    launchExe(permanentExePath);
  });
}
