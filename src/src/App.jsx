import { useState, useEffect, useMemo, useRef, memo } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti,
  calcSMA, calcMACD, calcRSI, calcKDJ,
  loadJin10Flash, subscribeCryptoTicker, loadPeriodChanges, subscribeLiquidations,
  scanRecommendations, scanAnomalies, analyzeMultiAI, scanExplosive, scanAutoTrades, backtestMTF,
  analyzeBTCTrend, getBTCCorrelationOrDefault, computeBTCAdjust,
} from "./data.js";

// 常數
import {
  INTERVALS, SETTINGS_KEY, DEFAULT_SETTINGS, WATCHLIST_KEY, ALERTS_KEY,
} from "./constants.js";

// 工具
import {
  pnlColor, scoreColor, fmtPrice, fmtNum, fmtFeedTime, useIsMobile,
} from "./utils/format.js";
import {
  loadSettings, saveSettings, loadWatchlist, saveWatchlist,
  loadPriceAlerts, savePriceAlerts, loadSigHistory, saveSigHistory,
} from "./utils/storage.js";

// 通用元件
import CountUp from "./components/CountUp.jsx";
import EmptyState from "./components/EmptyState.jsx";
import Section from "./components/Section.jsx";
import IndRow from "./components/IndRow.jsx";
import FeedState from "./components/FeedState.jsx";
import SearchInput from "./components/SearchInput.jsx";
import AICard from "./components/AICard.jsx";
import Gauge from "./components/Gauge.jsx";
import MTFAnalysis from "./components/MTFAnalysis.jsx";
import ScoreCard from "./components/ScoreCard.jsx";
import TVChart from "./components/TVChart.jsx";

// Feature 元件
import AutoTrades from "./features/AutoTrades/AutoTrades.jsx";
import TradeJournal from "./features/TradeJournal/TradeJournal.jsx";
import BacktestPanel from "./features/Analysis/BacktestPanel.jsx";
import MarketOverview from "./features/Analysis/MarketOverview.jsx";
import PriceAlertCard from "./features/Analysis/PriceAlertCard.jsx";

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [watchList, setWatchList] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cryptex_watch_list_v1") || "{}"); }
    catch { return {}; }
  });
  // watchList = { "BTC-USDT": ["ETH-USDT", "SOL-USDT"], ... }
  useEffect(() => {
    try { localStorage.setItem("cryptex_watch_list_v1", JSON.stringify(watchList)); }
    catch {}
  }, [watchList]);
  const [tf, setTf] = useState("1H");
  const [candles, setCandles] = useState([]);
  const [sideTab, setSideTab] = useState(() => {
    try { return localStorage.getItem("cryptex_side_tab") || "overview"; } catch { return "overview"; }
  });
  useEffect(() => { try { localStorage.setItem("cryptex_side_tab", sideTab); } catch {} }, [sideTab]);
  const [smc, setSmc] = useState(null);
  const [smcMulti, setSmcMulti] = useState([]);
  const [notif, setNotif] = useState(null);
  const [notifOn, setNotifOn] = useState(false);
  const [status, setStatus] = useState("載入中...");
  const [loadError, setLoadError] = useState(false);
  const [j10flash, setJ10flash] = useState(undefined);
  const [periodChg, setPeriodChg] = useState(null);
  const [recs, setRecs] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsTs, setRecsTs] = useState(0);
  const [recsProgress, setRecsProgress] = useState({ done: 0, total: 0 });
  const [alerts, setAlerts] = useState([]);
  const [listLimit, setListLimit] = useState(50);
  const [multiAI, setMultiAI] = useState(null);
  const [multiAILoading, setMultiAILoading] = useState(false);
  const [alertSubTab, setAlertSubTab] = useState("recs");
  const [infoSubTab, setInfoSubTab] = useState("jin10");
  const [explosive, setExplosive] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const prevExplosiveSymsRef = useRef(new Set());
  const [explosiveLoading, setExplosiveLoading] = useState(false);
  const [explosiveTs, setExplosiveTs] = useState(0);
  const [explosiveProgress, setExplosiveProgress] = useState({ done: 0, total: 0 });
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [priceAlerts, setPriceAlerts] = useState(() => loadPriceAlerts());
  const [showWatchOnly, setShowWatchOnly] = useState(false);
  const [liquidations, setLiquidations] = useState([]);
  const [settings, setSettings] = useState(() => loadSettings());
  useEffect(() => { saveSettings(settings); }, [settings]);
  const [wsEpoch, setWsEpoch] = useState(0);
  const [sigHistory, setSigHistory] = useState(() => loadSigHistory());
  useEffect(() => { saveSigHistory(sigHistory); }, [sigHistory]);
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShowSplash(false), 1600); return () => clearTimeout(t); }, []);

  // localStorage 清理：移除超過 30 天的已結束單，避免無限累積
  useEffect(() => {
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const raw = localStorage.getItem(AUTO_CLOSED_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        const kept = arr.filter((t) => (t.closedTs || 0) >= cutoff).slice(0, 500);
        if (kept.length !== arr.length) localStorage.setItem(AUTO_CLOSED_KEY, JSON.stringify(kept));
      }
    } catch {}
  }, []);

  // 頁面從背景回到前景時，重連 WebSocket（手機切App常斷線）
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") setWsEpoch((e) => e + 1); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onVis); };
  }, []);

  // 顯示模式（護眼/高對比）套到 body
  useEffect(() => {
    const mode = settings?.displayMode || "normal";
    document.body.classList.remove("eyecomfort", "hicontrast");
    if (mode === "eyecomfort") document.body.classList.add("eyecomfort");
    else if (mode === "hicontrast") document.body.classList.add("hicontrast");
  }, [settings?.displayMode]);

  // 快捷鍵：1-5 切分頁、/ 聚焦搜尋
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
      const tabs = ["overview", "indicators", "scan", "journal", "info"];
      if (e.key >= "1" && e.key <= "5") { setSideTab(tabs[parseInt(e.key, 10) - 1]); }
      else if (e.key === "/") { e.preventDefault(); const el = document.querySelector('input[placeholder*="搜尋"]'); if (el) el.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lastSig = useRef(null);
  const alertFiredRef = useRef({});

  // 關注清單 / 到價提醒持久化
  useEffect(() => { saveWatchlist(watchlist); }, [watchlist]);
  useEffect(() => { savePriceAlerts(priceAlerts); }, [priceAlerts]);

  function toggleWatch(sym) {
    setWatchlist((prev) => prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]);
  }
  function addPriceAlert(symbol, target, dir) {
    setPriceAlerts((prev) => [{ id: Date.now(), symbol, target, dir, created: Date.now(), fired: false }, ...prev]);
  }
  function removePriceAlert(id) {
    setPriceAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  // 到價提醒監控：每次 coins 更新檢查
  useEffect(() => {
    if (!coins || !coins.length || !priceAlerts.length) return;
    priceAlerts.forEach((a) => {
      if (a.fired) return;
      const c = coins.find((x) => x.symbol === a.symbol || x.name === a.symbol.replace("-USDT", ""));
      if (!c) return;
      const hit = a.dir === "above" ? c.price >= a.target : c.price <= a.target;
      if (hit && !alertFiredRef.current[a.id]) {
        alertFiredRef.current[a.id] = true;
        setPriceAlerts((prev) => prev.map((x) => x.id === a.id ? { ...x, fired: true } : x));
        const p = { signal: `到價提醒 ${a.dir === "above" ? "↑" : "↓"} ${a.target}`, color: "#f0b90b", symbol: a.symbol, ts: Date.now(), confidence: 0 };
        setNotif(p);
        if (notifOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification(`🔔 ${a.symbol} 到價`, { body: `${a.dir === "above" ? "突破" : "跌破"} ${a.target}（現價 ${c.price}）` }); } catch {}
        }
        setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins, priceAlerts]);

  const filtered = useMemo(() => {
    let base = coins;
    if (showWatchOnly) base = coins.filter((c) => watchlist.includes(c.symbol));
    if (!search) return base;
    const q = search.toUpperCase();
    return base.filter((c) => c.name.toUpperCase().includes(q) || (c.symbol || "").toUpperCase().includes(q) || (c.label || "").toUpperCase().includes(q));
  }, [search, coins, showWatchOnly, watchlist]);
  const visibleList = useMemo(() => (search || showWatchOnly) ? filtered : filtered.slice(0, listLimit), [filtered, search, showWatchOnly, listLimit]);

  // 載入加密貨幣列表
  const coinCountRef = useRef(0);
  useEffect(() => {
    let cancel = false;
    async function run() {
      try {
        const list = await loadMarket("crypto");
        if (cancel || !Array.isArray(list)) return;
        const prevCount = coinCountRef.current;
        if (prevCount > 0 && list.length > 0 && list.length < prevCount * 0.7) {
          setStatus(`${prevCount} 商品 · 即時`);
          setLoadError(false);
          return;
        }
        if (list.length === 0) {
          if (prevCount === 0) { setStatus("載入失敗"); setLoadError(true); }
          return;
        }
        coinCountRef.current = list.length;
        setCoins(list);
        setStatus(`${list.length} 商品 · 即時`);
        setLoadError(false);
        setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null);
      } catch {
        if (!cancel) { setStatus("連線失敗，點擊重試"); setLoadError(true); }
      }
    }
    run();
    if (search) return () => { cancel = true; };
    const iv = setInterval(run, 30000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // 金十快訊
  useEffect(() => {
    let cancel = false;
    async function run() { const r = await loadJin10Flash(); if (!cancel) setJ10flash(r); }
    run(); const iv = setInterval(run, 60000);
    return () => { cancel = true; clearInterval(iv); };
  }, []);

  // 大額爆倉即時流（全市場強平，門檻 5 萬鎂）
  useEffect(() => {
    const off = subscribeLiquidations((liq) => {
      setLiquidations((prev) => [liq, ...prev].slice(0, 60));
      // 超大額（50萬鎂以上）跳通知
      if (liq.usd >= 500000 && notifOn) {
        const p = { signal: `💥 大額爆倉 ${liq.side === "long" ? "多單" : "空單"} $${(liq.usd / 1e6).toFixed(2)}M`, color: liq.side === "long" ? "#ef5350" : "#26a69a", symbol: liq.symbol, ts: Date.now(), confidence: 0 };
        setNotif(p);
        playBeep("liq");
        setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
      }
    }, 50000);
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOn, wsEpoch]);

  // 載入 K 線（後台用，給指標/SMC/AI 計算，UI 不畫圖）
  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    setCandles([]);
    loadKlines(selected, tf).then((k) => { if (!cancel && k && k.length) setCandles(k); });
    const iv = setInterval(() => {
      loadKlines(selected, tf).then((k) => {
        if (cancel || !k || !k.length) return;
        setCandles((prev) => (prev.length && k[k.length - 1].t === prev[prev.length - 1].t ? prev : k));
      });
    }, 60000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.symbol, tf]);

  // SMC（只在新 K 棒時重算）
  const lastCandleT = candles.length > 0 ? candles[candles.length - 1].t : 0;
  useEffect(() => {
    if (candles.length < 40 || !selected) { setSmc(null); return; }
    const r = analyzeSMC(candles); setSmc(r);
    if (r) {
      const isDir = r.signal.includes("做多") || r.signal.includes("做空");
      const key = `${selected.symbol}-${r.signal}`;
      const prevForSymbol = lastSig.current && lastSig.current.startsWith(`${selected.symbol}-`);
      // 記錄訊號歷史（方向訊號變化時）
      if (isDir && lastSig.current !== key) {
        setSigHistory((prev) => {
          const sym = selected.symbol;
          const list = prev[sym] ? [...prev[sym]] : [];
          const lastEntry = list[0];
          if (!lastEntry || lastEntry.signal !== r.signal) {
            list.unshift({ signal: r.signal, confidence: r.confidence, ts: Date.now() });
          }
          return { ...prev, [sym]: list.slice(0, 8) };
        });
      }
      if (isDir && notifOn && lastSig.current !== key) {
        // 首次看到這個幣種（剛切換過來）只記錄、不跳橫幅；之後訊號真的改變才跳
        const shouldBanner = prevForSymbol;
        lastSig.current = key;
        if (shouldBanner) {
          const p = { signal: r.signal, color: r.color, symbol: selected.symbol, ts: Date.now(), confidence: r.confidence };
          setNotif(p);
          playBeep(r.signal.includes("強力") ? "strong" : "normal");
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try { new Notification(`📊 ${selected.symbol} SMC 訊號`, { body: `${r.signal}｜信心 ${r.confidence}%` }); } catch {}
          }
          setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
        }
      } else if (!isDir && notifOn) {
        // 觀望時更新記錄，避免下次回到方向訊號被當成「首次」
        lastSig.current = key;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCandleT, selected, notifOn]);

  // SMC 多時區（只在 symbol 變時重載）
  useEffect(() => {
    if (!selected) return; let cancel = false;
    analyzeSMCMulti(selected).then((r) => { if (!cancel) setSmcMulti(r); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.symbol]);

  // 多週期漲跌（只在 symbol 變時重載，避免 coins 更新時閃爍）
  useEffect(() => {
    if (!selected) { setPeriodChg(null); return; }
    let cancel = false;
    setPeriodChg(null);
    loadPeriodChanges(selected).then((r) => { if (!cancel) setPeriodChg(r); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.symbol]);

  // Trade WebSocket（即時價）
  useEffect(() => {
    if (!selected || selected.cat !== "crypto") return;
    let lastTs = 0;
    const sym = selected.binanceSymbol || `${selected.name}USDT`;
    const off = subscribeCryptoTicker(sym, (p) => {
      const now = Date.now();
      if (now - lastTs < 200) return;
      lastTs = now;
      setCandles((cs) => {
        if (!cs || !cs.length) return cs;
        const copy = cs.slice();
        const last = { ...copy[copy.length - 1] };
        last.c = p;
        if (p > last.h) last.h = p;
        if (p < last.l) last.l = p;
        copy[copy.length - 1] = last;
        return copy;
      });
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, wsEpoch]);

  // 推薦掃描
  const coinsLoaded = coins.length > 0;
  useEffect(() => {
    if (sideTab !== "scan" || alertSubTab !== "recs" || !coinsLoaded) return;
    if (recs && Date.now() - recsTs < 5 * 60 * 1000) return;
    let cancel = false;
    setRecsLoading(true);
    setRecsProgress({ done: 0, total: coins.length });
    scanRecommendations(coins, coins.length, (done, total) => { if (!cancel) setRecsProgress({ done, total }); }).then((r) => {
      if (cancel) return;
      setRecs(r); setRecsTs(Date.now()); setRecsLoading(false);
    }).catch(() => { if (!cancel) setRecsLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, alertSubTab, coinsLoaded, recsTs]);

  // 警報掃描
  useEffect(() => {
    if (!coinsLoaded) return;
    let cancel = false;
    async function scan() {
      if (cancel) return;
      try {
        const a = await scanAnomalies(coins, coins.length);
        if (cancel) return;
        setAlerts((prev) => {
          const map = new Map();
          [...a, ...prev].forEach((x) => {
            const key = `${x.symbol}-${x.type}`;
            const ex = map.get(key);
            if (!ex || x.ts > ex.ts) map.set(key, x);
          });
          return Array.from(map.values()).sort((x, y) => y.ts - x.ts).slice(0, 50);
        });
      } catch {}
    }
    scan();
    const iv = setInterval(scan, 3 * 60 * 1000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinsLoaded]);

  // 爆發掃描（進分頁自動掃 + 每 5 分鐘自動刷新）
  useEffect(() => {
    if (sideTab !== "scan" || alertSubTab !== "explosive" || !coinsLoaded) return;
    let cancel = false;
    async function run() {
      if (cancel) return;
      setExplosiveLoading(true);
      setExplosiveProgress({ done: 0, total: coins.length });
      try {
        const r = await scanExplosive(coins, coins.length, (done, total) => { if (!cancel) setExplosiveProgress({ done, total }); });
        if (cancel) return;
        // 標記新上榜：不在前次集合內的為 NEW
        const prevSet = prevExplosiveSymsRef.current;
        r.forEach((x) => { x.isNew = !prevSet.has(x.symbol); });
        prevExplosiveSymsRef.current = new Set(r.map((x) => x.symbol));
        setExplosive(r); setExplosiveTs(Date.now());
      } catch {}
      if (!cancel) setExplosiveLoading(false);
    }
    // 進入時若無資料或超過 5 分鐘就立刻掃
    if (!explosive || Date.now() - explosiveTs >= 5 * 60 * 1000) run();
    const iv = setInterval(run, 5 * 60 * 1000);
    return () => { cancel = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, alertSubTab, coinsLoaded]);

  // 多 AI 個別分析（5 個派系）
  useEffect(() => {
    if (!selected || !candles.length || !smc) return;
    let cancel = false;
    setMultiAILoading(true);
    analyzeMultiAI(selected, candles, smc, smcMulti).then((r) => {
      if (!cancel) { setMultiAI(r); setMultiAILoading(false); }
    }).catch(() => { if (!cancel) setMultiAILoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, smc, smcMulti]);

  async function enableNotif() {
    if (typeof Notification === "undefined") { setNotifOn(true); return; }
    try { const p = await Notification.requestPermission(); setNotifOn(true); if (p === "granted") new Notification("✅ 通知已開啟", { body: "SMC 多空訊號將即時通知你" }); } catch { setNotifOn(true); }
  }

  // 通用橫幅通知（給自動平倉等使用）
  function playBeep(kind) {
    if (!settings?.soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      // 強訊號:雙高音 / 一般:中音 / 爆倉:低音
      const freqs = kind === "strong" ? [880, 1320] : kind === "liq" ? [220] : [660];
      let t = ctx.currentTime;
      freqs.forEach((f, i) => {
        o.frequency.setValueAtTime(f, t + i * 0.12);
      });
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12 * freqs.length + 0.15);
      o.start();
      o.stop(ctx.currentTime + 0.12 * freqs.length + 0.2);
      setTimeout(() => { try { ctx.close(); } catch {} }, 800);
    } catch {}
  }

  function pushNotif({ symbol, signal, color, confidence, sound }) {
    const p = { signal, color, symbol, ts: Date.now(), confidence };
    setNotif(p);
    if (sound) playBeep(sound);
    if (notifOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(`🔔 ${symbol}`, { body: signal }); } catch {}
    }
    setTimeout(() => setNotif((n) => (n && n.ts === p.ts ? null : n)), 8000);
  }

  const indData = (() => {
    if (candles.length < 30) return null;
    const closes = candles.map((c) => c.c), highs = candles.map((c) => c.h), lows = candles.map((c) => c.l), vols = candles.map((c) => c.v), n = closes.length - 1;
    const rsi = calcRSI(closes), { macd, signal, hist } = calcMACD(closes), kdj = calcKDJ(highs, lows, closes);
    return { rsi: rsi[n], macd: macd[n], signal: signal[n], hist: hist[n], kdj: kdj[n], ma5: calcSMA(closes, 5)[n], ma10: calcSMA(closes, 10)[n], ma20: calcSMA(closes, 20)[n], ma60: calcSMA(closes, 60)[n], curVol: vols[n], avgVol: vols.slice(-20).reduce((a, b) => a + b, 0) / 20 };
  })();

  const displayPrice = candles.length ? candles[candles.length - 1].c : (selected?.price || 0);
  const change24h = selected ? (coins.find((c) => c.symbol === selected.symbol)?.change ?? selected.change ?? 0) : 0;
  const up = change24h >= 0;
  const fmtPr = (v) => fmtPrice(v);
  const fmtVol = (v) => {
    if (!v || v <= 0) return "";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return String(Math.round(v));
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", color: "#c9d1d9", fontFamily: "'Sora',system-ui,sans-serif", overflow: "hidden", background: "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(247,147,26,0.10), transparent 60%), radial-gradient(ellipse 70% 50% at 85% 8%, rgba(98,126,234,0.10), transparent 55%), linear-gradient(180deg,#070c12 0%,#05080c 100%)" }}>
      {showSplash && (
        <div className="splash" style={{ position: "fixed", inset: 0, zIndex: 3000, background: "radial-gradient(ellipse at center, #0a1420, #05080c)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div className="logo-intro" style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, boxShadow: "0 0 40px -4px rgba(247,147,26,0.6)" }}>₿</div>
          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 6, color: "#e6edf3" }}>CRYPTEX</div>
          <div className="mono" style={{ color: "#5a6b80", fontSize: 10, letterSpacing: 2 }}>加密貨幣專業分析</div>
        </div>
      )}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#2a3b52,#1a2535);border-radius:3px;transition:background .2s}
::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#3a5275,#26344a)}
::-webkit-scrollbar-track{background:transparent}
button{cursor:pointer;outline:none;font-family:inherit;transition:transform .12s ease,filter .15s ease}
button:active{transform:scale(.97)}
.mono{font-family:'JetBrains Mono',monospace}
.glass{background:rgba(13,21,32,0.55);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);border:1px solid rgba(255,255,255,0.07);box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 4px 18px -8px rgba(0,0,0,0.5)}
.glass-sub{background:rgba(10,17,26,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.coin-row{transition:background .18s ease,border-color .18s ease,transform .12s ease}
.coin-row:hover{background:rgba(88,166,255,0.06)!important;transform:translateX(2px)}
.tab-btn{transition:color .2s ease,background .2s ease,transform .12s ease}
.lift{transition:transform .15s ease,box-shadow .2s ease,border-color .2s ease}
.lift:hover{transform:translateY(-1px)}
.card-hover{transition:transform .16s ease,box-shadow .2s ease,border-color .2s ease}
.card-hover:hover{transform:translateY(-2px);box-shadow:0 8px 24px -10px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.14)!important}
@keyframes slideDown{from{transform:translate(-50%,-120%);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 24px -6px var(--glow),inset 0 0 0 1px rgba(255,255,255,0.04)}50%{box-shadow:0 0 40px -4px var(--glow),inset 0 0 0 1px rgba(255,255,255,0.08)}}
@keyframes glowDriftLong{0%,100%{background-position:50% 30%}50%{background-position:50% 10%}}
@keyframes glowDriftShort{0%,100%{background-position:50% 70%}50%{background-position:50% 90%}}
@keyframes ringSpin{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--off)}}
@keyframes breathe{0%,100%{opacity:.55;filter:saturate(.85)}50%{opacity:1;filter:saturate(1.2)}}
.breathe{animation:breathe 2.6s ease-in-out infinite}
.signal-card{position:relative;animation:glowPulse 3.5s ease-in-out infinite;background-size:160% 160%!important}
.signal-card.dir-long{animation:glowPulse 3.5s ease-in-out infinite,glowDriftLong 6s ease-in-out infinite}
.signal-card.dir-short{animation:glowPulse 3.5s ease-in-out infinite,glowDriftShort 6s ease-in-out infinite}
.fade-in{animation:fadeUp .35s ease}
.tab-pane{animation:fadeIn .3s ease}
@keyframes skeletonPulse{0%,100%{opacity:.4}50%{opacity:.9}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.skeleton{border-radius:8px;background:linear-gradient(90deg,#0d1520 25%,#1a2535 50%,#0d1520 75%);background-size:200% 100%;animation:shimmer 1.6s linear infinite}
@keyframes staggerIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.stagger-item{animation:staggerIn .4s ease backwards}
.stagger-item:nth-child(1){animation-delay:.02s}
.stagger-item:nth-child(2){animation-delay:.06s}
.stagger-item:nth-child(3){animation-delay:.10s}
.stagger-item:nth-child(4){animation-delay:.14s}
.stagger-item:nth-child(5){animation-delay:.18s}
.stagger-item:nth-child(6){animation-delay:.22s}
.stagger-item:nth-child(7){animation-delay:.26s}
.stagger-item:nth-child(8){animation-delay:.30s}
.stagger-item:nth-child(n+9){animation-delay:.34s}
@keyframes logoIntro{0%{opacity:0;transform:scale(.6) rotate(-12deg)}60%{opacity:1;transform:scale(1.08) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
.logo-intro{animation:logoIntro .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes splashFade{0%{opacity:1}80%{opacity:1}100%{opacity:0;visibility:hidden}}
.splash{animation:splashFade 1.6s ease forwards}
@keyframes particleFloat{0%{transform:translateY(0) translateX(0);opacity:0}20%{opacity:.5}100%{transform:translateY(-40px) translateX(var(--px));opacity:0}}
.particle{position:absolute;width:3px;height:3px;border-radius:50%;animation:particleFloat var(--dur) ease-in-out infinite;animation-delay:var(--delay)}
body.eyecomfort{filter:saturate(.82) brightness(.94)}
body.hicontrast{filter:contrast(1.18) saturate(1.12)}
@keyframes gaugeSweep{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--goff)}}
@keyframes tabPop{0%{transform:scale(1)}40%{transform:scale(1.28)}100%{transform:scale(1)}}
.tab-icon-active{animation:tabPop .4s ease}
@keyframes newPulse{0%,100%{opacity:1}50%{opacity:.45}}
.new-badge{animation:newPulse 1.2s ease-in-out infinite}
.glow-pos{box-shadow:0 0 22px -10px #26a69a, inset 0 1px 0 rgba(255,255,255,0.05)!important}
.glow-neg{box-shadow:0 0 22px -10px #ef5350, inset 0 1px 0 rgba(255,255,255,0.05)!important}`}</style>

      {notif && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "slideDown .35s ease-out", background: "#0d1520", border: `1.5px solid ${notif.color}`, color: notif.color, borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 30px rgba(0,0,0,.6)", maxWidth: "92vw" }}>
          <div style={{ fontSize: 22 }}>{notif.signal.includes("做多") ? "📈" : "📉"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8 }}><span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{notif.symbol}</span><span style={{ color: notif.color, fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{notif.signal}</span></div>
            <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace" }}>SMC 訊號 · 信心 {notif.confidence}% · {new Date(notif.ts).toLocaleTimeString()}</div>
          </div>
          <button onClick={() => setNotif(null)} style={{ background: "transparent", border: "none", color: "#4a5568", fontSize: 18 }}>×</button>
        </div>
      )}

      <div className="glass" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", display: "flex", alignItems: "center", height: 50, gap: 14, flexShrink: 0, position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div className="logo-intro" style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#F7931A,#627EEA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 0 18px -2px rgba(247,147,26,0.55)" }}>₿</div>
          <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: 3, color: "#e6edf3" }}>CRYPTEX</span>
        </div>
        {!isMobile && (() => {
          const btc = coins.find((c) => c.name === "BTC");
          const eth = coins.find((c) => c.name === "ETH");
          const liqTotal = liquidations.reduce((s, l) => s + l.usd, 0);
          const Chip = ({ label, value, color }) => (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span className="mono" style={{ color: "#4a5568", fontSize: 8 }}>{label}</span>
              <span className="mono" style={{ color: color || "#c9d1d9", fontSize: 11, fontWeight: 700 }}>{value}</span>
            </div>
          );
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 20, paddingLeft: 20, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
              {btc && <Chip label="BTC" value={`$${btc.price >= 1000 ? (btc.price / 1000).toFixed(2) + "K" : btc.price.toFixed(0)}`} color={(btc.change || 0) >= 0 ? "#26a69a" : "#ef5350"} />}
              {eth && <Chip label="ETH" value={`$${eth.price.toFixed(0)}`} color={(eth.change || 0) >= 0 ? "#26a69a" : "#ef5350"} />}
              {liqTotal > 0 && <Chip label="近期爆倉" value={liqTotal >= 1e6 ? `$${(liqTotal / 1e6).toFixed(1)}M` : `$${(liqTotal / 1e3).toFixed(0)}K`} color="#f0b90b" />}
            </div>
          );
        })()}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}>
          {smc && (smc.signal.includes("做多") || smc.signal.includes("做空")) && <span className="mono breathe" style={{ color: smc.color, fontSize: 10, fontWeight: 700, border: `1px solid ${smc.color}`, borderRadius: 5, padding: "2px 7px", boxShadow: `0 0 12px -3px ${smc.color}` }}>{smc.signal}</span>}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950", boxShadow: "0 0 8px #3fb950" }} />
          {loadError
            ? <button onClick={() => { setLoadError(false); setStatus("重試中..."); loadMarket("crypto").then((list) => { if (Array.isArray(list) && list.length > 0) { coinCountRef.current = list.length; setCoins(list); setStatus(`${list.length} 商品 · 即時`); setSelected((prev) => (prev && list.find((c) => c.symbol === prev.symbol)) || list[0] || null); } else { setStatus("連線失敗，點擊重試"); setLoadError(true); } }).catch(() => { setStatus("連線失敗，點擊重試"); setLoadError(true); }); }} style={{ background: "#3a1a1a", border: "1px solid #ef5350", borderRadius: 4, color: "#ef5350", padding: "2px 8px", fontSize: 9, fontFamily: "monospace", cursor: "pointer" }}>⚠ 連線失敗 · 點擊重試</button>
            : <span className="mono" style={{ color: "#5a6b80", fontSize: 9 }}>{status}</span>}
        </div>
      </div>

      {/* 手機版：商品列表 chips（橫向） */}
      {isMobile && <div style={{ background: "#080d14", borderBottom: "1px solid #1a2535", flexShrink: 0 }}>
        <div style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
          <div style={{ flex: 1 }}><SearchInput key="search-box" value={search} onChange={setSearch} /></div>
          <button onClick={() => setShowWatchOnly((v) => !v)} style={{ flexShrink: 0, background: showWatchOnly ? "#1a1a0a" : "#0d1520", border: `1px solid ${showWatchOnly ? "#f0b90b" : "#1a2535"}`, borderRadius: 5, color: showWatchOnly ? "#f0b90b" : "#5a6b80", padding: "0 12px", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{showWatchOnly ? "★" : "☆"}{watchlist.length > 0 ? watchlist.length : ""}</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 8px 8px" }}>
          {visibleList.map((coin) => {
            const live = coins.find((c) => c.symbol === coin.symbol) || coin;
            const active = selected?.symbol === coin.symbol;
            return (
              <button key={coin.symbol} onClick={() => setSelected(live)} style={{ flexShrink: 0, background: active ? "#0f1e2e" : "#0d1520", border: `1px solid ${active ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, minWidth: 82, alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                  <span style={{ color: active ? "#e6edf3" : "#8b949e", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{coin.name}</span>
                  <span onClick={(e) => { e.stopPropagation(); toggleWatch(coin.symbol); }} style={{ marginLeft: "auto", color: watchlist.includes(coin.symbol) ? "#f0b90b" : "#3a4658", fontSize: 11, cursor: "pointer" }}>{watchlist.includes(coin.symbol) ? "★" : "☆"}</span>
                </div>
                <span style={{ background: (live.change || 0) >= 0 ? "#26a69a" : "#ef5350", color: "#fff", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>{(live.change || 0) >= 0 ? "+" : ""}{(live.change || 0).toFixed(2)}%</span>
              </button>
            );
          })}
        </div>
      </div>}

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", minHeight: 0 }}>
        {/* 桌面版：左側商品列表 */}
        {!isMobile && <div style={{ width: 200, background: "#080d14", borderRight: "1px solid #1a2535", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "8px" }}>
            <SearchInput key="search-box" value={search} onChange={setSearch} />
            <button onClick={() => setShowWatchOnly((v) => !v)} style={{ width: "100%", marginTop: 6, background: showWatchOnly ? "#1a1a0a" : "#0d1520", border: `1px solid ${showWatchOnly ? "#f0b90b" : "#1a2535"}`, borderRadius: 5, color: showWatchOnly ? "#f0b90b" : "#5a6b80", padding: "5px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{showWatchOnly ? "★ 只看關注" : "☆ 全部商品"} ({watchlist.length})</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ color: "#3a4658", fontSize: 10, fontFamily: "monospace", padding: "12px 10px" }}>{status}</div>}
            {visibleList.map((coin) => {
              const live = coins.find((c) => c.symbol === coin.symbol) || coin;
              const active = selected?.symbol === coin.symbol;
              return (
                <button key={coin.symbol} className="coin-row" onClick={() => setSelected(live)} style={{ width: "100%", background: active ? "linear-gradient(90deg,rgba(88,166,255,0.12),transparent)" : "transparent", border: "none", borderLeft: `2px solid ${active ? "#58a6ff" : "transparent"}`, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: active ? "#e6edf3" : "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coin.name}</div>
                    <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coin.label ? (coin.label).slice(0, 6) : ""}{fmtVol(live.volume) ? (coin.label ? " · " : "") + fmtVol(live.volume) : ""}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <span style={{ color: "#c9d1d9", fontSize: 10, fontFamily: "monospace" }}>{fmtPr(live.price)}</span>
                    <span style={{ background: (live.change || 0) >= 0 ? "#26a69a" : "#ef5350", color: "#fff", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3, minWidth: 48, textAlign: "center" }}>{(live.change || 0) >= 0 ? "+" : ""}{(live.change || 0).toFixed(2)}%</span>
                  </div>
                  <span onClick={(e) => { e.stopPropagation(); toggleWatch(coin.symbol); }} style={{ color: watchlist.includes(coin.symbol) ? "#f0b90b" : "#3a4658", fontSize: 13, flexShrink: 0, cursor: "pointer", padding: "0 2px" }}>{watchlist.includes(coin.symbol) ? "★" : "☆"}</span>
                </button>
              );
            })}
            {!search && filtered.length > visibleList.length && <button onClick={() => setListLimit((l) => l + 50)} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", color: "#58a6ff", padding: "8px", fontSize: 10, fontFamily: "monospace", cursor: "pointer" }}>載入更多 ({filtered.length - visibleList.length} 個)</button>}
          </div>
        </div>}

        {/* 主分析區（無 K 線） */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {/* 價格 header */}
          <div className="glass-sub" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span className="mono" style={{ fontSize: 24, fontWeight: 700, color: up ? "#3dd9c4" : "#ff8a87", transition: "color .3s ease" }}>${fmtPr(displayPrice)}</span>
                <span className="mono" style={{ color: "#5a6b80", fontSize: 10 }}>{selected?.symbol} · 加密貨幣</span>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div className="mono" style={{ color: up ? "#26a69a" : "#ef5350", fontSize: 14, fontWeight: 700, textShadow: `0 0 14px ${up ? "#26a69a55" : "#ef535055"}` }}>{up ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%</div>
                <div className="mono" style={{ color: "#5a6b80", fontSize: 9 }}>24h 變化</div>
              </div>
            </div>
          </div>

          {/* 多週期 bar */}
          {periodChg && <div style={{ background: "#0a1218", borderBottom: "1px solid #1a2535", padding: "5px 8px", display: "flex", alignItems: "center", flexShrink: 0, overflowX: "auto" }}>
            {[["今日", periodChg.today], ["7天", periodChg.d7], ["30天", periodChg.d30], ["90天", periodChg.d90], ["180天", periodChg.d180], ["1年", periodChg.y1]].map(([lbl, val]) => (
              <div key={lbl} style={{ flex: 1, minWidth: 52, textAlign: "center", padding: "0 4px" }}>
                <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{lbl}</div>
                <div style={{ color: val == null ? "#4a5568" : val >= 0 ? "#26a69a" : "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>{val == null ? "—" : (val >= 0 ? "+" : "") + val.toFixed(2) + "%"}</div>
              </div>
            ))}
          </div>}

          {/* 時間框架（給分析用） */}
          <div style={{ background: "#0a1218", borderBottom: "1px solid #1a2535", padding: "6px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>分析時間框架:</span>
            {INTERVALS.map((iv) => (
              <button key={iv} onClick={() => setTf(iv)} style={{ background: tf === iv ? "#0f1e2e" : "transparent", border: `1px solid ${tf === iv ? "#58a6ff" : "#1a2535"}`, borderRadius: 4, color: tf === iv ? "#58a6ff" : "#8b949e", padding: "3px 10px", fontSize: 10, fontFamily: "monospace" }}>{iv}</button>
            ))}
          </div>

          {/* 分頁 */}
          <div className="glass-sub" style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            {[["overview", "📊", "總覽"], ["indicators", "📈", "指標"], ["scan", "🔍", "掃描"], ["journal", "💼", "交易"], ["info", "ℹ️", "資訊"]].map(([id, icon, label]) => (
              <button key={id} className="tab-btn" onClick={() => setSideTab(id)} style={{ flex: 1, background: sideTab === id ? "linear-gradient(180deg,rgba(88,166,255,0.14),transparent)" : "transparent", border: "none", borderBottom: `2px solid ${sideTab === id ? "#58a6ff" : "transparent"}`, color: sideTab === id ? "#e6edf3" : "#5a6b80", padding: "10px 0 9px", fontSize: 11, fontWeight: sideTab === id ? 700 : 500, fontFamily: "'Sora',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span key={sideTab === id ? "a" : "i"} className={sideTab === id ? "tab-icon-active" : ""} style={{ fontSize: 14, opacity: sideTab === id ? 1 : 0.6 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>


          <div
            style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}
            onTouchStart={(e) => { if (isMobile) { window.__txs = e.touches[0].clientX; window.__tys = e.touches[0].clientY; } }}
            onTouchEnd={(e) => {
              if (!isMobile || window.__txs == null) return;
              const dx = e.changedTouches[0].clientX - window.__txs;
              const dy = e.changedTouches[0].clientY - window.__tys;
              window.__txs = null;
              if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) {
                const tabs = ["overview", "indicators", "scan", "journal", "info"];
                const idx = tabs.indexOf(sideTab);
                if (dx < 0 && idx < tabs.length - 1) setSideTab(tabs[idx + 1]);
                else if (dx > 0 && idx > 0) setSideTab(tabs[idx - 1]);
              }
            }}
          >
            <div key={sideTab} className="tab-pane">
            {/* SMC */}
            {sideTab === "overview" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空訊號通知</div><div style={{ color: "#4a5568", fontSize: 9 }}>橫幅 + 系統通知</div></div>
                <button onClick={enableNotif} style={{ background: notifOn ? "#26a69a" : "#1a2535", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{notifOn ? "✓ 已開啟" : "開啟通知"}</button>
              </div>
              <TVChart symbol={selected?.symbol} />
              <MarketOverview recs={recs} liquidations={liquidations} coins={coins} />
              <PriceAlertCard symbol={selected?.symbol} currentPrice={displayPrice} alerts={priceAlerts} onAdd={addPriceAlert} onRemove={removePriceAlert} />
              {smc ? <>
                <div className={`signal-card ${smc.signal.includes("做多") ? "dir-long" : smc.signal.includes("做空") ? "dir-short" : ""}`} style={{ "--glow": `${smc.color}66`, background: `linear-gradient(145deg, ${smc.color}1f, rgba(13,21,32,0.6))`, border: `1px solid ${smc.color}88`, borderRadius: 16, padding: "18px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16, position: "relative", overflow: "hidden" }}>
                  {smc.signal.includes("強力") && [...Array(8)].map((_, i) => (
                    <span key={i} className="particle" style={{ left: `${10 + i * 11}%`, bottom: 0, background: smc.color, "--px": `${(i % 2 ? 1 : -1) * (8 + i)}px`, "--dur": `${2.5 + (i % 3) * 0.6}s`, "--delay": `${i * 0.3}s` }} />
                  ))}
                  <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
                    <svg width="76" height="76" style={{ transform: "rotate(-90deg)" }}>
                      <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f0b90b" />
                          <stop offset="100%" stopColor={smc.color} />
                        </linearGradient>
                      </defs>
                      <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                      <circle cx="38" cy="38" r="32" fill="none" stroke="url(#ringGrad)" strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 32} strokeDashoffset={2 * Math.PI * 32 * (1 - (smc.confidence || 0) / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 5px ${smc.color})` }} />
                      {(() => {
                        const ang = (-90 + (smc.confidence || 0) / 100 * 360) * Math.PI / 180;
                        const cx = 38 + 32 * Math.cos(ang), cy = 38 + 32 * Math.sin(ang);
                        return <circle cx={cx} cy={cy} r="3.5" fill="#fff" style={{ filter: `drop-shadow(0 0 4px ${smc.color})`, transition: "all .8s cubic-bezier(.4,0,.2,1)" }} />;
                      })()}
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <CountUp value={smc.confidence} className="mono" style={{ color: smc.color, fontSize: 18, fontWeight: 700, lineHeight: 1 }} />
                      <span className="mono" style={{ color: "#5a6b80", fontSize: 8 }}>信心</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ color: "#5a6b80", fontSize: 9, marginBottom: 5, letterSpacing: 1 }}>SMC 綜合訊號 · {selected?.symbol} · {tf}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={smc.signal.includes("做多") || smc.signal.includes("做空") ? "breathe" : ""} style={{ color: smc.color, fontSize: 26, lineHeight: 1, textShadow: `0 0 16px ${smc.color}88` }}>
                        {smc.signal.includes("做多") ? "▲" : smc.signal.includes("做空") ? "▼" : "—"}
                      </span>
                      <div style={{ color: smc.color, fontSize: 28, fontWeight: 800, fontFamily: "'Sora',sans-serif", letterSpacing: 1, lineHeight: 1, textShadow: `0 0 20px ${smc.color}55` }}>{smc.signal}</div>
                    </div>
                  </div>
                </div>

                {multiAILoading && !multiAI && <div>
                  {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 36, marginBottom: 6 }} />)}
                </div>}
                {multiAI && multiAI.length > 0 && (() => {
                  const consensus = multiAI[multiAI.length - 1];
                  return (
                    <div style={{ background: `${consensus.color}14`, border: `1.5px solid ${consensus.color}`, borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
                      <div style={{ color: "#5a6b80", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>🧠 AI 共識 · {selected?.symbol}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: consensus.color, fontFamily: "monospace" }}>{consensus.direction}</div>
                      <div style={{ color: consensus.color, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>共識信心 {consensus.confidence}%</div>
                    </div>
                  );
                })()}

                <ScoreCard symbol={selected?.symbol} smc={smc} multiAI={multiAI} hideHeader={true} />

                <MTFAnalysis smcMulti={smcMulti} smc={smc} />

                {sigHistory[selected?.symbol]?.length > 1 && (
                  <Section title="🕐 訊號歷史" color="#a78bfa" defaultOpen={false}>
                    {sigHistory[selected?.symbol].map((h, i) => {
                      const c = h.signal.includes("做多") ? "#26a69a" : h.signal.includes("做空") ? "#ef5350" : "#787b86";
                      const ago = Math.round((Date.now() - h.ts) / 60000);
                      const agoStr = ago < 60 ? `${ago}分鐘前` : ago < 1440 ? `${Math.round(ago / 60)}小時前` : `${Math.round(ago / 1440)}天前`;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < sigHistory[selected?.symbol].length - 1 ? "1px solid #111824" : "none" }}>
                          <span style={{ color: c, fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 70 }}>{h.signal}</span>
                          <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>信心 {h.confidence}%</span>
                          <span style={{ marginLeft: "auto", color: i === 0 ? "#58a6ff" : "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{i === 0 ? "最新 · " : ""}{agoStr}</span>
                        </div>
                      );
                    })}
                  </Section>
                )}

                {multiAI && multiAI.length > 0 && <Section title="🤖 5 個 AI 派系觀點" color="#a78bfa" defaultOpen={false}>
                  <div style={{ color: "#4a5568", fontSize: 9, padding: "0 0 8px", lineHeight: 1.5 }}>點任一派系展開查看完整理由</div>
                  {multiAI.slice(0, -1).map((ai, i) => <AICard key={i} ai={ai} defaultOpen={false} />)}
                  <AICard ai={multiAI[multiAI.length - 1]} defaultOpen={false} />
                </Section>}

                <Section title="判斷依據" color="#f0e68c" defaultOpen={false}>
                  {smc.reasons.length ? smc.reasons.map((r, i) => <div key={i} style={{ color: "#c9d1d9", fontSize: 11, lineHeight: 1.6, padding: "3px 0" }}><span style={{ color: "#4a5568" }}>{i + 1}. </span>{r}</div>) : <div style={{ color: "#4a5568", fontSize: 11 }}>無明確訊號，建議觀望。</div>}
                </Section>
              </> : <div>
                <div className="skeleton" style={{ height: 90, marginBottom: 11 }} />
                <div className="skeleton" style={{ height: 50, marginBottom: 11 }} />
                <div style={{ color: "#5a6b80", fontSize: 11, fontFamily: "monospace", padding: "8px 4px", textAlign: "center" }}>正在分析 K 線 SMC 結構...</div>
              </div>}
            </>}

            {/* 交易 */}
            {sideTab === "journal" && (
              <TradeJournal coins={coins} defaultSymbol={selected?.symbol} onNotify={pushNotif} settings={settings} onSetAlert={(t) => { addPriceAlert(t.symbol, t.entry, t.direction === "long" ? "below" : "above"); pushNotif({ symbol: t.symbol, signal: `已設到價提醒 @ ${t.entry}`, color: "#f0b90b", confidence: 0 }); }} />
            )}

            {sideTab === "indicators" && indData && <>
              <Section title="RSI (14)" color="#a78bfa">
                <IndRow label="RSI 值" value={indData.rsi?.toFixed(2)} color={indData.rsi > 70 ? "#ef5350" : indData.rsi < 30 ? "#26a69a" : "#c9d1d9"} />
                <IndRow label="區間狀態" value={indData.rsi > 70 ? "超買 ⚠️" : indData.rsi < 30 ? "超賣 🟢" : "中性"} />
                <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "#1a2535", overflow: "hidden" }}><div style={{ width: `${Math.min(100, indData.rsi || 0)}%`, height: "100%", background: indData.rsi > 70 ? "#ef5350" : indData.rsi < 30 ? "#26a69a" : "#a78bfa" }} /></div>
              </Section>
              <Section title="MACD (12,26,9)" color="#2962ff">
                <IndRow label="MACD" value={indData.macd?.toFixed(4)} />
                <IndRow label="Signal" value={indData.signal?.toFixed(4)} />
                <IndRow label="Histogram" value={indData.hist?.toFixed(4)} color={(indData.hist || 0) > 0 ? "#26a69a" : "#ef5350"} />
                <IndRow label="趨勢" value={(indData.hist || 0) > 0 ? "多頭 ↑" : "空頭 ↓"} color={(indData.hist || 0) > 0 ? "#26a69a" : "#ef5350"} />
              </Section>
              <Section title="KDJ (9,3,3)" color="#ffb300">
                <IndRow label="K" value={indData.kdj?.k?.toFixed(2)} color="#ffb300" />
                <IndRow label="D" value={indData.kdj?.d?.toFixed(2)} color="#2962ff" />
                <IndRow label="J" value={indData.kdj?.j?.toFixed(2)} color="#e040fb" />
                <IndRow label="信號" value={(indData.kdj?.k || 0) > (indData.kdj?.d || 0) ? "金叉 🟢" : "死叉 🔴"} color={(indData.kdj?.k || 0) > (indData.kdj?.d || 0) ? "#26a69a" : "#ef5350"} />
              </Section>
              <Section title="移動平均線 MA" color="#f0e68c">
                {[[5, "#f0e68c"], [10, "#87ceeb"], [20, "#ff8c69"], [60, "#da70d6"]].map(([p, col]) => <IndRow key={p} label={`MA${p}`} value={indData[`ma${p}`]?.toFixed(p <= 10 ? 4 : 2)} color={col} />)}
                <IndRow label="多空排列" value={(indData.ma5 || 0) > (indData.ma20 || 0) ? "多頭 ↑" : "空頭 ↓"} color={(indData.ma5 || 0) > (indData.ma20 || 0) ? "#26a69a" : "#ef5350"} />
              </Section>
              <BacktestPanel item={selected} />
            </>}

            {/* 掃描（推薦/警報/爆發） */}
            {sideTab === "scan" && <>
              {/* 子標籤 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[["recs", "🎯 推薦"], ["alerts", "⚡ 警報"], ["explosive", "🚀 爆發"], ["liq", "💥 爆倉"]].map(([id, label]) => (
                  <button key={id} onClick={() => setAlertSubTab(id)} style={{ flex: 1, background: alertSubTab === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${alertSubTab === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, color: alertSubTab === id ? "#58a6ff" : "#4a5568", padding: "7px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                ))}
              </div>

            {/* 推薦子頁 */}
            {alertSubTab === "recs" && <>
              <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>多空推薦掃描</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>掃描全部商品 · SMC 評分</div>
                </div>
                <button onClick={() => setRecsTs(0)} disabled={recsLoading} style={{ background: recsLoading ? "#1a2535" : "#58a6ff", border: "none", borderRadius: 6, color: "#fff", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: recsLoading ? 0.5 : 1 }}>{recsLoading ? "掃描中..." : "↻ 刷新"}</button>
              </div>
              {recsLoading && <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>掃描進度</span>
                  <span style={{ color: "#58a6ff", fontSize: 9, fontFamily: "monospace" }}>{recsProgress.done} / {recsProgress.total || coins.length}</span>
                </div>
                <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${recsProgress.total ? (recsProgress.done / recsProgress.total) * 100 : 0}%`, height: "100%", background: "#58a6ff", transition: "width .3s ease" }} />
                </div>
              </div>}
              {recs && <>
                <Section title={`🟢 適合做多 (${recs.longs.length})`} color="#26a69a">
                  {recs.longs.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無明確做多訊號</div>}
                  {recs.longs.map((r) => (
                    <button key={r.symbol} className="stagger-item lift" onClick={() => { const c = coins.find((x) => x.symbol === r.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: "7px 8px", marginBottom: 4, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 60 }}>{r.name}</span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${r.confidence}%`, height: "100%", background: "#26a69a" }} /></div>
                        <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2, display: "flex", gap: 6 }}>
                          <span>{r.structure.split(" ")[0]}</span>
                          {r.price != null && <span style={{ color: "#5a6b80" }}>${r.price > 1 ? r.price.toFixed(3) : r.price.toFixed(5)}</span>}
                          {r.change != null && <span style={{ color: r.change >= 0 ? "#26a69a" : "#ef5350" }}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</span>}
                        </div>
                      </div>
                      <span style={{ color: "#26a69a", fontSize: 10, fontFamily: "monospace", fontWeight: 700, minWidth: 50, textAlign: "right" }}>{r.signal}</span>
                      <span style={{ color: "#26a69a", fontSize: 9, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>{r.confidence}%</span>
                    </button>
                  ))}
                </Section>
                <Section title={`🔴 適合做空 (${recs.shorts.length})`} color="#ef5350">
                  {recs.shorts.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "8px 4px" }}>暫無明確做空訊號</div>}
                  {recs.shorts.map((r) => (
                    <button key={r.symbol} className="stagger-item lift" onClick={() => { const c = coins.find((x) => x.symbol === r.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: "7px 8px", marginBottom: 4, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer" }}>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 60 }}>{r.name}</span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${r.confidence}%`, height: "100%", background: "#ef5350" }} /></div>
                        <div style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", marginTop: 2, display: "flex", gap: 6 }}>
                          <span>{r.structure.split(" ")[0]}</span>
                          {r.price != null && <span style={{ color: "#5a6b80" }}>${r.price > 1 ? r.price.toFixed(3) : r.price.toFixed(5)}</span>}
                          {r.change != null && <span style={{ color: r.change >= 0 ? "#26a69a" : "#ef5350" }}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</span>}
                        </div>
                      </div>
                      <span style={{ color: "#ef5350", fontSize: 10, fontFamily: "monospace", fontWeight: 700, minWidth: 50, textAlign: "right" }}>{r.signal}</span>
                      <span style={{ color: "#ef5350", fontSize: 9, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>{r.confidence}%</span>
                    </button>
                  ))}
                </Section>
                <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", textAlign: "center", padding: "4px" }}>已掃 {recs.scanned} / {recs.total} 幣 · {new Date(recsTs).toLocaleTimeString()}</div>
              </>}
            </>}

              {/* 警報子頁 */}
              {alertSubTab === "alerts" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>持倉異常警報</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>每 3 分鐘掃全部商品 OI 變化</div>
                </div>
                <Section title={`警報事件 (${alerts.length})`} color="#f0b90b" badge="即時">
                  {alerts.length === 0 && <EmptyState icon="📡" text="目前無異常" hint="每 3 分鐘自動掃描" />}
                  {alerts.map((al, i) => (
                    <button key={`${al.symbol}-${al.ts}-${i}`} onClick={() => { const c = coins.find((x) => x.symbol === al.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${al.color}44`, borderLeft: `3px solid ${al.color}`, borderRadius: 6, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{al.name}</span>
                          <span style={{ color: al.color, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{al.type}</span>
                        </div>
                        <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 2 }}>
                          OI {al.oiChgPct > 0 ? "+" : ""}{al.oiChgPct.toFixed(2)}% · 24h 價 {al.change > 0 ? "+" : ""}{al.change.toFixed(2)}% · {new Date(al.ts).toLocaleTimeString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </Section>
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px" }}>
                  <p style={{ color: "#5a6b80", marginBottom: 4 }}>判讀說明：</p>
                  <p>· <span style={{ color: "#26a69a" }}>多頭觸發</span>：OI 暴增 + 價漲</p>
                  <p>· <span style={{ color: "#ef5350" }}>空頭觸發</span>：OI 暴增 + 價跌</p>
                  <p>· <span style={{ color: "#ef5350" }}>誘空</span>：OI 增 + 價跌</p>
                  <p>· <span style={{ color: "#f0b90b" }}>疑似反轉</span>：OI 減 + 價升</p>
                </div>
              </>}

              {/* 爆發掃描子頁 */}
              {alertSubTab === "explosive" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>🚀 即將爆發幣種掃描</div>
                    <div style={{ color: "#4a5568", fontSize: 9 }}>每 5 分鐘自動掃描 · OI+Funding+布林帶+量能+SMC+SNR</div>
                  </div>
                  <button onClick={() => setExplosiveTs(0)} disabled={explosiveLoading} style={{ background: explosiveLoading ? "#1a2535" : "#f0b90b", border: "none", borderRadius: 6, color: "#000", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700, opacity: explosiveLoading ? 0.5 : 1 }}>{explosiveLoading ? "掃描中..." : "↻ 刷新"}</button>
                </div>
                {explosiveLoading && <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>掃描進度</span>
                    <span style={{ color: "#f0b90b", fontSize: 9, fontFamily: "monospace" }}>{explosiveProgress.done} / {explosiveProgress.total || coins.length}</span>
                  </div>
                  <div style={{ height: 4, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${explosiveProgress.total ? (explosiveProgress.done / explosiveProgress.total) * 100 : 0}%`, height: "100%", background: "#f0b90b", transition: "width .3s ease" }} />
                  </div>
                </div>}
                {explosive && <>
                  {[["long", "🟢 多頭爆發候選", "#26a69a"], ["short", "🔴 空頭爆發候選", "#ef5350"], ["neutral", "⚡ 能量蓄積中（方向待定）", "#f0b90b"]].map(([dir, title, col]) => {
                    const items = explosive.filter(x => x.direction === dir);
                    if (items.length === 0) return null;
                    return (
                      <Section key={dir} title={`${title} (${items.length})`} color={col} defaultOpen={dir !== "neutral"}>
                        {items.map((ex) => (
                          <button key={ex.symbol} className="stagger-item lift" onClick={() => { const c = coins.find(x => x.symbol === ex.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`, borderRadius: 6, padding: "8px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{ex.name}</span>
                                {ex.isNew && <span className="new-badge" style={{ background: "#58a6ff", color: "#000", fontSize: 7, fontFamily: "monospace", fontWeight: 700, padding: "1px 4px", borderRadius: 3 }}>NEW</span>}
                                <span style={{ color: ex.change >= 0 ? "#26a69a" : "#ef5350", fontSize: 9, fontFamily: "monospace" }}>{ex.change >= 0 ? "+" : ""}{ex.change.toFixed(2)}%</span>
                                <span style={{ marginLeft: "auto", background: col, color: "#000", fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 3 }}>{ex.score}分</span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {ex.signals.map((s, si) => (
                                  <span key={si} style={{ background: "#1a2535", color: "#8b949e", fontSize: 8, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3 }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </Section>
                    );
                  })}
                  <div style={{ color: "#4a5568", fontSize: 9, textAlign: "center", padding: "4px" }}>掃描全部商品 · {new Date(explosiveTs).toLocaleTimeString()}</div>
                </>}
                {!explosive && !explosiveLoading && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>準備自動掃描中...</div>}
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px", marginTop: 4 }}>
                  <p style={{ color: "#5a6b80", marginBottom: 4 }}>評分說明（滿分 100）：</p>
                  <p>· OI 暴增 超過5% → +15</p>
                  <p>· Funding 極值 → +20</p>
                  <p>· 布林帶擠壓（能量蓄積）→ +20</p>
                  <p>· 成交量暴增 2 倍以上 → +10</p>
                  <p>· SMC 方向確認 → +10~20</p>
                  <p>· 貼近SNR支撐/壓力 → +10</p>
                </div>
              </>}

              {/* 大額爆倉子頁 */}
              {alertSubTab === "liq" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>💥 全市場大額爆倉</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>Binance 即時強平流 · 門檻 $50K · 超過 $500K 跳通知</div>
                </div>
                <Section title={`即時爆倉 (${liquidations.length})`} color="#ef5350" badge="LIVE" defaultOpen={true}>
                  {liquidations.length === 0 && <EmptyState icon="💥" text="等待大額爆倉" hint="連線後即時推送" />}
                  {liquidations.map((liq, i) => {
                    const isLongLiq = liq.side === "long";
                    const col = isLongLiq ? "#ef5350" : "#26a69a";
                    const usdStr = liq.usd >= 1e6 ? "$" + (liq.usd / 1e6).toFixed(2) + "M" : "$" + (liq.usd / 1e3).toFixed(0) + "K";
                    return (
                      <button key={`${liq.symbol}-${liq.ts}-${i}`} className="fade-in lift" onClick={() => { const c = coins.find((x) => x.symbol === liq.symbol); if (c) setSelected(c); }} style={{ width: "100%", background: "#0d1520", border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`, borderRadius: 6, padding: "7px 10px", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer" }}>
                        <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace", fontWeight: 700, minWidth: 56 }}>{liq.name}</span>
                        <span style={{ color: col, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{isLongLiq ? "多單爆倉" : "空單爆倉"}</span>
                        <span style={{ marginLeft: "auto", color: col, fontSize: 12, fontFamily: "monospace", fontWeight: 800 }}>{usdStr}</span>
                        <span style={{ color: "#4a5568", fontSize: 8, fontFamily: "monospace", minWidth: 44, textAlign: "right" }}>{new Date(liq.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      </button>
                    );
                  })}
                </Section>
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "8px 4px" }}>
                  <p style={{ color: "#5a6b80", marginBottom: 4 }}>判讀：</p>
                  <p>· <span style={{ color: "#ef5350" }}>多單爆倉</span>：價格下殺，多頭被強制平倉（可能加速下跌或見底）</p>
                  <p>· <span style={{ color: "#26a69a" }}>空單爆倉</span>：價格急拉，空頭被強制平倉（可能軋空或見頂）</p>
                  <p>· 大量同向爆倉常出現在行情轉折或瀑布,可搭配SMC訊號判斷</p>
                </div>
              </>}
            </>}

            {/* 資訊（金十+說明） */}
            {sideTab === "info" && <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[["jin10", "📰 快訊"], ["news", "📖 說明"], ["settings", "⚙️ 設定"]].map(([id, label]) => (
                <button key={id} onClick={() => setInfoSubTab(id)} style={{ flex: 1, background: infoSubTab === id ? "#0f1e2e" : "#0d1520", border: `1px solid ${infoSubTab === id ? "#58a6ff" : "#1a2535"}`, borderRadius: 6, color: infoSubTab === id ? "#58a6ff" : "#4a5568", padding: "7px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
              ))}
            </div>

            {infoSubTab === "jin10" && <Section title="金十快訊" color="#f0b90b" badge="Jin10 即時">
              <FeedState state={j10flash}>
                {Array.isArray(j10flash) && j10flash.map((n, i) => (
                  <div key={i} style={{ padding: "7px 0", borderBottom: i < j10flash.length - 1 ? "1px solid #111824" : "none" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace", minWidth: 38, flexShrink: 0 }}>{fmtFeedTime(n.time)}</span>
                      <span style={{ color: n.important ? "#ef5350" : "#c9d1d9", fontSize: 11, lineHeight: 1.5, fontWeight: n.important ? 700 : 400 }}>{n.text}</span>
                    </div>
                  </div>
                ))}
              </FeedState>
            </Section>}

            {infoSubTab === "news" && <div style={{ color: "#8b949e", fontSize: 12, lineHeight: 1.8, padding: 4 }}>
              <p style={{ color: "#e6edf3", fontWeight: 700, marginBottom: 8 }}>📡 資料來源</p>
              <p>加密貨幣：Binance + OKX + CoinGecko 合併（幾百個幣）</p>
              <p>期貨資料：Binance Futures（資金費率/OI/多空比/Taker CVD）</p>
              <p>K 線：Binance WebSocket 即時</p>
              <p>財經訊息：金十數據</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>🤖 5 個 AI 派系</p>
              <p>🏃 趨勢跟隨 | 🔁 均值回歸 | 🏛️ SMC 機構 | 💰 期貨情緒 | 🧠 整合共識</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>📊 評分卡 / 交易紀錄</p>
              <p>評分卡：整合市場動能、資金費率、多空情緒、相對強弱、SNR關鍵價位</p>
              <p>交易紀錄：本機儲存進場/止損/止盈，自動追蹤即時盈虧與TP達成狀態</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>📊 高勝率回測</p>
              <p>多時區共振策略 — 1D 趨勢 + 4H 確認 + 1H 進場 + 量能過濾。交易少但勝率高。</p>
              <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>⚡ 推薦與警報</p>
              <p>每 5 分鐘全量掃描推薦清單；每 3 分鐘全量掃 OI 異常警報。</p>
            </div>}

            {infoSubTab === "settings" && <div style={{ padding: 2 }}>
              <Section title="🤖 自動推薦單設定" color="#58a6ff" defaultOpen={true}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>自動重新掃描間隔</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>間隔越長，清單越穩定、越省 API。選「只手動」則只在你按重新掃描時更新。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[5, "5分鐘"], [15, "15分鐘"], [30, "30分鐘"], [0, "只手動"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, autoScanMins: v }))} style={{ flex: 1, background: settings.autoScanMins === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.autoScanMins === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.autoScanMins === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>評分平倉方式</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>「連續兩次」可避免評分短暫跌破門檻就被砍掉好單。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[true, "連續兩次低於門檻才平"], [false, "一次低於就平"]].map(([v, label]) => (
                      <button key={String(v)} onClick={() => setSettings((s) => ({ ...s, scoreCloseConfirm: v }))} style={{ flex: 1, background: settings.scoreCloseConfirm === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreCloseConfirm === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreCloseConfirm === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>連續低分平倉次數</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>需要連續幾次低於門檻才平倉。激進2次、保守5次。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[2, 3, 5].map((v) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scoreConsecutive: v }))} style={{ flex: 1, background: settings.scoreConsecutive === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreConsecutive === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreConsecutive === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{v}次</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>推薦品質門檻</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>只推薦評分超過此值的單。嚴格品質高但數量少。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[60, "嚴格(60+)"], [40, "均衡(40+)"], [20, "寬鬆(20+)"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scoreFilterTh: v }))} style={{ flex: 1, background: settings.scoreFilterTh === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreFilterTh === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreFilterTh === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>評分平倉門檻：{settings.scoreCloseTh}</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>持倉中的單評分掉到此值以下就考慮平倉。越低越寬鬆（不容易被砍）。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[30, 40, 50].map((v) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scoreCloseTh: v }))} style={{ flex: 1, background: settings.scoreCloseTh === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scoreCloseTh === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scoreCloseTh === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{v}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>掃描範圍</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>只掃前 N 大成交量可大幅加快、省 API；全部最完整但較重。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[100, "前100"], [200, "前200"], [0, "全部"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, scanTopN: v }))} style={{ flex: 1, background: settings.scanTopN === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.scanTopN === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.scanTopN === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>每側開單數量</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>做多和做空各幾張。少而精勝率較高，建議 2-3 張。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[2, "2張(精選)"], [3, "3張(均衡)"], [5, "5張(分散)"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, perSide: v }))} style={{ flex: 1, background: settings.perSide === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.perSide === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.perSide === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>分批平倉百分比</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 8, lineHeight: 1.5 }}>觸及各 TP 時要平多少 %。三格都留空 = 預設「TP3 觸發才全平」（舊版行為）。範例：填 50/30/20 = 觸 TP1 平50%、觸 TP2 平30%、觸 TP3 平20%。</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {[["tpClosePct1", "TP1"], ["tpClosePct2", "TP2"], ["tpClosePct3", "TP3"]].map(([key, label]) => (
                      <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "center", background: "#0d1520", border: "1px solid #1a2535", borderRadius: 5, padding: "4px 6px", width: "100%" }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="—"
                            value={settings[key] == null ? "" : settings[key]}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value)));
                              setSettings((s) => ({ ...s, [key]: v }));
                            }}
                            style={{ background: "transparent", border: "none", color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, width: "100%", outline: "none", textAlign: "center" }}
                          />
                          <span style={{ color: "#5a6b80", fontSize: 9, marginLeft: 2 }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>BTC 趨勢過濾</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 8, lineHeight: 1.5 }}>依 BTC 4H 趨勢調整推薦分數，並依該幣與 BTC 的相關性加權。BTC 逆勢時扣多單分、順勢時加多單分；相關性高的幣（如 ETH/SOL）影響大，低相關（如某些 MEME）影響小。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["off", "關"], ["weak", "弱(±8)"], ["mid", "中(±15)"], ["strong", "強(±25)"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, btcFilterLevel: v }))} style={{ flex: 1, background: settings.btcFilterLevel === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.btcFilterLevel === v ? "#58a6ff" : "#1a2535"}`, borderRadius: 5, color: settings.btcFilterLevel === v ? "#58a6ff" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="🎨 介面與提示" color="#a78bfa" defaultOpen={true}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>訊號提示音</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>強訊號雙高音、一般單音、爆倉低音。需先在總覽開啟通知。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[[true, "開啟"], [false, "關閉"]].map(([v, label]) => (
                      <button key={String(v)} onClick={() => setSettings((s) => ({ ...s, soundOn: v }))} style={{ flex: 1, background: settings.soundOn === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.soundOn === v ? "#a78bfa" : "#1a2535"}`, borderRadius: 5, color: settings.soundOn === v ? "#a78bfa" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700, marginBottom: 6 }}>顯示模式</div>
                  <div style={{ color: "#4a5568", fontSize: 9, marginBottom: 6 }}>護眼降低對比與飽和；高對比加強辨識度。</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["normal", "標準"], ["eyecomfort", "護眼"], ["hicontrast", "高對比"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSettings((s) => ({ ...s, displayMode: v }))} style={{ flex: 1, background: settings.displayMode === v ? "#0f1e2e" : "#0d1520", border: `1px solid ${settings.displayMode === v ? "#a78bfa" : "#1a2535"}`, borderRadius: 5, color: settings.displayMode === v ? "#a78bfa" : "#5a6b80", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{label}</button>
                    ))}
                  </div>
                </div>
              </Section>

              <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, padding: "4px 4px" }}>
                <p>· 設定會自動儲存在本機，下次開啟沿用。</p>
                <p>· 改「掃描範圍」「間隔」後，下次掃描生效。</p>
                <p>· 桌面快捷鍵：數字 1-5 切分頁、/ 聚焦搜尋；手機左右滑動切分頁。</p>
              </div>
            </div>}
            </>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
