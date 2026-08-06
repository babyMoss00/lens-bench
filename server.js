// server.js —— 零依赖本地代理 + 静态服务器（需 Node 18+）
// 作用：① 提供网页  ② 把浏览器的识别请求转发给你选的大模型（Kimi/OpenAI/Claude…）
//       key 只在这层用一下、不落地、不进前端代码，从而绕开浏览器跨域(CORS)问题。
// 运行：  node server.js      然后浏览器打开  http://localhost:5173

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".map": "application/json",
};

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

async function handleLLM(req, res) {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    try {
      const { provider, baseUrl, model, apiKey, instruction, images } = JSON.parse(raw || "{}");
      const key = apiKey || process.env.LLM_API_KEY || "";
      if (!key) return send(res, 400, JSON.stringify({ error: "缺少 API Key（在网页「设置」里填）" }), MIME[".json"]);

      let url, headers, body;
      if (provider === "anthropic") {
        url = (baseUrl || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
        headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
        const content = [];
        (images || []).forEach((im) => content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } }));
        content.push({ type: "text", text: instruction });
        body = { model: model || "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content }] };
      } else {
        // OpenAI 兼容：Kimi/Moonshot、OpenAI、通义、DeepSeek、本地 vLLM 等
        url = (baseUrl || "https://api.moonshot.cn/v1").replace(/\/$/, "") + "/chat/completions";
        headers = { "Content-Type": "application/json", Authorization: "Bearer " + key };
        const content = [{ type: "text", text: instruction }];
        (images || []).forEach((im) => content.push({ type: "image_url", image_url: { url: "data:" + im.media_type + ";base64," + im.data } }));
        body = { model: model || "moonshot-v1-8k-vision-preview", messages: [{ role: "user", content }], max_tokens: 1024 };
      }

      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
      if (!r.ok) {
        const msg = (data && data.error && (data.error.message || data.error)) || data.raw || ("HTTP " + r.status);
        return send(res, r.status, JSON.stringify({ error: String(msg) }), MIME[".json"]);
      }
      let out = "";
      if (provider === "anthropic") out = (data.content || []).filter((x) => x.type === "text").map((x) => x.text).join("");
      else out = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      send(res, 200, JSON.stringify({ text: out }), MIME[".json"]);
    } catch (e) {
      send(res, 500, JSON.stringify({ error: String((e && e.message) || e) }), MIME[".json"]);
    }
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method === "POST" && req.url === "/api/llm") return handleLLM(req, res);

  // 静态文件
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found");
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
});

server.listen(PORT, () => {
  console.log("\n  镜头 / 传感器选型计算台已启动");
  console.log("  在浏览器打开：  http://localhost:" + PORT + "\n");
  console.log("  首次使用：点右上角「设置」→ 选服务商(如 Kimi) → 填模型名与 API Key → 保存");
  console.log("  退出：Ctrl + C\n");
});
