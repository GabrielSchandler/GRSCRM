"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Unlink, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { vincularClienteConversaAction } from "@/app/(newsec)/atendimento/actions";

type ClienteResumo = { id: string; full_name: string; cpf: string | null; phone_mobile: string | null };

function soDigitos(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

/** Telefone do contato (E.164 com 55) → como o cadastro de cliente guarda (DDD + número). */
function telefoneNoCadastro(e164: string | null) {
  const d = soDigitos(e164);
  return d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
}

function cpfMascarado(cpf: string | null) {
  const d = soDigitos(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.***-${d.slice(9)}` : "";
}

/**
 * Quadro "Cliente" no painel da conversa (01/10/2026): mostra o cadastro ligado; se não houver,
 * sugere o cliente com o mesmo celular, busca por nome/CPF/telefone e abre o cadastro do CRM já com
 * nome e celular preenchidos. Ligar vale pro contato inteiro (todas as conversas dele) — regra no banco.
 */
export function VinculoCliente({
  conversationId,
  companyId,
  clientId,
  nomeContato,
  telefoneContato,
  onAlterado,
}: {
  conversationId: string;
  companyId: string;
  clientId: string | null;
  nomeContato: string | null;
  telefoneContato: string | null;
  onAlterado: (mensagem: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [sugestao, setSugestao] = useState<ClienteResumo | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const telefone = telefoneNoCadastro(telefoneContato);

  useEffect(() => {
    let cancelado = false;
    setCliente(null);
    setSugestao(null);
    if (clientId) {
      supabase
        .from("clients")
        .select("id, full_name, cpf, phone_mobile")
        .eq("id", clientId)
        .maybeSingle()
        .then(({ data }) => !cancelado && setCliente((data as ClienteResumo) ?? null));
    } else if (telefone.length >= 10) {
      supabase
        .from("clients")
        .select("id, full_name, cpf, phone_mobile")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(`phone_mobile.eq.${telefone},phone_secondary.eq.${telefone}`)
        .limit(1)
        .then(({ data }) => !cancelado && setSugestao(((data ?? [])[0] as ClienteResumo) ?? null));
    }
    return () => {
      cancelado = true;
    };
  }, [supabase, clientId, companyId, telefone]);

  async function vincular(id: string | null) {
    if (id === null && !window.confirm("Desfazer a ligação desta conversa (e das outras deste contato) com o cadastro do cliente?")) return;
    setSalvando(true);
    const r = await vincularClienteConversaAction(conversationId, id);
    setSalvando(false);
    setBuscaAberta(false);
    onAlterado(r.message);
  }

  const linkCadastro = `/clientes/novo?${new URLSearchParams({
    ...(nomeContato ? { nome: nomeContato } : {}),
    ...(telefone ? { celular: telefone } : {}),
  }).toString()}`;

  return (
    <div className="mt-3 space-y-2 text-xs">
      {clientId ? (
        <div className="rounded-lg border border-[var(--ns-success)]/40 bg-[var(--ns-success)]/10 p-2.5">
          <p className="text-[11px] font-medium text-[var(--ns-success)]">Cliente cadastrado</p>
          <p className="truncate text-sm font-semibold text-[var(--ns-text)]">{cliente?.full_name ?? "Carregando..."}</p>
          {cliente?.cpf && <p className="text-[var(--ns-text-secondary)]">CPF {cpfMascarado(cliente.cpf)}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a href={`/clientes/${clientId}`} className="font-medium text-[var(--ns-primary)] hover:underline">
              Abrir cadastro →
            </a>
            <button type="button" disabled={salvando} onClick={() => vincular(null)} className="inline-flex items-center gap-1 text-[var(--ns-text-secondary)] hover:text-[var(--ns-danger)]">
              <Unlink aria-hidden="true" className="h-3 w-3" /> Desvincular
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--ns-warning)]/40 bg-[var(--ns-warning)]/10 p-2.5">
          <p className="text-[11px] font-medium text-[var(--ns-warning)]">Cadastro pendente</p>
          {sugestao && (
            <div className="mt-1.5 rounded-md bg-[var(--ns-surface)] p-2">
              <p className="text-[var(--ns-text-secondary)]">Já existe um cliente com este celular:</p>
              <p className="truncate font-semibold text-[var(--ns-text)]">{sugestao.full_name}</p>
              <button
                type="button"
                disabled={salvando}
                onClick={() => vincular(sugestao.id)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[var(--ns-primary)] px-2 py-1 font-medium text-[var(--ns-primary-foreground)] disabled:opacity-50"
              >
                <Link2 aria-hidden="true" className="h-3 w-3" /> Ligar a este cadastro
              </button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBuscaAberta(true)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] px-2 py-1 font-medium text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
            >
              <Search aria-hidden="true" className="h-3 w-3" /> Vincular cliente existente
            </button>
            <a
              href={linkCadastro}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--ns-border)] bg-[var(--ns-surface)] px-2 py-1 font-medium text-[var(--ns-text)] hover:bg-[var(--ns-surface-hover)]"
              title="Abre o cadastro do CRM numa aba nova, já com nome e celular. Depois de salvar, volte aqui: a conversa sugere ligar ao cadastro novo."
            >
              <UserPlus aria-hidden="true" className="h-3 w-3" /> Cadastrar cliente
            </a>
          </div>
        </div>
      )}

      {buscaAberta && (
        <ModalBuscaCliente companyId={companyId} salvando={salvando} onEscolher={vincular} onFechar={() => setBuscaAberta(false)} />
      )}
    </div>
  );
}

function ModalBuscaCliente({
  companyId,
  salvando,
  onEscolher,
  onFechar,
}: {
  companyId: string;
  salvando: boolean;
  onEscolher: (id: string) => void;
  onFechar: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteResumo[] | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 3) {
      setResultados(null);
      return;
    }
    let cancelado = false;
    const timer = window.setTimeout(async () => {
      const digitos = soDigitos(t);
      // Vírgula e parêntese quebram o filtro .or() do PostgREST — tira antes.
      const texto = t.replace(/[,()]/g, " ");
      const filtros = [`full_name.ilike.%${texto}%`];
      if (digitos.length >= 3) filtros.push(`cpf.ilike.%${digitos}%`, `phone_mobile.ilike.%${digitos}%`);
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, cpf, phone_mobile")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(filtros.join(","))
        .order("full_name")
        .limit(20);
      if (!cancelado) setResultados((data ?? []) as ClienteResumo[]);
    }, 300);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [termo, supabase, companyId]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-[var(--ns-border)] bg-[var(--ns-surface)] shadow-xl sm:max-w-md sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--ns-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--ns-text)]">Vincular cliente</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1 text-[var(--ns-text-secondary)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3">
          <input
            autoFocus
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome, CPF ou celular"
            className="w-full rounded-lg border border-[var(--ns-border)] bg-[var(--ns-surface)] px-3 py-2 text-base text-[var(--ns-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ns-primary)] md:text-sm"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {resultados === null && <li className="px-2 py-2 text-xs text-[var(--ns-text-secondary)]">Digite pelo menos 3 letras ou números.</li>}
          {resultados?.length === 0 && <li className="px-2 py-2 text-xs text-[var(--ns-text-secondary)]">Nenhum cliente encontrado.</li>}
          {resultados?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={salvando}
                onClick={() => onEscolher(c.id)}
                className="block w-full rounded-lg px-2 py-2 text-left hover:bg-[var(--ns-surface-hover)] disabled:opacity-50"
              >
                <span className="block truncate text-sm font-medium text-[var(--ns-text)]">{c.full_name}</span>
                <span className="block text-[11px] text-[var(--ns-text-secondary)]">
                  {[cpfMascarado(c.cpf) && `CPF ${cpfMascarado(c.cpf)}`, c.phone_mobile].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
