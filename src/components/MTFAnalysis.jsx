import { useState, useEffect, useRef, useMemo, memo } from "react";
import Section from "./Section.jsx";
import Gauge from "./Gauge.jsx";
import IndRow from "./IndRow.jsx";
import { scoreColor, fmtPrice } from "../utils/format.js";

export default function MTFAnalysis({ smcMulti, smc }) {
  const [openTf, setOpenTf] = useState(null);
  const valid = (smcMulti || []).filter((m) => m.result);
  if (valid.length === 0 && !smc) return null;
  const longs = valid.filter((m) => m.result.signal.includes("做多")).length;
  const shorts = valid.filter((m) => m.result.signal.includes("做空")).length;
  let consensus = "分歧", consColor = "#f0b90b";
  if (longs >= 3) { consensus = "多頭共振"; consColor = "#26a69a"; }
  else if (shorts >= 3) { consensus = "空頭共振"; consColor = "#ef5350"; }
  else if (longs > shorts) { consensus = "偏多"; consColor = "#5fc9a8"; }
  else if (shorts > longs) { consensus = "偏空"; consColor = "#f0908e"; }

  const dot = (r) => {
    if (!r) return { c: "#3a4658", t: "—" };
    if (r.signal.includes("強力做多")) return { c: "#1f9b7a", t: "▲▲" };
    if (r.signal.includes("做多")) return { c: "#26a69a", t: "▲" };
    if (r.signal.includes("強力做空")) return { c: "#c0392b", t: "▼▼" };
    if (r.signal.includes("做空")) return { c: "#ef5350", t: "▼" };
    return { c: "#787b86", t: "•" };
  };

  const openItem = valid.find((m) => m.tf === openTf);

  return (
    <Section title="🔭 多時間框架分析" color={consColor} badge={consensus} defaultOpen={true}>
      {/* 共振對照矩陣（點格子展開該週期細節） */}
      <div style={{ display: "flex", gap: 6 }}>
        {valid.map(({ tf: t, result: r }) => {
          const d = dot(r);
          const active = openTf === t;
          return (
            <button key={t} onClick={() => setOpenTf(active ? null : t)} style={{ flex: 1, background: active ? `${d.c}28` : `${d.c}14`, border: `1px solid ${active ? d.c : d.c + "44"}`, borderRadius: 8, padding: "8px 4px", textAlign: "center", cursor: "pointer", transition: "all .2s ease", transform: active ? "translateY(-2px)" : "none" }}>
              <div className="mono" style={{ color: "#8b949e", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{t}</div>
              <div style={{ color: d.c, fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{d.t}</div>
              <div className="mono" style={{ color: d.c, fontSize: 8, marginTop: 3 }}>{r ? r.confidence + "%" : ""}</div>
            </button>
          );
        })}
      </div>
      <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginTop: 8, textAlign: "center" }}>
        {longs} 個週期偏多 · {shorts} 個週期偏空 · {consensus}
        {valid.length > 0 && <span style={{ color: "#3a4658" }}> · 點週期看細節</span>}
      </div>

      {/* 點選某週期後展開的該週期細節 */}
      {openItem && openItem.result && (() => {
        const r = openItem.result;
        const col = dot(r).c;
        return (
          <div style={{ marginTop: 8, background: `${col}10`, border: `1px solid ${col}44`, borderRadius: 8, padding: "10px 12px", animation: "fadeUp .25s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="mono" style={{ color: "#c9d1d9", fontSize: 12, fontWeight: 800 }}>{openItem.tf} 週期</span>
              <span className="mono" style={{ color: col, fontSize: 11, fontWeight: 700 }}>{r.signal}</span>
              <span className="mono" style={{ marginLeft: "auto", color: col, fontSize: 11, fontWeight: 700 }}>{r.confidence}%</span>
            </div>
            <IndRow label="市場結構" value={r.structure} color={r.structure.includes("上升") ? "#26a69a" : r.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
            {r.sweep && <IndRow label="流動性掃單" value={r.sweep} color="#f0e68c" />}
            {r.fvg && <IndRow label="FVG 失衡" value={r.fvg.type === "bull" ? "多頭缺口" : "空頭缺口"} color={r.fvg.type === "bull" ? "#26a69a" : "#ef5350"} />}
            {r.ob && <IndRow label="訂單塊 OB" value={r.ob.type === "bull" ? "多頭OB" : "空頭OB"} color={r.ob.type === "bull" ? "#26a69a" : "#ef5350"} />}
            {r.snr && (r.snr.support || r.snr.resistance) && (
              <div style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {r.snr.resistance ? `壓力 ${fmtPrice(r.snr.resistance.price)} (+${r.snr.resistance.dist.toFixed(2)}%)` : "—"}
                {" · "}
                {r.snr.support ? `支撐 ${fmtPrice(r.snr.support.price)} (-${r.snr.support.dist.toFixed(2)}%)` : "—"}
              </div>
            )}
          </div>
        );
      })()}

      {/* 當前選定週期的市場結構（永遠顯示，作為主時框細節） */}
      {smc && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ color: "#58a6ff", fontSize: 10, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>當前週期市場結構</div>
          <IndRow label="當前結構" value={smc.structure} color={smc.structure.includes("上升") ? "#26a69a" : smc.structure.includes("下降") ? "#ef5350" : "#c9d1d9"} />
          <IndRow label="流動性掃單" value={smc.sweep || "無"} color={smc.sweep ? "#f0e68c" : "#4a5568"} />
          <IndRow label="FVG 失衡" value={smc.fvg ? (smc.fvg.type === "bull" ? "多頭缺口" : "空頭缺口") : "無"} color={smc.fvg ? (smc.fvg.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
          <IndRow label="訂單塊 OB" value={smc.ob ? (smc.ob.type === "bull" ? "多頭OB" : "空頭OB") : "無"} color={smc.ob ? (smc.ob.type === "bull" ? "#26a69a" : "#ef5350") : "#4a5568"} />
        </div>
      )}
    </Section>
  );
}
