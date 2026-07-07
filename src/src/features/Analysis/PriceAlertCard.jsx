import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";
import { fmtPrice } from "../../utils/format.js";

export default function PriceAlertCard({ symbol, currentPrice, alerts, onAdd, onRemove }) {
  const [target, setTarget] = useState("");
  const mine = (alerts || []).filter((a) => a.symbol === symbol);

  function submit() {
    const t = parseFloat(target);
    if (!t || !symbol) return;
    const dir = t >= currentPrice ? "above" : "below";
    onAdd(symbol, t, dir);
    setTarget("");
  }

  return (
    <Section title="🔔 到價提醒" color="#f0b90b" badge={mine.length ? `${mine.length}個` : undefined} defaultOpen={false}>
      <div style={{ display: "flex", gap: 6, marginBottom: mine.length ? 10 : 0 }}>
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`目標價（現價 ${currentPrice ? (currentPrice > 1 ? currentPrice.toFixed(4) : currentPrice.toFixed(6)) : "—"}）`} inputMode="decimal" style={{ flex: 1, background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, color: "#c9d1d9", padding: "7px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
        <button onClick={submit} style={{ background: "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "0 16px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>設定</button>
      </div>
      {mine.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a1218", border: "1px solid #1a2535", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}>
          <span style={{ color: a.dir === "above" ? "#26a69a" : "#ef5350", fontSize: 12 }}>{a.dir === "above" ? "↑" : "↓"}</span>
          <span style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{a.target}</span>
          <span style={{ color: a.fired ? "#26a69a" : "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>{a.fired ? "✓ 已觸發" : (a.dir === "above" ? "突破時通知" : "跌破時通知")}</span>
          <button onClick={() => onRemove(a.id)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#ef5350", fontSize: 14 }}>×</button>
        </div>
      ))}
      {mine.length === 0 && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 8 }}>設定目標價，價格突破/跌破時跳通知（需開啟通知）。</div>}
    </Section>
  );
}

// ═══════════ 訊號歷史 storage（記錄各幣訊號變化）═══════════════════════════
