import { useState, useEffect, useMemo, useRef } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti,
  calcSMA, calcMACD, calcRSI, calcKDJ,
  loadJin10Flash, subscribeCryptoTicker, loadPeriodChanges,
  scanRecommendations, scanAnomalies, analyzeMultiAI, scanExplosive, scanAutoTrades,
} from "./data.js";

const INTERVALS = ["15m", "1H", "4H", "1D"];

// 數字滾動動畫：value 變動時平滑過渡到新值
function CountUp({ value, decimals = 0, duration = 600, prefix = "", suffix = "", style, className }) {
  const [display, setDisplay] = useState(value || 0);
  useEffect(() => {
    const start = performance.now();
    const from = display;
    const to = Number(value) || 0;
    if (from === to) return;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className} style={style}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}


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
    <div className="glass" style={{ borderRadius: 12, overflow: "hidden", marginBottom: 11 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "transparent", border: "none", borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
          <span style={{ color: "#c9d1d9", fontSize: 10, fontFamily: "'Sora',sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>{title}</span>
          {badge && <span className="mono" style={{ background: color + "22", color, fontSize: 9, padding: "1px 6px", borderRadius: 4 }}>{badge}</span>}
        </div>
        <span style={{ color: "#5a6b80", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
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

// ═══════════ 評分卡（綜合多空評分） ═══════════════════════════════════════
function ScoreBadge({ label, value, color, pos }) {
  return (
    <div style={{ padding: "8px 10px", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace" }}>{label}</span>
        <span style={{ background: `${color}22`, color, fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 8px", borderRadius: 5, border: `1px solid ${color}55` }}>{value}</span>
      </div>
      {pos != null && (
        <div style={{ position: "relative", height: 4, borderRadius: 2, background: "linear-gradient(90deg,#ef5350,#5a6b80,#26a69a)", marginTop: 6, opacity: 0.5 }}>
          <div style={{ position: "absolute", top: -2, left: `calc(${Math.max(0, Math.min(100, pos))}% - 4px)`, width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
        </div>
      )}
    </div>
  );
}

function ScoreCard({ symbol, smc, multiAI, hideHeader = false }) {
  if (!smc) return <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>分析中...</div>;

  const futuresAI = multiAI && multiAI.length > 0 ? multiAI[3] : null; // 期貨情緒派

  // 市場動能：來自 SMC 結構
  const momentumLabel = smc.structure.includes("上升") ? "買方主導" : smc.structure.includes("下降") ? "賣方主導" : "盤整";
  const momentumColor = smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#f0b90b";

  // 資金費率（從期貨情緒派理由中找）
  let fundingLabel = "中性", fundingColor = "#f0b90b", fundingDesc = "暫無資料";
  if (futuresAI) {
    const fr = futuresAI.reasons.find(r => r.includes("資金費率"));
    if (fr) {
      fundingDesc = fr;
      if (fr.includes("多頭擁擠")) { fundingLabel = "偏空"; fundingColor = "#ef5350"; }
      else if (fr.includes("空頭擁擠")) { fundingLabel = "偏多"; fundingColor = "#26a69a"; }
    }
  }

  // 散戶情緒
  let sentimentLabel = "中性", sentimentColor = "#f0b90b", sentimentDesc = "暫無資料";
  if (futuresAI) {
    const sr = futuresAI.reasons.find(r => r.includes("散戶") || r.includes("大戶"));
    if (sr) {
      sentimentDesc = sr;
      if (sr.includes("反指標利多") || sr.includes("大戶看多")) { sentimentLabel = "偏多"; sentimentColor = "#26a69a"; }
      else if (sr.includes("反指標利空") || sr.includes("大戶看空")) { sentimentLabel = "偏空"; sentimentColor = "#ef5350"; }
    }
  }

  // 相對強弱（vs BTC）
  let rsLabel = "同步", rsColor = "#f0b90b", rsDesc = "暫無資料";
  const rsReason = (smc.reasons || []).find(r => r.includes("vs BTC") || r.includes("強勢") || r.includes("弱勢"));
  if (rsReason) {
    rsDesc = rsReason;
    if (rsReason.includes("強勢")) { rsLabel = "強於BTC"; rsColor = "#26a69a"; }
    else if (rsReason.includes("弱勢")) { rsLabel = "弱於BTC"; rsColor = "#ef5350"; }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      {!hideHeader && (
        <div style={{ background: `${smc.color}14`, border: `1.5px solid ${smc.color}`, borderRadius: 10, padding: 12, marginBottom: 10, textAlign: "center" }}>
          <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>📊 綜合評分卡 · {symbol}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: smc.color, fontFamily: "monospace" }}>{smc.signal}</div>
          <div style={{ color: smc.color, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>信心度 {smc.confidence}%</div>
        </div>
      )}

      <Section title="做多/做空依據" color={smc.color} defaultOpen={true}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <ScoreBadge label="市場動能" value={momentumLabel} color={momentumColor} pos={momentumLabel === "買方主導" ? 80 : momentumLabel === "賣方主導" ? 20 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{smc.structure}</div>
          </div>
          <div>
            <ScoreBadge label="資金費率" value={fundingLabel} color={fundingColor} pos={fundingLabel === "偏多" ? 75 : fundingLabel === "偏空" ? 25 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{fundingDesc}</div>
          </div>
          <div>
            <ScoreBadge label="散戶/大戶情緒" value={sentimentLabel} color={sentimentColor} pos={sentimentLabel === "偏多" ? 75 : sentimentLabel === "偏空" ? 25 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{sentimentDesc}</div>
          </div>
          <div>
            <ScoreBadge label="相對強弱" value={rsLabel} color={rsColor} pos={rsLabel === "強於BTC" ? 80 : rsLabel === "弱於BTC" ? 20 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{rsDesc}</div>
          </div>
          {smc.snr && (smc.snr.support || smc.snr.resistance) && (
            <div>
              <ScoreBadge label="關鍵價位 SNR" value={
                smc.snr.support && smc.snr.support.dist < 1 ? "近支撐"
                : smc.snr.resistance && smc.snr.resistance.dist < 1 ? "近壓力"
                : "區間中"
              } color={
                smc.snr.support && smc.snr.support.dist < 1 ? "#26a69a"
                : smc.snr.resistance && smc.snr.resistance.dist < 1 ? "#ef5350"
                : "#f0b90b"
              } pos={
                smc.snr.support && smc.snr.support.dist < 1 ? 80
                : smc.snr.resistance && smc.snr.resistance.dist < 1 ? 20
                : 50
              } />
              <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>
                {smc.snr.resistance ? `壓力 ${smc.snr.resistance.price.toFixed(smc.snr.resistance.price > 1 ? 4 : 6)} (+${smc.snr.resistance.dist.toFixed(2)}%)` : "—"}
                {" · "}
                {smc.snr.support ? `支撐 ${smc.snr.support.price.toFixed(smc.snr.support.price > 1 ? 4 : 6)} (-${smc.snr.support.dist.toFixed(2)}%)` : "—"}
              </div>
            </div>
          )}
        </div>
      </Section>

    </div>
  );
}

// ═══════════ 交易紀錄卡 ═══════════════════════════════════════════════════
const TRADES_KEY = "cryptex_trades_v1";

function loadTrades() {
  try {
    const raw = localStorage.getItem(TRADES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveTrades(trades) {
  try { localStorage.setItem(TRADES_KEY, JSON.stringify(trades)); } catch {}
}

function TradeForm({ onAdd, onCancel, defaultSymbol }) {
  const [symbol, setSymbol] = useState(defaultSymbol || "");
  const [direction, setDirection] = useState("long");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [tp3, setTp3] = useState("");

  const inputStyle = { width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, color: "#c9d1d9", padding: "7px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" };
  const labelStyle = { color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginBottom: 3, display: "block" };

  function submit() {
    const e = parseFloat(entry), s = parseFloat(sl);
    if (!symbol || !e || !s) return;
    const trade = {
      id: Date.now(),
      symbol: symbol.toUpperCase(),
      direction,
      entry: e,
      sl: s,
      tp1: parseFloat(tp1) || null,
      tp2: parseFloat(tp2) || null,
      tp3: parseFloat(tp3) || null,
      ts: Date.now(),
      status: "open",
    };
    onAdd(trade);
  }

  return (
    <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>幣種</label>
          <input style={inputStyle} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="例: BTC-USDT" />
        </div>
        <div style={{ width: 90 }}>
          <label style={labelStyle}>方向</label>
          <select style={inputStyle} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="long">做多</option>
            <option value="short">做空</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>進場價</label>
          <input style={inputStyle} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>SL 止損</label>
          <input style={inputStyle} value={sl} onChange={(e) => setSl(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>TP1</label>
          <input style={inputStyle} value={tp1} onChange={(e) => setTp1(e.target.value)} placeholder="選填" inputMode="decimal" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>TP2</label>
          <input style={inputStyle} value={tp2} onChange={(e) => setTp2(e.target.value)} placeholder="選填" inputMode="decimal" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>TP3</label>
          <input style={inputStyle} value={tp3} onChange={(e) => setTp3(e.target.value)} placeholder="選填" inputMode="decimal" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={{ flex: 1, background: "#26a69a", border: "none", borderRadius: 6, color: "#fff", padding: "8px 0", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>新增紀錄</button>
        <button onClick={onCancel} style={{ flex: 1, background: "#1a2535", border: "none", borderRadius: 6, color: "#8b949e", padding: "8px 0", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>取消</button>
      </div>
    </div>
  );
}

function TradeCard({ trade, livePrice, onDelete, onClose }) {
  const isLong = trade.direction === "long";
  const dirColor = isLong ? "#26a69a" : "#ef5350";
  const dirLabel = isLong ? "做多" : "做空";

  let pnlPct = null;
  if (livePrice && trade.entry) {
    pnlPct = isLong ? ((livePrice - trade.entry) / trade.entry) * 100 : ((trade.entry - livePrice) / trade.entry) * 100;
  }

  // 判斷 TP 達成狀態
  function tpHit(tp) {
    if (!tp || !livePrice) return false;
    return isLong ? livePrice >= tp : livePrice <= tp;
  }
  function slHit() {
    if (!livePrice) return false;
    return isLong ? livePrice <= trade.sl : livePrice >= trade.sl;
  }

  const fmt = (v) => v == null ? "—" : (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));

  const tps = [
    ["TP1", trade.tp1],
    ["TP2", trade.tp2],
    ["TP3", trade.tp3],
  ].filter(([, v]) => v != null);

  let statusBadge = null;
  if (trade.status === "closed") statusBadge = { label: "已平倉", color: "#5a6b80" };
  else if (slHit()) statusBadge = { label: "觸及SL", color: "#ef5350" };
  else {
    const hitTps = tps.filter(([, v]) => tpHit(v));
    if (hitTps.length > 0) statusBadge = { label: `${hitTps[hitTps.length - 1][0]} 達成`, color: "#26a69a" };
  }

  return (
    <div className="card-hover" style={{ background: "#0d1520", border: `1px solid ${dirColor}33`, borderLeft: `3px solid ${dirColor}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{trade.symbol}</span>
        <span style={{ color: dirColor, fontSize: 10, fontFamily: "monospace", fontWeight: 700, background: `${dirColor}1a`, padding: "1px 6px", borderRadius: 4 }}>{dirLabel}</span>
        {statusBadge && <span style={{ color: statusBadge.color, fontSize: 9, fontFamily: "monospace", fontWeight: 700, border: `1px solid ${statusBadge.color}`, padding: "1px 6px", borderRadius: 4 }}>{statusBadge.label}</span>}
        <span style={{ marginLeft: "auto", color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{new Date(trade.ts).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {pnlPct != null && (
        <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 6, background: pnlPct >= 0 ? "#26a69a14" : "#ef535014", borderRadius: 6 }}>
          <span className="mono" style={{ color: pnlPct >= 0 ? "#26a69a" : "#ef5350", fontSize: 16, fontWeight: 800 }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
          <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginLeft: 6 }}>未實現盈虧 · 現價 {fmt(livePrice)}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
        <div style={{ background: "#0a1218", borderRadius: 5, padding: "5px 8px" }}>
          <div style={{ color: "#5a6b80", fontSize: 9 }}>進場價</div>
          <div style={{ color: "#c9d1d9", fontWeight: 700 }}>{fmt(trade.entry)}</div>
        </div>
        <div style={{ background: slHit() ? "#ef535022" : "#0a1218", borderRadius: 5, padding: "5px 8px", border: slHit() ? "1px solid #ef5350" : "none" }}>
          <div style={{ color: "#ef5350", fontSize: 9 }}>SL</div>
          <div style={{ color: "#ef5350", fontWeight: 700 }}>{fmt(trade.sl)}</div>
        </div>
        {tps.map(([label, val]) => (
          <div key={label} style={{ background: tpHit(val) ? "#26a69a22" : "#0a1218", borderRadius: 5, padding: "5px 8px", border: tpHit(val) ? "1px solid #26a69a" : "none" }}>
            <div style={{ color: "#26a69a", fontSize: 9 }}>{label} {tpHit(val) ? "✓" : ""}</div>
            <div style={{ color: "#26a69a", fontWeight: 700 }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {trade.status !== "closed" && (
          <button onClick={() => onClose(trade.id)} style={{ flex: 1, background: "#1a2535", border: "none", borderRadius: 5, color: "#8b949e", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>標記平倉</button>
        )}
        <button onClick={() => onDelete(trade.id)} style={{ flex: 1, background: "#1a2535", border: "none", borderRadius: 5, color: "#ef5350", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>刪除</button>
      </div>
    </div>
  );
}

// ═══════════ 自動推薦單（系統自動掃描+建單+監控） ═══════════════════════════
const AUTO_TRADES_KEY = "cryptex_auto_trades_v1";
const AUTO_TRADES_TS_KEY = "cryptex_auto_trades_ts_v1";

function loadAutoTrades() {
  try {
    const raw = localStorage.getItem(AUTO_TRADES_KEY);
    return raw ? JSON.parse(raw) : { longs: [], shorts: [] };
  } catch { return { longs: [], shorts: [] }; }
}
function saveAutoTrades(data) {
  try { localStorage.setItem(AUTO_TRADES_KEY, JSON.stringify(data)); } catch {}
}
function loadAutoTradesTs() {
  try { return parseInt(localStorage.getItem(AUTO_TRADES_TS_KEY) || "0", 10); } catch { return 0; }
}
function saveAutoTradesTs(ts) {
  try { localStorage.setItem(AUTO_TRADES_TS_KEY, String(ts)); } catch {}
}

function AutoTradeCard({ trade, livePrice, onRemove }) {
  const isLong = trade.direction === "long";
  const dirColor = isLong ? "#26a69a" : "#ef5350";
  const dirLabel = isLong ? "做多" : "做空";
  const fmt = (v) => v == null ? "—" : (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));

  let pnlPct = null;
  if (livePrice && trade.entry) {
    pnlPct = isLong ? ((livePrice - trade.entry) / trade.entry) * 100 : ((trade.entry - livePrice) / trade.entry) * 100;
  }

  function tpHit(tp) {
    if (!tp || !livePrice) return false;
    return isLong ? livePrice >= tp : livePrice <= tp;
  }
  function slHit() {
    if (!livePrice) return false;
    return isLong ? livePrice <= trade.sl : livePrice >= trade.sl;
  }

  const tps = [["TP1", trade.tp1], ["TP2", trade.tp2], ["TP3", trade.tp3]].filter(([, v]) => v != null);
  const hitTps = tps.filter(([, v]) => tpHit(v));
  const finished = slHit() || hitTps.length === tps.length;

  let statusBadge = null;
  if (slHit()) statusBadge = { label: "止損 SL", color: "#ef5350" };
  else if (hitTps.length > 0) statusBadge = { label: `${hitTps[hitTps.length - 1][0]} 達成`, color: "#26a69a" };

  return (
    <div className="card-hover" style={{ background: "#0d1520", border: `1px solid ${dirColor}33`, borderLeft: `3px solid ${dirColor}`, borderRadius: 8, padding: 10, marginBottom: 8, boxShadow: finished ? "none" : `inset 3px 0 10px -5px ${dirColor}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{trade.name || trade.symbol}</span>
        <span style={{ color: dirColor, fontSize: 10, fontFamily: "monospace", fontWeight: 700, background: `${dirColor}1a`, padding: "1px 6px", borderRadius: 4 }}>{dirLabel}</span>
        <span style={{ background: "#1a2535", color: "#a78bfa", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 4 }}>評分 {trade.finalScore}</span>
        {statusBadge && <span style={{ color: statusBadge.color, fontSize: 9, fontFamily: "monospace", fontWeight: 700, border: `1px solid ${statusBadge.color}`, padding: "1px 6px", borderRadius: 4 }}>{statusBadge.label}</span>}
        <span style={{ marginLeft: "auto", color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{new Date(trade.ts).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {pnlPct != null && (
        <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 6, background: pnlPct >= 0 ? "#26a69a14" : "#ef535014", borderRadius: 6 }}>
          <span className="mono" style={{ color: pnlPct >= 0 ? "#26a69a" : "#ef5350", fontSize: 16, fontWeight: 800 }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
          <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginLeft: 6 }}>未實現盈虧 · 現價 {fmt(livePrice)}</span>
        </div>
      )}

      {livePrice != null && (() => {
        const lastTp = tps.length ? tps[tps.length - 1][1] : (isLong ? trade.entry + (trade.entry - trade.sl) * 2 : trade.entry - (trade.sl - trade.entry) * 2);
        const lo = isLong ? trade.sl : lastTp;
        const hi = isLong ? lastTp : trade.sl;
        const range = hi - lo || 1;
        const clampPct = (v) => Math.max(0, Math.min(100, ((v - lo) / range) * 100));
        const livePct = clampPct(livePrice);
        return (
          <div style={{ position: "relative", height: 6, borderRadius: 3, background: "linear-gradient(90deg,#ef5350,#1a2535,#26a69a)", marginBottom: 8, marginTop: 2 }}>
            <div style={{ position: "absolute", top: -3, left: `calc(${clampPct(trade.entry)}% - 1px)`, width: 2, height: 12, background: "#5a6b80" }} />
            {tps.map(([label, val]) => (
              <div key={label} style={{ position: "absolute", top: -3, left: `calc(${clampPct(val)}% - 1px)`, width: 2, height: 12, background: "#26a69a99" }} />
            ))}
            <div style={{ position: "absolute", top: -4, left: `calc(${livePct}% - 5px)`, width: 10, height: 10, borderRadius: "50%", background: dirColor, border: "2px solid #0d1520", boxShadow: `0 0 8px ${dirColor}` }} />
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
        <div style={{ background: "#0a1218", borderRadius: 5, padding: "5px 8px" }}>
          <div style={{ color: "#5a6b80", fontSize: 9 }}>進場價</div>
          <div style={{ color: "#c9d1d9", fontWeight: 700 }}>{fmt(trade.entry)}</div>
        </div>
        <div style={{ background: slHit() ? "#ef535022" : "#0a1218", borderRadius: 5, padding: "5px 8px", border: slHit() ? "1px solid #ef5350" : "none" }}>
          <div style={{ color: "#ef5350", fontSize: 9 }}>SL</div>
          <div style={{ color: "#ef5350", fontWeight: 700 }}>{fmt(trade.sl)}</div>
        </div>
        {tps.map(([label, val]) => (
          <div key={label} style={{ background: tpHit(val) ? "#26a69a22" : "#0a1218", borderRadius: 5, padding: "5px 8px", border: tpHit(val) ? "1px solid #26a69a" : "none" }}>
            <div style={{ color: "#26a69a", fontSize: 9 }}>{label} {tpHit(val) ? "✓" : ""}</div>
            <div style={{ color: "#26a69a", fontWeight: 700 }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginTop: 6 }}>{trade.signal} · {trade.structure}</div>

      {trade.aiConsensus && (
        <div style={{ color: trade.aiConsensus.color, fontSize: 9, fontFamily: "monospace", marginTop: 2 }}>
          🧠 AI共識: {trade.aiConsensus.direction} {trade.aiConsensus.confidence}%
        </div>
      )}

      {finished && (
        <button onClick={() => onRemove(trade.id)} style={{ width: "100%", marginTop: 8, background: "#1a2535", border: "none", borderRadius: 5, color: "#8b949e", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>
          {slHit() ? "已觸及止損，移除" : "已達最終止盈，移除"}
        </button>
      )}
    </div>
  );
}

function AutoTrades({ coins }) {
  const [data, setData] = useState(() => {
    const d = loadAutoTrades();
    // 補上 id（相容舊資料）
    d.longs = (d.longs || []).map(t => ({ ...t, id: t.id || `${t.symbol}-${t.ts}` }));
    d.shorts = (d.shorts || []).map(t => ({ ...t, id: t.id || `${t.symbol}-${t.ts}` }));
    return d;
  });
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [lastScanTs, setLastScanTs] = useState(() => loadAutoTradesTs());
  const [livePrices, setLivePrices] = useState({});

  useEffect(() => { saveAutoTrades(data); }, [data]);
  useEffect(() => { saveAutoTradesTs(lastScanTs); }, [lastScanTs]);

  // 即時價格（用 coins 列表）
  useEffect(() => {
    if (!coins || !coins.length) return;
    const map = {};
    [...data.longs, ...data.shorts].forEach((t) => {
      const c = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""));
      if (c) map[t.symbol] = c.price;
    });
    setLivePrices((prev) => ({ ...prev, ...map }));
  }, [coins, data]);

  const PER_SIDE = 5;

  async function runScan() {
    if (!coins || !coins.length || scanning) return;
    setScanning(true);
    setScanProgress({ stage: 1, done: 0, total: coins.length });
    try {
      const r = await scanAutoTrades(coins, coins.length, PER_SIDE, (p) => setScanProgress(p));
      setData((prev) => {
        // 補空位：保留現有未結束的單，只在不足 PER_SIDE 時用新掃描結果補滿
        function fillSide(existing, fresh) {
          const stillOpen = existing.filter((t) => {
            const live = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""))?.price;
            if (!live) return true; // 抓不到價就先保留
            const isLong = t.direction === "long";
            const slHit = isLong ? live <= t.sl : live >= t.sl;
            const tps = [t.tp1, t.tp2, t.tp3].filter((x) => x != null);
            const allTpHit = tps.length > 0 && tps.every((tp) => isLong ? live >= tp : live <= tp);
            return !slHit && !allTpHit;
          });
          const existingSymbols = new Set(stillOpen.map((t) => t.symbol));
          const need = PER_SIDE - stillOpen.length;
          const newOnes = fresh.filter((t) => !existingSymbols.has(t.symbol)).slice(0, Math.max(0, need)).map((t) => ({ ...t, id: `${t.symbol}-${t.ts}` }));
          return [...stillOpen, ...newOnes];
        }
        return { longs: fillSide(prev.longs, r.longs), shorts: fillSide(prev.shorts, r.shorts) };
      });
      setLastScanTs(Date.now());
    } catch {}
    setScanning(false);
    setScanProgress(null);
  }

  // 自動：首次進入若無資料或超過5分鐘，或現有單未滿則觸發掃描；之後每5分鐘檢查一次
  useEffect(() => {
    if (!coins || !coins.length) return;
    const needScan = () => {
      const totalSlots = data.longs.length + data.shorts.length;
      return totalSlots < PER_SIDE * 2 || Date.now() - lastScanTs >= 5 * 60 * 1000;
    };
    if (needScan()) runScan();
    const iv = setInterval(() => { if (needScan()) runScan(); }, 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins]);

  function removeTrade(side, id) {
    setData((prev) => ({ ...prev, [side]: prev[side].filter((t) => t.id !== id) }));
  }

  return (
    <>
      <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>🤖 自動推薦單</div>
          <div style={{ color: "#4a5568", fontSize: 9 }}>全市場掃描 · SMC+AI共識+SNR 綜合評分 · 每5分鐘檢查補位</div>
        </div>
        <button onClick={runScan} disabled={scanning} style={{ background: scanning ? "#1a2535" : "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: scanning ? 0.5 : 1 }}>{scanning ? "掃描中..." : "↻ 重新掃描"}</button>
      </div>

      {scanning && scanProgress && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>
              {scanProgress.stage === 1 ? "第一階段：全市場SMC初篩" : "第二階段：AI共識精選"} {scanProgress.done} / {scanProgress.total}
            </span>
          </div>
          <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${scanProgress.total ? (scanProgress.done / scanProgress.total) * 100 : 0}%`, height: "100%", background: scanProgress.stage === 1 ? "#58a6ff" : "#a78bfa", transition: "width .3s ease" }} />
          </div>
        </div>
      )}

      {scanning && data.longs.length === 0 && data.shorts.length === 0 && (
        <div style={{ marginBottom: 10 }}>
          {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 110, marginBottom: 8 }} />)}
        </div>
      )}

      <Section title={`🟢 做多建議 (${data.longs.length}/${PER_SIDE})`} color="#26a69a" defaultOpen={true}>
        {data.longs.length === 0 && !scanning && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無符合條件的做多標的</div>}
        {data.longs.map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onRemove={(id) => removeTrade("longs", id)} />)}
      </Section>

      <Section title={`🔴 做空建議 (${data.shorts.length}/${PER_SIDE})`} color="#ef5350" defaultOpen={true}>
        {data.shorts.length === 0 && !scanning && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無符合條件的做空標的</div>}
        {data.shorts.map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onRemove={(id) => removeTrade("shorts", id)} />)}
      </Section>

      {lastScanTs > 0 && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", textAlign: "center", padding: "4px" }}>上次掃描：{new Date(lastScanTs).toLocaleTimeString()}</div>}

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px", marginTop: 4 }}>
        <p style={{ color: "#5a6b80", marginBottom: 4 }}>說明：</p>
        <p>· 進場價=現價，SL=ATR×1.5</p>
        <p>· TP優先採用SNR壓力/支撐位，否則用ATR倍數(2x/4x/6x)</p>
        <p>· 評分=SMC信心度40% + AI共識(方向一致)40% + 結構/SNR加分20%</p>
        <p>· 單子觸及SL或最終TP前不會被替換，只補空位</p>
      </div>
    </>
  );
}

function TradeJournal({ coins, defaultSymbol }) {
  const [journalSubTab, setJournalSubTab] = useState("auto");
  const [trades, setTrades] = useState(() => loadTrades());
  const [showForm, setShowForm] = useState(false);
  const [livePrices, setLivePrices] = useState({});

  useEffect(() => { saveTrades(trades); }, [trades]);

  // 抓開倉中交易的即時價格（用 coins 列表的價格，每次 coins 更新時刷新）
  useEffect(() => {
    if (!coins || !coins.length) return;
    const map = {};
    trades.forEach((t) => {
      if (t.status === "closed") return;
      const c = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""));
      if (c) map[t.symbol] = c.price;
    });
    setLivePrices((prev) => ({ ...prev, ...map }));
  }, [coins, trades]);

  function addTrade(trade) {
    setTrades((prev) => [trade, ...prev]);
    setShowForm(false);
  }
  function deleteTrade(id) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }
  function closeTrade(id) {
    setTrades((prev) => prev.map((t) => t.id === id ? { ...t, status: "closed" } : t));
  }

  const openTrades = trades.filter((t) => t.status !== "closed");
  const closedTrades = trades.filter((t) => t.status === "closed");

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["auto", "🤖 自動推薦單"], ["manual", "📝 手動紀錄"]].map(([id, label]) => (
          <button key={id} onClick={() => setJournalSubTab(id)} style={{ flex: 1, background: journalSubTab === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${journalSubTab === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, color: journalSubTab === id ? "#58a6ff" : "#4a5568", padding: "7px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
        ))}
      </div>

      {journalSubTab === "auto" && <AutoTrades coins={coins} />}

      {journalSubTab === "manual" && <>
      <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>交易紀錄</div>
          <div style={{ color: "#4a5568", fontSize: 9 }}>本機儲存 · 自動追蹤TP/SL進度</div>
        </div>
        <button onClick={() => setShowForm((s) => !s)} style={{ background: "#58a6ff", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{showForm ? "收起" : "+ 新增"}</button>
      </div>

      {showForm && <TradeForm onAdd={addTrade} onCancel={() => setShowForm(false)} defaultSymbol={defaultSymbol} />}

      <Section title={`持倉中 (${openTrades.length})`} color="#58a6ff" defaultOpen={true}>
        {openTrades.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>尚無持倉紀錄</div>}
        {openTrades.map((t) => (
          <TradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onDelete={deleteTrade} onClose={closeTrade} />
        ))}
      </Section>

      {closedTrades.length > 0 && (
        <Section title={`已平倉 (${closedTrades.length})`} color="#5a6b80" defaultOpen={false}>
          {closedTrades.map((t) => (
            <TradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onDelete={deleteTrade} onClose={closeTrade} />
          ))}
        </Section>
      )}
      </>}
    </>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tf, setTf] = useState("1H");
  const [candles, setCandles] = useState([]);
  const [sideTab, setSideTab] = useState("overview");
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
  const [recsProgress, setRecsProgress] = useState({ done: 0, total: 0 });
  const [alerts, setAlerts] = useState([]);
  const [listLimit, setListLimit] = useState(50);
  const [multiAI, setMultiAI] = useState(null);
  const [multiAILoading, setMultiAILoading] = useState(false);
  const [alertSubTab, setAlertSubTab] = useState("recs");
  const [infoSubTab, setInfoSubTab] = useState("jin10");
  const [explosive, setExplosive] = useState(null);
  const [explosiveLoading, setExplosiveLoading] = useState(false);
  const [explosiveTs, setExplosiveTs] = useState(0);
  const [explosiveProgress, setExplosiveProgress] = useState({ done: 0, total: 0 });

  const lastSig = useRef(null);

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
      const prevForSymbol = lastSig.current && lastSig.current.startsWith(`${selected.symbol}-`);
      if (isDir && notifOn && lastSig.current !== key) {
        // 首次看到這個幣種（剛切換過來）只記錄、不跳橫幅；之後訊號真的改變才跳
        const shouldBanner = prevForSymbol;
        lastSig.current = key;
        if (shouldBanner) {
          const p = { signal: r.signal, color: r.color, symbol: selected.symbol, ts: Date.now(), confidence: r.confidence };
          setNotif(p);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try { new Notification(`📊 ${selected.symbol} SMC 訊號`, { body: `${r.signal}｜信心 ${r.confidence}%` }); } catch {}
          }
          setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
        }
      } else if (!isDir && notifOn) {
        // 觀望時更新記錄，避免下次回到方向訊號被當成「首次」
        lastSig.current = key;
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
    if (sideTab !== "scan" || alertSubTab !== "recs" || !coinsLoaded) return;
    if (recs && Date.now() - recsTs < 5 * 60 * 1000) return;
    let cancel = false;
    setRecsLoading(true);
    setRecsProgress({ done: 0, total: coins.length });
    scanRecommendations(coins, coins.length, (done, total) => { if (!cancel) setRecsProgress({ done, total }); }).then((r) => {
      if (cancel) return;
      setRecs(r); setRecsTs(Date.now()); setRecsLoading(false);
    }).catch(() => { if (!cancel) setRecsLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, alertSubTab, coinsLoaded, recsTs]);

  // 警報掃描
  useEffect(() => {
    if (!coinsLoaded) return;
    let cancel = false;
    async function scan() {
      if (cancel) return;
      try {
        const a = await scanAnomalies(coins, coins.length);
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

  // 爆發掃描（進分頁自動掃 + 每 5 分鐘自動刷新）
  useEffect(() => {
    if (sideTab !== "scan" || alertSubTab !== "explosive" || !coinsLoaded) return;
    let cancel = false;
    async function run() {
      if (cancel) return;
      setExplosiveLoading(true);
      setExplosiveProgress({ done: 0, total: coins.length });
      try {
        const r = await scanExplosive(coins, coins.length, (done, total) => { if (!cancel) setExplosiveProgress({ done, total }); });
        if (cancel) return;
        setExplosive(r); setExplosiveTs(Date.now());
      } catch {}
      if (!cancel) setExplosiveLoading(false);
    }
    // 進入時若無資料或超過 5 分鐘就立刻掃
    if (!explosive || Date.now() - explosiveTs >= 5 * 60 * 1000) run();
    const iv = setInterval(run, 5 * 60 * 1000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, alertSubTab, coinsLoaded]);

  // 多 AI 個別分析（5 個派系）
  useEffect(() => {
    if (!selected || !candles.length || !smc) return;
    let cancel = false;
    setMultiAILoading(true);
    analyzeMultiAI(selected, candles, smc, smcMulti).then((r) => {
      if (!cancel) { setMultiAI(r); setMultiAILoading(false); }
    }).catch(() => { if (!cancel) setMultiAILoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, smc, smcMulti]);

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
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", color: "#c9d1d9", fontFamily: "'Sora',system-ui,sans-serif", overflow: "hidden", background: "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(247,147,26,0.10), transparent 60%), radial-gradient(ellipse 70% 50% at 85% 8%, rgba(98,126,234,0.10), transparent 55%), linear-gradient(180deg,#070c12 0%,#05080c 100%)" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#2a3b52,#1a2535);border-radius:3px;transition:background .2s}
::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#3a5275,#26344a)}
::-webkit-scrollbar-track{background:transparent}
button{cursor:pointer;outline:none;font-family:inherit;transition:transform .12s ease,filter .15s ease}
button:active{transform:scale(.97)}
.mono{font-family:'JetBrains Mono',monospace}
.glass{background:rgba(13,21,32,0.55);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);border:1px solid rgba(255,255,255,0.07);box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 4px 18px -8px rgba(0,0,0,0.5)}
.glass-sub{background:rgba(10,17,26,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.coin-row{transition:background .18s ease,border-color .18s ease,transform .12s ease}
.coin-row:hover{background:rgba(88,166,255,0.06)!important;transform:translateX(2px)}
.tab-btn{transition:color .2s ease,background .2s ease,transform .12s ease}
.lift{transition:transform .15s ease,box-shadow .2s ease,border-color .2s ease}
.lift:hover{transform:translateY(-1px)}
.card-hover{transition:transform .16s ease,box-shadow .2s ease,border-color .2s ease}
.card-hover:hover{transform:translateY(-2px);box-shadow:0 8px 24px -10px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.14)!important}
@keyframes slideDown{from{transform:translate(-50%,-120%);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 24px -6px var(--glow),inset 0 0 0 1px rgba(255,255,255,0.04)}50%{box-shadow:0 0 40px -4px var(--glow),inset 0 0 0 1px rgba(255,255,255,0.08)}}
@keyframes glowDriftLong{0%,100%{background-position:50% 30%}50%{background-position:50% 10%}}
@keyframes glowDriftShort{0%,100%{background-position:50% 70%}50%{background-position:50% 90%}}
@keyframes ringSpin{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--off)}}
@keyframes breathe{0%,100%{opacity:.55;filter:saturate(.85)}50%{opacity:1;filter:saturate(1.2)}}
.breathe{animation:breathe 2.6s ease-in-out infinite}
.signal-card{position:relative;animation:fadeUp .4s ease,glowPulse 3.5s ease-in-out infinite;background-size:160% 160%!important}
.signal-card.dir-long{animation:fadeUp .4s ease,glowPulse 3.5s ease-in-out infinite,glowDriftLong 6s ease-in-out infinite}
.signal-card.dir-short{animation:fadeUp .4s ease,glowPulse 3.5s ease-in-out infinite,glowDriftShort 6s ease-in-out infinite}
.fade-in{animation:fadeUp .35s ease}
.tab-pane{animation:fadeUp .3s ease}
@keyframes skeletonPulse{0%,100%{opacity:.4}50%{opacity:.9}}
.skeleton{animation:skeletonPulse 1.4s ease-in-out infinite;border-radius:8px;background:linear-gradient(90deg,#0d1520,#1a2535,#0d1520)}`}</style>

      {notif && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "slideDown .35s ease-out", background: "#0d1520", border: `1.5px solid ${notif.color}`, color: notif.color, borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 30px rgba(0,0,0,.6)", maxWidth: "92vw" }}>
          <div style={{ fontSize: 22 }}>{notif.signal.includes("做多") ? "📈" : "📉"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8 }}><span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{notif.symbol}</span><span style={{ color: notif.color, fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{notif.signal}</span></div>
            <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace" }}>SMC 訊號 · 信心 {notif.confidence}% · {new Date(notif.ts).toLocaleTimeString()}</div>
          </div>
          <button onClick={() => setNotif(null)} style={{ background: "transparent", border: "none", color: "#4a5568", fontSize: 18 }}>×</button>
        </div>
      )}

      <div className="glass" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", display: "flex", alignItems: "center", height: 50, gap: 14, flexShrink: 0, position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 0 18px -2px rgba(247,147,26,0.55)" }}>₿</div>
          <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: 3, color: "#e6edf3" }}>CRYPTEX</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}>
          {smc && (smc.signal.includes("做多") || smc.signal.includes("做空")) && <span className="mono breathe" style={{ color: smc.color, fontSize: 10, fontWeight: 700, border: `1px solid ${smc.color}`, borderRadius: 5, padding: "2px 7px", boxShadow: `0 0 12px -3px ${smc.color}` }}>{smc.signal}</span>}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950", boxShadow: "0 0 8px #3fb950" }} />
          <span className="mono" style={{ color: "#5a6b80", fontSize: 9 }}>{status}</span>
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
            {filtered.length === 0 && <div style={{ color: "#3a4658", fontSize: 10, fontFamily: "monospace", padding: "12px 10px" }}>{status}</div>}
            {visibleList.map((coin) => {
              const live = coins.find((c) => c.symbol === coin.symbol) || coin;
              const active = selected?.symbol === coin.symbol;
              return (
                <button key={coin.symbol} className="coin-row" onClick={() => setSelected(live)} style={{ width: "100%", background: active ? "linear-gradient(90deg,rgba(88,166,255,0.12),transparent)" : "transparent", border: "none", borderLeft: `2px solid ${active ? "#58a6ff" : "transparent"}`, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left" }}>
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
          <div className="glass-sub" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <CountUp value={displayPrice} decimals={displayPrice > 100 ? 2 : displayPrice > 1 ? 4 : 6} prefix="$" className="mono" style={{ fontSize: 24, fontWeight: 700, color: up ? "#3dd9c4" : "#ff8a87" }} />
                <span className="mono" style={{ color: "#5a6b80", fontSize: 10 }}>{selected?.symbol} · 加密貨幣</span>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div className="mono" style={{ color: up ? "#26a69a" : "#ef5350", fontSize: 14, fontWeight: 700, textShadow: `0 0 14px ${up ? "#26a69a55" : "#ef535055"}` }}>{up ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%</div>
                <div className="mono" style={{ color: "#5a6b80", fontSize: 9 }}>24h 變化</div>
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
          <div className="glass-sub" style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            {[["overview", "📊", "總覽"], ["indicators", "📈", "指標"], ["scan", "🔍", "掃描"], ["journal", "💼", "交易"], ["info", "ℹ️", "資訊"]].map(([id, icon, label]) => (
              <button key={id} className="tab-btn" onClick={() => setSideTab(id)} style={{ flex: 1, background: sideTab === id ? "linear-gradient(180deg,rgba(88,166,255,0.14),transparent)" : "transparent", border: "none", borderBottom: `2px solid ${sideTab === id ? "#58a6ff" : "transparent"}`, color: sideTab === id ? "#e6edf3" : "#5a6b80", padding: "10px 0 9px", fontSize: 11, fontWeight: sideTab === id ? 700 : 500, fontFamily: "'Sora',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 14, opacity: sideTab === id ? 1 : 0.6 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>


          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            <div key={sideTab} className="tab-pane">
            {/* SMC */}
            {sideTab === "overview" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空訊號通知</div><div style={{ color: "#4a5568", fontSize: 9 }}>橫幅 + 系統通知</div></div>
                <button onClick={enableNotif} style={{ background: notifOn ? "#26a69a" : "#1a2535", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{notifOn ? "✓ 已開啟" : "開啟通知"}</button>
              </div>
              {smc ? <>
                <div className={`signal-card ${smc.signal.includes("做多") ? "dir-long" : smc.signal.includes("做空") ? "dir-short" : ""}`} style={{ "--glow": `${smc.color}66`, background: `linear-gradient(145deg, ${smc.color}1f, rgba(13,21,32,0.6))`, border: `1px solid ${smc.color}88`, borderRadius: 16, padding: "18px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
                    <svg width="76" height="76" style={{ transform: "rotate(-90deg)" }}>
                      <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f0b90b" />
                          <stop offset="100%" stopColor={smc.color} />
                        </linearGradient>
                      </defs>
                      <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                      <circle cx="38" cy="38" r="32" fill="none" stroke="url(#ringGrad)" strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 32} strokeDashoffset={2 * Math.PI * 32 * (1 - (smc.confidence || 0) / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 5px ${smc.color})` }} />
                      {(() => {
                        const ang = (-90 + (smc.confidence || 0) / 100 * 360) * Math.PI / 180;
                        const cx = 38 + 32 * Math.cos(ang), cy = 38 + 32 * Math.sin(ang);
                        return <circle cx={cx} cy={cy} r="3.5" fill="#fff" style={{ filter: `drop-shadow(0 0 4px ${smc.color})`, transition: "all .8s cubic-bezier(.4,0,.2,1)" }} />;
                      })()}
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <CountUp value={smc.confidence} className="mono" style={{ color: smc.color, fontSize: 18, fontWeight: 700, lineHeight: 1 }} />
                      <span className="mono" style={{ color: "#5a6b80", fontSize: 8 }}>信心</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ color: "#5a6b80", fontSize: 9, marginBottom: 5, letterSpacing: 1 }}>SMC 綜合訊號 · {selected?.symbol} · {tf}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={smc.signal.includes("做多") || smc.signal.includes("做空") ? "breathe" : ""} style={{ color: smc.color, fontSize: 26, lineHeight: 1, textShadow: `0 0 16px ${smc.color}88` }}>
                        {smc.signal.includes("做多") ? "▲" : smc.signal.includes("做空") ? "▼" : "—"}
                      </span>
                      <div style={{ color: smc.color, fontSize: 28, fontWeight: 800, fontFamily: "'Sora',sans-serif", letterSpacing: 1, lineHeight: 1, textShadow: `0 0 20px ${smc.color}55` }}>{smc.signal}</div>
                    </div>
                  </div>
                </div>

                {multiAILoading && !multiAI && <div>
                  {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 36, marginBottom: 6 }} />)}
                </div>}
                {multiAI && multiAI.length > 0 && (() => {
                  const consensus = multiAI[multiAI.length - 1];
                  return (
                    <div style={{ background: `${consensus.color}14`, border: `1.5px solid ${consensus.color}`, borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
                      <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>🧠 AI 共識 · {selected?.symbol}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: consensus.color, fontFamily: "monospace" }}>{consensus.direction}</div>
                      <div style={{ color: consensus.color, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>共識信心 {consensus.confidence}%</div>
                    </div>
                  );
                })()}

                <ScoreCard symbol={selected?.symbol} smc={smc} multiAI={multiAI} hideHeader={true} />

                <Section title="多時區 SMC 結構" color="#26a69a" badge="MTF" defaultOpen={false}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {smcMulti.map(({ tf: t, result: r }) => {
                      const sig = r ? r.signal : "資料不足";
                      const col = r ? r.color : "#4a5568";
                      return (
                        <div key={t} className="lift" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: `linear-gradient(90deg, ${r ? col + "14" : "rgba(13,21,32,0.5)"}, rgba(13,21,32,0.3))`, borderRadius: 8, border: `1px solid ${r ? col + "44" : "rgba(255,255,255,0.05)"}` }}>
                          <span className="mono" style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700, width: 36 }}>{t}</span>
                          <span className="mono" style={{ color: col, fontSize: 11, fontWeight: 700, minWidth: 64 }}>{sig}</span>
                          {r && <><span className="mono" style={{ flex: 1, color: "#5a6b80", fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.structure}</span><span className="mono" style={{ color: col, fontSize: 9 }}>{r.confidence}%</span></>}
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section title="市場結構" color="#58a6ff" defaultOpen={false}>
                  <IndRow label="當前結構" value={smc.structure} color={smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
                  <IndRow label="流動性掃單" value={smc.sweep || "無"} color={smc.sweep ? "#f0e68c" : "#4a5568"} />
                  <IndRow label="FVG 失衡" value={smc.fvg ? (smc.fvg.type === "bull" ? "多頭缺口" : "空頭缺口") : "無"} color={smc.fvg ? (smc.fvg.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
                  <IndRow label="訂單塊 OB" value={smc.ob ? (smc.ob.type === "bull" ? "多頭OB" : "空頭OB") : "無"} color={smc.ob ? (smc.ob.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
                </Section>

                {multiAI && multiAI.length > 0 && <Section title="🤖 5 個 AI 派系觀點" color="#a78bfa" defaultOpen={false}>
                  <div style={{ color: "#4a5568", fontSize: 9, padding: "0 0 8px", lineHeight: 1.5 }}>點任一派系展開查看完整理由</div>
                  {multiAI.slice(0, -1).map((ai, i) => <AICard key={i} ai={ai} defaultOpen={false} />)}
                  <AICard ai={multiAI[multiAI.length - 1]} defaultOpen={false} />
                </Section>}

                <Section title="判斷依據" color="#f0e68c" defaultOpen={false}>
                  {smc.reasons.length ? smc.reasons.map((r, i) => <div key={i} style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.6, padding: "3px 0" }}><span style={{ color: "#4a5568" }}>{i + 1}. </span>{r}</div>) : <div style={{ color: "#4a5568", fontSize: 11 }}>無明確訊號，建議觀望。</div>}
                </Section>
              </> : <div>
                <div className="skeleton" style={{ height: 90, marginBottom: 11 }} />
                <div className="skeleton" style={{ height: 50, marginBottom: 11 }} />
                <div style={{ color: "#5a6b80", fontSize: 11, fontFamily: "monospace", padding: "8px 4px", textAlign: "center" }}>正在分析 K 線 SMC 結構...</div>
              </div>}
            </>}

            {/* 交易 */}
            {sideTab === "journal" && (
              <TradeJournal coins={coins} defaultSymbol={selected?.symbol} />
            )}

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

            {/* 掃描（推薦/警報/爆發） */}
            {sideTab === "scan" && <>
              {/* 子標籤 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[["recs", "🎯 推薦"], ["alerts", "⚡ 警報"], ["explosive", "🚀 爆發掃描"]].map(([id, label]) => (
                  <button key={id} onClick={() => setAlertSubTab(id)} style={{ flex: 1, background: alertSubTab === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${alertSubTab === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, color: alertSubTab === id ? "#58a6ff" : "#4a5568", padding: "7px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                ))}
              </div>

            {/* 推薦子頁 */}
            {alertSubTab === "recs" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空推薦掃描</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>掃描全部商品 · SMC 評分</div>
                </div>
                <button onClick={() => setRecsTs(0)} disabled={recsLoading} style={{ background: recsLoading ? "#1a2535" : "#58a6ff", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: recsLoading ? 0.5 : 1 }}>{recsLoading ? "掃描中..." : "↻ 刷新"}</button>
              </div>
              {recsLoading && <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>掃描進度</span>
                  <span style={{ color: "#58a6ff", fontSize: 9, fontFamily: "monospace" }}>{recsProgress.done} / {recsProgress.total || coins.length}</span>
                </div>
                <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${recsProgress.total ? (recsProgress.done / recsProgress.total) * 100 : 0}%`, height: "100%", background: "#58a6ff", transition: "width .3s ease" }} />
                </div>
              </div>}
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

              {/* 警報子頁 */}
              {alertSubTab === "alerts" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>持倉異常警報</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>每 3 分鐘掃全部商品 OI 變化</div>
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
                  <p style={{ color: "#5a6b80", marginBottom: 4 }}>判讀說明：</p>
                  <p>· <span style={{ color: "#26a69a" }}>多頭觸發</span>：OI 暴增 + 價漲</p>
                  <p>· <span style={{ color: "#ef5350" }}>空頭觸發</span>：OI 暴增 + 價跌</p>
                  <p>· <span style={{ color: "#ef5350" }}>誘空</span>：OI 增 + 價跌</p>
                  <p>· <span style={{ color: "#f0b90b" }}>疑似反轉</span>：OI 減 + 價升</p>
                </div>
              </>}

              {/* 爆發掃描子頁 */}
              {alertSubTab === "explosive" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>🚀 即將爆發幣種掃描</div>
                    <div style={{ color: "#4a5568", fontSize: 9 }}>每 5 分鐘自動掃描 · OI+Funding+布林帶+量能+SMC+SNR</div>
                  </div>
                  <button onClick={() => setExplosiveTs(0)} disabled={explosiveLoading} style={{ background: explosiveLoading ? "#1a2535" : "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: explosiveLoading ? 0.5 : 1 }}>{explosiveLoading ? "掃描中..." : "↻ 刷新"}</button>
                </div>
                {explosiveLoading && <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>掃描進度</span>
                    <span style={{ color: "#f0b90b", fontSize: 9, fontFamily: "monospace" }}>{explosiveProgress.done} / {explosiveProgress.total || coins.length}</span>
                  </div>
                  <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${explosiveProgress.total ? (explosiveProgress.done / explosiveProgress.total) * 100 : 0}%`, height: "100%", background: "#f0b90b", transition: "width .3s ease" }} />
                  </div>
                </div>}
                {explosive && <>
                  {[["long", "🟢 多頭爆發候選", "#26a69a"], ["short", "🔴 空頭爆發候選", "#ef5350"], ["neutral", "⚡ 能量蓄積中（方向待定）", "#f0b90b"]].map(([dir, title, col]) => {
                    const items = explosive.filter(x => x.direction === dir);
                    if (items.length === 0) return null;
                    return (
                      <Section key={dir} title={`${title} (${items.length})`} color={col} defaultOpen={dir !== "neutral"}>
                        {items.map((ex) => (
                          <button key={ex.symbol} onClick={() => { const c = coins.find(x => x.symbol === ex.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`, borderRadius: 6, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{ex.name}</span>
                                <span style={{ color: ex.change >= 0 ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>{ex.change >= 0 ? "+" : ""}{ex.change.toFixed(2)}%</span>
                                <span style={{ marginLeft: "auto", background: col, color: "#000", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 3 }}>{ex.score}分</span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {ex.signals.map((s, si) => (
                                  <span key={si} style={{ background: "#1a2535", color: "#8b949e", fontSize: 8, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3 }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </Section>
                    );
                  })}
                  <div style={{ color: "#4a5568", fontSize: 9, textAlign: "center", padding: "4px" }}>掃描全部商品 · {new Date(explosiveTs).toLocaleTimeString()}</div>
                </>}
                {!explosive && !explosiveLoading && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>準備自動掃描中...</div>}
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px", marginTop: 4 }}>
                  <p style={{ color: "#5a6b80", marginBottom: 4 }}>評分說明（滿分 100）：</p>
                  <p>· OI 暴增 >5% → +15</p>
                  <p>· Funding 極值 → +20</p>
                  <p>· 布林帶擠壓（能量蓄積）→ +20</p>
                  <p>· 成交量暴增 2 倍以上 → +10</p>
                  <p>· SMC 方向確認 → +10~20</p>
                  <p>· 貼近SNR支撐/壓力 → +10</p>
                </div>
              </>}
            </>}

            {/* 資訊（金十+說明） */}
            {sideTab === "info" && <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[["jin10", "📰 金十快訊"], ["news", "📖 說明"]].map(([id, label]) => (
                <button key={id} onClick={() => setInfoSubTab(id)} style={{ flex: 1, background: infoSubTab === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${infoSubTab === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, color: infoSubTab === id ? "#58a6ff" : "#4a5568", padding: "7px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
              ))}
            </div>

            {infoSubTab === "jin10" && <Section title="金十快訊" color="#f0b90b" badge="Jin10 即時">
              <FeedState state={j10flash}>
                {Array.isArray(j10flash) && j10flash.map((n, i) => (
                  <div key={i} style={{ padding: "7px 0", borderBottom: i < j10flash.length - 1 ? "1px solid #111824" : "none" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", minWidth: 38, flexShrink: 0 }}>{fmtFeedTime(n.time)}</span>
                      <span style={{ color: n.important ? "#ef5350" : "#c9d1d9", fontSize: 11, lineHeight: 1.5, fontWeight: n.important ? 700 : 400 }}>{n.text}</span>
                    </div>
                  </div>
                ))}
              </FeedState>
            </Section>}

            {infoSubTab === "news" && <div style={{ color: "#8b949e", fontSize: 12, lineHeight: 1.8, padding: 4 }}>
              <p style={{ color: "#e6edf3", fontWeight: 700, marginBottom: 8 }}>📡 資料來源</p>
              <p>加密貨幣：Binance + OKX + CoinGecko 合併（幾百個幣）</p>
              <p>期貨資料：Binance Futures（資金費率/OI/多空比/Taker CVD）</p>
              <p>K 線：Binance WebSocket 即時</p>
              <p>財經訊息：金十數據</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>🤖 5 個 AI 派系</p>
              <p>🏃 趨勢跟隨 | 🔁 均值回歸 | 🏛️ SMC 機構 | 💰 期貨情緒 | 🧠 整合共識</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>📊 評分卡 / 交易紀錄</p>
              <p>評分卡：整合市場動能、資金費率、多空情緒、相對強弱、SNR關鍵價位</p>
              <p>交易紀錄：本機儲存進場/止損/止盈，自動追蹤即時盈虧與TP達成狀態</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>📊 高勝率回測</p>
              <p>多時區共振策略 — 1D 趨勢 + 4H 確認 + 1H 進場 + 量能過濾。交易少但勝率高。</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>⚡ 推薦與警報</p>
              <p>每 5 分鐘全量掃描推薦清單；每 3 分鐘全量掃 OI 異常警報。</p>
            </div>}
            </>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
