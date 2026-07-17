import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";
import { pnlColor } from "../../utils/format.js";

export default function DailyBacktest({ closed, onClear }) {
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
