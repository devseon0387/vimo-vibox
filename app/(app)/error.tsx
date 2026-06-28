"use client";
import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 14, padding: 24, textAlign: "center" }}>
      <AlertTriangle size={44} style={{ color: "var(--accent, #f97316)" }} />
      <h2 style={{ fontSize: 17, fontWeight: 600, color: "#1c1917" }}>문제가 생겼어요</h2>
      <p style={{ color: "#78716c", fontSize: 14, maxWidth: 360, lineHeight: 1.5 }}>
        일시적인 오류일 수 있어요. 다시 시도하거나, 계속되면 새로고침해주세요.
      </p>
      <button onClick={reset} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent, #f97316)", color: "#fff", padding: "9px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14, border: "none", cursor: "pointer" }}>
        <RotateCw size={15} /> 다시 시도
      </button>
    </div>
  );
}
