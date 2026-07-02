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

// 價格依幣值自動決定小數位
function fmtPrice(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(7);
}
// 大數字加千分位/單位
function fmtNum(v) {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return Math.round(v).toLocaleString("en-US");
}

// 統一空狀態
function EmptyState({ icon = "📭", text, hint }) {
  return (
    <div style={{ color: "#4a5568", fontSize: 11, padding: "24px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 26, opacity: 0.35, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: "#5a6b80" }}>{text}</div>
      {hint && <div style={{ color: "#3a4658", fontSize: 9, marginTop: 4 }}>{hint}</div>}
    </div>
  );
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
// ═══════════ 弧形儀表 ═══════════════════════════════════════════════════════
function Gauge({ value, label, color, size = 70 }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = size / 2 - 7;
  const cx = size / 2, cy = size / 2;
  const startAng = 135, sweepAng = 270;
  const polar = (ang) => {
    const a = (ang - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [sx, sy] = polar(startAng);
  const [ex, ey] = polar(startAng + sweepAng);
  const largeArc = sweepAng > 180 ? 1 : 0;
  const [vx, vy] = polar(startAng + sweepAng * (v / 100));
  const valArc = sweepAng * (v / 100) > 180 ? 1 : 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" />
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${valArc} 1 ${vx} ${vy}`} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color}88)`, transition: "all .7s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="mono" style={{ color, fontSize: size > 60 ? 16 : 13, fontWeight: 800, lineHeight: 1 }}>{Math.round(v)}</span>
        {label && <span className="mono" style={{ color: "#5a6b80", fontSize: 8, marginTop: 1 }}>{label}</span>}
      </div>
    </div>
  );
}

// ═══════════ 多時間框架分析（合併：共振對照 + 各週期結構 + 當前市場結構）═══════
function MTFAnalysis({ smcMulti, smc }) {
  const [openTf, setOpenTf] = useState(null);
  const valid = (smcMulti || []).filter((m) => m.result);
  if (valid.length === 0 && !smc) return null;
  const longs = valid.filter((m) => m.result.signal.includes("做多")).length;
  const shorts = valid.filter((m) => m.result.signal.includes("做空")).length;
  let consensus = "分歧", consColor = "#f0b90b";
  if (longs >= 3) { consensus = "多頭共振"; consColor = "#26a69a"; }
  else if (shorts >= 3) { consensus = "空頭共振"; consColor = "#ef5350"; }
  else if (longs > shorts) { consensus = "偏多"; consColor = "#5fc9a8"; }
  else if (shorts > longs) { consensus = "偏空"; consColor = "#f0908e"; }

  const dot = (r) => {
    if (!r) return { c: "#3a4658", t: "—" };
    if (r.signal.includes("強力做多")) return { c: "#1f9b7a", t: "▲▲" };
    if (r.signal.includes("做多")) return { c: "#26a69a", t: "▲" };
    if (r.signal.includes("強力做空")) return { c: "#c0392b", t: "▼▼" };
    if (r.signal.includes("做空")) return { c: "#ef5350", t: "▼" };
    return { c: "#787b86", t: "•" };
  };

  const openItem = valid.find((m) => m.tf === openTf);

  return (
    <Section title="🔭 多時間框架分析" color={consColor} badge={consensus} defaultOpen={true}>
      {/* 共振對照矩陣（點格子展開該週期細節） */}
      <div style={{ display: "flex", gap: 6 }}>
        {valid.map(({ tf: t, result: r }) => {
          const d = dot(r);
          const active = openTf === t;
          return (
            <button key={t} onClick={() => setOpenTf(active ? null : t)} style={{ flex: 1, background: active ? `${d.c}28` : `${d.c}14`, border: `1px solid ${active ? d.c : d.c + "44"}`, borderRadius: 8, padding: "8px 4px", textAlign: "center", cursor: "pointer", transition: "all .2s ease", transform: active ? "translateY(-2px)" : "none" }}>
              <div className="mono" style={{ color: "#8b949e", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{t}</div>
              <div style={{ color: d.c, fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{d.t}</div>
              <div className="mono" style={{ color: d.c, fontSize: 8, marginTop: 3 }}>{r ? r.confidence + "%" : ""}</div>
            </button>
          );
        })}
      </div>
      <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginTop: 8, textAlign: "center" }}>
        {longs} 個週期偏多 · {shorts} 個週期偏空 · {consensus}
        {valid.length > 0 && <span style={{ color: "#3a4658" }}> · 點週期看細節</span>}
      </div>

      {/* 點選某週期後展開的該週期細節 */}
      {openItem && openItem.result && (() => {
        const r = openItem.result;
        const col = dot(r).c;
        return (
          <div style={{ marginTop: 8, background: `${col}10`, border: `1px solid ${col}44`, borderRadius: 8, padding: "10px 12px", animation: "fadeUp .25s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="mono" style={{ color: "#c9d1d9", fontSize: 12, fontWeight: 800 }}>{openItem.tf} 週期</span>
              <span className="mono" style={{ color: col, fontSize: 11, fontWeight: 700 }}>{r.signal}</span>
              <span className="mono" style={{ marginLeft: "auto", color: col, fontSize: 11, fontWeight: 700 }}>{r.confidence}%</span>
            </div>
            <IndRow label="市場結構" value={r.structure} color={r.structure.includes("上升") ? "#26a69a" : r.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
            {r.sweep && <IndRow label="流動性掃單" value={r.sweep} color="#f0e68c" />}
            {r.fvg && <IndRow label="FVG 失衡" value={r.fvg.type === "bull" ? "多頭缺口" : "空頭缺口"} color={r.fvg.type === "bull" ? "#26a69a" : "#ef5350"} />}
            {r.ob && <IndRow label="訂單塊 OB" value={r.ob.type === "bull" ? "多頭OB" : "空頭OB"} color={r.ob.type === "bull" ? "#26a69a" : "#ef5350"} />}
            {r.snr && (r.snr.support || r.snr.resistance) && (
              <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {r.snr.resistance ? `壓力 ${fmtPrice(r.snr.resistance.price)} (+${r.snr.resistance.dist.toFixed(2)}%)` : "—"}
                {" · "}
                {r.snr.support ? `支撐 ${fmtPrice(r.snr.support.price)} (-${r.snr.support.dist.toFixed(2)}%)` : "—"}
              </div>
            )}
          </div>
        );
      })()}

      {/* 當前選定週期的市場結構（永遠顯示，作為主時框細節） */}
      {smc && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ color: "#58a6ff", fontSize: 10, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>當前週期市場結構</div>
          <IndRow label="當前結構" value={smc.structure} color={smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
          <IndRow label="流動性掃單" value={smc.sweep || "無"} color={smc.sweep ? "#f0e68c" : "#4a5568"} />
          <IndRow label="FVG 失衡" value={smc.fvg ? (smc.fvg.type === "bull" ? "多頭缺口" : "空頭缺口") : "無"} color={smc.fvg ? (smc.fvg.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
          <IndRow label="訂單塊 OB" value={smc.ob ? (smc.ob.type === "bull" ? "多頭OB" : "空頭OB") : "無"} color={smc.ob ? (smc.ob.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
        </div>
      )}
    </Section>
  );
}

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

      {(() => {
        // 進場時機提示：依方向與 SNR 距離判斷追高/追空風險或理想進場
        const isLong = smc.signal.includes("做多");
        const isShort = smc.signal.includes("做空");
        if (!isLong && !isShort || !smc.snr) return null;
        let tip = null, tColor = "#f0b90b", tIcon = "⏱️";
        if (isLong) {
          const supDist = smc.snr.support?.dist;
          const resDist = smc.snr.resistance?.dist;
          if (supDist != null && supDist < 1) { tip = "貼近支撐，做多風險報酬較佳"; tColor = "#26a69a"; tIcon = "✅"; }
          else if (resDist != null && resDist < 0.8) { tip = "逼近壓力，追高風險高，可等回踩"; tColor = "#ef5350"; tIcon = "⚠️"; }
          else if (supDist != null && supDist > 4) { tip = "已遠離支撐，追高風險，建議等回踩再進"; tColor = "#ef8e53"; tIcon = "⚠️"; }
          else tip = "處於區間中段，可分批進場或等更好價位";
        } else {
          const resDist = smc.snr.resistance?.dist;
          const supDist = smc.snr.support?.dist;
          if (resDist != null && resDist < 1) { tip = "貼近壓力，做空風險報酬較佳"; tColor = "#26a69a"; tIcon = "✅"; }
          else if (supDist != null && supDist < 0.8) { tip = "逼近支撐，追空風險高，可等反彈"; tColor = "#ef5350"; tIcon = "⚠️"; }
          else if (resDist != null && resDist > 4) { tip = "已遠離壓力，追空風險，建議等反彈再進"; tColor = "#ef8e53"; tIcon = "⚠️"; }
          else tip = "處於區間中段，可分批進場或等更好價位";
        }
        return (
          <div style={{ background: `${tColor}12`, border: `1px solid ${tColor}44`, borderRadius: 8, padding: "8px 10px", marginTop: 4 }}>
            <span style={{ color: tColor, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{tIcon} 進場時機：{tip}</span>
          </div>
        );
      })()}

    </div>
  );
}

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

// ═══════════ 全域設定 ═══════════════════════════════════════════════════════
const SETTINGS_KEY = "cryptex_settings_v1";
const DEFAULT_SETTINGS = {
  autoScanMins: 5,
  scoreCloseConfirm: true,
  scoreCloseTh: 40,
  scoreConsecutive: 2,
  scoreFilterTh: 40,
  scanTopN: 0,
  soundOn: false,
  displayMode: "normal",
  perSide: 5,
  // 自訂平倉 %：null 表示不在該 TP 平倉，全部空白時等同舊版（TP3 才全平）
  tpClosePct1: null,
  tpClosePct2: null,
  tpClosePct3: null,
};
function loadSettings() {
  try { const r = localStorage.getItem(SETTINGS_KEY); return r ? { ...DEFAULT_SETTINGS, ...JSON.parse(r) } : { ...DEFAULT_SETTINGS }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ═══════════ 自動推薦單（系統自動掃描+建單+監控） ═══════════════════════════
const AUTO_TRADES_KEY = "cryptex_auto_trades_v1";
const AUTO_TRADES_TS_KEY = "cryptex_auto_trades_ts_v1";
const AUTO_CLOSED_KEY = "cryptex_auto_closed_v1";
const TRADES_KEY = "cryptex_journal_trades_v1";

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

// 日誌同步：只在新單加入時執行（不是每次 closed 陣列變都跑）
function syncNewClosedToJournal(newlyClosed) {
  if (!newlyClosed || newlyClosed.length === 0) return;
  try {
    const journal = JSON.parse(localStorage.getItem(TRADES_KEY) || "[]");
    const existingIds = new Set(journal.map((j) => j.id));
    let added = false;
    newlyClosed.forEach((t) => {
      if (!existingIds.has(t.id) && t.exitReason) {
        journal.push({
          id: t.id,
          symbol: t.symbol,
          name: t.name,
          direction: t.direction === "long" ? "做多" : "做空",
          entry: t.entry,
          exitPrice: t.exitPrice,
          pnl: (t.pnlPct ?? 0).toFixed(2),
          rMultiple: t.rMultiple != null ? t.rMultiple.toFixed(2) : "—",
          reason: t.exitReason,
          ts: t.closedTs,
          status: "closed",
          autoGenerated: true,
        });
        added = true;
      }
    });
    if (added) localStorage.setItem(TRADES_KEY, JSON.stringify(journal));
  } catch {}
}
function loadAutoTradesTs() {
  try { return parseInt(localStorage.getItem(AUTO_TRADES_TS_KEY) || "0", 10); } catch { return 0; }
}
function saveAutoTradesTs(ts) {
  try { localStorage.setItem(AUTO_TRADES_TS_KEY, String(ts)); } catch {}
}

const AutoTradeCard = memo(function AutoTradeCard({ trade, livePrice, onCancel, onShare, onSetAlert, onManualClose }) {
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

  const tps = [["TP1", trade.tp1, trade.tp1Closed], ["TP2", trade.tp2, trade.tp2Closed], ["TP3", trade.tp3, trade.tp3Closed]].filter(([, v]) => v != null);
  const activeTps = tps.filter(([, v, closed]) => !closed);
  const hitActiveTps = activeTps.filter(([, v]) => tpHit(v));
  const finished = slHit() || activeTps.length === 0; // 分批：所有TP都平或SL才finished

  let statusBadge = null;
  if (slHit()) statusBadge = { label: "止損 SL", color: "#ef5350" };
  else if (hitActiveTps.length > 0) statusBadge = { label: `${hitActiveTps[hitActiveTps.length - 1][0]} 達成`, color: "#26a69a" };
  else if (tps.length > activeTps.length) statusBadge = { label: `已平${tps.length - activeTps.length}/${tps.length}`, color: "#f0b90b" }; // 分批已平

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
        <>
          <button onClick={() => { if (livePrice != null) onManualClose && onManualClose(trade, livePrice); }} disabled={livePrice == null} style={{ width: "100%", marginTop: 6, background: pnlPct == null ? "#0d1520" : pnlPct >= 0 ? "#0e1f1a" : "#1f1212", border: `1px solid ${pnlPct == null ? "#1a2535" : pnlPct >= 0 ? "#26a69a" : "#ef5350"}55`, borderRadius: 5, color: pnlPct == null ? "#4a5568" : pnlPct >= 0 ? "#26a69a" : "#ef5350", padding: "6px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700, opacity: livePrice == null ? 0.5 : 1 }}>💰 手動平倉{pnlPct != null ? `（現價 ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%）` : "（等待報價）"}</button>
          <button onClick={() => onCancel && onCancel(trade)} style={{ width: "100%", marginTop: 6, background: "transparent", border: "1px solid #3a4658", borderRadius: 5, color: "#5a6b80", padding: "5px 0", fontSize: 10, fontFamily: "monospace" }}>撤銷此單（沒跟到，不計入回測）</button>
        </>
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

// 評估某張單在現價下是否該平倉。settings 可選，若提供則使用自訂平倉 %
function evalClose(trade, livePrice, settings) {
  if (livePrice == null) return null;
  const isLong = trade.direction === "long";
  const slHit = isLong ? livePrice <= trade.sl : livePrice >= trade.sl;
  if (slHit) return { price: trade.sl, reason: "止損" };

  // 讀取自訂 %（settings 沒提供時全部視為 null = 預設行為）
  const pct1 = settings?.tpClosePct1 ?? null;
  const pct2 = settings?.tpClosePct2 ?? null;
  const pct3 = settings?.tpClosePct3 ?? null;
  // 三個都未設 → 預設行為：TP3 觸發才全平（舊版相容）
  const allUnset = pct1 == null && pct2 == null && pct3 == null;

  // TP1
  if (trade.tp1 != null && !trade.tp1Closed && pct1 != null) {
    const tp1Hit = isLong ? livePrice >= trade.tp1 : livePrice <= trade.tp1;
    if (tp1Hit) return { price: trade.tp1, reason: `止盈 TP1(平${pct1}%)`, partialClose: "tp1", closePct: pct1 };
  }
  // TP2
  if (trade.tp2 != null && !trade.tp2Closed && pct2 != null) {
    const tp2Hit = isLong ? livePrice >= trade.tp2 : livePrice <= trade.tp2;
    if (tp2Hit) return { price: trade.tp2, reason: `止盈 TP2(平${pct2}%)`, partialClose: "tp2", closePct: pct2 };
  }
  // TP3：未設或 allUnset 時預設為 100%（全平）
  if (trade.tp3 != null && !trade.tp3Closed) {
    const tp3Hit = isLong ? livePrice >= trade.tp3 : livePrice <= trade.tp3;
    if (tp3Hit) {
      const finalPct = pct3 != null ? pct3 : (allUnset ? 100 : null);
      if (finalPct != null) {
        return { price: trade.tp3, reason: `止盈 TP3${finalPct === 100 ? "" : `(平${finalPct}%)`}`, partialClose: "tp3", closePct: finalPct };
      }
    }
  }
  return null;
}

// 異常偵測：監控連續虧損、時段虧損、24H總虧損
function detectAnomalies(closed, settings, pushNotif) {
  if (!closed || closed.length < 3) return;
  // 1. 連續虧損檢測（最近5單）
  const last5 = closed.slice(0, 5);
  const losses = last5.filter(t => t.pnlPct < 0).length;
  if (losses >= 4) {
    pushNotif({
      symbol: "SYSTEM",
      signal: `⚠️ 最近5單連虧${losses}次，勝率低迷，建議檢視策略或暫停`,
      color: "#ef5350",
      confidence: 0,
      sound: "liq"
    });
  }
  // 2. 時段虧損（按進場時間分組）
  const byHour = {};
  closed.slice(0, 20).forEach(t => {
    if (!t.ts) return;
    const h = new Date(t.ts).getHours();
    if (!byHour[h]) byHour[h] = { wins: 0, losses: 0 };
    if (t.pnlPct >= 0) byHour[h].wins++;
    else byHour[h].losses++;
  });
  Object.entries(byHour).forEach(([h, stats]) => {
    if (stats.losses >= 3 && stats.losses > stats.wins) {
      pushNotif({
        symbol: "SYSTEM",
        signal: `📍 ${h}時進場連虧${stats.losses}次，此時段可能黑名單`,
        color: "#f0b90b",
        confidence: 0
      });
    }
  });
  // 3. 24H虧損總額
  const day1 = closed.filter(t => t.closedTs && Date.now() - t.closedTs < 24 * 60 * 60 * 1000);
  const dayPnl = day1.reduce((s, t) => s + (t.pnlPct || 0), 0);
  if (dayPnl < -30 && day1.length >= 3) {
    pushNotif({
      symbol: "SYSTEM",
      signal: `🛑 近24H虧損${dayPnl.toFixed(1)}%，風控停止`,
      color: "#ef5350",
      confidence: 0,
      sound: "liq"
    });
  }
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

function AutoTrades({ coins, onNotify, onSetAlert, settings }) {
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
  const lowScoreCountRef = useRef({});
  const [sortMode, setSortMode] = useState("score"); // score | pnl
  const [shareTarget, setShareTarget] = useState(null);

  // 掃描排行：計算幣種出現在多個掃描的次數
  const computeScanRanking = useMemo(() => {
    const ranking = new Map();
    const addToRanking = (items, category) => {
      if (!items || !Array.isArray(items)) return;
      items.forEach(item => {
        const sym = item.symbol;
        if (!ranking.has(sym)) ranking.set(sym, { symbol: sym, name: item.name, cats: new Set(), score: 0 });
        ranking.get(sym).cats.add(category);
      });
    };
    addToRanking(data.longs, "推薦多");
    addToRanking(data.shorts, "推薦空");
    return Array.from(ranking.values())
      .map(r => ({ ...r, score: r.cats.size }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  }, [data]);

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
  const prevClosedLenRef = useRef(closed.length);
  useEffect(() => {
    saveClosedTrades(closed);
    // 只在新增時同步（避免每次 state 變都掃全表）
    if (closed.length > prevClosedLenRef.current) {
      const newOnes = closed.slice(0, closed.length - prevClosedLenRef.current);
      syncNewClosedToJournal(newOnes);
    }
    prevClosedLenRef.current = closed.length;
  }, [closed]);

  // 異常偵測（每5分鐘檢測一次）— 用 ref 避免頻繁重建 interval
  const lastAnomalyCheckRef = useRef(0);
  const closedRef = useRef(closed);
  const settingsRef = useRef(settings);
  useEffect(() => { closedRef.current = closed; }, [closed]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastAnomalyCheckRef.current > 5 * 60 * 1000) {
        try { detectAnomalies(closedRef.current, settingsRef.current, onNotify); } catch {}
        lastAnomalyCheckRef.current = Date.now();
      }
    }, 60000); // 30秒→60秒
    return () => clearInterval(t);
  }, [onNotify]);
  useEffect(() => { saveAutoTradesTs(lastScanTs); }, [lastScanTs]);

  const PER_SIDE = settings?.perSide ?? 5;

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
    if (!livePrices || Object.keys(livePrices).length === 0) return;
    const toClose = [];
    ["longs", "shorts"].forEach((side) => {
      data[side].forEach((t) => {
        const live = livePrices[t.symbol]; // O(1) 直接查
        const res = evalClose(t, live, settings);
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
      const add = toClose.map(({ trade, price, reason, partialClose }) => {
        const outcome = computeOutcome(trade, price, reason);
        if (partialClose) outcome.partialClose = partialClose;
        // 分批止盈時標記該部位為已平
        if (partialClose === "tp1") trade.tp1Closed = true;
        else if (partialClose === "tp2") trade.tp2Closed = true;
        else if (partialClose === "tp3") trade.tp3Closed = true;
        return outcome;
      });
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
      const scanCount = settings.scanTopN > 0 ? Math.min(settings.scanTopN, coins.length) : coins.length;
      const r = await scanAutoTrades(coins, scanCount, PER_SIDE, (p) => setScanProgress(p), weights);
      // 新掃描結果建立 symbol→finalScore 對照，用於評分過低平倉
      const freshScore = {};
      [...r.longs, ...r.shorts].forEach((t) => { freshScore[t.symbol] = t.finalScore; });

      const closeList = [];
      setData((prev) => {
        function processSide(side, existing, fresh) {
          const th = settings.scoreCloseTh;
          const stillOpen = existing.filter((t) => {
            const live = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""))?.price;
            // 價格觸發優先（SL/最終TP）
            const priceRes = evalClose(t, live, settings);
            if (priceRes) { closeList.push({ side, trade: t, ...priceRes }); lowScoreCountRef.current[t.id] = 0; return false; }
            // 評分平倉：根據設定的連續次數才平
            const curScore = freshScore[t.symbol];
            if (curScore != null && curScore < th) {
              if (settings.scoreCloseConfirm) {
                const cnt = (lowScoreCountRef.current[t.id] || 0) + 1;
                lowScoreCountRef.current[t.id] = cnt;
                if (cnt >= (settings.scoreConsecutive || 2)) { closeList.push({ side, trade: t, price: live, reason: "評分過低" }); return false; }
                return true;
              } else {
                closeList.push({ side, trade: t, price: live, reason: "評分過低" }); return false;
              }
            } else {
              lowScoreCountRef.current[t.id] = 0;
            }
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
          const add = closeList.map(({ trade, price, reason, partialClose }) => {
            const outcome = computeOutcome(trade, price, reason);
            if (partialClose) outcome.partialClose = partialClose;
            if (partialClose === "tp1") trade.tp1Closed = true;
            else if (partialClose === "tp2") trade.tp2Closed = true;
            else if (partialClose === "tp3") trade.tp3Closed = true;
            return outcome;
          });
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

  // 自動掃描：間隔由設定決定（0=只手動，但首次空清單仍會補滿一次）
  useEffect(() => {
    if (!coins || !coins.length) return;
    const mins = settings?.autoScanMins ?? 5;
    const needScan = () => {
      const totalSlots = data.longs.length + data.shorts.length;
      if (totalSlots === 0) return true; // 完全沒單，一定補
      if (mins <= 0) return false;       // 設為只手動，之後不自動掃
      return totalSlots < PER_SIDE * 2 || Date.now() - lastScanTs >= mins * 60 * 1000;
    };
    if (needScan()) runScan();
    if (mins <= 0) return; // 只手動模式不開定時器
    const iv = setInterval(() => { if (needScan()) runScan(); }, 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins, settings?.autoScanMins]);

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

  // 手動止盈：用現價平倉，計入回測/勝率回饋，移到已結束區。
  function manualClose(trade, livePrice) {
    if (livePrice == null) return;
    const side = trade.direction === "long" ? "longs" : "shorts";
    // 從進行中移除
    setData((prev) => ({ ...prev, [side]: prev[side].filter((t) => t.id !== trade.id) }));
    // 寫入已結束（reason = 手動止盈，會計入回測與勝率回饋）
    setClosed((prev) => [computeOutcome(trade, livePrice, "手動平倉"), ...prev].slice(0, 500));
    const win = (trade.direction === "long" ? livePrice >= trade.entry : trade.entry >= livePrice);
    if (onNotify) onNotify({
      symbol: trade.name || trade.symbol,
      signal: `手動平倉 · ${win ? "獲利" : "虧損"}出場`,
      color: win ? "#26a69a" : "#f0b90b",
      confidence: trade.finalScore,
      sound: "normal",
    });
    // 平掉後留下空位，稍後掃描補齊
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
        {data.longs.length === 0 && !scanning && <EmptyState text="暫無符合條件的做多標的" hint="等下次掃描或調整門檻" />}
        {sortTrades(data.longs).map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onCancel={cancelTrade} onManualClose={manualClose} onShare={(tr, lp) => setShareTarget({ trade: tr, livePrice: lp })} onSetAlert={onSetAlert} />)}
      </Section>

      <Section title={`🔴 做空建議 (${data.shorts.length}/${PER_SIDE})`} color="#ef5350" defaultOpen={true}>
        {data.shorts.length === 0 && !scanning && <EmptyState text="暫無符合條件的做空標的" hint="等下次掃描或調整門檻" />}
        {sortTrades(data.shorts).map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onCancel={cancelTrade} onManualClose={manualClose} onShare={(tr, lp) => setShareTarget({ trade: tr, livePrice: lp })} onSetAlert={onSetAlert} />)}
      </Section>

      {lastScanTs > 0 && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", textAlign: "center", padding: "4px" }}>上次掃描：{new Date(lastScanTs).toLocaleTimeString()}</div>}

      {/* 掃描排行（多掃描共振） */}
      {computeScanRanking.length > 0 && (
        <Section title="📊 掃描排行（共振幣種）" color="#a78bfa" defaultOpen={false}>
          <div style={{ fontSize: 9, color: "#5a6b80", marginBottom: 8, lineHeight: 1.4 }}>出現在多個掃描的幣種排行。🔥 標記：3種掃描都出現；★ 2種；● 1種。</div>
          {computeScanRanking.map((item, idx) => (
            <div key={item.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: idx < 3 ? "#0f1e2e" : "#0a1218", borderRadius: 4, marginBottom: 4 }}>
              <span style={{ color: item.score >= 3 ? "#ff6b35" : item.score >= 2 ? "#ffd700" : "#c9d1d9", fontSize: 12, fontWeight: 700, minWidth: 20 }}>
                {item.score >= 3 ? "🔥" : item.score >= 2 ? "★" : "●"}
              </span>
              <span style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 80 }}>{item.name || item.symbol}</span>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {item.cats.has("推薦多") && <span style={{ fontSize: 7, background: "#26a69a33", color: "#26a69a", padding: "1px 4px", borderRadius: 2 }}>推多</span>}
                {item.cats.has("推薦空") && <span style={{ fontSize: 7, background: "#ef535033", color: "#ef5350", padding: "1px 4px", borderRadius: 2 }}>推空</span>}
                {item.cats.has("警報") && <span style={{ fontSize: 7, background: "#f0b90b33", color: "#f0b90b", padding: "1px 4px", borderRadius: 2 }}>警報</span>}
                {item.cats.has("爆發") && <span style={{ fontSize: 7, background: "#f0906e33", color: "#f0906e", padding: "1px 4px", borderRadius: 2 }}>爆發</span>}
              </div>
              <span style={{ color: "#4a5568", fontSize: 9 }}>{item.cats.size} 掃</span>
            </div>
          ))}
        </Section>
      )}

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
  // 月度統計
  const months = useMemo(() => {
    const map = new Map();
    (closed || []).forEach((t) => {
      const d = new Date(t.closedTs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, trades]) => {
        const wins = trades.filter(t => t.pnlPct >= 0);
        const totalPnl = trades.reduce((s, t) => s + (t.pnlPct || 0), 0);
        return { month, count: trades.length, wins: wins.length, totalPnl, winRate: (wins.length / trades.length) * 100 };
      });
  }, [closed]);

  // 全年KPI
  const yearStats = useMemo(() => {
    const all = closed || [];
    const wins = all.filter(t => t.pnlPct >= 0).length;
    const totalPnl = all.reduce((s, t) => s + (t.pnlPct || 0), 0);
    const bestMonth = months.length ? [...months].sort((a, b) => b.totalPnl - a.totalPnl)[0] : null;
    return {
      total: all.length,
      wins,
      losses: all.length - wins,
      winRate: all.length ? (wins / all.length) * 100 : 0,
      totalPnl,
      bestMonth,
    };
  }, [closed, months]);

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
      {/* 全年KPI */}
      {yearStats.total > 0 && (
        <div style={{ background: "#0f1e2e", border: "1px solid #58a6ff", borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "#5a6b80", marginBottom: 6 }}>📊 全年統計</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <div><span style={{ color: "#c9d1d9", fontSize: 10, fontWeight: 700 }}>{yearStats.total}</span><span style={{ color: "#5a6b80", fontSize: 8 }}> 筆</span></div>
            <div><span style={{ color: yearStats.winRate >= 50 ? "#26a69a" : "#ef5350", fontSize: 10, fontWeight: 700 }}>{yearStats.winRate.toFixed(1)}%</span><span style={{ color: "#5a6b80", fontSize: 8 }}> 勝率</span></div>
            <div><span style={{ color: yearStats.totalPnl >= 0 ? "#26a69a" : "#ef5350", fontSize: 10, fontWeight: 700 }}>+{yearStats.totalPnl.toFixed(2)}%</span></div>
            {yearStats.bestMonth && <div style={{ fontSize: 8, color: "#4a5568" }}>{yearStats.bestMonth.month} 最強</div>}
          </div>
        </div>
      )}
      
      {/* 月度排行 */}
      {months.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "#5a6b80", marginBottom: 4, fontWeight: 700 }}>📈 月度排行</div>
          {months.slice(0, 6).map((m) => (
            <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid #111824" }}>
              <span style={{ color: "#c9d1d9", fontSize: 9, fontFamily: "monospace", minWidth: 50 }}>{m.month}</span>
              <div style={{ flex: 1, height: 3, background: "#1a2535", borderRadius: 1 }}>
                <div style={{ height: "100%", width: `${Math.max(Math.min(m.totalPnl * 5, 100), 5)}px`, background: m.totalPnl >= 0 ? "#26a69a" : "#ef5350", borderRadius: 1 }} />
              </div>
              <span style={{ color: m.totalPnl >= 0 ? "#26a69a" : "#ef5350", fontSize: 9, fontWeight: 700, minWidth: 40, textAlign: "right" }}>{m.totalPnl >= 0 ? "+" : ""}{m.totalPnl.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 每日詳細 */}
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

function TradeJournal({ coins, defaultSymbol, onNotify, onSetAlert, settings }) {
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

      {journalSubTab === "auto" && <AutoTrades coins={coins} onNotify={onNotify} onSetAlert={onSetAlert} settings={settings} />}

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

        {/* 權益曲線 + 買入持有對比 */}
        {result.equity && result.equity.length > 1 && (() => {
          const eq = result.equity;
          const vals = eq.map((e) => e.cum);
          // 買入持有：從第一筆交易到最後一筆，用各筆進出場的時間軸估算
          const bhReturn = result.trades && result.trades.length >= 2
            ? (() => {
                const first = result.trades[0];
                const last = result.trades[result.trades.length - 1];
                if (first?.entryPrice && last?.exitPrice) {
                  return ((last.exitPrice - first.entryPrice) / first.entryPrice) * 100;
                }
                return null;
              })()
            : null;
          // 買入持有等權基準線（線性從0到bhReturn）
          const bhPts = bhReturn != null ? eq.map((_, i) => {
            const bh = (i / (eq.length - 1)) * bhReturn;
            return bh;
          }) : null;
          const allVals = bhPts ? [...vals, ...bhPts] : vals;
          const min = Math.min(0, ...allVals), max = Math.max(0, ...allVals);
          const range = max - min || 1;
          const W = 280, H = 80;
          const toY = (v) => H - ((v - min) / range) * H;
          const pts = eq.map((e, i) => `${((i / (eq.length - 1)) * W).toFixed(1)},${toY(e.cum).toFixed(1)}`).join(" ");
          const bhLine = bhPts ? bhPts.map((v, i) => `${((i / (bhPts.length - 1)) * W).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") : null;
          const lastCum = vals[vals.length - 1];
          const lineCol = lastCum >= 0 ? "#26a69a" : "#ef5350";
          const zeroY = toY(0);
          return (
            <div style={{ background: "#0a1218", borderRadius: 6, padding: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>累積權益曲線（%）</span>
                {bhReturn != null && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: lineCol, fontSize: 9, fontFamily: "monospace" }}>● 策略 {lastCum >= 0 ? "+" : ""}{lastCum.toFixed(1)}%</span>
                    <span style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace" }}>● 買入持有 {bhReturn >= 0 ? "+" : ""}{bhReturn.toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
                <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#1a2535" strokeWidth="1" strokeDasharray="3 3" />
                {bhLine && <polyline points={bhLine} fill="none" stroke="#787b86" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />}
                <polyline points={pts} fill="none" stroke={lineCol} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 3px ${lineCol}88)` }} />
              </svg>
              {bhReturn != null && (
                <div style={{ color: lastCum > bhReturn ? "#26a69a" : "#ef5350", fontSize: 8, fontFamily: "monospace", marginTop: 4, textAlign: "right" }}>
                  {lastCum > bhReturn ? `策略跑贏買入持有 +${(lastCum - bhReturn).toFixed(1)}%` : `策略落後買入持有 ${(lastCum - bhReturn).toFixed(1)}%`}
                </div>
              )}
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
  // 主題集中度（僅在單數變化時重算，不隨 livePrices 變）
  const { topTheme, themeConcentRate } = useMemo(() => {
    const keywords = ["OP", "ARB", "ZKSYNC", "SCROLL", "STARKNET", "AI", "DOG", "PEPE", "MEME"];
    const themeConcentration = {};
    all.forEach((t) => {
      const upper = (t.name || t.symbol).toUpperCase();
      keywords.forEach((kw) => {
        if (upper.includes(kw)) themeConcentration[kw] = (themeConcentration[kw] || 0) + 1;
      });
    });
    const top = Object.entries(themeConcentration).sort((a, b) => b[1] - a[1])[0];
    return { topTheme: top, themeConcentRate: top ? (top[1] / total) * 100 : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [longs.length, shorts.length]);
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
        <div className={totalPnl >= 0 ? "glow-pos" : "glow-neg"} style={{ background: `${pnlColor(avgPnl)}14`, border: `1px solid ${pnlColor(avgPnl)}55`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, textAlign: "center" }}>
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

      {/* 主題集中度警示 */}
      {topTheme && themeConcentRate >= 50 && (
        <div style={{ background: "#3a1a1a", border: "1px solid #ef5350", borderRadius: 6, padding: 8, marginTop: 8, marginBottom: 8 }}>
          <div style={{ color: "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 700, marginBottom: 2 }}>⚠️ 主題集中度過高</div>
          <div style={{ color: "#f0b90b", fontSize: 9, fontFamily: "monospace" }}>{topTheme[0]} 相關佔 {themeConcentRate.toFixed(0)}%，部分敘事崩塌時風險集中。建議加入其他主題降風險。</div>
        </div>
      )}
      {(nLong >= 4 || nShort >= 4) && (
        <div style={{ color: "#f0b90b", fontSize: 9, lineHeight: 1.6, marginTop: 6, background: "#1a1206", borderRadius: 6, padding: "6px 8px" }}>
          🔗 相關性提醒：目前有 {Math.max(nLong, nShort)} 個{nLong >= nShort ? "做多" : "做空"}單。加密貨幣多數與 BTC 高度連動，這些單實際上可能是「同一個方向的賭注」，分散程度比張數看起來低。
        </div>
      )}
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
    const bySymbol = new Map(); // 新增：幣種排行
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
      // 幣種
      const sym = t.name || t.symbol;
      if (!bySymbol.has(sym)) bySymbol.set(sym, { w: 0, n: 0, pnl: 0 });
      const sy = bySymbol.get(sym); sy.n++; sy.pnl += t.pnlPct || 0; if (win) sy.w++;
    });
    const toRows = (m) => Array.from(m.entries()).map(([k, v]) => ({ k, winRate: v.n ? (v.w / v.n) * 100 : 0, n: v.n })).sort((a, b) => b.winRate - a.winRate);
    const byCoinRows = Array.from(bySymbol.entries()).map(([k, v]) => ({ k, winRate: v.n ? (v.w / v.n) * 100 : 0, n: v.n, pnl: v.pnl })).sort((a, b) => b.pnl - a.pnl);
    return { structure: toRows(byStructure), scoreBand: toRows(byScoreBand), direction: toRows(byDirection), coins: byCoinRows };
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
      
      {/* 幣種排行 */}
      {analysis.coins && analysis.coins.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "monospace", fontWeight: 700, marginBottom: 4 }}>🪙 幣種排行（累積盈虧）</div>
          {analysis.coins.slice(0, 10).map((c, idx) => (
            <div key={c.k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 9 }}>
              <span style={{ color: "#4a5568", minWidth: 16 }}>#{idx + 1}</span>
              <span style={{ color: "#c9d1d9", minWidth: 60, fontFamily: "monospace" }}>{c.k}</span>
              <div style={{ flex: 1, height: 3, background: "#1a2535", borderRadius: 1 }}>
                <div style={{ height: "100%", width: `${Math.max(Math.min(Math.abs(c.pnl), 50), 2)}px`, background: c.pnl >= 0 ? "#26a69a" : "#ef5350", borderRadius: 1 }} />
              </div>
              <span style={{ color: c.pnl >= 0 ? "#26a69a" : "#ef5350", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{c.pnl >= 0 ? "+" : ""}{c.pnl.toFixed(2)}%</span>
              <span style={{ color: "#4a5568", minWidth: 35, textAlign: "right" }}>{c.winRate.toFixed(0)}% ({c.n})</span>
            </div>
          ))}
        </div>
      )}

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

// ═══════════ 訊號歷史 storage（記錄各幣訊號變化）═══════════════════════════
const SIGHIST_KEY = "cryptex_sig_history_v1";
function loadSigHistory() {
  try { const r = localStorage.getItem(SIGHIST_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveSigHistory(h) {
  try { localStorage.setItem(SIGHIST_KEY, JSON.stringify(h)); } catch {}
}

// ═══════════ 市場總覽儀表板 ═══════════════════════════════════════════════════
function MarketOverview({ recs, liquidations, coins }) {
  // 從推薦掃描算市場多空傾向
  const nLong = recs?.longs?.length || 0;
  const nShort = recs?.shorts?.length || 0;
  const totalSig = nLong + nShort;
  const longBias = totalSig > 0 ? (nLong / totalSig) * 100 : 50;
  // 爆倉統計（多單 vs 空單）
  const liqLong = liquidations.filter((l) => l.side === "long").reduce((s, l) => s + l.usd, 0);
  const liqShort = liquidations.filter((l) => l.side === "short").reduce((s, l) => s + l.usd, 0);
  // 市場情緒溫度（綜合多空訊號 + 爆倉方向）
  let mood = 50;
  if (totalSig > 0) mood = longBias;
  if (liqLong + liqShort > 0) {
    // 多單爆倉多→市場恐慌偏空；空單爆倉多→軋空偏多
    const liqBias = liqShort / (liqLong + liqShort) * 100;
    mood = mood * 0.6 + liqBias * 0.4;
  }
  let moodLabel = "中性", moodColor = "#f0b90b";
  if (mood >= 65) { moodLabel = "偏多 / 貪婪"; moodColor = "#26a69a"; }
  else if (mood >= 55) { moodLabel = "微偏多"; moodColor = "#5fc9a8"; }
  else if (mood <= 35) { moodLabel = "偏空 / 恐懼"; moodColor = "#ef5350"; }
  else if (mood <= 45) { moodLabel = "微偏空"; moodColor = "#f0908e"; }

  const fmtUsd = (v) => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + (v / 1e3).toFixed(0) + "K";

  return (
    <Section title="🌐 市場總覽" color={moodColor} defaultOpen={true}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <Gauge value={mood} label="情緒" color={moodColor} size={76} />
        <div style={{ flex: 1 }}>
          <div style={{ color: moodColor, fontSize: 15, fontFamily: "'Sora',sans-serif", fontWeight: 800, marginBottom: 2 }}>{moodLabel}</div>
          <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", lineHeight: 1.6 }}>
            綜合掃描多空訊號與爆倉方向估算的市場情緒。僅供參考，非投資建議。
          </div>
        </div>
      </div>

      {totalSig > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace" }}>掃描偏多 {nLong}</span>
            <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace" }}>偏空 {nShort}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: "#1a2535" }}>
            <div style={{ width: `${longBias}%`, background: "#26a69a", transition: "width .4s ease" }} />
            <div style={{ width: `${100 - longBias}%`, background: "#ef5350", transition: "width .4s ease" }} />
          </div>
        </div>
      )}

      {(liqLong + liqShort) > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: "#0a1218", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ color: "#ef5350", fontSize: 8, fontFamily: "monospace" }}>多單爆倉</div>
            <div style={{ color: "#ef5350", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{fmtUsd(liqLong)}</div>
          </div>
          <div style={{ flex: 1, background: "#0a1218", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ color: "#26a69a", fontSize: 8, fontFamily: "monospace" }}>空單爆倉</div>
            <div style={{ color: "#26a69a", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{fmtUsd(liqShort)}</div>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [watchList, setWatchList] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cryptex_watch_list_v1") || "{}"); }
    catch { return {}; }
  });
  // watchList = { "BTC-USDT": ["ETH-USDT", "SOL-USDT"], ... }
  useEffect(() => {
    try { localStorage.setItem("cryptex_watch_list_v1", JSON.stringify(watchList)); }
    catch {}
  }, [watchList]);
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
  const [loadError, setLoadError] = useState(false);
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
  const [anomalies, setAnomalies] = useState([]);
  const prevExplosiveSymsRef = useRef(new Set());
  const [explosiveLoading, setExplosiveLoading] = useState(false);
  const [explosiveTs, setExplosiveTs] = useState(0);
  const [explosiveProgress, setExplosiveProgress] = useState({ done: 0, total: 0 });
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [priceAlerts, setPriceAlerts] = useState(() => loadPriceAlerts());
  const [showWatchOnly, setShowWatchOnly] = useState(false);
  const [liquidations, setLiquidations] = useState([]);
  const [settings, setSettings] = useState(() => loadSettings());
  useEffect(() => { saveSettings(settings); }, [settings]);
  const [wsEpoch, setWsEpoch] = useState(0);
  const [sigHistory, setSigHistory] = useState(() => loadSigHistory());
  useEffect(() => { saveSigHistory(sigHistory); }, [sigHistory]);
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShowSplash(false), 1600); return () => clearTimeout(t); }, []);

  // localStorage 清理：移除超過 30 天的已結束單，避免無限累積
  useEffect(() => {
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const raw = localStorage.getItem(AUTO_CLOSED_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        const kept = arr.filter((t) => (t.closedTs || 0) >= cutoff).slice(0, 500);
        if (kept.length !== arr.length) localStorage.setItem(AUTO_CLOSED_KEY, JSON.stringify(kept));
      }
    } catch {}
  }, []);

  // 頁面從背景回到前景時，重連 WebSocket（手機切App常斷線）
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") setWsEpoch((e) => e + 1); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onVis); };
  }, []);

  // 顯示模式（護眼/高對比）套到 body
  useEffect(() => {
    const mode = settings?.displayMode || "normal";
    document.body.classList.remove("eyecomfort", "hicontrast");
    if (mode === "eyecomfort") document.body.classList.add("eyecomfort");
    else if (mode === "hicontrast") document.body.classList.add("hicontrast");
  }, [settings?.displayMode]);

  // 快捷鍵：1-5 切分頁、/ 聚焦搜尋
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
      const tabs = ["overview", "indicators", "scan", "journal", "info"];
      if (e.key >= "1" && e.key <= "5") { setSideTab(tabs[parseInt(e.key, 10) - 1]); }
      else if (e.key === "/") { e.preventDefault(); const el = document.querySelector('input[placeholder*="搜尋"]'); if (el) el.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      try {
        const list = await loadMarket("crypto");
        if (cancel || !Array.isArray(list)) return;
        const prevCount = coinCountRef.current;
        if (prevCount > 0 && list.length > 0 && list.length < prevCount * 0.7) {
          setStatus(`${prevCount} 商品 · 即時`);
          setLoadError(false);
          return;
        }
        if (list.length === 0) {
          if (prevCount === 0) { setStatus("載入失敗"); setLoadError(true); }
          return;
        }
        coinCountRef.current = list.length;
        setCoins(list);
        setStatus(`${list.length} 商品 · 即時`);
        setLoadError(false);
        setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null);
      } catch {
        if (!cancel) { setStatus("連線失敗，點擊重試"); setLoadError(true); }
      }
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
        playBeep("liq");
        setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
      }
    }, 50000);
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOn, wsEpoch]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.symbol, tf]);

  // SMC（只在新 K 棒時重算）
  const lastCandleT = candles.length > 0 ? candles[candles.length - 1].t : 0;
  useEffect(() => {
    if (candles.length < 40 || !selected) { setSmc(null); return; }
    const r = analyzeSMC(candles); setSmc(r);
    if (r) {
      const isDir = r.signal.includes("做多") || r.signal.includes("做空");
      const key = `${selected.symbol}-${r.signal}`;
      const prevForSymbol = lastSig.current && lastSig.current.startsWith(`${selected.symbol}-`);
      // 記錄訊號歷史（方向訊號變化時）
      if (isDir && lastSig.current !== key) {
        setSigHistory((prev) => {
          const sym = selected.symbol;
          const list = prev[sym] ? [...prev[sym]] : [];
          const lastEntry = list[0];
          if (!lastEntry || lastEntry.signal !== r.signal) {
            list.unshift({ signal: r.signal, confidence: r.confidence, ts: Date.now() });
          }
          return { ...prev, [sym]: list.slice(0, 8) };
        });
      }
      if (isDir && notifOn && lastSig.current !== key) {
        // 首次看到這個幣種（剛切換過來）只記錄、不跳橫幅；之後訊號真的改變才跳
        const shouldBanner = prevForSymbol;
        lastSig.current = key;
        if (shouldBanner) {
          const p = { signal: r.signal, color: r.color, symbol: selected.symbol, ts: Date.now(), confidence: r.confidence };
          setNotif(p);
          playBeep(r.signal.includes("強力") ? "strong" : "normal");
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

  // SMC 多時區（只在 symbol 變時重載）
  useEffect(() => {
    if (!selected) return; let cancel = false;
    analyzeSMCMulti(selected).then((r) => { if (!cancel) setSmcMulti(r); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.symbol]);

  // 多週期漲跌（只在 symbol 變時重載，避免 coins 更新時閃爍）
  useEffect(() => {
    if (!selected) { setPeriodChg(null); return; }
    let cancel = false;
    setPeriodChg(null);
    loadPeriodChanges(selected).then((r) => { if (!cancel) setPeriodChg(r); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.symbol]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, wsEpoch]);

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
        // 標記新上榜：不在前次集合內的為 NEW
        const prevSet = prevExplosiveSymsRef.current;
        r.forEach((x) => { x.isNew = !prevSet.has(x.symbol); });
        prevExplosiveSymsRef.current = new Set(r.map((x) => x.symbol));
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
  function playBeep(kind) {
    if (!settings?.soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      // 強訊號:雙高音 / 一般:中音 / 爆倉:低音
      const freqs = kind === "strong" ? [880, 1320] : kind === "liq" ? [220] : [660];
      let t = ctx.currentTime;
      freqs.forEach((f, i) => {
        o.frequency.setValueAtTime(f, t + i * 0.12);
      });
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12 * freqs.length + 0.15);
      o.start();
      o.stop(ctx.currentTime + 0.12 * freqs.length + 0.2);
      setTimeout(() => { try { ctx.close(); } catch {} }, 800);
    } catch {}
  }

  function pushNotif({ symbol, signal, color, confidence, sound }) {
    const p = { signal, color, symbol, ts: Date.now(), confidence };
    setNotif(p);
    if (sound) playBeep(sound);
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
  const fmtPr = (v) => fmtPrice(v);
  const fmtVol = (v) => {
    if (!v || v <= 0) return "";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return String(Math.round(v));
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", color: "#c9d1d9", fontFamily: "'Sora',system-ui,sans-serif", overflow: "hidden", background: "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(247,147,26,0.10), transparent 60%), radial-gradient(ellipse 70% 50% at 85% 8%, rgba(98,126,234,0.10), transparent 55%), linear-gradient(180deg,#070c12 0%,#05080c 100%)" }}>
      {showSplash && (
        <div className="splash" style={{ position: "fixed", inset: 0, zIndex: 3000, background: "radial-gradient(ellipse at center, #0a1420, #05080c)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div className="logo-intro" style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, boxShadow: "0 0 40px -4px rgba(247,147,26,0.6)" }}>₿</div>
          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 6, color: "#e6edf3" }}>CRYPTEX</div>
          <div className="mono" style={{ color: "#5a6b80", fontSize: 10, letterSpacing: 2 }}>加密貨幣專業分析</div>
        </div>
      )}
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
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 24px -6px var(--glow),inset 0 0 0 1px rgba(255,255,255,0.04)}50%{box-shadow:0 0 40px -4px var(--glow),inset 0 0 0 1px rgba(255,255,255,0.08)}}
@keyframes glowDriftLong{0%,100%{background-position:50% 30%}50%{background-position:50% 10%}}
@keyframes glowDriftShort{0%,100%{background-position:50% 70%}50%{background-position:50% 90%}}
@keyframes ringSpin{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--off)}}
@keyframes breathe{0%,100%{opacity:.55;filter:saturate(.85)}50%{opacity:1;filter:saturate(1.2)}}
.breathe{animation:breathe 2.6s ease-in-out infinite}
.signal-card{position:relative;animation:glowPulse 3.5s ease-in-out infinite;background-size:160% 160%!important}
.signal-card.dir-long{animation:glowPulse 3.5s ease-in-out infinite,glowDriftLong 6s ease-in-out infinite}
.signal-card.dir-short{animation:glowPulse 3.5s ease-in-out infinite,glowDriftShort 6s ease-in-out infinite}
.fade-in{animation:fadeUp .35s ease}
.tab-pane{animation:fadeIn .3s ease}
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
.stagger-item:nth-child(n+9){animation-delay:.34s}
@keyframes logoIntro{0%{opacity:0;transform:scale(.6) rotate(-12deg)}60%{opacity:1;transform:scale(1.08) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
.logo-intro{animation:logoIntro .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes splashFade{0%{opacity:1}80%{opacity:1}100%{opacity:0;visibility:hidden}}
.splash{animation:splashFade 1.6s ease forwards}
@keyframes particleFloat{0%{transform:translateY(0) translateX(0);opacity:0}20%{opacity:.5}100%{transform:translateY(-40px) translateX(var(--px));opacity:0}}
.particle{position:absolute;width:3px;height:3px;border-radius:50%;animation:particleFloat var(--dur) ease-in-out infinite;animation-delay:var(--delay)}
body.eyecomfort{filter:saturate(.82) brightness(.94)}
body.hicontrast{filter:contrast(1.18) saturate(1.12)}
@keyframes gaugeSweep{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--goff)}}
@keyframes tabPop{0%{transform:scale(1)}40%{transform:scale(1.28)}100%{transform:scale(1)}}
.tab-icon-active{animation:tabPop .4s ease}
@keyframes newPulse{0%,100%{opacity:1}50%{opacity:.45}}
.new-badge{animation:newPulse 1.2s ease-in-out infinite}
.glow-pos{box-shadow:0 0 22px -10px #26a69a, inset 0 1px 0 rgba(255,255,255,0.05)!important}
.glow-neg{box-shadow:0 0 22px -10px #ef5350, inset 0 1px 0 rgba(255,255,255,0.05)!important}`}</style>

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
          <div className="logo-intro" style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 0 18px -2px rgba(247,147,26,0.55)" }}>₿</div>
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
          {loadError
            ? <button onClick={() => { setLoadError(false); setStatus("重試中..."); loadMarket("crypto").then((list) => { if (Array.isArray(list) && list.length > 0) { coinCountRef.current = list.length; setCoins(list); setStatus(`${list.length} 商品 · 即時`); setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null); } else { setStatus("連線失敗，點擊重試"); setLoadError(true); } }).catch(() => { setStatus("連線失敗，點擊重試"); setLoadError(true); }); }} style={{ background: "#3a1a1a", border: "1px solid #ef5350", borderRadius: 4, color: "#ef5350", padding: "2px 8px", fontSize: 9, fontFamily: "monospace", cursor: "pointer" }}>⚠ 連線失敗 · 點擊重試</button>
            : <span className="mono" style={{ color: "#5a6b80", fontSize: 9 }}>{status}</span>}
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
                <span key={sideTab === id ? "a" : "i"} className={sideTab === id ? "tab-icon-active" : ""} style={{ fontSize: 14, opacity: sideTab === id ? 1 : 0.6 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>


          <div
            style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}
            onTouchStart={(e) => { if (isMobile) { window.__txs = e.touches[0].clientX; window.__tys = e.touches[0].clientY; } }}
            onTouchEnd={(e) => {
              if (!isMobile || window.__txs == null) return;
              const dx = e.changedTouches[0].clientX - window.__txs;
              const dy = e.changedTouches[0].clientY - window.__tys;
              window.__txs = null;
              if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) {
                const tabs = ["overview", "indicators", "scan", "journal", "info"];
                const idx = tabs.indexOf(sideTab);
                if (dx < 0 && idx < tabs.length - 1) setSideTab(tabs[idx + 1]);
                else if (dx > 0 && idx > 0) setSideTab(tabs[idx - 1]);
              }
            }}
          >
            <div key={sideTab} className="tab-pane">
            {/* SMC */}
            {sideTab === "overview" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空訊號通知</div><div style={{ color: "#4a5568", fontSize: 9 }}>橫幅 + 系統通知</div></div>
                <button onClick={enableNotif} style={{ background: notifOn ? "#26a69a" : "#1a2535", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{notifOn ? "✓ 已開啟" : "開啟通知"}</button>
              </div>
              <TVChart symbol={selected?.symbol} />
              <MarketOverview recs={recs} liquidations={liquidations} coins={coins} />
              <PriceAlertCard symbol={selected?.symbol} currentPrice={displayPrice} alerts={priceAlerts} onAdd={addPriceAlert} onRemove={removePriceAlert} />
              {smc ? <>
                <div className={`signal-card ${smc.signal.includes("做多") ? "dir-long" : smc.signal.includes("做空") ? "dir-short" : ""}`} style={{ "--glow": `${smc.color}66`, background: `linear-gradient(145deg, ${smc.color}1f, rgba(13,21,32,0.6))`, border: `1px solid ${smc.color}88`, borderRadius: 16, padding: "18px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16, position: "relative", overflow: "hidden" }}>
                  {smc.signal.includes("強力") && [...Array(8)].map((_, i) => (
                    <span key={i} className="particle" style={{ left: `${10 + i * 11}%`, bottom: 0, background: smc.color, "--px": `${(i % 2 ? 1 : -1) * (8 + i)}px`, "--dur": `${2.5 + (i % 3) * 0.6}s`, "--delay": `${i * 0.3}s` }} />
                  ))}
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

                <MTFAnalysis smcMulti={smcMulti} smc={smc} />

                {sigHistory[selected?.symbol]?.length > 1 && (
                  <Section title="🕐 訊號歷史" color="#a78bfa" defaultOpen={false}>
                    {sigHistory[selected?.symbol].map((h, i) => {
                      const c = h.signal.includes("做多") ? "#26a69a" : h.signal.includes("做空") ? "#ef5350" : "#787b86";
                      const ago = Math.round((Date.now() - h.ts) / 60000);
                      const agoStr = ago < 60 ? `${ago}分鐘前` : ago < 1440 ? `${Math.round(ago / 60)}小時前` : `${Math.round(ago / 1440)}天前`;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < sigHistory[selected?.symbol].length - 1 ? "1px solid #111824" : "none" }}>
                          <span style={{ color: c, fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 70 }}>{h.signal}</span>
                          <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>信心 {h.confidence}%</span>
                          <span style={{ marginLeft: "auto", color: i === 0 ? "#58a6ff" : "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{i === 0 ? "最新 · " : ""}{agoStr}</span>
                        </div>
                      );
                    })}
                  </Section>
                )}

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
              <TradeJournal coins={coins} defaultSymbol={selected?.symbol} onNotify={pushNotif} settings={settings} onSetAlert={(t) => { addPriceAlert(t.symbol, t.entry, t.direction === "long" ? "below" : "above"); pushNotif({ symbol: t.symbol, signal: `已設到價提醒 @ ${t.entry}`, color: "#f0b90b", confidence: 0 }); }} />
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
                  {alerts.length === 0 && <EmptyState icon="📡" text="目前無異常" hint="每 3 分鐘自動掃描" />}
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
                                {ex.isNew && <span className="new-badge" style={{ background: "#58a6ff", color: "#000", fontSize: 7, fontFamily: "monospace", fontWeight: 700, padding: "1px 4px", borderRadius: 3 }}>NEW</span>}
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
                  {liquidations.length === 0 && <EmptyState icon="💥" text="等待大額爆倉" hint="連線後即時推送" />}
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
              {[["jin10", "📰 快訊"], ["news", "📖 說明"], ["settings", "⚙️ 設定"]].map(([id, label]) => (
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

            {infoSubTab === "settings" && <div style={{ padding: 2 }}>
              <Section title="🤖 自動推薦單設定" color="#58a6ff" defaultOpen={true}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>自動重新掃描間隔</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>間隔越長，清單越穩定、越省 API。選「只手動」則只在你按重新掃描時更新。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[5, "5分鐘"], [15, "15分鐘"], [30, "30分鐘"], [0, "只手動"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, autoScanMins: v }))} style={{ flex: 1, background: settings.autoScanMins === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.autoScanMins === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.autoScanMins === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>評分平倉方式</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>「連續兩次」可避免評分短暫跌破門檻就被砍掉好單。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[true, "連續兩次低於門檻才平"], [false, "一次低於就平"]].map(([v, label]) => (
                      <button key={String(v)} onClick={() => setSettings((s) => ({ ...s, scoreCloseConfirm: v }))} style={{ flex: 1, background: settings.scoreCloseConfirm === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreCloseConfirm === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreCloseConfirm === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>連續低分平倉次數</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>需要連續幾次低於門檻才平倉。激進2次、保守5次。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[2, 3, 5].map((v) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scoreConsecutive: v }))} style={{ flex: 1, background: settings.scoreConsecutive === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreConsecutive === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreConsecutive === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{v}次</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>推薦品質門檻</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>只推薦評分超過此值的單。嚴格品質高但數量少。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[60, "嚴格(60+)"], [40, "均衡(40+)"], [20, "寬鬆(20+)"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scoreFilterTh: v }))} style={{ flex: 1, background: settings.scoreFilterTh === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreFilterTh === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreFilterTh === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>評分平倉門檻：{settings.scoreCloseTh}</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>持倉中的單評分掉到此值以下就考慮平倉。越低越寬鬆（不容易被砍）。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[30, 40, 50].map((v) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scoreCloseTh: v }))} style={{ flex: 1, background: settings.scoreCloseTh === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreCloseTh === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreCloseTh === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{v}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>掃描範圍</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>只掃前 N 大成交量可大幅加快、省 API；全部最完整但較重。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[100, "前100"], [200, "前200"], [0, "全部"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scanTopN: v }))} style={{ flex: 1, background: settings.scanTopN === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scanTopN === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scanTopN === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>每側開單數量</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>做多和做空各幾張。少而精勝率較高，建議 2-3 張。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[2, "2張(精選)"], [3, "3張(均衡)"], [5, "5張(分散)"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, perSide: v }))} style={{ flex: 1, background: settings.perSide === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.perSide === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.perSide === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>分批平倉百分比</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 8, lineHeight: 1.5 }}>觸及各 TP 時要平多少 %。三格都留空 = 預設「TP3 觸發才全平」（舊版行為）。範例：填 50/30/20 = 觸 TP1 平50%、觸 TP2 平30%、觸 TP3 平20%。</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {[["tpClosePct1", "TP1"], ["tpClosePct2", "TP2"], ["tpClosePct3", "TP3"]].map(([key, label]) => (
                      <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "center", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, padding: "4px 6px", width: "100%" }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="—"
                            value={settings[key] == null ? "" : settings[key]}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value)));
                              setSettings((s) => ({ ...s, [key]: v }));
                            }}
                            style={{ background: "transparent", border: "none", color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, width: "100%", outline: "none", textAlign: "center" }}
                          />
                          <span style={{ color: "#5a6b80", fontSize: 9, marginLeft: 2 }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="🎨 介面與提示" color="#a78bfa" defaultOpen={true}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>訊號提示音</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>強訊號雙高音、一般單音、爆倉低音。需先在總覽開啟通知。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[true, "開啟"], [false, "關閉"]].map(([v, label]) => (
                      <button key={String(v)} onClick={() => setSettings((s) => ({ ...s, soundOn: v }))} style={{ flex: 1, background: settings.soundOn === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.soundOn === v ? "#a78bfa" : "#1a2535"}`, borderRadius: 5, color: settings.soundOn === v ? "#a78bfa" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>顯示模式</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>護眼降低對比與飽和；高對比加強辨識度。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["normal", "標準"], ["eyecomfort", "護眼"], ["hicontrast", "高對比"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, displayMode: v }))} style={{ flex: 1, background: settings.displayMode === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.displayMode === v ? "#a78bfa" : "#1a2535"}`, borderRadius: 5, color: settings.displayMode === v ? "#a78bfa" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>
              </Section>

              <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "4px 4px" }}>
                <p>· 設定會自動儲存在本機，下次開啟沿用。</p>
                <p>· 改「掃描範圍」「間隔」後，下次掃描生效。</p>
                <p>· 桌面快捷鍵：數字 1-5 切分頁、/ 聚焦搜尋；手機左右滑動切分頁。</p>
              </div>
            </div>}
            </>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
