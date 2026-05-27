// ════════════════════════════════════════════════════════════════════════════
// data.js — real market data + indicators + SMC engine
// ════════════════════════════════════════════════════════════════════════════

export const PROXY_URL = import.meta.env.VITE_PROXY_URL || "";

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

// ─── Crypto: merge Binance + OKX + CoinGecko ─────────────────────────────────
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
    binance
      .filter((t) => t.symbol.endsWith("USDT") && !t.symbol.includes("UP") && !t.symbol.includes("DOWN") && !/\d(?:L|S)USDT$/.test(t.symbol))
      .forEach((t) => add({
        symbol: t.symbol.replace("USDT", "-USDT"),
        binanceSymbol: t.symbol,
        name: t.symbol.replace("USDT", ""),
        cat: "crypto",
        price: parseFloat(t.lastPrice) || 0,
        change: parseFloat(t.priceChangePercent) || 0,
        volume: parseFloat(t.quoteVolume) || 0,
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

async function yahooScreener(scrId, cat, count = 250) {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${scrId}`;
  const data = await jget(url, { useProxy: true });
  const quotes = data?.finance?.result?.[0]?.quotes || [];
  return quotes.map((q) => ({
    symbol: q.symbol, ySym: q.symbol,
    name: (q.symbol || "").replace(/[.=^].*$/, "") || q.symbol,
    label: q.shortName || q.longName || q.symbol, cat,
    price: q.regularMarketPrice ?? 0, change: q.regularMarketChangePercent ?? 0,
    volume: q.regularMarketVolume ?? 0,
  })).filter((c) => c.price > 0);
}

async function yahooQuotes(ySymbols) {
  const out = {};
  for (let i = 0; i < ySymbols.length; i += 50) {
    const batch = ySymbols.slice(i, i + 50);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}`;
    const data = await jget(url, { useProxy: true });
    (data?.quoteResponse?.result || []).forEach((q) => (out[q.symbol] = q));
  }
  return out;
}

export const UNIVERSE = {
  stock: [
    ["AAPL","蘋果","AAPL"],["MSFT","微軟","MSFT"],["NVDA","輝達","NVDA"],
    ["TSLA","特斯拉","TSLA"],["AMZN","亞馬遜","AMZN"],["GOOGL","谷歌","GOOGL"],
    ["META","Meta","META"],["AMD","超微","AMD"],["NFLX","網飛","NFLX"],
    ["AVGO","博通","AVGO"],["INTC","英特爾","INTC"],["QCOM","高通","QCOM"],
    ["ADBE","Adobe","ADBE"],["CRM","Salesforce","CRM"],["ORCL","甲骨文","ORCL"],
    ["DIS","迪士尼","DIS"],["BA","波音","BA"],["JPM","摩根大通","JPM"],
    ["V","Visa","V"],["MA","萬事達","MA"],["WMT","沃爾瑪","WMT"],
    ["KO","可口可樂","KO"],["MCD","麥當勞","MCD"],["NKE","耐吉","NKE"],
    ["BABA","阿里巴巴","BABA"],["TSM","台積電ADR","TSM"],["UBER","Uber","UBER"],
    ["COIN","Coinbase","COIN"],["PLTR","Palantir","PLTR"],["MSTR","Strategy","MSTR"],
    ["2330","台積電","2330.TW"],["2317","鴻海","2317.TW"],["2454","聯發科","2454.TW"],
    ["2412","中華電","2412.TW"],["2308","台達電","2308.TW"],["2303","聯電","2303.TW"],
    ["2881","富邦金","2881.TW"],["2882","國泰金","2882.TW"],["2891","中信金","2891.TW"],
    ["3008","大立光","3008.TW"],["2603","長榮","2603.TW"],["3711","日月光","3711.TW"],
  ],
  forex: [
    ["EURUSD","歐元/美元","EURUSD=X"],["USDJPY","美元/日圓","USDJPY=X"],
    ["GBPUSD","英鎊/美元","GBPUSD=X"],["USDCHF","美元/瑞郎","USDCHF=X"],
    ["AUDUSD","澳幣/美元","AUDUSD=X"],["USDCAD","美元/加幣","USDCAD=X"],
    ["NZDUSD","紐幣/美元","NZDUSD=X"],["USDTWD","美元/台幣","USDTWD=X"],
    ["USDCNY","美元/人民幣","USDCNY=X"],["USDHKD","美元/港幣","USDHKD=X"],
    ["USDKRW","美元/韓元","USDKRW=X"],["USDSGD","美元/新幣","USDSGD=X"],
    ["EURJPY","歐元/日圓","EURJPY=X"],["GBPJPY","英鎊/日圓","GBPJPY=X"],
    ["EURGBP","歐元/英鎊","EURGBP=X"],["AUDJPY","澳幣/日圓","AUDJPY=X"],
  ],
  futures: [
    ["ES","標普500期貨","ES=F"],["NQ","那斯達克期貨","NQ=F"],["YM","道瓊期貨","YM=F"],
    ["RTY","羅素2000期貨","RTY=F"],["CL","西德州原油","CL=F"],["BZ","布蘭特原油","BZ=F"],
    ["GC","黃金期貨","GC=F"],["SI","白銀期貨","SI=F"],["HG","銅期貨","HG=F"],
    ["NG","天然氣期貨","NG=F"],["ZC","玉米期貨","ZC=F"],["ZW","小麥期貨","ZW=F"],
  ],
  index: [
    ["SPX","標普500","^GSPC"],["IXIC","那斯達克","^IXIC"],["DJI","道瓊工業","^DJI"],
    ["RUT","羅素2000","^RUT"],["NDX","那斯達克100","^NDX"],["VIX","恐慌指數","^VIX"],
    ["TWII","台灣加權","^TWII"],["N225","日經225","^N225"],["HSI","恆生指數","^HSI"],
    ["KS11","韓國KOSPI","^KS11"],["FTSE","英國富時","^FTSE"],["GDAXI","德國DAX","^GDAXI"],
  ],
  commodity: [
    ["XAUUSD","黃金","GC=F"],["XAGUSD","白銀","SI=F"],["WTI","西德州原油","CL=F"],
    ["BRENT","布蘭特原油","BZ=F"],["NG","天然氣","NG=F"],["HG","銅","HG=F"],
    ["PL","白金","PL=F"],["ZC","玉米","ZC=F"],["ZW","小麥","ZW=F"],
    ["KC","咖啡","KC=F"],["SB","糖","SB=F"],["CT","棉花","CT=F"],
  ],
};

export async function loadMarket(cat) {
  if (cat === "crypto") return loadCrypto();
  if (cat === "stock") {
    const dyn = await yahooScreener("most_actives", "stock", 250);
    if (dyn.length > 8) {
      const twDefs = UNIVERSE.stock.filter((d) => d[2].endsWith(".TW"));
      const q = await yahooQuotes(twDefs.map((d) => d[2]));
      const have = new Set(dyn.map((d) => d.symbol));
      twDefs.forEach(([name, label, ySym]) => {
        if (!have.has(ySym) && q[ySym]) dyn.push({ symbol: name, name, label, cat: "stock", ySym, price: q[ySym].regularMarketPrice, change: q[ySym].regularMarketChangePercent || 0, volume: q[ySym].regularMarketVolume || 0 });
      });
      return dyn.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    }
  }
  if (cat === "forex") {
    const dyn = await yahooScreener("all_currencies", "forex", 100);
    if (dyn.length > 8) return dyn;
  }
  const defs = UNIVERSE[cat] || [];
  const q = await yahooQuotes(defs.map((d) => d[2]));
  return defs.map(([name, label, ySym]) => ({
    symbol: name, name, label, cat, ySym,
    price: q[ySym]?.regularMarketPrice ?? 0,
    change: q[ySym]?.regularMarketChangePercent ?? 0,
    volume: q[ySym]?.regularMarketVolume ?? 0,
  })).filter((c) => c.price > 0);
}

const BINANCE_TF = { "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
const YAHOO_TF = {
  "15m": { interval: "15m", range: "5d" },
  "1H": { interval: "60m", range: "1mo" },
  "4H": { interval: "60m", range: "3mo" },
  "1D": { interval: "1d", range: "1y" },
};

export async function loadKlines(item, tf) {
  if (!item) return null;
  if (item.cat === "crypto") {
    const bSym = item.binanceSymbol || `${item.name}USDT`;
    const interval = BINANCE_TF[tf] || "15m";
    const b = await jget(`https://api.binance.com/api/v3/klines?symbol=${bSym}&interval=${interval}&limit=500`);
    if (Array.isArray(b) && b.length) return b.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    const okxBar = { "15m": "15m", "1H": "1H", "4H": "4H", "1D": "1D" }[tf] || "15m";
    const oId = item.okxSymbol || `${item.name}-USDT`;
    const o = await jget(`https://www.okx.com/api/v5/market/candles?instId=${oId}&bar=${okxBar}&limit=300`);
    if (o?.data?.length) return o.data.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })).reverse();
    return null;
  }
  const ySym = item.ySym || item.symbol;
  const cfg = YAHOO_TF[tf] || YAHOO_TF["1D"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${cfg.interval}&range=${cfg.range}`;
  const data = await jget(url, { useProxy: true });
  const r = data?.chart?.result?.[0];
  if (!r) return null;
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  let candles = ts.map((t, i) => ({ t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0 })).filter((c) => c.o != null && c.c != null);
  if (tf === "4H") candles = aggregate(candles, 4);
  return candles;
}

function aggregate(candles, group) {
  const out = [];
  for (let i = 0; i < candles.length; i += group) {
    const g = candles.slice(i, i + group);
    if (!g.length) continue;
    out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((c) => c.h)), l: Math.min(...g.map((c) => c.l)), c: g[g.length - 1].c, v: g.reduce((a, c) => a + c.v, 0) });
  }
  return out;
}

export function calcSMA(d, p) { return d.map((_, i) => (i < p - 1 ? null : d.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p)); }
export function calcEMA(d, p) { const k = 2 / (p + 1), e = []; d.forEach((v, i) => e.push(i === 0 ? v : v * k + e[i - 1] * (1 - k))); return e; }
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

// ════════════════════════════════════════════════════════════════════════════
// EXTERNAL FEEDS — 金十快訊 + 財經日曆（穩定來源）
// 透過代理抓取；抓到後依格式解析，失敗回 null（UI 顯示佔位）
// ════════════════════════════════════════════════════════════════════════════

async function getTextViaProxy(url) {
  const target = PROXY_URL ? `${PROXY_URL}/proxy?url=${encodeURIComponent(url)}` : url;
  try {
    const res = await fetch(target);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractJsonArray(txt) {
  if (!txt) return null;
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(txt.slice(start, end + 1)); } catch { return null; }
}

// 金十快訊（格式："var newest = [...]"）
export async function loadJin10Flash() {
  const txt = await getTextViaProxy("https://www.jin10.com/flash_newest.js");
  const rows = extractJsonArray(txt);
  if (!Array.isArray(rows)) return null;
  return rows.slice(0, 40).map((r) => {
    const d = r.data || {};
    const text = (d.content || d.title || r.content || "").replace(/<[^>]+>/g, "").trim();
    return { time: r.time || "", text, important: !!(r.important || d.important) };
  }).filter((x) => x.text);
}

// 財經日曆 — Forex Factory 公開週曆 JSON（穩定，官方經濟數據）
export async function loadCalendar() {
  const data = await jget("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { useProxy: true });
  if (!Array.isArray(data) || data.length === 0) return null;
  const impMap = { High: 3, Medium: 2, Low: 1, Holiday: 0 };
  const now = Date.now();
  return data
    .map((r) => ({
      time: r.date || "",
      country: r.country || "",
      event: r.title || "—",
      importance: impMap[r.impact] ?? 0,
      actual: r.actual ?? "",
      forecast: r.forecast ?? "",
      previous: r.previous ?? "",
    }))
    .filter((e) => {
      const t = new Date(e.time).getTime();
      return !isNaN(t) && t >= now - 24 * 3600 * 1000;
    })
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .slice(0, 60);
}