import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/newsec/top-bar";
import { AtendimentoWorkspaceReal } from "@/components/newsec/atendimento-workspace-real";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Atendimento · GRS",
};

export default async function AtendimentoPage() {
  const { userProfileId, companyId, role, isPlatformOwner, activeCompany } = await getCurrentUserContext();

  // Acesso restrito ao master (is_platform_owner) por decisão do Gabriel (29/09/2026):
  // ele confere a tela primeiro, sozinho, com o histórico real do Totalk já importado;
  // só depois libera pro resto da equipe. Trava no servidor, não só link escondido no
  // menu — digitar /atendimento direto na URL sem ser master também é barrado.
  // Remover este bloco quando a tela for liberada geral.
  if (!isPlatformOwner) {
    redirect("/dashboard");
  }

  const companyName = activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Empresa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Sem o link "Supervisão" aqui de propósito — essa tela ainda usa dado
        sintético (herdado do newseccrm) e não deve aparecer em produção até
        ganhar dado real. Ver AGENTS.md: "todo dado exibido tem de ser real".
      */}
      <TopBar companyName={companyName} />
      <div className="min-h-0 flex-1">
        <AtendimentoWorkspaceReal
          companyId={companyId}
          userProfileId={userProfileId}
          isAdminOuManager={role === "admin" || role === "manager"}
          isPlatformOwner={Boolean(isPlatformOwner)}
        />
      </div>
    </div>
  );
}
