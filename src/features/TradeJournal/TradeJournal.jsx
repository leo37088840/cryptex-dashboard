import { useState, useEffect, useMemo, useRef, memo } from "react";
import { loadTrades, saveTrades } from "../../utils/storage.js";
import Section from "../../components/Section.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import TradeForm from "./TradeForm.jsx";
import TradeCard from "./TradeCard.jsx";
import AutoTrades from "../AutoTrades/AutoTrades.jsx";

export default function TradeJournal({ coins, defaultSymbol, onNotify, onSetAlert, settings, recs, anomalies, explosive }) {
  const [journalSubTab, setJournalSubTab] = useState("auto");
  const [trades, setTrades] = useState(() => loadTrades());
  const [showForm, setShowForm] = useState(false);
  const [livePrices, setLivePrices] = useState({});

  useEffect(() => { saveTrades(trades); }, [trades]);

  // 抓開倉中交易的即時價格（用 coins 列表的價格，每次 coins 更新時刷新）
  useEffect(() => {
    if (!coins || !coins.length) return;
    const map = {};
    trades.forEach((t) => {
      if (t.status === "closed") return;
      const c = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""));
      if (c) map[t.symbol] = c.price;
    });
    setLivePrices((prev) => ({ ...prev, ...map }));
  }, [coins, trades]);

  function addTrade(trade) {
    setTrades((prev) => [trade, ...prev]);
    setShowForm(false);
  }
  function deleteTrade(id) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }
  function closeTrade(id) {
    setTrades((prev) => prev.map((t) => t.id === id ? { ...t, status: "closed" } : t));
  }

  const openTrades = trades.filter((t) => t.status !== "closed");
  const closedTrades = trades.filter((t) => t.status === "closed");

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["auto", "🤖 自動推薦單"], ["manual", "📝 手動紀錄"]].map(([id, label]) => (
          <button key={id} onClick={() => setJournalSubTab(id)} style={{ flex: 1, background: journalSubTab === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${journalSubTab === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, color: journalSubTab === id ? "#58a6ff" : "#4a5568", padding: "7px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
        ))}
      </div>

      {journalSubTab === "auto" && <AutoTrades coins={coins} onNotify={onNotify} onSetAlert={onSetAlert} settings={settings} recs={recs} anomalies={anomalies} explosive={explosive} />}

      {journalSubTab === "manual" && <>
      <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>交易紀錄</div>
          <div style={{ color: "#4a5568", fontSize: 9 }}>本機儲存 · 自動追蹤TP/SL進度</div>
        </div>
        <button onClick={() => setShowForm((s) => !s)} style={{ background: "#58a6ff", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{showForm ? "收起" : "+ 新增"}</button>
      </div>

      {showForm && <TradeForm onAdd={addTrade} onCancel={() => setShowForm(false)} defaultSymbol={defaultSymbol} />}

      <Section title={`持倉中 (${openTrades.length})`} color="#58a6ff" defaultOpen={true}>
        {openTrades.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>尚無持倉紀錄</div>}
        {openTrades.map((t) => (
          <TradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onDelete={deleteTrade} onClose={closeTrade} />
        ))}
      </Section>

      {closedTrades.length > 0 && (
        <Section title={`已平倉 (${closedTrades.length})`} color="#5a6b80" defaultOpen={false}>
          {closedTrades.map((t) => (
            <TradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onDelete={deleteTrade} onClose={closeTrade} />
          ))}
        </Section>
      )}
      </>}
    </>
  );
}

// ═══════════ 歷史回測元件 ═══════════════════════════════════════════════════
