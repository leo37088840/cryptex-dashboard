import { useState, useEffect, useMemo, useRef, memo } from "react";
import { pnlColor } from "../../utils/format.js";

export default function ShareCard({ trade, livePrice, onClose }) {
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
