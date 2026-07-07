import { useState, useEffect, useMemo, useRef, memo } from "react";
import {
  scanAutoTrades, subscribeCryptoTicker, analyzeBTCTrend,
  getBTCCorrelationOrDefault, computeBTCAdjust,
} from "../../data.js";
import { fmtPrice, pnlColor, fmtNum } from "../../utils/format.js";
import {
  loadAutoTrades, saveAutoTrades,
  loadClosedTrades, saveClosedTrades, syncNewClosedToJournal,
  loadAutoTradesTs, saveAutoTradesTs,
} from "../../utils/storage.js";
import { evalClose, computeOutcome, detectAnomalies } from "../../utils/trade.js";
import Section from "../../components/Section.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import AutoTradeCard from "./AutoTradeCard.jsx";
import ShareCard from "./ShareCard.jsx";
import RiskOverview from "./RiskOverview.jsx";
import ClosedTradesSection from "./ClosedTradesSection.jsx";
import DailyBacktest from "./DailyBacktest.jsx";
import WinRateFeedback from "./WinRateFeedback.jsx";

export default function AutoTrades({ coins, onNotify, onSetAlert, settings }) {
  const [data, setData] = useState(() => {
    const d = loadAutoTrades();
    d.longs = (d.longs || []).map(t => ({ ...t, id: t.id || `${t.symbol}-${t.ts}` }));
    d.shorts = (d.shorts || []).map(t => ({ ...t, id: t.id || `${t.symbol}-${t.ts}` }));
    return d;
  });
  const [closed, setClosed] = useState(() => loadClosedTrades());
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [lastScanTs, setLastScanTs] = useState(() => loadAutoTradesTs());
  const [livePrices, setLivePrices] = useState({});
  const cancelledRef = useRef({});
  const lowScoreCountRef = useRef({});
  const [sortMode, setSortMode] = useState("score"); // score | pnl
  const [shareTarget, setShareTarget] = useState(null);
  const [btcNowState, setBtcNowState] = useState(null);

  // 定期更新目前 BTC 狀態（每 5 分鐘）給卡片警示用
  useEffect(() => {
    let cancel = false;
    const update = async () => {
      try {
        const s = await analyzeBTCTrend();
        if (!cancel) setBtcNowState(s);
      } catch {}
    };
    update();
    const iv = setInterval(update, 5 * 60 * 1000);
    return () => { cancel = true; clearInterval(iv); };
  }, []);

  // 掃描排行：計算幣種出現在多個掃描的次數
  const computeScanRanking = useMemo(() => {
    const ranking = new Map();
    const addToRanking = (items, category) => {
      if (!items || !Array.isArray(items)) return;
      items.forEach(item => {
        const sym = item.symbol;
        if (!ranking.has(sym)) ranking.set(sym, { symbol: sym, name: item.name, cats: new Set(), score: 0 });
        ranking.get(sym).cats.add(category);
      });
    };
    addToRanking(data.longs, "推薦多");
    addToRanking(data.shorts, "推薦空");
    return Array.from(ranking.values())
      .map(r => ({ ...r, score: r.cats.size }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  }, [data]);

  // 依現價計算單子未實現盈虧%
  const livePnl = (t) => {
    const live = livePrices[t.symbol];
    if (!live || !t.entry) return null;
    return t.direction === "long" ? ((live - t.entry) / t.entry) * 100 : ((t.entry - live) / t.entry) * 100;
  };
  const sortTrades = (arr) => {
    const a = [...arr];
    if (sortMode === "pnl") {
      a.sort((x, y) => {
        const px = livePnl(x), py = livePnl(y);
        if (px == null && py == null) return 0;
        if (px == null) return 1;
        if (py == null) return -1;
        return py - px;
      });
    } else {
      a.sort((x, y) => (y.finalScore || 0) - (x.finalScore || 0));
    }
    return a;
  };

  useEffect(() => { saveAutoTrades(data); }, [data]);
  const prevClosedLenRef = useRef(closed.length);
  useEffect(() => {
    saveClosedTrades(closed);
    // 只在新增時同步（避免每次 state 變都掃全表）
    if (closed.length > prevClosedLenRef.current) {
      const newOnes = closed.slice(0, closed.length - prevClosedLenRef.current);
      syncNewClosedToJournal(newOnes);
    }
    prevClosedLenRef.current = closed.length;
  }, [closed]);

  // 異常偵測（每5分鐘檢測一次）— 用 ref 避免頻繁重建 interval
  const lastAnomalyCheckRef = useRef(0);
  const closedRef = useRef(closed);
  const settingsRef = useRef(settings);
  useEffect(() => { closedRef.current = closed; }, [closed]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastAnomalyCheckRef.current > 5 * 60 * 1000) {
        try { detectAnomalies(closedRef.current, settingsRef.current, onNotify); } catch {}
        lastAnomalyCheckRef.current = Date.now();
      }
    }, 60000); // 30秒→60秒
    return () => clearInterval(t);
  }, [onNotify]);
  useEffect(() => { saveAutoTradesTs(lastScanTs); }, [lastScanTs]);

  const PER_SIDE = settings?.perSide ?? 5;

  // 即時價格（用 coins 列表）
  useEffect(() => {
    if (!coins || !coins.length) return;
    const map = {};
    [...data.longs, ...data.shorts].forEach((t) => {
      const c = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""));
      if (c) map[t.symbol] = c.price;
    });
    setLivePrices((prev) => ({ ...prev, ...map }));
  }, [coins, data]);

  // 監控自動平倉：價格觸及 SL / 最終TP 時自動移到已結束區並通知
  useEffect(() => {
    if (!livePrices || Object.keys(livePrices).length === 0) return;
    const toClose = [];
    ["longs", "shorts"].forEach((side) => {
      data[side].forEach((t) => {
        const live = livePrices[t.symbol]; // O(1) 直接查
        const res = evalClose(t, live, settings);
        if (res) toClose.push({ side, trade: t, ...res });
      });
    });
    if (toClose.length === 0) return;
    setData((prev) => {
      const next = { longs: [...prev.longs], shorts: [...prev.shorts] };
      toClose.forEach(({ side, trade }) => {
        next[side] = next[side].filter((x) => x.id !== trade.id);
      });
      return next;
    });
    setClosed((prev) => {
      const add = toClose.map(({ trade, price, reason, partialClose }) => {
        const outcome = computeOutcome(trade, price, reason);
        if (partialClose) outcome.partialClose = partialClose;
        // 分批止盈時標記該部位為已平
        if (partialClose === "tp1") trade.tp1Closed = true;
        else if (partialClose === "tp2") trade.tp2Closed = true;
        else if (partialClose === "tp3") trade.tp3Closed = true;
        return outcome;
      });
      return [...add, ...prev].slice(0, 500);
    });
    toClose.forEach(({ trade, price, reason }) => {
      const win = (trade.direction === "long" ? price >= trade.entry : price <= trade.entry);
      if (onNotify) onNotify({
        symbol: trade.name || trade.symbol,
        signal: `自動平倉 · ${reason}`,
        color: reason === "止損" ? "#ef5350" : win ? "#26a69a" : "#f0b90b",
        confidence: trade.finalScore,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrices]);

  async function runScan() {
    if (!coins || !coins.length || scanning) return;
    setScanning(true);
    setScanProgress({ stage: 1, done: 0, total: coins.length });
    try {
      // 從已結束單算歷史勝率權重（回饋到評分）
      const weights = (() => {
        if (!closed || closed.length < 3) return null;
        const byStruc = {}, byDir = {};
        closed.forEach((t) => {
          const win = t.pnlPct >= 0;
          const struc = (t.structure || "").split(" ")[0];
          const dir = t.direction === "long" ? "做多" : "做空";
          if (struc) { (byStruc[struc] = byStruc[struc] || { w: 0, n: 0 }); byStruc[struc].n++; if (win) byStruc[struc].w++; }
          (byDir[dir] = byDir[dir] || { w: 0, n: 0 }); byDir[dir].n++; if (win) byDir[dir].w++;
        });
        const finalize = (m) => { const o = {}; Object.keys(m).forEach((k) => { o[k] = { n: m[k].n, winRate: m[k].n ? (m[k].w / m[k].n) * 100 : 0 }; }); return o; };
        return { structure: finalize(byStruc), direction: finalize(byDir) };
      })();
      const scanCount = settings.scanTopN > 0 ? Math.min(settings.scanTopN, coins.length) : coins.length;
      const r = await scanAutoTrades(coins, scanCount, PER_SIDE, (p) => setScanProgress(p), weights);

      // 套用 BTC 趨勢過濾（方案 D：相關性加權）
      if (settings.btcFilterLevel && settings.btcFilterLevel !== "off") {
        let btcTrend = null;
        try { btcTrend = await analyzeBTCTrend(); } catch (e) { btcTrend = null; }
        if (btcTrend) {
          const lvl = settings.btcFilterLevel;
          const adjustList = (list, isLong) => {
            const out = [];
            for (const t of list) {
              const item = { name: t.symbol.replace("-USDT", ""), symbol: t.symbol, cat: "crypto" };
              const corr = getBTCCorrelationOrDefault(item);
              const adjust = computeBTCAdjust(btcTrend, lvl, isLong, corr);
              out.push(Object.assign({}, t, {
                finalScore: (t.finalScore || 0) + adjust,
                btcAdjust: adjust,
                btcCorr: corr,
                btcState: btcTrend,
              }));
            }
            out.sort((a, b) => b.finalScore - a.finalScore);
            return out.slice(0, PER_SIDE);
          };
          r.longs = adjustList(r.longs, true);
          r.shorts = adjustList(r.shorts, false);
        }
      }

      // 新掃描結果建立 symbol→finalScore 對照，用於評分過低平倉
      const freshScore = {};
      [...r.longs, ...r.shorts].forEach((t) => { freshScore[t.symbol] = t.finalScore; });

      const closeList = [];
      setData((prev) => {
        function processSide(side, existing, fresh) {
          const th = settings.scoreCloseTh;
          const stillOpen = existing.filter((t) => {
            const live = coins.find((x) => x.symbol === t.symbol || x.name === t.symbol.replace("-USDT", ""))?.price;
            // 價格觸發優先（SL/最終TP）
            const priceRes = evalClose(t, live, settings);
            if (priceRes) { closeList.push({ side, trade: t, ...priceRes }); lowScoreCountRef.current[t.id] = 0; return false; }
            // 評分平倉：根據設定的連續次數才平
            const curScore = freshScore[t.symbol];
            if (curScore != null && curScore < th) {
              if (settings.scoreCloseConfirm) {
                const cnt = (lowScoreCountRef.current[t.id] || 0) + 1;
                lowScoreCountRef.current[t.id] = cnt;
                if (cnt >= (settings.scoreConsecutive || 2)) { closeList.push({ side, trade: t, price: live, reason: "評分過低" }); return false; }
                return true;
              } else {
                closeList.push({ side, trade: t, price: live, reason: "評分過低" }); return false;
              }
            } else {
              lowScoreCountRef.current[t.id] = 0;
            }
            return true;
          });
          const existingSymbols = new Set(stillOpen.map((t) => t.symbol));
          const need = PER_SIDE - stillOpen.length;
          // 跳過 10 分鐘內剛撤銷的幣種，避免立刻補回同一支
          const now = Date.now();
          const isRecentlyCancelled = (sym) => {
            const ts = cancelledRef.current[sym];
            return ts && (now - ts) < 10 * 60 * 1000;
          };
          const newOnes = fresh.filter((t) => !existingSymbols.has(t.symbol) && !isRecentlyCancelled(t.symbol)).slice(0, Math.max(0, need)).map((t) => ({ ...t, id: `${t.symbol}-${t.ts}` }));
          return [...stillOpen, ...newOnes];
        }
        return {
          longs: processSide("longs", prev.longs, r.longs),
          shorts: processSide("shorts", prev.shorts, r.shorts),
        };
      });

      if (closeList.length > 0) {
        setClosed((prev) => {
          const add = closeList.map(({ trade, price, reason, partialClose }) => {
            const outcome = computeOutcome(trade, price, reason);
            if (partialClose) outcome.partialClose = partialClose;
            if (partialClose === "tp1") trade.tp1Closed = true;
            else if (partialClose === "tp2") trade.tp2Closed = true;
            else if (partialClose === "tp3") trade.tp3Closed = true;
            return outcome;
          });
          return [...add, ...prev].slice(0, 500);
        });
        closeList.forEach(({ trade, price, reason }) => {
          const win = (trade.direction === "long" ? price >= trade.entry : price <= trade.entry);
          if (onNotify) onNotify({
            symbol: trade.name || trade.symbol,
            signal: `自動平倉 · ${reason}`,
            color: reason === "止損" ? "#ef5350" : win ? "#26a69a" : "#f0b90b",
            confidence: trade.finalScore,
          });
        });
      }
      setLastScanTs(Date.now());
    } catch {}
    setScanning(false);
    setScanProgress(null);
  }

  // 自動掃描：間隔由設定決定（0=只手動，但首次空清單仍會補滿一次）
  useEffect(() => {
    if (!coins || !coins.length) return;
    const mins = settings?.autoScanMins ?? 5;
    const needScan = () => {
      const totalSlots = data.longs.length + data.shorts.length;
      if (totalSlots === 0) return true; // 完全沒單，一定補
      if (mins <= 0) return false;       // 設為只手動，之後不自動掃
      return totalSlots < PER_SIDE * 2 || Date.now() - lastScanTs >= mins * 60 * 1000;
    };
    if (needScan()) runScan();
    if (mins <= 0) return; // 只手動模式不開定時器
    const iv = setInterval(() => { if (needScan()) runScan(); }, 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins, settings?.autoScanMins]);

  function clearClosed() {
    setClosed([]);
  }

  // 撤銷單：沒跟到的單直接移除，不計入回測/勝率回饋。移除後觸發掃描補齊空位。
  function cancelTrade(trade) {
    const side = trade.direction === "long" ? "longs" : "shorts";
    // 記錄剛撤銷的幣種，短時間內掃描補單時跳過它，避免立刻又補回同一支
    cancelledRef.current[trade.symbol] = Date.now();
    setData((prev) => ({ ...prev, [side]: prev[side].filter((t) => t.id !== trade.id) }));
    // 稍後自動掃描補齊（給 state 更新一點時間）
    setTimeout(() => { runScan(); }, 300);
  }

  // 手動止盈：用現價平倉，計入回測/勝率回饋，移到已結束區。
  function manualClose(trade, livePrice) {
    if (livePrice == null) return;
    const side = trade.direction === "long" ? "longs" : "shorts";
    // 從進行中移除
    setData((prev) => ({ ...prev, [side]: prev[side].filter((t) => t.id !== trade.id) }));
    // 寫入已結束（reason = 手動止盈，會計入回測與勝率回饋）
    setClosed((prev) => [computeOutcome(trade, livePrice, "手動平倉"), ...prev].slice(0, 500));
    const win = (trade.direction === "long" ? livePrice >= trade.entry : trade.entry >= livePrice);
    if (onNotify) onNotify({
      symbol: trade.name || trade.symbol,
      signal: `手動平倉 · ${win ? "獲利" : "虧損"}出場`,
      color: win ? "#26a69a" : "#f0b90b",
      confidence: trade.finalScore,
      sound: "normal",
    });
    // 平掉後留下空位，稍後掃描補齊
    setTimeout(() => { runScan(); }, 300);
  }

  return (
    <>
      <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>🤖 自動推薦單</div>
          <div style={{ color: "#4a5568", fontSize: 9 }}>全市場掃描 · SMC+AI共識+SNR · 自動平倉(SL/TP/評分低於40)</div>
        </div>
        <button onClick={runScan} disabled={scanning} style={{ background: scanning ? "#1a2535" : "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: scanning ? 0.5 : 1 }}>{scanning ? "掃描中..." : "↻ 重新掃描"}</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>排序：</span>
        {[["score", "評分"], ["pnl", "未實現盈虧"]].map(([id, label]) => (
          <button key={id} onClick={() => setSortMode(id)} style={{ background: sortMode === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${sortMode === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: sortMode === id ? "#58a6ff" : "#5a6b80", padding: "4px 12px", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
        ))}
      </div>

      {scanning && scanProgress && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>
              {scanProgress.stage === 1 ? "第一階段：全市場SMC初篩" : "第二階段：AI共識精選"} {scanProgress.done} / {scanProgress.total}
            </span>
          </div>
          <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${scanProgress.total ? (scanProgress.done / scanProgress.total) * 100 : 0}%`, height: "100%", background: scanProgress.stage === 1 ? "#58a6ff" : "#a78bfa", transition: "width .3s ease" }} />
          </div>
        </div>
      )}

      {scanning && data.longs.length === 0 && data.shorts.length === 0 && (
        <div style={{ marginBottom: 10 }}>
          {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 110, marginBottom: 8 }} />)}
        </div>
      )}

      <RiskOverview longs={data.longs} shorts={data.shorts} livePrices={livePrices} />

      <Section title={`🟢 做多建議 (${data.longs.length}/${PER_SIDE})`} color="#26a69a" defaultOpen={true}>
        {data.longs.length === 0 && !scanning && <EmptyState text="暫無符合條件的做多標的" hint="等下次掃描或調整門檻" />}
        {sortTrades(data.longs).map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onCancel={cancelTrade} onManualClose={manualClose} onShare={(tr, lp) => setShareTarget({ trade: tr, livePrice: lp })} onSetAlert={onSetAlert} btcNowState={btcNowState} />)}
      </Section>

      <Section title={`🔴 做空建議 (${data.shorts.length}/${PER_SIDE})`} color="#ef5350" defaultOpen={true}>
        {data.shorts.length === 0 && !scanning && <EmptyState text="暫無符合條件的做空標的" hint="等下次掃描或調整門檻" />}
        {sortTrades(data.shorts).map((t) => <AutoTradeCard key={t.id} trade={t} livePrice={livePrices[t.symbol]} onCancel={cancelTrade} onManualClose={manualClose} onShare={(tr, lp) => setShareTarget({ trade: tr, livePrice: lp })} onSetAlert={onSetAlert} btcNowState={btcNowState} />)}
      </Section>

      {lastScanTs > 0 && <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", textAlign: "center", padding: "4px" }}>上次掃描：{new Date(lastScanTs).toLocaleTimeString()}</div>}

      {/* 掃描排行（多掃描共振） */}
      {computeScanRanking.length > 0 && (
        <Section title="📊 掃描排行（共振幣種）" color="#a78bfa" defaultOpen={false}>
          <div style={{ fontSize: 9, color: "#5a6b80", marginBottom: 8, lineHeight: 1.4 }}>出現在多個掃描的幣種排行。🔥 標記：3種掃描都出現；★ 2種；● 1種。</div>
          {computeScanRanking.map((item, idx) => (
            <div key={item.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: idx < 3 ? "#0f1e2e" : "#0a1218", borderRadius: 4, marginBottom: 4 }}>
              <span style={{ color: item.score >= 3 ? "#ff6b35" : item.score >= 2 ? "#ffd700" : "#c9d1d9", fontSize: 12, fontWeight: 700, minWidth: 20 }}>
                {item.score >= 3 ? "🔥" : item.score >= 2 ? "★" : "●"}
              </span>
              <span style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 80 }}>{item.name || item.symbol}</span>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {item.cats.has("推薦多") && <span style={{ fontSize: 7, background: "#26a69a33", color: "#26a69a", padding: "1px 4px", borderRadius: 2 }}>推多</span>}
                {item.cats.has("推薦空") && <span style={{ fontSize: 7, background: "#ef535033", color: "#ef5350", padding: "1px 4px", borderRadius: 2 }}>推空</span>}
                {item.cats.has("警報") && <span style={{ fontSize: 7, background: "#f0b90b33", color: "#f0b90b", padding: "1px 4px", borderRadius: 2 }}>警報</span>}
                {item.cats.has("爆發") && <span style={{ fontSize: 7, background: "#f0906e33", color: "#f0906e", padding: "1px 4px", borderRadius: 2 }}>爆發</span>}
              </div>
              <span style={{ color: "#4a5568", fontSize: 9 }}>{item.cats.size} 掃</span>
            </div>
          ))}
        </Section>
      )}

      <ClosedTradesSection closed={closed} />
      <DailyBacktest closed={closed} onClear={clearClosed} />
      <WinRateFeedback closed={closed} />

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px", marginTop: 4 }}>
        <p style={{ color: "#5a6b80", marginBottom: 4 }}>說明：</p>
        <p>· 進場價=現價，SL=ATR×1.5，TP優先SNR否則ATR(2x/4x/6x)</p>
        <p>· 自動平倉：觸及SL／最終TP／重新掃描時評分掉到低於40</p>
        <p>· 平倉後移到「已結束」區並跳通知，每日回測統計當日效益</p>
      </div>

      {shareTarget && <ShareCard trade={shareTarget.trade} livePrice={shareTarget.livePrice} onClose={() => setShareTarget(null)} />}
    </>
  );
}

// 已結束單列表（可收合）
