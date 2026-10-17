#!/usr/bin/env node

/**
 * Asset Tracking Program CLI Launcher
 * Launches the Windows native desktop app (Liquid Glass & Material Design 3)
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

console.log('\x1b[36m%s\x1b[0m', '===========================================================');
console.log('\x1b[35m%s\x1b[0m', '  Asset Tracking Program v2.0.0 (資產與證券追蹤系統)');
console.log('\x1b[36m%s\x1b[0m', '  Liquid Glass & Material Design 3 桌面應用程式');
console.log('\x1b[36m%s\x1b[0m', '===========================================================');

if (process.platform !== 'win32') {
  console.error('\x1b[31m%s\x1b[0m', '❌ 錯誤：Asset Tracking Program 目前僅支援 Windows (x64) 平台。');
  console.log('   手機用戶請至 GitHub Releases 下載 Android APK：');
  console.log('   https://github.com/hankyleisplay/Asset-Tracking-Program/releases/latest\n');
  process.exit(1);
}

const bundledExePath = path.join(__dirname, 'asset-tracking-program.exe');
const fallbackDir = path.join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'AssetTracking', 'bin');
const fallbackExePath = path.join(fallbackDir, 'asset-tracking-program.exe');
const RELEASE_EXE_URL = 'https://github.com/hankyleisplay/Asset-Tracking-Program/releases/download/v2.0.0/asset-tracking-program.exe';

function launchExe(exeTarget) {
  console.log('\x1b[32m%s\x1b[0m', `🚀 正在啟動應用程式: ${exeTarget}`);
  const child = spawn(exeTarget, process.argv.slice(2), {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  console.log('\x1b[32m%s\x1b[0m', '✨ 應用程式已成功啟動！');
  process.exit(0);
}

function downloadBinary(url, dest, callback) {
  console.log('\x1b[33m%s\x1b[0m', '📥 首次執行：正在自 GitHub Releases 下載 Windows 執行檔 (約 13.3 MB)...');
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
          if (pct >= lastPct + 10) {
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

if (fs.existsSync(bundledExePath)) {
  launchExe(bundledExePath);
} else if (fs.existsSync(fallbackExePath)) {
  launchExe(fallbackExePath);
} else {
  downloadBinary(RELEASE_EXE_URL, fallbackExePath, () => {
    launchExe(fallbackExePath);
  });
}
