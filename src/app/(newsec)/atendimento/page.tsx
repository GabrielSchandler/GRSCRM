import type { Metadata } from "next";
import { TopBar } from "@/components/newsec/top-bar";
import { AtendimentoWorkspaceReal } from "@/components/newsec/atendimento-workspace-real";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Atendimento · GRS",
};

export default async function AtendimentoPage() {
  const { userProfileId, companyId, role, isPlatformOwner, activeCompany, businessArea } = await getCurrentUserContext();

  // Liberada pra todos os logins em 30/09/2026 e, desde 01/10/2026, no menu do CRM para todos. Desde a 0013 (02/10/2026):
  // todos LEEM qualquer conversa da empresa (pela busca); Jurídico escreve em todas; Comercial só nas dele — quem
  // garante é o banco (RLS); a tela só esconde o campo de escrever.

  const companyName = activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Empresa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Sem o link "Supervisão" aqui de propósito — essa tela ainda usa dado
        sintético (herdado do newseccrm) e não deve aparecer em produção até
        ganhar dado real. Ver AGENTS.md: "todo dado exibido tem de ser real".
      */}
      <TopBar
        companyName={companyName}
        links={role === "admin" || isPlatformOwner ? [{ href: "/atendimento/canais", label: "Números de WhatsApp" }] : []}
      />
      <div className="min-h-0 flex-1">
        <AtendimentoWorkspaceReal
          companyId={companyId}
          userProfileId={userProfileId}
          isAdminOuManager={role === "admin" || role === "manager"}
          isPlatformOwner={Boolean(isPlatformOwner)}
          areaJuridica={businessArea === "legal"}
        />
      </div>
    </div>
  );
}
