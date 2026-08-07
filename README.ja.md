# レンズ / センサー選型計算台 · Lens & Sensor Selection Bench

**[中文](README.md) · [English](README.en.md)**

**オンライン:** [https://lens-bench.onrender.com](https://lens-bench.onrender.com)

マシンビジョン / OEM カメラモジュール向けの汎用レンズ選型・多センサー横比較ツール。中日英対応、AI 自動認識、AI 選型アドバイザー、オフライン計算、ワンクリック出力に対応。

---

## 主な機能

- **任意ターゲット · 任意作動距離** — ターゲットサイズと作動距離範囲を入力すると、被覆性を自動計算
- **多センサー横比較** — 複数チップの焦点距離 / 被覆余裕 / 画素 / 被写界深度 / 回折を同時比較
- **AI 自動認識** — 顧客図面、要求書、または datasheet（PDF/画像）をアップロードしてパラメータを自動抽出
- **AI 選型アドバイザー** — 現在のページの全パラメータと比較結果に基づき、型番とサプライヤーを智能推薦
- **中日英切替** — ワンクリックで中文/英文/日文 UI を切替、センサーデータも自動マッピング
- **薄レンズ精密式** — 低倍率近似ではなく、最小作動距離を最不利条件として検証
- **100% ローカル計算** — 光学計算はオフライン；AI 認識はローカルプロキシ経由で転送、Key はフロントエンドに入らない
- **安全な Key 保存** — デフォルトは sessionStorage（タブを閉じると自動消去）、永続保存も選択可能

---

## クイックスタート

### オンライン使用（推奨）

[https://lens-bench.onrender.com](https://lens-bench.onrender.com) を開く

1. 右上 **⚙ 設定** → プロバイダーを選択 → モデル名と API Key を入力 → 保存
2. **シナリオパラメータ** にターゲットサイズと作動距離を入力
3. **顧客要求の認識** をクリックして図面をアップロードし自動認識（オプション）
4. **センサー比較** で候補チップを追加またはライブラリから選択
5. 推奨焦点距離、被覆余裕、ターゲット画素、被写界深度、回折判定を確認
6. **AI 選型アドバイザー** を展開して質問し、智能推薦を取得

> **API Key セキュリティ**: デフォルトは sessionStorage — ブラウザタブを閉じると自動消去。永続保存する場合は設定で「API Key を記憶する」にチェック。

---

## ローカル展開（オプション）

### ファイル
- `index.html` — Web エントリ
- `app.js` — アプリ本体（光学エンジン + UI + 国際化）
- `server.js` — ゼロ依存ローカルプロキシ + 静的サーバー（Node 18+）
- `package.json` — Render 展開設定

### 実行（3 ステップ）
1. [Node.js](https://nodejs.org) 18 以上をインストール（`node -v` で確認）
2. プロジェクトフォルダで実行：
   ```bash
   node server.js
   ```
3. ブラウザで **http://localhost:5173** を開く

### LAN 共有
`node server.js` 起動後、`localhost` を LAN IP に置き換えると、同じネットワークの同僚がアクセス可能（ファイアウォール ポート 5173 を開放）。

---

## モデル設定

| プロバイダー | Base URL | モデル名例（画像/PDF 読み取りには vision モデルが必要） |
|---|---|---|
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通義千問 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` |
| Claude | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| カスタム | OpenAI 互換エンドポイント | 任意のモデル名 |

> テキスト貼り付け認識は任意のモデルで可能。画像/PDF アップロード時は vision 対応モデルを選択してください。

---

## Render への展開（カスタムドメイン）

1. 本リポジトリを GitHub に Fork
2. [render.com](https://render.com) に登録 → New Web Service → GitHub を接続
3. 設定：
   - **Runtime**: Node
   - **Build Command**: `npm install`（または空白）
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. 展開後、`https://your-name.onrender.com` を取得
5. （オプション）カスタムドメインを設定: Settings → Custom Domains

---

## よくある質問

**Q: ページが読み込み中のまま / 白画面？**  
A: 初回読み込み時は React / Babel / pdf.js をインターネット経由で取得する必要があります（約 1–2 秒）。長時間白画面の場合は `Ctrl+F5` でハードリフレッシュし、キャッシュをクリアしてください。

**Q: AI 認識で "invalid temperature" エラー？**  
A: 修正済みです。まだ発生する場合は最新版の `server.js` を使用しているか確認してください。

**Q: "ローカルプロキシに接続できない"？**  
A: `node server.js` で起動し、`http://localhost:5173` からアクセスしているか確認してください（`index.html` をダブルクリックしないでください）。

**Q: モデルエラー 401/404？**  
A: Settings の Base URL、モデル名、API Key を確認してください。画像/PDF アップロード時は vision 対応モデルか確認してください。

**Q: PDF 認識が不正確？**  
A: Datasheet のレイアウトが複雑な場合は「主要パラメータ / 仕様表」のページを切り取って画像としてアップロードするか、「オフラインテキスト」貼り付けをご利用ください。

**Q: Render の無料インスタンスをスリープさせない方法？**  
A: [UptimeRobot](https://uptimerobot.com) に登録し、5–10 分ごとに URL を ping してください。

---

## 技術スタック

- React 18 + Babel 7.8（ブラウザ内トランスパイル、ゼロビルド）
- 薄レンズ精密光学計算（純粋関数、ゼロ依存）
- Node.js http モジュール（ゼロ依存プロキシサーバー）
- pdf.js（PDF → 画像変換、AI 認識用）

---

## License

Apache License 2.0
