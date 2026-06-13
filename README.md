# シーシャ×アサイー 売上管理 Web UI

シーシャとアサイーの店舗向け売上管理システムです。

## 機能

- 売上データの入力・記録
- 日別・月別の売上集計
- 商品カテゴリ別（シーシャ / アサイー / ドリンク）の分析
- 売上グラフの可視化（Chart.js）
- データのエクスポート（CSV）

## 技術スタック

HTML / CSS / JavaScript（バニラ）、LocalStorage、Chart.js

## Vercelデプロイ手順

1. [vercel.com](https://vercel.com) にログイン
2. **Add New Project** → GitHubリポジトリ `shisha-acai-sales-web-ui` を選択
3. Framework Preset: **Other**
4. Build & Output Settings はそのまま（ビルド不要）
5. **Deploy** をクリック

Supabase連携時に追加する環境変数：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

現在はlocalStorageで動作するため、環境変数の設定は不要です。
