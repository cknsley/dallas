import { useCallback, useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";
const KEY = "atelier-revente:theme";

export function useTheme() {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(KEY) as Mode) || "auto");

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    localStorage.setItem(KEY, mode);
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((m) => (m === "auto" ? "dark" : m === "dark" ? "light" : "auto"));
  }, []);

  const label = mode === "auto" ? "Thème système" : mode === "dark" ? "Mode nuit" : "Mode jour";
  const glyph = mode === "auto" ? "◐" : mode === "dark" ? "●" : "○";
  return { mode, cycle, label, glyph };
}
