import { useState, useEffect } from "react";

export function pnlColor(pct) {
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

export function scoreColor(v) {
  if (v == null || isNaN(v)) return "#5a6b80";
  if (v >= 70) return "#1f9b7a";
  if (v >= 55) return "#26a69a";
  if (v >= 45) return "#f0b90b";
  if (v >= 30) return "#ef8e53";
  return "#ef5350";
}

// 價格依幣值自動決定小數位

export function fmtPrice(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(7);
}
// 大數字加千分位/單位

export function fmtNum(v) {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return Math.round(v).toLocaleString("en-US");
}

// 統一空狀態

export function fmtFeedTime(t) {
  if (!t) return "";
  let d;
  if (typeof t === "number") d = new Date(t < 1e12 ? t * 1000 : t);
  else d = new Date(t);
  if (isNaN(d.getTime())) return String(t).slice(0, 16);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 760 : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth < 760);
    window.addEventListener("resize", f); f();
    return () => window.removeEventListener("resize", f);
  }, []);
  return m;
}
