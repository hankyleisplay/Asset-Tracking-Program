use crate::models::{AppSettings, Asset, AssetLog, StockAsset, SyncResult};
use base64::prelude::*;
use chrono::Local;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde_json::json;

pub struct GitHubSyncEngine;

impl GitHubSyncEngine {
    fn clean_repo_string(raw: &str) -> (String, String) {
        let trimmed = raw
            .trim()
            .trim_end_matches(".git")
            .trim_start_matches("https://github.com/")
            .trim_start_matches("http://github.com/")
            .trim_start_matches("github.com/");
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() >= 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            ("hankyleisplay".to_string(), "Asset-Tracking-Program".to_string())
        }
    }

    pub async fn sync_to_github(
        settings: &AppSettings,
        assets: &[Asset],
        stocks: &[StockAsset],
        logs: &[AssetLog],
    ) -> SyncResult {
        let (owner, repo) = Self::clean_repo_string(&settings.github_repo);
        let token = settings.github_token.trim();
        let branch = if settings.github_branch.is_empty() {
            "main"
        } else {
            &settings.github_branch
        };

        if token.is_empty() {
            return SyncResult {
                success: false,
                message: "未設定 GitHub Token (GHT)".to_string(),
                timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                commit_sha: None,
            };
        }

        let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let total_assets_value: f64 = assets.iter().map(|a| a.current_value).sum();
        let total_stocks_value: f64 = stocks.iter().map(|s| s.market_value_twd).sum();
        let total_stocks_cost: f64 = stocks.iter().map(|s| s.total_cost_twd).sum();
        let total_stocks_pnl = total_stocks_value - total_stocks_cost;
        let total_net_worth = total_assets_value + total_stocks_value;

        // 1. Prepare JSON backup
        let backup_payload = json!({
            "updated_at": now_str,
            "total_assets": assets.len(),
            "total_stocks": stocks.len(),
            "total_net_worth_twd": total_net_worth,
            "assets": assets,
            "stocks": stocks,
            "recent_logs": logs.iter().take(50).collect::<Vec<_>>()
        });

        let json_content = match serde_json::to_string_pretty(&backup_payload) {
            Ok(s) => s,
            Err(e) => {
                return SyncResult {
                    success: false,
                    message: format!("序列化數據失敗: {}", e),
                    timestamp: now_str,
                    commit_sha: None,
                }
            }
        };

        // 2. Prepare Human-readable Markdown inventory report
        let mut md_report = String::new();
        md_report.push_str("# 💎 資產追蹤與證券投資即時備份報告 (Asset Tracking & Portfolio Report)\n\n");
        md_report.push_str(&format!("- **最後同步時間**: {}\n", now_str));
        md_report.push_str(&format!("- **總淨資產估值**: NT$ {:.2}\n", total_net_worth));
        md_report.push_str(&format!("- **實體固定資產**: {} 筆 (預估現值 NT$ {:.2})\n", assets.len(), total_assets_value));
        md_report.push_str(&format!("- **證券投資標的**: {} 筆 (總市值 NT$ {:.2} / 未實現損益 NT$ {:+.2})\n\n", stocks.len(), total_stocks_value, total_stocks_pnl));

        md_report.push_str("## 📈 證券股票投資組合 (Stock & Securities Portfolio)\n\n");
        md_report.push_str("| 代號 | 名稱 | 市場 | 持有股數 | 買進均價 | 當前市價 | 幣別 | 投資市值 (TWD) | 未實現損益 (TWD) | 報酬率 |\n");
        md_report.push_str("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n");
        for s in stocks {
            let pnl_sign = if s.unrealized_pnl_twd >= 0.0 { "+" } else { "" };
            md_report.push_str(&format!(
                "| {} | {} | {} | {:.2} | {:.2} | {:.2} | {} | NT$ {:.2} | {}{:.2} | {}{:.2}% |\n",
                s.symbol, s.name, s.market, s.shares, s.buy_price, s.current_price, s.currency, s.market_value_twd, pnl_sign, s.unrealized_pnl_twd, pnl_sign, s.return_rate
            ));
        }
        md_report.push_str("\n---\n\n");

        md_report.push_str("## 🏢 實體固定資產清冊 (Physical Assets Inventory)\n\n");
        md_report.push_str("| 資產編號 | 名稱 | 分類 | 狀態 | 保管人 | 存放地點 | 購買價格 (TWD) | 當前預估現值 |\n");
        md_report.push_str("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n");
        for a in assets {
            md_report.push_str(&format!(
                "| {} | {} | {} | {} | {} | {} | NT$ {:.2} | NT$ {:.2} |\n",
                a.id, a.name, a.category, a.status, a.custodian, a.location, a.purchase_price, a.current_value
            ));
        }

        // Upload both files via GitHub API
        let client = match reqwest::Client::builder().build() {
            Ok(c) => c,
            Err(e) => {
                return SyncResult {
                    success: false,
                    message: format!("建立 HTTP 客戶端失敗: {}", e),
                    timestamp: now_str,
                    commit_sha: None,
                }
            }
        };

        let upload_res = Self::upload_file(
            &client,
            &owner,
            &repo,
            branch,
            token,
            "data/assets_backup.json",
            &json_content,
            &format!("自動同步資產數據 ({} 筆) - {}", assets.len(), now_str),
        )
        .await;

        let _ = Self::upload_file(
            &client,
            &owner,
            &repo,
            branch,
            token,
            "data/INVENTORY_REPORT.md",
            &md_report,
            &format!("更新資產清冊 Markdown 報表 - {}", now_str),
        )
        .await;

        match upload_res {
            Ok(commit_sha) => SyncResult {
                success: true,
                message: format!("成功發佈最新資產數據至 GitHub 倉庫: {}/{}", owner, repo),
                timestamp: now_str,
                commit_sha: Some(commit_sha),
            },
            Err(err) => SyncResult {
                success: false,
                message: format!("發佈至 GitHub 失敗: {}", err),
                timestamp: now_str,
                commit_sha: None,
            },
        }
    }

    async fn upload_file(
        client: &reqwest::Client,
        owner: &str,
        repo: &str,
        branch: &str,
        token: &str,
        file_path: &str,
        content: &str,
        commit_message: &str,
    ) -> Result<String, String> {
        let api_url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            owner, repo, file_path
        );

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token)).map_err(|e| e.to_string())?,
        );
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static("Asset-Tracking-Program-Tauri"),
        );

        // Check if file already exists to get its SHA
        let check_res = client
            .get(&api_url)
            .headers(headers.clone())
            .query(&[("ref", branch)])
            .send()
            .await;

        let mut existing_sha: Option<String> = None;
        if let Ok(resp) = check_res {
            if resp.status().is_success() {
                if let Ok(info) = resp.json::<serde_json::Value>().await {
                    if let Some(sha) = info.get("sha").and_then(|s| s.as_str()) {
                        existing_sha = Some(sha.to_string());
                    }
                }
            }
        }

        let base64_content = BASE64_STANDARD.encode(content.as_bytes());

        let mut put_body = json!({
            "message": commit_message,
            "content": base64_content,
            "branch": branch
        });

        if let Some(sha) = existing_sha {
            put_body["sha"] = json!(sha);
        }

        let put_res = client
            .put(&api_url)
            .headers(headers)
            .json(&put_body)
            .send()
            .await
            .map_err(|e| format!("網絡請求失敗: {}", e))?;

        let status = put_res.status();
        let body_text = put_res
            .text()
            .await
            .unwrap_or_else(|_| "無回應內容".to_string());

        if status.is_success() {
            if let Ok(json_resp) = serde_json::from_str::<serde_json::Value>(&body_text) {
                if let Some(commit_sha) = json_resp
                    .get("commit")
                    .and_then(|c| c.get("sha"))
                    .and_then(|s| s.as_str())
                {
                    return Ok(commit_sha.to_string());
                }
            }
            Ok("成功提交".to_string())
        } else {
            Err(format!("GitHub API 回應錯誤 [{}]: {}", status, body_text))
        }
    }
}
