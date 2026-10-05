import Link from "next/link";

export function FinanceNavigation({ active }: { active: "overview" | "launches" | "queries" | "commissions" }) {
  return <nav aria-label="Financeiro" className="flex gap-1 overflow-x-auto border-b border-[var(--ns-border)] px-4 sm:px-6">
    {[
      { label: "Visão geral", href: "/financeiro", value: "overview" },
      { label: "Lançamentos", href: "/financeiro?view=launches", value: "launches" },
      { label: "Consultas", href: "/financeiro/consultas", value: "queries" },
      { label: "Comissões", href: "/financeiro/consultas?tipo=vendas", value: "commissions" },
    ].map(tab => <Link key={tab.value} href={tab.href} aria-current={active === tab.value ? "page" : undefined}
      className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${active === tab.value ? "border-[var(--ns-primary)] text-[var(--ns-primary)]" : "border-transparent text-[var(--ns-text-secondary)] hover:text-[var(--ns-primary)]"}`}>{tab.label}</Link>)}
  </nav>;
}
