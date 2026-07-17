import { useState, useEffect, useRef, useMemo, memo } from "react";

export default function Section({ title, color = "#58a6ff", badge, defaultOpen = true, children }) {
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
