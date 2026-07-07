import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";
import { pnlColor, fmtNum } from "../../utils/format.js";

export default function RiskOverview({ longs, shorts, livePrices }) {
  const all = [...longs, ...shorts];
  if (all.length === 0) return null;
  const nLong = longs.length, nShort = shorts.length;
  const total = all.length;
  // 集中度：多空是否嚴重失衡
  const imbalance = total > 0 ? Math.abs(nLong - nShort) / total : 0;
  // 主題集中度（僅在單數變化時重算，不隨 livePrices 變）
  const { topTheme, themeConcentRate } = useMemo(() => {
    const keywords = ["OP", "ARB", "ZKSYNC", "SCROLL", "STARKNET", "AI", "DOG", "PEPE", "MEME"];
    const themeConcentration = {};
    all.forEach((t) => {
      const upper = (t.name || t.symbol).toUpperCase();
      keywords.forEach((kw) => {
        if (upper.includes(kw)) themeConcentration[kw] = (themeConcentration[kw] || 0) + 1;
      });
    });
    const top = Object.entries(themeConcentration).sort((a, b) => b[1] - a[1])[0];
    return { topTheme: top, themeConcentRate: top ? (top[1] / total) * 100 : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [longs.length, shorts.length]);
  // 平均未實現盈虧
  let pnlSum = 0, pnlCount = 0;
  all.forEach((t) => {
    const live = livePrices[t.symbol];
    if (live && t.entry) {
      const isLong = t.direction === "long";
      pnlSum += isLong ? ((live - t.entry) / t.entry) * 100 : ((t.entry - live) / t.entry) * 100;
      pnlCount++;
    }
  });
  const avgPnl = pnlCount > 0 ? pnlSum / pnlCount : null;
  const totalPnl = pnlCount > 0 ? pnlSum : null; // 各單盈虧%加總（等權重視角）
  // 集中度警示
  let concentLabel = "均衡", concentColor = "#26a69a";
  if (imbalance >= 0.8) { concentLabel = "嚴重偏向" + (nLong > nShort ? "做多" : "做空"); concentColor = "#ef5350"; }
  else if (imbalance >= 0.4) { concentLabel = "略偏" + (nLong > nShort ? "多" : "空"); concentColor = "#f0b90b"; }

  const longPct = total > 0 ? (nLong / total) * 100 : 50;

  return (
    <Section title="⚖️ 持倉風險總覽" color="#58a6ff" defaultOpen={true}>
      {totalPnl != null && (
        <div className={totalPnl >= 0 ? "glow-pos" : "glow-neg"} style={{ background: `${pnlColor(avgPnl)}14`, border: `1px solid ${pnlColor(avgPnl)}55`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, textAlign: "center" }}>
          <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginBottom: 2 }}>持倉總未實現盈虧（等權重）</div>
          <div className="mono" style={{ color: pnlColor(avgPnl), fontSize: 24, fontWeight: 800 }}>{totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}%</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
        <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
          <div style={{ color: "#c9d1d9", fontSize: 16, fontFamily: "monospace", fontWeight: 800 }}>{total}</div>
          <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>持倉數</div>
        </div>
        <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800 }}>
            <span style={{ color: "#26a69a" }}>{nLong}</span>
            <span style={{ color: "#4a5568", fontSize: 11 }}> / </span>
            <span style={{ color: "#ef5350" }}>{nShort}</span>
          </div>
          <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>多 / 空</div>
        </div>
        <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
          <div style={{ color: pnlColor(avgPnl), fontSize: 16, fontFamily: "monospace", fontWeight: 800 }}>{avgPnl == null ? "—" : (avgPnl >= 0 ? "+" : "") + avgPnl.toFixed(1) + "%"}</div>
          <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>平均盈虧</div>
        </div>
      </div>

      {/* 多空分布條 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace" }}>做多 {nLong}</span>
          <span style={{ color: concentColor, fontSize: 9, fontFamily: "monospace", fontWeight: 700 }}>{concentLabel}</span>
          <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace" }}>做空 {nShort}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: "#1a2535" }}>
          <div style={{ width: `${longPct}%`, background: "#26a69a", transition: "width .3s ease" }} />
          <div style={{ width: `${100 - longPct}%`, background: "#ef5350", transition: "width .3s ease" }} />
        </div>
      </div>

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6 }}>
        {imbalance >= 0.8 ? "⚠️ 持倉嚴重偏向單邊，方向錯誤時風險集中，建議分散或減少同向曝險。" : imbalance >= 0.4 ? "持倉略偏單邊，留意大盤反向時的連帶風險。" : "多空分布均衡，方向風險分散良好。"}
      </div>

      {/* 主題集中度警示 */}
      {topTheme && themeConcentRate >= 50 && (
        <div style={{ background: "#3a1a1a", border: "1px solid #ef5350", borderRadius: 6, padding: 8, marginTop: 8, marginBottom: 8 }}>
          <div style={{ color: "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 700, marginBottom: 2 }}>⚠️ 主題集中度過高</div>
          <div style={{ color: "#f0b90b", fontSize: 9, fontFamily: "monospace" }}>{topTheme[0]} 相關佔 {themeConcentRate.toFixed(0)}%，部分敘事崩塌時風險集中。建議加入其他主題降風險。</div>
        </div>
      )}
      {(nLong >= 4 || nShort >= 4) && (
        <div style={{ color: "#f0b90b", fontSize: 9, lineHeight: 1.6, marginTop: 6, background: "#1a1206", borderRadius: 6, padding: "6px 8px" }}>
          🔗 相關性提醒：目前有 {Math.max(nLong, nShort)} 個{nLong >= nShort ? "做多" : "做空"}單。加密貨幣多數與 BTC 高度連動，這些單實際上可能是「同一個方向的賭注」，分散程度比張數看起來低。
        </div>
      )}
    </Section>
  );
}

// ═══════════ 勝率回饋分析 ═══════════════════════════════════════════════════
// 從已結束單統計：不同結構/方向/評分區間的勝率，找出高勝率組合
