import { useState, useEffect, useRef, useMemo, memo } from "react";

export default function AICard({ ai, defaultOpen = false }) {
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
