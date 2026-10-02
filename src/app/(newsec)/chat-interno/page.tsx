import type { Metadata } from "next";
import { TopBar } from "@/components/newsec/top-bar";
import { ChatInternoWorkspace } from "@/components/newsec/chat-interno-workspace";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Chat interno · GRS",
};

// Conversa entre funcionários. Desde 01/10/2026 está no menu do CRM para todos os usuários.
// Quem lê o quê é decidido pelo banco (RLS, 0010); grupo só supervisor altera (0012).
export default async function ChatInternoPage() {
  const { userProfileId, activeCompany, role, isPlatformOwner } = await getCurrentUserContext();
  // Grupo: só supervisor (gerente/administrador) ou o master cria e altera — regra garantida no banco (0012).
  const podeGerenciarGrupos = role === "admin" || role === "manager" || Boolean(isPlatformOwner);
  const companyName = activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Empresa";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar companyName={companyName} />
      <div className="min-h-0 flex-1">
        <ChatInternoWorkspace userProfileId={userProfileId} podeGerenciarGrupos={podeGerenciarGrupos} />
      </div>
    </div>
  );
}
