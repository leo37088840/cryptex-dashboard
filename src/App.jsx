import { useState, useEffect, useMemo, useRef, memo } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti,
  calcSMA, calcMACD, calcRSI, calcKDJ,
  loadJin10Flash, subscribeCryptoTicker, loadPeriodChanges, subscribeLiquidations,
  scanRecommendations, scanAnomalies, analyzeMultiAI, scanExplosive, scanAutoTrades, backtestMTF,
} from "./data.js";

const INTERVALS = ["15m", "1H", "4H", "1D"];

// 數字滾動動畫：value 變動時平滑過渡到新值
const CountUp = memo(function CountUp({ value, decimals = 0, duration = 600, prefix = "", suffix = "", style, className }) {
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
});


// 盈虧/變化的語意化漸層色：大賺深綠→小賺淺綠→小虧淺紅→大虧深紅
function pnlColor(pct) {
  if (pct == null || isNaN(pct)) return "#5a6b80";
  if (pct >= 5) return "#1f9b7a";
  if (pct >= 1) return "#26a69a";
  if (pct > 0) return "#5fc9a8";
  if (pct === 0) return "#8b949e";
  if (pct > -1) return "#f0908e";
  if (pct > -5) return "#ef5350";
  return "#c0392b";
}
// 評分/勝率語意色（0-100）
function scoreColor(v) {
  if (v == null || isNaN(v)) return "#5a6b80";
  if (v >= 70) return "#1f9b7a";
  if (v >= 55) return "#26a69a";
  if (v >= 45) return "#f0b90b";
  if (v >= 30) return "#ef8e53";
  return "#ef5350";
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
          <span className="mono" style={{ color: pnlColor(pnlPct), fontSize: 16, fontWeight: 800 }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
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
const AUTO_CLOSED_KEY = "cryptex_auto_closed_v1";

function loadAutoTrades() {
  try {
    const raw = localStorage.getItem(AUTO_TRADES_KEY);
    return raw ? JSON.parse(raw) : { longs: [], shorts: [] };
  } catch { return { longs: [], shorts: [] }; }
}
function saveAutoTrades(data) {
  try { localStorage.setItem(AUTO_TRADES_KEY, JSON.stringify(data)); } catch {}
}
function loadClosedTrades() {
  try {
    const raw = localStorage.getItem(AUTO_CLOSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveClosedTrades(arr) {
  try { localStorage.setItem(AUTO_CLOSED_KEY, JSON.stringify(arr)); } catch {}
}
function loadAutoTradesTs() {
  try { return parseInt(localStorage.getItem(AUTO_TRADES_TS_KEY) || "0", 10); } catch { return 0; }
}
function saveAutoTradesTs(ts) {
  try { localStorage.setItem(AUTO_TRADES_TS_KEY, String(ts)); } catch {}
}

const AutoTradeCard = memo(function AutoTradeCard({ trade, livePrice, onCancel, onShare, onSetAlert }) {
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
        <span style={{ background: scoreColor(trade.finalScore) + "22", color: scoreColor(trade.finalScore), fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 4, border: `1px solid ${scoreColor(trade.finalScore)}55` }}>評分 {trade.finalScore}</span>
        {statusBadge && <span style={{ color: statusBadge.color, fontSize: 9, fontFamily: "monospace", fontWeight: 700, border: `1px solid ${statusBadge.color}`, padding: "1px 6px", borderRadius: 4 }}>{statusBadge.label}</span>}
        <span style={{ marginLeft: "auto", color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{new Date(trade.ts).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {pnlPct != null && (
        <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 6, background: pnlPct >= 0 ? "#26a69a14" : "#ef535014", borderRadius: 6 }}>
          <span className="mono" style={{ color: pnlColor(pnlPct), fontSize: 16, fontWeight: 800 }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
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

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={() => onShare && onShare(trade, livePrice)} style={{ flex: 1, background: "#0f1e2e", border: "1px solid #1a2535", borderRadius: 5, color: "#58a6ff", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>📤 分享</button>
        <button onClick={() => onSetAlert && onSetAlert(trade)} style={{ flex: 1, background: "#0f1e2e", border: "1px solid #1a2535", borderRadius: 5, color: "#f0b90b", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>🔔 到價提醒</button>
      </div>

      {finished ? (
        <div style={{ width: "100%", marginTop: 8, background: "#1a2535", borderRadius: 5, color: "#8b949e", padding: "5px 0", fontSize: 10, fontFamily: "monospace", textAlign: "center" }}>
          {slHit() ? "已觸及止損，平倉中…" : "已達最終止盈，平倉中…"}
        </div>
      ) : (
        <button onClick={() => onCancel && onCancel(trade)} style={{ width: "100%", marginTop: 6, background: "transparent", border: "1px solid #3a4658", borderRadius: 5, color: "#5a6b80", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>撤銷此單（沒跟到，不計入回測）</button>
      )}
    </div>
  );
});

// 計算單子結果（用平倉價 vs 進場/SL 算 R 與報酬%）
function computeOutcome(trade, exitPrice, reason) {
  const isLong = trade.direction === "long";
  const risk = Math.abs(trade.entry - trade.sl) || (trade.entry * 0.01);
  const pnlPct = isLong ? ((exitPrice - trade.entry) / trade.entry) * 100 : ((trade.entry - exitPrice) / trade.entry) * 100;
  const rMultiple = isLong ? (exitPrice - trade.entry) / risk : (trade.entry - exitPrice) / risk;
  return { ...trade, exitPrice, exitReason: reason, pnlPct, rMultiple, closedTs: Date.now() };
}

// 評估某張單在現價下是否該平倉，回傳 {price, reason} 或 null
function evalClose(trade, livePrice, currentScore) {
  if (livePrice == null) return null;
  const isLong = trade.direction === "long";
  const slHit = isLong ? livePrice <= trade.sl : livePrice >= trade.sl;
  if (slHit) return { price: trade.sl, reason: "止損" };
  const tps = [trade.tp1, trade.tp2, trade.tp3].filter((x) => x != null);
  const allTpHit = tps.length > 0 && tps.every((tp) => isLong ? livePrice >= tp : livePrice <= tp);
  if (allTpHit) return { price: tps[tps.length - 1], reason: "止盈" };
  if (currentScore != null && currentScore < 40) return { price: livePrice, reason: "評分過低" };
  return null;
}

// ═══════════ 交易分享卡（可截圖）═══════════════════════════════════════════
function ShareCard({ trade, livePrice, onClose }) {
  const isLong = trade.direction === "long";
  const dirColor = isLong ? "#26a69a" : "#ef5350";
  const fmt = (v) => v == null ? "—" : (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));
  let pnlPct = null;
  if (livePrice && trade.entry) {
    pnlPct = isLong ? ((livePrice - trade.entry) / trade.entry) * 100 : ((trade.entry - livePrice) / trade.entry) * 100;
  }
  const rr = trade.tp1 && trade.sl ? Math.abs(trade.tp1 - trade.entry) / Math.max(Math.abs(trade.entry - trade.sl), 1e-9) : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fadeUp .25s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ background: "linear-gradient(155deg,#0f1b2a,#070c12)", border: `1px solid ${dirColor}55`, borderRadius: 18, padding: 22, position: "relative", overflow: "hidden", boxShadow: `0 20px 60px -20px ${dirColor}88` }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: `radial-gradient(circle, ${dirColor}22, transparent 70%)` }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>₿</div>
            <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#e6edf3" }}>CRYPTEX</span>
            <span style={{ marginLeft: "auto", background: `${dirColor}1a`, color: dirColor, fontSize: 11, fontFamily: "monospace", fontWeight: 700, padding: "3px 10px", borderRadius: 6, border: `1px solid ${dirColor}` }}>{isLong ? "▲ 做多" : "▼ 做空"}</span>
          </div>
          <div style={{ color: "#e6edf3", fontSize: 26, fontWeight: 800, fontFamily: "'Sora',sans-serif", marginBottom: 2 }}>{trade.name || trade.symbol}</div>
          <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace", marginBottom: 16 }}>永續合約 · {trade.signal}</div>
          {pnlPct != null && (
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div className="mono" style={{ color: pnlColor(pnlPct), fontSize: 46, fontWeight: 800, lineHeight: 1, textShadow: `0 0 30px ${pnlColor(pnlPct)}66` }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</div>
              <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginTop: 4 }}>未實現盈虧</div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>進場價</div>
              <div style={{ color: "#c9d1d9", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmt(trade.entry)}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>現價</div>
              <div style={{ color: "#c9d1d9", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmt(livePrice)}</div>
            </div>
            <div style={{ background: "rgba(38,166,154,0.08)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ color: "#26a69a", fontSize: 8, fontFamily: "monospace" }}>止盈 TP1</div>
              <div style={{ color: "#26a69a", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmt(trade.tp1)}</div>
            </div>
            <div style={{ background: "rgba(239,83,80,0.08)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ color: "#ef5350", fontSize: 8, fontFamily: "monospace" }}>止損 SL</div>
              <div style={{ color: "#ef5350", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fmt(trade.sl)}</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>評分 {trade.finalScore} · R/R {rr ? rr.toFixed(1) : "—"}</span>
            <span style={{ color: "#3a4658", fontSize: 9, fontFamily: "monospace" }}>{new Date(trade.ts).toLocaleDateString()}</span>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 14, display: "flex", gap: 8 }}>
          <div style={{ flex: 1, color: "#8b949e", fontSize: 10, fontFamily: "monospace", padding: "8px", background: "#0d1520", borderRadius: 8, border: "1px solid #1a2535" }}>📸 截圖此卡片即可分享</div>
          <button onClick={onClose} style={{ background: "#1a2535", border: "none", borderRadius: 8, color: "#c9d1d9", padding: "0 18px", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>關閉</button>
        </div>
      </div>
    </div>
  );
}

function AutoTrades({ coins, onNotify, onSetAlert }) {
  const [data, setData] = useState(() => {
    const d = loadAutoTrades();
    d.longs = (d.longs || []).map(t => ({ ...t, id: t.id || `${t.symbol}-${t.ts}` }));
    d.shorts = (d.shorts || []).map(t => ({ ...t, id: t.id || `${t.symbol}-${t.ts}` }));
    return d;
  });
  const [closed, setClosed] = useState(() => loadClosedTrades());
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [lastScanTs, setLastScanTs] = useState(() => loadAutoTradesTs());
  const [livePrices, setLivePrices] = useState({});
  const cancelledRef = useRef({});
  const [sortMode, setSortMode] = useState("score"); // score | pnl
  const [shareTarget, setShareTarget] = useState(null);

  // 依現價計算單子未實現盈虧%
  const livePnl = (t) => {
    const live = livePrices[t.symbol];
    if (!live || !t.entry) return null;
    return t.direction === "long" ? ((live - t.entry) / t.entry) * 100 : ((t.entry - live) / t.entry) * 100;
  };
  const sortTrades = (arr) => {
    const a = [...arr];
    if (sortMode === "pnl") {
      a.sort((x, y) => {
        const px = livePnl(x), py = livePnl(y);
        if (px == null && py == null) return 0;
        if (px == null) return 1;
        if (py == null) return -1;
        return py - px;
      });
    } else {
      a.sort((x, y) => (y.finalScore || 0) - (x.finalScore || 0));
    }
    return a;
  };

  useEffect(() => { saveAutoTrades(data); }, [data]);
  useEffect(() => { saveClosedTrades(closed); }, [closed]);
  useEffect(() => { saveAutoTradesTs(lastScanTs); }, [lastScanTs]);

  const PER_SIDE = 5;

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

  // 監控自動平倉：價格觸及 SL / 最終TP 時自動移到已結束區並通知
  useEffect(() => {
    if (!coins || !coins.length) return;
    const priceOf = (t) => coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""))?.price;
    const toClose = [];
    ["longs", "shorts"].forEach((side) => {
      data[side].forEach((t) => {
        const live = priceOf(t);
        const res = evalClose(t, live, null); // 價格觸發不看評分
        if (res) toClose.push({ side, trade: t, ...res });
      });
    });
    if (toClose.length === 0) return;
    setData((prev) => {
      const next = { longs: [...prev.longs], shorts: [...prev.shorts] };
      toClose.forEach(({ side, trade }) => {
        next[side] = next[side].filter((x) => x.id !== trade.id);
      });
      return next;
    });
    setClosed((prev) => {
      const add = toClose.map(({ trade, price, reason }) => computeOutcome(trade, price, reason));
      return [...add, ...prev].slice(0, 500);
    });
    toClose.forEach(({ trade, price, reason }) => {
      const win = (trade.direction === "long" ? price >= trade.entry : price <= trade.entry);
      if (onNotify) onNotify({
        symbol: trade.name || trade.symbol,
        signal: `自動平倉 · ${reason}`,
        color: reason === "止損" ? "#ef5350" : win ? "#26a69a" : "#f0b90b",
        confidence: trade.finalScore,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrices]);

  async function runScan() {
    if (!coins || !coins.length || scanning) return;
    setScanning(true);
    setScanProgress({ stage: 1, done: 0, total: coins.length });
    try {
      // 從已結束單算歷史勝率權重（回饋到評分）
      const weights = (() => {
        if (!closed || closed.length < 3) return null;
        const byStruc = {}, byDir = {};
        closed.forEach((t) => {
          const win = t.pnlPct >= 0;
          const struc = (t.structure || "").split(" ")[0];
          const dir = t.direction === "long" ? "做多" : "做空";
          if (struc) { (byStruc[struc] = byStruc[struc] || { w: 0, n: 0 }); byStruc[struc].n++; if (win) byStruc[struc].w++; }
          (byDir[dir] = byDir[dir] || { w: 0, n: 0 }); byDir[dir].n++; if (win) byDir[dir].w++;
        });
        const finalize = (m) => { const o = {}; Object.keys(m).forEach((k) => { o[k] = { n: m[k].n, winRate: m[k].n ? (m[k].w / m[k].n) * 100 : 0 }; }); return o; };
        return { structure: finalize(byStruc), direction: finalize(byDir) };
      })();
      const r = await scanAutoTrades(coins, coins.length, PER_SIDE, (p) => setScanProgress(p), weights);
      // 新掃描結果建立 symbol→finalScore 對照，用於評分過低平倉
      const freshScore = {};
      [...r.longs, ...r.shorts].forEach((t) => { freshScore[t.symbol] = t.finalScore; });

      const closeList = [];
      setData((prev) => {
        function processSide(side, existing, fresh) {
          // 先檢查現有單是否該平倉（價格觸發 or 評分<40）
          const stillOpen = existing.filter((t) => {
            const live = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""))?.price;
            const curScore = freshScore[t.symbol]; // 若這次沒掃到，視為仍有效（undefined→不平倉）
            const res = evalClose(t, live, curScore != null ? curScore : null);
            if (res) { closeList.push({ side, trade: t, ...res }); return false; }
            return true;
          });
          const existingSymbols = new Set(stillOpen.map((t) => t.symbol));
          const need = PER_SIDE - stillOpen.length;
          // 跳過 10 分鐘內剛撤銷的幣種，避免立刻補回同一支
          const now = Date.now();
          const isRecentlyCancelled = (sym) => {
            const ts = cancelledRef.current[sym];
            return ts && (now - ts) < 10 * 60 * 1000;
          };
          const newOnes = fresh.filter((t) => !existingSymbols.has(t.symbol) && !isRecentlyCancelled(t.symbol)).slice(0, Math.max(0, need)).map((t) => ({ ...t, id: `${t.symbol}-${t.ts}` }));
          return [...stillOpen, ...newOnes];
        }
        return {
          longs: processSide("longs", prev.longs, r.longs),
          shorts: processSide("shorts", prev.shorts, r.shorts),
        };
      });

      if (closeList.length > 0) {
        setClosed((prev) => {
          const add = closeList.map(({ trade, price, reason }) => computeOutcome(trade, price, reason));
          return [...add, ...prev].slice(0, 500);
        });
        closeList.forEach(({ trade, price, reason }) => {
          const win = (trade.direction === "long" ? price >= trade.entry : price <= trade.entry);
          if (onNotify) onNotify({
            symbol: trade.name || trade.symbol,
            signal: `自動平倉 · ${reason}`,
            color: reason === "止損" ? "#ef5350" : win ? "#26a69a" : "#f0b90b",
            confidence: trade.finalScore,
          });
        });
      }
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

  function clearClosed() {
    setClosed([]);
  }

  // 撤銷單：沒跟到的單直接移除，不計入回測/勝率回饋。移除後觸發掃描補齊空位。
  function cancelTrade(trade) {
    const side = trade.direction === "long" ? "longs" : "shorts";
    // 記錄剛撤銷的幣種，短時間內掃描補單時跳過它，避免立刻又補回同一支
    cancelledRef.current[trade.symbol] = Date.now();
    setData((prev) => ({ ...prev, [side]: prev[side].filter((t) => t.id !== trade.id) }));
    // 稍後自動掃描補齊（給 state 更新一點時間）
    setTimeout(() => { runScan(); }, 300);
  }

  return (
    <>
      <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>🤖 自動推薦單</div>
          <div style={{ color: "#4a5568", fontSize: 9 }}>全市場掃描 · SMC+AI共識+SNR · 自動平倉(SL/TP/評分低於40)</div>
        </div>
        <button onClick={runScan} disabled={scanning} style={{ background: scanning ? "#1a2535" : "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: scanning ? 0.5 : 1 }}>{scanning ? "掃描中..." : "↻ 重新掃描"}</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>排序：</span>
        {[["score", "評分"], ["pnl", "未實現盈虧"]].map(([id, label]) => (
          <button key={id} onClick={() => setSortMode(id)} style={{ background: sortMode === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${sortMode === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: sortMode === id ? "#58a6ff" : "#5a6b80", padding: "4px 12px", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
        ))}
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

      <RiskOverview longs={data.longs} shorts={data.shorts} livePrices={livePrices} />

      <Section title={`🟢 做多建議 (${data.longs.length}/${PER_SIDE})`} color="#26a69a" defaultOpen={true}>
        {data.longs.length === 0 && !scanning && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}><div style={{ fontSize: 22, opacity: 0.4, marginBottom: 4 }}>📭</div>暫無符合條件的做多標的</div>}
        {sortTrades(data.longs).map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onCancel={cancelTrade} onShare={(tr, lp) => setShareTarget({ trade: tr, livePrice: lp })} onSetAlert={onSetAlert} />)}
      </Section>

      <Section title={`🔴 做空建議 (${data.shorts.length}/${PER_SIDE})`} color="#ef5350" defaultOpen={true}>
        {data.shorts.length === 0 && !scanning && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}><div style={{ fontSize: 22, opacity: 0.4, marginBottom: 4 }}>📭</div>暫無符合條件的做空標的</div>}
        {sortTrades(data.shorts).map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onCancel={cancelTrade} onShare={(tr, lp) => setShareTarget({ trade: tr, livePrice: lp })} onSetAlert={onSetAlert} />)}
      </Section>

      {lastScanTs > 0 && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", textAlign: "center", padding: "4px" }}>上次掃描：{new Date(lastScanTs).toLocaleTimeString()}</div>}

      <ClosedTradesSection closed={closed} />
      <DailyBacktest closed={closed} onClear={clearClosed} />
      <WinRateFeedback closed={closed} />

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px", marginTop: 4 }}>
        <p style={{ color: "#5a6b80", marginBottom: 4 }}>說明：</p>
        <p>· 進場價=現價，SL=ATR×1.5，TP優先SNR否則ATR(2x/4x/6x)</p>
        <p>· 自動平倉：觸及SL／最終TP／重新掃描時評分掉到低於40</p>
        <p>· 平倉後移到「已結束」區並跳通知，每日回測統計當日效益</p>
      </div>

      {shareTarget && <ShareCard trade={shareTarget.trade} livePrice={shareTarget.livePrice} onClose={() => setShareTarget(null)} />}
    </>
  );
}

// 已結束單列表（可收合）
function ClosedTradesSection({ closed }) {
  if (!closed || closed.length === 0) return null;
  const fmt = (v) => v == null ? "—" : (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));
  const reasonColor = (r) => r === "止盈" ? "#26a69a" : r === "止損" ? "#ef5350" : "#f0b90b";
  return (
    <Section title={`📁 已結束 (${closed.length})`} color="#5a6b80" defaultOpen={false}>
      {closed.slice(0, 30).map((t) => {
        const isLong = t.direction === "long";
        const win = t.pnlPct >= 0;
        return (
          <div key={t.id + "-" + t.closedTs} style={{ background: "#0a1218", border: "1px solid #1a2535", borderLeft: `3px solid ${reasonColor(t.exitReason)}`, borderRadius: 6, padding: "7px 9px", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{t.name || t.symbol}</span>
              <span style={{ color: isLong ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>{isLong ? "多" : "空"}</span>
              <span style={{ color: reasonColor(t.exitReason), fontSize: 9, fontFamily: "monospace", border: `1px solid ${reasonColor(t.exitReason)}`, borderRadius: 3, padding: "0 4px" }}>{t.exitReason}</span>
              <span style={{ marginLeft: "auto", color: win ? "#26a69a" : "#ef5350", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{win ? "+" : ""}{t.pnlPct.toFixed(2)}%</span>
              <span style={{ color: win ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>({t.rMultiple >= 0 ? "+" : ""}{t.rMultiple.toFixed(2)}R)</span>
            </div>
            <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2 }}>
              進 {fmt(t.entry)} → 出 {fmt(t.exitPrice)} · {new Date(t.closedTs).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

// 每日回測：按日期統計自動推薦單的效益
function DailyBacktest({ closed, onClear }) {
  const days = useMemo(() => {
    const map = new Map();
    (closed || []).forEach((t) => {
      const d = new Date(t.closedTs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([date, trades]) => {
      const wins = trades.filter((t) => t.pnlPct >= 0);
      const totalR = trades.reduce((s, t) => s + (t.rMultiple || 0), 0);
      const totalPnl = trades.reduce((s, t) => s + (t.pnlPct || 0), 0);
      return {
        date,
        count: trades.length,
        wins: wins.length,
        losses: trades.length - wins.length,
        winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
        totalR,
        totalPnl,
      };
    });
  }, [closed]);

  return (
    <Section title="📅 每日開單回測" color="#a78bfa" defaultOpen={true}>
      {days.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>尚無已結束單，等自動推薦單觸發平倉後統計。</div>}
      {days.map((d) => (
        <div key={d.date} style={{ background: "#0a1218", border: "1px solid #1a2535", borderRadius: 6, padding: "8px 10px", marginBottom: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{d.date}</span>
            <span style={{ marginLeft: "auto", color: d.totalR >= 0 ? "#26a69a" : "#ef5350", fontSize: 12, fontFamily: "monospace", fontWeight: 800 }}>{d.totalR >= 0 ? "+" : ""}{d.totalR.toFixed(2)}R</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#8b949e", fontSize: 9, fontFamily: "monospace" }}>開單 {d.count}</span>
            <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace" }}>勝 {d.wins}</span>
            <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace" }}>負 {d.losses}</span>
            <span style={{ color: "#f0b90b", fontSize: 9, fontFamily: "monospace" }}>勝率 {d.winRate.toFixed(0)}%</span>
            <span style={{ color: d.totalPnl >= 0 ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>累積 {d.totalPnl >= 0 ? "+" : ""}{d.totalPnl.toFixed(1)}%</span>
          </div>
          <div style={{ marginTop: 5, height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${d.winRate}%`, background: "#26a69a" }} />
            <div style={{ width: `${100 - d.winRate}%`, background: "#ef5350" }} />
          </div>
        </div>
      ))}
      {days.length > 0 && (
        <button onClick={onClear} style={{ width: "100%", marginTop: 4, background: "#1a2535", border: "none", borderRadius: 5, color: "#8b949e", padding: "6px 0", fontSize: 10, fontFamily: "monospace" }}>清除回測紀錄</button>
      )}
    </Section>
  );
}

function TradeJournal({ coins, defaultSymbol, onNotify, onSetAlert }) {
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

      {journalSubTab === "auto" && <AutoTrades coins={coins} onNotify={onNotify} onSetAlert={onSetAlert} />}

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

// ═══════════ 歷史回測元件 ═══════════════════════════════════════════════════
function BacktestPanel({ item }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetMult, setTargetMult] = useState(3);
  const [error, setError] = useState(null);

  async function run() {
    if (!item || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await backtestMTF(item, { atrMult: 1.5, targetMult: Number(targetMult), maxBars: 30, minConfidence: 50 });
      if (!r) { setError("資料不足，無法回測（需足夠的 1H/4H/1D K 線）"); }
      else if (r.stats.total === 0) { setError("此區間策略未產生任何進場訊號"); setResult(r); }
      else setResult(r);
    } catch { setError("回測過程發生錯誤"); }
    setLoading(false);
  }

  const s = result?.stats;
  const fmtPct = (v) => (v >= 0 ? "+" : "") + (v || 0).toFixed(2) + "%";

  return (
    <Section title="📊 多時區策略回測" color="#a78bfa" badge="MTF" defaultOpen={false}>
      <div style={{ color: "#5a6b80", fontSize: 9, lineHeight: 1.5, marginBottom: 10 }}>
        對 {item?.symbol} 跑「1D趨勢 + 4H確認 + 1H進場 + 量能過濾」策略，模擬歷史交易績效。
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <span style={{ color: "#8b949e", fontSize: 10, fontFamily: "monospace" }}>目標倍數</span>
        {[2, 3, 4].map((m) => (
          <button key={m} onClick={() => setTargetMult(m)} style={{ background: targetMult === m ? "#0f1e2e" : "#0d1520", border: `1px solid ${targetMult === m ? "#a78bfa" : "#1a2535"}`, borderRadius: 5, color: targetMult === m ? "#a78bfa" : "#8b949e", padding: "4px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{m}R</button>
        ))}
        <button onClick={run} disabled={loading} style={{ marginLeft: "auto", background: loading ? "#1a2535" : "#a78bfa", border: "none", borderRadius: 6, color: loading ? "#8b949e" : "#000", padding: "6px 14px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{loading ? "回測中..." : "▶ 執行回測"}</button>
      </div>

      {loading && <div className="skeleton" style={{ height: 80, marginBottom: 8 }} />}
      {error && <div style={{ color: "#f0b90b", fontSize: 10, padding: "8px", background: "#1a1206", borderRadius: 6, marginBottom: 8 }}>{error}</div>}

      {s && s.total > 0 && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color: s.winRate >= 50 ? "#26a69a" : "#ef5350", fontSize: 18, fontFamily: "monospace", fontWeight: 800 }}>{s.winRate.toFixed(0)}%</div>
            <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>勝率</div>
          </div>
          <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color: s.totalPnl >= 0 ? "#26a69a" : "#ef5350", fontSize: 18, fontFamily: "monospace", fontWeight: 800 }}>{fmtPct(s.totalPnl)}</div>
            <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>總報酬</div>
          </div>
          <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color: s.profitFactor >= 1.5 ? "#26a69a" : s.profitFactor >= 1 ? "#f0b90b" : "#ef5350", fontSize: 18, fontFamily: "monospace", fontWeight: 800 }}>{s.profitFactor.toFixed(2)}</div>
            <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>獲利因子</div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 10, fontFamily: "monospace" }}>
          <span style={{ color: "#8b949e" }}>交易 {s.total}</span>
          <span style={{ color: "#26a69a" }}>勝 {s.wins}</span>
          <span style={{ color: "#ef5350" }}>負 {s.losses}</span>
          <span style={{ color: "#26a69a" }}>均盈 {fmtPct(s.avgWin)}</span>
          <span style={{ color: "#ef5350" }}>均虧 {fmtPct(s.avgLoss)}</span>
          <span style={{ color: "#f0b90b" }}>最大回撤 {s.maxDD.toFixed(1)}%</span>
        </div>

        {/* 權益曲線 */}
        {result.equity && result.equity.length > 1 && (() => {
          const eq = result.equity;
          const vals = eq.map((e) => e.cum);
          const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
          const range = max - min || 1;
          const W = 280, H = 70;
          const pts = eq.map((e, i) => {
            const x = (i / (eq.length - 1)) * W;
            const y = H - ((e.cum - min) / range) * H;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");
          const lastCum = vals[vals.length - 1];
          const lineCol = lastCum >= 0 ? "#26a69a" : "#ef5350";
          const zeroY = H - ((0 - min) / range) * H;
          return (
            <div style={{ background: "#0a1218", borderRadius: 6, padding: 8 }}>
              <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginBottom: 4 }}>累積權益曲線（%）</div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
                <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#1a2535" strokeWidth="1" strokeDasharray="3 3" />
                <polyline points={pts} fill="none" stroke={lineCol} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 3px ${lineCol}88)` }} />
              </svg>
            </div>
          );
        })()}
      </>}

      {s && s.total === 0 && !error && <div style={{ color: "#5a6b80", fontSize: 10, padding: "8px 4px" }}>此策略在歷史區間內無觸發任何交易（策略嚴格，正常現象）。</div>}

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, marginTop: 8 }}>
        <p>· SL=ATR×1.5，目標=ATR×目標倍數，最多持有30根1H K棒</p>
        <p>· 僅在1D趨勢明確、4H ADX大於20且方向一致、1H SMC訊號同向、量能足夠時進場</p>
        <p>· 獲利因子 大於1.5 佳、1~1.5 普通、小於1 虧損</p>
      </div>
    </Section>
  );
}


// ═══════════ TradingView 圖表嵌入 ═══════════════════════════════════════════
function TVChart({ symbol }) {
  const containerRef = useRef(null);
  const tvSymbol = useMemo(() => {
    if (!symbol) return "BINANCE:BTCUSDT.P";
    const name = symbol.replace("-USDT", "");
    return `BINANCE:${name}USDT.P`;
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: "60",
      timezone: "Asia/Taipei",
      theme: "dark",
      style: "1",
      locale: "zh_TW",
      backgroundColor: "rgba(13,21,32,1)",
      gridColor: "rgba(255,255,255,0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      studies: ["STD;SMA"],
      support_host: "https://www.tradingview.com",
    });
    containerRef.current.appendChild(script);
  }, [tvSymbol]);

  return (
    <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ height: 360, width: "100%" }} ref={containerRef} />
    </div>
  );
}

// ═══════════ 關注清單 storage ═══════════════════════════════════════════════
const WATCHLIST_KEY = "cryptex_watchlist_v1";
function loadWatchlist() {
  try { const r = localStorage.getItem(WATCHLIST_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveWatchlist(arr) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(arr)); } catch {}
}

// ═══════════ 到價提醒 storage ═══════════════════════════════════════════════
const ALERTS_KEY = "cryptex_price_alerts_v1";
function loadPriceAlerts() {
  try { const r = localStorage.getItem(ALERTS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function savePriceAlerts(arr) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(arr)); } catch {}
}

// ═══════════ 持倉風險總覽 ═══════════════════════════════════════════════════
function RiskOverview({ longs, shorts, livePrices }) {
  const all = [...longs, ...shorts];
  if (all.length === 0) return null;
  const nLong = longs.length, nShort = shorts.length;
  const total = all.length;
  // 集中度：多空是否嚴重失衡
  const imbalance = total > 0 ? Math.abs(nLong - nShort) / total : 0;
  // 平均未實現盈虧
  let pnlSum = 0, pnlCount = 0;
  all.forEach((t) => {
    const live = livePrices[t.symbol];
    if (live && t.entry) {
      const isLong = t.direction === "long";
      pnlSum += isLong ? ((live - t.entry) / t.entry) * 100 : ((t.entry - live) / t.entry) * 100;
      pnlCount++;
    }
  });
  const avgPnl = pnlCount > 0 ? pnlSum / pnlCount : null;
  const totalPnl = pnlCount > 0 ? pnlSum : null; // 各單盈虧%加總（等權重視角）
  // 集中度警示
  let concentLabel = "均衡", concentColor = "#26a69a";
  if (imbalance >= 0.8) { concentLabel = "嚴重偏向" + (nLong > nShort ? "做多" : "做空"); concentColor = "#ef5350"; }
  else if (imbalance >= 0.4) { concentLabel = "略偏" + (nLong > nShort ? "多" : "空"); concentColor = "#f0b90b"; }

  const longPct = total > 0 ? (nLong / total) * 100 : 50;

  return (
    <Section title="⚖️ 持倉風險總覽" color="#58a6ff" defaultOpen={true}>
      {totalPnl != null && (
        <div style={{ background: `${pnlColor(avgPnl)}14`, border: `1px solid ${pnlColor(avgPnl)}55`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, textAlign: "center" }}>
          <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginBottom: 2 }}>持倉總未實現盈虧（等權重）</div>
          <div className="mono" style={{ color: pnlColor(avgPnl), fontSize: 24, fontWeight: 800 }}>{totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}%</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
        <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
          <div style={{ color: "#c9d1d9", fontSize: 16, fontFamily: "monospace", fontWeight: 800 }}>{total}</div>
          <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>持倉數</div>
        </div>
        <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800 }}>
            <span style={{ color: "#26a69a" }}>{nLong}</span>
            <span style={{ color: "#4a5568", fontSize: 11 }}> / </span>
            <span style={{ color: "#ef5350" }}>{nShort}</span>
          </div>
          <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>多 / 空</div>
        </div>
        <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
          <div style={{ color: pnlColor(avgPnl), fontSize: 16, fontFamily: "monospace", fontWeight: 800 }}>{avgPnl == null ? "—" : (avgPnl >= 0 ? "+" : "") + avgPnl.toFixed(1) + "%"}</div>
          <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>平均盈虧</div>
        </div>
      </div>

      {/* 多空分布條 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace" }}>做多 {nLong}</span>
          <span style={{ color: concentColor, fontSize: 9, fontFamily: "monospace", fontWeight: 700 }}>{concentLabel}</span>
          <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace" }}>做空 {nShort}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: "#1a2535" }}>
          <div style={{ width: `${longPct}%`, background: "#26a69a", transition: "width .3s ease" }} />
          <div style={{ width: `${100 - longPct}%`, background: "#ef5350", transition: "width .3s ease" }} />
        </div>
      </div>

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6 }}>
        {imbalance >= 0.8 ? "⚠️ 持倉嚴重偏向單邊，方向錯誤時風險集中，建議分散或減少同向曝險。" : imbalance >= 0.4 ? "持倉略偏單邊，留意大盤反向時的連帶風險。" : "多空分布均衡，方向風險分散良好。"}
      </div>
    </Section>
  );
}

// ═══════════ 勝率回饋分析 ═══════════════════════════════════════════════════
// 從已結束單統計：不同結構/方向/評分區間的勝率，找出高勝率組合
function WinRateFeedback({ closed }) {
  const analysis = useMemo(() => {
    if (!closed || closed.length < 3) return null;
    // 依「結構」分組
    const byStructure = new Map();
    const byScoreBand = new Map();
    const byDirection = new Map();
    closed.forEach((t) => {
      const win = t.pnlPct >= 0;
      // 結構
      const struc = (t.structure || "未知").split(" ")[0];
      if (!byStructure.has(struc)) byStructure.set(struc, { w: 0, n: 0 });
      const s = byStructure.get(struc); s.n++; if (win) s.w++;
      // 評分區間
      const band = t.finalScore >= 70 ? "70+" : t.finalScore >= 50 ? "50-69" : "<50";
      if (!byScoreBand.has(band)) byScoreBand.set(band, { w: 0, n: 0 });
      const b = byScoreBand.get(band); b.n++; if (win) b.w++;
      // 方向
      const dir = t.direction === "long" ? "做多" : "做空";
      if (!byDirection.has(dir)) byDirection.set(dir, { w: 0, n: 0 });
      const d = byDirection.get(dir); d.n++; if (win) d.w++;
    });
    const toRows = (m) => Array.from(m.entries()).map(([k, v]) => ({ k, winRate: v.n ? (v.w / v.n) * 100 : 0, n: v.n })).sort((a, b) => b.winRate - a.winRate);
    return { structure: toRows(byStructure), scoreBand: toRows(byScoreBand), direction: toRows(byDirection) };
  }, [closed]);

  if (!analysis) return (
    <Section title="🎯 勝率回饋分析" color="#a78bfa" defaultOpen={false}>
      <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>需累積至少 3 筆已結束單才能分析。目前 {closed?.length || 0} 筆。</div>
    </Section>
  );

  const renderGroup = (title, rows) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "monospace", fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {rows.map((r) => (
        <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ color: "#c9d1d9", fontSize: 10, fontFamily: "monospace", minWidth: 70 }}>{r.k}</span>
          <div style={{ flex: 1, height: 5, background: "#1a2535", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${r.winRate}%`, height: "100%", background: r.winRate >= 60 ? "#26a69a" : r.winRate >= 40 ? "#f0b90b" : "#ef5350" }} />
          </div>
          <span style={{ color: r.winRate >= 60 ? "#26a69a" : r.winRate >= 40 ? "#f0b90b" : "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 700, minWidth: 38, textAlign: "right" }}>{r.winRate.toFixed(0)}%</span>
          <span style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", minWidth: 26, textAlign: "right" }}>n={r.n}</span>
        </div>
      ))}
    </div>
  );

  const best = [...analysis.structure, ...analysis.scoreBand].filter(r => r.n >= 2).sort((a, b) => b.winRate - a.winRate)[0];

  return (
    <Section title="🎯 勝率回饋分析" color="#a78bfa" defaultOpen={false}>
      {best && best.winRate >= 50 && (
        <div style={{ background: "#26a69a14", border: "1px solid #26a69a55", borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
          <span style={{ color: "#26a69a", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>💡 最高勝率組合：{best.k}（{best.winRate.toFixed(0)}%，{best.n}筆）</span>
        </div>
      )}
      {renderGroup("依市場結構", analysis.structure)}
      {renderGroup("依評分區間", analysis.scoreBand)}
      {renderGroup("依方向", analysis.direction)}
      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6 }}>樣本越多越準。勝率低於40%的組合（紅）未來可考慮避開或降低權重。</div>
    </Section>
  );
}

// ═══════════ 到價提醒卡 ═══════════════════════════════════════════════════
function PriceAlertCard({ symbol, currentPrice, alerts, onAdd, onRemove }) {
  const [target, setTarget] = useState("");
  const mine = (alerts || []).filter((a) => a.symbol === symbol);

  function submit() {
    const t = parseFloat(target);
    if (!t || !symbol) return;
    const dir = t >= currentPrice ? "above" : "below";
    onAdd(symbol, t, dir);
    setTarget("");
  }

  return (
    <Section title="🔔 到價提醒" color="#f0b90b" badge={mine.length ? `${mine.length}個` : undefined} defaultOpen={false}>
      <div style={{ display: "flex", gap: 6, marginBottom: mine.length ? 10 : 0 }}>
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`目標價（現價 ${currentPrice ? (currentPrice > 1 ? currentPrice.toFixed(4) : currentPrice.toFixed(6)) : "—"}）`} inputMode="decimal" style={{ flex: 1, background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, color: "#c9d1d9", padding: "7px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
        <button onClick={submit} style={{ background: "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "0 16px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>設定</button>
      </div>
      {mine.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a1218", border: "1px solid #1a2535", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}>
          <span style={{ color: a.dir === "above" ? "#26a69a" : "#ef5350", fontSize: 12 }}>{a.dir === "above" ? "↑" : "↓"}</span>
          <span style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{a.target}</span>
          <span style={{ color: a.fired ? "#26a69a" : "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>{a.fired ? "✓ 已觸發" : (a.dir === "above" ? "突破時通知" : "跌破時通知")}</span>
          <button onClick={() => onRemove(a.id)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#ef5350", fontSize: 14 }}>×</button>
        </div>
      ))}
      {mine.length === 0 && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 8 }}>設定目標價，價格突破/跌破時跳通知（需開啟通知）。</div>}
    </Section>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tf, setTf] = useState("1H");
  const [candles, setCandles] = useState([]);
  const [sideTab, setSideTab] = useState(() => {
    try { return localStorage.getItem("cryptex_side_tab") || "overview"; } catch { return "overview"; }
  });
  useEffect(() => { try { localStorage.setItem("cryptex_side_tab", sideTab); } catch {} }, [sideTab]);
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
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [priceAlerts, setPriceAlerts] = useState(() => loadPriceAlerts());
  const [showWatchOnly, setShowWatchOnly] = useState(false);
  const [liquidations, setLiquidations] = useState([]);

  const lastSig = useRef(null);
  const alertFiredRef = useRef({});

  // 關注清單 / 到價提醒持久化
  useEffect(() => { saveWatchlist(watchlist); }, [watchlist]);
  useEffect(() => { savePriceAlerts(priceAlerts); }, [priceAlerts]);

  function toggleWatch(sym) {
    setWatchlist((prev) => prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]);
  }
  function addPriceAlert(symbol, target, dir) {
    setPriceAlerts((prev) => [{ id: Date.now(), symbol, target, dir, created: Date.now(), fired: false }, ...prev]);
  }
  function removePriceAlert(id) {
    setPriceAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  // 到價提醒監控：每次 coins 更新檢查
  useEffect(() => {
    if (!coins || !coins.length || !priceAlerts.length) return;
    priceAlerts.forEach((a) => {
      if (a.fired) return;
      const c = coins.find((x) => x.symbol === a.symbol || x.name === a.symbol.replace("-USDT", ""));
      if (!c) return;
      const hit = a.dir === "above" ? c.price >= a.target : c.price <= a.target;
      if (hit && !alertFiredRef.current[a.id]) {
        alertFiredRef.current[a.id] = true;
        setPriceAlerts((prev) => prev.map((x) => x.id === a.id ? { ...x, fired: true } : x));
        const p = { signal: `到價提醒 ${a.dir === "above" ? "↑" : "↓"} ${a.target}`, color: "#f0b90b", symbol: a.symbol, ts: Date.now(), confidence: 0 };
        setNotif(p);
        if (notifOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification(`🔔 ${a.symbol} 到價`, { body: `${a.dir === "above" ? "突破" : "跌破"} ${a.target}（現價 ${c.price}）` }); } catch {}
        }
        setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins, priceAlerts]);

  const filtered = useMemo(() => {
    let base = coins;
    if (showWatchOnly) base = coins.filter((c) => watchlist.includes(c.symbol));
    if (!search) return base;
    const q = search.toUpperCase();
    return base.filter((c) => c.name.toUpperCase().includes(q) || (c.symbol || "").toUpperCase().includes(q) || (c.label || "").toUpperCase().includes(q));
  }, [search, coins, showWatchOnly, watchlist]);
  const visibleList = useMemo(() => (search || showWatchOnly) ? filtered : filtered.slice(0, listLimit), [filtered, search, showWatchOnly, listLimit]);

  // 載入加密貨幣列表
  const coinCountRef = useRef(0);
  useEffect(() => {
    let cancel = false;
    async function run() {
      const list = await loadMarket("crypto");
      if (cancel || !Array.isArray(list)) return;
      // 保底：若已有清單，且這次抓到的數量明顯偏少（< 現有 70%），判定為不完整，保留舊清單
      const prevCount = coinCountRef.current;
      if (prevCount > 0 && list.length > 0 && list.length < prevCount * 0.7) {
        // 不更新 coins，只更新狀態提示
        setStatus(`${prevCount} 商品 · 即時`);
        return;
      }
      if (list.length === 0) {
        // 完全沒抓到就維持現狀
        if (prevCount === 0) setStatus("來源連線中");
        return;
      }
      coinCountRef.current = list.length;
      setCoins(list);
      setStatus(`${list.length} 商品 · 即時`);
      setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null);
    }
    run();
    if (search) return () => { cancel = true; };
    const iv = setInterval(run, 30000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // 金十快訊
  useEffect(() => {
    let cancel = false;
    async function run() { const r = await loadJin10Flash(); if (!cancel) setJ10flash(r); }
    run(); const iv = setInterval(run, 60000);
    return () => { cancel = true; clearInterval(iv); };
  }, []);

  // 大額爆倉即時流（全市場強平，門檻 5 萬鎂）
  useEffect(() => {
    const off = subscribeLiquidations((liq) => {
      setLiquidations((prev) => [liq, ...prev].slice(0, 60));
      // 超大額（50萬鎂以上）跳通知
      if (liq.usd >= 500000 && notifOn) {
        const p = { signal: `💥 大額爆倉 ${liq.side === "long" ? "多單" : "空單"} $${(liq.usd / 1e6).toFixed(2)}M`, color: liq.side === "long" ? "#ef5350" : "#26a69a", symbol: liq.symbol, ts: Date.now(), confidence: 0 };
        setNotif(p);
        setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
      }
    }, 50000);
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOn]);

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

  // 通用橫幅通知（給自動平倉等使用）
  function pushNotif({ symbol, signal, color, confidence }) {
    const p = { signal, color, symbol, ts: Date.now(), confidence };
    setNotif(p);
    if (notifOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(`🔔 ${symbol}`, { body: signal }); } catch {}
    }
    setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
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
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.skeleton{border-radius:8px;background:linear-gradient(90deg,#0d1520 25%,#1a2535 50%,#0d1520 75%);background-size:200% 100%;animation:shimmer 1.6s linear infinite}
@keyframes staggerIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.stagger-item{animation:staggerIn .4s ease backwards}
.stagger-item:nth-child(1){animation-delay:.02s}
.stagger-item:nth-child(2){animation-delay:.06s}
.stagger-item:nth-child(3){animation-delay:.10s}
.stagger-item:nth-child(4){animation-delay:.14s}
.stagger-item:nth-child(5){animation-delay:.18s}
.stagger-item:nth-child(6){animation-delay:.22s}
.stagger-item:nth-child(7){animation-delay:.26s}
.stagger-item:nth-child(8){animation-delay:.30s}
.stagger-item:nth-child(n+9){animation-delay:.34s}`}</style>

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
        {!isMobile && (() => {
          const btc = coins.find((c) => c.name === "BTC");
          const eth = coins.find((c) => c.name === "ETH");
          const liqTotal = liquidations.reduce((s, l) => s + l.usd, 0);
          const Chip = ({ label, value, color }) => (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span className="mono" style={{ color: "#4a5568", fontSize: 8 }}>{label}</span>
              <span className="mono" style={{ color: color || "#c9d1d9", fontSize: 11, fontWeight: 700 }}>{value}</span>
            </div>
          );
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 20, paddingLeft: 20, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
              {btc && <Chip label="BTC" value={`$${btc.price >= 1000 ? (btc.price / 1000).toFixed(2) + "K" : btc.price.toFixed(0)}`} color={(btc.change || 0) >= 0 ? "#26a69a" : "#ef5350"} />}
              {eth && <Chip label="ETH" value={`$${eth.price.toFixed(0)}`} color={(eth.change || 0) >= 0 ? "#26a69a" : "#ef5350"} />}
              {liqTotal > 0 && <Chip label="近期爆倉" value={liqTotal >= 1e6 ? `$${(liqTotal / 1e6).toFixed(1)}M` : `$${(liqTotal / 1e3).toFixed(0)}K`} color="#f0b90b" />}
            </div>
          );
        })()}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}>
          {smc && (smc.signal.includes("做多") || smc.signal.includes("做空")) && <span className="mono breathe" style={{ color: smc.color, fontSize: 10, fontWeight: 700, border: `1px solid ${smc.color}`, borderRadius: 5, padding: "2px 7px", boxShadow: `0 0 12px -3px ${smc.color}` }}>{smc.signal}</span>}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950", boxShadow: "0 0 8px #3fb950" }} />
          <span className="mono" style={{ color: "#5a6b80", fontSize: 9 }}>{status}</span>
        </div>
      </div>

      {/* 手機版：商品列表 chips（橫向） */}
      {isMobile && <div style={{ background: "#080d14", borderBottom: "1px solid #1a2535", flexShrink: 0 }}>
        <div style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
          <div style={{ flex: 1 }}><SearchInput key="search-box" value={search} onChange={setSearch} /></div>
          <button onClick={() => setShowWatchOnly((v) => !v)} style={{ flexShrink: 0, background: showWatchOnly ? "#1a1a0a" : "#0d1520", border: `1px solid ${showWatchOnly ? "#f0b90b" : "#1a2535"}`, borderRadius: 5, color: showWatchOnly ? "#f0b90b" : "#5a6b80", padding: "0 12px", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{showWatchOnly ? "★" : "☆"}{watchlist.length > 0 ? watchlist.length : ""}</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 8px 8px" }}>
          {visibleList.map((coin) => {
            const live = coins.find((c) => c.symbol === coin.symbol) || coin;
            const active = selected?.symbol === coin.symbol;
            return (
              <button key={coin.symbol} onClick={() => setSelected(live)} style={{ flexShrink: 0, background: active ? "#0f1e2e" : "#0d1520", border: `1px solid ${active ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, minWidth: 82, alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                  <span style={{ color: active ? "#e6edf3" : "#8b949e", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{coin.name}</span>
                  <span onClick={(e) => { e.stopPropagation(); toggleWatch(coin.symbol); }} style={{ marginLeft: "auto", color: watchlist.includes(coin.symbol) ? "#f0b90b" : "#3a4658", fontSize: 11, cursor: "pointer" }}>{watchlist.includes(coin.symbol) ? "★" : "☆"}</span>
                </div>
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
            <button onClick={() => setShowWatchOnly((v) => !v)} style={{ width: "100%", marginTop: 6, background: showWatchOnly ? "#1a1a0a" : "#0d1520", border: `1px solid ${showWatchOnly ? "#f0b90b" : "#1a2535"}`, borderRadius: 5, color: showWatchOnly ? "#f0b90b" : "#5a6b80", padding: "5px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{showWatchOnly ? "★ 只看關注" : "☆ 全部商品"} ({watchlist.length})</button>
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
                  <span onClick={(e) => { e.stopPropagation(); toggleWatch(coin.symbol); }} style={{ color: watchlist.includes(coin.symbol) ? "#f0b90b" : "#3a4658", fontSize: 13, flexShrink: 0, cursor: "pointer", padding: "0 2px" }}>{watchlist.includes(coin.symbol) ? "★" : "☆"}</span>
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
                <span className="mono" style={{ fontSize: 24, fontWeight: 700, color: up ? "#3dd9c4" : "#ff8a87", transition: "color .3s ease" }}>${fmtPr(displayPrice)}</span>
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
              <TVChart symbol={selected?.symbol} />
              <PriceAlertCard symbol={selected?.symbol} currentPrice={displayPrice} alerts={priceAlerts} onAdd={addPriceAlert} onRemove={removePriceAlert} />
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
              <TradeJournal coins={coins} defaultSymbol={selected?.symbol} onNotify={pushNotif} onSetAlert={(t) => { addPriceAlert(t.symbol, t.entry, t.direction === "long" ? "below" : "above"); pushNotif({ symbol: t.symbol, signal: `已設到價提醒 @ ${t.entry}`, color: "#f0b90b", confidence: 0 }); }} />
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
              <BacktestPanel item={selected} />
            </>}

            {/* 掃描（推薦/警報/爆發） */}
            {sideTab === "scan" && <>
              {/* 子標籤 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[["recs", "🎯 推薦"], ["alerts", "⚡ 警報"], ["explosive", "🚀 爆發"], ["liq", "💥 爆倉"]].map(([id, label]) => (
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
                    <button key={r.symbol} className="stagger-item lift" onClick={() => { const c = coins.find((x) => x.symbol === r.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: "7px 8px", marginBottom: 4, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 60 }}>{r.name}</span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${r.confidence}%`, height: "100%", background: "#26a69a" }} /></div>
                        <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2, display: "flex", gap: 6 }}>
                          <span>{r.structure.split(" ")[0]}</span>
                          {r.price != null && <span style={{ color: "#5a6b80" }}>${r.price > 1 ? r.price.toFixed(3) : r.price.toFixed(5)}</span>}
                          {r.change != null && <span style={{ color: r.change >= 0 ? "#26a69a" : "#ef5350" }}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</span>}
                        </div>
                      </div>
                      <span style={{ color: "#26a69a", fontSize: 10, fontFamily: "monospace", fontWeight: 700, minWidth: 50, textAlign: "right" }}>{r.signal}</span>
                      <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>{r.confidence}%</span>
                    </button>
                  ))}
                </Section>
                <Section title={`🔴 適合做空 (${recs.shorts.length})`} color="#ef5350">
                  {recs.shorts.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無明確做空訊號</div>}
                  {recs.shorts.map((r) => (
                    <button key={r.symbol} className="stagger-item lift" onClick={() => { const c = coins.find((x) => x.symbol === r.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: "7px 8px", marginBottom: 4, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 60 }}>{r.name}</span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${r.confidence}%`, height: "100%", background: "#ef5350" }} /></div>
                        <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2, display: "flex", gap: 6 }}>
                          <span>{r.structure.split(" ")[0]}</span>
                          {r.price != null && <span style={{ color: "#5a6b80" }}>${r.price > 1 ? r.price.toFixed(3) : r.price.toFixed(5)}</span>}
                          {r.change != null && <span style={{ color: r.change >= 0 ? "#26a69a" : "#ef5350" }}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</span>}
                        </div>
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
                          <button key={ex.symbol} className="stagger-item lift" onClick={() => { const c = coins.find(x => x.symbol === ex.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`, borderRadius: 6, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
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
                  <p>· OI 暴增 超過5% → +15</p>
                  <p>· Funding 極值 → +20</p>
                  <p>· 布林帶擠壓（能量蓄積）→ +20</p>
                  <p>· 成交量暴增 2 倍以上 → +10</p>
                  <p>· SMC 方向確認 → +10~20</p>
                  <p>· 貼近SNR支撐/壓力 → +10</p>
                </div>
              </>}

              {/* 大額爆倉子頁 */}
              {alertSubTab === "liq" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>💥 全市場大額爆倉</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>Binance 即時強平流 · 門檻 $50K · 超過 $500K 跳通知</div>
                </div>
                <Section title={`即時爆倉 (${liquidations.length})`} color="#ef5350" badge="LIVE" defaultOpen={true}>
                  {liquidations.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "16px 4px", textAlign: "center" }}>等待大額爆倉中...（連線後即時推送）</div>}
                  {liquidations.map((liq, i) => {
                    const isLongLiq = liq.side === "long";
                    const col = isLongLiq ? "#ef5350" : "#26a69a";
                    const usdStr = liq.usd >= 1e6 ? "$" + (liq.usd / 1e6).toFixed(2) + "M" : "$" + (liq.usd / 1e3).toFixed(0) + "K";
                    return (
                      <button key={`${liq.symbol}-${liq.ts}-${i}`} className="fade-in lift" onClick={() => { const c = coins.find((x) => x.symbol === liq.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`, borderRadius: 6, padding: "7px 10px", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
                        <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 56 }}>{liq.name}</span>
                        <span style={{ color: col, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{isLongLiq ? "多單爆倉" : "空單爆倉"}</span>
                        <span style={{ marginLeft: "auto", color: col, fontSize: 12, fontFamily: "monospace", fontWeight: 800 }}>{usdStr}</span>
                        <span style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", minWidth: 44, textAlign: "right" }}>{new Date(liq.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      </button>
                    );
                  })}
                </Section>
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px" }}>
                  <p style={{ color: "#5a6b80", marginBottom: 4 }}>判讀：</p>
                  <p>· <span style={{ color: "#ef5350" }}>多單爆倉</span>：價格下殺，多頭被強制平倉（可能加速下跌或見底）</p>
                  <p>· <span style={{ color: "#26a69a" }}>空單爆倉</span>：價格急拉，空頭被強制平倉（可能軋空或見頂）</p>
                  <p>· 大量同向爆倉常出現在行情轉折或瀑布,可搭配SMC訊號判斷</p>
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
