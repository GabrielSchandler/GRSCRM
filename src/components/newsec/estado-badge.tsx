import type { ConversaEstado } from "@/types/atendimento";

const ESTADO_LABEL: Record<ConversaEstado, string> = {
  IA: "IA",
  // Neutro de propósito: o mesmo selo aparece pra quem é o dono e pra quem supervisiona.
  AGUARDANDO_HUMANO: "Aguardando atendente",
  HUMANO: "Em atendimento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  ENCERRADA: "Concluída",
};

const ESTADO_COLOR: Record<ConversaEstado, string> = {
  IA: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  AGUARDANDO_HUMANO: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  HUMANO: "bg-[var(--ns-primary)]/15 text-[var(--ns-primary)]",
  AGUARDANDO_CLIENTE: "bg-slate-500/15 text-[var(--ns-text-secondary)]",
  ENCERRADA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function EstadoBadge({ estado }: { estado: ConversaEstado }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_COLOR[estado]}`}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}
