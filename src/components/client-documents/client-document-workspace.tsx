"use client";

import { useState } from "react";
import {
  ClientDocumentList,
  type ClientDocumentListItem,
} from "@/components/client-documents/client-document-list";
import { ClientDocumentUpload } from "@/components/client-documents/client-document-upload";
import type { ClientDocumentPreSaleOption } from "@/components/client-documents/client-document-upload";
import {
  clientDocumentBadgeClass,
  clientDocumentGroupAccentClass,
} from "@/lib/client-documents/formatters";
import {
  clientDocumentTypes,
  normalizeClientDocumentType,
  type ClientDocumentType,
} from "@/types/client-document";

type ClientDocumentWorkspaceProps = {
  clientId: string;
  preSaleId?: string | null;
  documents: ClientDocumentListItem[];
  canManage: boolean;
  preSales?: ClientDocumentPreSaleOption[];
};

const documentTypeDescriptions: Record<ClientDocumentType, string> = {
  documentacao: "RG, CPF, comprovantes, contratos assinados e documentos base do atendimento.",
  extrajudicial: "Notificações, protocolos, comunicados e arquivos da cobrança extrajudicial.",
  processual: "Peticionamentos, comprovantes, laudos, certidões e arquivos do andamento processual.",
};

export function ClientDocumentWorkspace({
  clientId,
  preSaleId = null,
  documents,
  canManage,
  preSales = [],
}: ClientDocumentWorkspaceProps) {
  const [activeDocumentType, setActiveDocumentType] =
    useState<ClientDocumentType>("documentacao");
  const activeType =
    clientDocumentTypes.find((type) => type.value === activeDocumentType) ??
    clientDocumentTypes[0];
  const activeDocuments = documents.filter(
    (document) => normalizeClientDocumentType(document.document_type) === activeDocumentType,
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-3 shadow-none">
        <div
          role="tablist"
          aria-label="Categorias de documentos do cliente"
          className="grid gap-2 md:grid-cols-3"
        >
          {clientDocumentTypes.map((type) => {
            const count = documents.filter(
              (document) => normalizeClientDocumentType(document.document_type) === type.value,
            ).length;
            const isActive = type.value === activeDocumentType;

            return (
              <button
                key={type.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`client-document-panel-${type.value}`}
                id={`client-document-tab-${type.value}`}
                onClick={() => setActiveDocumentType(type.value)}
                className={`cursor-pointer rounded-[8px] border px-4 py-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] ${
                  isActive
                    ? "border-[var(--ns-primary)] bg-[var(--ns-primary)] text-white shadow-sm"
                    : "border-[var(--ns-border)] bg-[var(--ns-surface-alt)] text-[var(--ns-text)] hover:border-[color-mix(in_srgb,var(--ns-primary)_45%,var(--ns-border))] hover:bg-[color-mix(in_srgb,var(--ns-primary)_7%,var(--ns-surface-alt))]"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        className={`h-2 w-8 rounded-full ${clientDocumentGroupAccentClass(
                          type.value,
                        )}`}
                      />
                      {type.label}
                    </span>
                    <span
                      className={`mt-2 block text-xs leading-5 ${
                        isActive ? "text-white/80" : "text-[var(--ns-muted)]"
                      }`}
                    >
                      {documentTypeDescriptions[type.value]}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      isActive
                    ? "border-white/25 bg-white/15 text-white"
                        : clientDocumentBadgeClass(type.value)
                    }`}
                  >
                    {count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`client-document-panel-${activeDocumentType}`}
        aria-labelledby={`client-document-tab-${activeDocumentType}`}
        className="space-y-4"
      >
        <div className="rounded-[10px] border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5 shadow-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ns-primary)]">
                {activeType?.label ?? "Documentação"}
              </p>
              <h3 className="mt-1 text-base font-semibold text-[var(--ns-text)]">
                {activeDocuments.length} documento(s) nesta área
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ns-muted)]">
                {documentTypeDescriptions[activeDocumentType]}
              </p>
            </div>
            <span
              className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${clientDocumentBadgeClass(
                activeDocumentType,
              )}`}
            >
              Upload em {activeType?.label ?? "Documentação"}
            </span>
          </div>
        </div>

        <ClientDocumentUpload
          key={`upload-${activeDocumentType}`}
          clientId={clientId}
          preSaleId={preSaleId}
          fixedDocumentType={activeDocumentType}
          preSales={preSales}
        />
        <ClientDocumentList
          key={`list-${activeDocumentType}`}
          documents={activeDocuments}
          canManage={canManage}
          visibleTypes={[activeDocumentType]}
          preSales={preSales}
        />
      </div>
    </div>
  );
}
