import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";
import { pnlColor, fmtPrice } from "../../utils/format.js";

export default function ClosedTradesSection({ closed }) {
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
