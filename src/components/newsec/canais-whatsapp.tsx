"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, QrCode, RefreshCw, Smartphone, Unplug, X } from "lucide-react";
import {
  criarCanalAction,
  desconectarCanalAction,
  listarCanaisAction,
  qrCodeAction,
  statusCanalAction,
  type CanalWhatsapp,
} from "@/app/(newsec)/atendimento/canais/actions";

const ROTULO_ESTADO: Record<CanalWhatsapp["estado"], string> = {
  conectado: "Conectado",
  conectando: "Conectando...",
  desconectado: "Desconectado",
  historico: "Só histórico (Totalk)",
};

/** Tela "Números de WhatsApp": conectar número novo por QR Code e ver a situação de cada canal. */
export function CanaisWhatsapp() {
  const [canais, setCanais] = useState<CanalWhatsapp[] | null>(null);
  const [configurado, setConfigurado] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [conectando, setConectando] = useState<{ canalId: string; qrCode: string | null; estado: string; numero?: string | null } | null>(null);
  const [novo, setNovo] = useState<{ nome: string; area: "commercial" | "legal" } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await listarCanaisAction();
    if (!r.ok) return setErro(r.mensagem);
    setCanais(r.dados.canais);
    setConfigurado(r.dados.configurado);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto o QR está na tela: confere a cada 3 s se conectou, e renova o QR a cada 30 s (ele expira).
  useEffect(() => {
    if (!conectando || conectando.estado === "conectado") return;
    const canalId = conectando.canalId;
    const status = window.setInterval(async () => {
      const r = await statusCanalAction(canalId);
      if (r.ok && r.dados.estado === "conectado") {
        setConectando((atual) => (atual?.canalId === canalId ? { ...atual, estado: "conectado", numero: r.dados.numero } : atual));
        void carregar();
      }
    }, 3000);
    const renovar = window.setInterval(async () => {
      const r = await qrCodeAction(canalId);
      if (r.ok && r.dados.qrCode) setConectando((atual) => (atual?.canalId === canalId ? { ...atual, qrCode: r.dados.qrCode } : atual));
    }, 30000);
    return () => {
      window.clearInterval(status);
      window.clearInterval(renovar);
    };
  }, [conectando, carregar]);

  async function criar() {
    if (!novo) return;
    setSalvando(true);
    setErro(null);
    const r = await criarCanalAction(novo.nome, novo.area);
    setSalvando(false);
    if (!r.ok) return setErro(r.mensagem);
    setNovo(null);
    setConectando({ canalId: r.dados.canalId, qrCode: r.dados.qrCode, estado: "conectando" });
    void carregar();
  }

  async function reconectar(canalId: string) {
    setErro(null);
    const r = await qrCodeAction(canalId);
    if (!r.ok) return setErro(r.mensagem);
    setConectando({ canalId, qrCode: r.dados.qrCode, estado: r.dados.estado });
  }

  async function desconectar(canal: CanalWhatsapp) {
    if (!window.confirm(`Desconectar ${canal.nome} do CRM? As mensagens desse número param de chegar aqui até conectar de novo.`)) return;
    const r = await desconectarCanalAction(canal.id);
    if (!r.ok) return setErro(r.mensagem);
    void carregar();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ns-text)]">Números de WhatsApp</h1>
          <p className="text-sm text-[var(--ns-text-secondary)]">Conecte um número lendo o QR Code no celular, igual ao WhatsApp Web.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ns-border)] px-3 py-2 text-sm text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]">
            <RefreshCw aria-hidden="true" className="h-4 w-4" /> Atualizar
          </button>
          <button
            type="button"
            disabled={!configurado}
            onClick={() => setNovo({ nome: "", area: "commercial" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--ns-primary)] px-3 py-2 text-sm font-medium text-[var(--ns-primary-foreground)] disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="h-4 w-4" /> Conectar número
          </button>
        </div>
      </div>

      {!configurado && (
        <p className="rounded-lg border border-[var(--ns-warning)]/40 bg-[var(--ns-warning)]/10 p-3 text-sm text-[var(--ns-text)]">
          O servidor ainda não está configurado para o WhatsApp. Falta cadastrar na Vercel as variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY e ATENDIMENTO_WEBHOOK_SEGREDO.
        </p>
      )}
      {erro && <p className="rounded-lg border border-[var(--ns-danger)]/40 bg-[var(--ns-danger)]/10 p-3 text-sm text-[var(--ns-danger)]">{erro}</p>}

      <ul className="divide-y divide-[var(--ns-border)] rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)]">
        {canais === null && <li className="p-4 text-sm text-[var(--ns-text-secondary)]">Carregando...</li>}
        {canais?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <Smartphone aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--ns-text-secondary)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--ns-text)]">{c.nome}</p>
              <p className="text-xs text-[var(--ns-text-secondary)]">{c.area === "legal" ? "Jurídico" : "Comercial"}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                c.estado === "conectado"
                  ? "bg-[var(--ns-success)]/15 text-[var(--ns-success)]"
                  : c.estado === "historico"
                    ? "bg-[var(--ns-surface-hover)] text-[var(--ns-text-secondary)]"
                    : "bg-[var(--ns-warning)]/15 text-[var(--ns-warning)]"
              }`}
            >
              {ROTULO_ESTADO[c.estado]}
            </span>
            {c.provedor === "evolution" && c.estado !== "conectado" && (
              <button type="button" onClick={() => void reconectar(c.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--ns-border)] px-2.5 py-1.5 text-xs text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]">
                <QrCode aria-hidden="true" className="h-3.5 w-3.5" /> Ler QR Code
              </button>
            )}
            {c.provedor === "evolution" && c.estado === "conectado" && (
              <button type="button" onClick={() => void desconectar(c)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--ns-border)] px-2.5 py-1.5 text-xs text-[var(--ns-danger)] hover:bg-[var(--ns-danger)]/10">
                <Unplug aria-hidden="true" className="h-3.5 w-3.5" /> Desconectar
              </button>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-[var(--ns-text-secondary)]">
        Os canais “Só histórico” guardam as conversas importadas do Totalk. Os números atuais da empresa só são trocados para o CRM no dia combinado — o histórico de cada cliente continua no mesmo lugar.
      </p>

      {novo && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && setNovo(null)}>
          <div className="w-full space-y-3 rounded-t-2xl border border-[var(--ns-border)] bg-[var(--ns-surface)] p-4 shadow-xl sm:max-w-sm sm:rounded-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ns-text)]">Conectar número</h2>
              <button type="button" onClick={() => setNovo(null)} aria-label="Fechar" className="p-1 text-[var(--ns-text-secondary)]">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <label className="block text-xs font-medium text-[var(--ns-text-secondary)]">
              Nome (aparece no atendimento; depois de conectar vira o número)
              <input
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Ex.: WhatsApp de teste"
                className="mt-1 w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] md:text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--ns-text-secondary)]">
              Área
              <select
                value={novo.area}
                onChange={(e) => setNovo({ ...novo, area: e.target.value as "commercial" | "legal" })}
                className="mt-1 w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] md:text-sm"
              >
                <option value="commercial">Comercial</option>
                <option value="legal">Jurídico</option>
              </select>
            </label>
            <button
              type="button"
              disabled={salvando}
              onClick={() => void criar()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ns-primary)] px-3 py-2 text-sm font-medium text-[var(--ns-primary-foreground)] disabled:opacity-50"
            >
              {salvando && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />} Gerar QR Code
            </button>
          </div>
        </div>
      )}

      {conectando && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-xl border border-[var(--ns-border)] bg-[var(--ns-surface)] p-5 text-center shadow-xl">
            {conectando.estado === "conectado" ? (
              <>
                <CheckCircle2 aria-hidden="true" className="mx-auto h-12 w-12 text-[var(--ns-success)]" />
                <p className="text-base font-semibold text-[var(--ns-text)]">Número conectado!</p>
                <p className="text-sm text-[var(--ns-text-secondary)]">
                  {conectando.numero ? `+${conectando.numero} ` : ""}já recebe e envia mensagens pela tela de atendimento.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[var(--ns-text)]">Leia o QR Code no celular</p>
                <p className="text-xs text-[var(--ns-text-secondary)]">WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho</p>
                {conectando.qrCode ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR Code em data: gerado pela Evolution
                  <img src={conectando.qrCode} alt="QR Code para conectar o WhatsApp" className="mx-auto h-64 w-64 rounded-lg bg-white p-2" />
                ) : (
                  <p className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--ns-text-secondary)]">
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Gerando QR Code...
                  </p>
                )}
                <p className="text-[11px] text-[var(--ns-text-secondary)]">O QR muda sozinho a cada 30 s. Esta janela fecha quando conectar.</p>
              </>
            )}
            <button type="button" onClick={() => setConectando(null)} className="w-full rounded-lg border border-[var(--ns-border)] px-3 py-2 text-sm text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]">
              {conectando.estado === "conectado" ? "Fechar" : "Cancelar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
