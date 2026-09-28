# Integracoes externas do GRSCRM

## Regras gerais

- Nunca registre valores reais de token, chave, senha ou client secret.
- Toda chamada deve partir do servidor quando envolver credencial privada.
- Configuracao por empresa deve ser escopada pelo `companyId` autorizado.
- Tokens persistidos devem permanecer criptografados.
- Nao marque operacao como concluida antes de confirmar a resposta externa.
- Erros apresentados ao usuario devem ser acionaveis sem revelar payloads
  sensiveis.
- Estado das credenciais e dos provedores em cada ambiente e **A CONFIRMAR**.

## Supabase

**Nome:** Supabase Auth, PostgreSQL/PostgREST e Storage.

**Objetivo:** identidade, sessao, banco multiempresa, RLS, RPCs e arquivos.

**Fluxo:** browser/servidor usam anon key e cookies; operacoes privilegiadas usam
service role somente no servidor. Arquivos privados sao acessados por URLs
assinadas.

**Onde esta implementada:**

- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `src/lib/supabase/admin.ts`
- `docs/sql/`

**Autenticacao:**

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor.

**Dados recebidos:** sessao, linhas PostgREST, resultados RPC e arquivos.

**Dados enviados:** credenciais de login, CRUD operacional, uploads e RPCs.

**Limitacoes:** schema remoto nao e versionado automaticamente; service role
ignora RLS; limites do plano/runtime sao externos ao repositorio.

**Problemas conhecidos:** paridade entre `docs/sql/` e ambientes e
**A CONFIRMAR**.

**Cuidados:** nunca importar `admin.ts` em Client Component; validar tenant
manualmente com service role; manter buckets privados.

**Estado atual:** integracao central e ativa no codigo; ambiente remoto
**A CONFIRMAR**.

## Microsoft Outlook / Graph

**Nome:** Microsoft Identity Platform e Microsoft Graph.

**Objetivo:** conectar a conta Outlook do usuario juridico, criar rascunhos ou
enviar emails com templates e anexos.

**Fluxo:**

1. rota de conexao gera `state` e cookie seguro;
2. usuario autoriza na Microsoft;
3. callback valida `state` e troca `code` por tokens;
4. perfil `/me` identifica a conta;
5. access/refresh tokens sao criptografados em `email_integrations`;
6. token e renovado quando necessario;
7. Graph cria mensagem em `/me/messages` ou envia por `/me/sendMail`;
8. resultado e registrado em `email_logs` e auditoria.

**Onde esta implementada:**

- `src/lib/email/microsoft.ts`
- `src/lib/email/integrations.ts`
- `src/lib/email/crypto.ts`
- `src/components/email/`
- `src/app/(authenticated)/integracoes/outlook/`
- `src/app/api/integracoes/outlook/callback/route.ts`
- `docs/sql/email-outlook-juridico.sql`

**Autenticacao:** OAuth 2.0 Authorization Code. Variaveis:

- `MICROSOFT_TENANT_ID`;
- `MICROSOFT_CLIENT_ID`;
- `MICROSOFT_CLIENT_SECRET`;
- `MICROSOFT_REDIRECT_URI`;
- `EMAIL_TOKEN_ENCRYPTION_KEY`.

Scopes confirmados: `openid`, `profile`, `User.Read`, `offline_access`,
`Mail.Send`, `Mail.ReadWrite`.

**Dados recebidos:** perfil da conta, access/refresh token, expiracao e ID de
mensagem.

**Dados enviados:** destinatarios, assunto, HTML e anexos em base64.

**Limitacoes:** depende de consentimento e configuracao do app Microsoft;
anexos/limites seguem Graph; nao ha webhook de entrega confirmado.

**Problemas conhecidos:** `.env.example` nao lista as variaveis; configuracao
dos ambientes e **A CONFIRMAR**.

**Cuidados:** nao logar tokens; manter `state`; nao reutilizar chave de
criptografia de forma inconsistente; preservar refresh token quando a Microsoft
nao enviar um novo.

**Estado atual:** implementada no codigo; conexoes reais **A CONFIRMAR**.

## Google Sheets

**Nome:** exportacao CSV publica do Google Sheets.

**Objetivo:** importar leads de planilhas e distribui-los para consultores.

**Fluxo:** Gestao cadastra URL, aba/GID, linha inicial e colunas. O servidor
extrai spreadsheet ID, chama o endpoint `/export?format=csv`, interpreta CSV,
normaliza dados e persiste leads deduplicados por linha de origem.

**Onde esta implementada:**

- `src/lib/leads/google-sheets.ts`
- `src/app/(authenticated)/integracoes/leads/`
- `src/app/(authenticated)/leads/`
- `docs/sql/leads-google-sheets.sql`

**Autenticacao:** nao ha OAuth/API key. A planilha precisa permitir visualizacao
por link ou estar publicada.

**Dados recebidos:** nome, telefone, email, CPF, campanha, observacoes e colunas
brutas da linha.

**Dados enviados:** requisicao GET com spreadsheet ID/GID; nenhum dado do CRM e
enviado a planilha.

**Limitacoes:** somente planilhas acessiveis sem login; CSV e mapeamento por
cabecalho/coluna; mudancas de coluna podem quebrar importacao.

**Problemas conhecidos:** nao ha sincronizacao push nem autenticacao privada.

**Cuidados:** validar URL; tratar resposta HTML como erro de permissao;
normalizar CPF/telefone; manter dedupe; nao expor toda `raw_data` desnecessariamente.

**Estado atual:** implementada.

## ToTalk

**Nome:** API ToTalk Chat.

**Objetivo:** localizar contato por telefone, ler anotacao estruturada para
preencher uma simulacao e enviar documento da simulacao pelo canal configurado.

**Fluxo:**

1. admin/manager salva URL base, token, telefone remetente e mensagem;
2. token e criptografado em `totalk_integrations`;
3. simulacao consulta contato por telefone;
4. parser converte anotacoes `rotulo: valor` em campos, alertas e faltantes;
5. usuario revisa os dados antes de salvar;
6. envio usa URL assinada do arquivo e endpoint de documento.

**Onde esta implementada:**

- `src/lib/totalk/api.ts`
- `src/lib/totalk/integrations.ts`
- `src/lib/totalk/parser.ts`
- `src/components/calculations/totalk-calculation-import-panel.tsx`
- `src/app/(authenticated)/integracoes/page.tsx`
- `docs/sql/totalk-integracao.sql`

**Autenticacao:** Bearer token por empresa, criptografado com a mesma rotina
AES-256-GCM de `EMAIL_TOKEN_ENCRYPTION_KEY`.

**Dados recebidos:** nome do contato, anotacao e resposta bruta da API.

**Dados enviados:** telefone pesquisado; no envio, remetente/destinatario, URL
do arquivo, texto e ID do usuario remetente.

**Limitacoes:** parser depende de rotulos textuais; formatos nao reconhecidos
geram campos faltantes; API base padrao e `https://api.app.totalk.chat`.

**Problemas conhecidos:** contrato oficial/versionamento da API e limites sao
**A CONFIRMAR**. Erros atuais podem incluir corpo retornado pelo provedor;
evitar propaga-los a logs publicos.

**Cuidados:** normalizar telefone brasileiro; revisar importacao antes de
persistir; URL do documento deve expirar; nunca mostrar token salvo.

**Estado atual:** implementada; configuracao real por empresa **A CONFIRMAR**.

## ViaCEP

**Nome:** ViaCEP.

**Objetivo:** preencher endereco ao informar CEP no formulario de cliente.

**Fluxo:** componente client chama `https://viacep.com.br/ws/<cep>/json/` e
preenche campos quando a resposta e valida.

**Onde esta implementada:** `src/components/clients/client-form.tsx`.

**Autenticacao:** nenhuma.

**Dados recebidos:** logradouro, bairro, cidade, UF e indicador de erro.

**Dados enviados:** CEP.

**Limitacoes:** disponibilidade externa e cobertura brasileira; chamada ocorre
no navegador.

**Problemas conhecidos:** nao ha proxy/cache/retry confirmado.

**Cuidados:** manter edicao manual e tratar indisponibilidade sem bloquear o
cadastro.

**Estado atual:** implementada.

## LibreOffice

**Nome:** LibreOffice headless local.

**Objetivo:** converter DOCX gerado para PDF.

**Fluxo:** o servidor escreve DOCX em diretorio temporario, executa
`libreoffice --headless --convert-to pdf`, le o PDF e remove os temporarios.

**Onde esta implementada:** `src/lib/documents/pdf-converter.ts` e fluxo de
geracao de documentos.

**Autenticacao:** nenhuma. Binario por `LIBREOFFICE_PATH` ou comando
`libreoffice` no PATH.

**Dados recebidos/enviados:** arquivos locais temporarios; nao e servico de rede.

**Limitacoes:** depende do binario/fontes no runtime, tempo de processo e
fidelidade da renderizacao.

**Problemas conhecidos:** disponibilidade no ambiente Vercel/deploy e
**A CONFIRMAR**. Em falha, DOCX pode existir com PDF pendente/erro.

**Cuidados:** nomes seguros, cleanup em `finally`, timeout/recursos e teste
visual de documentos reais.

**Estado atual:** implementada no codigo; runtime externo **A CONFIRMAR**.

## RD Station CRM

**Nome:** RD Station CRM e importacao legada RD.

**Objetivo:** importar historico/dados anteriores para o modelo atual.

**Fluxo:** scripts Node leem parametros/ambiente, consultam API ou fonte legada,
normalizam registros e persistem com service role. Sao ferramentas operacionais,
nao fluxo cotidiano da UI.

**Onde esta implementada:**

- `scripts/import-rd-crm-activities.mjs`
- `scripts/import-legacy-rd.mjs`
- `docs/sql/importacao-legacy-rd.sql`
- comandos `npm run import:rd-crm-activities` e `npm run import:legacy-rd`.

**Autenticacao:** `RD_CRM_TOKEN` para API e credenciais Supabase server-side.

**Dados recebidos:** atividades e dados legados do CRM.

**Dados enviados:** registros normalizados ao Supabase.

**Limitacoes:** scripts podem ser volumosos e dependem de IDs/mapeamento; devem
ser executados de forma controlada.

**Problemas conhecidos:** estado das tabelas auxiliares e uso recente sao
**A CONFIRMAR**.

**Cuidados:** dry-run quando suportado, backup, tenant correto, idempotencia,
paginação e nunca executar contra producao sem autorizacao.

**Estado atual:** codigo disponivel; necessidade/ultima execucao **A CONFIRMAR**.

## GitHub Actions e Releases

**Nome:** GitHub Actions, CLI `gh` e Releases privadas do repositorio.

**Objetivo:** gerar backup completo diario, publicar ZIP em Release e remover
backups externos com mais de sete dias.

**Fluxo:** workflow agenda 03:10 UTC, instala Node 22, gera pacote, publica
Release, registra `backup_jobs` e limpa releases antigas.

**Onde esta implementada:**

- `.github/workflows/backup.yml`
- `scripts/generate-stored-backup.mjs`
- `scripts/register-external-backup.mjs`
- `src/lib/backups/`

**Autenticacao:** secrets do GitHub para Supabase; `GITHUB_TOKEN` da action para
Releases.

**Dados recebidos:** tabelas e arquivos privados da empresa.

**Dados enviados:** ZIP completo e metadados da execucao.

**Limitacoes:** workflow atual possui `company-id` e `created-by` fixos; nao e
backup automatico de todas as empresas.

**Problemas conhecidos:** intencao multiempresa da rotina e **A CONFIRMAR**.

**Cuidados:** Release deve permanecer privada; backup contem dados pessoais;
nao alterar IDs sem decidir a estrategia; testar restauracao separadamente.

**Estado atual:** implementada; execucoes/repository visibility **A CONFIRMAR**.

## Vercel

**Nome:** Vercel hosting/functions.

**Objetivo:** hospedar o Next.js e executar Route Handlers.

**Fluxo:** build/deploy externo ao repositorio. `vercel.json` configura APIs de
backup com 300 segundos e 1024 MB.

**Onde esta implementada:** `vercel.json`, `next.config.ts` e convencoes Next.

**Autenticacao:** configuracao e env vars no projeto Vercel, fora do Git.

**Dados recebidos/enviados:** requisicoes web e chamadas a Supabase/provedores.

**Limitacoes:** runtime efemero; limites do plano; binarios de sistema como
LibreOffice podem nao existir.

**Problemas conhecidos:** projeto, dominio, crons e deploy atual **A CONFIRMAR**.

**Cuidados:** nao depender de disco persistente; manter secrets no provedor;
validar duracao das funcoes e CSP apos adicionar dominios.

**Estado atual:** configuracao compativel com Vercel; ambiente **A CONFIRMAR**.

## WhatsApp por deep link

**Nome:** `wa.me`.

**Objetivo:** abrir conversa com telefone do cliente.

**Fluxo:** `src/lib/clients/masks.ts` normaliza numero e monta URL com DDI 55.

**Autenticacao:** nenhuma; nao ha API oficial/automacao de mensagens aqui.

**Dados enviados:** telefone na URL quando o usuario abre o link.

**Limitacoes:** depende do WhatsApp do usuario; nao registra entrega.

**Cuidados:** nao descrever isso como integracao de envio automatizado.

**Estado atual:** utilitario implementado.

## Nao implementado: OnlyOffice

Ha diretorios locais vazios sob `src/app/api/onlyoffice/`, mas nenhum arquivo
rastreado, dependencia, handler ou configuracao confirmada. Nao documentar nem
tratar OnlyOffice como integracao existente. Se for retomado, deve nascer de
requisito explicito, analise de seguranca e novo desenho de callback/token.

## Variaveis de ambiente confirmadas pelo codigo

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MICROSOFT_TENANT_ID
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_REDIRECT_URI
EMAIL_TOKEN_ENCRYPTION_KEY
CRON_SECRET
PUBLIC_TRACKING_RATE_LIMIT_SECRET (opcional; fallback atual para service role)
LIBREOFFICE_PATH (opcional se o binario estiver no PATH)
RD_CRM_TOKEN
```

Esta lista contem nomes, nunca valores. `.env.example` ainda nao reflete todos
eles.

## Checklist ao alterar integracao

1. Confirmar contrato/API oficial e ambiente.
2. Identificar credenciais e seu escopo por usuario/empresa.
3. Preservar criptografia e server-only.
4. Validar timeout, retry, idempotencia e rate limit.
5. Definir comportamento de falha sem perder dados.
6. Sanitizar logs e mensagens.
7. Revisar CSP se novo dominio for acessado pelo browser.
8. Testar tenant diferente e papel sem permissao.
9. Atualizar `.env.example` apenas com placeholders.
10. Atualizar este documento e `AGENTS.md` se o estado mudar.
