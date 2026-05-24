"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { Cheatsheet } from "./Cheatsheet";

export function GlobalHotkeys() {
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(true);
        setHelpOpen(false);
      } else if (mod && e.shiftKey && (e.key === "?" || e.key === "/")) {
        e.preventDefault();
        setHelpOpen(true);
        setCmdkOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
      <Cheatsheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
