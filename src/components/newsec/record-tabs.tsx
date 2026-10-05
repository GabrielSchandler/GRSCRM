"use client";

import { useId, useState, type ReactNode } from "react";

export function RecordTabs({ panels, defaultIndex = 0 }: { panels: { label: string; content: ReactNode }[]; defaultIndex?: number }) {
  const [active, setActive] = useState(Math.max(0, Math.min(defaultIndex, panels.length - 1)));
  const id = useId();
  return <div className="space-y-4"><div role="tablist" aria-label="Detalhes do registro" className="flex gap-2 overflow-x-auto border-b border-[var(--ns-border)]">{panels.map((panel, index) => <button key={panel.label} id={`${id}-tab-${index}`} role="tab" aria-selected={active === index} aria-controls={`${id}-panel-${index}`} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const next = (active + (event.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length; setActive(next); document.getElementById(`${id}-tab-${next}`)?.focus(); } }} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold ${active === index ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)]"}`}>{panel.label}</button>)}</div>{panels.map((panel,index) => <div key={panel.label} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={active !== index}>{panel.content}</div>)}</div>;
}
