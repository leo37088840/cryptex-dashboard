import { useState, useEffect, useRef, useCallback } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti,
  calcSMA, calcMACD, calcRSI, calcKDJ, UNIVERSE,
  loadJin10Calendar, loadJin10Flash, loadFollowin,
} from "./data.js";

const MA_COLORS = { 5: "#f0e68c", 10: "#87ceeb", 20: "#ff8c69", 60: "#da70d6" };
const INTERVALS = ["15m", "1H", "4H", "1D"];
const MARKET_CATS = [
  { id: "crypto", label: "加密貨幣" }, { id: "stock", label: "股票" },
  { id: "forex", label: "外匯" }, { id: "futures", label: "期貨" },
  { id: "index", label: "指數" }, { id: "commodity", label: "商品" },
];
const TV = { bg: "#131722", grid: "#1e222d", axisText: "#787b86", up: "#26a69a", down: "#ef5350", crosshair: "#758696", labelBg: "#363a45" };

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 760 : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth < 760);
    window.addEventListener("resize", f); f();
    return () => window.removeEventListener("resize", f);
  }, []);
  return m;
}

// ─── CHART ───────────────────────────────────────────────────────────────────
function ChartCanvas({ candles, maSettings, subChart }) {
  const ref = useRef(null);
  const dprRef = useRef(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const [view, setView] = useState({ count: 90, offset: 0 });
  const [hover, setHover] = useState(null);
  const geomRef = useRef(null);
  const dragRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || !candles || candles.length === 0) return;
    const ctx = canvas.getContext("2d");
    const dpr = dprRef.current;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    if (W === 0 || H === 0) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = TV.bg; ctx.fillRect(0, 0, W, H);
    const PAD_BOT = 22, PAD_R = 64, PAD_L = 6, PAD_TOP = 8;
    const PRICE_H = Math.floor((H - PAD_BOT) * 0.54), VOL_H = Math.floor((H - PAD_BOT) * 0.10), IND_H = Math.floor((H - PAD_BOT) * 0.28);
    const chartW = W - PAD_L - PAD_R, indOffset = PRICE_H + PAD_TOP + VOL_H + 12;
    const total = candles.length, count = Math.min(view.count, total);
    const end = total - view.offset, start = Math.max(0, end - count);
    const vis = candles.slice(start, end), vn = vis.length;
    if (vn === 0) { ctx.restore(); return; }
    const allCloses = candles.map((c) => c.c), allHighs = candles.map((c) => c.h), allLows = candles.map((c) => c.l);
    const visHighs = vis.map((c) => c.h), visLows = vis.map((c) => c.l), visVols = vis.map((c) => c.v);
    const priceMin = Math.min(...visLows) * 0.999, priceMax = Math.max(...visHighs) * 1.001, volMax = Math.max(...visVols) * 1.15;
    const slotW = chartW / vn, cw = Math.max(1, slotW * 0.7);
    const xOf = (i) => PAD_L + (i + 0.5) * slotW;
    const yP = (v) => PAD_TOP + PRICE_H - ((v - priceMin) / (priceMax - priceMin)) * PRICE_H;
    const yV = (v) => PRICE_H + PAD_TOP + 4 + VOL_H - (v / volMax) * VOL_H;
    const yI = (v, mn, mx, off) => off + IND_H - ((v - mn) / (mx - mn || 1)) * IND_H;
    const fmtP = (v) => (v > 1000 ? v.toFixed(1) : v > 1 ? v.toFixed(3) : v.toFixed(6));
    geomRef.current = { PAD_L, PRICE_H, PAD_TOP, slotW, start, vn, priceMin, priceMax, W, H, PAD_BOT, chartW, fmtP, yP };
    ctx.strokeStyle = TV.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = PAD_TOP + (PRICE_H / 5) * i;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke();
      const p = priceMax - ((priceMax - priceMin) / 5) * i;
      ctx.fillStyle = TV.axisText; ctx.font = "10px Arial"; ctx.textAlign = "left";
      ctx.fillText(fmtP(p), PAD_L + chartW + 6, y + 3);
    }
    const tzOffset = -new Date().getTimezoneOffset();
    const stepV = Math.max(1, Math.floor(vn / 7));
    for (let i = 0; i < vn; i += stepV) { const x = xOf(i); ctx.strokeStyle = TV.grid; ctx.beginPath(); ctx.moveTo(x, PAD_TOP); ctx.lineTo(x, H - PAD_BOT); ctx.stroke(); }
    Object.entries(maSettings).forEach(([period, en]) => {
      if (!en) return;
      const ma = calcSMA(allCloses, +period); ctx.strokeStyle = MA_COLORS[period]; ctx.lineWidth = 1.4; ctx.beginPath(); let s = false;
      for (let i = 0; i < vn; i++) { const v = ma[start + i]; if (v == null) continue; if (!s) { ctx.moveTo(xOf(i), yP(v)); s = true; } else ctx.lineTo(xOf(i), yP(v)); }
      ctx.stroke();
    });
    vis.forEach((c, i) => {
      const up = c.c >= c.o, col = up ? TV.up : TV.down;
      ctx.strokeStyle = col; ctx.lineWidth = 1; const x = Math.round(xOf(i)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, yP(c.h)); ctx.lineTo(x, yP(c.l)); ctx.stroke();
      const top = yP(Math.max(c.o, c.c)), bodyH = Math.max(1, yP(Math.min(c.o, c.c)) - top);
      ctx.fillStyle = col; ctx.fillRect(xOf(i) - cw / 2, top, cw, bodyH);
    });
    vis.forEach((c, i) => { ctx.fillStyle = c.c >= c.o ? TV.up + "55" : TV.down + "55"; const top = yV(c.v); ctx.fillRect(xOf(i) - cw / 2, top, cw, Math.max(1, (PRICE_H + PAD_TOP + 4 + VOL_H) - top)); });
    ctx.fillStyle = TV.axisText; ctx.font = "9px Arial"; ctx.textAlign = "left"; ctx.fillText("Vol", PAD_L + 4, PRICE_H + PAD_TOP + 12);
    if (subChart === "MACD") {
      const { macd, signal, hist } = calcMACD(allCloses);
      const vm = macd.slice(start, end), vs = signal.slice(start, end), vh = hist.slice(start, end);
      const vals = [...vm, ...vs.filter(Boolean), ...vh.filter(Boolean)]; const mn = Math.min(...vals), mx = Math.max(...vals); const z = yI(0, mn, mx, indOffset);
      ctx.strokeStyle = "#2a3a4a"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(PAD_L, z); ctx.lineTo(PAD_L + chartW, z); ctx.stroke();
      vh.forEach((v, i) => { if (v == null) return; ctx.fillStyle = v >= 0 ? TV.up + "99" : TV.down + "99"; const y1 = yI(v, mn, mx, indOffset); ctx.fillRect(xOf(i) - cw / 2, Math.min(z, y1), cw, Math.abs(z - y1) || 1); });
      const dl = (arr, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); let s = false; arr.forEach((v, i) => { if (v == null) return; if (!s) { ctx.moveTo(xOf(i), yI(v, mn, mx, indOffset)); s = true; } else ctx.lineTo(xOf(i), yI(v, mn, mx, indOffset)); }); ctx.stroke(); };
      dl(vm, "#2962ff"); dl(vs, "#ff6d00");
      ctx.font = "9px Arial"; ctx.textAlign = "left"; ctx.fillStyle = "#2962ff"; ctx.fillText("MACD", PAD_L + 4, indOffset + 11); ctx.fillStyle = "#ff6d00"; ctx.fillText("Signal", PAD_L + 50, indOffset + 11);
    } else if (subChart === "RSI") {
      const rsi = calcRSI(allCloses).slice(start, end);
      [[70, TV.down], [30, TV.up], [50, "#5d606b"]].forEach(([lv, col]) => { ctx.strokeStyle = col + "55"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(PAD_L, yI(lv, 0, 100, indOffset)); ctx.lineTo(PAD_L + chartW, yI(lv, 0, 100, indOffset)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col + "99"; ctx.font = "9px Arial"; ctx.textAlign = "left"; ctx.fillText(lv, PAD_L + chartW + 6, yI(lv, 0, 100, indOffset) + 3); });
      ctx.strokeStyle = "#7e57c2"; ctx.lineWidth = 1.4; ctx.beginPath(); let s = false; rsi.forEach((v, i) => { if (v == null) return; if (!s) { ctx.moveTo(xOf(i), yI(v, 0, 100, indOffset)); s = true; } else ctx.lineTo(xOf(i), yI(v, 0, 100, indOffset)); }); ctx.stroke();
      ctx.fillStyle = "#7e57c2"; ctx.font = "9px Arial"; ctx.textAlign = "left"; ctx.fillText("RSI 14", PAD_L + 4, indOffset + 11);
    } else if (subChart === "KDJ") {
      const kdj = calcKDJ(allHighs, allLows, allCloses).slice(start, end);
      const ks = kdj.map((x) => x.k).filter(Boolean), ds = kdj.map((x) => x.d).filter(Boolean), js = kdj.map((x) => x.j).filter(Boolean);
      const mn = Math.min(...ks, ...ds, ...js) - 5, mx = Math.max(...ks, ...ds, ...js) + 5;
      const dl = (key, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); let s = false; kdj.forEach((v, i) => { const val = v[key]; if (val == null) return; if (!s) { ctx.moveTo(xOf(i), yI(val, mn, mx, indOffset)); s = true; } else ctx.lineTo(xOf(i), yI(val, mn, mx, indOffset)); }); ctx.stroke(); };
      dl("k", "#ffb300"); dl("d", "#2962ff"); dl("j", "#e040fb");
      ctx.font = "9px Arial"; ctx.textAlign = "left"; [["K", "#ffb300", 0], ["D", "#2962ff", 18], ["J", "#e040fb", 36]].forEach(([l, c, x]) => { ctx.fillStyle = c; ctx.fillText(l, PAD_L + 4 + x, indOffset + 11); });
    }
    ctx.strokeStyle = TV.grid; ctx.lineWidth = 1; [PRICE_H + PAD_TOP + 2, indOffset - 4].forEach((y) => { ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(PAD_L, H - PAD_BOT); ctx.lineTo(PAD_L + chartW, H - PAD_BOT); ctx.stroke();
    ctx.font = "10px Arial"; ctx.textAlign = "center"; ctx.fillStyle = TV.axisText;
    for (let i = 0; i < vn; i += stepV) { const d = new Date(vis[i].t + tzOffset * 60000); const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0"), dd = String(d.getUTCDate()).padStart(2, "0"), mo = String(d.getUTCMonth() + 1).padStart(2, "0"); ctx.fillText(`${mo}/${dd} ${hh}:${mm}`, xOf(i), H - PAD_BOT + 14); }
    const lastC = candles[candles.length - 1], lastUp = lastC.c >= lastC.o;
    if (lastC.c >= priceMin && lastC.c <= priceMax) {
      const y = yP(lastC.c); ctx.strokeStyle = lastUp ? TV.up : TV.down; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lastUp ? TV.up : TV.down; ctx.fillRect(PAD_L + chartW, y - 9, PAD_R, 18); ctx.fillStyle = "#fff"; ctx.font = "bold 10px Arial"; ctx.textAlign = "left"; ctx.fillText(fmtP(lastC.c), PAD_L + chartW + 5, y + 3);
    }
    const lc2 = hover && hover.idx != null && candles[hover.idx] ? candles[hover.idx] : lastC, lcUp = lc2.c >= lc2.o;
    ctx.font = "10px Arial"; ctx.textAlign = "left"; let lx = PAD_L + 4;
    [["O", lc2.o], ["H", lc2.h], ["L", lc2.l], ["C", lc2.c]].forEach(([k, v]) => { ctx.fillStyle = TV.axisText; ctx.fillText(k, lx, PAD_TOP + 4); lx += 10; ctx.fillStyle = lcUp ? TV.up : TV.down; const t = fmtP(v); ctx.fillText(t, lx, PAD_TOP + 4); lx += ctx.measureText(t).width + 10; });
    if (hover && hover.x >= PAD_L && hover.x <= PAD_L + chartW && hover.y >= PAD_TOP && hover.y <= H - PAD_BOT) {
      ctx.strokeStyle = TV.crosshair; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      const snapX = xOf(Math.round((hover.x - PAD_L) / slotW - 0.5));
      ctx.beginPath(); ctx.moveTo(snapX, PAD_TOP); ctx.lineTo(snapX, H - PAD_BOT); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD_L, hover.y); ctx.lineTo(PAD_L + chartW, hover.y); ctx.stroke(); ctx.setLineDash([]);
      const hp = priceMax - ((hover.y - PAD_TOP) / PRICE_H) * (priceMax - priceMin);
      if (hover.y <= PAD_TOP + PRICE_H) { ctx.fillStyle = TV.labelBg; ctx.fillRect(PAD_L + chartW, hover.y - 9, PAD_R, 18); ctx.fillStyle = "#fff"; ctx.font = "10px Arial"; ctx.textAlign = "left"; ctx.fillText(fmtP(hp), PAD_L + chartW + 5, hover.y + 3); }
      const hi = Math.round((hover.x - PAD_L) / slotW - 0.5);
      if (vis[hi]) { const d = new Date(vis[hi].t + tzOffset * 60000); const lab = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; ctx.font = "10px Arial"; const tw = ctx.measureText(lab).width + 12; ctx.fillStyle = TV.labelBg; ctx.fillRect(snapX - tw / 2, H - PAD_BOT + 1, tw, 16); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(lab, snapX, H - PAD_BOT + 12); }
    }
    ctx.restore();
  }, [candles, maSettings, subChart, view, hover]);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; let raf;
    const tryDraw = (a = 0) => { if (!ref.current) return; if (ref.current.offsetHeight > 0 && ref.current.offsetWidth > 0) draw(); else if (a < 60) raf = requestAnimationFrame(() => tryDraw(a + 1)); };
    const obs = new ResizeObserver(() => draw()); obs.observe(canvas); if (canvas.parentElement) obs.observe(canvas.parentElement); tryDraw();
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [draw]);
  useEffect(() => { draw(); }, [draw]);

  const move = (cx, cy) => { const c = ref.current; if (!c) return; const r = c.getBoundingClientRect(); const x = cx - r.left, y = cy - r.top; const g = geomRef.current; let idx = null; if (g) { const vi = Math.round((x - g.PAD_L) / g.slotW - 0.5); if (vi >= 0 && vi < g.vn) idx = g.start + vi; } setHover({ x, y, idx }); };
  const onWheel = (e) => { e.preventDefault(); setView((v) => { let count = Math.round(v.count * (e.deltaY > 0 ? 1.15 : 0.87)); count = Math.max(20, Math.min(candles.length, count)); return { ...v, count }; }); };
  const onDown = (cx) => { dragRef.current = { startX: cx, startOffset: view.offset }; };
  const onPan = (cx) => { if (!dragRef.current) return; const g = geomRef.current; if (!g) return; const dx = cx - dragRef.current.startX; let offset = dragRef.current.startOffset + Math.round(dx / g.slotW); offset = Math.max(0, Math.min(candles.length - view.count, offset)); setView((v) => ({ ...v, offset })); };
  const onUp = () => { dragRef.current = null; };

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", minHeight: 300, cursor: "crosshair", touchAction: "none" }}
    onMouseMove={(e) => { move(e.clientX, e.clientY); onPan(e.clientX); }} onMouseLeave={() => { setHover(null); onUp(); }} onMouseDown={(e) => onDown(e.clientX)} onMouseUp={onUp} onWheel={onWheel}
    onTouchStart={(e) => { const t = e.touches[0]; onDown(t.clientX); move(t.clientX, t.clientY); }} onTouchMove={(e) => { const t = e.touches[0]; move(t.clientX, t.clientY); onPan(t.clientX); }} onTouchEnd={() => { setHover(null); onUp(); }} />;
}

function Section({ title, color = "#58a6ff", badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid #1a2535", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "#0d1520", border: "none", borderBottom: open ? "1px solid #1a2535" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          <span style={{ color: "#c9d1d9", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{title}</span>
          {badge && <span style={{ background: color + "22", color, fontSize: 9, padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>{badge}</span>}
        </div>
        <span style={{ color: "#4a5568", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}
function IndRow({ label, value, color }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
    <span style={{ color: "#4a5568", fontSize: 10, fontFamily: "monospace" }}>{label}</span>
    <span style={{ color: color || "#c9d1d9", fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>{value ?? "—"}</span>
  </div>;
}

// state: undefined=loading, null=failed, array=data
function FeedState({ state, empty, children }) {
  if (state === undefined) return <div style={{ color: "#4a5568", fontSize: 11, fontFamily: "monospace", padding: "10px 4px", textAlign: "center" }}>連線中...</div>;
  if (state === null) return <div style={{ color: "#5a4020", fontSize: 10, lineHeight: 1.6, padding: "8px", background: "#1a1206", borderRadius: 6 }}>⚠️ 來源暫時無法連線（可能被 CORS 阻擋或對方改版）。已透過代理重試中，稍後自動恢復。</div>;
  if (Array.isArray(state) && state.length === 0) return <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>{empty || "目前無資料"}</div>;
  return children;
}

function fmtFeedTime(t) {
  if (!t) return "";
  let d;
  if (typeof t === "number") d = new Date(t < 1e12 ? t * 1000 : t);
  else d = new Date(t);
  if (isNaN(d.getTime())) return String(t).slice(0, 16);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState("crypto");
  const [tf, setTf] = useState("15m");
  const [subChart, setSubChart] = useState("MACD");
  const [maSettings, setMaSettings] = useState({ 5: true, 10: true, 20: true, 60: false });
  const [candles, setCandles] = useState([]);
  const [sideTab, setSideTab] = useState("indicators");
  const [mobileView, setMobileView] = useState("chart");
  const [smc, setSmc] = useState(null);
  const [smcMulti, setSmcMulti] = useState([]);
  const [notif, setNotif] = useState(null);
  const [notifOn, setNotifOn] = useState(false);
  const [status, setStatus] = useState("載入中...");
  const [j10cal, setJ10cal] = useState(undefined); // undefined=loading, null=fail, []=data
  const [j10flash, setJ10flash] = useState(undefined);
  const [fwFlash, setFwFlash] = useState(undefined);
  const [fwHead, setFwHead] = useState(undefined);
  const lastSig = useRef(null);

  // load market list
  useEffect(() => {
    let cancel = false;
    async function run() {
      const list = await loadMarket(category);
      if (cancel) return;
      setCoins(list); setFiltered(list);
      setStatus(list.length > 30 ? `${list.length} 商品 · 即時` : `${list.length} 商品`);
      setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null);
    }
    run(); const iv = setInterval(run, 15000);
    return () => { cancel = true; clearInterval(iv); };
  }, [category]);

  // load external feeds (Jin10 + Followin), refresh every 60s
  useEffect(() => {
    let cancel = false;
    async function run() {
      const [cal, jf, ff, fh] = await Promise.all([
        loadJin10Calendar(), loadJin10Flash(), loadFollowin("flash"), loadFollowin("headline"),
      ]);
      if (cancel) return;
      setJ10cal(cal); setJ10flash(jf); setFwFlash(ff); setFwHead(fh);
    }
    run(); const iv = setInterval(run, 60000);
    return () => { cancel = true; clearInterval(iv); };
  }, []);

  useEffect(() => { if (!search) { setFiltered(coins); return; } const q = search.toUpperCase(); setFiltered(coins.filter((c) => c.name.includes(q) || c.symbol.includes(q) || (c.label || "").toUpperCase().includes(q))); }, [search, coins]);

  // load real klines when selection/timeframe changes, refresh every 10s
  useEffect(() => {
    if (!selected) return; let cancel = false;
    async function run() { const k = await loadKlines(selected, tf); if (!cancel && k && k.length) setCandles(k); }
    run(); const iv = setInterval(run, 10000);
    return () => { cancel = true; clearInterval(iv); };
  }, [selected, tf]);

  // SMC on real candles
  useEffect(() => {
    if (candles.length < 40 || !selected) { setSmc(null); return; }
    const r = analyzeSMC(candles); setSmc(r);
    if (r) {
      const isDir = r.signal.includes("做多") || r.signal.includes("做空");
      const key = `${selected.symbol}-${r.signal}`;
      if (isDir && lastSig.current !== key) {
        lastSig.current = key;
        const p = { signal: r.signal, color: r.color, symbol: selected.symbol, ts: Date.now(), confidence: r.confidence };
        setNotif(p);
        if (notifOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification(`📊 ${selected.symbol} SMC 訊號`, { body: `${r.signal}｜信心 ${r.confidence}%` }); } catch {}
        }
        setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
      }
    }
  }, [candles, selected, notifOn]);

  // multi-timeframe SMC (real klines per tf)
  useEffect(() => {
    if (!selected) return; let cancel = false;
    analyzeSMCMulti(selected).then((r) => { if (!cancel) setSmcMulti(r); });
    return () => { cancel = true; };
  }, [selected]);

  async function enableNotif() {
    if (typeof Notification === "undefined") { setNotifOn(true); return; }
    try { const p = await Notification.requestPermission(); setNotifOn(true); if (p === "granted") new Notification("✅ 通知已開啟", { body: "SMC 多空訊號將即時通知你" }); } catch { setNotifOn(true); }
  }

  const indData = (() => {
    if (candles.length < 30) return null;
    const closes = candles.map((c) => c.c), highs = candles.map((c) => c.h), lows = candles.map((c) => c.l), vols = candles.map((c) => c.v), n = closes.length - 1;
    const rsi = calcRSI(closes), { macd, signal, hist } = calcMACD(closes), kdj = calcKDJ(highs, lows, closes);
    return { rsi: rsi[n], macd: macd[n], signal: signal[n], hist: hist[n], kdj: kdj[n], ma5: calcSMA(closes, 5)[n], ma10: calcSMA(closes, 10)[n], ma20: calcSMA(closes, 20)[n], ma60: calcSMA(closes, 60)[n], curVol: vols[n], avgVol: vols.slice(-20).reduce((a, b) => a + b, 0) / 20 };
  })();

  const price = selected ? (coins.find((c) => c.symbol === selected.symbol)?.price || selected.price || candles[candles.length - 1]?.c || 0) : 0;
  const change = selected ? (coins.find((c) => c.symbol === selected.symbol)?.change || selected.change || 0) : 0;
  const up = change >= 0;
  const fmtPr = (v) => (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));

  const CoinList = ({ horizontal }) => (
    <>
      <div style={{ display: "flex", flexWrap: horizontal ? "nowrap" : "wrap", gap: 4, padding: horizontal ? "6px 8px 0" : "8px 8px 4px", overflowX: horizontal ? "auto" : "visible" }}>
        {MARKET_CATS.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} style={{ flexShrink: 0, background: category === c.id ? "#0f1e2e" : "transparent", border: `1px solid ${category === c.id ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: category === c.id ? "#58a6ff" : "#8b949e", padding: "3px 8px", fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap" }}>{c.label}</button>
        ))}
      </div>
      <div style={{ padding: "4px 8px 6px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋..." style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, color: "#c9d1d9", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
      </div>
    </>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#070b10", color: "#c9d1d9", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#1a2535;border-radius:2px}button{cursor:pointer;outline:none}@keyframes slideDown{from{transform:translate(-50%,-120%);opacity:0}to{transform:translate(-50%,0);opacity:1}}`}</style>

      {notif && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "slideDown .35s ease-out", background: "#0d1520", border: `1.5px solid ${notif.color}`, color: notif.color, borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 30px rgba(0,0,0,.6)", maxWidth: "92vw" }}>
          <div style={{ fontSize: 22 }}>{notif.signal.includes("做多") ? "📈" : "📉"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8 }}><span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{notif.symbol}</span><span style={{ color: notif.color, fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{notif.signal}</span></div>
            <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace" }}>SMC 訊號 · 信心 {notif.confidence}% · {new Date(notif.ts).toLocaleTimeString()}</div>
          </div>
          <button onClick={() => setNotif(null)} style={{ background: "transparent", border: "none", color: "#4a5568", fontSize: 18 }}>×</button>
        </div>
      )}

      <div style={{ background: "#0a0f18", borderBottom: "1px solid #1a2535", padding: "0 14px", display: "flex", alignItems: "center", height: 46, gap: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>₿</div>
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#e6edf3" }}>CRYPTEX</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {smc && (smc.signal.includes("做多") || smc.signal.includes("做空")) && <span style={{ color: smc.color, fontSize: 10, fontFamily: "monospace", fontWeight: 700, border: `1px solid ${smc.color}`, borderRadius: 4, padding: "1px 6px" }}>{smc.signal}</span>}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950" }} />
          <span style={{ color: "#354050", fontSize: 9, fontFamily: "monospace" }}>{status}</span>
        </div>
      </div>

      {isMobile && <div style={{ background: "#080d14", borderBottom: "1px solid #1a2535", flexShrink: 0 }}>
        <CoinList horizontal />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 8px 8px" }}>
          {filtered.map((coin) => { const live = coins.find((c) => c.symbol === coin.symbol) || coin; const active = selected?.symbol === coin.symbol; return (
            <button key={coin.symbol} onClick={() => setSelected(live)} style={{ flexShrink: 0, background: active ? "#0f1e2e" : "#0d1520", border: `1px solid ${active ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 1, minWidth: 78 }}>
              <span style={{ color: active ? "#e6edf3" : "#8b949e", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{coin.name}</span>
              <span style={{ color: live.change >= 0 ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>{live.change >= 0 ? "+" : ""}{live.change?.toFixed(2)}%</span>
            </button>); })}
        </div>
      </div>}

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", minHeight: 0 }}>
        {!isMobile && <div style={{ width: 180, background: "#080d14", borderRight: "1px solid #1a2535", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <CoinList />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ color: "#354050", fontSize: 10, fontFamily: "monospace", padding: "12px 10px" }}>載入中...</div>}
            {filtered.map((coin) => { const live = coins.find((c) => c.symbol === coin.symbol) || coin; const active = selected?.symbol === coin.symbol; return (
              <button key={coin.symbol} onClick={() => setSelected(live)} style={{ width: "100%", background: active ? "#0f1e2e" : "transparent", border: "none", borderLeft: `2px solid ${active ? "#58a6ff" : "transparent"}`, padding: "7px 10px", display: "flex", flexDirection: "column", gap: 1, textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: active ? "#e6edf3" : "#8b949e", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{coin.name}</span><span style={{ color: live.change >= 0 ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>{live.change >= 0 ? "+" : ""}{live.change?.toFixed(2)}%</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>${fmtPr(live.price)}</span>{coin.label && <span style={{ color: "#354050", fontSize: 8 }}>{(coin.label || "").slice(0, 8)}</span>}</div>
              </button>); })}
          </div>
        </div>}

        {(!isMobile || mobileView === "chart") && <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <div style={{ background: "#131722", borderBottom: "1px solid #1e222d", padding: "8px 14px", display: "flex", alignItems: "center", gap: 20, flexShrink: 0, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#e6edf3" }}>${fmtPr(price)}</span><span style={{ color: up ? "#26a69a" : "#ef5350", fontSize: 11, fontFamily: "monospace" }}>{up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%</span></div>
              <div style={{ color: "#354050", fontSize: 9, fontFamily: "monospace" }}>{selected?.symbol} · {MARKET_CATS.find((c) => c.id === category)?.label} · 即時</div>
            </div>
            {candles.length > 0 && (() => { const lc = candles[candles.length - 1]; return [["開", lc.o], ["高", lc.h, "#26a69a"], ["低", lc.l, "#ef5350"], ["收", lc.c]].map(([l, v, c]) => <div key={l}><div style={{ color: "#354050", fontSize: 9, fontFamily: "monospace" }}>{l}</div><div style={{ color: c || "#c9d1d9", fontSize: 10, fontFamily: "monospace" }}>{fmtPr(v)}</div></div>); })()}
          </div>
          <div style={{ background: "#131722", borderBottom: "1px solid #1e222d", padding: "5px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {INTERVALS.map((iv) => <button key={iv} onClick={() => setTf(iv)} style={{ background: tf === iv ? "#0f1e2e" : "transparent", border: `1px solid ${tf === iv ? "#58a6ff" : "transparent"}`, borderRadius: 4, color: tf === iv ? "#58a6ff" : "#4a5568", padding: "3px 8px", fontSize: 10, fontFamily: "monospace" }}>{iv}</button>)}
            <div style={{ width: 1, height: 14, background: "#1a2535" }} />
            <span style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>MA:</span>
            {Object.entries(MA_COLORS).map(([p, col]) => <button key={p} onClick={() => setMaSettings((s) => ({ ...s, [p]: !s[p] }))} style={{ background: maSettings[p] ? col + "18" : "transparent", border: `1px solid ${maSettings[p] ? col : "#1a2535"}`, borderRadius: 4, color: maSettings[p] ? col : "#354050", padding: "2px 7px", fontSize: 9, fontFamily: "monospace" }}>{p}</button>)}
            <div style={{ width: 1, height: 14, background: "#1a2535" }} />
            {["MACD", "RSI", "KDJ"].map((s) => <button key={s} onClick={() => setSubChart(s)} style={{ background: subChart === s ? "#1a2535" : "transparent", border: `1px solid ${subChart === s ? "#a78bfa" : "transparent"}`, borderRadius: 4, color: subChart === s ? "#a78bfa" : "#4a5568", padding: "3px 8px", fontSize: 10, fontFamily: "monospace" }}>{s}</button>)}
          </div>
          <div style={{ flex: 1, overflow: "hidden", minHeight: isMobile ? 360 : 320, background: "#131722" }}>
            {candles.length > 0 ? <ChartCanvas candles={candles} maSettings={maSettings} subChart={subChart} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#354050", fontSize: 12, fontFamily: "monospace" }}>載入真實 K 線中...</div>}
          </div>
        </div>}

        {(!isMobile || mobileView === "panel") && <div style={{ width: isMobile ? "100%" : 280, background: "#080d14", borderLeft: isMobile ? "none" : "1px solid #1a2535", display: "flex", flexDirection: "column", overflow: "hidden", flex: isMobile ? 1 : "none", minHeight: 0 }}>
          <div style={{ display: "flex", borderBottom: "1px solid #1a2535", flexShrink: 0 }}>
            {[["indicators", "指標"], ["smc", "SMC訊號"], ["feeds", "資訊"], ["news", "說明"]].map(([id, label]) => <button key={id} onClick={() => setSideTab(id)} style={{ flex: 1, background: sideTab === id ? "#0d1520" : "transparent", border: "none", borderBottom: `2px solid ${sideTab === id ? "#58a6ff" : "transparent"}`, color: sideTab === id ? "#e6edf3" : "#4a5568", padding: "10px 0", fontSize: 11, fontFamily: "monospace" }}>{label}</button>)}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
            {sideTab === "indicators" && indData && <>
              <Section title="RSI (14)" color="#a78bfa">
                <IndRow label="RSI 值" value={indData.rsi?.toFixed(2)} color={indData.rsi > 70 ? "#ef5350" : indData.rsi < 30 ? "#26a69a" : "#c9d1d9"} />
                <IndRow label="區間狀態" value={indData.rsi > 70 ? "超買 ⚠️" : indData.rsi < 30 ? "超賣 🟢" : "中性"} />
                <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "#1a2535", overflow: "hidden" }}><div style={{ width: `${Math.min(100, indData.rsi || 0)}%`, height: "100%", background: indData.rsi > 70 ? "#ef5350" : indData.rsi < 30 ? "#26a69a" : "#a78bfa" }} /></div>
              </Section>
              <Section title="MACD (12,26,9)" color="#2962ff">
                <IndRow label="MACD" value={indData.macd?.toFixed(4)} /><IndRow label="Signal" value={indData.signal?.toFixed(4)} />
                <IndRow label="Histogram" value={indData.hist?.toFixed(4)} color={(indData.hist || 0) > 0 ? "#26a69a" : "#ef5350"} />
                <IndRow label="趨勢" value={(indData.hist || 0) > 0 ? "多頭 ↑" : "空頭 ↓"} color={(indData.hist || 0) > 0 ? "#26a69a" : "#ef5350"} />
              </Section>
              <Section title="KDJ (9,3,3)" color="#ffb300">
                <IndRow label="K" value={indData.kdj?.k?.toFixed(2)} color="#ffb300" /><IndRow label="D" value={indData.kdj?.d?.toFixed(2)} color="#2962ff" /><IndRow label="J" value={indData.kdj?.j?.toFixed(2)} color="#e040fb" />
                <IndRow label="信號" value={(indData.kdj?.k || 0) > (indData.kdj?.d || 0) ? "金叉 🟢" : "死叉 🔴"} color={(indData.kdj?.k || 0) > (indData.kdj?.d || 0) ? "#26a69a" : "#ef5350"} />
              </Section>
              <Section title="移動平均線 MA" color="#f0e68c">
                {[[5, "#f0e68c"], [10, "#87ceeb"], [20, "#ff8c69"], [60, "#da70d6"]].map(([p, col]) => <IndRow key={p} label={`MA${p}`} value={indData[`ma${p}`]?.toFixed(p <= 10 ? 4 : 2)} color={col} />)}
                <IndRow label="多空排列" value={(indData.ma5 || 0) > (indData.ma20 || 0) ? "多頭 ↑" : "空頭 ↓"} color={(indData.ma5 || 0) > (indData.ma20 || 0) ? "#26a69a" : "#ef5350"} />
              </Section>
            </>}
            {sideTab === "smc" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空訊號通知</div><div style={{ color: "#4a5568", fontSize: 9 }}>橫幅 + 系統通知</div></div>
                <button onClick={enableNotif} style={{ background: notifOn ? "#26a69a" : "#1a2535", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{notifOn ? "✓ 已開啟" : "開啟通知"}</button>
              </div>
              {smc ? <>
                <div style={{ background: `${smc.color}14`, border: `1px solid ${smc.color}`, borderRadius: 10, padding: 14, marginBottom: 10, textAlign: "center" }}>
                  <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>SMC 綜合訊號 · {selected?.symbol}</div>
                  <div style={{ color: smc.color, fontSize: 26, fontWeight: 800, fontFamily: "monospace", letterSpacing: 1 }}>{smc.signal}</div>
                  <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: "#1a2535", overflow: "hidden" }}><div style={{ width: `${smc.confidence}%`, height: "100%", background: smc.color }} /></div>
                  <div style={{ color: smc.color, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>信心度 {smc.confidence}%</div>
                </div>
                <Section title="多時區 SMC 結構" color="#26a69a" badge="MTF">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {smcMulti.map(({ tf: t, result: r }) => { const sig = r ? r.signal : "資料不足"; const col = r ? r.color : "#4a5568"; return (
                      <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "#0d1520", borderRadius: 6, border: `1px solid ${r ? col + "44" : "#1a2535"}` }}>
                        <span style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, width: 36 }}>{t}</span>
                        <span style={{ color: col, fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 64 }}>{sig}</span>
                        {r && <><span style={{ flex: 1, color: "#4a5568", fontSize: 9, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.structure}</span><span style={{ color: col, fontSize: 9, fontFamily: "monospace" }}>{r.confidence}%</span></>}
                      </div>); })}
                  </div>
                  {(() => { const v = smcMulti.filter((m) => m.result); const lo = v.filter((m) => m.result.signal.includes("做多")).length; const sh = v.filter((m) => m.result.signal.includes("做空")).length; let txt = "各週期分歧，建議觀望", col = "#787b86"; if (lo >= 3) { txt = "多週期共振看多 📈"; col = "#26a69a"; } else if (sh >= 3) { txt = "多週期共振看空 📉"; col = "#ef5350"; } else if (lo > sh) { txt = "偏多"; col = "#26a69a"; } else if (sh > lo) { txt = "偏空"; col = "#ef5350"; } return <div style={{ marginTop: 8, padding: "6px 8px", background: col + "18", borderRadius: 6, color: col, fontSize: 11, fontFamily: "monospace", textAlign: "center", fontWeight: 700 }}>{txt}</div>; })()}
                </Section>
                <Section title="市場結構" color="#58a6ff">
                  <IndRow label="當前結構" value={smc.structure} color={smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
                  <IndRow label="流動性掃單" value={smc.sweep || "無"} color={smc.sweep ? "#f0e68c" : "#4a5568"} />
                  <IndRow label="FVG 失衡" value={smc.fvg ? (smc.fvg.type === "bull" ? "多頭缺口" : "空頭缺口") : "無"} color={smc.fvg ? (smc.fvg.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
                  <IndRow label="訂單塊 OB" value={smc.ob ? (smc.ob.type === "bull" ? "多頭OB" : "空頭OB") : "無"} color={smc.ob ? (smc.ob.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
                </Section>
                <Section title="輔助確認" color="#a78bfa">
                  <IndRow label="MACD" value={smc.confirm.macd} color={smc.confirm.macd === "多頭" ? "#26a69a" : smc.confirm.macd === "空頭" ? "#ef5350" : "#c9d1d9"} />
                  <IndRow label="RSI" value={smc.confirm.rsi} color={smc.confirm.rsi === "偏多" ? "#26a69a" : smc.confirm.rsi === "偏空" ? "#ef5350" : "#c9d1d9"} />
                  <IndRow label="KDJ" value={smc.confirm.kdj} color={smc.confirm.kdj === "金叉" ? "#26a69a" : smc.confirm.kdj === "死叉" ? "#ef5350" : "#c9d1d9"} />
                </Section>
                <Section title="判斷依據" color="#f0e68c">
                  {smc.reasons.length ? smc.reasons.map((r, i) => <div key={i} style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.6, padding: "3px 0" }}><span style={{ color: "#4a5568" }}>{i + 1}. </span>{r}</div>) : <div style={{ color: "#4a5568", fontSize: 11 }}>無明確訊號，建議觀望。</div>}
                </Section>
                <div style={{ background: "#130a0a", border: "1px solid #2a1010", borderRadius: 8, padding: 10 }}><div style={{ color: "#5a2020", fontSize: 9, lineHeight: 1.6 }}>⚠️ SMC 訊號僅供參考，不構成投資建議。</div></div>
              </> : <div style={{ color: "#4a5568", fontSize: 11, fontFamily: "monospace", padding: "20px 4px", textAlign: "center" }}>正在分析真實 K 線 SMC 結構...</div>}
            </>}
            {sideTab === "feeds" && <>
              <Section title="金十日曆 (財經事件)" color="#f0b90b" badge="Jin10">
                <FeedState state={j10cal}>
                  {Array.isArray(j10cal) && j10cal.map((e, i) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: i < j10cal.length - 1 ? "1px solid #111824" : "none" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace", minWidth: 38 }}>{fmtFeedTime(e.time)}</span>
                        {e.country && <span style={{ color: "#58a6ff", fontSize: 9 }}>{e.country}</span>}
                        {!!e.importance && <span style={{ color: "#f0b90b", fontSize: 9 }}>{"★".repeat(Math.min(3, e.importance))}</span>}
                      </div>
                      <div style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>{e.event}</div>
                      {(e.actual || e.forecast || e.previous) && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 2 }}>實際 {e.actual || "—"} · 預期 {e.forecast || "—"} · 前值 {e.previous || "—"}</div>}
                    </div>
                  ))}
                </FeedState>
              </Section>

              <Section title="金十快訊" color="#f0b90b" badge="Jin10">
                <FeedState state={j10flash}>
                  {Array.isArray(j10flash) && j10flash.map((n, i) => (
                    <div key={i} style={{ padding: "7px 0", borderBottom: i < j10flash.length - 1 ? "1px solid #111824" : "none" }}>
                      <div style={{ display: "flex", gap: 7 }}>
                        <span style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace", minWidth: 38, flexShrink: 0 }}>{fmtFeedTime(n.time)}</span>
                        <span style={{ color: n.important ? "#ef5350" : "#c9d1d9", fontSize: 11, lineHeight: 1.5, fontWeight: n.important ? 700 : 400 }}>{n.text}</span>
                      </div>
                    </div>
                  ))}
                </FeedState>
              </Section>

              <Section title="Followin 快訊" color="#2962ff" badge="Followin">
                <FeedState state={fwFlash}>
                  {Array.isArray(fwFlash) && fwFlash.map((n, i) => (
                    <div key={i} style={{ padding: "7px 0", borderBottom: i < fwFlash.length - 1 ? "1px solid #111824" : "none" }}>
                      <div style={{ display: "flex", gap: 7 }}>
                        <span style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace", minWidth: 38, flexShrink: 0 }}>{fmtFeedTime(n.time)}</span>
                        <span style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.5 }}>{n.title}</span>
                      </div>
                    </div>
                  ))}
                </FeedState>
              </Section>

              <Section title="Followin 頭條" color="#2962ff" badge="Followin" defaultOpen={false}>
                <FeedState state={fwHead}>
                  {Array.isArray(fwHead) && fwHead.map((n, i) => (
                    <a key={i} href={n.url || undefined} target="_blank" rel="noreferrer" style={{ display: "block", padding: "8px 0", borderBottom: i < fwHead.length - 1 ? "1px solid #111824" : "none", textDecoration: "none" }}>
                      <div style={{ color: "#e6edf3", fontSize: 12, lineHeight: 1.5, fontWeight: 600 }}>{n.title}</div>
                      {n.summary && <div style={{ color: "#8b949e", fontSize: 10, lineHeight: 1.5, marginTop: 3 }}>{n.summary.slice(0, 80)}</div>}
                      <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 3 }}>{n.source} · {fmtFeedTime(n.time)}</div>
                    </a>
                  ))}
                </FeedState>
              </Section>
            </>}

            {sideTab === "news" && <div style={{ color: "#8b949e", fontSize: 12, lineHeight: 1.8, padding: 4 }}>
              <p style={{ color: "#e6edf3", fontWeight: 700, marginBottom: 8 }}>📡 資料來源</p>
              <p>加密貨幣：Binance / OKX / CoinGecko 即時</p>
              <p>美股/台股/外匯/期貨/指數/商品：Yahoo Finance（透過代理）</p>
              <p style={{ marginTop: 8 }}>K 線為真實交易所資料，每 10 秒更新；商品清單每 15 秒同步。</p>
            </div>}
          </div>
        </div>}
      </div>

      {isMobile && <div style={{ display: "flex", background: "#0a0f18", borderTop: "1px solid #1a2535", flexShrink: 0 }}>
        {[["chart", "📈 K線圖"], ["panel", "📊 指標/分析"]].map(([id, label]) => <button key={id} onClick={() => setMobileView(id)} style={{ flex: 1, background: mobileView === id ? "#0f1e2e" : "transparent", border: "none", borderTop: `2px solid ${mobileView === id ? "#58a6ff" : "transparent"}`, color: mobileView === id ? "#58a6ff" : "#4a5568", padding: "12px 0", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>)}
      </div>}
    </div>
  );
}