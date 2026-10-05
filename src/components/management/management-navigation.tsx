"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { label: "Visão geral", href: "/dashboard", paths: ["/dashboard"], children: [] },
  { label: "Equipe", href: "/usuarios", paths: ["/usuarios", "/academy/gestao"], children: [{ label: "Equipe", href: "/usuarios" }, { label: "Treinamento", href: "/academy/gestao" }] },
  { label: "Operação", href: "/aprovacoes", paths: ["/aprovacoes", "/contratos", "/documentos/templates", "/emails/templates"], children: [{ label: "Aprovações", href: "/aprovacoes" }, { label: "Contratos", href: "/contratos" }, { label: "Documentos", href: "/documentos/templates" }, { label: "Comunicação", href: "/emails/templates" }] },
  { label: "Configurações", href: "/empresa", paths: ["/empresa", "/integracoes"], children: [{ label: "Empresa", href: "/empresa" }, { label: "Integrações", href: "/integracoes" }, { label: "Leads", href: "/integracoes/leads" }] },
  { label: "Segurança", href: "/logs", paths: ["/logs", "/backups"], children: [{ label: "Auditoria", href: "/logs" }, { label: "Backups", href: "/backups" }] },
];

export function ManagementNavigation() {
  const path = usePathname();
  // Standalone modules and record forms have their own navigation.
  if (path.startsWith("/integracoes/leads") || path.startsWith("/documentos/templates") || path.startsWith("/usuarios/")) return null;
  const current = groups.find(group => group.paths.some(prefix => path === prefix || path.startsWith(`${prefix}/`)));
  if (!current) return null;
  return <div className="management-navigation px-4 sm:px-6 lg:px-9">
    <nav aria-label="Gestão" className="flex gap-2 overflow-x-auto border-b border-[var(--ns-border)]">
      {groups.map(group => <Link key={group.href} href={group.href} aria-current={current === group ? "page" : undefined} className={`shrink-0 border-b-2 px-4 py-4 text-sm font-medium ${current === group ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)] hover:text-[var(--ns-text)]"}`}>{group.label}</Link>)}
    </nav>
    {current.children.length > 0 && <nav aria-label={`Gestão: ${current.label}`} className="flex gap-2 overflow-x-auto border-b border-[var(--ns-border)]">{current.children.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold ${path === item.href ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)]"}`}>{item.label}</Link>)}</nav>}
  </div>;
}
