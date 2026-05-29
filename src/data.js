// ════════════════════════════════════════════════════════════════════════════
// CRYPTEX data layer
// 加密貨幣: Binance REST + WebSocket
// 美股: Finnhub
// 外匯/指數/商品: Twelve Data
// 台股: FinMind
// 金十快訊: jin10 公開端點（透過代理）
// ════════════════════════════════════════════════════════════════════════════

export const PROXY_URL = import.meta.env.VITE_PROXY_URL || "";
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

// ─── Crypto: Binance + OKX + CoinGecko ───────────────────────────────────────
export async function loadCrypto() {
  const merged = new Map();
  const add = (c) => {
    if (!c || !(c.price > 0)) return;
    const ex = merged.get(c.name);
    if (!ex || (c.volume || 0) > (ex.volume || 0)) merged.set(c.name, c);
  };
  const [binance, okx, gecko] = await Promise.all([
    jget("https://api.binance.com/api/v3/ticker/24hr"),
    jget("https://www.okx.com/api/v5/market/tickers?instType=SPOT"),
    jget("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=500&page=1"),
  ]);
  if (Array.isArray(binance)) {
    binance.filter((t) => t.symbol.endsWith("USDT") && !t.symbol.includes("UP") && !t.symbol.includes("DOWN") && !/\d(?:L|S)USDT$/.test(t.symbol))
      .forEach((t) => add({
        symbol: t.symbol.replace("USDT", "-USDT"), binanceSymbol: t.symbol, name: t.symbol.replace("USDT", ""),
        cat: "crypto", price: parseFloat(t.lastPrice) || 0,
        change: parseFloat(t.priceChangePercent) || 0, volume: parseFloat(t.quoteVolume) || 0,
      }));
  }
  if (okx?.data?.length) {
    okx.data.filter((t) => t.instId.endsWith("-USDT")).forEach((t) => add({
      symbol: t.instId, okxSymbol: t.instId, name: t.instId.replace("-USDT", ""),
      cat: "crypto", price: parseFloat(t.last) || 0,
      change: t.open24h ? ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100 : 0,
      volume: parseFloat(t.volCcy24h) || 0,
    }));
  }
  if (Array.isArray(gecko)) {
    gecko.forEach((c) => add({
      symbol: `${c.symbol.toUpperCase()}-USDT`, name: c.symbol.toUpperCase(), label: c.name,
      cat: "crypto", price: c.current_price || 0, change: c.price_change_percentage_24h || 0,
      volume: c.total_volume || 0,
    }));
  }
  return Array.from(merged.values()).sort((a, b) => (b.volume || 0) - (a.volume || 0));
}

// ─── Universe definitions for each market ────────────────────────────────────
export const UNIVERSE = {
  us: [
    ["AAPL","蘋果"],["MSFT","微軟"],["NVDA","輝達"],["TSLA","特斯拉"],["AMZN","亞馬遜"],
    ["GOOGL","谷歌"],["META","Meta"],["AMD","超微"],["NFLX","網飛"],["AVGO","博通"],
    ["INTC","英特爾"],["QCOM","高通"],["ADBE","Adobe"],["CRM","Salesforce"],["ORCL","甲骨文"],
    ["DIS","迪士尼"],["BA","波音"],["JPM","摩根大通"],["V","Visa"],["MA","萬事達"],
    ["WMT","沃爾瑪"],["KO","可口可樂"],["MCD","麥當勞"],["NKE","耐吉"],["BABA","阿里巴巴"],
    ["TSM","台積電ADR"],["UBER","Uber"],["COIN","Coinbase"],["PLTR","Palantir"],["MSTR","Strategy"],
    ["LLY","禮來"],["JNJ","嬌生"],["UNH","聯合健康"],["XOM","埃克森美孚"],["CVX","雪佛龍"],
    ["PG","寶潔"],["HD","家得寶"],["COST","好市多"],["PEP","百事"],["BAC","美國銀行"],
    ["CSCO","思科"],["TXN","德州儀器"],["IBM","IBM"],["GE","奇異"],["F","福特"],
    ["GM","通用汽車"],["PYPL","PayPal"],["SHOP","Shopify"],["ARM","Arm"],["SMCI","美超微"],
    ["DELL","戴爾"],["MU","美光"],["ASML","艾司摩爾"],["PDD","拼多多"],["JD","京東"],
  ],
  tw: [
    ["2330","台積電"],["2317","鴻海"],["2454","聯發科"],["2412","中華電"],["2308","台達電"],
    ["2303","聯電"],["2881","富邦金"],["2882","國泰金"],["2891","中信金"],["3008","大立光"],
    ["2603","長榮"],["3711","日月光"],["1303","南亞"],["1301","台塑"],["2002","中鋼"],
    ["2207","和泰車"],["6669","緯穎"],["3034","聯詠"],["2379","瑞昱"],["2357","華碩"],
  ],
  forex: [
    ["EUR/USD","歐元/美元"],["USD/JPY","美元/日圓"],["GBP/USD","英鎊/美元"],["USD/CHF","美元/瑞郎"],
    ["AUD/USD","澳幣/美元"],["USD/CAD","美元/加幣"],["USD/TWD","美元/台幣"],["EUR/JPY","歐元/日圓"],
  ],
  index: [
    ["SPX","標普500"],["IXIC","那斯達克"],["DJI","道瓊工業"],["NDX","那斯達克100"],
    ["RUT","羅素2000"],["VIX","恐慌指數"],
  ],
  commodity: [
    ["XAU/USD","黃金"],["XAG/USD","白銀"],["WTI/USD","西德州原油"],
    ["NG/USD","天然氣"],["HG/USD","銅"],["XPT/USD","鉑金"],
  ],
};

// ─── Finnhub: US stocks ──────────────────────────────────────────────────────
async function loadFinnhubQuote(symbol) {
  if (!FINNHUB_KEY) return null;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
  return await jget(url, { useProxy: true });
}

async function loadUSStocks() {
  const out = [];
  // Finnhub 免費版 60 次/分鐘。分批每 12 個、間隔 1.2 秒，避免觸發限制。
  for (let i = 0; i < UNIVERSE.us.length; i += 12) {
    const batch = UNIVERSE.us.slice(i, i + 12);
    const quotes = await Promise.all(batch.map(([sym]) => loadFinnhubQuote(sym)));
    batch.forEach(([sym, label], j) => {
      const q = quotes[j];
      if (q && q.c > 0) {
        const change = q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0;
        out.push({ symbol: sym, name: sym, label, cat: "us", price: q.c, change, volume: 0, high: q.h, low: q.l, open: q.o });
      }
    });
    if (i + 12 < UNIVERSE.us.length) await new Promise((r) => setTimeout(r, 1200));
  }
  return out;
}

// ─── Twelve Data: forex, indices, commodities ────────────────────────────────
// Twelve Data 免費版一次只能查 1 個 symbol，且每分鐘限 8 次。
// 故逐一查詢，每查 7 個就停一下，避免觸發限制。
async function loadTwelveSingle(sym) {
  if (!TWELVEDATA_KEY) return null;
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${TWELVEDATA_KEY}`;
  const q = await jget(url, { useProxy: true });
  if (!q || !q.close) return null;
  return q;
}

async function loadTwelveCategory(cat) {
  const defs = UNIVERSE[cat] || [];
  const out = [];
  // 一次併發查 6 個（在每分鐘 8 次限制內），夠用
  for (let i = 0; i < defs.length; i += 6) {
    const batch = defs.slice(i, i + 6);
    const qs = await Promise.all(batch.map(([sym]) => loadTwelveSingle(sym)));
    batch.forEach(([sym, label], j) => {
      const q = qs[j];
      if (q && q.close) {
        out.push({
          symbol: sym, name: sym, label, cat,
          price: parseFloat(q.close) || 0,
          change: parseFloat(q.percent_change) || 0,
          volume: parseFloat(q.volume) || 0,
          high: parseFloat(q.high) || 0,
          low: parseFloat(q.low) || 0,
          open: parseFloat(q.open) || 0,
        });
      }
    });
    if (i + 6 < defs.length) await new Promise((r) => setTimeout(r, 1200));
  }
  return out;
}

// ─── FinMind: Taiwan stocks ──────────────────────────────────────────────────
async function loadFinMindQuote(symbol) {
  if (!FINMIND_TOKEN) return null;
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${ymd}&token=${FINMIND_TOKEN}`;
  const data = await jget(url, { useProxy: true });
  return data?.data?.[0] || null;
}

async function loadTWStocks() {
  const defs = UNIVERSE.tw;
  const out = [];
  for (let i = 0; i < defs.length; i += 5) {
    const batch = defs.slice(i, i + 5);
    const rows = await Promise.all(batch.map(([sym]) => loadFinMindQuote(sym)));
    batch.forEach(([sym, label], j) => {
      const r = rows[j];
      if (r && r.close > 0) {
        out.push({
          symbol: sym, name: sym, label, cat: "tw",
          price: r.close,
          change: r.spread ? (r.spread / (r.close - r.spread)) * 100 : 0,
          volume: r.Trading_Volume || 0,
          high: r.max, low: r.min, open: r.open,
        });
      }
    });
  }
  return out;
}

// ─── Unified loader by category ──────────────────────────────────────────────
export async function loadMarket(cat) {
  if (cat === "crypto") return loadCrypto();
  if (cat === "us") return loadUSStocks();
  if (cat === "tw") return loadTWStocks();
  if (cat === "forex" || cat === "index" || cat === "commodity") return loadTwelveCategory(cat);
  return [];
}

// ═══════════ KLINES ════════════════════════════════════════════════════════════
const BINANCE_TF = { "15m":"15m", "1H":"1h", "4H":"4h", "1D":"1d" };
const TWELVE_TF = { "15m":"15min", "1H":"1h", "4H":"4h", "1D":"1day" };
const FINNHUB_TF = { "15m":"15", "1H":"60", "4H":"240", "1D":"D" };

async function klinesBinance(item, tf) {
  const sym = item.binanceSymbol || `${item.name}USDT`;
  const interval = BINANCE_TF[tf] || "15m";
  const b = await jget(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=500`);
  if (!Array.isArray(b) || !b.length) return null;
  return b.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

async function klinesTwelve(item, tf) {
  if (!TWELVEDATA_KEY) return null;
  const interval = TWELVE_TF[tf] || "15min";
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(item.symbol)}&interval=${interval}&outputsize=300&apikey=${TWELVEDATA_KEY}`;
  const data = await jget(url, { useProxy: true });
  if (!data?.values) return null;
  return data.values.map((r) => ({
    t: new Date(r.datetime).getTime(),
    o: parseFloat(r.open), h: parseFloat(r.high), l: parseFloat(r.low), c: parseFloat(r.close),
    v: parseFloat(r.volume || 0),
  })).reverse();
}

async function klinesFinnhub(item, tf) {
  if (!FINNHUB_KEY) return null;
  const resolution = FINNHUB_TF[tf] || "15";
  const to = Math.floor(Date.now() / 1000);
  const back = tf === "1D" ? 365 * 86400 : tf === "4H" ? 90 * 86400 : tf === "1H" ? 30 * 86400 : 7 * 86400;
  const from = to - back;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(item.symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
  const data = await jget(url, { useProxy: true });
  if (!data || data.s !== "ok" || !data.t?.length) return null;
  return data.t.map((t, i) => ({ t: t * 1000, o: data.o[i], h: data.h[i], l: data.l[i], c: data.c[i], v: data.v?.[i] || 0 }));
}

async function klinesFinMind(item, tf) {
  if (!FINMIND_TOKEN) return null;
  // FinMind 免費版只有日 K（TaiwanStockPrice），其他週期我們聚合
  const days = tf === "1D" ? 365 : tf === "4H" ? 90 : tf === "1H" ? 30 : 7;
  const start = new Date(Date.now() - days * 86400 * 1000);
  const ymd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${item.symbol}&start_date=${ymd}&token=${FINMIND_TOKEN}`;
  const data = await jget(url, { useProxy: true });
  if (!data?.data?.length) return null;
  return data.data.map((r) => ({
    t: new Date(r.date).getTime(),
    o: r.open, h: r.max, l: r.min, c: r.close, v: r.Trading_Volume || 0,
  }));
}

export async function loadKlines(item, tf) {
  if (!item) return null;
  if (item.cat === "crypto") return klinesBinance(item, tf);
  if (item.cat === "us") return klinesFinnhub(item, tf);
  if (item.cat === "tw") return klinesFinMind(item, tf);
  if (item.cat === "forex" || item.cat === "index" || item.cat === "commodity") return klinesTwelve(item, tf);
  return null;
}

// ─── 多週期漲跌（今日/7天/30天/90天/180天/1年）用日 K 計算 ──────────────────
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

// ═══════════ WebSocket for crypto (Binance) ═════════════════════════════════
// onTick(price, symbol) — 用於即時更新左上價格和最新 K 棒
export function subscribeCryptoTicker(binanceSymbol, onTick) {
  if (!binanceSymbol) return () => {};
  const sym = binanceSymbol.toLowerCase();
  let ws = null, closed = false, retry = 0;
  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@trade`);
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

// ═══════════ INDICATORS ════════════════════════════════════════════════════════
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
// ATR for volatility / stop sizing
export function calcATR(h, l, c, p = 14) {
  const tr = h.map((_, i) => i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  return calcSMA(tr, p);
}
// ADX-ish trend strength (簡化版)
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

// ═══════════ SMC ENGINE ════════════════════════════════════════════════════════
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
  const score = bias + confirms * 0.5;
  let signal = "觀望", color = "#787b86";
  if (score >= 2.5) { signal = "強力做多"; color = "#26a69a"; }
  else if (score >= 1) { signal = "做多"; color = "#26a69a"; }
  else if (score <= -2.5) { signal = "強力做空"; color = "#ef5350"; }
  else if (score <= -1) { signal = "做空"; color = "#ef5350"; }
  const confidence = Math.min(99, Math.round((Math.abs(score) / 5) * 100));
  return {
    signal, color, score, confidence, structure, sweep, fvg, ob, reasons, price,
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

// ═══════════ AI 多空分析（規則式）═════════════════════════════════════════════
// 綜合：SMC 多時區共振 + 趨勢強度(ADX) + 動能 + 波動率(ATR) + 量能 + 確認指標
export function aiAnalyze(item, candles, smc, smcMulti) {
  if (!candles || candles.length < 50 || !smc) return null;
  const closes = candles.map(c => c.c), highs = candles.map(c => c.h), lows = candles.map(c => c.l), vols = candles.map(c => c.v || 0);
  const n = closes.length - 1, price = closes[n];

  let bullScore = 0, bearScore = 0;
  const factors = [];

  // 1) SMC 多時區共振
  const valid = (smcMulti || []).filter(m => m.result);
  const longs = valid.filter(m => m.result.signal.includes("做多")).length;
  const shorts = valid.filter(m => m.result.signal.includes("做空")).length;
  if (longs >= 3) { bullScore += 3; factors.push({ k: "多時區共振", v: `${longs}/${valid.length} 多頭`, side: "bull" }); }
  else if (shorts >= 3) { bearScore += 3; factors.push({ k: "多時區共振", v: `${shorts}/${valid.length} 空頭`, side: "bear" }); }
  else if (longs > shorts) { bullScore += 1; factors.push({ k: "多時區共振", v: `${longs}多 / ${shorts}空，偏多`, side: "bull" }); }
  else if (shorts > longs) { bearScore += 1; factors.push({ k: "多時區共振", v: `${shorts}空 / ${longs}多，偏空`, side: "bear" }); }
  else { factors.push({ k: "多時區共振", v: "分歧", side: "neutral" }); }

  // 2) SMC 主訊號
  if (smc.signal.includes("強力做多")) { bullScore += 2; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bull" }); }
  else if (smc.signal.includes("做多")) { bullScore += 1; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bull" }); }
  else if (smc.signal.includes("強力做空")) { bearScore += 2; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bear" }); }
  else if (smc.signal.includes("做空")) { bearScore += 1; factors.push({ k: "SMC 主訊號", v: smc.signal, side: "bear" }); }
  else factors.push({ k: "SMC 主訊號", v: "觀望", side: "neutral" });

  // 3) 趨勢強度
  const adx = calcADX(highs, lows, closes);
  const adxNow = adx[n];
  if (adxNow != null) {
    if (adxNow > 25) factors.push({ k: "趨勢強度", v: `強趨勢 (ADX ${adxNow.toFixed(0)})`, side: "neutral" });
    else if (adxNow > 15) factors.push({ k: "趨勢強度", v: `中等 (ADX ${adxNow.toFixed(0)})`, side: "neutral" });
    else factors.push({ k: "趨勢強度", v: `盤整 (ADX ${adxNow.toFixed(0)})`, side: "neutral" });
  }

  // 4) 動能（短期 vs 中期均線）
  const ma5 = calcSMA(closes, 5)[n], ma20 = calcSMA(closes, 20)[n], ma60 = calcSMA(closes, 60)[n];
  if (ma5 && ma20 && ma60) {
    if (ma5 > ma20 && ma20 > ma60) { bullScore += 2; factors.push({ k: "均線排列", v: "多頭排列 (5>20>60)", side: "bull" }); }
    else if (ma5 < ma20 && ma20 < ma60) { bearScore += 2; factors.push({ k: "均線排列", v: "空頭排列 (5<20<60)", side: "bear" }); }
    else factors.push({ k: "均線排列", v: "糾結", side: "neutral" });
  }

  // 5) 量能配合
  const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const baseVol = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  if (baseVol > 0) {
    const ratio = recentVol / baseVol;
    if (ratio > 1.3) factors.push({ k: "量能", v: `放量 (${ratio.toFixed(1)}x)`, side: "neutral" });
    else if (ratio < 0.7) factors.push({ k: "量能", v: `縮量 (${ratio.toFixed(1)}x)`, side: "neutral" });
    else factors.push({ k: "量能", v: "正常", side: "neutral" });
  }

  // 6) 波動率 (ATR) — 用於止損建議
  const atr = calcATR(highs, lows, closes);
  const atrNow = atr[n] || (price * 0.01);

  // 算總分
  const totalScore = bullScore - bearScore;
  const conf = Math.min(95, Math.round((Math.abs(totalScore) / 7) * 100));

  let direction = "觀望", color = "#787b86", emoji = "⚖️";
  if (totalScore >= 5) { direction = "強烈做多"; color = "#26a69a"; emoji = "🚀"; }
  else if (totalScore >= 3) { direction = "做多"; color = "#26a69a"; emoji = "📈"; }
  else if (totalScore <= -5) { direction = "強烈做空"; color = "#ef5350"; emoji = "💥"; }
  else if (totalScore <= -3) { direction = "做空"; color = "#ef5350"; emoji = "📉"; }
  else if (totalScore >= 1) { direction = "偏多"; color = "#7fb284"; emoji = "↗️"; }
  else if (totalScore <= -1) { direction = "偏空"; color = "#d98890"; emoji = "↘️"; }

  // 進場/止損/目標（基於 ATR）
  const isLong = totalScore > 0;
  const entry = price;
  const stop = isLong ? price - atrNow * 1.5 : price + atrNow * 1.5;
  const target1 = isLong ? price + atrNow * 2 : price - atrNow * 2;
  const target2 = isLong ? price + atrNow * 4 : price - atrNow * 4;
  const rr = Math.abs(target1 - entry) / Math.abs(entry - stop);

  // 摘要文字
  const summary = totalScore === 0
    ? "目前訊號分歧或盤整，建議觀望等待更明確方向。"
    : `${emoji} 綜合判斷偏向 ${direction}，信心度 ${conf}%。主要依據：${factors.filter(f => f.side === (isLong ? "bull" : "bear")).map(f => f.k).join("、") || "多項技術訊號"}。`;

  return {
    direction, color, emoji, confidence: conf, score: totalScore,
    factors, summary,
    plan: {
      entry, stop, target1, target2, rr: rr.toFixed(2),
      atr: atrNow, isLong,
    },
    risk: "本分析為演算法綜合多項技術指標，僅供參考。實際交易請結合資金管理、風險控制與個人判斷。",
  };
}

// ═══════════ JIN10 FLASH ════════════════════════════════════════════════════════
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

// 占位日曆（之後可換更穩來源；目前 Forex Factory 被 rate limited）
export async function loadCalendar() {
  return null;
}
