// ═════════════ 全域常數 ═════════════════════════════════════════════════════

export const INTERVALS = ["15m", "1H", "4H", "1D"];

// localStorage keys
export const SETTINGS_KEY = "cryptex_settings_v1";
export const AUTO_TRADES_KEY = "cryptex_auto_trades_v1";
export const AUTO_TRADES_TS_KEY = "cryptex_auto_trades_ts_v1";
export const AUTO_CLOSED_KEY = "cryptex_auto_closed_v1";
export const TRADES_KEY = "cryptex_journal_trades_v1";
export const WATCHLIST_KEY = "cryptex_watchlist_v1";
export const ALERTS_KEY = "cryptex_price_alerts_v1";
export const SIGHIST_KEY = "cryptex_sig_history_v1";

// 全域設定預設值
export const DEFAULT_SETTINGS = {
  autoScanMins: 5,
  scoreCloseConfirm: true,
  scoreCloseTh: 40,
  scoreConsecutive: 2,
  scoreFilterTh: 40,
  scanTopN: 0,
  soundOn: false,
  displayMode: "normal",
  perSide: 5,
  // 自訂平倉 %：null 表示不在該 TP 平倉，全部空白時等同舊版（TP3 才全平）
  tpClosePct1: null,
  tpClosePct2: null,
  tpClosePct3: null,
  // BTC 趨勢過濾：off/weak/mid/strong
  btcFilterLevel: "mid",
};
