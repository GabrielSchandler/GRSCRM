import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { Notificador } from "@/components/newsec/notificador";
import { iaAtendimentoLigada } from "@/lib/atendimento/ia/turno";
import packageJson from "../../../package.json";
import { UserPresenceHeartbeat } from "@/components/management/user-presence-heartbeat";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userProfileId, companyId, profileCompanyId, role, isPlatformOwner } = await getCurrentUserContext();

  return (
    <AuthenticatedShell
      sidebar={<AppSidebar />}
      footer={
        <div className="border-t border-[var(--ns-border)] bg-[var(--ns-surface)] px-6 py-3 text-xs text-[var(--ns-text-secondary)]">
          Versao {packageJson.version}
        </div>
      }
    >
      {children}
      <UserPresenceHeartbeat userProfileId={userProfileId} companyId={profileCompanyId} />
      {/* Aviso de mensagem nova (WhatsApp e chat interno) também nas telas do CRM antigo. */}
      <Notificador userProfileId={userProfileId} companyId={companyId} supervisiona={role === "admin" || role === "manager" || Boolean(isPlatformOwner)} iaLigada={iaAtendimentoLigada()} oferecerAvisoWindows />
    </AuthenticatedShell>
  );
}
