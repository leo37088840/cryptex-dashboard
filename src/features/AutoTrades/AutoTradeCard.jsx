import { useState, useEffect, useMemo, useRef, memo } from "react";
import { pnlColor, fmtPrice, fmtNum, scoreColor } from "../../utils/format.js";

const AutoTradeCard = memo(function AutoTradeCard({ trade, livePrice, onCancel, onShare, onSetAlert, onManualClose, btcNowState }) {
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

      {/* BTC 狀態警示：開單時 vs 現在方向不同時提醒（AutoTradeCard 內） */}
      {trade.btcState && btcNowState && trade.btcState.direction !== "neutral" && btcNowState.direction !== "neutral" && trade.btcState.direction !== btcNowState.direction && (
        <div style={{ background: "#3a2a1a", border: "1px solid #f0b90b", borderRadius: 5, padding: "4px 8px", marginBottom: 6, fontSize: 9, color: "#f0b90b", fontFamily: "monospace" }}>
          ⚠️ BTC 從{trade.btcState.direction === "up" ? "有利" : "逆勢"}轉為{btcNowState.direction === "up" ? "有利" : "逆勢"}
        </div>
      )}

      {/* BTC 調整分顯示 */}
      {trade.btcAdjust != null && Math.abs(trade.btcAdjust) > 0.5 && (
        <div style={{ fontSize: 8, color: trade.btcAdjust >= 0 ? "#26a69a" : "#ef5350", fontFamily: "monospace", marginBottom: 4 }}>
          BTC: {trade.btcAdjust >= 0 ? "+" : ""}{trade.btcAdjust.toFixed(1)} 分（相關性 {(trade.btcCorr ?? 0.7).toFixed(2)}）
        </div>
      )}

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

export default AutoTradeCard;
