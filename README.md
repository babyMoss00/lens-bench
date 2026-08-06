# 镜头 / 传感器选型计算台 · 独立部署版

任意电脑（联网）都能独立运行；AI 识别用你自己的 Key，可换 Kimi / OpenAI / Claude 等模型。
光学计算全部在本地完成；只有"识别 datasheet / 客户图纸"这一步会调用你配置的大模型（经本地代理转发，避免浏览器跨域、且 Key 不进前端）。

## 文件
- `index.html` —— 网页（React 由 CDN 加载，无需构建）
- `app.js` —— 应用主体（计算内核 + 界面）
- `server.js` —— 零依赖本地代理 + 静态服务器（Node 18+，不用 npm install）
- `README.md` —— 本文件

## 运行（3 步）
1. 装 [Node.js](https://nodejs.org) 18 或更高（`node -v` 查看）。
2. 在这个文件夹里执行：
   ```bash
   node server.js
   ```
3. 浏览器打开 **http://localhost:5173**
   （首次打开需联网加载 React / pdf.js 等组件，约 1–2 秒。）

## 首次配置模型
点右上角 **⚙ 设置** → 选服务商 → 填 **模型名** 与 **API Key** → 保存。Key 只存在本机浏览器。

| 服务商 | Base URL | 模型名示例（需带 vision 才能读图/PDF） |
|---|---|---|
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` |
| Claude | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| 自定义 | 你的 OpenAI 兼容地址 | 你的模型名 |

> 只做**文本粘贴**识别时，任意模型都行；上传**图片 / PDF** 时必须选带 vision 的模型。
> 模型名随时会更新（如 Kimi 新版本K3），设置里可直接改。

## 工作流
1. **识别客户需求 / 图纸**（场景参数右上）→ 自动填目标、工作距离、波长、需求像素等，并给出"通用选型范围"。
2. **识别 Datasheet**（传感器对比右上）→ 上传候选芯片 PDF/图片，逐颗算焦距/覆盖/像素/景深/衍射并横向对比。
3. 调"安装朝向"看不同装法，导出 CSV。

每一步识别结果都可在界面里手动修改；识别失败不影响手填与离线文本解析。

## 常见问题
- **点识别报"连不上本地代理"**：确认是用 `node server.js` 启动、并从 `http://localhost:5173` 打开的（不是直接双击 index.html）。
- **报模型相关错误（401/404/模型不存在）**：检查设置里的 Base URL、模型名、Key 是否正确，模型是否支持视觉。
- **PDF 识别不准**：datasheet 版式复杂时，截"关键参数/规格表"那一页为图片上传更稳；或用"离线文本"粘贴。
