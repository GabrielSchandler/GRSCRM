"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { WhatsAppLink } from "@/components/clients/whatsapp-link";
import { PreSaleDeleteButton } from "@/components/pre-sales/pre-sale-delete-button";
import { PreSaleSearchMatchBadges } from "@/components/pre-sales/pre-sale-search-match-badges";
import { ChangeNoteModal } from "@/components/shared/change-note-modal";
import {
  formatCurrency,
  formatPreSaleType,
  formatUserName,
} from "@/lib/pre-sales/formatters";
import {
  preSalePipelineStatuses,
  preSaleStatuses,
  type PreSaleStatus,
  type PreSaleWithRelations,
} from "@/types/pre-sale";
import { updatePreSaleStatusAction } from "@/app/(authenticated)/pre-vendas/actions";

const stageTone: Record<PreSaleStatus, { dot: string; chip: string }> = {
  lead: { dot: "bg-[#5267F5]", chip: "bg-[#EEF0FF] text-[#5267F5]" },
  pre_venda: { dot: "bg-[#7385FF]", chip: "bg-[#EEF0FF] text-[#5267F5]" },
  em_contato: { dot: "bg-[#5267F5]", chip: "bg-[#EEF0FF] text-[#5267F5]" },
  em_negociacao: { dot: "bg-[#FF7A45]", chip: "bg-[#FFF0E8] text-[#D75C2C]" },
  aprovado: { dot: "bg-[#12A976]", chip: "bg-[#E8F8F1] text-[#0F9165]" },
  perdido: { dot: "bg-[#E24F63]", chip: "bg-[#FDECEF] text-[#C6384D]" },
  inativo: { dot: "bg-[#97A3B8]", chip: "bg-[#EEF1F8] text-[#69738A]" },
  distrato: { dot: "bg-[#E24F63]", chip: "bg-[#FDECEF] text-[#C6384D]" },
};

type PreSalesKanbanProps = {
  preSales: PreSaleWithRelations[];
  canDelete?: boolean;
};

export function PreSalesKanban({ preSales, canDelete = false }: PreSalesKanbanProps) {
  const router = useRouter();
  const suppressCardClick = useRef(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<PreSaleStatus | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    preSaleId: string;
    status: PreSaleStatus;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [isPending, startTransition] = useTransition();

  function handleDrop(status: PreSaleStatus) {
    if (!draggedId) {
      return;
    }

    const draggedPreSale = preSales.find((preSale) => preSale.id === draggedId);

    if (!draggedPreSale || draggedPreSale.status === status) {
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    setMessage(null);
    setPendingStatusChange({
      preSaleId: draggedId,
      status,
    });
    setDraggedId(null);
    setDropTarget(null);
  }

  function confirmStatusChange(note: string) {
    if (!pendingStatusChange) {
      return;
    }

    startTransition(async () => {
      const result = await updatePreSaleStatusAction(
        pendingStatusChange.preSaleId,
        pendingStatusChange.status,
        note,
      );

      if (!result.ok) {
        setMessageTone("error");
        setMessage(result.message);
      } else {
        setMessageTone("success");
        setMessage(result.message);
        router.refresh();
      }
    });
    setPendingStatusChange(null);
  }

  return (
    <section className="pre-sales-board min-w-0 space-y-4">
      <div className="flex items-center justify-between">
        {isPending ? <p className="text-sm text-[#69738A]">Atualizando...</p> : null}
      </div>
      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            messageTone === "success"
              ? "border-teal-200 bg-teal-50 text-teal-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      ) : null}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {(preSales.some((preSale) =>
          preSale.status === "inativo" || preSale.status === "distrato",
        )
          ? preSaleStatuses.filter((status) =>
              preSales.some((preSale) => preSale.status === status.value),
            )
          : preSalePipelineStatuses
        ).map((status) => {
          const columnPreSales = preSales.filter((preSale) => preSale.status === status.value);

          return (
            <div
              key={status.value}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedId) {
                  setDropTarget(status.value);
                }
              }}
              onDragLeave={() => {
                if (dropTarget === status.value) {
                  setDropTarget(null);
                }
              }}
              onDrop={(event) => { event.preventDefault(); handleDrop(status.value); }}
              className={`pre-sale-column flex min-h-[620px] min-w-[240px] flex-1 flex-col rounded-lg border p-3 transition ${
                dropTarget === status.value
                  ? "border-[var(--ns-primary)] bg-[var(--ns-surface-hover)] ring-2 ring-[var(--ns-primary)]"
                  : "border-[var(--ns-border)] bg-[var(--ns-surface)]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ns-text)]">
                  <span className={`h-3 w-3 rounded-full ${stageTone[status.value].dot}`} />
                  {status.label}
                </div>
                <span className="rounded-full bg-[var(--ns-surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--ns-primary)]">
                  {columnPreSales.length}
                </span>
              </div>
              <div className="max-h-[calc(100dvh-20rem)] min-h-80 space-y-3 overflow-y-auto">
                {columnPreSales.map((preSale) => (
                  <article
                    key={preSale.id}
                    draggable={!isPending}
                    tabIndex={0}
                    aria-label={`Abrir pré-venda de ${preSale.client?.full_name ?? "cliente"}`}
                    onClick={(event) => {
                      if (suppressCardClick.current || (event.target as HTMLElement).closest("a,button,select,input")) return;
                      router.push(`/pre-vendas/${preSale.id}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && event.key === "Enter") router.push(`/pre-vendas/${preSale.id}`);
                    }}
                    onDragStart={(event) => {
                      suppressCardClick.current = true;
                      event.dataTransfer.setData("text/plain", preSale.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedId(preSale.id);
                    }}
                    onPointerDown={() => { suppressCardClick.current = false; }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTarget(null);
                    }}
                    className={`pre-sale-card rounded-lg border bg-[var(--ns-surface-hover)] p-4 shadow-none transition focus-visible:outline-2 focus-visible:outline-[var(--ns-primary)] ${
                      draggedId === preSale.id
                        ? "cursor-grabbing border-[var(--ns-primary)] opacity-60"
                        : "cursor-pointer border-[var(--ns-border)] hover:border-[var(--ns-primary)]"
                    }`}
                  >
                    <Link
                      href={`/pre-vendas/${preSale.id}`}
                      draggable={false}
                      className="text-sm font-semibold text-[var(--ns-text)] hover:text-[var(--ns-primary)]"
                    >
                      {preSale.client?.full_name ?? "Cliente não encontrado"}
                    </Link>
                    <PreSaleSearchMatchBadges matches={preSale.searchMatches} />
                    <p className="mt-1 text-xs font-medium text-[#69738A]">
                      {formatPreSaleType(preSale.pre_sale_type)} · {preSale.service_type || "Sem origem"}
                    </p>
                    <span className="mt-3 inline-flex rounded-full border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-1 text-xs font-semibold text-[var(--ns-primary)]">
                      {formatCurrency(preSale.contract_value)}
                    </span>
                    <p className="mt-3 text-xs text-[#69738A]">
                      Consultor: {formatUserName(preSale.consultant)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--ns-border)] pt-3" onDragStart={(event) => event.preventDefault()}>
                      <WhatsAppLink
                        phone={preSale.client?.phone_mobile ?? null}
                        label="WhatsApp"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE2EC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5267F5] transition hover:bg-[#EEF0FF]"
                      />
                      <Link
                        href={`/pre-vendas/${preSale.id}/editar`}
                        className="rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ns-text)] transition hover:bg-[var(--ns-surface-hover)]"
                      >
                        Editar
                      </Link>
                      {canDelete ? (
                        <PreSaleDeleteButton
                          preSaleId={preSale.id}
                          variant="inline"
                          className="px-2.5 py-1.5 text-xs"
                        />
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ChangeNoteModal
        isOpen={Boolean(pendingStatusChange)}
        title="Registrar mudança de status"
        description="Explique o que aconteceu nessa movimentação da pré-venda e por que ela foi para esta nova etapa."
        confirmLabel="Mover com anotacao"
        pending={isPending}
        onClose={() => {
          if (isPending) {
            return;
          }

          setPendingStatusChange(null);
        }}
        onConfirm={confirmStatusChange}
      />
    </section>
  );
}
