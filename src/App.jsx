import { useState, useEffect, useMemo } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti,
  calcSMA, calcMACD, calcRSI, calcKDJ,
  loadJin10Flash, subscribeCryptoTicker, loadPeriodChanges,
  scanRecommendations, scanAnomalies, analyzeMultiAI,
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
  const [notif, setNotif] = useState(null);
  const [notifOn, setNotifOn] = useState(false);
  const [status, setStatus] = useState("載入中...");
  const [j10flash, setJ10flash] = useState(undefined);
  const [periodChg, setPeriodChg] = useState(null);
  const [recs, setRecs] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsTs, setRecsTs] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [listLimit, setListLimit] = useState(50);
  const [multiAI, setMultiAI] = useState(null);
  const [multiAILoading, setMultiAILoading] = useState(false);

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
            {[["smc", "SMC"], ["ai", "AI 分析"], ["indicators", "指標"], ["recs", "推薦"], ["alerts", "警報"], ["jin10", "金十"], ["news", "說明"]].map(([id, label]) => (
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



            {sideTab === "ai" && <>
              {multiAILoading && !multiAI && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>5 個 AI 派系分析中...</div>}
              {multiAI && multiAI.length > 0 && (() => {
                const consensus = multiAI[multiAI.length - 1];
                return (
                  <div style={{ background: `${consensus.color}14`, border: `1.5px solid ${consensus.color}`, borderRadius: 10, padding: 12, marginBottom: 10, textAlign: "center" }}>
                    <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>🧠 AI 共識 · {selected?.symbol}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: consensus.color, fontFamily: "monospace" }}>{consensus.direction}</div>
                    <div style={{ color: consensus.color, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>共識信心 {consensus.confidence}%</div>
                  </div>
                );
              })()}
              {multiAI && multiAI.length > 0 && <Section title="🤖 5 個 AI 派系觀點" color="#a78bfa" defaultOpen={true}>
                <div style={{ color: "#4a5568", fontSize: 9, padding: "0 0 8px", lineHeight: 1.5 }}>點任一派系展開查看完整理由</div>
                {multiAI.slice(0, -1).map((ai, i) => <AICard key={i} ai={ai} defaultOpen={false} />)}
              </Section>}
              {multiAI && multiAI.length > 0 && <Section title="🧠 整合共識詳情" color={multiAI[multiAI.length - 1].color} defaultOpen={true}>
                <AICard ai={multiAI[multiAI.length - 1]} defaultOpen={true} />
              </Section>}
              <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.5, padding: "8px 4px" }}>
                <p style={{ color: "#787b86", marginBottom: 4 }}>5 個 AI 派系：</p>
                <p>· 🏃 <span style={{ color: "#26a69a" }}>趨勢跟隨</span>：MA 排列 + 多時區趨勢</p>
                <p>· 🔁 <span style={{ color: "#f0b90b" }}>均值回歸</span>：RSI 極值 + KDJ 反轉</p>
                <p>· 🏛️ <span style={{ color: "#58a6ff" }}>SMC 機構</span>：結構轉折 + FVG/OB/掃單</p>
                <p>· 💰 <span style={{ color: "#a78bfa" }}>期貨情緒</span>：資金費率 + OI + 多空比</p>
                <p>· 🧠 <span style={{ color: "#e040fb" }}>整合共識</span>：加權合併四派系結論</p>
              </div>
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

