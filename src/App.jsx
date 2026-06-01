import { useState, useEffect, useMemo } from "react";
import {
  loadMarket, loadKlines, analyzeSMC, analyzeSMCMulti,
  calcSMA, calcMACD, calcRSI, calcKDJ,
  loadJin10Flash, subscribeCryptoTicker, loadPeriodChanges,
  scanRecommendations, scanAnomalies,
} from "./data.js";


function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 760 : false);
  useEffect(() => {
    const r = () => setM(window.innerWidth < 760);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  return m;
}

function Section({ title, color, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10, background: "#0a0e15", border: "1px solid #1a2535", borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "transparent", border: "none", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: "#e6edf3" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 3, height: 14, background: color, borderRadius: 2 }} />
          <span style={{ color: "#e6edf3", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{title}</span>
          {badge && <span style={{ background: `${color}22`, color: color, fontSize: 9, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3 }}>{badge}</span>}
        </div>
        <span style={{ color: "#4a5568", fontSize: 10 }}>{open ? "▼" : "▶"}</span>
      </button>
      {open && <div style={{ padding: "0 12px 10px" }}>{children}</div>}
    </div>
  );
}

function IndRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #111824", fontSize: 11 }}>
      <span style={{ color: "#787b86", fontFamily: "monospace" }}>{label}</span>
      <span style={{ color: color || "#c9d1d9", fontFamily: "monospace", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FeedState({ state, children }) {
  if (state === undefined) return <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>載入中...</div>;
  if (state === null) return <div style={{ color: "#5a4020", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>暫無資料</div>;
  if (Array.isArray(state) && state.length === 0) return <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>暫無內容</div>;
  return children;
}

function fmtFeedTime(t) {
  if (!t) return "";
  if (typeof t === "string" && /^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  try { return new Date(t).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return ""; }
}

function AICard({ ai, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: `${ai.color}10`, border: `1px solid ${ai.color}44`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{ai.emoji}</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{ai.name}</div>
            <div style={{ color: "#787b86", fontSize: 9 }}>{ai.school}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ color: ai.color, fontSize: 12, fontFamily: "monospace", fontWeight: 800 }}>{ai.direction}</div>
          <div style={{ color: ai.color, fontSize: 10, fontFamily: "monospace" }}>{ai.confidence}%</div>
          <span style={{ color: "#4a5568", fontSize: 10 }}>{open ? "▼" : "▶"}</span>
        </div>
      </button>
      {open && <div style={{ marginTop: 8, color: "#8b949e", fontSize: 10, lineHeight: 1.7, fontFamily: "monospace" }}>
        {ai.reasons.map((r, i) => <div key={i}>· {r}</div>)}
      </div>}
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [coins, setCoins] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tf, setTf] = useState("1H");
  const [candles, setCandles] = useState([]);
  const [sideTab, setSideTab] = useState("smc");
  const [smc, setSmc] = useState(null);
  const [smcMulti, setSmcMulti] = useState([]);
  const [notif, setNotif] = useState(null);
  const [notifOn, setNotifOn] = useState(false);
  const [status, setStatus] = useState("載入中...");
  const [j10flash, setJ10flash] = useState(undefined);
  const [periodChg, setPeriodChg] = useState(null);
  const [recs, setRecs] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsTs, setRecsTs] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [listLimit, setListLimit] = useState(50);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coins;
    return coins.filter((c) => (c.symbol + c.name + (c.label || "")).toLowerCase().includes(q));
  }, [coins, search]);

  useEffect(() => {
    let cancel = false;
    setStatus("載入中...");
    loadMarket().then((d) => {
      if (cancel) return;
      setCoins(d);
      if (!selected && d.length) setSelected(d[0]);
      setStatus(`✓ ${d.length} 個合約`);
    }).catch((e) => setStatus("✗ 載入失敗: " + e.message));
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iv = setInterval(() => { loadMarket().then(setCoins).catch(() => {}); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    loadJin10Flash().then(setJ10flash).catch(() => setJ10flash(null));
    const iv = setInterval(() => { loadJin10Flash().then(setJ10flash).catch(() => {}); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    loadKlines(selected, tf).then((d) => { if (!cancel) setCandles(d); }).catch(() => {});
    return () => { cancel = true; };
  }, [selected, tf]);

  useEffect(() => {
    setListLimit(50);
  }, [search]);

  useEffect(() => {
    if (!candles.length) { setSmc(null); return; }
    setSmc(analyzeSMC(candles));
  }, [candles]);

  useEffect(() => {
    if (!selected) { setSmcMulti([]); return; }
    let cancel = false;
    analyzeSMCMulti(selected).then((r) => { if (!cancel) setSmcMulti(r); });
    return () => { cancel = true; };
  }, [selected]);

  // 多週期漲跌
  useEffect(() => {
    if (!selected) { setPeriodChg(null); return; }
    let cancel = false;
    setPeriodChg(null);
    loadPeriodChanges(selected).then((r) => { if (!cancel) setPeriodChg(r); });
    return () => { cancel = true; };
  }, [selected]);

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
  }, [selected]);

  // 推薦掃描
  const coinsLoaded = coins.length > 0;
  useEffect(() => {
    if (sideTab !== "recs" || !coinsLoaded) return;
    if (recs && Date.now() - recsTs < 5 * 60 * 1000) return;
    let cancel = false;
    setRecsLoading(true);
    scanRecommendations(coins, 200).then((r) => {
      if (cancel) return;
      setRecs(r); setRecsTs(Date.now()); setRecsLoading(false);
    }).catch(() => { if (!cancel) setRecsLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTab, coinsLoaded, recsTs]);

  // 警報掃描
  useEffect(() => {
    if (!coinsLoaded) return;
    let cancel = false;
    async function scan() {
      if (cancel) return;
      try {
        const a = await scanAnomalies(coins, 200);
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

  async function enableNotif() {
    if (typeof Notification === "undefined") { setNotifOn(true); return; }
    try { const p = await Notification.requestPermission(); setNotifOn(true); if (p === "granted") new Notification("✅ 通知已開啟", { body: "SMC 多空訊號將即時通知你" }); } catch { setNotifOn(true); }
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
  const fmtPr = (v) => (v > 100 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6));
  const fmtVol = (v) => {
    if (!v) return "-";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return v.toFixed(2);
  };

  // 顯示用 list（先 filtered，再 slice listLimit）
  const displayCoins = filtered.slice(0, listLimit);
  const hasMore = filtered.length > listLimit;

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#e6edf3", fontFamily: "-apple-system, system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(180deg, #0a0e15 0%, #000 100%)", borderBottom: "1px solid #1a2535", padding: "10px 14px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: "linear-gradient(135deg, #ffce00, #ff6f00)", color: "#000", padding: "3px 8px", borderRadius: 4, fontWeight: 800, fontSize: 11, fontFamily: "monospace" }}>CRYPTEX</div>
            <div style={{ color: "#4a5568", fontSize: 10, fontFamily: "monospace" }}>加密貨幣分析</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace" }}>{status}</span>
            <button onClick={enableNotif} style={{ background: notifOn ? "#26a69a" : "#1a2535", border: "none", borderRadius: 4, color: "#fff", padding: "3px 7px", fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>{notifOn ? "🔔 ON" : "🔔 OFF"}</button>
          </div>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 BTC ETH SOL DOGE ..." style={{ width: "100%", background: "#0a0e15", border: "1px solid #1a2535", borderRadius: 6, color: "#e6edf3", padding: "7px 10px", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }} />
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", maxWidth: 1500, margin: "0 auto", gap: isMobile ? 0 : 10, padding: isMobile ? 0 : 10 }}>
        <div style={{ flex: isMobile ? "none" : "0 0 320px", maxWidth: isMobile ? "100%" : 320, width: isMobile ? "100%" : 320 }}>
          <div style={{ background: "#0a0e15", border: isMobile ? "none" : "1px solid #1a2535", borderRadius: isMobile ? 0 : 8 }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #1a2535", color: "#787b86", fontSize: 11, fontFamily: "monospace", display: "flex", justifyContent: "space-between" }}>
              <span>📊 加密貨幣合約</span>
              <span style={{ color: "#4a5568" }}>{filtered.length}</span>
            </div>
            <div style={{ maxHeight: isMobile ? 380 : "calc(100vh - 220px)", overflowY: "auto" }}>
              {displayCoins.map((it) => {
                const sel = selected?.symbol === it.symbol;
                const chg = it.change || 0;
                const positive = chg >= 0;
                const bg = sel ? "#0d1520" : positive ? "rgba(38,166,154,0.04)" : "rgba(239,83,80,0.04)";
                return (
                  <button key={`${it.symbol}-${it.binanceSymbol}`} onClick={() => setSelected(it)} style={{ width: "100%", background: bg, borderTop: "none", borderLeft: sel ? "3px solid #58a6ff" : "3px solid transparent", borderRight: "none", borderBottom: "1px solid #111824", padding: "8px 10px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ color: "#e6edf3", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{it.symbol}</span>
                        <span style={{ color: positive ? "#26a69a" : "#ef5350", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{fmtPr(it.price)}</span>
                      </div>
                      <div style={{ color: "#4a5568", fontSize: 9, fontFamily: "monospace", marginTop: 1 }}>VOL ${fmtVol(it.quoteVolume)} · {it.label || it.name}</div>
                    </div>
                    <div style={{ background: positive ? "#26a69a" : "#ef5350", color: "#fff", fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "3px 6px", borderRadius: 3, minWidth: 50, textAlign: "center" }}>{positive ? "+" : ""}{chg.toFixed(2)}%</div>
                  </button>
                );
              })}
              {hasMore && <button onClick={() => setListLimit((l) => l + 50)} style={{ width: "100%", background: "#0d1520", border: "none", borderTop: "1px solid #1a2535", color: "#58a6ff", padding: "10px", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>↓ 載入更多（剩 {filtered.length - listLimit}）</button>}
              {!hasMore && filtered.length > 50 && <div style={{ color: "#4a5568", fontSize: 9, padding: "8px", textAlign: "center" }}>—— 全部 {filtered.length} 個合約 ——</div>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, padding: isMobile ? 10 : 0 }}>
          <div style={{ background: "#0a0e15", border: "1px solid #1a2535", borderRadius: 8, padding: 12 }}>
            {selected ? <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <div>
                  <span style={{ color: "#e6edf3", fontSize: 18, fontWeight: 800, fontFamily: "monospace" }}>{selected.symbol}</span>
                  <span style={{ color: "#4a5568", fontSize: 11, fontFamily: "monospace", marginLeft: 8 }}>{selected.label || selected.name} ·  PERP</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: up ? "#26a69a" : "#ef5350", fontFamily: "monospace" }}>{fmtPr(displayPrice)}</span>
                <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: up ? "#26a69a" : "#ef5350" }}>{up ? "+" : ""}{change24h.toFixed(2)}%</span>
                <span style={{ color: "#4a5568", fontSize: 10, fontFamily: "monospace" }}>24H</span>
              </div>
              {periodChg && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {[["1D", periodChg["1D"]], ["3D", periodChg["3D"]], ["1W", periodChg["1W"]], ["1M", periodChg["1M"]]].filter(([_, v]) => v != null).map(([k, v]) => (
                  <div key={k} style={{ background: v >= 0 ? "rgba(38,166,154,0.1)" : "rgba(239,83,80,0.1)", border: `1px solid ${v >= 0 ? "#26a69a44" : "#ef535044"}`, borderRadius: 4, padding: "3px 7px", fontSize: 10, fontFamily: "monospace" }}>
                    <span style={{ color: "#787b86" }}>{k} </span>
                    <span style={{ color: v >= 0 ? "#26a69a" : "#ef5350", fontWeight: 700 }}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>
                  </div>
                ))}
              </div>}
            </> : <span style={{ color: "#4a5568", fontSize: 11 }}>請選擇商品</span>}
          </div>

          <div style={{ background: "#0a0e15", border: "1px solid #1a2535", borderRadius: 8 }}>
            <div style={{ display: "flex", borderBottom: "1px solid #1a2535", flexWrap: "wrap" }}>
              {[["smc", "SMC"], ["indicators", "指標"], ["recs", "推薦"], ["alerts", "警報"], ["jin10", "金十"], ["news", "說明"]].map(([id, label]) => (
                <button key={id} onClick={() => setSideTab(id)} style={{ flex: 1, minWidth: 60, background: sideTab === id ? "#0d1520" : "transparent", border: "none", borderBottom: `2px solid ${sideTab === id ? "#58a6ff" : "transparent"}`, color: sideTab === id ? "#e6edf3" : "#4a5568", padding: "10px 0", fontSize: 11, fontFamily: "monospace" }}>{label}</button>
              ))}
            </div>
            <div style={{ padding: 12 }}>
              {/* SMC */}
              {sideTab === "smc" && <>
                {smc && <div style={{ background: `${smc.color}14`, border: `1.5px solid ${smc.color}`, borderRadius: 10, padding: 12, marginBottom: 10, textAlign: "center" }}>
                  <div style={{ color: "#787b86", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>SMC 訊號 · {tf}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: smc.color, fontFamily: "monospace" }}>{smc.signal}</div>
                  <div style={{ color: smc.color, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>信心 {smc.confidence}%</div>
                </div>}
                {smc && <Section title="關鍵原因" color="#a78bfa">
                  {smc.reasons.map((r, i) => <div key={i} style={{ color: "#c9d1d9", fontSize: 11, padding: "5px 0", borderBottom: i < smc.reasons.length - 1 ? "1px solid #111824" : "none", lineHeight: 1.6 }}>· {r}</div>)}
                </Section>}
                <Section title="多時區共振" color="#58a6ff">
                  {smcMulti.length > 0 ? smcMulti.map((m) => <IndRow key={m.tf} label={m.tf} value={m.signal} color={m.color} />) : <div style={{ color: "#4a5568", fontSize: 10 }}>掃描中...</div>}
                </Section>
                <Section title="時間框架" color="#f0e68c">
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {["15M", "1H", "4H", "1D"].map((t) => (
                      <button key={t} onClick={() => setTf(t)} style={{ background: t === tf ? "#58a6ff" : "transparent", border: `1px solid ${t === tf ? "#58a6ff" : "#1a2535"}`, color: t === tf ? "#000" : "#c9d1d9", padding: "5px 10px", borderRadius: 4, fontSize: 10, fontFamily: "monospace", fontWeight: 700, cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                </Section>
                {selected && <div style={{ background: "#130a0a", border: "1px solid #2a1010", borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <div style={{ color: "#5a2020", fontSize: 9, lineHeight: 1.6 }}>⚠️ 本資訊僅供參考，不構成投資建議</div>
                </div>}
              </>}

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
              </>}

              {/* 推薦 */}
              {sideTab === "recs" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>🎯 高勝率推薦掃描</div>
                    <div style={{ color: "#4a5568", fontSize: 9 }}>每 5 分鐘自動更新 · 掃描前 200 大幣</div>
                  </div>
                  {recsLoading && <span style={{ color: "#f0b90b", fontSize: 10, fontFamily: "monospace" }}>掃描中...</span>}
                </div>
                {recs && recs.long.length === 0 && recs.short.length === 0 && <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>目前沒有達標的高勝率機會</div>}
                {recs && recs.long.length > 0 && <Section title={`做多推薦 (${recs.long.length})`} color="#26a69a" defaultOpen={true}>
                  {recs.long.map((r) => <div key={r.symbol} onClick={() => setSelected(coins.find((c) => c.symbol === r.symbol))} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 4px", borderBottom: "1px solid #111824", cursor: "pointer", fontFamily: "monospace" }}>
                    <span style={{ color: "#e6edf3", fontSize: 11, fontWeight: 700, minWidth: 70 }}>{r.symbol}</span>
                    <span style={{ color: "#787b86", fontSize: 10, flex: 1 }}>${fmtPr(r.price)}</span>
                    <span style={{ background: "#26a69a", color: "#fff", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700 }}>{r.score}分</span>
                  </div>)}
                </Section>}
                {recs && recs.short.length > 0 && <Section title={`做空推薦 (${recs.short.length})`} color="#ef5350" defaultOpen={true}>
                  {recs.short.map((r) => <div key={r.symbol} onClick={() => setSelected(coins.find((c) => c.symbol === r.symbol))} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 4px", borderBottom: "1px solid #111824", cursor: "pointer", fontFamily: "monospace" }}>
                    <span style={{ color: "#e6edf3", fontSize: 11, fontWeight: 700, minWidth: 70 }}>{r.symbol}</span>
                    <span style={{ color: "#787b86", fontSize: 10, flex: 1 }}>${fmtPr(r.price)}</span>
                    <span style={{ background: "#ef5350", color: "#fff", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700 }}>{r.score}分</span>
                  </div>)}
                </Section>}
                <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.5, padding: "8px 4px" }}>
                  <p>· 評分標準：多時區共振 + 動能 + 量能</p>
                  <p>· 0-30 分弱 / 30-60 分中 / 60+ 分強</p>
                  <p>· 點擊條目可切換至該商品分析</p>
                </div>
              </>}

              {/* 警報 */}
              {sideTab === "alerts" && <>
                <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ color: "#c9d1d9", fontSize: 11, fontWeight: 700 }}>⚡ 異常警報</div>
                  <div style={{ color: "#4a5568", fontSize: 9 }}>每 3 分鐘自動掃描 · OI 變化、量能爆量</div>
                </div>
                {alerts.length === 0 ? <div style={{ color: "#4a5568", fontSize: 11, padding: "20px 4px", textAlign: "center" }}>目前無異常</div> :
                  alerts.map((a) => {
                    const color = a.severity === "high" ? "#ef5350" : a.severity === "warn" ? "#f0b90b" : "#58a6ff";
                    return <div key={`${a.symbol}-${a.type}-${a.ts}`} onClick={() => setSelected(coins.find((c) => c.symbol === a.symbol))} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 4px", borderBottom: "1px solid #111824", cursor: "pointer", fontFamily: "monospace" }}>
                      <span style={{ background: color, color: "#fff", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, minWidth: 36, textAlign: "center" }}>{a.type}</span>
                      <span style={{ color: "#e6edf3", fontSize: 11, fontWeight: 700, minWidth: 65 }}>{a.symbol}</span>
                      <span style={{ color: "#787b86", fontSize: 10, flex: 1 }}>{a.message}</span>
                      <span style={{ color: "#4a5568", fontSize: 9 }}>{new Date(a.ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                    </div>;
                  })}
              </>}

              {sideTab === "jin10" && <Section title="金十快訊" color="#f0b90b" badge="Jin10 即時">
                <FeedState state={j10flash}>
                  {Array.isArray(j10flash) && j10flash.map((n, i) => (
                    <div key={i} style={{ padding: "7px 0", borderBottom: i < j10flash.length - 1 ? "1px solid #111824" : "none" }}>
                      <div style={{ display: "flex", gap: 7 }}>
                        <span style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace", minWidth: 38, flexShrink: 0 }}>{fmtFeedTime(n.time)}</span>
                        <span style={{ color: n.important ? "#ef5350" : "#c9d1d9", fontSize: 11, lineHeight: 1.5, fontWeight: n.important ? 700 : 400 }}>{n.text}</span>
                      </div>
                    </div>
                  ))}
                </FeedState>
              </Section>}

              {sideTab === "news" && <div style={{ color: "#8b949e", fontSize: 12, lineHeight: 1.8, padding: 4 }}>
                <p style={{ color: "#e6edf3", fontWeight: 700, marginBottom: 8 }}>📖 CRYPTEX 加密貨幣分析儀表板</p>
                <p>專注於 Binance + OKX 加密貨幣合約市場分析，含 SMC 智能分析、多時區共振、推薦掃描、警報系統。</p>
                <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>🎯 SMC 智能分析</p>
                <p>判斷市場結構（BOS/CHoCH）、訂單區塊、流動性區域，結合多時區共振給出多空訊號。</p>
                <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>📊 技術指標</p>
                <p>RSI、MACD、KDJ、MA 等經典指標，配合即時 K 線資料判斷市場狀態。</p>
                <p style={{ marginTop: 8, color: "#e6edf3", fontWeight: 700 }}>⚡ 推薦與警報</p>
                <p>每 5 分鐘掃 200 大幣推薦清單；每 3 分鐘掃 OI 異常警報。</p>
              </div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
