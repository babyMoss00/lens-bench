# Lens / Sensor Selection Bench · 镜头 / 传感器选型计算台

**[中文](README.md) · [日本語](README.ja.md)**

**Live:** [https://lens-bench.onrender.com](https://lens-bench.onrender.com)

A universal lens & sensor selection tool for machine vision / OEM camera modules. Supports Chinese/English bilingual UI, AI smart parsing, AI selection advisor, offline computation, and one-click export.

---

## Core Features

- **Any target · Any working distance** — Enter target size and WD range, auto-calculate coverage
- **Multi-sensor comparison** — Compare multiple chips side-by-side: focal length / margin / pixels / DOF / diffraction
- **AI Smart Parsing** — Upload customer drawings, requirement docs, or datasheets (PDF/image) to auto-extract parameters
- **AI Selection Advisor** — Intelligent model & vendor recommendations based on all current page data
- **Bilingual switch** — One-click toggle Chinese/English; sensor data auto-mapped
- **Thin-lens exact formula** — Not low-magnification approximation; worst-case checked at minimum WD
- **100% local computation** — Optical math runs offline; AI calls forwarded via local proxy, Key never enters frontend
- **Secure Key storage** — Default sessionStorage (cleared on tab close); optional persistent save

---

## Quick Start

### Use Online (Recommended)

Open [https://lens-bench.onrender.com](https://lens-bench.onrender.com)

1. Click **⚙ Settings** → Select provider → Enter model name & API Key → Save
2. Fill in **Scenario Parameters** (target size, working distance, etc.)
3. Click **Parse Customer Request / Drawing** to auto-fill from uploaded files (optional)
4. Add candidate sensors in **Sensor Comparison** or pick from the built-in library
5. Review recommended focal length, coverage margin, target pixels, DOF, and diffraction verdict
6. Expand **AI Selection Advisor** to ask questions and get smart recommendations

> **API Key Security**: Default is sessionStorage — cleared when you close the browser tab. Check "Remember API Key" in Settings if you want persistent storage.

---

## Local Deployment (Optional)

### Files
- `index.html` — Web entry
- `app.js` — App core (optical engine + UI + i18n)
- `server.js` — Zero-dependency local proxy + static server (Node 18+)
- `package.json` — Render deployment config

### Run (3 steps)
1. Install [Node.js](https://nodejs.org) 18+ (`node -v` to check)
2. In the project folder run:
   ```bash
   node server.js
   ```
3. Open **http://localhost:5173** in your browser

### LAN Sharing
After `node server.js` starts, replace `localhost` with your LAN IP so colleagues on the same network can access it (firewall port 5173).

---

## Model Configuration

| Provider | Base URL | Example Model (must be vision-capable for image/PDF) |
|---|---|---|
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Tongyi Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` |
| Claude | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| Custom | Your OpenAI-compatible endpoint | Your model name |

> Plain-text parsing works with any model. For image/PDF upload, choose a vision-capable model.

---

## Deploy to Render (Custom Domain)

1. Fork this repo to GitHub
2. Sign up at [render.com](https://render.com) → New Web Service → Connect GitHub
3. Configure:
   - **Runtime**: Node
   - **Build Command**: `npm install` (or leave blank)
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. After deploy, you get `https://your-name.onrender.com`
5. (Optional) Bind custom domain: Settings → Custom Domains

---

## FAQ

**Q: Page stuck on loading / white screen?**  
A: First load needs internet to fetch React / Babel / pdf.js (~1–2s). If stuck long, press `Ctrl+F5` to hard-refresh and clear cache.

**Q: AI parse error "invalid temperature"?**  
A: Fixed. If still occurring, make sure you are using the latest `server.js`.

**Q: "Cannot connect to local proxy"?**  
A: Make sure you started with `node server.js` and opened via `http://localhost:5173` (do not double-click `index.html`).

**Q: Model error 401/404?**  
A: Check Base URL, model name, and API Key in Settings. Ensure the model supports vision if uploading images/PDFs.

**Q: PDF parsing inaccurate?**  
A: For complex datasheets, crop to the "key parameters / spec table" page and upload as image; or use offline text paste.

**Q: How to keep Render free instance awake?**  
A: Sign up at [UptimeRobot](https://uptimerobot.com) and ping your URL every 5–10 minutes.

---

## Tech Stack

- React 18 + Babel 7.8 (in-browser transpile, zero build)
- Thin-lens exact optical computation (pure functions, zero deps)
- Node.js http module (zero-dependency proxy server)
- pdf.js (PDF → image for AI parsing)

---

## License

MIT
