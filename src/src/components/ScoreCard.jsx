import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "./Section.jsx";
import AICard from "./AICard.jsx";
import { scoreColor, pnlColor } from "../utils/format.js";

function ScoreBadge({ label, value, color, pos }) {
  return (
    <div style={{ padding: "8px 10px", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace" }}>{label}</span>
        <span style={{ background: `${color}22`, color, fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 8px", borderRadius: 5, border: `1px solid ${color}55` }}>{value}</span>
      </div>
      {pos != null && (
        <div style={{ position: "relative", height: 4, borderRadius: 2, background: "linear-gradient(90deg,#ef5350,#5a6b80,#26a69a)", marginTop: 6, opacity: 0.5 }}>
          <div style={{ position: "absolute", top: -2, left: `calc(${Math.max(0, Math.min(100, pos))}% - 4px)`, width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
        </div>
      )}
    </div>
  );
}


export default function ScoreCard({ symbol, smc, multiAI, hideHeader = false }) {
  if (!smc) return <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>分析中...</div>;

  const futuresAI = multiAI && multiAI.length > 0 ? multiAI[3] : null; // 期貨情緒派

  // 市場動能：來自 SMC 結構
  const momentumLabel = smc.structure.includes("上升") ? "買方主導" : smc.structure.includes("下降") ? "賣方主導" : "盤整";
  const momentumColor = smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#f0b90b";

  // 資金費率（從期貨情緒派理由中找）
  let fundingLabel = "中性", fundingColor = "#f0b90b", fundingDesc = "暫無資料";
  if (futuresAI) {
    const fr = futuresAI.reasons.find(r => r.includes("資金費率"));
    if (fr) {
      fundingDesc = fr;
      if (fr.includes("多頭擁擠")) { fundingLabel = "偏空"; fundingColor = "#ef5350"; }
      else if (fr.includes("空頭擁擠")) { fundingLabel = "偏多"; fundingColor = "#26a69a"; }
    }
  }

  // 散戶情緒
  let sentimentLabel = "中性", sentimentColor = "#f0b90b", sentimentDesc = "暫無資料";
  if (futuresAI) {
    const sr = futuresAI.reasons.find(r => r.includes("散戶") || r.includes("大戶"));
    if (sr) {
      sentimentDesc = sr;
      if (sr.includes("反指標利多") || sr.includes("大戶看多")) { sentimentLabel = "偏多"; sentimentColor = "#26a69a"; }
      else if (sr.includes("反指標利空") || sr.includes("大戶看空")) { sentimentLabel = "偏空"; sentimentColor = "#ef5350"; }
    }
  }

  // 相對強弱（vs BTC）
  let rsLabel = "同步", rsColor = "#f0b90b", rsDesc = "暫無資料";
  const rsReason = (smc.reasons || []).find(r => r.includes("vs BTC") || r.includes("強勢") || r.includes("弱勢"));
  if (rsReason) {
    rsDesc = rsReason;
    if (rsReason.includes("強勢")) { rsLabel = "強於BTC"; rsColor = "#26a69a"; }
    else if (rsReason.includes("弱勢")) { rsLabel = "弱於BTC"; rsColor = "#ef5350"; }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      {!hideHeader && (
        <div style={{ background: `${smc.color}14`, border: `1.5px solid ${smc.color}`, borderRadius: 10, padding: 12, marginBottom: 10, textAlign: "center" }}>
          <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>📊 綜合評分卡 · {symbol}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: smc.color, fontFamily: "monospace" }}>{smc.signal}</div>
          <div style={{ color: smc.color, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>信心度 {smc.confidence}%</div>
        </div>
      )}

      <Section title="做多/做空依據" color={smc.color} defaultOpen={true}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <ScoreBadge label="市場動能" value={momentumLabel} color={momentumColor} pos={momentumLabel === "買方主導" ? 80 : momentumLabel === "賣方主導" ? 20 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{smc.structure}</div>
          </div>
          <div>
            <ScoreBadge label="資金費率" value={fundingLabel} color={fundingColor} pos={fundingLabel === "偏多" ? 75 : fundingLabel === "偏空" ? 25 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{fundingDesc}</div>
          </div>
          <div>
            <ScoreBadge label="散戶/大戶情緒" value={sentimentLabel} color={sentimentColor} pos={sentimentLabel === "偏多" ? 75 : sentimentLabel === "偏空" ? 25 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{sentimentDesc}</div>
          </div>
          <div>
            <ScoreBadge label="相對強弱" value={rsLabel} color={rsColor} pos={rsLabel === "強於BTC" ? 80 : rsLabel === "弱於BTC" ? 20 : 50} />
            <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>{rsDesc}</div>
          </div>
          {smc.snr && (smc.snr.support || smc.snr.resistance) && (
            <div>
              <ScoreBadge label="關鍵價位 SNR" value={
                smc.snr.support && smc.snr.support.dist < 1 ? "近支撐"
                : smc.snr.resistance && smc.snr.resistance.dist < 1 ? "近壓力"
                : "區間中"
              } color={
                smc.snr.support && smc.snr.support.dist < 1 ? "#26a69a"
                : smc.snr.resistance && smc.snr.resistance.dist < 1 ? "#ef5350"
                : "#f0b90b"
              } pos={
                smc.snr.support && smc.snr.support.dist < 1 ? 80
                : smc.snr.resistance && smc.snr.resistance.dist < 1 ? 20
                : 50
              } />
              <div style={{ color: "#5a6b80", fontSize: 9, padding: "0 2px 6px" }}>
                {smc.snr.resistance ? `壓力 ${smc.snr.resistance.price.toFixed(smc.snr.resistance.price > 1 ? 4 : 6)} (+${smc.snr.resistance.dist.toFixed(2)}%)` : "—"}
                {" · "}
                {smc.snr.support ? `支撐 ${smc.snr.support.price.toFixed(smc.snr.support.price > 1 ? 4 : 6)} (-${smc.snr.support.dist.toFixed(2)}%)` : "—"}
              </div>
            </div>
          )}
        </div>
      </Section>

      {(() => {
        // 進場時機提示：依方向與 SNR 距離判斷追高/追空風險或理想進場
        const isLong = smc.signal.includes("做多");
        const isShort = smc.signal.includes("做空");
        if (!isLong && !isShort || !smc.snr) return null;
        let tip = null, tColor = "#f0b90b", tIcon = "⏱️";
        if (isLong) {
          const supDist = smc.snr.support?.dist;
          const resDist = smc.snr.resistance?.dist;
          if (supDist != null && supDist < 1) { tip = "貼近支撐，做多風險報酬較佳"; tColor = "#26a69a"; tIcon = "✅"; }
          else if (resDist != null && resDist < 0.8) { tip = "逼近壓力，追高風險高，可等回踩"; tColor = "#ef5350"; tIcon = "⚠️"; }
          else if (supDist != null && supDist > 4) { tip = "已遠離支撐，追高風險，建議等回踩再進"; tColor = "#ef8e53"; tIcon = "⚠️"; }
          else tip = "處於區間中段，可分批進場或等更好價位";
        } else {
          const resDist = smc.snr.resistance?.dist;
          const supDist = smc.snr.support?.dist;
          if (resDist != null && resDist < 1) { tip = "貼近壓力，做空風險報酬較佳"; tColor = "#26a69a"; tIcon = "✅"; }
          else if (supDist != null && supDist < 0.8) { tip = "逼近支撐，追空風險高，可等反彈"; tColor = "#ef5350"; tIcon = "⚠️"; }
          else if (resDist != null && resDist > 4) { tip = "已遠離壓力，追空風險，建議等反彈再進"; tColor = "#ef8e53"; tIcon = "⚠️"; }
          else tip = "處於區間中段，可分批進場或等更好價位";
        }
        return (
          <div style={{ background: `${tColor}12`, border: `1px solid ${tColor}44`, borderRadius: 8, padding: "8px 10px", marginTop: 4 }}>
            <span style={{ color: tColor, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{tIcon} 進場時機：{tip}</span>
          </div>
        );
      })()}

    </div>
  );
}
