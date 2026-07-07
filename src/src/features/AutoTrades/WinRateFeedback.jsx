import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";
import { scoreColor } from "../../utils/format.js";

export default function WinRateFeedback({ closed }) {
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
