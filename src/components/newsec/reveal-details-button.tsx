"use client";

import type { ReactNode } from "react";

export function RevealDetailsButton({ targetId, className, children }: {
  targetId: string; className?: string; children: ReactNode;
}) {
  return <button type="button" className={className} onClick={() => {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLDetailsElement)) return;
    target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.querySelector("summary")?.focus({ preventScroll: true });
  }}>{children}</button>;
}
