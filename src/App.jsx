import { useState, useEffect, useMemo } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti, aiAnalyze, aiAnalyzeCryptoDeep,
  calcSMA, calcMACD, calcRSI, calcKDJ, calcATR,
  loadJin10Flash, subscribeCryptoTicker, loadPeriodChanges,
  scanRecommendations, scanAnomalies, backtest, backtestMTF, analyzeMultiAI,
} from "./data.js";

const INTERVALS = ["15m", "1H", "4H", "1D"];

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 760 : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth < 760);
    window.addEventListener("resize", f); f();
    return () => window.removeEventListener("resize", f);
  }, []);
  return m;
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
function FeedState({ state, empty, children }) {
  if (state === undefined) return <div style={{ color: "#4a5568", fontSize: 11, fontFamily: "monospace", padding: "10px 4px", textAlign: "center" }}>連線中...</div>;
  if (state === null) return <div style={{ color: "#5a4020", fontSize: 10, lineHeight: 1.6, padding: "8px", background: "#1a1206", borderRadius: 6 }}>⚠️ 來源暫時無法連線，稍後自動恢復。</div>;
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
const SearchInput = ({ value, onChange }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="搜尋..."
    style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, color: "#c9d1d9", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }}
  />
);

// AI 卡片
function AICard({ ai, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!ai) return null;
  return (
    <div style={{ border: `1px solid ${ai.color}55`, background: `${ai.color}0a`, borderRadius: 8, marginBottom: 6, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "transparent", border: "none", padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <span style={{ fontSize: 16 }}>{ai.emoji}</span>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{ai.name}</div>
          <div style={{ color: ai.color, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{ai.direction} · {ai.confidence}%</div>
        </div>
        <div style={{ width: 60, height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden", marginRight: 6 }}>
          <div style={{ width: `${ai.confidence}%`, height: "100%", background: ai.color }} />
        </div>
        <span style={{ color: "#4a5568", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: "0 10px 10px", borderTop: "1px solid #1a2535" }}>
        {ai.reasons.map((r, i) => (
          <div key={i} style={{ color: "#8b949e", fontSize: 10, lineHeight: 1.6, padding: "2px 0" }}>· {r}</div>
        ))}
      </div>}
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tf, setTf] = useState("1H");
  const [candles, setCandles] = useState([]);
  const [sideTab, setSideTab] = useState("smc");
  const [smc, setSmc] = useState(null);
  const [smcMulti, setSmcMulti] = useState([]);
  const [ai, setAI] = useState(null);
  const [aiDeep, setAiDeep] = useState(null);
  const [aiDeepLoading, setAiDeepLoading] = useState(false);
  const [multiAI, setMultiAI] = useState(null);
  const [multiAILoading, setMultiAILoading] = useState(false);
  const [notif, setNotif] = useState(null);
  const [notifOn, setNotifOn] = useState(false);
  const [status, setStatus] = useState("載入中...");
  const [j10flash, setJ10flash] = useState(undefined);
  const [periodChg, setPeriodChg] = useState(null);
  const [recs, setRecs] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsTs, setRecsTs] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [btResult, setBtResult] = useState(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btMode, setBtMode] = useState("mtf"); // "mtf" 高勝率, "simple" 基本
  const [listLimit, setListLimit] = useState(50);
  // 開單計畫（鎖定，不隨 K 線跳動）
  const [orderPlan, setOrderPlan] = useState(null);
  const [capital, setCapital] = useState(1000);
  const [riskPct, setRiskPct] = useState(2);
  const [leverage, setLeverage] = useState(10);
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);

  const lastSig = { current: null }; // 暫不用 useRef 簡化

  const filtered = useMemo(() => {
    if (!search) return coins;
    const q = search.toUpperCase();
    return coins.filter((c) => c.name.toUpperCase().includes(q) || (c.symbol || "").toUpperCase().includes(q) || (c.label || "").toUpperCase().includes(q));
  }, [search, coins]);
  const visibleList = useMemo(() => search ? filtered : filtered.slice(0, listLimit), [filtered, search, listLimit]);

  // 載入加密貨幣列表
  useEffect(() => {
    let cancel = false;
    async function run() {
      const list = await loadMarket("crypto");
      if (cancel) return;
      setCoins(list);
      setStatus(list.length > 0 ? `${list.length} 商品 · 即時` : `來源連線中`);
      setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null);
    }
    run();
    if (search) return () => { cancel = true; };
    const iv = setInterval(run, 30000);
    return () => { cancel = true; clearInterval(iv); };
  }, [search]);

  // 金十快訊
  useEffect(() => {
    let cancel = false;
    async function run() { const r = await loadJin10Flash(); if (!cancel) setJ10flash(r); }
    run(); const iv = setInterval(run, 60000);
    return () => { cancel = true; clearInterval(iv); };
  }, []);

  // 載入 K 線（後台用，給指標/SMC/AI 計算，UI 不畫圖）
  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    setCandles([]);
    loadKlines(selected, tf).then((k) => { if (!cancel && k && k.length) setCandles(k); });
    const iv = setInterval(() => {
      loadKlines(selected, tf).then((k) => {
        if (cancel || !k || !k.length) return;
        setCandles((prev) => (prev.length && k[k.length - 1].t === prev[prev.length - 1].t ? prev : k));
      });
    }, 60000);
    return () => { cancel = true; clearInterval(iv); };
  }, [selected, tf]);

  // SMC（只在新 K 棒時重算）
  const lastCandleT = candles.length > 0 ? candles[candles.length - 1].t : 0;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCandleT, selected, notifOn]);

  // SMC 多時區
  useEffect(() => {
    if (!selected) return; let cancel = false;
    analyzeSMCMulti(selected).then((r) => { if (!cancel) setSmcMulti(r); });
    return () => { cancel = true; };
  }, [selected]);

  // AI 基本（用於 fallback）
  useEffect(() => {
    if (!selected || !candles.length || !smc) { setAI(null); return; }
    setAI(aiAnalyze(selected, candles, smc, smcMulti));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, smc, smcMulti]);

  // 多週期漲跌
  useEffect(() => {
    if (!selected) { setPeriodChg(null); return; }
    let cancel = false;
    setPeriodChg(null);
    loadPeriodChanges(selected).then((r) => { if (!cancel) setPeriodChg(r); });
    return () => { cancel = true; };
  }, [selected]);

  // Trade WebSocket（即時價）
  useEffect(() => {
    if (!selected || selected.cat !== "crypto") return;
    let lastTs = 0;
    const sym = selected.binanceSymbol || `${selected.name}USDT`;
    const off = subscribeCryptoTicker(sym, (p) => {
      const now = Date.now();
      if (now - lastTs < 200) return;
      lastTs = now;
      setCandles((cs) => {
        if (!cs || !cs.length) return cs;
        const copy = cs.slice();
        const last = { ...copy[copy.length - 1] };
        last.c = p;
        if (p > last.h) last.h = p;
        if (p < last.l) last.l = p;
        copy[copy.length - 1] = last;
        return copy;
      });
    });
    return () => off();
  }, [selected]);

  // 推薦掃描
  const coinsLoaded = coins.length > 0;
  useEffect(() => {
    if (sideTab !== "recs" || !coinsLoaded) return;
    if (recs && Date.now() - recsTs < 5 * 60 * 1000) return;
    let cancel = false;
    setRecsLoading(true);
    scanRecommendations(coins, 200).then((r) => {
      if (cancel) return;
      setRecs(r); setRecsTs(Date.now()); setRecsLoading(false);
    }).catch(() => { if (!cancel) setRecsLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, coinsLoaded, recsTs]);

  // 警報掃描
  useEffect(() => {
    if (!coinsLoaded) return;
    let cancel = false;
    async function scan() {
      if (cancel) return;
      try {
        const a = await scanAnomalies(coins, 200);
        if (cancel) return;
        setAlerts((prev) => {
          const map = new Map();
          [...a, ...prev].forEach((x) => {
            const key = `${x.symbol}-${x.type}`;
            const ex = map.get(key);
            if (!ex || x.ts > ex.ts) map.set(key, x);
          });
          return Array.from(map.values()).sort((x, y) => y.ts - x.ts).slice(0, 50);
        });
      } catch {}
    }
    scan();
    const iv = setInterval(scan, 3 * 60 * 1000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinsLoaded]);

  // AI 深度（單一綜合，仍保留）
  useEffect(() => {
    if (sideTab !== "ai" || !selected || !candles.length || !smc) return;
    let cancel = false;
    setAiDeepLoading(true);
    aiAnalyzeCryptoDeep(selected, candles, smc, smcMulti).then((r) => {
      if (!cancel) { setAiDeep(r); setAiDeepLoading(false); }
    }).catch(() => { if (!cancel) setAiDeepLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, selected, smc, smcMulti]);

  // 多 AI 個別分析（5 個派系）
  useEffect(() => {
    if (sideTab !== "ai" || !selected || !candles.length || !smc) return;
    let cancel = false;
    setMultiAILoading(true);
    analyzeMultiAI(selected, candles, smc, smcMulti).then((r) => {
      if (!cancel) { setMultiAI(r); setMultiAILoading(false); }
    }).catch(() => { if (!cancel) setMultiAILoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, selected, smc, smcMulti]);

  // 開單計畫（鎖定點位，避免跟著 K 線跳動）
  // 重算時機：選擇商品變、tf 變、SMC 訊號真變化、手動刷新
  useEffect(() => {
    if (!selected || !candles.length || !smc) {
      setOrderPlan(null);
      return;
    }
    const closes = candles.map((c) => c.c);
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    const atrArr = calcATR(highs, lows, closes);
    const atrNow = atrArr[atrArr.length - 1] || (closes[closes.length - 1] * 0.01);
    const price = closes[closes.length - 1];
    const isLong = smc.signal.includes("做多");
    const isShort = smc.signal.includes("做空");
    if (!isLong && !isShort) {
      setOrderPlan(null);
      return;
    }
    setOrderPlan({
      isLong,
      entry: price,
      stop: isLong ? price - atrNow * 1.5 : price + atrNow * 1.5,
      target1: isLong ? price + atrNow * 2 : price - atrNow * 2,
      target2: isLong ? price + atrNow * 4 : price - atrNow * 4,
      atr: atrNow,
      signal: smc.signal,
      confidence: smc.confidence,
      tf,
      ts: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tf, smc?.signal, orderRefreshKey]);

  // 回測（高勝率多時區 或 基本版）
  useEffect(() => {
    if (sideTab !== "backtest" || !selected) return;
    let cancel = false;
    setBtLoading(true);
    setBtResult(null);
    (async () => {
      let r;
      if (btMode === "mtf") {
        r = await backtestMTF(selected).catch(() => null);
      } else {
        const k = await loadKlines(selected, "1H");
        r = k && k.length >= 80 ? backtest(k) : null;
      }
      if (!cancel) { setBtResult(r); setBtLoading(false); }
    })();
    return () => { cancel = true; };
  }, [sideTab, selected, btMode]);

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

  const displayPrice = candles.length ? candles[candles.length - 1].c : (selected?.price || 0);
  const change24h = selected ? (coins.find((c) => c.symbol === selected.symbol)?.change ?? selected.change ?? 0) : 0;
  const up = change24h >= 0;
  const fmtPr = (v) => (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));
  const fmtVol = (v) => {
    if (!v || v <= 0) return "";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return String(Math.round(v));
  };

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

      {/* 手機版：商品列表 chips（橫向） */}
      {isMobile && <div style={{ background: "#080d14", borderBottom: "1px solid #1a2535", flexShrink: 0 }}>
        <div style={{ padding: "6px 8px" }}>
          <SearchInput key="search-box" value={search} onChange={setSearch} />
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 8px 8px" }}>
          {visibleList.map((coin) => {
            const live = coins.find((c) => c.symbol === coin.symbol) || coin;
            const active = selected?.symbol === coin.symbol;
            return (
              <button key={coin.symbol} onClick={() => setSelected(live)} style={{ flexShrink: 0, background: active ? "#0f1e2e" : "#0d1520", border: `1px solid ${active ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, minWidth: 82, alignItems: "flex-start" }}>
                <span style={{ color: active ? "#e6edf3" : "#8b949e", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{coin.name}</span>
                <span style={{ background: (live.change || 0) >= 0 ? "#26a69a" : "#ef5350", color: "#fff", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>{(live.change || 0) >= 0 ? "+" : ""}{(live.change || 0).toFixed(2)}%</span>
              </button>
            );
          })}
        </div>
      </div>}

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", minHeight: 0 }}>
        {/* 桌面版：左側商品列表 */}
        {!isMobile && <div style={{ width: 200, background: "#080d14", borderRight: "1px solid #1a2535", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "8px" }}>
            <SearchInput key="search-box" value={search} onChange={setSearch} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ color: "#354050", fontSize: 10, fontFamily: "monospace", padding: "12px 10px" }}>{status}</div>}
            {visibleList.map((coin) => {
              const live = coins.find((c) => c.symbol === coin.symbol) || coin;
              const active = selected?.symbol === coin.symbol;
              return (
                <button key={coin.symbol} onClick={() => setSelected(live)} style={{ width: "100%", background: active ? "#0f1e2e" : "transparent", border: "none", borderLeft: `2px solid ${active ? "#58a6ff" : "transparent"}`, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: active ? "#e6edf3" : "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coin.name}</div>
                    <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coin.label ? (coin.label).slice(0, 6) : ""}{fmtVol(live.volume) ? (coin.label ? " · " : "") + fmtVol(live.volume) : ""}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <span style={{ color: "#c9d1d9", fontSize: 10, fontFamily: "monospace" }}>{fmtPr(live.price)}</span>
                    <span style={{ background: (live.change || 0) >= 0 ? "#26a69a" : "#ef5350", color: "#fff", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3, minWidth: 48, textAlign: "center" }}>{(live.change || 0) >= 0 ? "+" : ""}{(live.change || 0).toFixed(2)}%</span>
                  </div>
                </button>
              );
            })}
            {!search && filtered.length > visibleList.length && <button onClick={() => setListLimit((l) => l + 50)} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", color: "#58a6ff", padding: "8px", fontSize: 10, fontFamily: "monospace", cursor: "pointer" }}>載入更多 ({filtered.length - visibleList.length} 個)</button>}
          </div>
        </div>}

        {/* 主分析區（無 K 線） */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {/* 價格 header */}
          <div style={{ background: "#0d1520", borderBottom: "1px solid #1a2535", padding: "10px 14px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#e6edf3" }}>${fmtPr(displayPrice)}</span>
                <span style={{ color: "#354050", fontSize: 10, fontFamily: "monospace" }}>{selected?.symbol} · 加密貨幣</span>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ color: up ? "#26a69a" : "#ef5350", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{up ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%</div>
                <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>24h 變化</div>
              </div>
            </div>
          </div>

          {/* 多週期 bar */}
          {periodChg && <div style={{ background: "#0a1218", borderBottom: "1px solid #1a2535", padding: "5px 8px", display: "flex", alignItems: "center", flexShrink: 0, overflowX: "auto" }}>
            {[["今日", periodChg.today], ["7天", periodChg.d7], ["30天", periodChg.d30], ["90天", periodChg.d90], ["180天", periodChg.d180], ["1年", periodChg.y1]].map(([lbl, val]) => (
              <div key={lbl} style={{ flex: 1, minWidth: 52, textAlign: "center", padding: "0 4px" }}>
                <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{lbl}</div>
                <div style={{ color: val == null ? "#4a5568" : val >= 0 ? "#26a69a" : "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>{val == null ? "—" : (val >= 0 ? "+" : "") + val.toFixed(2) + "%"}</div>
              </div>
            ))}
          </div>}

          {/* 時間框架（給分析用） */}
          <div style={{ background: "#0a1218", borderBottom: "1px solid #1a2535", padding: "6px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>分析時間框架:</span>
            {INTERVALS.map((iv) => (
              <button key={iv} onClick={() => setTf(iv)} style={{ background: tf === iv ? "#0f1e2e" : "transparent", border: `1px solid ${tf === iv ? "#58a6ff" : "#1a2535"}`, borderRadius: 4, color: tf === iv ? "#58a6ff" : "#8b949e", padding: "3px 10px", fontSize: 10, fontFamily: "monospace" }}>{iv}</button>
            ))}
          </div>

          {/* 分頁 */}
          <div style={{ display: "flex", borderBottom: "1px solid #1a2535", flexShrink: 0, overflowX: "auto", background: "#080d14" }}>
            {[["smc", "SMC"], ["ai", "AI 分析"], ["order", "開單"], ["indicators", "指標"], ["recs", "推薦"], ["alerts", "警報"], ["backtest", "回測"], ["jin10", "金十"], ["news", "說明"]].map(([id, label]) => (
              <button key={id} onClick={() => setSideTab(id)} style={{ flex: 1, minWidth: 60, background: sideTab === id ? "#0d1520" : "transparent", border: "none", borderBottom: `2px solid ${sideTab === id ? "#58a6ff" : "transparent"}`, color: sideTab === id ? "#e6edf3" : "#4a5568", padding: "10px 0", fontSize: 11, fontFamily: "monospace" }}>{label}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            {/* SMC */}
            {sideTab === "smc" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空訊號通知</div><div style={{ color: "#4a5568", fontSize: 9 }}>橫幅 + 系統通知</div></div>
                <button onClick={enableNotif} style={{ background: notifOn ? "#26a69a" : "#1a2535", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{notifOn ? "✓ 已開啟" : "開啟通知"}</button>
              </div>
              {smc ? <>
                <div style={{ background: `${smc.color}14`, border: `1px solid ${smc.color}`, borderRadius: 10, padding: 14, marginBottom: 10, textAlign: "center" }}>
                  <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>SMC 綜合訊號 · {selected?.symbol} · {tf}</div>
                  <div style={{ color: smc.color, fontSize: 26, fontWeight: 800, fontFamily: "monospace", letterSpacing: 1 }}>{smc.signal}</div>
                  <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: "#1a2535", overflow: "hidden" }}><div style={{ width: `${smc.confidence}%`, height: "100%", background: smc.color }} /></div>
                  <div style={{ color: smc.color, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>信心度 {smc.confidence}%</div>
                </div>
                <Section title="多時區 SMC 結構" color="#26a69a" badge="MTF">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {smcMulti.map(({ tf: t, result: r }) => {
                      const sig = r ? r.signal : "資料不足";
                      const col = r ? r.color : "#4a5568";
                      return (
                        <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "#0d1520", borderRadius: 6, border: `1px solid ${r ? col + "44" : "#1a2535"}` }}>
                          <span style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, width: 36 }}>{t}</span>
                          <span style={{ color: col, fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 64 }}>{sig}</span>
                          {r && <><span style={{ flex: 1, color: "#4a5568", fontSize: 9, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.structure}</span><span style={{ color: col, fontSize: 9, fontFamily: "monospace" }}>{r.confidence}%</span></>}
                        </div>
                      );
                    })}
                  </div>
                </Section>
                <Section title="市場結構" color="#58a6ff">
                  <IndRow label="當前結構" value={smc.structure} color={smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
                  <IndRow label="流動性掃單" value={smc.sweep || "無"} color={smc.sweep ? "#f0e68c" : "#4a5568"} />
                  <IndRow label="FVG 失衡" value={smc.fvg ? (smc.fvg.type === "bull" ? "多頭缺口" : "空頭缺口") : "無"} color={smc.fvg ? (smc.fvg.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
                  <IndRow label="訂單塊 OB" value={smc.ob ? (smc.ob.type === "bull" ? "多頭OB" : "空頭OB") : "無"} color={smc.ob ? (smc.ob.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
                </Section>
                <Section title="判斷依據" color="#f0e68c" defaultOpen={false}>
                  {smc.reasons.length ? smc.reasons.map((r, i) => <div key={i} style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.6, padding: "3px 0" }}><span style={{ color: "#4a5568" }}>{i + 1}. </span>{r}</div>) : <div style={{ color: "#4a5568", fontSize: 11 }}>無明確訊號，建議觀望。</div>}
                </Section>
              </> : <div style={{ color: "#4a5568", fontSize: 11, fontFamily: "monospace", padding: "20px 4px", textAlign: "center" }}>正在分析 K 線 SMC 結構...</div>}
            </>}

            {/* AI 多派系 */}
            {sideTab === "ai" && <>
              {multiAILoading && !multiAI && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>5 個 AI 派系分析中...</div>}
              {multiAI && (() => {
                const consensus = multiAI[multiAI.length - 1]; // 最後一個是整合派
                return (
                  <div style={{ background: `${consensus.color}14`, border: `1.5px solid ${consensus.color}`, borderRadius: 12, padding: 14, marginBottom: 12, textAlign: "center" }}>
                    <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>🧠 AI 共識摘要 · {selected?.symbol}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: consensus.color, fontFamily: "monospace" }}>{consensus.emoji} {consensus.direction}</div>
                    <div style={{ color: consensus.color, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>信心度 {consensus.confidence}%</div>
                    <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 6 }}>
                      {(() => {
                        const others = multiAI.slice(0, -1);
                        const longs = others.filter((a) => a.direction.includes("做多")).length;
                        const shorts = others.filter((a) => a.direction.includes("做空")).length;
                        const wait = others.filter((a) => a.direction === "觀望").length;
                        return `${longs} 做多 · ${shorts} 做空 · ${wait} 觀望`;
                      })()}
                    </div>
                  </div>
                );
              })()}
              {multiAI && <Section title="5 個 AI 派系觀點" color="#a78bfa" defaultOpen={true}>
                {multiAI.map((ai, i) => <AICard key={i} ai={ai} defaultOpen={i === multiAI.length - 1} />)}
              </Section>}
              {aiDeep && <Section title="AI 深度分析（含期貨資金面）" color={aiDeep.color} defaultOpen={false} badge={`R/R ${aiDeep.plan.rr}`}>
                <div style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.7, marginBottom: 8 }}>{aiDeep.summary}</div>
                <IndRow label="方向" value={aiDeep.plan.isLong ? "做多" : "做空"} color={aiDeep.plan.isLong ? "#26a69a" : "#ef5350"} />
                <IndRow label="進場參考" value={fmtPr(aiDeep.plan.entry)} />
                <IndRow label="止損" value={fmtPr(aiDeep.plan.stop)} color="#ef5350" />
                <IndRow label="目標 1 (2R)" value={fmtPr(aiDeep.plan.target1)} color="#26a69a" />
                <IndRow label="目標 2 (4R)" value={fmtPr(aiDeep.plan.target2)} color="#26a69a" />
                {aiDeep.extra?.funding && <IndRow label="資金費率" value={`${(aiDeep.extra.funding.funding * 100).toFixed(4)}%`} />}
                {aiDeep.extra?.oiChg != null && <IndRow label="OI 1H 變化" value={`${aiDeep.extra.oiChg > 0 ? "+" : ""}${aiDeep.extra.oiChg.toFixed(2)}%`} color={aiDeep.extra.oiChg > 0 ? "#26a69a" : "#ef5350"} />}
                {aiDeep.extra?.topLS && <IndRow label="大戶多空比" value={aiDeep.extra.topLS.ratio.toFixed(2)} color={aiDeep.extra.topLS.ratio > 1.2 ? "#26a69a" : aiDeep.extra.topLS.ratio < 0.85 ? "#ef5350" : "#c9d1d9"} />}
              </Section>}
              <div style={{ background: "#130a0a", border: "1px solid #2a1010", borderRadius: 8, padding: 10, marginTop: 8 }}>
                <div style={{ color: "#5a2020", fontSize: 9, lineHeight: 1.6 }}>⚠️ 多 AI 分析整合不同演算法派系與期貨資金面，僅供參考。實際交易請結合資金管理與風險控制。</div>
              </div>
            </>}

            {/* 指標 */}
            {/* 開單分頁 — 鎖定點位 + 倉位計算 */}
            {sideTab === "order" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>📋 開單計畫</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>
                    {orderPlan ? `${selected?.symbol} · ${orderPlan.tf} · 計算於 ${new Date(orderPlan.ts).toLocaleTimeString()}` : "等待 SMC 訊號..."}
                  </div>
                </div>
                <button onClick={() => setOrderRefreshKey((k) => k + 1)} style={{ background: "#58a6ff", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>↻ 重算</button>
              </div>

              {!orderPlan && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 12px", textAlign: "center", lineHeight: 1.8 }}>
                目前 SMC 訊號為「觀望」，無明確進場方向。<br />
                試試切換不同<b style={{ color: "#8b949e" }}>時間框架</b>（上方），或挑其他商品。
              </div>}

              {orderPlan && <>
                {/* 主方向卡 */}
                <div style={{ background: `${orderPlan.isLong ? "#26a69a" : "#ef5350"}14`, border: `1.5px solid ${orderPlan.isLong ? "#26a69a" : "#ef5350"}`, borderRadius: 12, padding: 14, marginBottom: 10, textAlign: "center" }}>
                  <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>{orderPlan.signal} · 信心 {orderPlan.confidence}%</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: orderPlan.isLong ? "#26a69a" : "#ef5350", fontFamily: "monospace" }}>{orderPlan.isLong ? "📈 做多" : "📉 做空"}</div>
                  <div style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace", marginTop: 4 }}>R/R = 2.0 · 1.5 ATR 止損 · 3 ATR 目標</div>
                </div>

                {/* 點位區（鎖定，不會跳） */}
                <Section title="進場與出場價" color="#58a6ff" defaultOpen={true} badge="🔒 鎖定">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#0d1520", borderRadius: 6, border: "1px solid #1a2535" }}>
                      <span style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace" }}>進場價</span>
                      <span style={{ color: "#e6edf3", fontSize: 14, fontFamily: "monospace", fontWeight: 700 }}>{fmtPr(orderPlan.entry)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#0d1520", borderRadius: 6, border: "1px solid #ef535044", borderLeft: "3px solid #ef5350" }}>
                      <span style={{ color: "#ef5350", fontSize: 10, fontFamily: "monospace" }}>止損</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#ef5350", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmtPr(orderPlan.stop)}</div>
                        <div style={{ color: "#5a2020", fontSize: 9, fontFamily: "monospace" }}>-{(Math.abs(orderPlan.entry - orderPlan.stop) / orderPlan.entry * 100).toFixed(2)}% 風險</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#0d1520", borderRadius: 6, border: "1px solid #26a69a44", borderLeft: "3px solid #26a69a" }}>
                      <span style={{ color: "#26a69a", fontSize: 10, fontFamily: "monospace" }}>目標 1 (2R)</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#26a69a", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmtPr(orderPlan.target1)}</div>
                        <div style={{ color: "#205040", fontSize: 9, fontFamily: "monospace" }}>+{(Math.abs(orderPlan.target1 - orderPlan.entry) / orderPlan.entry * 100).toFixed(2)}%</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#0d1520", borderRadius: 6, border: "1px solid #26a69a44", borderLeft: "3px solid #26a69a" }}>
                      <span style={{ color: "#26a69a", fontSize: 10, fontFamily: "monospace" }}>目標 2 (4R)</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#26a69a", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmtPr(orderPlan.target2)}</div>
                        <div style={{ color: "#205040", fontSize: 9, fontFamily: "monospace" }}>+{(Math.abs(orderPlan.target2 - orderPlan.entry) / orderPlan.entry * 100).toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>
                </Section>

                {/* 倉位大小計算器 */}
                <Section title="倉位大小計算器" color="#a78bfa" defaultOpen={true}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    <div>
                      <label style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", display: "block", marginBottom: 3 }}>本金 (USDT)</label>
                      <input type="number" value={capital} onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
                        style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 4, color: "#e6edf3", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                    </div>
                    <div>
                      <label style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", display: "block", marginBottom: 3 }}>每筆風險 (% 本金)</label>
                      <input type="number" value={riskPct} onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)} step="0.5"
                        style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 4, color: "#e6edf3", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                    </div>
                    <div>
                      <label style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", display: "block", marginBottom: 3 }}>槓桿倍數</label>
                      <input type="number" value={leverage} onChange={(e) => setLeverage(parseFloat(e.target.value) || 1)} step="1"
                        style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 4, color: "#e6edf3", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                    </div>
                  </div>
                  <div style={{ padding: 10, background: "#0a0f14", borderRadius: 6, border: "1px solid #1a2535" }}>
                    {(() => {
                      const lossAmount = capital * (riskPct / 100);
                      const stopDistPct = Math.abs(orderPlan.entry - orderPlan.stop) / orderPlan.entry * 100;
                      const positionUSDT = stopDistPct > 0 ? lossAmount / (stopDistPct / 100) : 0;
                      const positionCoin = orderPlan.entry > 0 ? positionUSDT / orderPlan.entry : 0;
                      const margin = leverage > 0 ? positionUSDT / leverage : 0;
                      const profit1 = (Math.abs(orderPlan.target1 - orderPlan.entry) / orderPlan.entry) * positionUSDT;
                      const profit2 = (Math.abs(orderPlan.target2 - orderPlan.entry) / orderPlan.entry) * positionUSDT;
                      return <>
                        <IndRow label="可虧金額" value={`${lossAmount.toFixed(2)} USDT`} color="#ef5350" />
                        <IndRow label="止損距離" value={`${stopDistPct.toFixed(2)}%`} />
                        <IndRow label="建議倉位（名目）" value={`${positionUSDT.toFixed(2)} USDT`} color="#58a6ff" />
                        <IndRow label={`${selected?.name || "幣"} 數量`} value={positionCoin.toFixed(positionCoin > 100 ? 2 : positionCoin > 1 ? 4 : 6)} />
                        <IndRow label={`保證金（${leverage}x 槓桿）`} value={`${margin.toFixed(2)} USDT`} color="#f0e68c" />
                        <div style={{ height: 1, background: "#1a2535", margin: "6px 0" }} />
                        <IndRow label="到目標 1 獲利" value={`+${profit1.toFixed(2)} USDT`} color="#26a69a" />
                        <IndRow label="到目標 2 獲利" value={`+${profit2.toFixed(2)} USDT`} color="#26a69a" />
                      </>;
                    })()}
                  </div>
                </Section>

                <div style={{ background: "#130a0a", border: "1px solid #2a1010", borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <div style={{ color: "#5a2020", fontSize: 9, lineHeight: 1.7 }}>
                    ⚠️ <b>價位已鎖定</b>，不會隨即時價跳動。只在以下情況才重算：<br />
                    · 切換商品<br />
                    · 切換時間框架<br />
                    · SMC 訊號方向變化（從觀望→做多/做空，或反轉）<br />
                    · 點「↻ 重算」按鈕<br /><br />
                    實際開單請以交易所頁面為準。本資訊僅供參考。
                  </div>
                </div>
              </>}
            </>}

            {sideTab === "indicators" && indData && <>
              <Section title="RSI (14)" color="#a78bfa">
                <IndRow label="RSI 值" value={indData.rsi?.toFixed(2)} color={indData.rsi > 70 ? "#ef5350" : indData.rsi < 30 ? "#26a69a" : "#c9d1d9"} />
                <IndRow label="區間狀態" value={indData.rsi > 70 ? "超買 ⚠️" : indData.rsi < 30 ? "超賣 🟢" : "中性"} />
                <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "#1a2535", overflow: "hidden" }}><div style={{ width: `${Math.min(100, indData.rsi || 0)}%`, height: "100%", background: indData.rsi > 70 ? "#ef5350" : indData.rsi < 30 ? "#26a69a" : "#a78bfa" }} /></div>
              </Section>
              <Section title="MACD (12,26,9)" color="#2962ff">
                <IndRow label="MACD" value={indData.macd?.toFixed(4)} />
                <IndRow label="Signal" value={indData.signal?.toFixed(4)} />
                <IndRow label="Histogram" value={indData.hist?.toFixed(4)} color={(indData.hist || 0) > 0 ? "#26a69a" : "#ef5350"} />
                <IndRow label="趨勢" value={(indData.hist || 0) > 0 ? "多頭 ↑" : "空頭 ↓"} color={(indData.hist || 0) > 0 ? "#26a69a" : "#ef5350"} />
              </Section>
              <Section title="KDJ (9,3,3)" color="#ffb300">
                <IndRow label="K" value={indData.kdj?.k?.toFixed(2)} color="#ffb300" />
                <IndRow label="D" value={indData.kdj?.d?.toFixed(2)} color="#2962ff" />
                <IndRow label="J" value={indData.kdj?.j?.toFixed(2)} color="#e040fb" />
                <IndRow label="信號" value={(indData.kdj?.k || 0) > (indData.kdj?.d || 0) ? "金叉 🟢" : "死叉 🔴"} color={(indData.kdj?.k || 0) > (indData.kdj?.d || 0) ? "#26a69a" : "#ef5350"} />
              </Section>
              <Section title="移動平均線 MA" color="#f0e68c">
                {[[5, "#f0e68c"], [10, "#87ceeb"], [20, "#ff8c69"], [60, "#da70d6"]].map(([p, col]) => <IndRow key={p} label={`MA${p}`} value={indData[`ma${p}`]?.toFixed(p <= 10 ? 4 : 2)} color={col} />)}
                <IndRow label="多空排列" value={(indData.ma5 || 0) > (indData.ma20 || 0) ? "多頭 ↑" : "空頭 ↓"} color={(indData.ma5 || 0) > (indData.ma20 || 0) ? "#26a69a" : "#ef5350"} />
              </Section>
            </>}

            {/* 推薦 */}
            {sideTab === "recs" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空推薦掃描</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>掃前 200 大幣 · SMC 評分</div>
                </div>
                <button onClick={() => setRecsTs(0)} disabled={recsLoading} style={{ background: recsLoading ? "#1a2535" : "#58a6ff", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: recsLoading ? 0.5 : 1 }}>{recsLoading ? "掃描中..." : "↻ 刷新"}</button>
              </div>
              {recsLoading && !recs && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>正在掃描 200 大幣，約 10-15 秒...</div>}
              {recs && <>
                <Section title={`🟢 適合做多 (${recs.longs.length})`} color="#26a69a">
                  {recs.longs.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無明確做多訊號</div>}
                  {recs.longs.map((r) => (
                    <button key={r.symbol} onClick={() => { const c = coins.find((x) => x.symbol === r.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: "7px 8px", marginBottom: 4, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 60 }}>{r.name}</span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${r.confidence}%`, height: "100%", background: "#26a69a" }} /></div>
                        <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2 }}>{r.structure.split(" ")[0]}</div>
                      </div>
                      <span style={{ color: "#26a69a", fontSize: 10, fontFamily: "monospace", fontWeight: 700, minWidth: 50, textAlign: "right" }}>{r.signal}</span>
                      <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>{r.confidence}%</span>
                    </button>
                  ))}
                </Section>
                <Section title={`🔴 適合做空 (${recs.shorts.length})`} color="#ef5350">
                  {recs.shorts.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無明確做空訊號</div>}
                  {recs.shorts.map((r) => (
                    <button key={r.symbol} onClick={() => { const c = coins.find((x) => x.symbol === r.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: "7px 8px", marginBottom: 4, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 60 }}>{r.name}</span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${r.confidence}%`, height: "100%", background: "#ef5350" }} /></div>
                        <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2 }}>{r.structure.split(" ")[0]}</div>
                      </div>
                      <span style={{ color: "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 700, minWidth: 50, textAlign: "right" }}>{r.signal}</span>
                      <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>{r.confidence}%</span>
                    </button>
                  ))}
                </Section>
                <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", textAlign: "center", padding: "4px" }}>已掃 {recs.scanned} / {recs.total} 幣 · {new Date(recsTs).toLocaleTimeString()}</div>
              </>}
            </>}

            {/* 警報 */}
            {sideTab === "alerts" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>持倉異常警報</div>
                <div style={{ color: "#4a5568", fontSize: 9 }}>每 3 分鐘掃前 200 大幣 OI 變化</div>
              </div>
              <Section title={`警報事件 (${alerts.length})`} color="#f0b90b" badge="即時">
                {alerts.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "16px 4px", textAlign: "center" }}>目前無異常，每 3 分鐘自動掃描...</div>}
                {alerts.map((al, i) => (
                  <button key={`${al.symbol}-${al.ts}-${i}`} onClick={() => { const c = coins.find((x) => x.symbol === al.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${al.color}44`, borderLeft: `3px solid ${al.color}`, borderRadius: 6, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{al.name}</span>
                        <span style={{ color: al.color, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{al.type}</span>
                      </div>
                      <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 2 }}>
                        OI {al.oiChgPct > 0 ? "+" : ""}{al.oiChgPct.toFixed(2)}% · 24h 價 {al.change > 0 ? "+" : ""}{al.change.toFixed(2)}% · {new Date(al.ts).toLocaleTimeString()}
                      </div>
                    </div>
                  </button>
                ))}
              </Section>
              <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px" }}>
                <p style={{ color: "#787b86", marginBottom: 4 }}>判讀說明：</p>
                <p>· <span style={{ color: "#26a69a" }}>多頭觸發</span>：OI 暴增 + 價漲</p>
                <p>· <span style={{ color: "#ef5350" }}>空頭觸發</span>：OI 暴增 + 價跌</p>
                <p>· <span style={{ color: "#ef5350" }}>誘空</span>：OI 增 + 價跌</p>
                <p>· <span style={{ color: "#f0b90b" }}>疑似反轉</span>：OI 減 + 價升</p>
              </div>
            </>}

            {/* 回測 */}
            {sideTab === "backtest" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>SMC 策略回測</div>
                    <div style={{ color: "#4a5568", fontSize: 9 }}>{selected?.symbol}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setBtMode("mtf")} style={{ background: btMode === "mtf" ? "#0f1e2e" : "transparent", border: `1px solid ${btMode === "mtf" ? "#58a6ff" : "#1a2535"}`, borderRadius: 4, color: btMode === "mtf" ? "#58a6ff" : "#8b949e", padding: "3px 8px", fontSize: 10, fontFamily: "monospace" }}>高勝率版</button>
                    <button onClick={() => setBtMode("simple")} style={{ background: btMode === "simple" ? "#0f1e2e" : "transparent", border: `1px solid ${btMode === "simple" ? "#58a6ff" : "#1a2535"}`, borderRadius: 4, color: btMode === "simple" ? "#58a6ff" : "#8b949e", padding: "3px 8px", fontSize: 10, fontFamily: "monospace" }}>基本版</button>
                  </div>
                </div>
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6 }}>
                  {btMode === "mtf" ? "策略：1D 趨勢 + 4H ADX>20 + 4H 方向一致 + 1H SMC ≥50% + 量能確認" : "策略：1H SMC ≥30% 訊號 → ATR 止損/止盈"}
                </div>
              </div>
              {btLoading && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>{btMode === "mtf" ? "高勝率回測中，需要載入 1D+4H+1H 三套 K 線，約 10-15 秒..." : "回測中..."}</div>}
              {!btLoading && btResult === null && btMode === "mtf" && <div style={{ color: "#5a4020", fontSize: 10, lineHeight: 1.6, padding: "10px", background: "#1a1206", borderRadius: 6 }}>⚠️ K 線資料不足，無法進行多時區回測（需要至少 50 根 1D + 4H K 線）</div>}
              {!btLoading && btResult && btResult.stats.total === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>歷史資料中沒有達到所有條件的進場訊號（這是嚴格策略的正常現象）</div>}
              {!btLoading && btResult && btResult.stats.total > 0 && <>
                <div style={{ background: `${btResult.stats.totalPnl >= 0 ? "#26a69a" : "#ef5350"}14`, border: `1px solid ${btResult.stats.totalPnl >= 0 ? "#26a69a" : "#ef5350"}`, borderRadius: 10, padding: 14, marginBottom: 10, textAlign: "center" }}>
                  <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>總損益（累積 %）</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: btResult.stats.totalPnl >= 0 ? "#26a69a" : "#ef5350", fontFamily: "monospace" }}>{btResult.stats.totalPnl >= 0 ? "+" : ""}{btResult.stats.totalPnl.toFixed(2)}%</div>
                  <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>{btResult.stats.total} 筆交易 · 勝率 {btResult.stats.winRate.toFixed(1)}%</div>
                </div>
                <Section title="績效摘要" color="#58a6ff">
                  <IndRow label="總交易數" value={btResult.stats.total} />
                  <IndRow label="勝場 / 敗場" value={`${btResult.stats.wins} / ${btResult.stats.losses}`} />
                  <IndRow label="勝率" value={`${btResult.stats.winRate.toFixed(1)}%`} color={btResult.stats.winRate >= 50 ? "#26a69a" : "#ef5350"} />
                  <IndRow label="平均獲利" value={`+${btResult.stats.avgWin.toFixed(2)}%`} color="#26a69a" />
                  <IndRow label="平均虧損" value={`${btResult.stats.avgLoss.toFixed(2)}%`} color="#ef5350" />
                  <IndRow label="獲利因子 PF" value={btResult.stats.profitFactor.toFixed(2)} color={btResult.stats.profitFactor >= 1.5 ? "#26a69a" : btResult.stats.profitFactor >= 1 ? "#f0e68c" : "#ef5350"} />
                  <IndRow label="最大回撤" value={`${btResult.stats.maxDD.toFixed(2)}%`} color="#ef5350" />
                </Section>
                <Section title="累積績效曲線" color="#a78bfa">
                  {(() => {
                    const eq = btResult.equity;
                    if (eq.length < 2) return <div style={{ color: "#4a5568", fontSize: 10 }}>資料不足（需 2 筆以上交易）</div>;
                    const W = 260, H = 80, PAD = 4;
                    const cums = eq.map((e) => e.cum);
                    const mn = Math.min(0, ...cums), mx = Math.max(0, ...cums);
                    const range = mx - mn || 1;
                    const points = eq.map((e, i) => {
                      const x = PAD + (i / (eq.length - 1)) * (W - PAD * 2);
                      const y = H - PAD - ((e.cum - mn) / range) * (H - PAD * 2);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(" ");
                    const zeroY = H - PAD - ((0 - mn) / range) * (H - PAD * 2);
                    return (
                      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
                        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#1a2535" strokeWidth="0.5" strokeDasharray="2,2" />
                        <polyline points={points} fill="none" stroke={btResult.stats.totalPnl >= 0 ? "#26a69a" : "#ef5350"} strokeWidth="1.5" />
                        <text x={PAD + 2} y={10} fill="#4a5568" fontSize="8" fontFamily="monospace">{mx.toFixed(1)}%</text>
                        <text x={PAD + 2} y={H - 2} fill="#4a5568" fontSize="8" fontFamily="monospace">{mn.toFixed(1)}%</text>
                      </svg>
                    );
                  })()}
                </Section>
                <Section title={`最近 ${Math.min(10, btResult.trades.length)} 筆交易`} color="#f0e68c" defaultOpen={false}>
                  {btResult.trades.slice(-10).reverse().map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid #111824", fontSize: 9, fontFamily: "monospace" }}>
                      <span style={{ color: t.isLong ? "#26a69a" : "#ef5350", fontWeight: 700, minWidth: 28 }}>{t.isLong ? "多" : "空"}</span>
                      <span style={{ color: "#4a5568", flex: 1 }}>{new Date(t.entryTime).toLocaleDateString()}</span>
                      <span style={{ color: t.pnl > 0 ? "#26a69a" : "#ef5350", fontWeight: 700, minWidth: 52, textAlign: "right" }}>{t.pnl > 0 ? "+" : ""}{t.pnl.toFixed(2)}%</span>
                      <span style={{ color: "#4a5568", minWidth: 56, textAlign: "right" }}>{t.exitReason}</span>
                    </div>
                  ))}
                </Section>
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px" }}>
                  <p style={{ color: "#787b86", marginBottom: 4 }}>{btMode === "mtf" ? "高勝率策略：" : "基本策略："}</p>
                  {btMode === "mtf" ? <>
                    <p>· 1D 結構確認趨勢方向</p>
                    <p>· 4H ADX > 20 確認趨勢有力</p>
                    <p>· 4H 方向必須跟 1D 一致</p>
                    <p>· 1H SMC 訊號信心 ≥ 50%</p>
                    <p>· 量能 ≥ 20日均量 0.7 倍</p>
                    <p>· 止損 1.5×ATR / 目標 3×ATR (R/R = 2.0)</p>
                    <p>· 1D 結構翻轉自動平倉</p>
                  </> : <>
                    <p>· 進場：SMC 訊號（信心 ≥ 30%）</p>
                    <p>· 止損 1.5×ATR / 目標 2×ATR (R/R = 1.33)</p>
                  </>}
                  <p style={{ marginTop: 4, color: "#5a4020" }}>· 過去績效不保證未來表現</p>
                </div>
              </>}
            </>}

            {/* 金十 */}
            {sideTab === "jin10" && <Section title="金十快訊" color="#f0b90b" badge="Jin10 即時">
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
            </Section>}

            {/* 說明 */}
            {sideTab === "news" && <div style={{ color: "#8b949e", fontSize: 12, lineHeight: 1.8, padding: 4 }}>
              <p style={{ color: "#e6edf3", fontWeight: 700, marginBottom: 8 }}>📡 資料來源</p>
              <p>加密貨幣：Binance + OKX + CoinGecko 合併（幾百個幣）</p>
              <p>期貨資料：Binance Futures（資金費率/OI/多空比/Taker CVD）</p>
              <p>K 線：Binance WebSocket 即時</p>
              <p>財經訊息：金十數據</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>🤖 5 個 AI 派系</p>
              <p>🏃 趨勢跟隨 | 🔁 均值回歸 | 🏛️ SMC 機構 | 💰 期貨情緒 | 🧠 整合共識</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>📊 高勝率回測</p>
              <p>多時區共振策略 — 1D 趨勢 + 4H 確認 + 1H 進場 + 量能過濾。交易少但勝率高。</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>⚡ 推薦與警報</p>
              <p>每 5 分鐘掃 200 大幣推薦清單；每 3 分鐘掃 OI 異常警報。</p>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}

