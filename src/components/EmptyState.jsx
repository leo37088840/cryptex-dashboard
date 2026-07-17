import { useState, useEffect, useRef, useMemo, memo } from "react";

export default function EmptyState({ icon = "📭", text, hint }) {
  return (
    <div style={{ color: "#4a5568", fontSize: 11, padding: "24px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 26, opacity: 0.35, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: "#5a6b80" }}>{text}</div>
      {hint && <div style={{ color: "#3a4658", fontSize: 9, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
