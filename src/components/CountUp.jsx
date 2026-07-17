import { useState, useEffect, memo } from "react";

const CountUp = memo(function CountUp({ value, decimals = 0, duration = 600, prefix = "", suffix = "", style, className }) {
  const [display, setDisplay] = useState(value || 0);
  useEffect(() => {
    const start = performance.now();
    const from = display;
    const to = Number(value) || 0;
    if (from === to) return;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className} style={style}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
});

export default CountUp;
