import { useState, useEffect, useRef, useMemo, memo } from "react";

export default function TVChart({ symbol }) {
  const containerRef = useRef(null);
  const tvSymbol = useMemo(() => {
    if (!symbol) return "BINANCE:BTCUSDT.P";
    const name = symbol.replace("-USDT", "");
    return `BINANCE:${name}USDT.P`;
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: "60",
      timezone: "Asia/Taipei",
      theme: "dark",
      style: "1",
      locale: "zh_TW",
      backgroundColor: "rgba(13,21,32,1)",
      gridColor: "rgba(255,255,255,0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      studies: ["STD;SMA"],
      support_host: "https://www.tradingview.com",
    });
    containerRef.current.appendChild(script);
  }, [tvSymbol]);

  return (
    <div style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ height: 360, width: "100%" }} ref={containerRef} />
    </div>
  );
}

// ═══════════ 關注清單 storage ═══════════════════════════════════════════════
