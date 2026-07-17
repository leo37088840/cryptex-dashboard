import { useState, useEffect, useRef, useMemo, memo } from "react";

export default function Gauge({ value, label, color, size = 70 }) {
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
