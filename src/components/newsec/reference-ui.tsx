import Link from "next/link";
import type { ReactNode } from "react";

export function ReferenceTabs({ items }: { items: { label: string; href: string; active?: boolean }[] }) {
  return <nav aria-label="Seções" className="flex gap-2 overflow-x-auto border-b border-[var(--ns-border)]">{items.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold ${item.active ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)]"}`}>{item.label}</Link>)}</nav>;
}

export function ReferenceFacts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="reference-facts divide-y divide-[var(--ns-border)]">{items.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 py-2.5 text-xs"><dt className="text-[var(--ns-text-secondary)]">{label}</dt><dd className="min-w-0 break-words font-medium">{value}</dd></div>)}</dl>;
}

export function ReferenceBadge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "success" | "warning" | "danger" }) {
  return <span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ color: `var(--ns-${tone})`, background: `color-mix(in srgb,var(--ns-${tone}) 12%,var(--ns-surface))` }}>{children}</span>;
}
