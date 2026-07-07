import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";
import { pnlColor, fmtNum, fmtFeedTime } from "../../utils/format.js";

export default function MarketOverview({ recs, liquidations, coins }) {
  // 從推薦掃描算市場多空傾向
  const nLong = recs?.longs?.length || 0;
  const nShort = recs?.shorts?.length || 0;
  const totalSig = nLong + nShort;
  const longBias = totalSig > 0 ? (nLong / totalSig) * 100 : 50;
  // 爆倉統計（多單 vs 空單）
  const liqLong = liquidations.filter((l) => l.side === "long").reduce((s, l) => s + l.usd, 0);
  const liqShort = liquidations.filter((l) => l.side === "short").reduce((s, l) => s + l.usd, 0);
  // 市場情緒溫度（綜合多空訊號 + 爆倉方向）
  let mood = 50;
  if (totalSig > 0) mood = longBias;
  if (liqLong + liqShort > 0) {
    // 多單爆倉多→市場恐慌偏空；空單爆倉多→軋空偏多
    const liqBias = liqShort / (liqLong + liqShort) * 100;
    mood = mood * 0.6 + liqBias * 0.4;
  }
  let moodLabel = "中性", moodColor = "#f0b90b";
  if (mood >= 65) { moodLabel = "偏多 / 貪婪"; moodColor = "#26a69a"; }
  else if (mood >= 55) { moodLabel = "微偏多"; moodColor = "#5fc9a8"; }
  else if (mood <= 35) { moodLabel = "偏空 / 恐懼"; moodColor = "#ef5350"; }
  else if (mood <= 45) { moodLabel = "微偏空"; moodColor = "#f0908e"; }

  const fmtUsd = (v) => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + (v / 1e3).toFixed(0) + "K";

  return (
    <Section title="🌐 市場總覽" color={moodColor} defaultOpen={true}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <Gauge value={mood} label="情緒" color={moodColor} size={76} />
        <div style={{ flex: 1 }}>
          <div style={{ color: moodColor, fontSize: 15, fontFamily: "'Sora',sans-serif", fontWeight: 800, marginBottom: 2 }}>{moodLabel}</div>
          <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", lineHeight: 1.6 }}>
            綜合掃描多空訊號與爆倉方向估算的市場情緒。僅供參考，非投資建議。
          </div>
        </div>
      </div>

      {totalSig > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace" }}>掃描偏多 {nLong}</span>
            <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace" }}>偏空 {nShort}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: "#1a2535" }}>
            <div style={{ width: `${longBias}%`, background: "#26a69a", transition: "width .4s ease" }} />
            <div style={{ width: `${100 - longBias}%`, background: "#ef5350", transition: "width .4s ease" }} />
          </div>
        </div>
      )}

      {(liqLong + liqShort) > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: "#0a1218", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ color: "#ef5350", fontSize: 8, fontFamily: "monospace" }}>多單爆倉</div>
            <div style={{ color: "#ef5350", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{fmtUsd(liqLong)}</div>
          </div>
          <div style={{ flex: 1, background: "#0a1218", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ color: "#26a69a", fontSize: 8, fontFamily: "monospace" }}>空單爆倉</div>
            <div style={{ color: "#26a69a", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{fmtUsd(liqShort)}</div>
          </div>
        </div>
      )}
    </Section>
  );
}
