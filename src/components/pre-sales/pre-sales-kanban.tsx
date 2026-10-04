"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#69738A]">Arraste os cards entre as etapas para atualizar o fluxo.</p>
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
      <div className="grid min-w-[1080px] gap-3 overflow-x-auto xl:grid-cols-6">
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
              onDrop={() => handleDrop(status.value)}
              className={`flex min-h-[620px] flex-col rounded-[12px] border p-3 transition ${
                dropTarget === status.value
                  ? "border-[#9EAAFF] bg-[#EEF0FF] ring-2 ring-[#C9D0FF]"
                  : "border-[#DDE2EC] bg-white"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#11182E]">
                  <span className={`h-3 w-3 rounded-full ${stageTone[status.value].dot}`} />
                  {status.label}
                </div>
                <span className="rounded-full bg-[#EEF0FF] px-3 py-1 text-xs font-semibold text-[#5267F5]">
                  {columnPreSales.length}
                </span>
              </div>
              <div className="space-y-3">
                {columnPreSales.map((preSale) => (
                  <article
                    key={preSale.id}
                    draggable
                    onDragStart={() => setDraggedId(preSale.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTarget(null);
                    }}
                    className={`rounded-[10px] border bg-[#F4F6FB] p-4 shadow-none transition ${
                      draggedId === preSale.id
                        ? "cursor-grabbing border-[#9EAAFF] bg-white opacity-70"
                        : "cursor-grab border-[#DDE2EC]"
                    }`}
                  >
                    <Link
                      href={`/pre-vendas/${preSale.id}`}
                      className="text-sm font-semibold text-[#11182E] hover:text-[#4053DE]"
                    >
                      {preSale.client?.full_name ?? "Cliente não encontrado"}
                    </Link>
                    <PreSaleSearchMatchBadges matches={preSale.searchMatches} />
                    <p className="mt-1 text-xs font-medium text-[#69738A]">
                      {formatPreSaleType(preSale.pre_sale_type)} · {preSale.service_type || "Sem origem"}
                    </p>
                    <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${stageTone[status.value].chip}`}>
                      {formatCurrency(preSale.contract_value)}
                    </span>
                    <p className="mt-3 text-xs text-[#69738A]">
                      Consultor: {formatUserName(preSale.consultant)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[#DDE2EC] pt-3">
                      <WhatsAppLink
                        phone={preSale.client?.phone_mobile ?? null}
                        label="WhatsApp"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE2EC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5267F5] transition hover:bg-[#EEF0FF]"
                      />
                      <Link
                        href={`/pre-vendas/${preSale.id}/editar`}
                        className="rounded-lg border border-[#DDE2EC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#11182E] transition hover:bg-[#EEF1F8]"
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
