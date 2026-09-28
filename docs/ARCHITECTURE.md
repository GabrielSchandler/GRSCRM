# Arquitetura do GRSCRM

## Objetivo deste documento

Explicar a implementacao tecnica atual para que uma alteracao seja feita no
lugar correto, preservando autorizacao, multiempresa e regras de negocio. O
codigo e a fonte da verdade. Estado de servicos externos e banco remoto deve ser
marcado como **A CONFIRMAR**.

## Visao arquitetural

O GRSCRM e uma aplicacao monolitica modular em Next.js App Router. O mesmo
repositorio entrega interface, renderizacao no servidor, Server Actions, Route
Handlers e integracoes. O backend persistente e Supabase:

```text
Browser
  -> Middleware Next.js (sessao e redirecionamentos)
  -> Server Components / Client Components
  -> Server Actions ou Route Handlers
  -> Supabase Auth + PostgreSQL/PostgREST + Storage
  -> servicos externos (Graph, Sheets, ToTalk, ViaCEP, LibreOffice etc.)
```

Nao existe backend separado, ORM ou fila dedicada confirmada. Consultas usam o
cliente Supabase diretamente e tipos de dominio manuais.

## Camadas

### Rotas e composicao

- `src/app/(public)/login/`: autenticacao.
- `src/app/(authenticated)/`: areas do produto sob layout autenticado.
- `src/app/acompanhamento/`: portal publico por CPF e protocolo.
- `src/app/api/`: APIs de backup e callback Outlook.
- `src/app/actions/auth.ts`: acoes globais de autenticacao.
- `src/app/(authenticated)/**/actions.ts`: mutacoes co-localizadas por modulo.
- `src/app/layout.tsx`: layout raiz.
- `src/app/(authenticated)/layout.tsx`: shell, sidebar e versao.

Route groups entre parenteses nao fazem parte da URL.

### Apresentacao

- `src/components/layout/`: shell, sidebar, cabecalhos e navegacao.
- `src/components/<dominio>/`: formulários, listas, kanbans, paineis e modais.
- `src/app/globals.css`: reset minimo e cores globais; o restante usa Tailwind.

Componentes de servidor devem carregar contexto/dados quando possivel.
Componentes com `"use client"` ficam restritos a formularios, estado, drag and
drop, transicoes e APIs do navegador.

### Dominio e servicos

- `src/lib/auth/`: contexto do usuario e autorizacao.
- `src/lib/supabase/`: clientes browser, servidor, middleware e admin.
- `src/lib/<dominio>/`: schemas, calculos, formatadores e acesso especializado.
- `src/types/`: contratos TypeScript de dominio.

Os tipos nao sao gerados do schema; podem ficar desalinhados do banco remoto.
Antes de adicionar campo, confirme codigo, SQL e ambiente alvo.

### Persistencia

Supabase fornece:

- Auth para identidade e sessao;
- PostgreSQL/PostgREST para dados;
- RLS para isolamento e papeis;
- Storage privado para documentos, anexos e relatorios;
- RPCs para operacoes atomicas, como rate limit publico.

Nao ha pasta `supabase/migrations`. Os scripts manuais vivem em `docs/sql/`.

## Fluxo de requisicao autenticada

1. `middleware.ts` chama `src/lib/supabase/middleware.ts`.
2. O middleware renova cookies da sessao com `@supabase/ssr` e `auth.getUser()`.
3. Rotas protegidas sem sessao redirecionam para `/login`.
4. Perfis com `password_must_change` sao enviados a `/alterar-senha`.
5. Seller e redirecionado para sua area; caminhos compartilhados continuam
   disponiveis conforme regra atual.
6. Platform owner precisa selecionar empresa em `/empresas`; o cookie
   `grscrm-active-company` e validado contra `companies`.
7. O layout autenticado chama `getCurrentUserContext()` novamente. Isso protege
   paginas do route group mesmo quando uma URL nao consta da lista explicita do
   middleware.
8. Paginas e actions derivam `companyId` e `userProfileId` desse contexto.
9. Consultas normais passam pelo cliente SSR e RLS; operacoes administrativas
   devem validar ownership antes de usar service role.

Arquivos centrais:

- `middleware.ts`
- `src/lib/supabase/middleware.ts`
- `src/lib/auth/current-user.ts`
- `src/lib/workspace.ts`
- `src/app/(authenticated)/layout.tsx`

## Autenticacao e autorizacao

### Identidade

`auth.users` e a fonte de identidade. `public.user_profiles.auth_user_id` liga a
identidade ao perfil de negocio. Senhas nunca devem ser copiadas para tabelas
publicas.

### Papeis

- `admin`: administracao da empresa e operacao.
- `manager`: gestao operacional, com privilegios definidos pelas actions/RLS.
- `seller`: consultor limitado a area comercial ou juridica.
- `is_platform_owner`: papel adicional para operacao SaaS cross-tenant.
- `legal_role`: `admin` ou `consultant` dentro do Juridico.
- `can_edit_legal_workflow`: capacidade explicita; admin tambem pode editar.

Autorizacao nao fica somente na sidebar. Deve existir no servidor e, quando
aplicavel, em RLS.

### Workspaces

`src/lib/workspace.ts` define:

- Gestao (`management`);
- Comercial (`commercial`);
- Juridico (`legal`);
- Financeiro (`finance`);
- Academy (`academy`).

O cookie `grscrm-workspace` guarda preferencia visual. Ele nao e autorizacao.
Páginas compartilhadas (`/clientes`, `/pre-vendas`, `/documentos`) podem ser
usadas por Comercial e Juridico conforme contexto.

### Modulos por empresa

`company_platform_settings` liga/desliga modulos. A lista canonica esta em
`src/lib/company/platform-settings.ts`. Se a tabela estiver ausente, o codigo
usa defaults habilitados e informa `tableReady: false`; isso e compatibilidade,
nao prova de que o schema esta correto.

## Multiempresa

### Regra base

Toda entidade operacional deve ser escopada por `company_id` direto ou pelo pai.
O `companyId` autorizado vem de `getCurrentUserContext()`:

- usuario comum: `profile.company_id`;
- platform owner: empresa ativa selecionada e validada;
- nunca: parametro livre enviado pelo navegador.

### Service role

`src/lib/supabase/admin.ts` cria um cliente que ignora RLS. Ele e necessario em
administracao de Auth, portal publico, backups e algumas integracoes. Toda funcao
que o utiliza deve:

1. autenticar quando o fluxo nao e publico;
2. verificar papel/capacidade;
3. obter o tenant do contexto confiavel;
4. filtrar por tenant e validar o registro pai;
5. limitar campos retornados;
6. nao expor erros ou secrets.

## Modulos e dependencias

### Gestao

Rotas principais: `/dashboard`, `/aprovacoes`, `/usuarios`, `/empresa`,
`/empresas`, `/logs`, `/backups`, `/contratos`, `/integracoes`, templates e
gestao da Academy.

Depende de perfis, empresa, configuracao de modulos, logs e dados agregados dos
outros modulos. A fila de aprovacao depende de clientes, pre-vendas,
acompanhamentos e documentos.

### Comercial

Rotas principais: `/comercial`, `/leads`, `/clientes`, `/pre-vendas`,
`/calculos`, `/documentos`.

Fluxo usual:

```text
Google Sheets/entrada manual
  -> lead
  -> distribuicao para consultor
  -> cliente
  -> pre-venda
  -> simulacao/documentos
  -> aprovado/perdido/inativo/distrato
  -> juridico quando aplicavel
```

Cliente e contratante nao devem ser confundidos com o financiado armazenado na
pre-venda. A busca consulta ambos e anota a origem do resultado.

### Simulacoes

`financing_calculations` representa a analise. As formulas puras vivem em
`src/lib/calculations/`; o formulario em
`src/components/calculations/calculation-form.tsx`.

Fluxo:

1. selecionar/preencher cliente e contrato;
2. calcular valores no servidor;
3. exibir previa de juros sem alterar o resultado da analise;
4. salvar uma unica simulacao;
5. gerar PDF e imagem resumida como artefatos da mesma entidade;
6. gravar caminhos no bucket `calculation-reports`.

Referencias: `interest-rate-preview.ts`, `interest-rate-preview-card.tsx`,
`report-pdf.tsx` e `summary-image.ts`.

### Documentos

Templates podem ter HTML e originais DOCX/PDF. A geracao preenche variaveis,
salva documento gerado e tenta converter DOCX para PDF com LibreOffice.

Buckets envolvidos:

- `documents`: templates e documentos gerados;
- `client-documents`: anexos de clientes;
- `calculation-reports`: relatorios de simulacao.

Nao criar acesso publico permanente. Use helpers de URL assinada.

### Juridico

A esteira usa etapas configuraveis por empresa. Pre-vendas aprovadas podem ser
associadas a uma etapa, responsavel administrativo e consultor juridico.

Movimentacoes individuais/em massa exigem anotacao e alimentam a timeline. Os
documentos e emails podem ser vinculados a etapas. Pagamentos juridicos usam
tipos e faixas de comissao configuraveis.

### Portal do cliente

`/acompanhamento` e publico, mas nao anonimo por listagem. O usuario informa CPF
e protocolo. O fluxo:

1. normaliza CPF/protocolo;
2. consome dois buckets de rate limit (IP e IP+CPF);
3. falha fechada se o limitador estiver indisponivel;
4. usa service role para localizar cliente e pre-venda exatos;
5. retorna somente acompanhamentos visiveis e aprovados;
6. retorna somente documentos extrajudiciais aprovados e visiveis;
7. cria URL assinada apenas quando download foi aprovado.

A fila em `/aprovacoes` e o controle editorial. Alteracoes materiais em item
aprovado devem retornar a `pending` pela action e sao protegidas por trigger.

### Financeiro

Concentra categorias, contas, transacoes, vendas, chargebacks, lotes/linhas de
importacao e logs de auditoria. Mutacoes financeiras devem manter `before_data`
e `after_data` quando o fluxo atual exigir. A importacao valida planilhas antes
de persistir.

### Academy

Conteudo dos cursos esta definido em codigo em `src/lib/academy/course.ts`; o
banco guarda progresso de capitulos e tentativas de prova. Gestores acompanham
progresso; cada usuario registra seu proprio progresso conforme RLS.

### Backups

O modulo gera pacotes com dados e arquivos, registra `backup_jobs` e oferece
rotas de criacao/restauracao. Restauracoes possuem fases de upload e conclusao.
Funcoes recebem maior duracao/memoria em `vercel.json`.

Ha dois caminhos de agendamento:

- `/api/backups/scheduled`, protegido por `CRON_SECRET`, percorre empresas;
- `.github/workflows/backup.yml`, que hoje usa IDs fixos e publica pacote em
  GitHub Release privada com retencao de sete dias.

Qual deles e a rotina oficial e **A CONFIRMAR**.

## Estado e mutacoes

Nao ha store global. Estado de pagina fica em componentes client. Dados duraveis
ficam no Supabase. Depois de Server Actions bem-sucedidas, o padrao e atualizar
via `router.refresh()` e/ou revalidacao de rota conforme a implementacao local.

Para formularios:

- use React Hook Form/Zod onde ja adotado;
- normalize CPF, telefone, moeda e datas nos helpers existentes;
- trate estado pending com `useTransition` ou estado do formulario;
- preserve mensagens de validacao do dominio.

## APIs internas

Route Handlers confirmados:

- `src/app/api/backups/**`: criar e restaurar backups;
- `src/app/api/integracoes/outlook/callback/route.ts`: callback OAuth;
- `src/app/(authenticated)/integracoes/outlook/connect/route.ts`: inicio OAuth.

Diretorios locais vazios sob `src/app/api/onlyoffice/` nao constituem API ativa.

## Fluxos criticos a testar

### Mutacao autenticada

- sessao ausente;
- perfil ausente/inativo;
- troca de senha pendente;
- papel permitido e negado;
- tenant correto e tenant diferente;
- platform owner com/sem empresa ativa.

### Arquivos

- MIME, extensao e tamanho;
- prefixo `company_id` no caminho;
- ownership do registro pai;
- URL assinada expirada;
- exclusao logica e fisica coerentes;
- falha de conversao sem perder o DOCX.

### Portal

- combinacao CPF/protocolo correta e incorreta;
- rate limit allowed/blocked/unavailable;
- item nao solicitado, pendente, aprovado, rejeitado e reeditado;
- documento invisivel, visivel sem download e com download;
- documento nao extrajudicial nunca publico.

## Dependencias e limites

- Vercel e inferido por `vercel.json`, URLs e fluxo do projeto; estado do deploy
  **A CONFIRMAR**.
- Supabase remoto nao e introspectado pelo repositorio.
- LibreOffice e dependencia de sistema, nao pacote npm.
- Google Sheets precisa de planilha acessivel por link/export CSV.
- APIs externas podem falhar; nao persista sucesso antes da confirmacao adequada.
- CSP permite conexoes HTTPS/WSS, imagens HTTPS/data/blob e bloqueia framing.

## Onde colocar mudancas

- nova rota/pagina: `src/app/(authenticated)/<modulo>/`;
- mutacao da pagina: `actions.ts` co-localizado;
- regra pura/reutilizavel: `src/lib/<dominio>/`;
- componente reutilizavel do dominio: `src/components/<dominio>/`;
- tipo de negocio: `src/types/`;
- alteracao de banco: novo SQL em `docs/sql/` mais atualizacao de
  `docs/DATABASE.md` e `AGENTS.md` se mudar estado/decisao;
- integracao: `src/lib/<integracao>/`, pagina de configuracao e documentacao.

## Validacao minima por risco

- regra pura: teste unitario, `npm run typecheck`, `npm test`;
- UI: anterior mais verificacao mobile/desktop e estados;
- auth/multiempresa: casos de acesso negado e tenant cruzado;
- banco: SQL revisado, preflight, backup, validacao pos-aplicacao e rollback;
- documentos: abrir/renderizar artefatos reais;
- integracao: mock/teste local e homologacao controlada no provedor.
