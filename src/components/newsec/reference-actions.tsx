import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export function ReferenceActions({ children }: { children: ReactNode }) {
  return <details className="relative">
    <summary aria-label="Ações do registro" title="Ações do registro" className="inline-flex list-none rounded-md p-1 text-[var(--ns-primary)]"><MoreHorizontal className="h-4 w-4" /></summary>
    <div className="mt-2 min-w-40 rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] p-3">{children}</div>
  </details>;
}
