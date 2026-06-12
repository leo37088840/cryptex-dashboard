// ════════════════════════════════════════════════════════════════════════════
// CRYPTEX data layer — 加密貨幣專業分析版
// 現貨: Binance + OKX + CoinGecko  | 期貨: Binance fapi
// 金十快訊
// ════════════════════════════════════════════════════════════════════════════

export const PROXY_URL = import.meta.env.VITE_PROXY_URL || "";
// 保留環境變數 export 以維持兼容（其他市場不再使用，但變數還在 Vercel）
export const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY || "";
export const TWELVEDATA_KEY = import.meta.env.VITE_TWELVEDATA_KEY || "";
export const FINMIND_TOKEN = import.meta.env.VITE_FINMIND_TOKEN || "";

async function jget(url, { useProxy = false } = {}) {
  const targets = [];
  if (useProxy && PROXY_URL) targets.push(`${PROXY_URL}/proxy?url=${encodeURIComponent(url)}`);
  targets.push(url);
  if (!useProxy && PROXY_URL) targets.push(`${PROXY_URL}/proxy?url=${encodeURIComponent(url)}`);
  for (const t of targets) {
    try {
      const res = await fetch(t, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      return await res.json();
    } catch { /* next */ }
  }
  return null;
}

async function getText(url, { useProxy = false } = {}) {
  const target = useProxy && PROXY_URL ? `${PROXY_URL}/proxy?url=${encodeURIComponent(url)}` : url;
  try {
    const res = await fetch(target);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// ═══════════ 永續合約列表 (Binance Futures + OKX SWAP + CoinGecko 補中文名) ═══
export async function loadCrypto() {
  const merged = new Map();
  const add = (c) => {
    if (!c || !(c.price > 0)) return;
    const ex = merged.get(c.name);
    if (!ex || (c.volume || 0) > (ex.volume || 0)) merged.set(c.name, c);
  };
  const [binance, okx, gecko] = await Promise.all([
    jget("https://fapi.binance.com/fapi/v1/ticker/24hr"),
    jget("https://www.okx.com/api/v5/market/tickers?instType=SWAP"),
    jget("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=500&page=1"),
  ]);
  // 先用 CoinGecko 建立中文名對照表
  const labelMap = new Map();
  if (Array.isArray(gecko)) {
    gecko.forEach((c) => labelMap.set(c.symbol.toUpperCase(), c.name));
  }
  if (Array.isArray(binance)) {
    binance.filter((t) => t.symbol.endsWith("USDT") && !t.symbol.includes("_"))
      .forEach((t) => {
        const name = t.symbol.replace("USDT", "");
        add({
          symbol: t.symbol.replace("USDT", "-USDT"),
          binanceSymbol: t.symbol,
          name,
          label: labelMap.get(name),
          cat: "crypto",
          price: parseFloat(t.lastPrice) || 0,
          change: parseFloat(t.priceChangePercent) || 0,
          volume: parseFloat(t.quoteVolume) || 0,
        });
      });
  }
  if (okx?.data?.length) {
    okx.data.filter((t) => t.instId.endsWith("-USDT-SWAP")).forEach((t) => {
      const name = t.instId.replace("-USDT-SWAP", "");
      add({
        symbol: `${name}-USDT`,
        okxSymbol: t.instId,
        name,
        label: labelMap.get(name),
        cat: "crypto",
        price: parseFloat(t.last) || 0,
        change: t.open24h ? ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100 : 0,
        volume: parseFloat(t.volCcy24h) || 0,
      });
    });
  }
  return Array.from(merged.values()).sort((a, b) => (b.volume || 0) - (a.volume || 0));
}

// 移除多市場 universe，只保留 crypto。loadMarket 兼容介面。
export const UNIVERSE = { crypto: [] };
export async function loadMarket() { return loadCrypto(); }

// ═══════════ K 線 ═══════════════════════════════════════════════════════════
const BINANCE_TF = { "15m":"15m", "1H":"1h", "4H":"4h", "1D":"1d" };

async function klinesBinance(item, tf) {
  const sym = item.binanceSymbol || `${item.name}USDT`;
  const interval = BINANCE_TF[tf] || "15m";
  // 永續合約 K 線
  const b = await jget(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=500`);
  if (!Array.isArray(b) || !b.length) return null;
  return b.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

export async function loadKlines(item, tf) {
  if (!item) return null;
  return klinesBinance(item, tf);
}

// 多週期漲跌
export async function loadPeriodChanges(item) {
  if (!item) return null;
  const k = await loadKlines(item, "1D");
  if (!k || k.length < 2) return null;
  const last = k[k.length - 1].c;
  const chg = (daysAgo) => {
    const idx = k.length - 1 - daysAgo;
    if (idx < 0) return null;
    const base = k[idx].c;
    return base ? ((last - base) / base) * 100 : null;
  };
  return { today: chg(1), d7: chg(7), d30: chg(30), d90: chg(90), d180: chg(180), y1: chg(365) };
}

// ═══════════ WebSocket (Binance Futures) ═══════════════════════════════════
export function subscribeCryptoTicker(binanceSymbol, onTick) {
  if (!binanceSymbol) return () => {};
  const sym = binanceSymbol.toLowerCase();
  let ws = null, closed = false, retry = 0;
  const connect = () => {
    if (closed) return;
    try {
      // 永續合約 trade stream
      ws = new WebSocket(`wss://fstream.binance.com/ws/${sym}@trade`);
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d.p) onTick(parseFloat(d.p), binanceSymbol);
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        retry = Math.min(retry + 1, 5);
        setTimeout(connect, retry * 1000);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    } catch {}
  };
  connect();
  return () => { closed = true; try { ws && ws.close(); } catch {} };
}

// 訂閱即時 K 線（每秒推送當前未收盤 K 棒）— 取代 15 秒輪詢
export function subscribeCryptoKline(binanceSymbol, tf, onCandle) {
  if (!binanceSymbol) return () => {};
  const sym = binanceSymbol.toLowerCase();
  const tfMap = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
  const intv = tfMap[tf] || "15m";
  let ws = null, closed = false, retry = 0;
  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(`wss://fstream.binance.com/ws/${sym}@kline_${intv}`);
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          const k = d.k;
          if (!k) return;
          onCandle({
            t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v,
            isClosed: !!k.x,
          });
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        retry = Math.min(retry + 1, 5);
        setTimeout(connect, retry * 1000);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    } catch {}
  };
  connect();
  return () => { closed = true; try { ws && ws.close(); } catch {} };
}

// ═══════════ 全市場大額強平流（Binance !forceOrder@arr）═══════════════════════
// onLiq 回傳 { symbol, side, price, qty, usd, ts }；side: "long"=多單被強平(賣出), "short"=空單被強平(買入)
export function subscribeLiquidations(onLiq, minUSD = 50000) {
  let ws = null, closed = false, retry = 0;
  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          const o = d.o || d;
          if (!o || !o.s) return;
          const price = parseFloat(o.ap || o.p) || 0;   // 平均成交價
          const qty = parseFloat(o.q) || 0;             // 數量
          const usd = price * qty;
          if (usd < minUSD) return;
          // 強平方向：o.S = SELL 代表多單被爆(強制賣出)，BUY 代表空單被爆
          const side = o.S === "SELL" ? "long" : "short";
          onLiq({
            symbol: o.s.replace("USDT", "-USDT"),
            name: o.s.replace("USDT", ""),
            binanceSymbol: o.s,
            side, price, qty, usd,
            ts: o.T || Date.now(),
          });
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        retry = Math.min(retry + 1, 5);
        setTimeout(connect, retry * 1000);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    } catch {}
  };
  connect();
  return () => { closed = true; try { ws && ws.close(); } catch {} };
}

// ═══════════ INDICATORS ═════════════════════════════════════════════════════
export function calcSMA(d, p) {
  return d.map((_, i) => (i < p - 1 ? null : d.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p));
}
export function calcEMA(d, p) { const k = 2/(p+1), e=[]; d.forEach((v,i)=>e.push(i===0?v:v*k+e[i-1]*(1-k))); return e; }
export function calcMACD(c) {
  const e12 = calcEMA(c, 12), e26 = calcEMA(c, 26);
  const macd = e12.map((v, i) => v - e26[i]);
  const signal = [...Array(26).fill(null), ...calcEMA(macd.slice(26), 9)];
  const hist = macd.map((v, i) => (signal[i] != null ? v - signal[i] : null));
  return { macd, signal, hist };
}
export function calcRSI(c, p = 14) {
  return c.map((_, i) => {
    if (i < p) return null;
    let g = 0, l = 0;
    for (let j = i - p + 1; j <= i; j++) { const x = c[j] - c[j - 1]; if (x > 0) g += x; else l -= x; }
    return 100 - 100 / (1 + g / (l || 1e-9));
  });
}
export function calcKDJ(h, lo, c, p = 9) {
  let pk = 50, pd = 50;
  return c.map((_, i) => {
    if (i < p - 1) return { k: null, d: null, j: null };
    const hh = Math.max(...h.slice(i - p + 1, i + 1)), ll = Math.min(...lo.slice(i - p + 1, i + 1));
    const rsv = hh === ll ? 50 : ((c[i] - ll) / (hh - ll)) * 100;
    const k = (pk * 2) / 3 + rsv / 3, d = (pd * 2) / 3 + k / 3;
    pk = k; pd = d;
    return { k, d, j: 3 * k - 2 * d };
  });
}
export function calcATR(h, l, c, p = 14) {
  const tr = h.map((_, i) => i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  return calcSMA(tr, p);
}
export function calcADX(h, l, c, p = 14) {
  const tr = h.map((_, i) => i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  const plusDM = h.map((_, i) => i === 0 ? 0 : Math.max(h[i] - h[i - 1], 0));
  const minusDM = l.map((_, i) => i === 0 ? 0 : Math.max(l[i - 1] - l[i], 0));
  const atr = calcSMA(tr, p), plus = calcSMA(plusDM, p), minus = calcSMA(minusDM, p);
  return c.map((_, i) => {
    if (i < p - 1 || !atr[i]) return null;
    const pdi = (plus[i] / atr[i]) * 100, mdi = (minus[i] / atr[i]) * 100;
    const dx = Math.abs(pdi - mdi) / Math.max(pdi + mdi, 1e-9) * 100;
    return dx;
  });
}

// ═══════════ SMC ENGINE ═════════════════════════════════════════════════════
function findSwings(c, lb = 3) {
  const sh = [], sl = [];
  for (let i = lb; i < c.length - lb; i++) {
    let hi = true, lo = true;
    for (let j = 1; j <= lb; j++) {
      if (c[i].h <= c[i - j].h || c[i].h <= c[i + j].h) hi = false;
      if (c[i].l >= c[i - j].l || c[i].l >= c[i + j].l) lo = false;
    }
    if (hi) sh.push({ i, price: c[i].h });
    if (lo) sl.push({ i, price: c[i].l });
  }
  return { sh, sl };
}

export function analyzeSMC(candles) {
  if (!candles || candles.length < 40) return null;
  const { sh, sl } = findSwings(candles, 3);
  const last = candles.length - 1, price = candles[last].c, reasons = [];
  let bias = 0, structure = "盤整";
  const rh = sh.slice(-3), rl = sl.slice(-3);
  if (rh.length >= 2 && rl.length >= 2) {
    const hh = rh[rh.length - 1].price > rh[rh.length - 2].price;
    const hl = rl[rl.length - 1].price > rl[rl.length - 2].price;
    const lh = rh[rh.length - 1].price < rh[rh.length - 2].price;
    const ll = rl[rl.length - 1].price < rl[rl.length - 2].price;
    if (hh && hl) { structure = "上升結構 (HH+HL)"; bias += 2; reasons.push("市場結構上升 (更高高點+更高低點)，多頭 BOS"); }
    else if (lh && ll) { structure = "下降結構 (LH+LL)"; bias -= 2; reasons.push("市場結構下降 (更低高點+更低低點)，空頭 BOS"); }
    else if (hh && ll) { structure = "結構轉折 CHoCH"; reasons.push("出現結構轉折 (CHoCH)，方向待確認"); }
  }
  const last5 = candles.slice(-6, -1);
  const ph = Math.max(...last5.map((c) => c.h)), pl = Math.min(...last5.map((c) => c.l)), lc = candles[last];
  let sweep = null;
  if (lc.h > ph && lc.c < ph) { sweep = "上方流動性掃單"; bias -= 1.5; reasons.push("掃過前高後收回 (賣方流動性獵取)，偏空"); }
  if (lc.l < pl && lc.c > pl) { sweep = "下方流動性掃單"; bias += 1.5; reasons.push("掃過前低後收回 (買方流動性獵取)，偏多"); }
  let fvg = null;
  for (let i = last - 1; i >= Math.max(0, last - 10); i--) {
    if (candles[i + 1] && candles[i - 1]) {
      if (candles[i - 1].h < candles[i + 1].l) { fvg = { type: "bull", top: candles[i + 1].l, bot: candles[i - 1].h }; break; }
      if (candles[i - 1].l > candles[i + 1].h) { fvg = { type: "bear", top: candles[i - 1].l, bot: candles[i + 1].h }; break; }
    }
  }
  if (fvg) {
    if (fvg.type === "bull" && price >= fvg.bot && price <= fvg.top * 1.005) { bias += 1; reasons.push("回踩多頭 FVG 失衡區，潛在支撐"); }
    if (fvg.type === "bear" && price <= fvg.top && price >= fvg.bot * 0.995) { bias -= 1; reasons.push("回踩空頭 FVG 失衡區，潛在壓力"); }
  }
  let ob = null;
  for (let i = last - 2; i >= Math.max(0, last - 15); i--) {
    const mv = (candles[i + 1].c - candles[i + 1].o) / candles[i + 1].o;
    if (candles[i].c < candles[i].o && mv > 0.012) { ob = { type: "bull", top: candles[i].h, bot: candles[i].l }; break; }
    if (candles[i].c > candles[i].o && mv < -0.012) { ob = { type: "bear", top: candles[i].h, bot: candles[i].l }; break; }
  }
  if (ob) {
    if (ob.type === "bull" && price >= ob.bot && price <= ob.top * 1.003) { bias += 1; reasons.push("進入多頭訂單塊 (機構買單區)"); }
    if (ob.type === "bear" && price <= ob.top && price >= ob.bot * 0.997) { bias -= 1; reasons.push("進入空頭訂單塊 (機構賣單區)"); }
  }
  const closes = candles.map((c) => c.c), highs = candles.map((c) => c.h), lows = candles.map((c) => c.l);
  const { hist } = calcMACD(closes), rsi = calcRSI(closes), kdj = calcKDJ(highs, lows, closes);
  const h = hist[last], r = rsi[last], k = kdj[last]?.k, d = kdj[last]?.d;
  let confirms = 0;
  if (h != null) confirms += h > 0 ? 1 : -1;
  if (r != null) confirms += r > 55 ? 1 : r < 45 ? -1 : 0;
  if (k != null && d != null) confirms += k > d ? 1 : -1;
  const snr = calcSNR(candles);
  if (snr) {
    if (snr.support && snr.support.dist < 1) { bias += 0.5; reasons.push(`價格貼近支撐 ${snr.support.price.toFixed(4)} (強度${snr.support.strength})`); }
    if (snr.resistance && snr.resistance.dist < 1) { bias -= 0.5; reasons.push(`價格貼近壓力 ${snr.resistance.price.toFixed(4)} (強度${snr.resistance.strength})`); }
  }
  const score = bias + confirms * 0.5;
  let signal = "觀望", color = "#787b86";
  if (score >= 2.5) { signal = "強力做多"; color = "#26a69a"; }
  else if (score >= 1) { signal = "做多"; color = "#26a69a"; }
  else if (score <= -2.5) { signal = "強力做空"; color = "#ef5350"; }
  else if (score <= -1) { signal = "做空"; color = "#ef5350"; }
  const confidence = Math.min(99, Math.round((Math.abs(score) / 5) * 100));
  return {
    signal, color, score, confidence, structure, sweep, fvg, ob, reasons, price, snr,
    confirm: {
      macd: h == null ? "—" : h > 0 ? "多頭" : "空頭",
      rsi: r == null ? "—" : r > 55 ? "偏多" : r < 45 ? "偏空" : "中性",
      kdj: k != null && d != null ? (k > d ? "金叉" : "死叉") : "—",
    },
  };
}

export async function analyzeSMCMulti(item) {
  const tfs = ["15m", "1H", "4H", "1D"];
  const results = await Promise.all(tfs.map(async (tf) => {
    const k = await loadKlines(item, tf);
    return { tf, result: k && k.length >= 40 ? analyzeSMC(k) : null };
  }));
  return results;
}

// ═══════════ 回測引擎 ═══════════════════════════════════════════════════════
// 對歷史 K 線跑 SMC 策略，模擬每個訊號的交易結果，產出績效報告
// opts: { atrMult: 止損 ATR 倍數, targetMult: 目標 ATR 倍數, maxBars: 最多持有 K 棒數 }
export function backtest(candles, opts = {}) {
  const { atrMult = 1.5, targetMult = 2, maxBars = 30, lookback = 50 } = opts;
  if (!candles || candles.length < lookback + 20) return null;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const closes = candles.map((c) => c.c);
  const atrs = calcATR(highs, lows, closes);

  const trades = [];
  let open = null;

  for (let i = lookback; i < candles.length; i++) {
    const cdl = candles[i];

    // 檢查當前未結束的交易
    if (open) {
      let exited = false;
      if (open.isLong) {
        if (cdl.l <= open.stop) {
          open.exit = open.stop; open.exitReason = "止損";
          open.pnl = ((open.stop - open.entry) / open.entry) * 100;
          exited = true;
        } else if (cdl.h >= open.target) {
          open.exit = open.target; open.exitReason = "目標達成";
          open.pnl = ((open.target - open.entry) / open.entry) * 100;
          exited = true;
        }
      } else {
        if (cdl.h >= open.stop) {
          open.exit = open.stop; open.exitReason = "止損";
          open.pnl = ((open.entry - open.stop) / open.entry) * 100;
          exited = true;
        } else if (cdl.l <= open.target) {
          open.exit = open.target; open.exitReason = "目標達成";
          open.pnl = ((open.entry - open.target) / open.entry) * 100;
          exited = true;
        }
      }
      if (!exited && i - open.entryIdx >= maxBars) {
        open.exit = cdl.c; open.exitReason = "時間止損";
        open.pnl = open.isLong
          ? ((cdl.c - open.entry) / open.entry) * 100
          : ((open.entry - cdl.c) / open.entry) * 100;
        exited = true;
      }
      if (exited) {
        open.exitTime = cdl.t;
        open.barsHeld = i - open.entryIdx;
        trades.push(open);
        open = null;
      }
    }

    // 沒在交易中：跑 SMC 看是否進場
    if (!open) {
      const slice = candles.slice(0, i + 1);
      const smc = analyzeSMC(slice);
      if (!smc) continue;
      const atr = atrs[i];
      if (!atr) continue;
      const isLong = smc.signal.includes("做多");
      const isShort = smc.signal.includes("做空");
      if (!isLong && !isShort) continue;
      // 過濾低信心訊號
      if (smc.confidence < 30) continue;
      open = {
        entryIdx: i,
        entryTime: cdl.t,
        entry: cdl.c,
        isLong,
        signal: smc.signal,
        confidence: smc.confidence,
        structure: smc.structure,
        stop: isLong ? cdl.c - atr * atrMult : cdl.c + atr * atrMult,
        target: isLong ? cdl.c + atr * targetMult : cdl.c - atr * targetMult,
      };
    }
  }

  // 統計
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? 99 : 0);

  // 累積績效曲線
  let cum = 0;
  const equity = trades.map((t) => { cum += t.pnl; return { t: t.exitTime, cum }; });

  // 最大回撤
  let peak = 0, maxDD = 0;
  equity.forEach((e) => {
    if (e.cum > peak) peak = e.cum;
    if (e.cum - peak < maxDD) maxDD = e.cum - peak;
  });

  return {
    trades,
    stats: {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor,
      maxDD,
    },
    equity,
  };
}

// ═══════════ 期貨 API (Binance fapi) ═══════════════════════════════════════
function fpsym(item) { return item.binanceSymbol || `${item.name}USDT`; }

// 資金費率 + 標記價
export async function loadFundingRate(item) {
  const sym = fpsym(item);
  const d = await jget(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`, { useProxy: true });
  if (!d || d.lastFundingRate == null) return null;
  return {
    funding: parseFloat(d.lastFundingRate) || 0,
    nextFundingTime: d.nextFundingTime,
    markPrice: parseFloat(d.markPrice) || 0,
  };
}

// 現在 OI（合約持倉量）
export async function loadOpenInterest(item) {
  const sym = fpsym(item);
  const d = await jget(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`, { useProxy: true });
  if (!d) return null;
  return { oi: parseFloat(d.openInterest) || 0, time: d.time };
}

// OI 歷史 - 用於計算變化率
export async function loadOIHist(item, period = "5m", limit = 12) {
  const sym = fpsym(item);
  const d = await jget(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=${period}&limit=${limit}`, { useProxy: true });
  if (!Array.isArray(d) || !d.length) return null;
  return d.map(r => ({
    t: r.timestamp,
    oi: parseFloat(r.sumOpenInterest) || 0,
    oiUSD: parseFloat(r.sumOpenInterestValue) || 0,
  }));
}

// 散戶多空比（全市場 account ratio，散戶傾向反向指標）
export async function loadGlobalLongShort(item, period = "5m", limit = 6) {
  const sym = fpsym(item);
  const d = await jget(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=${period}&limit=${limit}`, { useProxy: true });
  if (!Array.isArray(d) || !d.length) return null;
  const last = d[d.length - 1];
  return {
    ratio: parseFloat(last.longShortRatio) || 0,
    longPct: (parseFloat(last.longAccount) || 0) * 100,
    shortPct: (parseFloat(last.shortAccount) || 0) * 100,
  };
}

// 大戶多空比（top trader by position，較具參考價值）
export async function loadTopLongShortPosition(item, period = "5m", limit = 6) {
  const sym = fpsym(item);
  const d = await jget(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${sym}&period=${period}&limit=${limit}`, { useProxy: true });
  if (!Array.isArray(d) || !d.length) return null;
  const last = d[d.length - 1];
  return {
    ratio: parseFloat(last.longShortRatio) || 0,
    longPct: (parseFloat(last.longAccount) || 0) * 100,
    shortPct: (parseFloat(last.shortAccount) || 0) * 100,
  };
}

// Taker buy/sell volume（主動買賣 → 近似 CVD）
export async function loadTakerVolume(item, period = "5m", limit = 6) {
  const sym = fpsym(item);
  const d = await jget(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${sym}&period=${period}&limit=${limit}`, { useProxy: true });
  if (!Array.isArray(d) || !d.length) return null;
  const last = d[d.length - 1];
  const cvdProxy = d.reduce((sum, r) => sum + (parseFloat(r.buyVol || 0) - parseFloat(r.sellVol || 0)), 0);
  return {
    ratio: parseFloat(last.buySellRatio) || 0,
    buyVol: parseFloat(last.buyVol) || 0,
    sellVol: parseFloat(last.sellVol) || 0,
    cvdRecent: cvdProxy,
    trend: cvdProxy > 0 ? "資金流入" : cvdProxy < 0 ? "資金流出" : "持平",
  };
}

// 相對強弱 vs BTC（24h 收盤變化差）
export async function loadRelativeStrengthVsBTC(item) {
  if (!item || item.name === "BTC") return { rs: 0, label: "基準", coinChg: 0, btcChg: 0 };
  const [coinK, btcK] = await Promise.all([
    klinesBinance(item, "1H"),
    klinesBinance({ name: "BTC", binanceSymbol: "BTCUSDT" }, "1H"),
  ]);
  if (!coinK || !btcK || coinK.length < 25 || btcK.length < 25) return null;
  const coinNow = coinK[coinK.length - 1].c, coinBase = coinK[coinK.length - 25].c;
  const btcNow = btcK[btcK.length - 1].c, btcBase = btcK[btcK.length - 25].c;
  const coinChg = (coinNow - coinBase) / coinBase * 100;
  const btcChg = (btcNow - btcBase) / btcBase * 100;
  const rs = coinChg - btcChg;
  return { rs, coinChg, btcChg, label: rs > 2 ? "強勢" : rs < -2 ? "弱勢" : "同步" };
}

// ═══════════ AI 加密貨幣深度分析 ═══════════════════════════════════════════
export async function aiAnalyzeCryptoDeep(item, candles, smc, smcMulti) {
  if (!candles || candles.length < 50 || !smc || !item) return null;

  const [funding, oi, oiHist, globalLS, topLS, taker, rsBTC] = await Promise.all([
    loadFundingRate(item).catch(() => null),
    loadOpenInterest(item).catch(() => null),
    loadOIHist(item, "5m", 12).catch(() => null),
    loadGlobalLongShort(item).catch(() => null),
    loadTopLongShortPosition(item).catch(() => null),
    loadTakerVolume(item).catch(() => null),
    loadRelativeStrengthVsBTC(item).catch(() => null),
  ]);

  let bullScore = 0, bearScore = 0;
  const factors = [];

  // SMC 多時區共振
  const valid = (smcMulti || []).filter(m => m.result);
  const longs = valid.filter(m => m.result.signal.includes("做多")).length;
  const shorts = valid.filter(m => m.result.signal.includes("做空")).length;
  if (longs >= 3) { bullScore += 3; factors.push({ k: "多時區共振", v: `${longs}/${valid.length} 多頭`, side: "bull" }); }
  else if (shorts >= 3) { bearScore += 3; factors.push({ k: "多時區共振", v: `${shorts}/${valid.length} 空頭`, side: "bear" }); }
  else if (longs > shorts) { bullScore += 1; factors.push({ k: "多時區共振", v: `${longs}多 / ${shorts}空`, side: "bull" }); }
  else if (shorts > longs) { bearScore += 1; factors.push({ k: "多時區共振", v: `${shorts}空 / ${longs}多`, side: "bear" }); }
  else factors.push({ k: "多時區共振", v: "分歧", side: "neutral" });

  // SMC 主訊號
  if (smc.signal.includes("強力做多")) { bullScore += 2; factors.push({ k: "SMC 結構", v: smc.signal, side: "bull" }); }
  else if (smc.signal.includes("做多")) { bullScore += 1; factors.push({ k: "SMC 結構", v: smc.signal, side: "bull" }); }
  else if (smc.signal.includes("強力做空")) { bearScore += 2; factors.push({ k: "SMC 結構", v: smc.signal, side: "bear" }); }
  else if (smc.signal.includes("做空")) { bearScore += 1; factors.push({ k: "SMC 結構", v: smc.signal, side: "bear" }); }
  else factors.push({ k: "SMC 結構", v: "觀望", side: "neutral" });

  // 資金費率
  if (funding) {
    const fr = funding.funding * 100;
    if (fr > 0.05) { bearScore += 1; factors.push({ k: "資金費率", v: `+${fr.toFixed(4)}% (多頭擁擠)`, side: "bear" }); }
    else if (fr < -0.02) { bullScore += 1; factors.push({ k: "資金費率", v: `${fr.toFixed(4)}% (空頭擁擠)`, side: "bull" }); }
    else factors.push({ k: "資金費率", v: `${fr.toFixed(4)}% (中性)`, side: "neutral" });
  }

  // OI 變化 + 價格組合
  let oiChg = null;
  if (oiHist && oiHist.length >= 6) {
    const oiNow = oiHist[oiHist.length - 1].oi, oiOld = oiHist[0].oi;
    if (oiOld > 0) oiChg = (oiNow - oiOld) / oiOld * 100;
  }
  if (oiChg != null) {
    const cls = candles.map(c => c.c);
    const lastP = cls[cls.length - 1], baseP = cls[Math.max(0, cls.length - 13)];
    const pChg = baseP > 0 ? (lastP - baseP) / baseP * 100 : 0;
    if (oiChg > 3 && pChg > 0) { bullScore += 2; factors.push({ k: "OI + 價格", v: `OI +${oiChg.toFixed(1)}% 價 +${pChg.toFixed(1)}% (健康多頭)`, side: "bull" }); }
    else if (oiChg > 3 && pChg < 0) { bearScore += 1; factors.push({ k: "OI + 價格", v: `OI +${oiChg.toFixed(1)}% 價 ${pChg.toFixed(1)}% (空單建倉)`, side: "bear" }); }
    else if (oiChg < -3 && pChg > 0) { bullScore += 1; factors.push({ k: "OI + 價格", v: `OI ${oiChg.toFixed(1)}% 價 +${pChg.toFixed(1)}% (空單回補)`, side: "bull" }); }
    else if (oiChg < -3 && pChg < 0) { factors.push({ k: "OI + 價格", v: `OI ${oiChg.toFixed(1)}% 價 ${pChg.toFixed(1)}% (多頭離場)`, side: "neutral" }); }
    else factors.push({ k: "OI 變化", v: `${oiChg.toFixed(1)}%`, side: "neutral" });
  }

  // 多空情緒（散戶常反向、大戶常正向）
  if (globalLS && topLS) {
    if (globalLS.ratio < 0.85 && topLS.ratio > 1.15) { bullScore += 2; factors.push({ k: "多空情緒", v: `散戶看空 ${globalLS.ratio.toFixed(2)} 大戶看多 ${topLS.ratio.toFixed(2)} (反指標利多)`, side: "bull" }); }
    else if (globalLS.ratio > 1.4 && topLS.ratio < 0.9) { bearScore += 2; factors.push({ k: "多空情緒", v: `散戶看多 ${globalLS.ratio.toFixed(2)} 大戶看空 ${topLS.ratio.toFixed(2)} (反指標利空)`, side: "bear" }); }
    else if (topLS.ratio > 1.2) { bullScore += 1; factors.push({ k: "多空情緒", v: `大戶看多 (${topLS.ratio.toFixed(2)})`, side: "bull" }); }
    else if (topLS.ratio < 0.85) { bearScore += 1; factors.push({ k: "多空情緒", v: `大戶看空 (${topLS.ratio.toFixed(2)})`, side: "bear" }); }
    else factors.push({ k: "多空情緒", v: `散戶 ${globalLS.ratio.toFixed(2)} 大戶 ${topLS.ratio.toFixed(2)}`, side: "neutral" });
  }

  // Taker CVD
  if (taker) {
    if (taker.cvdRecent > 0 && taker.ratio > 1.1) { bullScore += 1; factors.push({ k: "Taker CVD", v: `資金流入 (買賣比 ${taker.ratio.toFixed(2)})`, side: "bull" }); }
    else if (taker.cvdRecent < 0 && taker.ratio < 0.9) { bearScore += 1; factors.push({ k: "Taker CVD", v: `資金流出 (買賣比 ${taker.ratio.toFixed(2)})`, side: "bear" }); }
    else factors.push({ k: "Taker CVD", v: `${taker.trend} (比 ${taker.ratio.toFixed(2)})`, side: "neutral" });
  }

  // vs BTC
  if (rsBTC && item.name !== "BTC") {
    if (rsBTC.rs > 2) { bullScore += 1; factors.push({ k: "vs BTC", v: `強勢 +${rsBTC.rs.toFixed(1)}%`, side: "bull" }); }
    else if (rsBTC.rs < -2) { bearScore += 1; factors.push({ k: "vs BTC", v: `弱勢 ${rsBTC.rs.toFixed(1)}%`, side: "bear" }); }
    else factors.push({ k: "vs BTC", v: `同步 ${rsBTC.rs.toFixed(1)}%`, side: "neutral" });
  }

  // ATR for trade plan
  const highs = candles.map(c => c.h), lows = candles.map(c => c.l), closes = candles.map(c => c.c);
  const atr = calcATR(highs, lows, closes);
  const atrNow = atr[atr.length - 1] || (closes[closes.length - 1] * 0.01);

  const totalScore = bullScore - bearScore;
  const conf = Math.min(95, Math.round((Math.abs(totalScore) / 10) * 100));

  let direction = "觀望", color = "#787b86", emoji = "⚖️";
  if (totalScore >= 7) { direction = "強烈做多"; color = "#26a69a"; emoji = "🚀"; }
  else if (totalScore >= 4) { direction = "做多"; color = "#26a69a"; emoji = "📈"; }
  else if (totalScore <= -7) { direction = "強烈做空"; color = "#ef5350"; emoji = "💥"; }
  else if (totalScore <= -4) { direction = "做空"; color = "#ef5350"; emoji = "📉"; }
  else if (totalScore >= 2) { direction = "偏多"; color = "#7fb284"; emoji = "↗️"; }
  else if (totalScore <= -2) { direction = "偏空"; color = "#d98890"; emoji = "↘️"; }

  const isLong = totalScore > 0;
  const price = closes[closes.length - 1];
  const entry = price;
  const stop = isLong ? price - atrNow * 1.5 : price + atrNow * 1.5;
  const target1 = isLong ? price + atrNow * 2 : price - atrNow * 2;
  const target2 = isLong ? price + atrNow * 4 : price - atrNow * 4;
  const rr = Math.abs(target1 - entry) / Math.max(Math.abs(entry - stop), 1e-9);

  const summary = totalScore === 0
    ? "目前訊號分歧或盤整，建議觀望等待更明確方向。"
    : `${emoji} 綜合判斷偏向 ${direction}，信心度 ${conf}%。整合 SMC 結構、期貨資金面、多空情緒、Taker CVD 與 vs BTC 多面向訊號。`;

  return {
    direction, color, emoji, confidence: conf, score: totalScore,
    factors, summary,
    plan: { entry, stop, target1, target2, rr: rr.toFixed(2), atr: atrNow, isLong },
    extra: { funding, oi, oiChg, globalLS, topLS, taker, rsBTC },
    risk: "本分析整合期貨資金面與技術面，僅供參考。實際交易請結合資金管理。",
  };
}

// 維持舊 aiAnalyze 名稱兼容（其他地方可能引用）— 改 alias
export function aiAnalyze(item, candles, smc, smcMulti) {
  // 同步版簡化（不抓期貨）— 給快速顯示用
  if (!candles || candles.length < 50 || !smc) return null;
  const closes = candles.map(c => c.c), highs = candles.map(c => c.h), lows = candles.map(c => c.l), vols = candles.map(c => c.v || 0);
  const n = closes.length - 1, price = closes[n];
  let bullScore = 0, bearScore = 0;
  const factors = [];

  const valid = (smcMulti || []).filter(m => m.result);
  const longs = valid.filter(m => m.result.signal.includes("做多")).length;
  const shorts = valid.filter(m => m.result.signal.includes("做空")).length;
  if (longs >= 3) { bullScore += 3; factors.push({ k: "多時區共振", v: `${longs}/${valid.length} 多頭`, side: "bull" }); }
  else if (shorts >= 3) { bearScore += 3; factors.push({ k: "多時區共振", v: `${shorts}/${valid.length} 空頭`, side: "bear" }); }
  else if (longs > shorts) { bullScore += 1; factors.push({ k: "多時區共振", v: `${longs}多/${shorts}空`, side: "bull" }); }
  else if (shorts > longs) { bearScore += 1; factors.push({ k: "多時區共振", v: `${shorts}空/${longs}多`, side: "bear" }); }
  else factors.push({ k: "多時區共振", v: "分歧", side: "neutral" });

  if (smc.signal.includes("強力做多")) { bullScore += 2; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bull" }); }
  else if (smc.signal.includes("做多")) { bullScore += 1; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bull" }); }
  else if (smc.signal.includes("強力做空")) { bearScore += 2; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bear" }); }
  else if (smc.signal.includes("做空")) { bearScore += 1; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bear" }); }
  else factors.push({ k: "SMC 主訊號", v: "觀望", side: "neutral" });

  const ma5 = calcSMA(closes, 5)[n], ma20 = calcSMA(closes, 20)[n], ma60 = calcSMA(closes, 60)[n];
  if (ma5 && ma20 && ma60) {
    if (ma5 > ma20 && ma20 > ma60) { bullScore += 2; factors.push({ k: "均線排列", v: "多頭排列", side: "bull" }); }
    else if (ma5 < ma20 && ma20 < ma60) { bearScore += 2; factors.push({ k: "均線排列", v: "空頭排列", side: "bear" }); }
    else factors.push({ k: "均線排列", v: "糾結", side: "neutral" });
  }

  const atr = calcATR(highs, lows, closes);
  const atrNow = atr[n] || (price * 0.01);
  const totalScore = bullScore - bearScore;
  const conf = Math.min(95, Math.round((Math.abs(totalScore) / 7) * 100));

  let direction = "觀望", color = "#787b86", emoji = "⚖️";
  if (totalScore >= 5) { direction = "強烈做多"; color = "#26a69a"; emoji = "🚀"; }
  else if (totalScore >= 3) { direction = "做多"; color = "#26a69a"; emoji = "📈"; }
  else if (totalScore <= -5) { direction = "強烈做空"; color = "#ef5350"; emoji = "💥"; }
  else if (totalScore <= -3) { direction = "做空"; color = "#ef5350"; emoji = "📉"; }
  else if (totalScore >= 1) { direction = "偏多"; color = "#7fb284"; emoji = "↗️"; }
  else if (totalScore <= -1) { direction = "偏空"; color = "#d98890"; emoji = "↘️"; }

  const isLong = totalScore > 0;
  const entry = price;
  const stop = isLong ? price - atrNow * 1.5 : price + atrNow * 1.5;
  const target1 = isLong ? price + atrNow * 2 : price - atrNow * 2;
  const target2 = isLong ? price + atrNow * 4 : price - atrNow * 4;
  const rr = Math.abs(target1 - entry) / Math.max(Math.abs(entry - stop), 1e-9);
  const summary = totalScore === 0
    ? "目前訊號分歧或盤整，建議觀望等待更明確方向。"
    : `${emoji} 綜合判斷偏向 ${direction}，信心度 ${conf}%。`;

  return {
    direction, color, emoji, confidence: conf, score: totalScore, factors, summary,
    plan: { entry, stop, target1, target2, rr: rr.toFixed(2), atr: atrNow, isLong },
    risk: "本分析為演算法綜合多項技術指標，僅供參考。",
  };
}

// ═══════════ 多空推薦掃描 ═══════════════════════════════════════════════════
// 掃前 N 大成交量幣 → SMC 評分 → 分多空兩欄
export async function scanRecommendations(coins, top = 200, onProgress) {
  const cands = coins.slice(0, Math.min(top, coins.length));
  const results = [];
  for (let i = 0; i < cands.length; i += 20) {
    const batch = cands.slice(i, i + 20);
    const ks = await Promise.all(batch.map(c => klinesBinance(c, "1H").catch(() => null)));
    batch.forEach((coin, j) => {
      const k = ks[j];
      if (!k || k.length < 40) return;
      const smc = analyzeSMC(k);
      if (!smc) return;
      results.push({
        symbol: coin.symbol, name: coin.name, label: coin.label,
        price: coin.price, change: coin.change, volume: coin.volume,
        binanceSymbol: coin.binanceSymbol, cat: "crypto",
        signal: smc.signal, score: smc.score, confidence: smc.confidence,
        structure: smc.structure,
      });
    });
    if (onProgress) onProgress(Math.min(i + 20, cands.length), cands.length);
    if (i + 20 < cands.length) await new Promise(r => setTimeout(r, 150));
  }
  const longs = results.filter(r => r.signal.includes("做多")).sort((a, b) => b.score - a.score).slice(0, 15);
  const shorts = results.filter(r => r.signal.includes("做空")).sort((a, b) => a.score - b.score).slice(0, 15);
  return { longs, shorts, scanned: results.length, total: cands.length };
}

// ═══════════ 持倉異常警報掃描 ═══════════════════════════════════════════════
// 每 3 分鐘掃前 N 幣，對比 OI 5m 變化 + 24h 價格變化
// 觸發類型：多頭觸發 / 空頭觸發 / 誘空 / 疑似反轉
export async function scanAnomalies(coins, top = 200, onProgress) {
  const cands = coins.slice(0, Math.min(top, coins.length));
  const alerts = [];
  for (let i = 0; i < cands.length; i += 15) {
    const batch = cands.slice(i, i + 15);
    const data = await Promise.all(batch.map(async (coin) => {
      const oiHist = await loadOIHist(coin, "5m", 6).catch(() => null);
      return { coin, oiHist };
    }));
    data.forEach(({ coin, oiHist }) => {
      if (!oiHist || oiHist.length < 4) return;
      const oiNow = oiHist[oiHist.length - 1].oi;
      const oiBase = oiHist.slice(0, -1).reduce((s, x) => s + x.oi, 0) / (oiHist.length - 1);
      if (oiBase <= 0) return;
      const oiChgPct = (oiNow - oiBase) / oiBase * 100;
      const priceChg = coin.change || 0;
      let type = null, severity = Math.abs(oiChgPct), color = "#787b86";
      // 用 ±4% 當門檻，避免噪音
      if (oiChgPct > 4 && priceChg > 0) { type = "多頭觸發"; color = "#26a69a"; }
      else if (oiChgPct > 4 && priceChg < -1) { type = "誘空 (OI增+價跌)"; color = "#ef5350"; }
      else if (oiChgPct < -4 && priceChg > 1) { type = "疑似反轉 (OI減+價升)"; color = "#f0b90b"; }
      else if (oiChgPct < -4 && priceChg < 0) { type = "空頭觸發"; color = "#ef5350"; }
      if (type) {
        alerts.push({
          symbol: coin.symbol, name: coin.name, label: coin.label,
          price: coin.price, change: priceChg, volume: coin.volume,
          binanceSymbol: coin.binanceSymbol, cat: "crypto",
          type, color, oiChgPct, severity, ts: Date.now(),
        });
      }
    });
    if (onProgress) onProgress(Math.min(i + 15, cands.length), cands.length);
    if (i + 15 < cands.length) await new Promise(r => setTimeout(r, 250));
  }
  return alerts.sort((a, b) => b.severity - a.severity);
}

// ═══════════ 多 AI 個別分析（5 個派系）═══════════════════════════════════════
function formatAIResult(name, emoji, score, maxScore, reasons) {
  let direction = "觀望", color = "#787b86";
  if (score >= maxScore * 0.7) { direction = "強烈做多"; color = "#26a69a"; }
  else if (score >= maxScore * 0.3) { direction = "做多"; color = "#26a69a"; }
  else if (score <= -maxScore * 0.7) { direction = "強烈做空"; color = "#ef5350"; }
  else if (score <= -maxScore * 0.3) { direction = "做空"; color = "#ef5350"; }
  const confidence = Math.min(99, Math.round((Math.abs(score) / maxScore) * 100));
  return { name, emoji, direction, color, confidence, score, reasons };
}

// AI 1: 趨勢跟隨派 — 均線、ADX、動能
function aiTrendFollower(candles) {
  const closes = candles.map((c) => c.c), highs = candles.map((c) => c.h), lows = candles.map((c) => c.l);
  const n = closes.length - 1;
  let score = 0;
  const reasons = [];
  const ma5 = calcSMA(closes, 5)[n], ma20 = calcSMA(closes, 20)[n], ma60 = calcSMA(closes, 60)[n];
  if (ma5 && ma20 && ma60) {
    if (ma5 > ma20 && ma20 > ma60) { score += 3; reasons.push("均線多頭排列 (5>20>60)"); }
    else if (ma5 < ma20 && ma20 < ma60) { score -= 3; reasons.push("均線空頭排列 (5<20<60)"); }
    else reasons.push("均線糾結");
  }
  const adx = calcADX(highs, lows, closes)[n];
  if (adx != null) {
    if (adx > 25) reasons.push(`趨勢強勁 (ADX ${adx.toFixed(0)})`);
    else if (adx > 15) reasons.push(`趨勢中等 (ADX ${adx.toFixed(0)})`);
    else { reasons.push(`盤整 (ADX ${adx.toFixed(0)}, 訊號減半)`); score *= 0.5; }
  }
  if (n >= 10) {
    const recent = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const base = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const mom = ((recent - base) / base) * 100;
    if (mom > 1) { score += 1; reasons.push(`短期動能 +${mom.toFixed(1)}%`); }
    else if (mom < -1) { score -= 1; reasons.push(`短期動能 ${mom.toFixed(1)}%`); }
  }
  return formatAIResult("趨勢跟隨", "🏃", score, 5, reasons);
}

// AI 2: 均值回歸派 — RSI / KDJ / 布林帶反向
function aiMeanReversion(candles) {
  const closes = candles.map((c) => c.c), highs = candles.map((c) => c.h), lows = candles.map((c) => c.l);
  const n = closes.length - 1;
  let score = 0;
  const reasons = [];
  const rsi = calcRSI(closes)[n];
  if (rsi != null) {
    if (rsi > 75) { score -= 2; reasons.push(`RSI ${rsi.toFixed(0)} 超買，預期回落`); }
    else if (rsi < 25) { score += 2; reasons.push(`RSI ${rsi.toFixed(0)} 超賣，預期反彈`); }
    else reasons.push(`RSI ${rsi.toFixed(0)} 中性`);
  }
  const kdj = calcKDJ(highs, lows, closes)[n];
  if (kdj?.k != null) {
    if (kdj.k > 80) { score -= 1; reasons.push(`KDJ K=${kdj.k.toFixed(0)} 過熱`); }
    else if (kdj.k < 20) { score += 1; reasons.push(`KDJ K=${kdj.k.toFixed(0)} 過冷`); }
  }
  if (n >= 20) {
    const window = closes.slice(n - 19, n + 1);
    const mean = window.reduce((s, x) => s + x, 0) / 20;
    const std = Math.sqrt(window.reduce((s, x) => s + (x - mean) ** 2, 0) / 20);
    const upper = mean + std * 2, lower = mean - std * 2;
    const price = closes[n];
    if (price > upper) { score -= 2; reasons.push("價突破布林上軌，預期回落"); }
    else if (price < lower) { score += 2; reasons.push("價跌破布林下軌，預期反彈"); }
    else reasons.push("價在布林帶內");
  }
  return formatAIResult("均值回歸", "🔁", score, 5, reasons);
}

// AI 3: SMC 機構派 — 用現有 SMC 引擎
function aiSMCFlavor(smc, smcMulti) {
  let score = 0;
  const reasons = [];
  if (!smc) return formatAIResult("SMC 機構", "🏛️", 0, 1, ["SMC 資料不足"]);
  if (smc.signal.includes("強力做多")) { score += 4; reasons.push(`主訊號：${smc.signal}`); }
  else if (smc.signal.includes("做多")) { score += 2; reasons.push(`主訊號：${smc.signal}`); }
  else if (smc.signal.includes("強力做空")) { score -= 4; reasons.push(`主訊號：${smc.signal}`); }
  else if (smc.signal.includes("做空")) { score -= 2; reasons.push(`主訊號：${smc.signal}`); }
  else reasons.push("主訊號：觀望");
  const valid = (smcMulti || []).filter((m) => m.result);
  const longs = valid.filter((m) => m.result.signal.includes("做多")).length;
  const shorts = valid.filter((m) => m.result.signal.includes("做空")).length;
  if (longs >= 3) { score += 2; reasons.push(`多時區共振 ${longs}/${valid.length} 多頭`); }
  else if (shorts >= 3) { score -= 2; reasons.push(`多時區共振 ${shorts}/${valid.length} 空頭`); }
  if (smc.structure.includes("上升")) reasons.push("市場結構：上升");
  else if (smc.structure.includes("下降")) reasons.push("市場結構：下降");
  if (smc.fvg) reasons.push(`${smc.fvg.type === "bull" ? "多頭" : "空頭"} FVG 失衡`);
  if (smc.ob) reasons.push(`${smc.ob.type === "bull" ? "多頭" : "空頭"} 訂單塊`);
  if (smc.sweep) reasons.push(smc.sweep);
  return formatAIResult("SMC 機構", "🏛️", score, 8, reasons);
}

// AI 4: 期貨情緒派 — Funding / OI / 多空比 / Taker CVD
async function aiFuturesSentiment(item, candles) {
  let score = 0;
  const reasons = [];
  const [funding, oiHist, globalLS, topLS, taker] = await Promise.all([
    loadFundingRate(item).catch(() => null),
    loadOIHist(item, "5m", 12).catch(() => null),
    loadGlobalLongShort(item).catch(() => null),
    loadTopLongShortPosition(item).catch(() => null),
    loadTakerVolume(item).catch(() => null),
  ]);
  if (funding) {
    const fr = funding.funding * 100;
    if (fr > 0.05) { score -= 1; reasons.push(`資金費率 +${fr.toFixed(4)}% 多頭擁擠`); }
    else if (fr < -0.02) { score += 1; reasons.push(`資金費率 ${fr.toFixed(4)}% 空頭擁擠`); }
    else reasons.push(`資金費率 ${fr.toFixed(4)}% 中性`);
  }
  if (oiHist && oiHist.length >= 6) {
    const oiNow = oiHist[oiHist.length - 1].oi, oiOld = oiHist[0].oi;
    if (oiOld > 0) {
      const oiChg = ((oiNow - oiOld) / oiOld) * 100;
      const cls = candles.map((c) => c.c);
      const baseP = cls[Math.max(0, cls.length - 13)];
      const pChg = baseP > 0 ? ((cls[cls.length - 1] - baseP) / baseP) * 100 : 0;
      if (oiChg > 3 && pChg > 0) { score += 2; reasons.push(`OI +${oiChg.toFixed(1)}% 價漲 健康多頭`); }
      else if (oiChg > 3 && pChg < 0) { score -= 1; reasons.push(`OI +${oiChg.toFixed(1)}% 價跌 空單建倉`); }
      else if (oiChg < -3 && pChg > 0) { score += 1; reasons.push(`OI ${oiChg.toFixed(1)}% 價漲 空單回補`); }
      else if (oiChg < -3 && pChg < 0) reasons.push(`OI ${oiChg.toFixed(1)}% 價跌 多頭離場`);
    }
  }
  if (globalLS && topLS) {
    if (globalLS.ratio < 0.85 && topLS.ratio > 1.15) { score += 2; reasons.push(`散戶看空 大戶看多 反指標利多`); }
    else if (globalLS.ratio > 1.4 && topLS.ratio < 0.9) { score -= 2; reasons.push(`散戶看多 大戶看空 反指標利空`); }
    else if (topLS.ratio > 1.2) { score += 1; reasons.push(`大戶看多 (${topLS.ratio.toFixed(2)})`); }
    else if (topLS.ratio < 0.85) { score -= 1; reasons.push(`大戶看空 (${topLS.ratio.toFixed(2)})`); }
  }
  if (taker) {
    if (taker.cvdRecent > 0 && taker.ratio > 1.1) { score += 1; reasons.push("主動買盤資金流入"); }
    else if (taker.cvdRecent < 0 && taker.ratio < 0.9) { score -= 1; reasons.push("主動賣盤資金流出"); }
  }
  if (reasons.length === 0) reasons.push("無法取得期貨資料");
  return formatAIResult("期貨情緒", "💰", score, 7, reasons);
}

// AI 5: 整合派 — 看其他四個的共識
function aiConsensus(otherAIs) {
  let total = 0;
  const reasons = [];
  otherAIs.forEach((ai) => {
    if (!ai) return;
    if (ai.direction !== "觀望") {
      const v = ai.direction.includes("做多") ? 1 : ai.direction.includes("做空") ? -1 : 0;
      total += v * (ai.confidence / 100);
      reasons.push(`${ai.emoji} ${ai.name}：${ai.direction} ${ai.confidence}%`);
    } else {
      reasons.push(`${ai.emoji} ${ai.name}：觀望`);
    }
  });
  return formatAIResult("整合共識", "🧠", total * 2.5, 4, reasons);
}

// ═══════════ AI 分析快取 ═══════════════════════════════════════════════════
// 期貨情緒派需要 call 5 支期貨 API，切換幣種/分頁時容易重複呼叫造成卡頓。
// 用 symbol+最後K棒時間 當 key，60 秒內重複請求直接回傳快取。
const _multiAICache = new Map();
const MULTI_AI_TTL = 60 * 1000;

// 主入口：執行所有 AI，回傳 5 個結果
export async function analyzeMultiAI(item, candles, smc, smcMulti) {
  if (!candles || candles.length < 30) return null;
  const lastT = candles[candles.length - 1]?.t || 0;
  const cacheKey = `${item?.symbol || item?.binanceSymbol || "?"}-${lastT}`;
  const cached = _multiAICache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MULTI_AI_TTL) return cached.data;

  const trend = aiTrendFollower(candles);
  const reversion = aiMeanReversion(candles);
  const smcA = aiSMCFlavor(smc, smcMulti);
  const futures = await aiFuturesSentiment(item, candles);
  const consensus = aiConsensus([trend, reversion, smcA, futures]);
  const result = [trend, reversion, smcA, futures, consensus];

  _multiAICache.set(cacheKey, { ts: Date.now(), data: result });
  // 簡單清理過舊快取，避免無限增長
  if (_multiAICache.size > 50) {
    const oldestKey = _multiAICache.keys().next().value;
    _multiAICache.delete(oldestKey);
  }
  return result;
}

// ═══════════ 高勝率回測（多時區策略）═══════════════════════════════════════
// 1D 趨勢確認 + 4H ADX>20 + 4H 方向一致 + 1H SMC 進場 + 量能確認
export async function backtestMTF(item, opts = {}) {
  const { atrMult = 1.5, targetMult = 3, maxBars = 30, minConfidence = 50 } = opts;

  const [c1H, c4H, c1D] = await Promise.all([
    loadKlines(item, "1H").catch(() => null),
    loadKlines(item, "4H").catch(() => null),
    loadKlines(item, "1D").catch(() => null),
  ]);

  if (!c1H || !c4H || !c1D || c1H.length < 80 || c4H.length < 50 || c1D.length < 50) {
    return null;
  }

  const findIdx = (arr, t) => {
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m].t <= t) { ans = m; lo = m + 1; }
      else hi = m - 1;
    }
    return ans;
  };

  const c4HHighs = c4H.map((c) => c.h), c4HLows = c4H.map((c) => c.l), c4HCloses = c4H.map((c) => c.c);
  const atr4H = calcATR(c4HHighs, c4HLows, c4HCloses);
  const adx4H = calcADX(c4HHighs, c4HLows, c4HCloses);

  const trades = [];
  let open = null;
  const startIdx = 60;

  for (let i = startIdx; i < c1H.length; i++) {
    const cdl = c1H[i];

    if (open) {
      let exited = false;
      if (open.isLong) {
        if (cdl.l <= open.stop) { open.exit = open.stop; open.exitReason = "止損"; open.pnl = ((open.stop - open.entry) / open.entry) * 100; exited = true; }
        else if (cdl.h >= open.target) { open.exit = open.target; open.exitReason = "目標達成"; open.pnl = ((open.target - open.entry) / open.entry) * 100; exited = true; }
      } else {
        if (cdl.h >= open.stop) { open.exit = open.stop; open.exitReason = "止損"; open.pnl = ((open.entry - open.stop) / open.entry) * 100; exited = true; }
        else if (cdl.l <= open.target) { open.exit = open.target; open.exitReason = "目標達成"; open.pnl = ((open.entry - open.target) / open.entry) * 100; exited = true; }
      }
      if (!exited) {
        const i1D = findIdx(c1D, cdl.t);
        if (i1D >= 40) {
          const smc1D = analyzeSMC(c1D.slice(0, i1D + 1));
          if (smc1D) {
            if (open.isLong && smc1D.structure.includes("下降")) {
              open.exit = cdl.c; open.exitReason = "1D 翻轉"; open.pnl = ((cdl.c - open.entry) / open.entry) * 100; exited = true;
            } else if (!open.isLong && smc1D.structure.includes("上升")) {
              open.exit = cdl.c; open.exitReason = "1D 翻轉"; open.pnl = ((open.entry - cdl.c) / open.entry) * 100; exited = true;
            }
          }
        }
      }
      if (!exited && i - open.entryIdx >= maxBars) {
        open.exit = cdl.c; open.exitReason = "時間止損";
        open.pnl = open.isLong ? ((cdl.c - open.entry) / open.entry) * 100 : ((open.entry - cdl.c) / open.entry) * 100;
        exited = true;
      }
      if (exited) {
        open.exitTime = cdl.t;
        open.barsHeld = i - open.entryIdx;
        trades.push(open);
        open = null;
      }
    }

    if (!open) {
      const i1D = findIdx(c1D, cdl.t);
      const i4H = findIdx(c4H, cdl.t);
      if (i1D < 40 || i4H < 40) continue;

      const smc1D = analyzeSMC(c1D.slice(0, i1D + 1));
      if (!smc1D) continue;
      const is1DUp = smc1D.structure.includes("上升");
      const is1DDown = smc1D.structure.includes("下降");
      if (!is1DUp && !is1DDown) continue;

      const adx = adx4H[i4H];
      if (adx == null || adx < 20) continue;

      const smc4H = analyzeSMC(c4H.slice(0, i4H + 1));
      if (!smc4H) continue;
      const is4HUp = smc4H.structure.includes("上升") || smc4H.signal.includes("做多");
      const is4HDown = smc4H.structure.includes("下降") || smc4H.signal.includes("做空");
      if (is1DUp && !is4HUp) continue;
      if (is1DDown && !is4HDown) continue;

      const smc1H = analyzeSMC(c1H.slice(0, i + 1));
      if (!smc1H || smc1H.confidence < minConfidence) continue;
      const is1HLong = smc1H.signal.includes("做多");
      const is1HShort = smc1H.signal.includes("做空");
      if (is1DUp && !is1HLong) continue;
      if (is1DDown && !is1HShort) continue;

      const vol5 = c1H.slice(Math.max(0, i - 4), i + 1).reduce((s, x) => s + x.v, 0) / 5;
      const vol20 = c1H.slice(Math.max(0, i - 19), i + 1).reduce((s, x) => s + x.v, 0) / 20;
      if (vol20 > 0 && vol5 < vol20 * 0.7) continue;

      const isLong = is1DUp;
      const atr = atr4H[i4H] || (cdl.c * 0.01);
      open = {
        entryIdx: i, entryTime: cdl.t, entry: cdl.c,
        isLong, signal: smc1H.signal, confidence: smc1H.confidence,
        structure: smc1D.structure,
        stop: isLong ? cdl.c - atr * atrMult : cdl.c + atr * atrMult,
        target: isLong ? cdl.c + atr * targetMult : cdl.c - atr * targetMult,
      };
    }
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? 99 : 0);

  let cum = 0;
  const equity = trades.map((t) => { cum += t.pnl; return { t: t.exitTime, cum }; });
  let peak = 0, maxDD = 0;
  equity.forEach((e) => {
    if (e.cum > peak) peak = e.cum;
    if (e.cum - peak < maxDD) maxDD = e.cum - peak;
  });

  return {
    trades, equity,
    stats: { total: trades.length, wins: wins.length, losses: losses.length, winRate, totalPnl, avgWin, avgLoss, profitFactor, maxDD },
  };
}

// ═══════════ JIN10 FLASH ═══════════════════════════════════════════════════
function extractJsonArray(txt) {
  if (!txt) return null;
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(txt.slice(start, end + 1)); } catch { return null; }
}

export async function loadJin10Flash() {
  const txt = await getText("https://www.jin10.com/flash_newest.js", { useProxy: true });
  const rows = extractJsonArray(txt);
  if (!Array.isArray(rows)) return null;
  return rows.slice(0, 40).map((r) => {
    const d = r.data || {};
    const text = (d.content || d.title || r.content || "").replace(/<[^>]+>/g, "").trim();
    return { time: r.time || "", text, important: !!(r.important || d.important) };
  }).filter((x) => x.text);
}

export async function loadCalendar() { return null; }
// ═══════════ 爆發掃描（多維度評分）═══════════════════════════════════════
export async function scanExplosive(coins, top = 200, onProgress) {
  const cands = coins.slice(0, Math.min(top, coins.length));
  const results = [];
  for (let i = 0; i < cands.length; i += 8) {
    const batch = cands.slice(i, i + 8);
    const rows = await Promise.all(batch.map(async (coin) => {
      try {
        const [oiHist, klines1h, fundingData] = await Promise.all([
          loadOIHist(coin, "5m", 5).catch(() => null),
          loadKlines(coin, "1H").catch(() => null),
          loadFundingRate(coin).catch(() => null),
        ]);
        return { coin, oiHist, klines1h, fundingData };
      } catch { return { coin, oiHist: null, klines1h: null, fundingData: null }; }
    }));
    rows.forEach(({ coin, oiHist, klines1h, fundingData }) => {
      let score = 0, direction = 0, oiChgPct = 0, fundingVal = 0;
      const signals = [];
      if (oiHist && oiHist.length >= 4) {
        const oiNow = oiHist[oiHist.length - 1].oi;
        const oiBase = oiHist.slice(0, -1).reduce((s, x) => s + x.oi, 0) / (oiHist.length - 1);
        if (oiBase > 0) {
          oiChgPct = (oiNow - oiBase) / oiBase * 100;
          if (Math.abs(oiChgPct) > 5) {
            score += 15;
            signals.push(`OI ${oiChgPct > 0 ? "+" : ""}${oiChgPct.toFixed(1)}%`);
            const pc = coin.change || 0;
            if (oiChgPct > 0 && pc > 0) direction += 1;
            else if (oiChgPct > 0 && pc < -1) direction -= 1;
            else if (oiChgPct < 0 && pc > 1) direction += 0.5;
            else if (oiChgPct < 0 && pc < 0) direction -= 0.5;
          }
        }
      }
      if (fundingData && fundingData.funding != null) {
        fundingVal = fundingData.funding * 100;
        if (fundingVal > 0.05) { score += 20; direction -= 1; signals.push(`Funding +${fundingVal.toFixed(3)}% 多頭過熱`); }
        else if (fundingVal < -0.05) { score += 20; direction += 1; signals.push(`Funding ${fundingVal.toFixed(3)}% 空頭擠倉`); }
      }
      if (klines1h && klines1h.length >= 30) {
        const closes = klines1h.map(c => c.c);
        const vols = klines1h.map(c => c.v);
        const n = closes.length - 1;
        const getBBW = (ei) => {
          if (ei < 19) return null;
          const sl = closes.slice(ei - 19, ei + 1);
          const m = sl.reduce((a, b) => a + b, 0) / 20;
          const s = Math.sqrt(sl.reduce((v, x) => v + (x - m) ** 2, 0) / 20);
          return m > 0 ? (s * 4) / m * 100 : null;
        };
        const curBBW = getBBW(n);
        const histBBWs = [];
        for (let j = n - 29; j < n; j++) { const w = getBBW(j); if (w != null) histBBWs.push(w); }
        if (curBBW != null && histBBWs.length >= 10 && curBBW <= Math.min(...histBBWs) * 1.2) { score += 20; signals.push("布林帶擠壓"); }
        const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
        if (avgVol > 0) {
          const vr = vols[n] / avgVol;
          if (vr >= 2) { score += 10; signals.push(`量能 ×${vr.toFixed(1)}`); if (closes[n] > closes[n - 1]) direction += 0.5; else direction -= 0.5; }
        }
        const smcR = analyzeSMC(klines1h);
        if (smcR) {
          if (smcR.signal.includes("強力做多")) { score += 20; direction += 2; signals.push("SMC 強力做多"); }
          else if (smcR.signal.includes("做多")) { score += 10; direction += 1; signals.push("SMC 做多"); }
          else if (smcR.signal.includes("強力做空")) { score += 20; direction -= 2; signals.push("SMC 強力做空"); }
          else if (smcR.signal.includes("做空")) { score += 10; direction -= 1; signals.push("SMC 做空"); }
          if (smcR.snr) {
            if (smcR.snr.support && smcR.snr.support.dist < 0.8) { score += 10; signals.push(`貼近支撐(${smcR.snr.support.dist.toFixed(2)}%)`); direction += 0.5; }
            if (smcR.snr.resistance && smcR.snr.resistance.dist < 0.8) { score += 10; signals.push(`貼近壓力(${smcR.snr.resistance.dist.toFixed(2)}%)`); direction -= 0.5; }
          }
        }
      }
      if (score >= 25 && signals.length >= 2) {
        results.push({ symbol: coin.symbol, name: coin.name, label: coin.label, price: coin.price, change: coin.change || 0, score: Math.min(score, 100), direction: direction >= 1 ? "long" : direction <= -1 ? "short" : "neutral", signals, oiChgPct, fundingVal, ts: Date.now(), binanceSymbol: coin.binanceSymbol, cat: "crypto" });
      }
    });
    if (onProgress) onProgress(Math.min(i + 8, cands.length), cands.length);
    if (i + 8 < cands.length) await new Promise(r => setTimeout(r, 300));
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 40);
}

// ═══════════ SNR 支撐壓力位 ═══════════════════════════════════════════════
// 用 swing high/low 群聚成關鍵價位，回傳最近的支撐/壓力
export function calcSNR(candles, lookback = 100) {
  if (!candles || candles.length < 30) return null;
  const slice = candles.slice(-lookback);
  const { sh, sl } = findSwings(slice, 3);
  const price = slice[slice.length - 1].c;

  // 群聚相近價位（容差 0.5%）
  function cluster(points) {
    const sorted = points.map(p => p.price).sort((a, b) => a - b);
    const groups = [];
    sorted.forEach(p => {
      const g = groups.find(g => Math.abs(g.avg - p) / p < 0.005);
      if (g) { g.prices.push(p); g.avg = g.prices.reduce((a, b) => a + b, 0) / g.prices.length; g.count++; }
      else groups.push({ avg: p, prices: [p], count: 1 });
    });
    return groups.sort((a, b) => b.count - a.count);
  }

  const resGroups = cluster(sh).filter(g => g.avg > price);
  const supGroups = cluster(sl).filter(g => g.avg < price);

  const nearestRes = resGroups.sort((a, b) => a.avg - b.avg)[0] || null;
  const nearestSup = supGroups.sort((a, b) => b.avg - a.avg)[0] || null;

  const resDist = nearestRes ? ((nearestRes.avg - price) / price) * 100 : null;
  const supDist = nearestSup ? ((price - nearestSup.avg) / price) * 100 : null;

  return {
    price,
    resistance: nearestRes ? { price: nearestRes.avg, dist: resDist, strength: nearestRes.count } : null,
    support: nearestSup ? { price: nearestSup.avg, dist: supDist, strength: nearestSup.count } : null,
    // 全部關鍵位（給圖表/列表用）
    allResistances: resGroups.slice(0, 3).map(g => ({ price: g.avg, strength: g.count })),
    allSupports: supGroups.slice(0, 3).map(g => ({ price: g.avg, strength: g.count })),
  };
}

// ═══════════ 自動推薦單掃描（綜合 SMC + AI共識 + 爆發評分）═══════════════════
// 第一階段：快速掃描全部幣，用 SMC 信心度+結構+SNR 算初步分數
// 第二階段：對前 15+15 名做完整 AI 共識分析，精選做多/做空各 perSide 名
// 回傳含進場/SL/TP1-3 的建議單
export async function scanAutoTrades(coins, top = 99999, perSide = 5, onProgress, weights = null) {
  const cands = coins.slice(0, Math.min(top, coins.length));
  const stage1 = [];

  // 第一階段：快速 SMC 評分
  for (let i = 0; i < cands.length; i += 15) {
    const batch = cands.slice(i, i + 15);
    const ks = await Promise.all(batch.map(c => klinesBinance(c, "1H").catch(() => null)));
    batch.forEach((coin, j) => {
      const k = ks[j];
      if (!k || k.length < 40) return;
      const smc = analyzeSMC(k);
      if (!smc) return;
      const isLong = smc.signal.includes("做多");
      const isShort = smc.signal.includes("做空");
      if (!isLong && !isShort) return;
      stage1.push({ coin, candles: k, smc, isLong, quickScore: smc.confidence });
    });
    if (onProgress) onProgress({ stage: 1, done: Math.min(i + 15, cands.length), total: cands.length });
    if (i + 15 < cands.length) await new Promise(r => setTimeout(r, 150));
  }

  // 取初步分數最高的前 15 名做多 + 15 名做空，進入第二階段
  const longCands = stage1.filter(x => x.isLong).sort((a, b) => b.quickScore - a.quickScore).slice(0, 15);
  const shortCands = stage1.filter(x => x.isShort).sort((a, b) => b.quickScore - a.quickScore).slice(0, 15);
  const stage2Cands = [...longCands, ...shortCands];

  const refined = [];
  for (let i = 0; i < stage2Cands.length; i += 5) {
    const batch = stage2Cands.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (item) => {
      try {
        const smcMulti = await analyzeSMCMulti(item.coin);
        const multiAI = await analyzeMultiAI(item.coin, item.candles, item.smc, smcMulti);
        return { ...item, smcMulti, multiAI };
      } catch { return { ...item, smcMulti: null, multiAI: null }; }
    }));
    refined.push(...results);
    if (onProgress) onProgress({ stage: 2, done: Math.min(i + 5, stage2Cands.length), total: stage2Cands.length });
    if (i + 5 < stage2Cands.length) await new Promise(r => setTimeout(r, 200));
  }

  // 計算綜合分數：SMC信心度(40%) + AI共識信心度(40%, 方向需一致) + 結構/SNR加分(20%)
  function finalScore(item) {
    let score = item.smc.confidence * 0.4;
    if (item.multiAI && item.multiAI.length > 0) {
      const consensus = item.multiAI[item.multiAI.length - 1];
      const consDir = consensus.direction.includes("做多") ? "long" : consensus.direction.includes("做空") ? "short" : null;
      const myDir = item.isLong ? "long" : "short";
      if (consDir === myDir) score += consensus.confidence * 0.4;
      else score -= 10; // 方向分歧扣分
    }
    if (item.smc.structure.includes("上升") && item.isLong) score += 10;
    if (item.smc.structure.includes("下降") && item.isShort) score += 10;
    if (item.smc.snr) {
      if (item.isLong && item.smc.snr.support && item.smc.snr.support.dist < 1.5) score += 10;
      if (item.isShort && item.smc.snr.resistance && item.smc.snr.resistance.dist < 1.5) score += 10;
    }
    // 歷史勝率回饋：根據該訊號組合過往表現微調（±最多15分）
    if (weights) {
      const struc = (item.smc.structure || "").split(" ")[0];
      const dir = item.isLong ? "做多" : "做空";
      const adj = (key, map) => {
        const stat = map && map[key];
        if (stat && stat.n >= 3) {
          // 勝率50%為基準，每偏離10%調整3分，上下限±12
          return Math.max(-12, Math.min(12, (stat.winRate - 50) / 10 * 3));
        }
        return 0;
      };
      score += adj(struc, weights.structure);
      score += adj(dir, weights.direction);
    }
    return Math.max(0, Math.min(100, score));
  }

  refined.forEach(item => { item.finalScore = finalScore(item); });

  // 計算進場/SL/TP
  function buildLevels(item) {
    const { coin, candles, smc, isLong } = item;
    const closes = candles.map(c => c.c), highs = candles.map(c => c.h), lows = candles.map(c => c.l);
    const atr = calcATR(highs, lows, closes);
    const atrNow = atr[atr.length - 1] || (smc.price * 0.01);
    const entry = smc.price;
    const sl = isLong ? entry - atrNow * 1.5 : entry + atrNow * 1.5;

    // TP 優先用 SNR，否則 fallback ATR 倍數
    let tp1, tp2, tp3;
    const snr = smc.snr;
    if (isLong) {
      tp1 = (snr?.resistance && snr.resistance.dist > 0.5) ? snr.resistance.price : entry + atrNow * 2;
      tp2 = entry + atrNow * 4;
      tp3 = entry + atrNow * 6;
      if (snr?.allResistances?.length) {
        const between = snr.allResistances.find(r => r.price > tp1 * 1.005 && r.price < tp2 * 1.5);
        if (between) tp2 = between.price;
      }
    } else {
      tp1 = (snr?.support && snr.support.dist > 0.5) ? snr.support.price : entry - atrNow * 2;
      tp2 = entry - atrNow * 4;
      tp3 = entry - atrNow * 6;
      if (snr?.allSupports?.length) {
        const between = snr.allSupports.find(s => s.price < tp1 * 0.995 && s.price > tp2 * 0.5);
        if (between) tp2 = between.price;
      }
    }

    return {
      symbol: coin.symbol, name: coin.name, label: coin.label,
      binanceSymbol: coin.binanceSymbol, cat: "crypto",
      direction: isLong ? "long" : "short",
      signal: smc.signal, confidence: smc.confidence, finalScore: Math.round(item.finalScore),
      structure: smc.structure,
      entry, sl, tp1, tp2, tp3,
      atr: atrNow,
      reasons: smc.reasons,
      aiConsensus: item.multiAI ? item.multiAI[item.multiAI.length - 1] : null,
      ts: Date.now(),
    };
  }

  const longs = refined.filter(x => x.isLong).sort((a, b) => b.finalScore - a.finalScore).slice(0, perSide).map(buildLevels);
  const shorts = refined.filter(x => x.isShort).sort((a, b) => b.finalScore - a.finalScore).slice(0, perSide).map(buildLevels);

  return { longs, shorts, scannedStage1: stage1.length, scannedStage2: refined.length, ts: Date.now() };
}
