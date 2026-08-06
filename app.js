/** @jsxRuntime classic */
const { useState, useMemo } = React;

/* ============================================================
   通用镜头 / 传感器选型计算器  ·  Lens & Sensor Selection Bench
   —— 面向机器视觉 / OEM 相机模组的镜头选型与多芯片横向对比 ——

   设计原则：
   · 100% 本地确定性计算。无 fetch、无 API Key、无 JSON 解析 —— 不会 fail to fetch。
   · 通用：任意目标尺寸 / 任意工作距离 / 任意传感器（库内选或自定义）。
   · 计算内核为薄透镜精确式（非低倍率近似），覆盖性按最不利最小工作距离校核。
   · 支持多传感器同场景横向对比，一键导出 CSV。
   ============================================================ */

const C = {
  paper: "#FBFAF7", panel: "#FFFFFF", ink: "#12233B", sub: "#5A6B7E",
  line: "#DCE2E8", lineHard: "#C3CCD6", teal: "#0F7C8A", tealDk: "#0A5A65",
  pass: "#1E7A46", passBg: "#E8F3EC", fail: "#B23A2E", failBg: "#FBEBE8",
  warn: "#B57614", warnBg: "#FBF2E0", grid: "#EAEEF2", chip: "#EEF4F5",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";

// 标准 M12 定焦焦距梯度 (mm)
const STD_M12 = [1.8, 2.1, 2.5, 2.8, 3.0, 3.6, 4, 4.3, 4.5, 5, 5.5, 6, 8, 10, 12, 16, 25];

// ---------------- 模型配置 + 本地代理调用（独立部署版）----------------
const CFG_KEY = "lenscfg.v1";
const PROVIDERS = {
  kimi: { label: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k-vision-preview", kind: "openai" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", kind: "openai" },
  qwen: { label: "通义千问（兼容）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-plus", kind: "openai" },
  claude: { label: "Claude（Anthropic）", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-6", kind: "anthropic" },
  custom: { label: "自定义（OpenAI 兼容）", baseUrl: "", model: "", kind: "openai" },
};
function getCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) { return {}; } }
function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }
async function pdfToImages(file, maxPages = 3) {
  if (typeof pdfjsLib === "undefined") throw new Error("PDF 组件未加载，请改传图片");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out = [], n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1.6 });
    const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    out.push({ media_type: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.85).split(",")[1] });
  }
  return out;
}
async function fileToImages(file) {
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) return pdfToImages(file);
  const dataUrl = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || "")); rd.onerror = () => rej(new Error("读取文件失败")); rd.readAsDataURL(file); });
  return [{ media_type: file.type || "image/png", data: dataUrl.split(",")[1] || "" }];
}
async function callLLM(instruction, files) {
  const cfg = getCfg();
  if (!cfg.apiKey) throw new Error("未配置 API Key —— 点右上角「设置」填入模型与 Key");
  let images = [];
  for (const f of (files || [])) images = images.concat(await fileToImages(f));
  let resp;
  try {
    resp = await fetch("/api/llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: cfg.provider || "openai", baseUrl: cfg.baseUrl || "", model: cfg.model || "", apiKey: cfg.apiKey, instruction, images }) });
  } catch (e) { throw new Error("连不上本地代理——确认已运行 node server.js 并从 http://localhost 打开"); }
  let data; try { data = await resp.json(); } catch (e) { throw new Error("代理返回异常"); }
  if (!resp.ok) throw new Error(data && data.error ? data.error : ("HTTP " + resp.status));
  return (data && data.text) || "";
}

// 传感器库：常见典型值，可在行内编辑覆盖。px=像元(µm)，resW/resH=有效像素
const SENSOR_LIB = [
  { name: "SC202CS", vendor: "SmartSens", px: 1.75, resW: 1600, resH: 1200, fmt: '1/5.1"', shutter: "卷帘", mono: "黑白/彩色", note: "2MP 低成本，黑白料号 -MSMNN00" },
  { name: "OV9281", vendor: "OmniVision", px: 3.0, resW: 1280, resH: 800, fmt: '1/4"', shutter: "全局", mono: "黑白", note: "1MP 全局快门，OmniPixel3-GS" },
  { name: "AR0234", vendor: "onsemi", px: 3.0, resW: 1920, resH: 1200, fmt: '1/2.6"', shutter: "全局", mono: "黑白/彩色", note: "2.3MP 全局快门，机器视觉常用" },
  { name: "OV2311", vendor: "OmniVision", px: 3.0, resW: 1600, resH: 1300, fmt: '1/2.9"', shutter: "全局", mono: "黑白/RGB-IR", note: "2MP 全局快门" },
  { name: "AR0144", vendor: "onsemi", px: 3.0, resW: 1280, resH: 800, fmt: '1/4"', shutter: "全局", mono: "黑白/彩色", note: "1MP 全局快门" },
  { name: "IMX296", vendor: "Sony", px: 3.45, resW: 1456, resH: 1088, fmt: '1/2.9"', shutter: "全局", mono: "黑白/彩色", note: "1.58MP 全局，Pregius" },
  { name: "IMX287", vendor: "Sony", px: 6.9, resW: 728, resH: 544, fmt: '1/2.9"', shutter: "全局", mono: "黑白/彩色", note: "0.4MP 大像元，高灵敏" },
  { name: "OV5647", vendor: "OmniVision", px: 1.4, resW: 2592, resH: 1944, fmt: '1/4"', shutter: "卷帘", mono: "彩色", note: "5MP 卷帘 (树莓派 v1)" },
  { name: "IMX219", vendor: "Sony", px: 1.12, resW: 3280, resH: 2464, fmt: '1/4"', shutter: "卷帘", mono: "彩色", note: "8MP 卷帘 (树莓派 v2)" },
  { name: "IMX477", vendor: "Sony", px: 1.55, resW: 4056, resH: 3040, fmt: '1/2.3"', shutter: "卷帘", mono: "彩色", note: "12MP 卷帘 (树莓派 HQ)" },
  { name: "MT9V034", vendor: "onsemi", px: 6.0, resW: 752, resH: 480, fmt: '1/3"', shutter: "全局", mono: "黑白/彩色", note: "WVGA 全局，经典机器人视觉" },
];

// 常见光学格式对角 (仅供换算参考，实际以像元×分辨率为准)
const OPTICAL_FORMATS = {
  '1/4"': [3.6, 2.7], '1/3.6"': [4.0, 3.0], '1/3"': [4.8, 3.6], '1/2.9"': [4.96, 3.72],
  '1/2.7"': [5.37, 4.04], '1/2.6"': [5.7, 4.28], '1/2.5"': [5.76, 4.29], '1/2.3"': [6.17, 4.55],
  '1/2"': [6.4, 4.8], '1/1.8"': [7.18, 5.32], '2/3"': [8.8, 6.6],
};

let UID = 100;
const uid = () => ++UID;

function mkSensor(lib) {
  const b = lib || { name: "自定义", vendor: "", px: 3.0, resW: 1280, resH: 800, fmt: "", shutter: "", mono: "", note: "" };
  return { id: uid(), ...b, circle: 0 }; // circle=0 表示未指定像圈
}

// ---------------- 计算内核（纯函数）----------------
function compute(sc, s) {
  const px = num(s.px), resW = num(s.resW), resH = num(s.resH);
  if (!px || !resW || !resH) return { valid: false };

  const w = (px * resW) / 1000, h = (px * resH) / 1000;        // 传感器物理尺寸 mm
  const sLong = Math.max(w, h), sShort = Math.min(w, h);
  const resLong = Math.max(resW, resH), resShort = Math.min(resW, resH);
  const diag = Math.hypot(w, h);

  const tL = num(sc.tgtL), tW = num(sc.tgtW);
  const tLong = Math.max(tL, tW), tShort = Math.min(tL, tW);
  const mFac = 1 + num(sc.margin) / 100;
  const wdMin = num(sc.wdMin), wdNom = num(sc.wdNom), wdMax = num(sc.wdMax);

  // 安装朝向：目标两维如何映射到传感器长/短轴
  // LL = 目标长边→传感器长轴(高分辨率轴)，即"长轴‖长边"；LS = 目标长边→传感器短轴(转90°)
  const fbindOf = (tFL, tFS) => Math.min((sLong * wdMin) / (tFL * mFac + sLong), (sShort * wdMin) / (tFS * mFac + sShort));
  const pair = { LL: [tLong, tShort], LS: [tShort, tLong] };
  const orient = sc.orient || "auto";
  const orientUsed = orient === "auto" ? (fbindOf(pair.LL[0], pair.LL[1]) >= fbindOf(pair.LS[0], pair.LS[1]) ? "LL" : "LS") : orient;
  const tForLong = pair[orientUsed][0], tForShort = pair[orientUsed][1];

  // 每轴"能覆盖目标"的最大焦距（最不利=最小工作距离，薄透镜精确式）
  const fCoverLong = (sLong * wdMin) / (tForLong * mFac + sLong);
  const fCoverShort = (sShort * wdMin) / (tForShort * mFac + sShort);
  const fBind = Math.min(fCoverLong, fCoverShort);
  const limAxis = fCoverLong <= fCoverShort ? "长轴" : "短轴";

  // 推荐标准 M12：不超过 fBind 的最大标准值（越大→目标越充满→像素越多，同时仍保证覆盖）
  const fRec = [...STD_M12].reverse().find((f) => f <= fBind) ?? STD_M12[0];
  const covered = fRec <= fBind + 1e-9;

  const fov = (sAxis, WD, f) => (sAxis * (WD - f)) / f;
  const fovLongMin = fov(sLong, wdMin, fRec), fovShortMin = fov(sShort, wdMin, fRec);
  const fovLongNom = fov(sLong, wdNom, fRec), fovShortNom = fov(sShort, wdNom, fRec);
  const marginLong = fovLongMin / tForLong - 1, marginShort = fovShortMin / tForShort - 1;
  const worstMargin = Math.min(marginLong, marginShort);

  // 角视场
  const afovH = (2 * Math.atan(w / (2 * fRec)) * 180) / Math.PI;
  const afovV = (2 * Math.atan(h / (2 * fRec)) * 180) / Math.PI;
  const afovD = (2 * Math.atan(diag / (2 * fRec)) * 180) / Math.PI;

  // 放大倍率 & 物方采样 (µm/px，方形像元各向同性)
  const beta = fRec / (wdNom - fRec);
  const sampNom = px * (wdNom - fRec) / fRec;
  const sampMin = px * (wdMin - fRec) / fRec;
  const sampMax = px * (wdMax - fRec) / fRec;

  // 目标有效像素 @ 标称 WD
  const tpxLong = (tLong * 1000) / sampNom, tpxShort = (tShort * 1000) / sampNom;

  // 分辨率需求判定（可选）：目标像素 ≥ 需求（按长短轴分别比较）
  const reqLong = Math.max(num(sc.reqW), num(sc.reqH)), reqShort = Math.min(num(sc.reqW), num(sc.reqH));
  const resReqOK = (reqLong > 0) ? (tpxLong >= reqLong && tpxShort >= reqShort) : null;

  // 最小特征 Nyquist 判定（可选）：最不利=最远 WD，需 ≥2px/特征
  const feat = num(sc.feat);
  const featOK = feat > 0 ? sampMax * 2 <= feat * 1000 : null;

  // 衍射极限 & 景深（选定 F#）
  const lam = num(sc.lambda) / 1000;         // µm
  const fnum = num(sc.fnum);
  const nDiff = (2 * px) / (2.44 * lam);      // Airy≈2px 时的 F#
  const airy = 2.44 * lam * fnum;            // µm
  const airyPx = airy / px;

  const cocMm = (num(sc.cocPx) * px) / 1000; // 弥散圆 mm
  const u = wdNom;
  const Hh = (fRec * fRec) / (fnum * cocMm) + fRec;
  const near = (u * (Hh - fRec)) / (Hh + u - 2 * fRec);
  const farDen = Hh - u;
  const far = farDen <= 0 ? Infinity : (u * (Hh - fRec)) / farDen;
  const dofTotal = far === Infinity ? Infinity : far - near;
  const dofNeed = wdMax - wdMin;
  const dofOK = dofTotal >= dofNeed;

  // 像圈匹配（可选）
  const circle = num(s.circle);
  const circleOK = circle > 0 ? diag <= circle : null;

  // 画幅利用率（目标外接框占传感器画面面积比）@ 标称
  const util = (tForLong / fovLongNom) * (tForShort / fovShortNom);
  const tAspect = tLong / tShort, sAspect = sLong / sShort;
  const aspectMismatch = Math.abs(tAspect - sAspect) / tAspect > 0.15;

  // 综合判定
  let verdict = "pass";
  const flags = [];
  if (!covered) { verdict = "fail"; flags.push("焦距无法覆盖"); }
  if (resReqOK === false) { verdict = "fail"; flags.push("目标像素不足"); }
  if (featOK === false) { verdict = verdict === "fail" ? "fail" : "warn"; flags.push("特征采样不足"); }
  if (circleOK === false) { verdict = "fail"; flags.push("像圈不覆盖"); }
  if (verdict !== "fail") {
    if (worstMargin < 0.03) { verdict = "warn"; flags.push("覆盖余量偏紧"); }
    if (airyPx > 2) { verdict = verdict === "pass" ? "warn" : verdict; flags.push("衍射受限"); }
    if (!dofOK) { flags.push("景深略欠"); }
  }

  return {
    valid: true, w, h, sLong, sShort, resLong, resShort, diag,
    fCoverLong, fCoverShort, fBind, limAxis, fRec, covered,
    fovLongMin, fovShortMin, fovLongNom, fovShortNom, marginLong, marginShort, worstMargin,
    afovH, afovV, afovD, beta, sampNom, sampMin, sampMax, tpxLong, tpxShort,
    resReqOK, featOK, nDiff, airy, airyPx, near, far, dofTotal, dofNeed, dofOK,
    circleOK, util, tAspect, sAspect, aspectMismatch, orientUsed, verdict, flags,
  };
}

function num(x) { const n = parseFloat(x); return isFinite(n) ? n : 0; }
function f1(x) { return x == null || !isFinite(x) ? "—" : x.toFixed(1); }
function f0(x) { return x == null || !isFinite(x) ? "—" : Math.round(x).toString(); }
function pct(x) { return x == null || !isFinite(x) ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%"; }

// ---------------- 离线 Datasheet 文本解析（确定性，无网络）----------------
function parseDatasheet(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  const found = {};
  // 像素尺寸
  let m = t.match(/(?:pixel\s*size|像素尺寸|像元尺寸)[^\d]{0,10}([\d.]+)\s*[µuμ]m/i)
    || t.match(/([\d.]+)\s*[µuμ]m\s*[x×*]\s*[\d.]+\s*[µuμ]m/i)
    || t.match(/([\d.]+)\s*[µuμ]m\s*(?:pixel|像元|像素)/i);
  if (m) found.px = parseFloat(m[1]);
  // 分辨率：收集所有 A×B，优先关键词邻近，否则取面积最大
  const res = [];
  const re = /(\d{3,5})\s*H?\s*[x×*]\s*(\d{3,5})\s*V?/gi;
  let r;
  while ((r = re.exec(t))) {
    const a = +r[1], b = +r[2];
    if (a >= 320 && a <= 12000 && b >= 240 && b <= 9000 && a >= b) res.push([a, b, r.index]);
  }
  if (res.length) {
    const kw = /(resolution|active\s*array|pixel\s*array|effective|分辨率|像素阵列|有效像素)/i;
    let best = null;
    for (const c of res) { if (kw.test(t.slice(Math.max(0, c[2] - 40), c[2]))) { best = c; break; } }
    if (!best) best = res.reduce((p, c) => (c[0] * c[1] > p[0] * p[1] ? c : p));
    found.resW = best[0]; found.resH = best[1];
  }
  // 光学格式
  m = t.match(/1\s*\/\s*([\d.]+)\s*(?:"|″|”|inch|inches|英寸)/i);
  if (m) found.fmt = '1/' + m[1] + '"';
  // 快门
  if (/global\s*shutter|全局快门|全局|global/i.test(t)) found.shutter = "全局";
  else if (/rolling\s*shutter|卷帘快门|卷帘|rolling/i.test(t)) found.shutter = "卷帘";
  // 黑白/彩色
  const mono = /mono(chrome)?|黑白|b\s*&\s*w|b\/w/i.test(t);
  const color = /\bcolor\b|彩色|bayer/i.test(t);
  found.mono = mono && color ? "黑白/彩色" : mono ? "黑白" : color ? "彩色" : "";
  // 接口
  const ifc = [];
  if (/MIPI/i.test(t)) { const l = t.match(/(\d)\s*-?\s*lane/i); ifc.push("MIPI" + (l ? " " + l[1] + "-lane" : "")); }
  if (/\bDVP\b/i.test(t)) ifc.push("DVP");
  if (/LVDS/i.test(t)) ifc.push("LVDS");
  // 帧率
  const fpss = [...t.matchAll(/(\d{2,3})\s*fps/gi)].map((x) => +x[1]).filter((x) => x <= 1000);
  // 厂商与型号
  const vendor = (t.match(/OmniVision|SmartSens|思特威|Sony|索尼|onsemi|ON Semiconductor|Samsung|GalaxyCore|格科微|豪威/i) || [])[0] || "";
  const name = (t.match(/\b(?:SC|OV|IMX|AR|MT9[VMP]|GC|S5K)[A-Z]?\d{3,5}[A-Z]{0,3}\b/i) || [])[0] || "";
  return { found, ifc, vendor, name, note: fpss.length ? "≤" + Math.max(...fpss) + "fps" : "" };
}

// ---------------- 通用选型范围（阶段一：未锁芯片）----------------
function computeRange(sc) {
  const tL = num(sc.tgtL), tW = num(sc.tgtW);
  const tLong = Math.max(tL, tW), tShort = Math.min(tL, tW);
  const wdMin = num(sc.wdMin), wdNom = num(sc.wdNom);
  if (!tLong || !tShort || !wdMin || !wdNom) return null;
  const reqLong = Math.max(num(sc.reqW), num(sc.reqH)), reqShort = Math.min(num(sc.reqW), num(sc.reqH));
  const feat = num(sc.feat);
  const cands = [];
  if (reqLong > 0) { cands.push(tLong * 1000 / reqLong, tShort * 1000 / reqShort); }
  if (feat > 0) cands.push(feat * 1000 / 2);
  const objRes = cands.length ? Math.min(...cands) : null; // µm/px
  const sResLong = reqLong > 0 ? Math.ceil(reqLong / 0.85) : null;
  const sResShort = reqShort > 0 ? Math.ceil(reqShort / 0.85) : null;
  const mp = (sResLong && sResShort) ? (sResLong * sResShort / 1e6) : null;
  const fmts = ['1/4"', '1/3"', '1/2.9"', '1/2.5"', '1/2"'];
  const rows = fmts.map((k) => {
    const [w, h] = OPTICAL_FORMATS[k];
    const sLong = Math.max(w, h), sShort = Math.min(w, h);
    const fstar = Math.min(sLong * wdMin / (tLong + sLong), sShort * wdMin / (tShort + sShort));
    const pxMax = objRes ? objRes * fstar / (wdNom - fstar) : null;
    return { k, w, h, fstar, pxMax };
  });
  const fMin = Math.min(...rows.map((r) => r.fstar)), fMax = Math.max(...rows.map((r) => r.fstar));
  return { objRes, sResLong, sResShort, mp, rows, fMin, fMax };
}

// ---------------- 离线需求解析（确定性）----------------
function parseReq(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  const o = {};
  let m = t.match(/(\d{1,4})\s*mm\s*[x×*]\s*(\d{1,4})\s*mm/i) || t.match(/目标[^\d]{0,8}(\d{1,4})\s*[x×*]\s*(\d{1,4})/);
  if (m) { const a = +m[1], b = +m[2]; o.tgtL = Math.max(a, b); o.tgtW = Math.min(a, b); }
  m = t.match(/(\d+(?:\.\d+)?)\s*(cm|mm)?\s*(?:to|~|-|–|—|至|到)\s*(\d+(?:\.\d+)?)\s*(cm|mm)/i);
  if (m) { const k = ((m[4] || m[2] || "mm").toLowerCase() === "cm") ? 10 : 1; let a = +m[1] * k, b = +m[3] * k; if (a > b) { const s = a; a = b; b = s; } o.wdMin = a; o.wdMax = b; o.wdNom = Math.round((a + b) / 2); }
  else { m = t.match(/(?:WD|工作距离|距离|MOD)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(cm|mm)/i); if (m) o.wdNom = +m[1] * (((m[2] || "mm").toLowerCase() === "cm") ? 10 : 1); }
  m = t.match(/(\d{3})\s*nm/); if (m) o.lambda = +m[1];
  for (const p of t.matchAll(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/g)) {
    const ctx = t.slice(Math.max(0, p.index - 30), p.index);
    if (/pixel|分辨率|resolution|down to|至少|approx/i.test(ctx) || (+p[1] >= 800 && +p[1] <= 4000)) { o.reqW = +p[1]; o.reqH = +p[2]; break; }
  }
  m = t.match(/([\d.]+)\s*mm\s*(?:feature|特征|最小)/i); if (m) o.feat = +m[1];
  const notes = [];
  if (/global|全局/i.test(t)) notes.push("全局快门"); else if (/rolling|卷帘/i.test(t)) notes.push("卷帘");
  if (/mono|黑白|b&w/i.test(t)) notes.push("黑白");
  if (/IR[- ]?cut|IR filter|IR滤/i.test(t)) notes.push("IR-cut");
  if (/MIPI/i.test(t)) notes.push("MIPI");
  const fps = t.match(/(\d{2,3})\s*fps/i); if (fps) notes.push("≥" + fps[1] + "fps");
  if (notes.length) o.notes = notes.join(" · ");
  return o;
}

// ==================================================================
function App() {
  const [sc, setSc] = useState({
    tgtL: 80, tgtW: 70, wdMin: 142, wdNom: 152, wdMax: 162,
    margin: 0, feat: 0.2, reqW: 1000, reqH: 1000,
    lambda: 525, fnum: 2.8, cocPx: 2, orient: "auto",
  });
  const set = (k) => (v) => setSc((p) => ({ ...p, [k]: v }));

  const [sensors, setSensors] = useState([
    mkSensor(SENSOR_LIB[0]), mkSensor(SENSOR_LIB[1]),
  ]);
  const [selId, setSelId] = useState(sensors[0].id);

  const rows = useMemo(() => sensors.map((s) => ({ s, r: compute(sc, s) })), [sc, sensors]);
  const sel = rows.find((x) => x.s.id === selId) || rows[0];

  const addSensor = (lib) => {
    const ns = mkSensor(lib);
    setSensors((p) => [...p, ns]); setSelId(ns.id);
  };
  const dupSensor = (s) => { const ns = { ...s, id: uid(), name: s.name + "*" }; setSensors((p) => [...p, ns]); setSelId(ns.id); };
  const rmSensor = (id) => setSensors((p) => p.length > 1 ? p.filter((x) => x.id !== id) : p);
  const editSensor = (id, k, v) => setSensors((p) => p.map((x) => x.id === id ? { ...x, [k]: v } : x));

  const exportCSV = () => {
    const head = ["传感器", "厂商", "像元µm", "分辨率", "推荐焦距mm", "覆盖余量", "目标像素", "满足需求", "物方µm/px", "景深mm", "衍射@F#", "判定"];
    const lines = [head.map(csv).join(",")];
    rows.forEach(({ s, r }) => {
      if (!r.valid) return;
      lines.push([
        s.name, s.vendor, s.px, `${s.resW}x${s.resH}`, r.fRec,
        pct(r.worstMargin), `${f0(r.tpxLong)}x${f0(r.tpxShort)}`,
        r.resReqOK == null ? "—" : r.resReqOK ? "是" : "否",
        f1(r.sampNom), r.dofTotal === Infinity ? "∞" : f0(r.dofTotal),
        `${r.airyPx.toFixed(1)}px`, { pass: "通过", warn: "注意", fail: "不满足" }[r.verdict],
      ].map(csv).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "镜头选型对比.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const [showSet, setShowSet] = useState(false);

  return (
    <div style={{ background: C.paper, minHeight: "100%", fontFamily: SANS, color: C.ink, padding: 16 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Header onExport={exportCSV} onSettings={() => setShowSet(true)} />

        <ScenarioBar sc={sc} set={set} setSc={setSc} />

        <SensorBench
          rows={rows} selId={selId} setSelId={setSelId}
          add={addSensor} dup={dupSensor} rm={rmSensor} edit={editSensor}
        />

        {sel && sel.r.valid && <Detail sc={sc} s={sel.s} r={sel.r} />}

        <Footnote />
      </div>
      <Settings open={showSet} onClose={() => setShowSet(false)} />
    </div>
  );
}

// ---------------- 模型设置弹窗 ----------------
function Settings({ open, onClose }) {
  const [c, setC] = useState(() => {
    const g = getCfg();
    return { preset: g.preset || "kimi", provider: g.provider || "openai", baseUrl: g.baseUrl || PROVIDERS.kimi.baseUrl, model: g.model || PROVIDERS.kimi.model, apiKey: g.apiKey || "" };
  });
  if (!open) return null;
  const pickPreset = (k) => { const p = PROVIDERS[k]; setC((s) => ({ ...s, preset: k, provider: p.kind === "anthropic" ? "anthropic" : "openai", baseUrl: p.baseUrl || s.baseUrl, model: p.model || s.model })); };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 8, padding: 18, width: 460, maxWidth: "92vw", boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 4 }}>模型设置</div>
        <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 12, lineHeight: 1.5 }}>Key 只存在本机浏览器、经本地代理转发，不写入前端代码、不上传第三方。图片 / PDF 识别需选<b>带 vision 的模型</b>；纯文本粘贴任意模型都行。</div>
        <SetRow label="服务商">
          <select value={c.preset} onChange={(e) => pickPreset(e.target.value)} style={setInp}>
            {Object.keys(PROVIDERS).map((k) => <option key={k} value={k}>{PROVIDERS[k].label}</option>)}
          </select>
        </SetRow>
        <SetRow label="Base URL"><input value={c.baseUrl} onChange={(e) => setC((s) => ({ ...s, baseUrl: e.target.value }))} style={setInp} placeholder="https://api.moonshot.cn/v1" /></SetRow>
        <SetRow label="模型名"><input value={c.model} onChange={(e) => setC((s) => ({ ...s, model: e.target.value }))} style={setInp} placeholder="moonshot-v1-8k-vision-preview" /></SetRow>
        <SetRow label="API Key"><input type="password" value={c.apiKey} onChange={(e) => setC((s) => ({ ...s, apiKey: e.target.value }))} style={setInp} placeholder="sk-..." /></SetRow>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>当前模式：{c.provider === "anthropic" ? "Anthropic 协议" : "OpenAI 兼容协议"}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={btn(C.sub, true)}>取消</button>
          <button onClick={() => { saveCfg(c); onClose(); }} style={btn(C.teal)}>保存</button>
        </div>
      </div>
    </div>
  );
}
function SetRow({ label, children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><span style={{ fontSize: 12, color: C.sub, width: 72, flexShrink: 0 }}>{label}</span><div style={{ flex: 1 }}>{children}</div></div>;
}
const setInp = { width: "100%", boxSizing: "border-box", fontSize: 13, padding: "6px 8px", border: `1px solid ${C.lineHard}`, borderRadius: 5, fontFamily: MONO, color: C.ink };

// ---------------- Header ----------------
function Header({ onExport, onSettings }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, borderBottom: `2px solid ${C.ink}`, paddingBottom: 10 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>
          镜头 / 传感器选型计算台
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.tealDk, marginLeft: 10, fontWeight: 600 }}>Lens & Sensor Bench</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
          任意目标 · 任意工作距离 · 多传感器横向对比 · 薄透镜精确式
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.pass, background: C.passBg, border: `1px solid ${C.pass}33`, borderRadius: 4, padding: "3px 8px" }}>
          ● 计算全程本地 · AI 识别走本地代理（自带 Key）
        </span>
        <button onClick={onSettings} style={btn(C.tealDk)}>⚙ 设置</button>
        <button onClick={onExport} style={btn(C.teal)}>导出 CSV</button>
      </div>
    </div>
  );
}

// ---------------- 场景参数 ----------------
function ScenarioBar({ sc, set, setSc }) {
  const [showReq, setShowReq] = useState(false);
  const [rtext, setRtext] = useState("");
  const [rbusy, setRbusy] = useState(false);
  const [rerr, setRerr] = useState("");
  const [rmsg, setRmsg] = useState("");
  const applyFound = (o, label) => {
    const keys = ["tgtL", "tgtW", "wdMin", "wdNom", "wdMax", "lambda", "reqW", "reqH", "feat"];
    const patch = {};
    keys.forEach((k) => { if (o[k] != null && o[k] !== "" && isFinite(+o[k])) patch[k] = +o[k]; });
    if (Object.keys(patch).length) setSc((p) => ({ ...p, ...patch }));
    const parts = [];
    if (patch.tgtL || patch.tgtW) parts.push("目标 " + (patch.tgtL ?? sc.tgtL) + "×" + (patch.tgtW ?? sc.tgtW));
    if (patch.wdMin) parts.push("WD " + patch.wdMin + "–" + (patch.wdMax ?? "?"));
    if (patch.lambda) parts.push(patch.lambda + "nm");
    if (patch.reqW) parts.push("需求 " + patch.reqW + "×" + patch.reqH);
    setRmsg((label || "已识别") + "并填入场景：" + (parts.join(" · ") || "（部分字段）") + (o.notes ? " · 备注：" + o.notes : "") + " —— 请核对");
  };
  const aiExtractReq = async (file) => {
    setRerr(""); setRmsg(""); setRbusy(true);
    try {
      const prompt = `这是一份机器视觉相机的需求文档或客户图纸。提取选型参数，只返回一个 JSON 对象，不要解释、不要 Markdown。字段：tgtL(目标较长边mm), tgtW(较短边mm), wdMin, wdNom, wdMax(工作距离mm；若给的是范围则填最小和最大，标称取中值；注意 cm→mm 换算，如 14.2cm=142), lambda(照明波长nm), reqW, reqH(目标需求像素；若写 down to 1000x1000 则填 1000,1000), feat(需分辨的最小特征mm，没有填null), notes(快门/接口/黑白/IR滤光片/帧率等其它要求，中文字符串)。找不到的字段填 null。`;
      const txt = await callLLM(prompt, [file]);
      const j = JSON.parse(txt.replace(/```json/gi, "").replace(/```/g, "").trim());
      applyFound(j, "AI 已识别");
    } catch (e) { setRerr("识别失败（" + ((e && e.message) || "未知") + "）。可改用下方粘贴，或重试 / 换清晰截图。"); }
    finally { setRbusy(false); }
  };
  const runReqParse = (text) => {
    if (!text || !text.trim()) { setRmsg("请先粘贴需求文本。"); return; }
    applyFound(parseReq(text), "已识别");
  };
  const range = computeRange(sc);
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel n="01" t="场景参数" s="客户需求：目标 / 工作距离 / 检测与光学条件 —— 下方所有传感器共用" />
        <button onClick={() => setShowReq((v) => !v)} style={btn(C.tealDk)}>识别客户需求 / 图纸</button>
      </div>

      {showReq && (
        <div style={{ border: `1px dashed ${C.tealDk}`, borderRadius: 6, background: C.paper, padding: 10, marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.tealDk, marginBottom: 6 }}>从客户图纸 / 需求文档识别 → 自动填场景（所有字段仍可手改）</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <label style={{ ...btn(C.teal), display: "inline-block", opacity: rbusy ? 0.55 : 1, pointerEvents: rbusy ? "none" : "auto" }}>
              {rbusy ? "识别中…" : "上传图纸 / 需求（PDF·图片）"}
              <input type="file" accept=".pdf,image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) aiExtractReq(f); }} style={{ display: "none" }} />
            </label>
            {rbusy && <span style={{ fontSize: 11.5, color: C.tealDk }}>正在读取并解析…</span>}
            {rerr && <span style={{ fontSize: 11.5, color: C.fail, flex: 1 }}>{rerr}</span>}
          </div>
          <textarea value={rtext} onChange={(e) => setRtext(e.target.value)}
            placeholder={'或粘贴需求文字，例：目标 70mm x 80mm；工作距离 14.2cm to 16.2cm；525nm；接受 down to 1000x1000；黑白 MIPI 24fps IR-cut'}
            style={{ width: "100%", minHeight: 54, boxSizing: "border-box", fontFamily: MONO, fontSize: 12, padding: 8, border: `1px solid ${C.lineHard}`, borderRadius: 5, resize: "vertical", color: C.ink }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <button onClick={() => runReqParse(rtext)} style={btn(C.tealDk)}>离线识别并填入</button>
            <button onClick={() => { setRtext(""); setRmsg(""); setRerr(""); }} style={btn(C.sub, true)}>清空</button>
            {rmsg && <span style={{ fontSize: 11.5, color: C.tealDk, flex: 1 }}>{rmsg}</span>}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
        <Group t="目标尺寸 (mm)">
          <Field label="长 L" hint="被检测目标的较长边(mm)。工具自动把传感器长轴对准目标长轴，所以长/宽谁大谁小不影响结果。"><NumIn v={sc.tgtL} set={set("tgtL")} /></Field>
          <Field label="宽 W" hint="被检测目标的较短边(mm)。"><NumIn v={sc.tgtW} set={set("tgtW")} /></Field>
        </Group>
        <Group t="工作距离 WD (mm)">
          <Field label="最小 (覆盖校核基准)" hint="镜头到目标的最近距离。距离越近视场越小，覆盖必须在最近处也成立，所以焦距按它校核。"><NumIn v={sc.wdMin} set={set("wdMin")} /></Field>
          <Field label="标称" hint="常规工作距离，安装调焦的目标值。目标像素与景深按它计算。"><NumIn v={sc.wdNom} set={set("wdNom")} /></Field>
          <Field label="最大" hint="镜头到目标的最远距离。用于景深行程与最远视场。"><NumIn v={sc.wdMax} set={set("wdMax")} /></Field>
        </Group>
        <Group t="检测要求">
          <Field label="最小特征 (mm，选填)" hint="需要分辨的最小细节，如线宽/缺陷尺寸。一般要 ≥2 个像素才能可靠分辨。留空则不判定。"><NumIn v={sc.feat} set={set("feat")} /></Field>
          <Field label="目标需求像素 宽×高 (选填)" hint="希望目标在画面上至少占多少像素。像素越多越能看清细节。留空则不判定。">
            <div style={{ display: "flex", gap: 6 }}>
              <NumIn v={sc.reqW} set={set("reqW")} />
              <NumIn v={sc.reqH} set={set("reqH")} />
            </div>
          </Field>
        </Group>
        <Group t="光学条件">
          <Field label="覆盖余量 (%)" hint="在刚好覆盖之外额外留的裕度，用来抵消安装与公差误差。0=不留余量。"><NumIn v={sc.margin} set={set("margin")} /></Field>
          <Field label="波长 (nm)" hint="照明光的颜色波长。绿光≈525，红光≈630，蓝光≈450。影响衍射与镜头选择。"><NumIn v={sc.lambda} set={set("lambda")} /></Field>
          <Field label="景深光圈 F#" hint="光圈值。数值越大→光圈越小→景深越深，但进光变少、衍射更明显。"><NumIn v={sc.fnum} set={set("fnum")} /></Field>
        </Group>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: C.sub }}>
          安装朝向
          <span title="决定目标的长边(如80mm)由传感器哪根轴覆盖。自动=取像素最优；长轴‖长边=相机横装(目标长边落在高分辨率长轴上，通常像素更多)；长轴‖短边=相机转90°竖装(目标长边落在短轴上)。相机能自由转向时选自动即可。" style={{ marginLeft: 4, cursor: "help", color: C.teal, fontSize: 9.5, fontWeight: 700, border: `1px solid ${C.teal}66`, borderRadius: 8, padding: "0 4px" }}>?</span>
        </span>
        {[["auto", "自动（像素最优）"], ["LL", "长轴‖长边（横装）"], ["LS", "长轴‖短边（转90°）"]].map(([v, lb]) => {
          const on = (sc.orient || "auto") === v;
          return (
            <button key={v} onClick={() => set("orient")(v)}
              style={{ fontSize: 12, fontWeight: on ? 700 : 500, padding: "5px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${on ? C.teal : C.lineHard}`, background: on ? C.teal : "#fff", color: on ? "#fff" : C.sub }}>
              {lb}
            </button>
          );
        })}
      </div>

      {range && <RangeBox range={range} />}
    </div>
  );
}

// ---------------- 通用选型范围展示 ----------------
function RangeBox({ range: r }) {
  return (
    <div style={{ border: `1px solid ${C.teal}`, background: "#F1F7F8", borderRadius: 6, padding: 10, marginTop: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tealDk, marginBottom: 6 }}>通用选型范围 · 未锁定芯片时的目标区间（阶段一 → 再用下方芯片对比细化）</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, marginBottom: 8 }}>
        <span>物方分辨率需 <b style={{ fontFamily: MONO, color: C.ink }}>≤ {r.objRes ? f1(r.objRes) + " µm/px" : "—（填需求像素/最小特征）"}</b></span>
        <span>传感器分辨率需 <b style={{ fontFamily: MONO, color: C.ink }}>≥ {r.sResLong ? r.sResLong + "×" + r.sResShort : "—"}{r.mp ? " (≈" + r.mp.toFixed(1) + "MP)" : ""}</b></span>
        <span>焦距范围 <b style={{ fontFamily: MONO, color: C.ink }}>≈ {f1(r.fMin)}–{f1(r.fMax)} mm</b></span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ color: C.sub, fontFamily: MONO }}>
            {[["常见靶面", "left"], ["尺寸 (mm)", "center"], ["贴合焦距 f*", "center"], ["达标像素尺寸 ≤", "center"]].map(([h, a], i) => (
              <th key={i} style={{ textAlign: a, padding: "3px 6px", borderBottom: `1px solid ${C.line}`, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.rows.map((x) => (
            <tr key={x.k}>
              <td style={{ padding: "3px 6px" }}>{x.k}</td>
              <td style={{ textAlign: "center", fontFamily: MONO }}>{x.w}×{x.h}</td>
              <td style={{ textAlign: "center", fontFamily: MONO, color: C.tealDk, fontWeight: 700 }}>{f1(x.fstar)} mm</td>
              <td style={{ textAlign: "center", fontFamily: MONO }}>{x.pxMax ? f1(x.pxMax) + " µm" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, color: C.sub, marginTop: 6 }}>
        读法：先看两条硬指标（物方分辨率、传感器分辨率），再按打算用的靶面查焦距。像素尺寸 ≤ 该值才能达到物方分辨率；但像素太小会牺牲进光/信噪比、并更早受衍射限制。定好范围后，用下方「识别 Datasheet」导入候选芯片做精确对比。
      </div>
    </div>
  );
}

// ---------------- 传感器对比台 ----------------
function SensorBench({ rows, selId, setSelId, add, dup, rm, edit }) {
  const [showLib, setShowLib] = useState(false);
  const [showParse, setShowParse] = useState(false);
  const [ptext, setPtext] = useState("");
  const [pmsg, setPmsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const runParse = (text) => {
    if (!text || !text.trim()) { setPmsg("请先粘贴 datasheet 文本，或选择 .txt 文件。"); return; }
    const p = parseDatasheet(text);
    const f = p.found;
    add({
      name: p.name || "识别·待核对", vendor: p.vendor || "",
      px: f.px || 3.0, resW: f.resW || 1280, resH: f.resH || 800,
      fmt: f.fmt || "", shutter: f.shutter || "", mono: f.mono || "",
      note: [p.ifc.join("/"), p.note].filter(Boolean).join(" · "),
    });
    const rep = [];
    if (f.px) rep.push("像素 " + f.px + "µm");
    if (f.resW) rep.push(f.resW + "×" + f.resH);
    if (f.fmt) rep.push(f.fmt);
    if (f.shutter) rep.push(f.shutter);
    if (f.mono) rep.push(f.mono);
    setPmsg(rep.length
      ? "已识别 " + rep.length + " 项并加入对比：" + rep.join(" · ") + " —— 请在表格核对/修改（新行）"
      : "未识别到关键参数，已加入一行空白模板，请手动填写。");
  };
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { const s = String(rd.result || ""); setPtext(s); runParse(s); };
    rd.onerror = () => setPmsg("文件读取失败，请改用粘贴文本。");
    rd.readAsText(file);
    e.target.value = "";
  };
  const aiExtract = async (file) => {
    setAiErr(""); setPmsg(""); setAiBusy(true);
    try {
      const prompt = `阅读这份图像传感器 datasheet，提取参数，只返回一个 JSON 对象，不要解释、不要 Markdown 代码块。字段：name(型号), vendor(厂商), px(像素尺寸,单位µm,纯数值), resW(有效像素宽,整数), resH(有效像素高,整数), fmt(光学格式,如 1/4"), shutter(值只能是 全局 或 卷帘), mono(值只能是 黑白 或 彩色 或 黑白/彩色), interface(接口,如 MIPI 1-lane), fps(最大帧率,整数)。分辨率优先取有效/输出分辨率而非全阵列。找不到的字段填 null。`;
      const txt = await callLLM(prompt, [file]);
      const clean = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
      const j = JSON.parse(clean);
      add({
        name: j.name || "AI识别·待核对", vendor: j.vendor || "",
        px: j.px || 3.0, resW: j.resW || 1280, resH: j.resH || 800,
        fmt: j.fmt || "", shutter: j.shutter || "", mono: j.mono || "",
        note: [j.interface, j.fps ? "≤" + j.fps + "fps" : ""].filter(Boolean).join(" · "),
      });
      const rep = [];
      if (j.px) rep.push("像素 " + j.px + "µm");
      if (j.resW) rep.push(j.resW + "×" + j.resH);
      if (j.fmt) rep.push(j.fmt);
      if (j.shutter) rep.push(j.shutter);
      if (j.mono) rep.push(j.mono);
      setPmsg("AI 已识别并加入对比：" + rep.join(" · ") + " —— 请在表格核对/修改");
    } catch (e) {
      setAiErr("AI 识别失败（" + ((e && e.message) || "未知") + "）。可改用下方②离线文本粘贴，或重试 / 改传规格页截图。");
    } finally {
      setAiBusy(false);
    }
  };
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel n="02" t="传感器对比" s="点行展开详情 · 双击单元格可编辑 · 支持自定义与库内预设" />
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <button onClick={() => setShowParse((v) => !v)} style={btn(C.tealDk)}>识别 Datasheet</button>
          <button onClick={() => add(null)} style={btn(C.sub, true)}>+ 自定义</button>
          <button onClick={() => setShowLib((v) => !v)} style={btn(C.teal)}>+ 从库添加 ▾</button>
          {showLib && (
            <div style={{ position: "absolute", right: 0, top: 34, zIndex: 20, background: "#fff", border: `1px solid ${C.lineHard}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.12)", width: 320, maxHeight: 340, overflow: "auto" }}>
              {SENSOR_LIB.map((l) => (
                <div key={l.name} onClick={() => { add(l); setShowLib(false); }}
                  style={{ padding: "8px 12px", borderBottom: `1px solid ${C.grid}`, cursor: "pointer", fontSize: 12.5 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.chip)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                  <div style={{ fontWeight: 700 }}>{l.name} <span style={{ color: C.sub, fontWeight: 400 }}>· {l.vendor}</span></div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.sub }}>{l.px}µm · {l.resW}×{l.resH} · {l.fmt} · {l.shutter} · {l.mono}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{l.note}</div>
                </div>
              ))}
              <div style={{ padding: "6px 12px", fontSize: 10.5, color: C.sub, background: C.paper }}>库内为常见典型值，添加后可在表内编辑覆盖</div>
            </div>
          )}
        </div>
      </div>

      {showParse && (
        <div style={{ border: `1px dashed ${C.teal}`, borderRadius: 6, background: C.paper, padding: 12, marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tealDk, marginBottom: 6 }}>从 Datasheet 识别参数 → 自动加一行到对比（所有字段仍可手改）</div>

          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 3 }}>① AI 智能识别 · 直接读 PDF / 图片 <span style={{ color: C.pass, fontWeight: 600 }}>· 用你在「设置」里配置的模型（Kimi 等）· 无需装 OCR</span></div>
            <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 7 }}>
              直接上传 datasheet 的 PDF，或规格页截图（PNG/JPG）。AI 会读取并填入。大文件较慢；只截「关键参数 / 规格表」那一页更快更准。
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ ...btn(C.teal), display: "inline-block", opacity: aiBusy ? 0.55 : 1, pointerEvents: aiBusy ? "none" : "auto" }}>
                {aiBusy ? "识别中…" : "上传 PDF / 图片识别"}
                <input type="file" accept=".pdf,image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) aiExtract(f); }} style={{ display: "none" }} />
              </label>
              {aiBusy && <span style={{ fontSize: 11.5, color: C.tealDk }}>正在读取并解析，请稍候…</span>}
              {aiErr && <span style={{ fontSize: 11.5, color: C.fail, flex: 1 }}>{aiErr}</span>}
            </div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 3 }}>② 离线文本识别 · 兜底 <span style={{ color: C.sub, fontWeight: 600 }}>· 无网络 · 100% 可靠</span></div>
            <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 6 }}>想完全离线、或 AI 偶尔不通时用：把含参数的文字粘贴进来（或选 .txt），按规则提取。</div>
            <textarea value={ptext} onChange={(e) => setPtext(e.target.value)}
              placeholder={'例：像素尺寸 1.75 μm x 1.75 μm；像素阵列 1600H x 1200V；镜头光学尺寸 1/5.1"；1-lane MIPI；黑白 ...'}
              style={{ width: "100%", minHeight: 68, boxSizing: "border-box", fontFamily: MONO, fontSize: 12, padding: 8, border: `1px solid ${C.lineHard}`, borderRadius: 5, resize: "vertical", color: C.ink }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <button onClick={() => runParse(ptext)} style={btn(C.tealDk)}>识别并加入对比</button>
              <label style={{ ...btn(C.sub, true), display: "inline-block" }}>选择 .txt<input type="file" accept=".txt,.csv,.md,text/plain" onChange={onFile} style={{ display: "none" }} /></label>
              <button onClick={() => { setPtext(""); setPmsg(""); }} style={btn(C.sub, true)}>清空</button>
            </div>
          </div>
          {pmsg && <div style={{ fontSize: 11.5, color: C.tealDk, marginTop: 8 }}>{pmsg}</div>}
        </div>
      )}

      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.ink, color: "#fff", fontFamily: MONO, fontSize: 11 }}>
              {[["传感器", "传感器型号 / 厂商，可直接改名"], ["像元/分辨率", "像元=单个像素的物理尺寸(µm)，越小越精细但进光越少；分辨率=横×纵像素数"], ["推荐焦距", "能在整个工作距离范围覆盖目标的最大标准 M12 焦距（焦距越大目标越充满画面）"], ["覆盖余量@最近", "最近工作距离下视场比目标大多少；<3% 偏紧，负值=无法覆盖"], ["目标像素@标称", "标称距离下目标在画面上实际占的像素(宽×高)"], ["满足需求", "目标像素是否达到场景里填写的需求像素"], ["物方分辨率", "每个像素对应的实际物理尺寸(µm)，越小越精细"], ["景深@F#", "当前光圈下目标可沿光轴移动而仍清晰的范围"], ["衍射", "当前光圈的艾里斑直径(以像素计)；>2px 说明光圈太小、被衍射限制"], ["判定", "综合覆盖/像素/景深/衍射的选型结论"], ["", ""]].map(([h, tip], i) => (
                <th key={i} title={tip} style={{ padding: "7px 8px", textAlign: i === 0 ? "left" : "center", fontWeight: 600, whiteSpace: "nowrap", cursor: tip ? "help" : "default" }}>{h}{tip ? " ⁱ" : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, r }) => {
              const on = s.id === selId;
              return (
                <tr key={s.id} onClick={() => setSelId(s.id)}
                  style={{ borderBottom: `1px solid ${C.grid}`, background: on ? C.chip : "#fff", cursor: "pointer" }}>
                  <td style={{ padding: "6px 8px", textAlign: "left" }}>
                    <input value={s.name} onChange={(e) => edit(s.id, "name", e.target.value)} onClick={(e) => e.stopPropagation()} style={cellIn(700, 90)} />
                    <div style={{ fontSize: 10.5, color: C.sub }}>{s.vendor} {s.shutter && "· " + s.shutter}</div>
                  </td>
                  <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 11 }}>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input value={s.px} onChange={(e) => edit(s.id, "px", e.target.value)} style={cellIn(600, 34)} />µm
                    </div>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input value={s.resW} onChange={(e) => edit(s.id, "resW", e.target.value)} style={cellIn(400, 40)} />×
                      <input value={s.resH} onChange={(e) => edit(s.id, "resH", e.target.value)} style={cellIn(400, 40)} />
                    </div>
                  </td>
                  <Cell v={r.valid ? r.fRec + " mm" : "—"} strong tone={r.covered ? null : "bad"} />
                  <Cell v={r.valid ? pct(r.worstMargin) : "—"} tone={!r.valid ? null : r.worstMargin < 0 ? "bad" : r.worstMargin < 0.03 ? "warn" : "ok"} />
                  <Cell v={r.valid ? `${f0(r.tpxLong)}×${f0(r.tpxShort)}` : "—"} mono />
                  <Cell v={r.resReqOK == null ? "—" : r.resReqOK ? "是" : "否"} tone={r.resReqOK == null ? null : r.resReqOK ? "ok" : "bad"} />
                  <Cell v={r.valid ? `${f1(r.sampNom)} µm/px` : "—"} mono />
                  <Cell v={r.valid ? (r.dofTotal === Infinity ? "∞" : `${f0(r.dofTotal)} mm`) : "—"} mono tone={r.dofOK ? null : "warn"} />
                  <Cell v={r.valid ? `${r.airyPx.toFixed(1)}px` : "—"} mono tone={r.airyPx > 2 ? "warn" : null} />
                  <td style={{ textAlign: "center" }}><Verdict v={r.verdict} /></td>
                  <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => dup(s)} title="复制" style={miniBtn}>复制</button>
                    <button onClick={() => rm(s.id)} title="删除" style={miniBtn}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>
        提示：覆盖余量按<b>最小工作距离</b>校核（最不利工况）；目标像素按<b>标称</b>工作距离；衍射列为该 F# 下艾里斑直径（&gt;2px 建议开大光圈）。
      </div>
    </div>
  );
}

// ---------------- 详情面板 ----------------
function Detail({ sc, s, r }) {
  return (
    <div style={panel}>
      <SectionLabel n="03" t={`详情 · ${s.name}`} s="选定传感器的完整读数、光路示意与公式" />
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14, marginTop: 10 }}>
        {/* 左：读数 */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <BigReadout label="推荐 M12 焦距" value={r.fRec} unit="mm" sub={`贴合焦距 f*=${f1(r.fBind)}mm（${r.limAxis}约束）· 越接近 f* 目标越充满`} />
            <BigReadout label="放大倍率 β" value={r.beta.toFixed(4)} unit="" sub={`@标称 WD=${sc.wdNom}mm`} />
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>
            当前安装朝向：<b style={{ color: C.tealDk }}>{r.orientUsed === "LL" ? "长轴‖长边（横装）" : "长轴‖短边（转90°竖装）"}</b>
            {(sc.orient || "auto") === "auto" ? " · 自动选优" : " · 手动锁定"}
            {r.orientUsed === "LL" ? "（目标长边落在高分辨率长轴上）" : "（目标长边落在短轴上）"}
          </div>
          <Divider t="覆盖 · 视场" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <Readout label="AFOV 水平" v={f1(r.afovH)} u="°" />
            <Readout label="AFOV 垂直" v={f1(r.afovV)} u="°" />
            <Readout label="AFOV 对角" v={f1(r.afovD)} u="°" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            <Readout label={`长轴余量 @WD=${sc.wdMin}`} v={pct(r.marginLong)} u="" tone={r.marginLong < 0 ? "bad" : r.marginLong < 0.03 ? "warn" : "ok"} />
            <Readout label={`短轴余量 @WD=${sc.wdMin}`} v={pct(r.marginShort)} u="" tone={r.marginShort < 0 ? "bad" : r.marginShort < 0.03 ? "warn" : "ok"} />
          </div>
          <Divider t="像素 · 采样" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Readout label="目标像素 @标称" v={`${f0(r.tpxLong)}×${f0(r.tpxShort)}`} u="" tone={r.resReqOK == null ? null : r.resReqOK ? "ok" : "bad"} />
            <Readout label="画幅利用率" v={(r.util * 100).toFixed(0)} u="%" />
            <Readout label="物方分辨率 @标称" v={f1(r.sampNom)} u="µm/px" />
            <Readout label="物方分辨率 @最远" v={f1(r.sampMax)} u="µm/px" />
          </div>
          <Divider t="景深 · 衍射" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Readout label={`景深 @F/${sc.fnum}`} v={r.dofTotal === Infinity ? "∞" : f0(r.dofTotal)} u="mm" tone={r.dofOK ? "ok" : "warn"} />
            <Readout label={`需覆盖行程`} v={f0(r.dofNeed)} u="mm" />
            <Readout label={`艾里斑 @F/${sc.fnum}`} v={f1(r.airy)} u="µm" tone={r.airyPx > 2 ? "warn" : "ok"} />
            <Readout label="衍射上限 F#" v={f1(r.nDiff)} u="" sub="超过此值分辨率软化" />
          </div>
          <div style={{ marginTop: 8 }}>
            <CheckLine ok={r.covered} label="焦距可覆盖目标" detail={`标准 ${r.fRec}mm ≤ 覆盖上限 ${f1(r.fBind)}mm`} />
            {r.resReqOK != null && <CheckLine ok={r.resReqOK} label={`目标像素满足需求 ${sc.reqW}×${sc.reqH}`} detail={`实际 ${f0(r.tpxLong)}×${f0(r.tpxShort)}`} />}
            {r.featOK != null && <CheckLine ok={r.featOK} label={`最小特征 ${sc.feat}mm 满足 2px 采样`} detail={`最远采样 ${f1(r.sampMax)}µm/px ×2 = ${f1(r.sampMax * 2)}µm`} />}
            <CheckLine ok={r.dofOK} label={`景深覆盖 ${f0(r.dofNeed)}mm 行程`} detail={r.dofTotal === Infinity ? "景深 → ∞" : `景深 ${f0(r.dofTotal)}mm（${f0(r.near)}–${r.far === Infinity ? "∞" : f0(r.far)}mm）`} />
            {r.aspectMismatch && <CheckLine ok={null} label="纵横比不匹配" detail={`目标 ${r.tAspect.toFixed(2)}:1 vs 传感器 ${r.sAspect.toFixed(2)}:1，两侧留背景`} />}
            {r.resReqOK === false && r.worstMargin > 0.08 && <CheckLine ok={null} label="像素不足，但覆盖余量仍偏大" detail={`可把焦距增至更接近 f*=${f1(r.fBind)}mm（当前 ${r.fRec}mm）——目标更充满、像素更多。标准档不够贴合时可考虑非标/可调焦镜头`} />}
          </div>
        </div>

        {/* 右：光路图 + 公式 */}
        <div>
          <RayDiagram sc={sc} r={r} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
            <Formula t="焦距 (薄透镜精确)" f={"f = s·WD / (FOV + s)"} />
            <Formula t="物方视场" f={"FOV = s·(WD − f) / f"} />
            <Formula t="物方采样" f={"µm/px = 像元·(WD−f)/f"} />
            <Formula t="景深 (超焦距)" f={`H = f²/(F·c)+f，c=${sc.cocPx}×像元`} />
            <Formula t="艾里斑直径" f={"d = 2.44·λ·F"} />
            <Formula t="覆盖校核" f={"以最小 WD 为最不利工况"} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- 光路 / 视场示意（侧视，含透镜）----------------
function RayDiagram({ sc, r }) {
  const W = 470, H = 250, padL = 58, padR = 24, cy = H / 2;
  const lensX = padL, xMax = W - padR, apex = lensX + 16; // apex=镜头中心(光线发出点)
  const wdMin = num(sc.wdMin), wdMax = num(sc.wdMax), wdNom = num(sc.wdNom);
  const f = r.fRec;
  const fovAt = (WD) => (r.sLong * (WD - f)) / f;
  const fovMin = fovAt(wdMin), fovMax = fovAt(wdMax), fovNom = fovAt(wdNom);
  const tLong = Math.max(num(sc.tgtL), num(sc.tgtW));

  const distSpan = Math.max(wdMax * 1.08, 10);
  const sx = (d) => lensX + (d / distSpan) * (xMax - lensX);
  const maxFov = Math.max(fovMax, tLong) * 1.2 || 1;
  const sy = (mm) => (mm / maxFov) * (H * 0.40);
  const wMin = sx(wdMin), wMax = sx(wdMax), wNom = sx(wdNom);
  const h2 = (v) => sy(v) / 2;

  const lensH = Math.min(sy(maxFov) * 0.30, 38) + 6;
  const lensPath = `M ${apex} ${cy - lensH} Q ${apex + 8} ${cy} ${apex} ${cy + lensH} Q ${apex - 8} ${cy} ${apex} ${cy - lensH} Z`;

  const planes = [
    { x: wMin, fov: fovMin, wd: wdMin, op: 1 },
    { x: wMax, fov: fovMax, wd: wdMax, op: 0.5 },
  ];

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", padding: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.tealDk, marginBottom: 2 }}>光路示意 · 侧视 · 传感器 → M12 镜头 → 目标面覆盖</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* 参考网格 */}
        {[0.28, 0.72].map((p, i) => <line key={i} x1={0} x2={W} y1={H * p} y2={H * p} stroke={C.grid} strokeWidth="1" />)}
        {/* 光轴 */}
        <line x1={0} y1={cy} x2={W} y2={cy} stroke={C.lineHard} strokeWidth="1" strokeDasharray="4 3" />

        {/* 工作距离行程带 */}
        <rect x={wMin} y={cy - sy(maxFov)} width={wMax - wMin} height={sy(maxFov) * 2} fill={C.teal} opacity="0.07" />
        {planes.map((p, i) => (
          <line key={"g" + i} x1={p.x} y1={20} x2={p.x} y2={H - 22} stroke={C.teal} strokeWidth="1" opacity="0.45" />
        ))}
        <text x={wMin} y={15} fontSize="10" fill={C.teal} fontFamily={MONO} textAnchor="middle">{f0(wdMin)}</text>
        <text x={wMax} y={15} fontSize="10" fill={C.teal} fontFamily={MONO} textAnchor="middle">{f0(wdMax)} mm</text>

        {/* 视场锥（近距实、远距淡）*/}
        {planes.map((p, i) => (
          <g key={"c" + i} opacity={p.op}>
            <line x1={apex} y1={cy} x2={p.x} y2={cy - h2(p.fov)} stroke={C.teal} strokeWidth="1.3" />
            <line x1={apex} y1={cy} x2={p.x} y2={cy + h2(p.fov)} stroke={C.teal} strokeWidth="1.3" />
            <line x1={p.x} y1={cy - h2(p.fov)} x2={p.x} y2={cy + h2(p.fov)} stroke={C.tealDk} strokeWidth="1.8" />
            <text x={p.x + 2} y={cy - h2(p.fov) - 4} fontSize="10" fill={C.tealDk} fontFamily={MONO} textAnchor="middle">{f0(p.fov)}mm</text>
          </g>
        ))}

        {/* 目标（红条，置于标称距离）*/}
        <g>
          <rect x={wNom - 3} y={cy - h2(tLong)} width="6" height={sy(tLong)} fill={C.fail} opacity="0.2" />
          <line x1={wNom} y1={cy - h2(tLong)} x2={wNom} y2={cy + h2(tLong)} stroke={C.fail} strokeWidth="2.6" />
          <text x={wNom} y={cy + h2(tLong) + 13} fontSize="9.5" fill={C.fail} fontFamily={MONO} textAnchor="middle">目标 {f0(tLong)}mm</text>
        </g>

        {/* 传感器 */}
        <line x1={lensX} y1={cy - 11} x2={lensX} y2={cy + 11} stroke={C.ink} strokeWidth="3" />
        <text x={lensX - 4} y={cy - 15} fontSize="9.5" fill={C.sub} fontFamily={MONO} textAnchor="middle">Sensor</text>
        {/* 镜头（双凸透镜）*/}
        <path d={lensPath} fill={C.teal} opacity="0.9" fillOpacity="0.16" stroke={C.teal} strokeWidth="1.4" />
        <text x={apex} y={H - 6} fontSize="10" fill={C.tealDk} fontFamily={MONO} textAnchor="middle">M12 · f={f}</text>
      </svg>
      <div style={{ fontSize: 10.5, color: C.sub }}>阴影带=工作距离行程 {f0(wdMin)}–{f0(wdMax)}mm；红条=目标长轴 {f0(tLong)}mm；青线=该焦距在近/远距的视场。目标短于近距视场即可全程覆盖。</div>
    </div>
  );
}

// ---------------- 小组件 ----------------
function Cell({ v, tone, strong, mono }) {
  const col = tone === "bad" ? C.fail : tone === "ok" ? C.pass : tone === "warn" ? C.warn : C.ink;
  return <td style={{ textAlign: "center", padding: "6px 8px", color: col, fontWeight: strong ? 800 : 500, fontFamily: mono ? MONO : SANS, fontSize: mono ? 11.5 : 12.5, whiteSpace: "nowrap" }}>{v}</td>;
}
function Verdict({ v }) {
  const m = { pass: [C.pass, C.passBg, "通过"], warn: [C.warn, C.warnBg, "注意"], fail: [C.fail, C.failBg, "不满足"] }[v] || [C.sub, "#eee", "—"];
  return <span style={{ color: m[0], background: m[1], border: `1px solid ${m[0]}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{m[2]}</span>;
}
function SectionLabel({ n, t, s }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#fff", background: C.tealDk, borderRadius: 3, padding: "1px 6px" }}>{n}</span>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{t}</span>
      <span style={{ fontSize: 11.5, color: C.sub }}>{s}</span>
    </div>
  );
}
function Group({ t, children }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px", background: C.paper }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.tealDk, marginBottom: 5, letterSpacing: 0.3 }}>{t}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{children}</div>
    </div>
  );
}
function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: C.sub, flex: 1 }}>
        {label}
        {hint && <span title={hint} style={{ marginLeft: 4, cursor: "help", color: C.teal, fontSize: 9.5, fontWeight: 700, border: `1px solid ${C.teal}66`, borderRadius: 8, padding: "0 4px", userSelect: "none" }}>?</span>}
      </span>
      <div>{children}</div>
    </div>
  );
}
function NumIn({ v, set }) {
  return <input type="number" value={v ?? ""} onChange={(e) => set(e.target.value)}
    style={{ width: 62, fontFamily: MONO, fontSize: 13, padding: "4px 6px", border: `1px solid ${C.lineHard}`, borderRadius: 4, textAlign: "right", background: "#fff", color: C.ink }} />;
}
function BigReadout({ label, value, unit, sub }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ fontSize: 11.5, color: C.sub, fontFamily: MONO }}>{label}</div>
      <div><span style={{ fontSize: 30, fontWeight: 800, color: C.teal, fontFamily: MONO, letterSpacing: -0.5 }}>{value}</span><span style={{ fontSize: 14, color: C.sub, marginLeft: 4 }}>{unit}</span></div>
      {sub && <div style={{ fontSize: 10.5, color: C.sub, marginTop: 1, fontFamily: MONO }}>{sub}</div>}
    </div>
  );
}
function Readout({ label, v, u, tone, sub }) {
  const col = tone === "bad" ? C.fail : tone === "ok" ? C.pass : tone === "warn" ? C.warn : C.ink;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 9px" }}>
      <div style={{ fontSize: 10.5, color: C.sub, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: col }}>{v}<span style={{ fontSize: 10.5, color: C.sub, marginLeft: 2 }}>{u}</span></div>
      {sub && <div style={{ fontSize: 9.5, color: C.sub }}>{sub}</div>}
    </div>
  );
}
function Divider({ t }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 7px" }}><span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, color: C.tealDk }}>{t}</span><span style={{ flex: 1, height: 1, background: C.line }} /></div>;
}
function CheckLine({ ok, label, detail }) {
  const col = ok == null ? C.sub : ok ? C.pass : C.fail;
  const dot = ok == null ? "○" : ok ? "●" : "▲";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", borderBottom: `1px solid ${C.grid}` }}>
      <span style={{ color: col, fontSize: 12 }}>{dot}</span>
      <div><div style={{ fontSize: 12.5 }}>{label}</div><div style={{ fontSize: 11, color: C.sub, fontFamily: MONO }}>{detail}</div></div>
    </div>
  );
}
function Formula({ t, f }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: C.tealDk, fontWeight: 700, marginBottom: 3 }}>{t}</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>{f}</div>
    </div>
  );
}
function Footnote() {
  return (
    <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.6, marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      <b>方法说明：</b>焦距用薄透镜精确式 f = s·WD/(FOV+s)（非低倍率近似）；覆盖性以最小工作距离为最不利工况，取长/短两轴中更严者。景深按对焦于标称 WD、超焦距法估算，弥散圆默认 2×像元。衍射列为选定 F# 下艾里斑直径。<b>本工具为近轴估算</b>，实际选型以镜头 MTF、像圈、CRA 与厂商景深曲线为准；WD 起算基准（前端面/主平面）须与镜头厂统一。全部计算在本地完成，不联网、不调用任何接口。
    </div>
  );
}

// ---------------- 样式 ----------------
const panel = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 14, boxShadow: "0 1px 2px rgba(0,0,0,.03)" };
const cellIn = (w, width) => ({ width, fontFamily: MONO, fontSize: 11.5, fontWeight: w, padding: "2px 4px", border: `1px solid ${C.line}`, borderRadius: 3, textAlign: "center", background: "#fff", color: C.ink });
function btn(color, ghost) {
  return { fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${color}`, background: ghost ? "#fff" : color, color: ghost ? color : "#fff" };
}
const miniBtn = { fontSize: 10, padding: "2px 5px", margin: "0 1px", border: `1px solid ${C.line}`, borderRadius: 3, background: "#fff", color: C.sub, cursor: "pointer" };
function csv(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
