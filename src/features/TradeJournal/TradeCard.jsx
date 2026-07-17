import { useState, useEffect, useMemo, useRef, memo } from "react";
import { pnlColor, fmtPrice } from "../../utils/format.js";

export default function TradeCard({ trade, livePrice, onDelete, onClose }) {
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
