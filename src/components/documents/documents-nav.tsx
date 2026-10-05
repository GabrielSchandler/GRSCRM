"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DocumentsNav() {
  const pathname = usePathname();
  const tabs = [{ href: "/documentos", label: "Gerados" }, { href: "/documentos/templates", label: "Templates" }];
  return <nav aria-label="Documentos" className="flex gap-2 border-b border-[var(--ns-border)]">{tabs.map(tab => {
    const active = pathname === tab.href;
    return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`border-b-2 px-4 py-3 text-xs font-semibold ${active ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)]"}`}>{tab.label}</Link>;
  })}</nav>;
}
