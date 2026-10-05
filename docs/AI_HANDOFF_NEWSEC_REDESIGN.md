# Handoff - Redesign Newsec do CRM

Ultima etapa por blocos: veja `docs/NEWSEC_REFERENCE_BLOCKS.md` para rotas,
adaptacoes aos dados reais, verificacoes e limites dos testes visuais.

Atualizado em 2026-10-05. Leia este documento, `AGENTS.md` e
`docs/DESIGN_SYSTEM.md` antes de alterar a interface.

## Projeto e execucao local

- Repositorio: `C:\Users\Gabriel\Desktop\PROJETOS\GRS\CRM\GRSCRM`
- Stack: Next.js 15, React 19, TypeScript, Tailwind 4 e Supabase.
- Desenvolvimento: `npm run dev` e `http://localhost:3000`.
- Validacoes obrigatorias apos alteracoes: `npm run typecheck`, `npm run lint`
  e `npm test`.
- Nunca registre valores de `.env.local`, chaves do Supabase, senhas ou tokens.

## Objetivo visual

O CRM esta migrando do visual legado para o sistema visual Newsec, em modo claro
e escuro. As referencias fornecidas pelo usuario sao a fonte de verdade para as
telas solicitadas. Preserve os dados reais, permissoes, fluxos e responsividade;
esta e uma migracao visual e de ergonomia, nao uma reescrita do dominio.

### Regras de interface

- Use os tokens `--ns-*` de `src/app/globals.css`, nunca cores claras fixas em
  componentes que tambem aparecem no tema escuro.
- Use `var(--ns-surface)`, `var(--ns-surface-hover)`, `var(--ns-border)`,
  `var(--ns-text)`, `var(--ns-text-secondary)`, `var(--ns-primary)` e os tokens
  de estado (`success`, `warning`, `danger`) conforme o caso.
- No tema escuro, hover deve apenas realcar levemente a superficie; nao pode
  ficar branco nem reduzir a legibilidade do texto.
- Controles interativos precisam de cursor, foco visivel e estados hover/focus.
- Antes de declarar fidelidade visual, conferir no navegador em claro e escuro.

## Infraestrutura implementada

- `src/components/layout/authenticated-shell.tsx`: raiz autenticada usa
  `#ns-shell-root`, `legacy-newsec` e `data-theme`.
- `src/components/layout/page-header.tsx`: cabecalho padronizado e alternancia
  de tema.
- `src/app/globals.css`: tokens Newsec, adaptacao de componentes legados para
  claro/escuro e correcoes de hover de tabelas no escuro.
- O tema e persistido no navegador com a chave `newsec-theme`.

## Telas alteradas nesta etapa

### Cadastro e edicao de pre-vendas - 2026-10-05

- `src/components/pre-sales/pre-sales-form.tsx`: formulario em duas colunas,
  indicador de status, resumo lateral sticky e checklist de preenchimento.
- Rotas `/pre-vendas/novo` e `/pre-vendas/[id]/editar` usam o mesmo componente.
- Contratante, titular da divida, dados financeiros, pagamentos e anotacao de
  edicao permanecem no formulario. Status refletem as opcoes reais do CRM.
- Resumo atualiza cliente, tipo, valor, origem, consultor e financeira ao editar.
- Probabilidade e proxima acao da imagem nao foram criadas sem suporte no schema.
- Typecheck, lint e testes passaram (4 arquivos, 16 testes). Cadastro inspecionado
  no navegador nos temas claro e escuro, sem salvar registros.

### Cadastro e edicao de cliente - 2026-10-05

- Formulario compartilhado `src/components/clients/client-form.tsx` organizado
  em dados pessoais, contato, endereco, responsaveis e observacoes.
- Resumo lateral sticky com progresso por grupo, restauracao dos valores
  iniciais e submit. Validacao, mascaras, ViaCEP e anotacao de edicao preservados.
- Rotas `/clientes/novo` e `/clientes/[id]/editar` usam o mesmo visual.
- Campos de banco, tags, origem e contrato da referencia nao foram adicionados
  ao modelo de cliente; sao dados de outros dominios ou ainda nao suportados.
- Typecheck, lint e testes passaram; cadastro carregado no navegador autenticado.

### Lista de clientes (`/clientes`) - 2026-10-05

- `src/app/(authenticated)/clientes/page.tsx` carrega dados relacionados em
  consultas em lote, com sessao do usuario e filtro por empresa.
- `src/components/clients/clients-workspace.tsx` implementa indicadores,
  tabela com avatar/contato/responsavel/status/documentos e previa lateral.
- Linhas abrem Cliente 360 por clique ou Enter; hover/foco atualiza a previa.
- Painel lateral usa sticky top-4 e rolagem interna quando excede a viewport.
- Abas da previa: resumo, documentos, ultima simulacao e historico de cadastro.
- Indicadores relacionados a pre-vendas sao explicitamente da pagina carregada;
  nao sao contagens globais e nao representam pendencias/SLA.
- Nao foram inventadas proximas acoes, prazos ou percentuais de documentos.
- Validado no navegador com dados reais em claro/escuro e rolagem no escuro.
- Cabecalho da tabela no escuro tem superficie levemente clareada e texto
  secundario; sobrescreve a regra branca legada de `table thead`.
- Typecheck, lint e os 16 testes passaram. Outras listas nao foram alteradas.

### Simulacoes (`/calculos`)

- Arquivos principais:
  - `src/app/(authenticated)/calculos/page.tsx`
  - `src/components/calculations/calculations-workspace.tsx`
- Tabela e painel de analise foram redesenhados para seguir as referencias.
- O painel direito mostra por padrao a ultima analise e muda ao passar o mouse
  sobre uma linha.
- A linha abre a analise ao clicar; o painel acompanha a rolagem em desktop.
- Foram ajustados os realces de hover e cabecalho da tabela no modo escuro.

### Esteira juridica (`/juridico`)

- Arquivos principais:
  - `src/app/(authenticated)/juridico/page.tsx`
  - `src/components/legal/legal-kanban.tsx`
  - `src/components/legal/legal-workflow-editor.tsx`
- O quadro usa o padrao visual das referencias, em claro e escuro.
- Cards exibem cliente, responsavel, tempo na etapa e tipo de pre-venda.
- Clique no card abre a pre-venda; botoes internos distinguem cliente e
  pre-venda. O quadro preserva edicao e movimentacao por arrastar/soltar.
- O titulo da etapa exibe a descricao apenas em tooltip no hover.
- O editor de etapas continua disponivel e foi atualizado visualmente.

### Cliente 360 (`/clientes/[id]`)

- Arquivos principais:
  - `src/app/(authenticated)/clientes/[id]/page.tsx`
  - `src/components/clients/client-detail-tabs.tsx`
  - `src/components/clients/client-tracking-section.tsx`
  - `src/components/client-documents/client-document-workspace.tsx`
  - `src/components/client-documents/client-document-upload.tsx`
  - `src/components/email/send-client-email-modal.tsx`
- Cabecalho, abas, resumo e timeline foram alinhados ao visual Newsec.
- Documentacao extrajudicial/processual recebeu estados ativos azulados e
  controles clicaveis no claro e escuro.
- Upload, obrigatoriedade, dados pessoais, portal do cliente e botoes do modo
  escuro usam tokens de tema; nao devem voltar a usar branco fixo.

### Atendimento por telefone/WhatsApp (`/atendimento`)

- Arquivos principais:
  - `src/components/clients/whatsapp-link.tsx`
  - `src/components/newsec/atendimento-workspace-real.tsx`
- O componente compartilhado `WhatsAppLink` nao abre mais `wa.me` nem nova aba.
- Clientes e pre-vendas passam o telefone para `/atendimento?telefone=...`.
- A tela resolve o telefone para uma conversa existente e a abre. Sem historico,
  abre o modal "Nova conversa" com o telefone preenchido; a pessoa confirma o
  inicio, sem criar conversa automaticamente.

## Validacao ja executada

- `npm run typecheck` passou.
- `npm run lint` passou.
- `npm test` passou: 4 arquivos e 16 testes.
- Validacao visual manual feita em navegador autenticado para:
  - documentacao do Cliente 360 em claro e escuro;
  - abertura interna de conversa existente pelo telefone;
  - telefone sem historico abrindo o modal de nova conversa preenchido.

## Estado do Git e cuidados

- O worktree possui alteracoes locais anteriores e arquivos nao rastreados.
  Nao use `git reset --hard`, `git checkout --` ou limpeza automatica.
- Nao apague nem reformate arquivos fora do escopo da proxima tela.
- Antes de editar, rode `git status --short` e leia os arquivos que ja possuem
  alteracoes para trabalhar sobre elas.
- O documento `docs/NEWSEC_MIGRATION.md` ainda e um checklist amplo e esta
  incompleto; use este arquivo para o estado do redesign recente.

## Proximo fluxo recomendado

1. Receber imagens de referencia de uma unica tela por vez (claro e escuro,
   quando existirem).
2. Localizar a rota e os componentes atuais com `rg` antes de modificar.
3. Reutilizar o shell e tokens Newsec existentes; nao criar um segundo sistema
   de tema.
4. Implementar somente a tela e os comportamentos explicitamente pedidos.
5. Rodar validacoes e abrir a rota localmente nos dois temas.
6. Atualizar este documento com arquivos afetados, comportamento e validacao.
## Formulario de simulacoes

- Ajuste posterior: cabecalho da previa de juros e quadro de parcelas/dividas
  usam tokens de superficie, texto e borda; cores de resultados e alertas
  ajustadas no tema escuro. Verificado no navegador com valores de teste,
  sem salvar; typecheck passou.

- `calculation-form.tsx`: cadastro e edicao em duas colunas com painel lateral
  sticky, metricas e comparativo de parcelas. Todos os campos, importacao Totalk,
  vinculos e fluxo de salvar/gerar arquivos foram preservados.
- `calculation-result-preview.tsx`: previa reativa usando `calculateFinancingRevision`,
  o mesmo helper do calculo existente. Taxas e limites continuam disponiveis em
  um bloco expansivel. Nao adicionados botoes ficticios de rascunho/compartilhamento.
- Typecheck, lint e 16 testes passaram. Previa testada no navegador sem salvar.
- Listas auxiliares retornaram `fetch failed` no teste local; edicao de um registro
  persistido nao foi validada nessa tarefa. Formulario compartilhado cobre as duas rotas.
## Pipeline de pre-vendas

- Quadro atualizado com tokens claro/escuro, colunas horizontais e rolagem
  vertical por coluna. Mantidos status reais, busca, filtros e visao de lista.
- Card inteiro abre detalhe por clique/Enter; links internos preservados.
- Arraste HTML existente preservado com dataTransfer e bloqueio de clique apos
  arraste. Mudanca de etapa continua exigindo anotacao e usa a action existente.
- Typecheck, lint e 16 testes passaram. Quadro carregou com dados reais no
  navegador; nao foi confirmada nenhuma movimentacao de registros no teste.

## Gestao (05/10/2026)

- Navegacao horizontal compartilhada: Visao geral, Equipe, Operacao,
  Configuracoes e Seguranca, usando as rotas existentes. Menu `/dashboard`
  renomeado para Gestao. Componentes em `src/components/management/`.
- `/dashboard`: novo resumo administrativo, com consultas reais por company_id.
  Indicadores de usuarios, clientes, pre-vendas, aprovacoes, configuracao Totalk,
  backup e eventos. Relatorio comercial antigo preservado em
  `/dashboard?view=commercial` e com filtro consultant.
- `/usuarios`: lista com filtros locais, paginacao de oito usuarios e painel de
  detalhes sticky. Metas mensais reais, status, contatos e edicao existentes.
  Gerente so pode editar consultores, como anteriormente. Licencas, filtros
  antigos e listagem completa continuam em bloco expansivel.
- `/aprovacoes`: tabela de acompanhamentos/documentos pendentes e detalhe
  sticky. Selecionar linha muda o detalhe. Reutiliza ClientApprovalQueue em
  modo compacto, mantendo aprovar publicacao/devolver, observacoes e arquivos.
  Nao foi criado fluxo ficticio de aprovacao de propostas comerciais.
- `/logs`: indicadores sobre os eventos carregados (limite original 300),
  tabela com rolagem interna, cabecalho sticky e detalhes/contexto reais.
  Filtros e listagem completa preservados em blocos expansiveis.
- `/empresa`: configuracao existente integrada ao tema/navegacao, resumo e logo
  sticky. `/contratos`: novos indicadores de documentos, clientes e templates
  utilizados, preservando visualizacao e PDF.
- `/backups`, `/integracoes`, `/documentos/templates`, `/emails/templates`:
  navegacao e cabecalhos de Gestao, tokens claro/escuro e ajustes de contraste.
  Estas paginas de apoio conservaram a estrutura e actions existentes; nao
  receberam um redesenho estrutural equivalente aos quatro paineis principais.
- Upload: file-selector-button acompanha o tema, sem botao branco no escuro.
  Cabecalhos, bordas e selecao de tabelas usam tokens em management-scope.
- Dados ausentes nas fontes atuais NAO foram inventados: uptime, disponibilidade
  em tempo real, variacoes percentuais historicas, IP/dispositivo/sessao e
  checklist de treinamento por usuario. Treinamento aponta para Academy.
  Contagem de integracoes indica configuracao Totalk, nao saude operacional.
- As imagens 3 e 4 recebidas sao duplicadas de Operacao; nao houve imagem
  separada de Configuracoes. Nao afirmar equivalencia pixel a pixel.
- Validacao: typecheck, lint e 16 testes passaram. Navegador autenticado abriu
  overview, usuarios, aprovacoes, auditoria, empresa, backups, contratos,
  templates de documentos/e-mail e integracoes com dados persistidos.
  Selecao de usuario e aprovacao validada. Revisados claro/escuro dos paineis;
  nenhuma aprovacao, edicao, exclusao ou restauracao de dados foi executada.
  Fontes de leads/Academy e formularios internos nao tiveram teste completo
  nesta entrega. Nao ha teste automatizado novo especifico de interface.

### Dashboard: indicadores e presenca (05/10/2026)

- Substitui os indicadores de integracao/backup no topo por simulacoes e
  pre-vendas criadas hoje vs ontem. Contagem real por company_id e created_at,
  em America/Sao_Paulo; simulacoes usam financing_calculations. Ontem e o dia
  completo anterior. Base zero nao gera percentual ficticio. Backup mantido
  em Controle da empresa. Totalk/Outlook nao aparecem no dashboard; seus
  servicos e configuracoes NAO foram desativados por esta alteracao.
- Atividades mostram acao em portugues, autor do user_profile_id e data/hora
  de Brasilia. Historico de perfis inativos continua permitindo autoria.
  Eventos desconhecidos usam Atividade registrada, nunca a chave interna.
- Usuarios online e separado de contas ativas (is_active=true). Heartbeat
  global nas abas visiveis a cada 40s; online = sinal nos ultimos 90s, excluindo
  perfis desativados. API restrita a gestao/operador e empresa selecionada.
- PENDENCIA CONFIRMADA: tabela public.user_presence ausente no Supabase
  durante a verificacao. Aplicar docs/sql/user-presence.sql e recarregar CRM.
  Ate isso o dashboard mostra Presenca nao configurada, NAO zero ficticio.
  Instrucoes, seguranca e rollback: docs/USER_PRESENCE.md.
- Validacao: 25 testes passaram, incluindo periodo de Brasilia, comparacoes,
  traducoes e API de presenca com escopo/erro de schema/permissao. Lint e
  typecheck executados; navegador confirmou dados reais e ausencia das
  integracoes. Escrita/leitura de presenca real ainda depende do SQL.

### Equipe e selecao de leads (05/10/2026)

- Equipe: onMouseEnter e onFocus atualizam o usuario do painel lateral. Mantem
  a ultima linha consultada ao sair da tabela, para usar as acoes no painel.
  Painel sticky em desktop, com altura limitada e rolagem interna se preciso;
  em telas pequenas segue abaixo da tabela. Clique/Enter continuam funcionando.
- Distribuicao de leads: checkbox Todos no cabecalho seleciona/desmarca todos
  os leads novos da lista carregada. Estado parcial indeterminate quando so
  alguns estao marcados. Inputs continuam enviando lead_id para as actions
  originais; nao seleciona consultores nem leads ja distribuidos.
- Validacao em navegador: passar mouse mudou de Adriana para Ana Carolina,
  painel acompanha rolagem; sete leads marcados em um clique, seis apos tirar
  um (estado misto) e zero ao desmarcar todos. Nenhuma distribuicao executada.
- Ajustado minmax/min-w-0 na lista de leads para rolagem horizontal permanecer
  dentro da tabela. Aviso preexistente de hidratacao data-theme do shell foi
  observado no dev; nao e erro da selecao e nao foi alterado nesta tarefa.

### Financeiro: visao geral Newsec (05/10/2026)

Atualizacao posterior: refinamento dos blocos de referencia e controles master
em /empresas. Ler NEWSEC_REFERENCE_BLOCKS.md e MASTER_COMPANY_LIFECYCLE.md.
Exclusao recuperavel por tres meses e purge estao preparados, NAO ativados;
company_lifecycle ausente no banco, SQL nao aplicado, limpeza desabilitada.
Nao ativar antes da auditoria de FKs, Storage e backups externos GitHub.
Bloqueio atualizado no contexto autenticado; 51 testes, lint e typecheck passam.

- /financeiro agora abre indicadores, fluxo de caixa dos ultimos 3/6/12 meses,
  resumo financeiro e tabela filtravel/paginada. Painel lateral sticky desktop
  mostra o lancamento consultado por hover/foco/clique; edicao protege o draft
  contra troca por hover. Em mobile o painel fica abaixo da lista.
- Cadastro/edicao/exclusao usam as actions existentes e suas validacoes,
  permissoes e auditoria. Exclusao tem confirmacao. Nada foi gravado no teste.
  Rotinas completas anteriores (importacoes, vendas, chargebacks, restauracao)
  permanecem em /financeiro?view=launches. Deep links de edicao preservados.
  Consultas e Comissoes apontam aos relatorios existentes; estas paginas ainda
  nao receberam uma reformulacao estrutural equivalente ao novo overview.
- Dados reais, somente da empresa selecionada; transacoes/vendas carregadas
  por paginas ate a contagem total, sem o antigo limite silencioso de 5000.
  Falha de consulta e explicitada, sem apresentar soma parcial como total.
- Caixa considera apenas pagos, data efetiva paid_at ou due_date, ate hoje.
  A receber/pagar descontam pagamento parcial. Datas e periodos usam Brasilia;
  percentual sem base anterior nao e inventado. Saldo acumulado do grafico
  inclui caixa anterior ao periodo exibido.
- Adaptacoes necessarias: premiacoes previstas de vendas pendentes no quarto
  indicador (nao existe status de liberacao de comissao no schema); autoria
  real como Registrado por, nao responsavel ficticio; nenhum anexo/recibo
  inventado, pois finance_transactions nao oferece essas funcionalidades.
  Mantido logo/navegacao atual da empresa. Nao afirmar copia pixel a pixel.
- Arquivos: components/finance/finance-overview.tsx, finance-navigation.tsx;
  lib/finance/overview.ts e testes; financeiro/page.tsx, consultas/page.tsx;
  types/finance.ts; CSS escopado finance-workspace. Footer compartilhado passou
  a usar tokens para evitar branco quando o tema escuro vem do sistema.
- Validacao: typecheck, lint e 32 testes passaram (7 novos financeiros).
  Navegador conferiu claro/escuro, formulario novo sem salvar, rotinas antigas,
  consulta de comissoes e viewport 390x844 sem overflow da pagina.
  Empresa testada possui categorias/contas, mas zero lancamentos e vendas:
  hover de registros, edicao persistida e grafico com valores nao-zero ainda
  precisam de validacao com registros reais. Nao inserir exemplos ficticios.
