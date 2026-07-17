import { useState, useEffect, useMemo, useRef, memo } from "react";
import Section from "../../components/Section.jsx";

export default function TradeForm({ onAdd, onCancel, defaultSymbol }) {
  const [symbol, setSymbol] = useState(defaultSymbol || "");
  const [direction, setDirection] = useState("long");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [tp3, setTp3] = useState("");

  const inputStyle = { width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, color: "#c9d1d9", padding: "7px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" };
  const labelStyle = { color: "#5a6b80", fontSize: 9, fontFamily: "monospace", marginBottom: 3, display: "block" };

  function submit() {
    const e = parseFloat(entry), s = parseFloat(sl);
    if (!symbol || !e || !s) return;
    const trade = {
      id: Date.now(),
      symbol: symbol.toUpperCase(),
      direction,
      entry: e,
      sl: s,
      tp1: parseFloat(tp1) || null,
      tp2: parseFloat(tp2) || null,
      tp3: parseFloat(tp3) || null,
      ts: Date.now(),
      status: "open",
    };
    onAdd(trade);
  }

  return (
    <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>幣種</label>
          <input style={inputStyle} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="例: BTC-USDT" />
        </div>
        <div style={{ width: 90 }}>
          <label style={labelStyle}>方向</label>
          <select style={inputStyle} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="long">做多</option>
            <option value="short">做空</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>進場價</label>
          <input style={inputStyle} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>SL 止損</label>
          <input style={inputStyle} value={sl} onChange={(e) => setSl(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>TP1</label>
          <input style={inputStyle} value={tp1} onChange={(e) => setTp1(e.target.value)} placeholder="選填" inputMode="decimal" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>TP2</label>
          <input style={inputStyle} value={tp2} onChange={(e) => setTp2(e.target.value)} placeholder="選填" inputMode="decimal" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>TP3</label>
          <input style={inputStyle} value={tp3} onChange={(e) => setTp3(e.target.value)} placeholder="選填" inputMode="decimal" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={{ flex: 1, background: "#26a69a", border: "none", borderRadius: 6, color: "#fff", padding: "8px 0", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>新增紀錄</button>
        <button onClick={onCancel} style={{ flex: 1, background: "#1a2535", border: "none", borderRadius: 6, color: "#8b949e", padding: "8px 0", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>取消</button>
      </div>
    </div>
  );
}
