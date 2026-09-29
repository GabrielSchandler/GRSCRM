"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "newsec-theme";

function applyTheme(theme: "light" | "dark" | null) {
  const root = document.getElementById("ns-shell-root");
  if (!root) return;

  if (theme) {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  // Preenchido no mount a partir do DOM (já resolvido pelo script inline
  // sem flash em theme-script.tsx) — evita mismatch de hidratacao.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    const root = document.getElementById("ns-shell-root");
    const current = root?.getAttribute("data-theme");
    if (current === "dark") {
      setIsDark(true);
    } else if (current === "light") {
      setIsDark(false);
    } else {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  function toggle() {
    const next = !(isDark ?? false);
    setIsDark(next);
    const theme = next ? "dark" : "light";
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage pode falhar (modo privado); tema ainda funciona na sessão.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ns-border)] text-[var(--ns-text-secondary)] transition hover:bg-[var(--ns-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)]"
    >
      {isDark ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}
