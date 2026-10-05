# Memoria operacional do GRSCRM

Este arquivo e a porta de entrada obrigatoria para agentes de IA que trabalham
neste repositorio. Ele registra intencao, decisoes, estado e continuidade. O
codigo continua sendo a fonte da verdade sobre a implementacao atual.

> Quando houver conflito entre este documento e o codigo atual, investigue
> antes de agir. O codigo representa a implementacao atual, enquanto este
> documento representa intencao, decisoes e contexto.

## 1. Instrucoes obrigatorias para agentes

Todo agente deve:

1. Ler este arquivo antes de modificar codigo.
2. Seguir as decisoes e regras documentadas.
3. Nao reinventar a arquitetura sem necessidade comprovada.
4. Nao substituir decisoes existentes apenas por preferencia propria.
5. Consultar os documentos de `docs/` relacionados a tarefa.
6. Depois do contexto inicial, investigar apenas os arquivos relevantes.
7. Preservar funcionalidades existentes e o isolamento multiempresa.
8. Nao inventar requisitos, estados do ambiente ou regras de negocio.
9. Nunca inserir secrets, tokens, senhas ou credenciais no repositorio.
10. Nao alterar banco ou schema sem compreender impacto, ordem e rollback.
11. Reutilizar componentes, schemas e helpers existentes antes de criar novos.
12. Evitar duplicacao de logica, especialmente autorizacao e tenant scope.
13. Manter compatibilidade com os padroes atuais do projeto.
14. Executar as validacoes apropriadas depois de cada alteracao.
15. Atualizar esta documentacao quando uma alteracao mudar o estado descrito.

Antes de editar:

- leia `git status` e nao sobrescreva mudancas alheias;
- identifique o workspace, papel e empresa afetados;
- confirme se a operacao usa o cliente Supabase da sessao ou o service role;
- para banco, leia [docs/DATABASE.md](docs/DATABASE.md) e
  [docs/MIGRATION_RULES.md](docs/MIGRATION_RULES.md);
- para interface, leia [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## 2. Visao geral do produto

**Nome:** GRSCRM / CRM SaaS Multiempresa.

**Objetivo:** centralizar a operacao de empresas que captam clientes e prestam
servicos de revisao de juros de emprestimos, veiculos e imoveis, cobrindo da
entrada do lead ao acompanhamento comercial, juridico, financeiro e documental.

**Publico:** consultores comerciais e juridicos, gestores, administradores da
empresa, operador da plataforma e clientes que consultam seu proprio andamento.

**Problema resolvido:** substitui planilhas e fluxos dispersos por uma operacao
multiempresa com responsabilidades, historico, documentos, simulacoes,
comunicacao e acompanhamento controlado do cliente.

**Modulos em codigo:**

- plataforma multiempresa e selecao de empresa;
- autenticacao, usuarios, papeis e areas;
- Gestao: dashboard, aprovacoes, empresa, usuarios, logs, backups e templates;
- Comercial: leads, clientes, pre-vendas, simulacoes e documentos;
- Juridico: esteira configuravel, responsaveis, pagamentos e comunicacao;
- Financeiro: lancamentos, vendas, chargebacks, importacoes e consultas;
- Academy: cursos, capitulos, provas e progresso;
- portal publico do cliente por CPF e protocolo;
- integracoes descritas em [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

Os modulos compartilham `clients`, `pre_sales`, perfis e empresa. A pre-venda e
o elo operacional entre contratante, financiado, caso financeiro, simulacao,
documentos e esteira juridica.

**Estagio:** produto funcional e em evolucao, com deploy orientado a Vercel e
backend Supabase. O repositorio nao comprova sozinho o estado do banco ou do
deploy de producao.

## 3. Estado atual

### Implementado no codigo

- login Supabase, sessao SSR, troca obrigatoria de senha e conta inativa;
- isolamento por `company_id`, papeis `admin`, `manager`, `seller`, areas
  comercial/juridica e operador da plataforma;
- workspaces Gestao, Comercial, Juridico, Financeiro e Academy;
- CRUD e busca de clientes e pre-vendas, inclusive contratante ou financiado
  por nome/CPF sem duplicar o resultado;
- funil comercial e esteira juridica configuravel;
- simulacoes revisionais, PDF e imagem resumida;
- previa de juros antes de salvar, com juros total/mensal/anual, total atual,
  total corrigido e limite sem juros negativos;
- templates DOCX/PDF/HTML, documentos gerados e anexos privados;
- Outlook, Google Sheets, ToTalk, ViaCEP e imports RD;
- financeiro, Academy, logs, backups e configuracao de modulos por empresa;
- portal publico com limite de tentativas e liberacao por aprovacao;
- fila de Gestao para aprovar acompanhamentos e documentos extrajudiciais;
- separacao entre documento visivel e documento disponivel para download.

### Parcial ou dependente do ambiente

- presenca online do dashboard depende de `docs/sql/user-presence.sql`;
  tabela confirmada ausente em 05/10/2026. Exibe indisponivel ate aplicar.
  Detalhes e rollback em `docs/USER_PRESENCE.md`;

- os scripts em `docs/sql/` existem, mas sua aplicacao no Supabase de cada
  ambiente e **A CONFIRMAR**;
- o fluxo de aprovacao do portal foi implementado e testado em unidade, mas a
  homologacao ponta a ponta no ambiente alvo e **A CONFIRMAR**;
- conversao DOCX para PDF depende de LibreOffice disponivel no runtime;
- integracoes externas dependem de credenciais e configuracoes fora do Git;
- restauracao de backup e uma operacao destrutiva que exige validacao manual;
- o estado do deploy Vercel e **A CONFIRMAR**.

### Nao implementado ou nao ativo

- nao ha pipeline de migrations versionadas/aplicadas automaticamente;
- nao ha integracao OnlyOffice ativa: existem apenas diretorios vazios locais,
  sem arquivos rastreados ou fluxo implementado;
- nao ha confirmacao automatica de paridade entre schema remoto e `docs/sql/`;
- nao ha suite E2E de navegador confirmada no repositorio.

### Prioridade atual

1. Confirmar/aplicar os SQLs mais recentes no Supabase alvo.
2. Homologar o fluxo completo de aprovacao e portal do cliente.
3. Resolver as lacunas operacionais confirmadas em Pendencias, sem iniciar
   refatoracao ampla.

## 4. Mapa rapido da arquitetura

- Next.js App Router entrega paginas, Route Handlers e Server Actions.
- Componentes de servidor carregam contexto e dados; componentes client cuidam
  de formularios e interacoes.
- Supabase fornece Auth, PostgreSQL, PostgREST e Storage privado.
- `middleware.ts` renova sessao e faz redirecionamentos iniciais.
- `getCurrentUserContext()` e o contexto canonico de usuario/empresa no servidor.
- RLS e `company_id` formam a barreira de tenant; o service role ignora RLS e
  exige verificacao explicita antes de qualquer consulta.
- cookies guardam workspace e empresa ativa do operador da plataforma.

Detalhes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 5. Stack

Versoes confirmadas em `package.json`:

- frontend/backend: Next.js 15.5.24, React 19.1.0, TypeScript 5.8.3;
- estilos: Tailwind CSS 4.3.3;
- banco/auth/storage: Supabase JS 2.112.4 e Supabase SSR 0.6.1;
- formularios: React Hook Form 7.55.0, Zod 3.24.3;
- documentos: React PDF, pdf-lib, Mammoth, Docxtemplater, Pizzip/JSZip, Sharp;
- planilhas: SheetJS `xlsx` 0.20.3;
- icones: Lucide React;
- testes: Vitest 4.1.11;
- infraestrutura declarada: Vercel e GitHub Actions;
- runtime Node: 22 no workflow de backup; versao local/producao **A CONFIRMAR**.

## 6. Mapa do repositorio

- `src/app/`: rotas, layouts, Server Actions e APIs.
- `src/app/(authenticated)/`: produto autenticado por modulo.
- `src/app/(public)/login/`: login.
- `src/app/acompanhamento/`: portal publico do cliente.
- `src/components/`: componentes organizados por dominio e shell visual.
- `src/lib/`: regras, schemas, integracoes e acesso ao Supabase.
- `src/types/`: tipos de dominio manuais; nao sao schema gerado do banco.
- `docs/sql/`: scripts SQL manuais e cumulativos.
- `scripts/`: backups e importacoes RD.
- `.github/workflows/backup.yml`: backup externo agendado de uma empresa.
- `public/`: fontes e assets estaticos.
- `middleware.ts`: entrada da protecao de rotas/sessao.
- `next.config.ts`: headers de seguranca e configuracao Next.
- `vercel.json`: limites de funcoes de backup.

Nao confundir este repositorio com o projeto separado NewSec Chat mencionado em
arquivos locais nao rastreados.

## 7. Regras de negocio criticas

1. Todo dado operacional pertence a uma empresa. Nunca aceite `company_id` do
   cliente como autorizacao; derive-o de `getCurrentUserContext()`.
2. Operador da plataforma pode selecionar uma empresa ativa, mas a selecao deve
   ser validada antes do acesso cross-tenant.
3. O cliente (`clients`) e o contratante da GRS; o financiado pode ser outra
   pessoa/empresa e vive nos dados de pre-venda/caso financeiro.
4. Busca de pre-vendas deve considerar nome e CPF do cliente e do financiado,
   indicar a origem do match e nao duplicar registros.
5. Status aprovado da pre-venda alimenta operacoes posteriores; nao confundir
   quantidade de simulacoes com quantidade de arquivos gerados.
6. Simulacao salva e uma entidade `financing_calculations`; PDF/imagem sao
   artefatos da mesma simulacao, nao novas simulacoes.
7. A previa de juros orienta o consultor e nao altera o resultado persistido da
   analise. Deve alertar quando a reducao produz juros negativos.
8. Conteudo do acompanhamento so aparece ao cliente quando esta visivel **e**
   aprovado pela Gestao.
9. Somente documentos `extrajudicial` podem ser liberados no portal. Visibilidade
   e download sao permissoes diferentes, ambas aprovadas pela Gestao.
10. Editar conteudo ja aprovado deve faze-lo voltar para aprovacao.
11. Arquivos ficam em buckets privados e sao entregues por URL assinada curta.
12. Templates e documentos oficiais devem preservar layout e clausulas; a
    conversao para PDF pode ficar pendente se LibreOffice estiver indisponivel.
13. Senhas nao podem ser armazenadas em `public.user_profiles`; ficam apenas no
    Supabase Auth em formato nao recuperavel.
14. Alteracoes e operacoes relevantes ficam registradas; o sistema nao promete
    registrar literalmente toda leitura ou todo acesso.
15. Mudancas de etapa juridica exigem anotacao e devem preservar a timeline.

## 8. Integracoes

Confirmadas: Supabase, Microsoft Outlook/Graph, Google Sheets, ToTalk, ViaCEP,
LibreOffice, RD Station CRM (importacao), GitHub Releases/Actions e Vercel.

OnlyOffice nao esta implementado. Consulte
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) antes de alterar qualquer fluxo.

## 9. Banco, multiempresa e seguranca

- PostgreSQL do Supabase; Auth e Storage fazem parte da mesma plataforma.
- `public.user_profiles.auth_user_id` vincula Auth ao perfil operacional.
- `company_id` e obrigatorio como escopo nas entidades tenant-aware.
- filhos sem `company_id` sao autorizados pela pre-venda ou cliente pai.
- RLS e helpers SQL existem em `docs/sql/security-multi-tenant-*.sql`.
- platform owner tem politicas especiais em `plataforma-multiempresas.sql`.
- o cliente admin (`src/lib/supabase/admin.ts`) usa service role e ignora RLS.
- a rota publica usa service role somente depois de validar CPF, protocolo e
  rate limit; falha do rate limiter fecha a consulta.
- estado real de RLS, policies, triggers, buckets e SQLs aplicados: **A CONFIRMAR**.

Detalhes e procedimento: [docs/DATABASE.md](docs/DATABASE.md).

## 10. Padroes de desenvolvimento

- prefira Server Components e Server Actions; use `"use client"` so quando a
  interacao exigir estado/eventos no navegador;
- use TypeScript explicito nos limites de dominio e Zod para entradas mutaveis;
- obtenha usuario/empresa com `getCurrentUserContext()` em operacoes autenticadas;
- valide ownership novamente ao usar `createAdminClient()`;
- mantenha regras puras em `src/lib/<dominio>/` e teste-as com Vitest;
- mantenha componentes em `src/components/<dominio>/` e tipos em `src/types/`;
- reutilize formatadores, mascaras, badges, modais e schemas existentes;
- preserve soft delete (`deleted_at`/`deleted_by`) onde ja adotado;
- mostre erros acionaveis ao usuario sem expor tokens, stack ou detalhes internos;
- layouts precisam funcionar no mobile e desktop, com foco visivel e sem
  depender apenas de hover;
- siga o padrao visual documentado em [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md);
- nao trate tipos manuais como prova de que uma coluna existe no banco remoto;
- depois de alterar: rode typecheck, testes, lint/build conforme o risco e
  verifique o diff.

## 11. Comandos importantes

Comandos confirmados por `package.json`:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
npm run backup:stored -- [argumentos]
npm run backup:register-external -- [argumentos]
npm run import:legacy-rd -- [argumentos]
npm run import:rd-crm-activities -- [argumentos]
```

Nao existe comando confirmado de migration. Os SQLs sao aplicados manualmente
no Supabase conforme [docs/MIGRATION_RULES.md](docs/MIGRATION_RULES.md).

## 12. Decisoes arquiteturais importantes

### Supabase como backend integrado

**Contexto:** o produto precisa de auth, dados relacionais, RLS e arquivos.

**Decisao:** usar Supabase Auth/PostgreSQL/Storage e Next.js no servidor.

**Motivo:** manter identidade, dados e arquivos sob o mesmo modelo de tenant.

**Nao fazer:** criar uma segunda fonte de verdade sem plano de migracao.

**Estado:** ativa.

### Isolamento por empresa em duas camadas

**Contexto:** filtros apenas na UI nao impedem acesso cruzado.

**Decisao:** filtrar no servidor por `company_id` e aplicar RLS/policies no banco.

**Motivo:** defesa em profundidade.

**Nao fazer:** confiar em `company_id` enviado pelo browser ou no service role.

**Estado:** implementada no codigo e SQL; aplicacao remota **A CONFIRMAR**.

### Operador da plataforma com empresa ativa

**Contexto:** administracao SaaS precisa atuar em tenants diferentes.

**Decisao:** `is_platform_owner` mais cookie de empresa ativa validado no banco.

**Motivo:** separar o tenant de origem do perfil do tenant operacional selecionado.

**Nao fazer:** transformar todo admin de empresa em operador da plataforma.

**Estado:** ativa.

### Separar contratante de financiado

**Contexto:** quem contrata a assessoria pode ser diferente do titular da divida.

**Decisao:** manter cliente/contratante e snapshot/financiado como papeis distintos.

**Motivo:** busca, contratos e documentos precisam refletir ambos sem duplicidade.

**Nao fazer:** sobrescrever o cliente com dados do financiado.

**Estado:** ativa.

### Documentos privados e URLs assinadas

**Contexto:** contratos e anexos contem dados pessoais.

**Decisao:** buckets privados por prefixo de empresa e URLs temporarias.

**Motivo:** evitar exposicao publica permanente.

**Nao fazer:** tornar buckets publicos para simplificar downloads.

**Estado:** ativa no codigo/SQL; policies remotas **A CONFIRMAR**.

### Aprovacao antes da publicacao no portal

**Contexto:** informacoes operacionais ou documentos incorretos nao podem chegar
ao cliente automaticamente.

**Decisao:** qualquer colaborador pode solicitar publicacao; Gestao decide.
Documentos extrajudiciais possuem permissoes separadas de visibilidade/download.

**Motivo:** controle editorial sem fluxo de dois fatores.

**Nao fazer:** exibir por mera existencia, upload ou `visible_to_client` isolado.

**Estado:** implementada em 2026-09-10; homologacao remota **A CONFIRMAR**.

### SQL manual, nao migration framework

**Contexto:** o historico do banco esta em scripts executados pelo SQL Editor.

**Decisao atual:** preservar `docs/sql/` e tratar aplicacao como operacao manual.

**Motivo:** e o processo existente; mudar exige plano de baseline.

**Nao fazer:** assumir ordem/aplicacao ou executar todos os arquivos cegamente.

**Estado:** ativa, com risco operacional conhecido.

### Simulacao e artefatos sao entidades diferentes

**Contexto:** dashboard contava arquivos em vez de analises.

**Decisao:** metricas contam `financing_calculations`; PDF e imagem pertencem a
simulacao e sao gerados juntos ao salvar/regenerar.

**Motivo:** uma analise nao deve ser multiplicada por seus arquivos.

**Nao fazer:** usar quantidade de objetos no Storage como volume de simulacoes.

**Estado:** ativa.

## 13. Ultimas alteracoes

- 05/10/2026: Financeiro ganhou visao geral Newsec claro/escuro com fluxo de
  caixa real, filtros e painel lateral sticky para consulta/cadastro/edicao.
  Rotinas originais preservadas em Lancamentos. Validacao: 32 testes, lint,
  typecheck e navegador desktop/mobile. Detalhes e limites no handoff.

- 05/10/2026: Equipe mostra previa no hover/foco com painel sticky desktop;
  distribuicao de leads ganhou checkbox Todos e estado parcial. Acoes de
  distribuicao preservadas e nao executadas no teste.

- 05/10/2026: dashboard Gestao com contas ativas separadas de presenca online,
  atividades traduzidas com autor/data e criacoes do dia vs ontem. SQL de
  presenca preparado, ainda nao aplicado. Integrações removidas apenas do
  dashboard, nao dos servicos. Contexto em `docs/USER_PRESENCE.md`.

### Ultima atualizacao funcional confirmada

**Data:** 2026-09-10, commit `0fb852a`.

### Alteracoes realizadas

- fila de aprovacao em Gestao;
- aprovacao/rejeicao de acompanhamentos;
- aprovacao de documentos extrajudiciais com visibilidade/download separados;
- portal publico filtrando apenas itens aprovados;
- triggers e constraints de protecao;
- testes unitarios do workflow de aprovacao.

### Arquivos/areas afetados

- `src/app/(authenticated)/aprovacoes/`;
- `src/components/approvals/`;
- acompanhamento e documentos do cliente;
- `src/app/acompanhamento/page.tsx`;
- `docs/sql/aprovacoes-portal-cliente.sql`.

### Motivo

Impedir que informacoes ou arquivos sejam exibidos ao cliente sem revisao da
Gestao, sem exigir aprovacao em dois fatores.

### Validacao realizada

O commit inclui teste unitario do workflow. Resultado historico de build/lint no
ambiente do commit nao esta registrado aqui: **A CONFIRMAR**.

### Estado

**PARCIAL:** codigo concluido; SQL aplicado e homologacao remota **A CONFIRMAR**.

Alteracoes imediatamente anteriores: totais da divida na previa de juros
(2026-09-04), previa de juros (2026-09-03) e hardening de seguranca
(2026-08-26).

## 14. Tarefa atual

**Objetivo:** tornar o contexto do projeto persistente para troca de agentes.

**Estado:** documentacao criada; nenhuma funcionalidade deve ser alterada nesta
tarefa.

**Ja realizado:** levantamento de codigo, Git, stack, SQLs, integracoes,
arquitetura, padroes visuais, riscos e estado recente. A documentacao foi
validada com `git diff --check`, verificacao de caminhos e secrets,
`npm run typecheck -- --incremental false`, testes e lint restrito ao codigo do
CRM.

**Ainda falta apos esta documentacao:** confirmar o estado dos ambientes externos
e homologar a entrega mais recente.

**Arquivos envolvidos:** `AGENTS.md` e os cinco documentos relacionados abaixo.

**Proxima acao:** executar o proximo passo recomendado da secao 18.

## 15. Pendencias

### P0 - bloqueia a confianca na entrega atual

- **Confirmar schema do Supabase alvo.** Verificar se
  `security-hardening-2026-08-26.sql` e `aprovacoes-portal-cliente.sql` foram
  aplicados, incluindo functions, triggers, constraints, indices e policies.
  Dependencia: acesso ao projeto Supabase. Proximo passo: auditoria somente
  leitura e plano de aplicacao conforme `docs/MIGRATION_RULES.md`.
- **Homologar portal/aprovacoes ponta a ponta.** Cobrir solicitacao, fila,
  aprovacao/rejeicao, reedicao, visibilidade sem download, download autorizado,
  tenant errado e falha do rate limiter. Dependencia: ambiente com SQL atual.

### P1 - importante

- **Completar `.env.example`.** Ele nao lista Outlook, criptografia, cron, rate
  limit, LibreOffice e RD usados pelo codigo. Nunca adicionar valores reais.
- **Revisar estrategia de backup multiempresa.** O endpoint agendado percorre
  empresas, mas `.github/workflows/backup.yml` possui IDs fixos de uma empresa e
  um criador. Definir qual e a rotina oficial antes de mudar.
- **Confirmar runtime de conversao PDF.** Validar disponibilidade e caminho do
  LibreOffice no ambiente de deploy.
- **Estabelecer baseline de banco.** Definir como registrar quais SQLs foram
  aplicados sem executar scripts cumulativos cegamente.

### P2 - melhoria posterior

- Atualizar o `README.md`, hoje desatualizado e ainda descrevendo placeholders.
- Ampliar testes de integracao/E2E para auth, multiempresa, documentos e portal.
- Padronizar componentes visuais repetidos somente quando houver uma tarefa de
  migracao aprovada.

### Futuro / backlog

- Itens nao confirmados no codigo nao foram adicionados. Registre novos itens
  apenas a partir de requisito explicito ou evidencia tecnica.

## 16. Problemas conhecidos

### Estado remoto do banco nao rastreado

**Impacto:** codigo pode esperar colunas/functions inexistentes.

**Area:** `docs/sql/`, Supabase.

**Estado:** aberto.

**Solucao conhecida:** auditar e aplicar scripts necessarios com backup/checks.

**Proxima acao:** P0 de confirmacao do schema.

### Arquivo de ambiente de exemplo incompleto

**Impacto:** novo ambiente pode falhar em integracoes e jobs.

**Area:** `.env.example`.

**Estado:** aberto.

**Solucao conhecida:** documentar apenas nomes e exemplos nao secretos.

**Proxima acao:** tratar como tarefa isolada P1.

### Backup externo com tenant fixo

**Impacto:** o workflow GitHub nao representa um backup multiempresa completo.

**Area:** `.github/workflows/backup.yml`.

**Estado:** aberto; intencao operacional **A CONFIRMAR**.

**Solucao conhecida:** decidir entre job por empresa ou endpoint multiempresa.

**Proxima acao:** confirmar a rotina oficial com o responsavel.

### Documentacao antiga contradiz o produto

**Impacto:** `README.md` leva agentes a acreditar que ha apenas CRUD inicial.

**Area:** `README.md`.

**Estado:** aberto, mitigado por este arquivo.

**Solucao conhecida:** atualizar README em tarefa posterior.

## 17. Nao fazer

- nao reescrever uma arquitetura funcional para impor preferencia de framework;
- nao remover funcionalidades durante alteracoes visuais;
- nao criar componentes ou regras duplicadas sem pesquisar os existentes;
- nao quebrar `company_id`, RLS, prefixo de Storage ou empresa ativa;
- nao usar service role sem autenticar, autorizar e escopar manualmente;
- nao alterar RLS/policies isoladamente sem revisar platform owner e filhos;
- nao executar todos os SQLs em producao nem usar ordem por nome/data como prova;
- nao tornar buckets publicos;
- nao armazenar senhas, tokens descriptografados ou logs sensiveis;
- nao permitir que documento nao extrajudicial apareca no portal;
- nao fundir contratante e financiado;
- nao contar arquivos como simulacoes;
- nao modificar o calculo persistido ao ajustar apenas a previa de juros;
- nao prometer auditoria de toda leitura: o sistema registra operacoes relevantes;
- nao confiar no README ou em auditorias antigas sem confrontar o codigo atual;
- nao tocar em arquivos nao rastreados/alheios sem pedido explicito;
- nao assumir que diretorios vazios de OnlyOffice representam integracao ativa.

## 18. Proximo passo recomendado

Se voce acabou de assumir este projeto, primeiro faca uma auditoria somente
leitura do Supabase alvo e compare o schema real com
`docs/sql/security-hardening-2026-08-26.sql` e
`docs/sql/aprovacoes-portal-cliente.sql`. Depois proponha a aplicacao segura do
que estiver ausente e um roteiro de homologacao do portal; nao execute SQL
destrutivo ou de producao sem autorizacao explicita.

## 19. Documentacao relacionada

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): camadas, rotas, fluxos e
  dependencias entre modulos.
- [docs/DATABASE.md](docs/DATABASE.md): entidades, relacoes, RLS, Storage e riscos.
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md): contratos com servicos externos,
  configuracao e falhas.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): padrao visual real e referencias.
- [docs/MIGRATION_RULES.md](docs/MIGRATION_RULES.md): mudancas de banco e
  remodelagem de telas antigas com preservacao de comportamento.

## 20. Protocolo de encerramento de tarefa

Apos concluir uma tarefa relevante:

1. Execute as validacoes aplicaveis.
2. Verifique o diff.
3. Confirme que nenhuma funcionalidade existente foi removida acidentalmente.
4. Atualize "Estado atual" se necessario.
5. Atualize "Ultimas alteracoes".
6. Atualize "Tarefa atual".
7. Remova pendencias realmente concluidas.
8. Adicione novas pendencias confirmadas.
9. Atualize problemas conhecidos.
10. Atualize "Proximo passo recomendado".
11. Atualize documentos de `docs/` apenas quando a mudanca os afetar.
12. Nao transforme este arquivo em um diario infinito.
13. Preserve decisoes arquiteturais ainda validas.
14. Nunca registre algo como concluido sem confirmacao.

O objetivo e deixar contexto suficiente para o proximo agente continuar sem o
historico de conversas.
