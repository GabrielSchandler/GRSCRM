import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function ManagementMetric({ label, value, detail, icon: Icon, tone = "primary" }: { label: string; value: string | number; detail?: string; icon: LucideIcon; tone?: "primary" | "success" | "warning" | "danger" }) {
  const color = `var(--ns-${tone})`;
  return <div className="flex min-w-0 items-center gap-4 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4" style={{ borderLeft: `4px solid ${color}` }}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ color, background: `color-mix(in srgb, ${color} 12%, var(--ns-surface))` }}><Icon className="h-6 w-6" /></span><div className="min-w-0"><p className="text-[11px] font-medium uppercase text-[var(--ns-text-secondary)]">{label}</p><p className="mt-1 break-words text-2xl font-semibold">{value}</p>{detail && <p className="mt-1 text-xs text-[var(--ns-text-secondary)]">{detail}</p>}</div></div>;
}

export function ManagementPanel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2>{href && <Link href={href} className="rounded border border-[var(--ns-border)] px-3 py-1.5 text-xs font-semibold text-[var(--ns-primary)] hover:bg-[var(--ns-surface-hover)]">Ver detalhes</Link>}</div>{children}</section>;
}
