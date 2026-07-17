

export function computeOutcome(trade, exitPrice, reason) {
  const isLong = trade.direction === "long";
  const risk = Math.abs(trade.entry - trade.sl) || (trade.entry * 0.01);
  const pnlPct = isLong ? ((exitPrice - trade.entry) / trade.entry) * 100 : ((trade.entry - exitPrice) / trade.entry) * 100;
  const rMultiple = isLong ? (exitPrice - trade.entry) / risk : (trade.entry - exitPrice) / risk;
  return { ...trade, exitPrice, exitReason: reason, pnlPct, rMultiple, closedTs: Date.now() };
}

// 評估某張單在現價下是否該平倉。settings 可選，若提供則使用自訂平倉 %

export function evalClose(trade, livePrice, settings) {
  if (livePrice == null) return null;
  const isLong = trade.direction === "long";
  const slHit = isLong ? livePrice <= trade.sl : livePrice >= trade.sl;
  if (slHit) return { price: trade.sl, reason: "止損" };

  // 讀取自訂 %（settings 沒提供時全部視為 null = 預設行為）
  const pct1 = settings?.tpClosePct1 ?? null;
  const pct2 = settings?.tpClosePct2 ?? null;
  const pct3 = settings?.tpClosePct3 ?? null;
  // 三個都未設 → 預設行為：TP3 觸發才全平（舊版相容）
  const allUnset = pct1 == null && pct2 == null && pct3 == null;

  // TP1
  if (trade.tp1 != null && !trade.tp1Closed && pct1 != null) {
    const tp1Hit = isLong ? livePrice >= trade.tp1 : livePrice <= trade.tp1;
    if (tp1Hit) return { price: trade.tp1, reason: `止盈 TP1(平${pct1}%)`, partialClose: "tp1", closePct: pct1 };
  }
  // TP2
  if (trade.tp2 != null && !trade.tp2Closed && pct2 != null) {
    const tp2Hit = isLong ? livePrice >= trade.tp2 : livePrice <= trade.tp2;
    if (tp2Hit) return { price: trade.tp2, reason: `止盈 TP2(平${pct2}%)`, partialClose: "tp2", closePct: pct2 };
  }
  // TP3：未設或 allUnset 時預設為 100%（全平）
  if (trade.tp3 != null && !trade.tp3Closed) {
    const tp3Hit = isLong ? livePrice >= trade.tp3 : livePrice <= trade.tp3;
    if (tp3Hit) {
      const finalPct = pct3 != null ? pct3 : (allUnset ? 100 : null);
      if (finalPct != null) {
        return { price: trade.tp3, reason: `止盈 TP3${finalPct === 100 ? "" : `(平${finalPct}%)`}`, partialClose: "tp3", closePct: finalPct };
      }
    }
  }
  return null;
}

// 異常偵測：監控連續虧損、時段虧損、24H總虧損

export function detectAnomalies(closed, settings, pushNotif) {
  if (!closed || closed.length < 3) return;
  // 1. 連續虧損檢測（最近5單）
  const last5 = closed.slice(0, 5);
  const losses = last5.filter(t => t.pnlPct < 0).length;
  if (losses >= 4) {
    pushNotif({
      symbol: "SYSTEM",
      signal: `⚠️ 最近5單連虧${losses}次，勝率低迷，建議檢視策略或暫停`,
      color: "#ef5350",
      confidence: 0,
      sound: "liq"
    });
  }
  // 2. 時段虧損（按進場時間分組）
  const byHour = {};
  closed.slice(0, 20).forEach(t => {
    if (!t.ts) return;
    const h = new Date(t.ts).getHours();
    if (!byHour[h]) byHour[h] = { wins: 0, losses: 0 };
    if (t.pnlPct >= 0) byHour[h].wins++;
    else byHour[h].losses++;
  });
  Object.entries(byHour).forEach(([h, stats]) => {
    if (stats.losses >= 3 && stats.losses > stats.wins) {
      pushNotif({
        symbol: "SYSTEM",
        signal: `📍 ${h}時進場連虧${stats.losses}次，此時段可能黑名單`,
        color: "#f0b90b",
        confidence: 0
      });
    }
  });
  // 3. 24H虧損總額
  const day1 = closed.filter(t => t.closedTs && Date.now() - t.closedTs < 24 * 60 * 60 * 1000);
  const dayPnl = day1.reduce((s, t) => s + (t.pnlPct || 0), 0);
  if (dayPnl < -30 && day1.length >= 3) {
    pushNotif({
      symbol: "SYSTEM",
      signal: `🛑 近24H虧損${dayPnl.toFixed(1)}%，風控停止`,
      color: "#ef5350",
      confidence: 0,
      sound: "liq"
    });
  }
}

// ═══════════ 交易分享卡（可截圖）═══════════════════════════════════════════
