# 镜头 / 传感器选型计算台 · Lens & Sensor Selection Bench

**[English](README.en.md) · [日本語](README.ja.md)**

**在线访问：** [https://lens-bench.onrender.com](https://lens-bench.onrender.com)

面向机器视觉 / OEM 相机模组的通用镜头选型与多传感器横向对比工具。支持中英双语、AI 智能识别、AI 选型顾问、离线计算与一键导出。

---

## 核心功能

- **任意目标 · 任意工作距离** —— 输入目标尺寸与工作距离范围，自动计算覆盖性
- **多传感器横向对比** —— 同时对比多颗芯片的焦距/覆盖余量/像素/景深/衍射
- **AI 智能识别** —— 上传客户图纸、需求文档或 datasheet（PDF/图片），自动提取参数
- **AI 选型顾问** —— 基于当前页面所有参数和对比结果，智能推荐型号与供应商
- **中英双语切换** —— 一键切换中文/英文界面，传感器数据自动映射
- **薄透镜精确式** —— 非低倍率近似，以最小工作距离为最不利工况校核
- **100% 本地计算** —— 光学计算不联网；AI 识别经本地代理转发，Key 不进前端代码
- **安全 Key 存储** —— 默认 sessionStorage（关闭即清除），可选记住长期保存

---

## 快速开始

### 在线使用（推荐）

直接打开 [https://lens-bench.onrender.com](https://lens-bench.onrender.com)

1. 点右上角 **⚙ 设置** → 选择服务商 → 填模型名与 API Key → 保存
2. 在 **场景参数** 中输入目标尺寸与工作距离
3. 点 **识别客户需求** 上传图纸自动识别（可选）
4. 在 **传感器对比** 中添加候选芯片或从库中选择
5. 查看推荐焦距、覆盖余量、目标像素、景深与衍射判定
6. 展开 **AI 选型顾问** 提问获取智能推荐

> **API Key 安全说明**：默认使用 sessionStorage，关闭浏览器标签页即自动清除。如需长期保存，可在设置中勾选「记住 API Key」。

---

## 本地部署（可选）

### 文件
- `index.html` —— 网页入口
- `app.js` —— 应用主体（计算内核 + 界面 + 国际化）
- `server.js` —— 零依赖本地代理 + 静态服务器（Node 18+）
- `package.json` —— Render 部署配置

### 运行（3 步）
1. 安装 [Node.js](https://nodejs.org) 18 或更高（`node -v` 查看）
2. 在项目文件夹执行：
   ```bash
   node server.js
   ```
3. 浏览器打开 **http://localhost:5173**

### 局域网共享
`node server.js` 启动后，把 `localhost` 换成你的内网 IP，同事即可通过局域网访问（防火墙放行 5173）。

---

## 模型配置

| 服务商 | Base URL | 模型名示例（vision 模型才能读图/PDF） |
|---|---|---|
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` |
| Claude | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| 自定义 | 你的 OpenAI 兼容地址 | 你的模型名 |

> 纯文本粘贴识别时任意模型均可；上传图片/PDF 时必须选择带 vision 能力的模型。

---

## 部署到 Render（自有域名）

1. Fork 本仓库到 GitHub
2. 注册 [render.com](https://render.com) → New Web Service → Connect GitHub
3. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`（或留空）
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. 部署完成后获得 `https://your-name.onrender.com`
5. （可选）绑定自定义域名：Settings → Custom Domains

---

## 常见问题

**Q: 页面加载卡住/白屏？**  
A: 首次打开需联网加载 React / Babel / pdf.js 组件（约 1–2 秒）。如长时间白屏，按 `Ctrl+F5` 强制刷新清除缓存。

**Q: AI 识别报错 "invalid temperature"？**  
A: 已修复。如仍遇到，请确认使用的是最新版 `server.js`。

**Q: 连不上本地代理？**  
A: 确认通过 `node server.js` 启动，并从 `http://localhost:5173` 访问（不要直接双击 `index.html`）。

**Q: 模型报错 401/404？**  
A: 检查 Settings 中的 Base URL、模型名、API Key 是否正确，模型是否支持视觉。

**Q: PDF 识别不准？**  
A: Datasheet 版式复杂时，截取「关键参数 / 规格表」那一页为图片上传更稳；或改用「离线文本」粘贴。

**Q: 如何防止 Render 免费实例休眠？**  
A: 注册 [UptimeRobot](https://uptimerobot.com)，每 5–10 分钟 ping 一次你的链接即可保持唤醒。

---

## 技术栈

- React 18 + Babel 7.8（浏览器内转译，零构建）
- 薄透镜精确光学计算（纯函数，无依赖）
- Node.js http 模块（零依赖代理服务器）
- pdf.js（PDF 转图片供 AI 识别）

---

## License

Apache License 2.0
