"use client";

import {
  Check,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  MessageSquareText,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  reviewClientDocumentAction,
  reviewTrackingUpdateAction,
  type ClientApprovalActionState,
} from "@/app/(authenticated)/aprovacoes/actions";
import { createSignedDocumentUrlAction } from "@/app/(authenticated)/clientes/document-actions";
import {
  closePreparedDocumentTab,
  openPreparedDocumentTab,
  prepareDocumentTab,
} from "@/lib/browser/open-document-tab";
import { formatDateTime } from "@/lib/clients/formatters";
import { formatClientDocumentSize } from "@/lib/client-documents/formatters";
import { formatClientTrackingStatus } from "@/types/client-tracking";

export type TrackingApprovalQueueItem = {
  id: string;
  clientId: string;
  clientName: string;
  preSaleId: string;
  protocol: string | null;
  serviceType: string | null;
  title: string;
  description: string;
  trackingStatus: string;
  eventAt: string;
  requestedAt: string;
  requestedBy: string;
};

export type DocumentApprovalQueueItem = {
  id: string;
  clientId: string;
  clientName: string;
  preSaleId: string | null;
  protocol: string | null;
  serviceType: string | null;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  requestedAt: string;
  requestedBy: string;
  visibilityRequested: boolean;
  downloadRequested: boolean;
};

type ClientApprovalQueueProps = {
  compact?: boolean;
  trackingItems: TrackingApprovalQueueItem[];
  documentItems: DocumentApprovalQueueItem[];
};

type QueueFilter = "all" | "tracking" | "documents";

function decisionButtonClass(decision: "approve" | "reject") {
  return decision === "approve"
    ? "bg-emerald-700 text-white hover:bg-emerald-800"
    : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";
}

export function ClientApprovalQueue({
  compact = false,
  trackingItems,
  documentItems,
}: ClientApprovalQueueProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ClientApprovalActionState | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [documentPermissions, setDocumentPermissions] = useState<
    Record<string, { visible: boolean; download: boolean }>
  >(() =>
    Object.fromEntries(
      documentItems.map((item) => [
        item.id,
        {
          visible: item.visibilityRequested,
          download: item.downloadRequested,
        },
      ]),
    ),
  );

  const totalItems = trackingItems.length + documentItems.length;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const matchesQuery = (...values: Array<string | null | undefined>) =>
    !normalizedQuery ||
    values.some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
  const visibleTrackingItems =
    filter === "documents"
      ? []
      : trackingItems.filter((item) =>
          matchesQuery(
            item.clientName,
            item.protocol,
            item.serviceType,
            item.title,
            item.description,
            item.requestedBy,
          ),
        );
  const visibleDocumentItems =
    filter === "tracking"
      ? []
      : documentItems.filter((item) =>
          matchesQuery(
            item.clientName,
            item.protocol,
            item.serviceType,
            item.title,
            item.fileName,
            item.requestedBy,
          ),
        );
  const filters = useMemo(
    () => [
      { value: "all" as const, label: "Todas", count: totalItems },
      {
        value: "tracking" as const,
        label: "Acompanhamentos",
        count: trackingItems.length,
      },
      {
        value: "documents" as const,
        label: "Documentos",
        count: documentItems.length,
      },
    ],
    [documentItems.length, totalItems, trackingItems.length],
  );

  function finishReview(id: string, callback: () => Promise<ClientApprovalActionState>) {
    setFeedback(null);
    setPendingId(id);
    startTransition(async () => {
      const response = await callback();
      setFeedback(response);
      setPendingId(null);
      if (response.ok) router.refresh();
    });
  }

  function reviewTracking(id: string, decision: "approved" | "rejected") {
    finishReview(id, () =>
      reviewTrackingUpdateAction(id, {
        decision,
        note: notes[id] ?? "",
      }),
    );
  }

  function reviewDocument(id: string, decision: "approved" | "rejected") {
    const permissions = documentPermissions[id] ?? {
      visible: false,
      download: false,
    };
    finishReview(id, () =>
      reviewClientDocumentAction(id, {
        decision,
        note: notes[id] ?? "",
        visible_to_client: permissions.visible,
        downloadable_by_client: permissions.download,
      }),
    );
  }

  function previewDocument(id: string) {
    const preparedTab = prepareDocumentTab();
    setFeedback(null);
    setPendingId(id);
    startTransition(async () => {
      const response = await createSignedDocumentUrlAction(id, "view");
      setPendingId(null);
      if (response.ok && response.url) {
        openPreparedDocumentTab(response.url, preparedTab);
      } else {
        closePreparedDocumentTab(preparedTab);
        setFeedback(response);
      }
    });
  }

  return (
    <div className={`space-y-6 ${compact ? "approval-compact" : ""}`}>
      <div className={`${compact ? "hidden" : "flex"} flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between`}>
        <div>
          <p className="text-xs font-semibold uppercase text-teal-700">Fila de revisão</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            Conteúdo aguardando decisão
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Confira o texto, o protocolo e o arquivo antes de liberar qualquer informação no acompanhamento público.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
          <label className="relative block w-full lg:w-80">
            <span className="sr-only">Buscar na fila de aprovação</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente, protocolo ou conteúdo"
              className="w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar aprovações">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  filter === item.value
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-800"
                }`}
              >
                {item.label}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs ${
                    filter === item.value ? "bg-white/15" : "bg-slate-100"
                  }`}
                >
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {!visibleTrackingItems.length && !visibleDocumentItems.length ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <FileCheck2 className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-slate-950">
            {totalItems ? "Nenhuma solicitação encontrada" : "Fila revisada"}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
            {totalItems
              ? "Ajuste a busca ou escolha outro filtro para ver as solicitações pendentes."
              : "Não há solicitações pendentes. Novos envios aparecerão aqui automaticamente."}
          </p>
        </div>
      ) : null}

      {visibleTrackingItems.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-slate-950">Atualizações de acompanhamento</h3>
              <p className="text-xs text-slate-500">Textos que poderão aparecer na linha do tempo do cliente.</p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleTrackingItems.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                        <Clock3 className="h-3.5 w-3.5" /> Aguardando aprovação
                      </span>
                      <span>{formatDateTime(item.requestedAt)}</span>
                    </div>
                    <h4 className="mt-3 text-base font-semibold text-slate-950">{item.title}</h4>
                    <p className="mt-1 text-sm text-slate-600">{item.clientName}</p>
                  </div>
                  <Link
                    href={`/clientes/${item.clientId}#acompanhamento`}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-800"
                  >
                    Abrir cliente
                  </Link>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div><span className="block text-slate-500">Protocolo</span><strong className="mt-1 block text-slate-900">{item.protocol || "Não informado"}</strong></div>
                    <div><span className="block text-slate-500">Serviço</span><strong className="mt-1 block text-slate-900">{item.serviceType || "Não informado"}</strong></div>
                    <div><span className="block text-slate-500">Situação</span><strong className="mt-1 block text-slate-900">{formatClientTrackingStatus(item.trackingStatus)}</strong></div>
                    <div><span className="block text-slate-500">Enviado por</span><strong className="mt-1 block text-slate-900">{item.requestedBy}</strong></div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{item.description}</p>
                    <p className="mt-3 text-xs font-medium text-slate-500">Evento em {formatDateTime(item.eventAt)}</p>
                  </div>
                  <textarea
                    value={notes[item.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    rows={2}
                    maxLength={1000}
                    placeholder="Observação da revisão. Obrigatória ao devolver para ajuste."
                    aria-label={`Observação da revisão de ${item.title}`}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-5 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={isPending} onClick={() => reviewTracking(item.id, "rejected")} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${decisionButtonClass("reject")}`}>
                      <X className="h-4 w-4" /> Devolver para ajuste
                    </button>
                    <button type="button" disabled={isPending} onClick={() => reviewTracking(item.id, "approved")} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${decisionButtonClass("approve")}`}>
                      <Check className="h-4 w-4" /> {pendingId === item.id ? "Processando..." : "Aprovar publicação"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {visibleDocumentItems.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-50 text-sky-700">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-slate-950">Documentos extrajudiciais</h3>
              <p className="text-xs text-slate-500">Decida se o cliente verá apenas a existência ou também poderá baixar o arquivo.</p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleDocumentItems.map((item) => {
              const permissions = documentPermissions[item.id] ?? { visible: false, download: false };
              return (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800"><Clock3 className="h-3.5 w-3.5" /> Aguardando aprovação</span>
                        <span>{formatDateTime(item.requestedAt)}</span>
                      </div>
                      <h4 className="mt-3 break-words text-base font-semibold text-slate-950">{item.title}</h4>
                      <p className="mt-1 text-sm text-slate-600">{item.clientName}</p>
                    </div>
                    <button type="button" disabled={isPending} onClick={() => previewDocument(item.id)} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 disabled:opacity-60">
                      <Search className="h-3.5 w-3.5" /> Conferir arquivo
                    </button>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    <div className="grid gap-3 text-xs sm:grid-cols-3">
                      <div><span className="block text-slate-500">Protocolo</span><strong className="mt-1 block text-slate-900">{item.protocol || "Não vinculado"}</strong></div>
                      <div><span className="block text-slate-500">Arquivo</span><strong className="mt-1 block break-words text-slate-900">{item.fileName}</strong><span className="mt-1 block text-slate-500">{formatClientDocumentSize(item.fileSize)}</span></div>
                      <div><span className="block text-slate-500">Enviado por</span><strong className="mt-1 block text-slate-900">{item.requestedBy}</strong></div>
                    </div>
                    {item.description ? <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{item.description}</p> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                        <input type="checkbox" checked={permissions.visible} onChange={(event) => { const visible = event.target.checked; setDocumentPermissions((current) => ({ ...current, [item.id]: { visible, download: visible && permissions.download } })); }} className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />
                        <span><span className="flex items-center gap-2 font-semibold text-slate-950"><Eye className="h-4 w-4 text-teal-700" /> Mostrar existência</span><span className="mt-1 block text-xs leading-5 text-slate-500">Exibe o título no portal.</span></span>
                      </label>
                      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                        <input type="checkbox" checked={permissions.download} onChange={(event) => { const download = event.target.checked; setDocumentPermissions((current) => ({ ...current, [item.id]: { visible: download || permissions.visible, download } })); }} className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />
                        <span><span className="flex items-center gap-2 font-semibold text-slate-950"><Download className="h-4 w-4 text-teal-700" /> Permitir download</span><span className="mt-1 block text-xs leading-5 text-slate-500">Libera o arquivo temporariamente.</span></span>
                      </label>
                    </div>
                    {!item.preSaleId ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">Vincule este documento a uma pré-venda antes de aprovar.</p> : null}
                    <textarea value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} rows={2} maxLength={1000} placeholder="Observação da revisão. Obrigatória ao devolver para ajuste." aria-label={`Observação da revisão de ${item.title}`} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-5 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/clientes/${item.clientId}#documentacao`} className="text-xs font-semibold text-teal-700 hover:text-teal-800">Abrir documentos do cliente</Link>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={isPending} onClick={() => reviewDocument(item.id, "rejected")} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${decisionButtonClass("reject")}`}><X className="h-4 w-4" /> Devolver</button>
                        <button type="button" disabled={isPending || !item.preSaleId} onClick={() => reviewDocument(item.id, "approved")} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${decisionButtonClass("approve")}`}><Check className="h-4 w-4" /> {pendingId === item.id ? "Processando..." : "Aprovar acesso"}</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
