import { useState, useEffect, useMemo, useRef, memo } from "react";
import { backtestMTF } from "../../data.js";
import Section from "../../components/Section.jsx";
import { pnlColor } from "../../utils/format.js";

export default function BacktestPanel({ item }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetMult, setTargetMult] = useState(3);
  const [error, setError] = useState(null);

  async function run() {
    if (!item || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await backtestMTF(item, { atrMult: 1.5, targetMult: Number(targetMult), maxBars: 30, minConfidence: 50 });
      if (!r) { setError("資料不足，無法回測（需足夠的 1H/4H/1D K 線）"); }
      else if (r.stats.total === 0) { setError("此區間策略未產生任何進場訊號"); setResult(r); }
      else setResult(r);
    } catch { setError("回測過程發生錯誤"); }
    setLoading(false);
  }

  const s = result?.stats;
  const fmtPct = (v) => (v >= 0 ? "+" : "") + (v || 0).toFixed(2) + "%";

  return (
    <Section title="📊 多時區策略回測" color="#a78bfa" badge="MTF" defaultOpen={false}>
      <div style={{ color: "#5a6b80", fontSize: 9, lineHeight: 1.5, marginBottom: 10 }}>
        對 {item?.symbol} 跑「1D趨勢 + 4H確認 + 1H進場 + 量能過濾」策略，模擬歷史交易績效。
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <span style={{ color: "#8b949e", fontSize: 10, fontFamily: "monospace" }}>目標倍數</span>
        {[2, 3, 4].map((m) => (
          <button key={m} onClick={() => setTargetMult(m)} style={{ background: targetMult === m ? "#0f1e2e" : "#0d1520", border: `1px solid ${targetMult === m ? "#a78bfa" : "#1a2535"}`, borderRadius: 5, color: targetMult === m ? "#a78bfa" : "#8b949e", padding: "4px 12px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{m}R</button>
        ))}
        <button onClick={run} disabled={loading} style={{ marginLeft: "auto", background: loading ? "#1a2535" : "#a78bfa", border: "none", borderRadius: 6, color: loading ? "#8b949e" : "#000", padding: "6px 14px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{loading ? "回測中..." : "▶ 執行回測"}</button>
      </div>

      {loading && <div className="skeleton" style={{ height: 80, marginBottom: 8 }} />}
      {error && <div style={{ color: "#f0b90b", fontSize: 10, padding: "8px", background: "#1a1206", borderRadius: 6, marginBottom: 8 }}>{error}</div>}

      {s && s.total > 0 && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color: s.winRate >= 50 ? "#26a69a" : "#ef5350", fontSize: 18, fontFamily: "monospace", fontWeight: 800 }}>{s.winRate.toFixed(0)}%</div>
            <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>勝率</div>
          </div>
          <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color: s.totalPnl >= 0 ? "#26a69a" : "#ef5350", fontSize: 18, fontFamily: "monospace", fontWeight: 800 }}>{fmtPct(s.totalPnl)}</div>
            <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>總報酬</div>
          </div>
          <div style={{ background: "#0a1218", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color: s.profitFactor >= 1.5 ? "#26a69a" : s.profitFactor >= 1 ? "#f0b90b" : "#ef5350", fontSize: 18, fontFamily: "monospace", fontWeight: 800 }}>{s.profitFactor.toFixed(2)}</div>
            <div style={{ color: "#5a6b80", fontSize: 8, fontFamily: "monospace" }}>獲利因子</div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 10, fontFamily: "monospace" }}>
          <span style={{ color: "#8b949e" }}>交易 {s.total}</span>
          <span style={{ color: "#26a69a" }}>勝 {s.wins}</span>
          <span style={{ color: "#ef5350" }}>負 {s.losses}</span>
          <span style={{ color: "#26a69a" }}>均盈 {fmtPct(s.avgWin)}</span>
          <span style={{ color: "#ef5350" }}>均虧 {fmtPct(s.avgLoss)}</span>
          <span style={{ color: "#f0b90b" }}>最大回撤 {s.maxDD.toFixed(1)}%</span>
        </div>

        {/* 權益曲線 + 買入持有對比 */}
        {result.equity && result.equity.length > 1 && (() => {
          const eq = result.equity;
          const vals = eq.map((e) => e.cum);
          // 買入持有：從第一筆交易到最後一筆，用各筆進出場的時間軸估算
          const bhReturn = result.trades && result.trades.length >= 2
            ? (() => {
                const first = result.trades[0];
                const last = result.trades[result.trades.length - 1];
                if (first?.entryPrice && last?.exitPrice) {
                  return ((last.exitPrice - first.entryPrice) / first.entryPrice) * 100;
                }
                return null;
              })()
            : null;
          // 買入持有等權基準線（線性從0到bhReturn）
          const bhPts = bhReturn != null ? eq.map((_, i) => {
            const bh = (i / (eq.length - 1)) * bhReturn;
            return bh;
          }) : null;
          const allVals = bhPts ? [...vals, ...bhPts] : vals;
          const min = Math.min(0, ...allVals), max = Math.max(0, ...allVals);
          const range = max - min || 1;
          const W = 280, H = 80;
          const toY = (v) => H - ((v - min) / range) * H;
          const pts = eq.map((e, i) => `${((i / (eq.length - 1)) * W).toFixed(1)},${toY(e.cum).toFixed(1)}`).join(" ");
          const bhLine = bhPts ? bhPts.map((v, i) => `${((i / (bhPts.length - 1)) * W).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") : null;
          const lastCum = vals[vals.length - 1];
          const lineCol = lastCum >= 0 ? "#26a69a" : "#ef5350";
          const zeroY = toY(0);
          return (
            <div style={{ background: "#0a1218", borderRadius: 6, padding: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#5a6b80", fontSize: 9, fontFamily: "monospace" }}>累積權益曲線（%）</span>
                {bhReturn != null && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: lineCol, fontSize: 9, fontFamily: "monospace" }}>● 策略 {lastCum >= 0 ? "+" : ""}{lastCum.toFixed(1)}%</span>
                    <span style={{ color: "#787b86", fontSize: 9, fontFamily: "monospace" }}>● 買入持有 {bhReturn >= 0 ? "+" : ""}{bhReturn.toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
                <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#1a2535" strokeWidth="1" strokeDasharray="3 3" />
                {bhLine && <polyline points={bhLine} fill="none" stroke="#787b86" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />}
                <polyline points={pts} fill="none" stroke={lineCol} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 3px ${lineCol}88)` }} />
              </svg>
              {bhReturn != null && (
                <div style={{ color: lastCum > bhReturn ? "#26a69a" : "#ef5350", fontSize: 8, fontFamily: "monospace", marginTop: 4, textAlign: "right" }}>
                  {lastCum > bhReturn ? `策略跑贏買入持有 +${(lastCum - bhReturn).toFixed(1)}%` : `策略落後買入持有 ${(lastCum - bhReturn).toFixed(1)}%`}
                </div>
              )}
            </div>
          );
        })()}
      </>}

      {s && s.total === 0 && !error && <div style={{ color: "#5a6b80", fontSize: 10, padding: "8px 4px" }}>此策略在歷史區間內無觸發任何交易（策略嚴格，正常現象）。</div>}

      <div style={{ color: "#4a5568", fontSize: 9, lineHeight: 1.6, marginTop: 8 }}>
        <p>· SL=ATR×1.5，目標=ATR×目標倍數，最多持有30根1H K棒</p>
        <p>· 僅在1D趨勢明確、4H ADX大於20且方向一致、1H SMC訊號同向、量能足夠時進場</p>
        <p>· 獲利因子 大於1.5 佳、1~1.5 普通、小於1 虧損</p>
      </div>
    </Section>
  );
}


// ═══════════ TradingView 圖表嵌入 ═══════════════════════════════════════════
