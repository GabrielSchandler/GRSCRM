"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  updateLegalArchiveStatusAction,
} from "@/app/(authenticated)/juridico/actions";
import {
  moveLegalClientsBulkAction,
  undoLegalClientsBulkAction,
  updateLegalWorkflowStageAction,
} from "@/app/(authenticated)/juridico/workflow-actions";
import { GenerateDocumentModal } from "@/components/documents/generate-document-modal";
import {
  SendClientEmailModal,
  type EmailAttachmentOption,
} from "@/components/email/send-client-email-modal";
import { LegalStageSelect } from "@/components/legal/legal-stage-select";
import { LegalWorkflowEditor } from "@/components/legal/legal-workflow-editor";
import { PreSaleSearchMatchBadges } from "@/components/pre-sales/pre-sale-search-match-badges";
import {
  getPreSaleStatusLabel,
  PreSalesStatusBadge,
} from "@/components/pre-sales/pre-sales-status-badge";
import { ChangeNoteModal } from "@/components/shared/change-note-modal";
import {
  displayValue,
  formatDate,
  formatDateTime,
} from "@/lib/clients/formatters";
import {
  getLegalWorkflowStage,
  type LegalWorkflowStageDefinition,
} from "@/lib/legal/workflow";
import { formatCurrency, formatUserName } from "@/lib/pre-sales/formatters";
import { getPreSaleSearchMatches } from "@/lib/pre-sales/search";
import type { DocumentTemplate, GeneratedDocument } from "@/types/document";
import type { EmailTemplate } from "@/types/email";
import type {
  ClientOption,
  PreSale,
  PreSaleDebtHolder,
  PreSaleFinancialCase,
  PreSaleStatus,
  UserProfileOption,
} from "@/types/pre-sale";
import { isArchivedPreSaleStatus } from "@/types/pre-sale";

export type LegalBoardPreSale = PreSale & {
  client: Pick<ClientOption, "id" | "full_name" | "cpf" | "email" | "phone_mobile"> | null;
  consultant: UserProfileOption | null;
  legalResponsibleUserId: string | null;
  legalConsultantUserId: string | null;
  currentLegalStageId: string;
  stageUpdatedAt: string;
  financialCase: PreSaleFinancialCase | null;
  debtHolder: Pick<PreSaleDebtHolder, "full_name" | "cpf"> | null;
  clientDocuments: EmailAttachmentOption[];
  generatedDocuments: GeneratedDocument[];
};

type LegalKanbanProps = {
  preSales: LegalBoardPreSale[];
  templates: DocumentTemplate[];
  emailTemplates: EmailTemplate[];
  legalAdmins: UserProfileOption[];
  legalConsultants: UserProfileOption[];
  currentUserId: string;
  initialSearchTerm?: string;
  stages: LegalWorkflowStageDefinition[];
  canEditWorkflow: boolean;
  workflowSchemaReady: boolean;
};

type LegalArchiveStatus = Extract<PreSaleStatus, "aprovado" | "inativo" | "distrato">;

type LegalStatusFilter = "active" | "inativo" | "distrato" | "all";

function getStageAgeLabel(isoDate: string) {
  const stageDate = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - stageDate.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) {
    return "Entrou hoje";
  }

  if (diffDays === 1) {
    return "Há 1 dia";
  }

  return `Há ${diffDays} dias`;
}

function getStageTemplates(
  templates: DocumentTemplate[],
  stage: LegalWorkflowStageDefinition,
) {
  const explicitMatches = templates.filter(
    (template) =>
      template.legal_stage_id === stage.id ||
      (stage.legacyKey && template.legal_stage === stage.legacyKey),
  );

  if (explicitMatches.length) {
    return explicitMatches;
  }

  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const stageKeywords: Record<string, string[]> = {
    termo_pagamento_servico: ["recibo", "termo de pagamento", "prestação de serviço"],
    lgpd_hipossuficiencia_procuracao: ["lgpd", "hipossuficiencia", "procuracao"],
    diligencia_cobranca: ["notificacao", "protocolo", "designacao de perito", "perito"],
    pagamento_laudo: ["pagamento de laudo", "laudo"],
    pos_laudo_ciencia: ["ciencia e responsabilidade", "termo de ciencia", "concordancia"],
  };

  const keywords = stage.legacyKey ? stageKeywords[stage.legacyKey] ?? [] : [];

  return templates.filter((template) => {
    const haystack = `${normalize(template.name)} ${normalize(template.description)}`;
    return keywords.some((keyword) => haystack.includes(normalize(keyword)));
  });
}

function getPreSaleStageDocuments(
  generatedDocuments: GeneratedDocument[],
  stageTemplates: DocumentTemplate[],
) {
  const stageTemplateIds = new Set(stageTemplates.map((template) => template.id));
  return generatedDocuments.filter((document) => stageTemplateIds.has(document.template_id));
}

export function LegalKanban({
  preSales,
  templates,
  emailTemplates,
  legalAdmins,
  legalConsultants,
  currentUserId,
  initialSearchTerm = "",
  stages,
  canEditWorkflow,
  workflowSchemaReady,
}: LegalKanbanProps) {
  const router = useRouter();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingStageChange, setPendingStageChange] = useState<{
    preSaleId: string;
    stage: string;
  } | null>(null);
  const [pendingArchiveChange, setPendingArchiveChange] = useState<{
    preSaleId: string;
    status: LegalArchiveStatus;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [statusFilter, setStatusFilter] = useState<LegalStatusFilter>("active");
  const [adminFilter, setAdminFilter] = useState<string>(() =>
    legalAdmins.some((admin) => admin.id === currentUserId) &&
    preSales.some((preSale) => preSale.legalResponsibleUserId === currentUserId)
      ? currentUserId
      : "all",
  );
  const [consultantFilter, setConsultantFilter] = useState<string>(() =>
    legalConsultants.some((consultant) => consultant.id === currentUserId) &&
    preSales.some((preSale) => preSale.legalConsultantUserId === currentUserId)
      ? currentUserId
      : "all",
  );
  const [selectedPreSaleIds, setSelectedPreSaleIds] = useState<string[]>([]);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTargetStageId, setBulkTargetStageId] = useState(stages[0]?.id ?? "");
  const [bulkMoveNote, setBulkMoveNote] = useState("");
  const [lastBulkMove, setLastBulkMove] = useState<{
    batchId: string;
    undoExpiresAt: string;
  } | null>(null);

  const stageTemplatesMap = useMemo(() => {
    return Object.fromEntries(
      stages.map((stage) => [stage.id, getStageTemplates(templates, stage)]),
    ) as Record<string, DocumentTemplate[]>;
  }, [stages, templates]);

  const filteredPreSales = useMemo(() => {
    return preSales.filter((preSale) => {
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? !isArchivedPreSaleStatus(preSale.status)
            : preSale.status === statusFilter;
      const matchesAdmin =
        adminFilter === "all"
          ? true
          : adminFilter === "none"
            ? !preSale.legalResponsibleUserId
            : preSale.legalResponsibleUserId === adminFilter;
      const matchesConsultant =
        consultantFilter === "all"
          ? true
          : consultantFilter === "none"
            ? !preSale.legalConsultantUserId
            : preSale.legalConsultantUserId === consultantFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        getPreSaleSearchMatches(searchTerm, preSale.client, preSale.debtHolder).length > 0;

      return matchesStatus && matchesAdmin && matchesConsultant && matchesSearch;
    });
  }, [adminFilter, consultantFilter, preSales, searchTerm, statusFilter]);

  function handleDrop(stage: string) {
    if (!draggedId) {
      return;
    }

    const draggedPreSale = preSales.find((preSale) => preSale.id === draggedId);

    if (!draggedPreSale || draggedPreSale.currentLegalStageId === stage) {
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    setMessage(null);
    setPendingStageChange({
      preSaleId: draggedId,
      stage,
    });
    setDraggedId(null);
    setDropTarget(null);
  }

  function confirmStageChange(note: string) {
    if (!pendingStageChange) {
      return;
    }

    startTransition(async () => {
      const result = await updateLegalWorkflowStageAction(
        pendingStageChange.preSaleId,
        pendingStageChange.stage,
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
    setPendingStageChange(null);
  }

  function requestArchiveChange(preSaleId: string, status: LegalArchiveStatus) {
    setMessage(null);
    setPendingArchiveChange({ preSaleId, status });
  }

  function confirmArchiveChange(note: string) {
    if (!pendingArchiveChange) {
      return;
    }

    startTransition(async () => {
      const result = await updateLegalArchiveStatusAction(
        pendingArchiveChange.preSaleId,
        pendingArchiveChange.status,
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
    setPendingArchiveChange(null);
  }

  function toggleSelected(preSaleId: string) {
    setSelectedPreSaleIds((current) =>
      current.includes(preSaleId)
        ? current.filter((id) => id !== preSaleId)
        : [...current, preSaleId],
    );
  }

  function toggleStageSelection(stagePreSaleIds: string[]) {
    const allSelected = stagePreSaleIds.every((id) => selectedPreSaleIds.includes(id));
    setSelectedPreSaleIds((current) =>
      allSelected
        ? current.filter((id) => !stagePreSaleIds.includes(id))
        : [...new Set([...current, ...stagePreSaleIds])],
    );
  }

  function confirmBulkMove() {
    if (!bulkTargetStageId || !bulkMoveNote.trim()) {
      setMessageTone("error");
      setMessage("Selecione a coluna de destino e descreva o motivo da movimentação.");
      return;
    }

    startTransition(async () => {
      const result = await moveLegalClientsBulkAction(
        selectedPreSaleIds,
        bulkTargetStageId,
        bulkMoveNote,
      );
      setMessageTone(result.ok ? "success" : "error");
      setMessage(result.message);

      if (result.ok) {
        if (result.batchId && result.undoExpiresAt) {
          setLastBulkMove({
            batchId: result.batchId,
            undoExpiresAt: result.undoExpiresAt,
          });
        }
        setSelectedPreSaleIds([]);
        setBulkMoveOpen(false);
        setBulkMoveNote("");
        router.refresh();
      }
    });
  }

  function undoLastBulkMove() {
    if (!lastBulkMove) {
      return;
    }

    startTransition(async () => {
      const result = await undoLegalClientsBulkAction(lastBulkMove.batchId);
      setMessageTone(result.ok ? "success" : "error");
      setMessage(result.message);
      if (result.ok) {
        setLastBulkMove(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {lastBulkMove && new Date(lastBulkMove.undoExpiresAt).getTime() > Date.now() ? (
            <button
              type="button"
              disabled={isPending}
              onClick={undoLastBulkMove}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              Desfazer ultima movimentação em massa
            </button>
          ) : null}
        </div>
        {canEditWorkflow ? (
          <LegalWorkflowEditor
            stages={stages}
            schemaReady={workflowSchemaReady}
          />
        ) : null}
      </div>

      {canEditWorkflow && selectedPreSaleIds.length ? (
        <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-300 bg-teal-50 px-4 py-3 shadow-lg">
          <p className="text-sm font-semibold text-teal-950">
            {selectedPreSaleIds.length} cliente(s) selecionado(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedPreSaleIds([])}
              className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-800"
            >
              Limpar selecao
            </button>
            <button
              type="button"
              disabled={!workflowSchemaReady}
              onClick={() => setBulkMoveOpen(true)}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Mover selecionados
            </button>
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <div className="rounded-[12px] border border-[#DDE2EC] bg-white p-4 shadow-none">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid w-full gap-3 xl:grid-cols-4">
                <div>
                  <label
                    htmlFor="legal-search-filter"
                    className="sr-only"
                  >
                    Buscar cliente/financiado
                  </label>
                  <input
                    id="legal-search-filter"
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar cliente / CPF"
                    className="w-full rounded-[10px] border border-[#DDE2EC] bg-[#EEF1F8] px-3 py-2.5 text-sm text-[#11182E] outline-none transition focus:border-[#5267F5] focus:ring-2 focus:ring-[#5267F5]/15"
                  />
                </div>
                <div>
                  <label
                    htmlFor="legal-status-filter"
                    className="sr-only"
                  >
                    Situação jurídica
                  </label>
                  <select
                    id="legal-status-filter"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as LegalStatusFilter)}
                    className="w-full rounded-[10px] border border-[#DDE2EC] bg-[#EEF1F8] px-3 py-2.5 text-sm font-semibold text-[#11182E] outline-none transition focus:border-[#5267F5] focus:ring-2 focus:ring-[#5267F5]/15"
                  >
                    <option value="active">Ativos na esteira</option>
                    <option value="inativo">Inativos</option>
                    <option value="distrato">Distratos</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="legal-admin-filter"
                    className="sr-only"
                  >
                    Adm responsável
                  </label>
                  <select
                    id="legal-admin-filter"
                    value={adminFilter}
                    onChange={(event) => setAdminFilter(event.target.value)}
                    className="w-full rounded-[10px] border border-[#DDE2EC] bg-[#EEF1F8] px-3 py-2.5 text-sm font-semibold text-[#11182E] outline-none transition focus:border-[#5267F5] focus:ring-2 focus:ring-[#5267F5]/15"
                  >
                    <option value="all">Todos</option>
                    <option value="none">Sem adm responsável</option>
                    {legalAdmins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {formatUserName(admin)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="legal-consultant-filter"
                    className="sr-only"
                  >
                    Consultor responsável
                  </label>
                  <select
                    id="legal-consultant-filter"
                    value={consultantFilter}
                    onChange={(event) => setConsultantFilter(event.target.value)}
                    className="w-full rounded-[10px] border border-[#DDE2EC] bg-[#EEF1F8] px-3 py-2.5 text-sm font-semibold text-[#11182E] outline-none transition focus:border-[#5267F5] focus:ring-2 focus:ring-[#5267F5]/15"
                  >
                    <option value="all">Todos</option>
                    <option value="none">Sem consultor responsável</option>
                    {legalConsultants.map((consultant) => (
                      <option key={consultant.id} value={consultant.id}>
                        {formatUserName(consultant)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stages.map((stage) => {
          const total = filteredPreSales.filter(
            (preSale) => preSale.currentLegalStageId === stage.id,
          ).length;

          return (
            <div
              key={stage.id}
              className="relative overflow-hidden rounded-[12px] border border-[#DDE2EC] bg-white p-4 shadow-none"
            >
              <span
                className="absolute bottom-0 left-0 top-0 block w-1"
                style={{ backgroundColor: stage.color }}
              />
              <p className="text-xs font-semibold uppercase text-[#69738A]">
                {stage.shortLabel}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#11182E]">{total}</p>
              <p className="mt-1 text-sm leading-6 text-[#69738A]">
                {stage.documents.join(", ")}
              </p>
            </div>
          );
        })}
        </div>
      </section>

      <section className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
        {stages.map((stage) => {
          const stageTemplates = stageTemplatesMap[stage.id] ?? [];
          const allStagePreSales = preSales.filter(
            (preSale) => preSale.currentLegalStageId === stage.id,
          );
          const stagePreSales = filteredPreSales.filter(
            (preSale) => preSale.currentLegalStageId === stage.id,
          );

          return (
            <div
              key={stage.id}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedId) {
                  setDropTarget(stage.id);
                }
              }}
              onDragLeave={() => {
                if (dropTarget === stage.id) {
                  setDropTarget(null);
                }
              }}
              onDrop={() => handleDrop(stage.id)}
              className={`flex min-h-[620px] w-[300px] flex-none flex-col rounded-[12px] border shadow-none transition ${
                dropTarget === stage.id
                  ? "border-[#9EAAFF] bg-[#EEF0FF] ring-2 ring-[#C9D0FF]"
                  : "border-[#DDE2EC] bg-white"
              }`}
            >
              <div className="border-b border-[#DDE2EC] px-3 py-3">
                <span
                  className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                  style={{ backgroundColor: stage.color }}
                />
                <h2 className="inline text-sm font-semibold text-[#11182E]">{stage.label}</h2>
                <p className="mt-2 text-xs leading-5 text-[#69738A]">
                  {stage.description}
                </p>
                <p className="mt-2 text-xs font-medium text-[#69738A]">
                  Templates esperados: {stage.documents.join(" | ")}
                </p>
                {canEditWorkflow && allStagePreSales.length ? (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-teal-800">
                    <input
                      type="checkbox"
                      checked={allStagePreSales.every((preSale) =>
                        selectedPreSaleIds.includes(preSale.id),
                      )}
                      onChange={() =>
                        toggleStageSelection(allStagePreSales.map((preSale) => preSale.id))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-teal-700"
                    />
                    Selecionar todos da coluna ({allStagePreSales.length})
                  </label>
                ) : null}
              </div>

              <div className="flex-1 space-y-3 p-4">
                {stagePreSales.length ? (
                  stagePreSales.map((preSale) => {
                    const stageMeta = getLegalWorkflowStage(
                      preSale.currentLegalStageId,
                      stages,
                    );
                    const stageDocuments = getPreSaleStageDocuments(
                      preSale.generatedDocuments,
                      stageTemplates,
                    );
                    const searchMatches = getPreSaleSearchMatches(
                      searchTerm,
                      preSale.client,
                      preSale.debtHolder,
                    );

                    return (
                      <article
                        key={preSale.id}
                        draggable
                        onDragStart={() => setDraggedId(preSale.id)}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setDropTarget(null);
                        }}
                        className={`rounded-[10px] border p-4 transition ${
                          draggedId === preSale.id
                            ? "cursor-grabbing border-[#9EAAFF] bg-white opacity-70"
                            : "cursor-grab border-[#DDE2EC] bg-[#F4F6FB]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            {canEditWorkflow ? (
                              <input
                                type="checkbox"
                                checked={selectedPreSaleIds.includes(preSale.id)}
                                onChange={() => toggleSelected(preSale.id)}
                                onClick={(event) => event.stopPropagation()}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700"
                                aria-label={`Selecionar ${displayValue(preSale.client?.full_name ?? null)}`}
                              />
                            ) : null}
                            <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-[#11182E]">
                              {displayValue(preSale.client?.full_name ?? null)}
                            </h3>
                            <PreSaleSearchMatchBadges matches={searchMatches} />
                            <p className="mt-1 text-xs text-[#69738A]">
                              {stageMeta.shortLabel} • {getStageAgeLabel(preSale.stageUpdatedAt)}
                            </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {isArchivedPreSaleStatus(preSale.status) ? (
                              <PreSalesStatusBadge status={preSale.status} />
                            ) : null}
                            <span className="rounded-full border border-[#DDE2EC] bg-[#EEF0FF] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#5267F5]">
                              {stageDocuments.length} docs
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 border-t border-[#DDE2EC] pt-3 text-xs text-[#69738A]">
                          <p>
                            <span className="font-semibold text-[#56627C]">Consultor:</span>{" "}
                            {formatUserName(preSale.consultant)}
                          </p>
                          <p>
                            <span className="font-semibold text-[#56627C]">Adm responsável:</span>{" "}
                            {formatUserName(
                              legalAdmins.find(
                                (admin) => admin.id === preSale.legalResponsibleUserId,
                              ) ?? null,
                            )}
                          </p>
                          <p>
                            <span className="font-semibold text-[#56627C]">Consultor responsável:</span>{" "}
                            {formatUserName(
                              legalConsultants.find(
                                (consultant) => consultant.id === preSale.legalConsultantUserId,
                              ) ?? null,
                            )}
                          </p>
                          <p>
                            <span className="font-semibold text-[#56627C]">Valor:</span>{" "}
                            {formatCurrency(preSale.contract_value)}
                          </p>
                          <p>
                            <span className="font-semibold text-[#56627C]">Aprovado em:</span>{" "}
                            {formatDateTime(preSale.created_at)}
                          </p>
                          <p>
                            <span className="font-semibold text-[#56627C]">Ultima mudança:</span>{" "}
                            {formatDate(preSale.stageUpdatedAt)}
                          </p>
                        </div>

                        <div className="mt-4">
                          <LegalStageSelect
                            preSaleId={preSale.id}
                            currentStageId={preSale.currentLegalStageId}
                            stages={stages}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={`/clientes/${preSale.client_id}`}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Cliente
                          </Link>
                          <Link
                            href={`/pre-vendas/${preSale.id}`}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Pré-venda
                          </Link>
                          <Link
                            href="/documentos"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Documentos
                          </Link>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {isArchivedPreSaleStatus(preSale.status) ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => requestArchiveChange(preSale.id, "aprovado")}
                              className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reativar na esteira
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => requestArchiveChange(preSale.id, "inativo")}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Inativar
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => requestArchiveChange(preSale.id, "distrato")}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Distrato
                              </button>
                            </>
                          )}
                        </div>

                        <div className="mt-4">
                          <GenerateDocumentModal
                            preSaleId={preSale.id}
                            templates={stageTemplates}
                          />
                        </div>

                        <div className="mt-3">
                          <SendClientEmailModal
                            clientId={preSale.client_id}
                            preSaleId={preSale.id}
                            clientEmail={preSale.client?.email ?? null}
                            bankName={preSale.financialCase?.financer_name ?? null}
                            templates={[
                              ...emailTemplates.filter(
                                (template) =>
                                  template.legal_stage_id === preSale.currentLegalStageId ||
                                  (stageMeta.legacyKey &&
                                    template.legal_stage === stageMeta.legacyKey),
                              ),
                              ...emailTemplates.filter(
                                (template) =>
                                  template.legal_stage_id !== preSale.currentLegalStageId &&
                                  (!stageMeta.legacyKey ||
                                    template.legal_stage !== stageMeta.legacyKey),
                              ),
                            ]}
                            documents={preSale.clientDocuments}
                            variables={{
                              nome_cliente:
                                preSale.client?.full_name ?? "Não informado",
                              cpf: preSale.client?.cpf ?? "Não informado",
                              email_cliente:
                                preSale.client?.email ?? "Não informado",
                              telefone_cliente:
                                preSale.client?.phone_mobile ?? "Não informado",
                              banco:
                                preSale.financialCase?.financer_name ??
                                "Não informado",
                              financeira:
                                preSale.financialCase?.financer_name ??
                                "Não informado",
                              financeira_razao_social:
                                preSale.financialCase?.financer_legal_name ??
                                "Não informado",
                              financeira_cnpj:
                                preSale.financialCase?.financer_cnpj ??
                                "Não informado",
                              numero_contrato:
                                preSale.tracking_protocol ?? "Não informado",
                              numero_protocolo:
                                preSale.tracking_protocol ?? "Não informado",
                              protocolo:
                                preSale.tracking_protocol ?? "Não informado",
                              numero_contrato_financiamento:
                                preSale.financialCase?.contract_number ??
                                "Não informado",
                            }}
                          />
                        </div>

                        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Documentos desta etapa
                          </p>
                          {stageTemplates.length ? (
                            <ul className="space-y-2 text-xs text-slate-700">
                              {stageTemplates.map((template) => {
                                const documentCreated = stageDocuments.find(
                                  (document) => document.template_id === template.id,
                                );

                                return (
                                  <li
                                    key={template.id}
                                    className="flex items-start justify-between gap-3"
                                  >
                                    <div>
                                      <p className="font-medium text-slate-800">
                                        {template.name}
                                      </p>
                                      <p className="text-slate-500">
                                        {documentCreated
                                          ? `Gerado em ${formatDateTime(documentCreated.created_at)}`
                                          : "Ainda não gerado"}
                                      </p>
                                    </div>
                                    {documentCreated ? (
                                      <Link
                                        href={`/documentos/gerados/${documentCreated.id}`}
                                        className="font-semibold text-teal-700 transition hover:text-teal-800"
                                      >
                                        Abrir
                                      </Link>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-xs leading-5 text-amber-700">
                              Nenhum template desta etapa foi vinculado ainda. Suba os
                              documentos prontos em Templates e marque a etapa jurídica
                              correspondente.
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Nenhum cliente nesta etapa.
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </section>
      {isPending ? <p className="text-sm text-slate-500">Movendo cliente...</p> : null}

      <ChangeNoteModal
        isOpen={Boolean(pendingStageChange)}
        title="Registrar mudança na esteira jurídica"
        description="Antes de mover o cliente de etapa, registre o que foi feito e por que essa movimentação jurídica aconteceu agora."
        confirmLabel="Mover com anotacao"
        pending={isPending}
        onClose={() => {
          if (isPending) {
            return;
          }

          setPendingStageChange(null);
        }}
        onConfirm={confirmStageChange}
      />
      <ChangeNoteModal
        isOpen={Boolean(pendingArchiveChange)}
        title={
          pendingArchiveChange?.status === "aprovado"
            ? "Registrar reativação jurídica"
            : `Registrar ${getPreSaleStatusLabel(
                pendingArchiveChange?.status ?? "inativo",
              ).toLowerCase()}`
        }
        description={
          pendingArchiveChange?.status === "aprovado"
            ? "Explique por que o cliente está voltando para a esteira jurídica ativa."
            : "Explique por que o cliente deve sair da esteira jurídica ativa neste momento."
        }
        confirmLabel={
          pendingArchiveChange?.status === "aprovado"
            ? "Reativar com anotacao"
            : "Arquivar com anotacao"
        }
        pending={isPending}
        onClose={() => {
          if (isPending) {
            return;
          }

          setPendingArchiveChange(null);
        }}
        onConfirm={confirmArchiveChange}
      />
      {bulkMoveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-move-title"
            className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl"
          >
            <h2 id="bulk-move-title" className="text-lg font-semibold text-slate-950">
              Mover {selectedPreSaleIds.length} cliente(s)
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              A mesma justificativa sera registrada individualmente na linha do tempo de cada cliente.
            </p>
            <label className="mt-5 block space-y-1.5 text-sm font-semibold text-slate-700">
              Coluna de destino
              <select
                value={bulkTargetStageId}
                onChange={(event) => setBulkTargetStageId(event.target.value)}
                disabled={isPending}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.shortLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block space-y-1.5 text-sm font-semibold text-slate-700">
              Anotacao obrigatória
              <textarea
                rows={4}
                value={bulkMoveNote}
                onChange={(event) => setBulkMoveNote(event.target.value)}
                disabled={isPending}
                placeholder="Descreva o que foi feito e por que os clientes estao mudando de etapa."
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                disabled={isPending || !bulkMoveNote.trim()}
                onClick={confirmBulkMove}
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {isPending ? "Movendo..." : "Mover com anotacao"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setBulkMoveOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
