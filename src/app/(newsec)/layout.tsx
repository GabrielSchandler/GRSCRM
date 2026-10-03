import { ThemeScript } from "@/components/newsec/theme-script";
import { BarraLateral } from "@/components/newsec/barra-lateral";
import { Notificador } from "@/components/newsec/notificador";
import { iaAtendimentoLigada } from "@/lib/atendimento/ia/turno";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export default async function NewSecLayout({ children }: { children: React.ReactNode }) {
  // Pro avisador de mensagens (som/aviso/título) — roda em todas as telas do shell novo.
  const { userProfileId, companyId, role, isPlatformOwner } = await getCurrentUserContext();

  return (
    <div
      id="ns-shell-root"
      className="ns-shell fixed inset-0 flex overflow-hidden"
      // O script inline em ThemeScript grava data-theme diretamente no DOM
      // antes da hidratacao (evita flash de tema); isso e uma mutacao fora
      // do controle do React nesse elemento especifico, entao o React nao
      // deve tentar reconciliar esse atributo.
      suppressHydrationWarning
    >
      <ThemeScript />

      {/* Computador: só ícones, abre ao passar o mouse. No celular vira gaveta (MenuMobile, na barra do topo). */}
      <BarraLateral />

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--ns-bg)]">{children}</div>
      <Notificador userProfileId={userProfileId} companyId={companyId} supervisiona={role === "admin" || role === "manager" || Boolean(isPlatformOwner)} iaLigada={iaAtendimentoLigada()} />
    </div>
  );
}
