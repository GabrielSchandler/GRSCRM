"use client";

import {
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  PenLine,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createClientTrackingUpdateAction,
  deleteClientTrackingUpdateAction,
  updateClientTrackingUpdateAction,
} from "@/app/(authenticated)/clientes/tracking-actions";
import { formatDateTime } from "@/lib/clients/formatters";
import { formatPreSaleType } from "@/lib/pre-sales/formatters";
import { formatClientApprovalStatus } from "@/types/client-approval";
import {
  clientTrackingStatusOptions,
  formatClientTrackingStatus,
  type ClientTrackingStatus,
  type ClientTrackingUpdate,
} from "@/types/client-tracking";
import type { PreSale, PreSaleType } from "@/types/pre-sale";

type TrackingPreSaleOption = Pick<
  PreSale,
  | "id"
  | "status"
  | "pre_sale_type"
  | "service_type"
  | "tracking_protocol"
  | "created_at"
>;

type ClientTrackingSectionProps = {
  clientId: string;
  preSales: TrackingPreSaleOption[];
  updates: ClientTrackingUpdate[];
};

type TrackingFormState = {
  pre_sale_id: string;
  title: string;
  description: string;
  status: ClientTrackingStatus;
  visible_to_client: boolean;
  event_at: string;
};

function toDatetimeLocal(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function getInitialFormState(preSaleId = ""): TrackingFormState {
  return {
    pre_sale_id: preSaleId,
    title: "",
    description: "",
    status: "in_progress",
    visible_to_client: true,
    event_at: toDatetimeLocal(new Date().toISOString()),
  };
}

function getStatusClassName(status: ClientTrackingStatus | string | null) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-teal-200 bg-teal-50 text-teal-700";
}

function getStatusIcon(status: ClientTrackingStatus | string | null) {
  return status === "completed" ? CheckCircle2 : Clock3;
}

function getPreSaleLabel(preSale: TrackingPreSaleOption) {
  const protocol = preSale.tracking_protocol ?? "Sem protocolo";
  const type = formatPreSaleType(preSale.pre_sale_type as PreSaleType);
  const service = preSale.service_type ? ` — ${preSale.service_type}` : "";
  return `${protocol} | ${type}${service}`;
}

function getApprovalClassName(status: ClientTrackingUpdate["approval_status"]) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function ClientTrackingSection({
  clientId,
  preSales,
  updates,
}: ClientTrackingSectionProps) {
  const router = useRouter();
  const defaultPreSaleId = preSales[0]?.id ?? "";
  const [form, setForm] = useState<TrackingFormState>(() =>
    getInitialFormState(defaultPreSaleId),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<TrackingFormState>(() =>
    getInitialFormState(defaultPreSaleId),
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const preSaleById = useMemo(
    () => new Map(preSales.map((preSale) => [preSale.id, preSale])),
    [preSales],
  );

  const orderedUpdates = useMemo(
    () =>
      [...updates].sort(
        (first, second) =>
          new Date(second.event_at).getTime() - new Date(first.event_at).getTime(),
      ),
    [updates],
  );

  function updateForm<K extends keyof TrackingFormState>(
    key: K,
    value: TrackingFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateEditingForm<K extends keyof TrackingFormState>(
    key: K,
    value: TrackingFormState[K],
  ) {
    setEditingForm((current) => ({ ...current, [key]: value }));
  }

  function handleCreate() {
    if (!form.pre_sale_id) {
      setFeedback({
        ok: false,
        message: "Selecione a pré-venda vinculada ao acompanhamento.",
      });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await createClientTrackingUpdateAction({
        client_id: clientId,
        ...form,
      });
      setFeedback(result);

      if (result.ok) {
        setForm(getInitialFormState(form.pre_sale_id));
        router.refresh();
      }
    });
  }

  function beginEditing(update: ClientTrackingUpdate) {
    setEditingId(update.id);
    setEditingForm({
      pre_sale_id: update.pre_sale_id,
      title: update.title,
      description: update.description,
      status: update.status,
      visible_to_client: update.visible_to_client,
      event_at: toDatetimeLocal(update.event_at),
    });
    setFeedback(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingForm(getInitialFormState(defaultPreSaleId));
  }

  function handleUpdate(updateId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateClientTrackingUpdateAction(updateId, {
        client_id: clientId,
        ...editingForm,
      });
      setFeedback(result);

      if (result.ok) {
        cancelEditing();
        router.refresh();
      }
    });
  }

  function handleDelete(update: ClientTrackingUpdate) {
    const confirmed = window.confirm(
      "Remover esta atualização de acompanhamento? Ela deixará de aparecer para a equipe e para o cliente.",
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await deleteClientTrackingUpdateAction(update.id);
      setFeedback(result);

      if (result.ok) {
        if (editingId === update.id) {
          cancelEditing();
        }
        router.refresh();
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface)] shadow-none">
      <div className="border-b border-[var(--ns-border)] bg-[color-mix(in_srgb,var(--ns-primary)_7%,var(--ns-surface))] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ns-primary)]">
              Portal do cliente
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ns-text)]">
              Acompanhamento do cliente
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ns-muted)]">
              Registre movimentações claras para reduzir cobranças repetidas do
              cliente. Informações destinadas ao portal só aparecem depois da
              aprovação da Gestão.
            </p>
          </div>
          <div className="rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface)] px-4 py-3 text-sm text-[var(--ns-text)] shadow-none">
            <span className="font-semibold text-[var(--ns-primary)]">{updates.length}</span>{" "}
            movimentação{updates.length === 1 ? "" : "ões"} registrada
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="rounded-[8px] border border-[var(--ns-border)] bg-[var(--ns-surface-alt)] p-4">
          <h3 className="text-sm font-semibold text-[var(--ns-text)]">
            Nova atualização
          </h3>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Pré-venda / protocolo
              </span>
              <select
                value={form.pre_sale_id}
                onChange={(event) => updateForm("pre_sale_id", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {preSales.length ? null : (
                  <option value="">Nenhuma pré-venda encontrada</option>
                )}
                {preSales.map((preSale) => (
                  <option key={preSale.id} value={preSale.id}>
                    {getPreSaleLabel(preSale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Título
              </span>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Ex.: Notificação extrajudicial enviada"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Descrição para acompanhamento
              </span>
              <textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                rows={5}
                placeholder="Escreva uma explicação curta, objetiva e segura para o cliente entender o andamento."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm("status", event.target.value as ClientTrackingStatus)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {clientTrackingStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Data do evento
                </span>
                <input
                  type="datetime-local"
                  value={form.event_at}
                  onChange={(event) => updateForm("event_at", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-teal-200 bg-white p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.visible_to_client}
                onChange={(event) =>
                  updateForm("visible_to_client", event.target.checked)
                }
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>
                <span className="block font-semibold text-slate-950">
                  Enviar para aprovação no portal
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  A informação ficará invisível ao cliente até a Gestão revisar e aprovar. Desmarque para manter apenas como controle interno.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !preSales.length}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {form.visible_to_client ? "Enviar para aprovação" : "Registrar internamente"}
            </button>

            {feedback ? (
              <p
                className={`rounded-lg border px-3 py-2 text-sm ${
                  feedback.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {feedback.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          {orderedUpdates.length ? (
            <div className="relative space-y-4 before:absolute before:left-5 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
              {orderedUpdates.map((update) => {
                const Icon = getStatusIcon(update.status);
                const preSale = preSaleById.get(update.pre_sale_id);
                const isEditing = editingId === update.id;

                return (
                  <article key={update.id} className="relative pl-14">
                    <div
                      className={`absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-lg border ${getStatusClassName(
                        update.status,
                      )}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      {isEditing ? (
                        <div className="space-y-4">
                          <input
                            value={editingForm.title}
                            onChange={(event) =>
                              updateEditingForm("title", event.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          />
                          <textarea
                            value={editingForm.description}
                            onChange={(event) =>
                              updateEditingForm("description", event.target.value)
                            }
                            rows={5}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-950 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          />
                          <div className="grid gap-3 md:grid-cols-3">
                            <select
                              value={editingForm.status}
                              onChange={(event) =>
                                updateEditingForm(
                                  "status",
                                  event.target.value as ClientTrackingStatus,
                                )
                              }
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            >
                              {clientTrackingStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="datetime-local"
                              value={editingForm.event_at}
                              onChange={(event) =>
                                updateEditingForm("event_at", event.target.value)
                              }
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            />
                            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={editingForm.visible_to_client}
                                onChange={(event) =>
                                  updateEditingForm(
                                    "visible_to_client",
                                    event.target.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                              />
                              Solicitar publicação
                            </label>
                          </div>
                          {update.approval_status === "approved" ? (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                              Ao salvar, a aprovação atual será removida e a edição voltará para análise da Gestão.
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdate(update.id)}
                              disabled={isPending}
                              className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                            >
                              Salvar edição
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClassName(
                                    update.status,
                                  )}`}
                                >
                                  {formatClientTrackingStatus(update.status)}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${getApprovalClassName(
                                    update.approval_status,
                                  )}`}
                                >
                                  {update.approval_status === "approved" ? (
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                  ) : update.approval_status === "pending" ? (
                                    <Clock3 className="h-3.5 w-3.5" />
                                  ) : update.approval_status === "rejected" ? (
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  )}
                                  {formatClientApprovalStatus(update.approval_status)}
                                </span>
                                {update.approval_status === "approved" ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                    <Eye className="h-3.5 w-3.5" /> Visível no portal
                                  </span>
                                ) : null}
                              </div>
                              <h3 className="mt-3 text-base font-semibold text-slate-950">
                                {update.title}
                              </h3>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => beginEditing(update)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <PenLine className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(update)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remover
                              </button>
                            </div>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                            {update.description}
                          </p>
                          {update.approval_status === "rejected" && update.approval_review_note ? (
                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                              <span className="font-semibold">Ajuste solicitado pela Gestão:</span>{" "}
                              {update.approval_review_note}
                            </div>
                          ) : null}
                          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
                            <span>{formatDateTime(update.event_at)}</span>
                            <span>
                              {preSale
                                ? getPreSaleLabel(preSale)
                                : "Pré-venda vinculada não encontrada"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-950">
                Nenhuma movimentação registrada ainda.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Use o formulário ao lado para criar a primeira atualização que
                poderá aparecer no portal do cliente.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
