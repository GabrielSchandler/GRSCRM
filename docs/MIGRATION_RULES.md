# Regras de migracao e remodelagem

## Escopo duplo

Neste projeto, "migracao" pode significar:

1. remodelar uma tela antiga para o padrao visual atual; ou
2. alterar/aplicar schema, dados, RLS ou Storage no Supabase.

Os procedimentos sao separados abaixo. Em ambos, o principio e o mesmo:
preservar comportamento confirmado e reduzir mudancas simultaneas.

# Parte I - Remodelagem de telas

## Objetivo

Transformar uma tela existente para o padrao atual sem reinventar design,
alterar regra de negocio, perder campos, reduzir autorizacao ou quebrar mobile.

## Principios obrigatorios

1. A remodelagem e visual/estrutural; mudanca funcional precisa ser explicitada
   e tratada separadamente.
2. Antes de editar, documente o comportamento atual observavel.
3. Preserve rotas, query params, Server Actions e contratos de dados.
4. Reutilize o shell, componentes e helpers existentes.
5. Nao mova regra de autorizacao para o client.
6. Nao remova estados raros porque nao aparecem no exemplo feliz.
7. Nao esconda informacao essencial no mobile.
8. Nao use drag, hover, cor ou icone como unico mecanismo de interacao.
9. Mantenha dimensoes estaveis em filtros, tabelas, kanbans e botoes.
10. Valide equivalencia funcional antes de considerar a tela migrada.

## Levantamento antes da mudanca

Para a tela alvo, registre:

- rota e papeis que podem acessa-la;
- workspace e modulo da empresa que a habilitam;
- queries, Server Actions e tabelas;
- campos exibidos/editados e valores default;
- validacoes, mascaras e mensagens;
- filtros, busca, ordenacao e paginacao;
- estados de loading, vazio, erro, sucesso e pending;
- acoes destrutivas, confirmacoes e anotacoes;
- links/deep links e parametros;
- soft delete, arquivamento e restauracao;
- comportamento em mobile;
- logs/timeline/auditoria produzidos;
- testes existentes.

Se algo nao puder ser confirmado, marque **A CONFIRMAR**. Nao complete por
intuicao.

## Padrao visual de destino

Use [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Resumo:

- shell autenticado com sidebar responsiva;
- fundo slate claro e superficies brancas;
- teal como primaria;
- `rounded-md`/`rounded-lg`, borda slate e sombra discreta;
- cabecalho com titulo/descricao e acoes contextualizadas;
- tipografia e espacamento por utilities ja usadas;
- estados semanticos com texto, icone e cor;
- foco visivel e controles acessiveis.

Nao crie uma nova linguagem visual dentro de uma tela isolada.

## Componentes a reutilizar

Antes de criar componente, procure em:

- `src/components/layout/` para shell/header/sidebar;
- `src/components/shared/` para modais compartilhados;
- `src/components/clients/` para busca, status, timeline e feedback;
- `src/components/pre-sales/` para listas, kanban, status e origem de busca;
- `src/components/legal/` para kanban, etapas e pagamentos;
- `src/components/documents/` e `client-documents/` para arquivos;
- `src/components/calculations/` para formularios, preview e artefatos;
- `src/components/approvals/` para fila, filtros e permissoes.

Reutilizar nao significa forcar componente inadequado. Extraia primitivo somente
quando houver repeticao real e contrato claro.

## Estrutura de pagina

1. Mantenha o `AuthenticatedShell` do layout.
2. Use `PageHeader` quando o formato simples atende; para header composto,
   preserve a mesma hierarquia visual.
3. Posicione a acao primaria perto do titulo ou do inicio da tarefa.
4. Use secoes sem moldura quando apenas agrupam conteudo.
5. Use card para unidade funcional, item repetido, preview ou ferramenta.
6. Evite card dentro de card.
7. Restrinja largura somente quando melhora leitura/formulario; tabelas e
   kanbans podem precisar da largura disponivel.

## Tabelas e listas

- preserve todas as colunas/acoes essenciais;
- mantenha identificacao da origem em buscas de cliente/financiado;
- use hover de linha sem alterar tamanho;
- alinhe valores numericos a direita;
- use overflow horizontal ou layout alternativo validado no mobile;
- preserve paginacao, ordenacao, filtros e limites;
- mantenha `key` estavel por ID;
- nao transforme uma consulta paginada em carregamento total por conveniencia.

## Filtros e busca

- mantenha semantica, normalizacao e combinacao de filtros;
- busca deve aceitar os mesmos campos anteriores;
- use label acessivel, placeholder claro e debounce somente se necessario;
- filtros ativos precisam ficar evidentes;
- reset deve restaurar defaults reais;
- query params existentes devem ser preservados quando fazem parte do fluxo.

## Formularios

- preserve nome, tipo, obrigatoriedade, default e ordem logica dos campos;
- reutilize Zod, React Hook Form, mascaras e parsers existentes;
- nunca confiar apenas na validacao client-side;
- mantenha campos condicionais e dados legados;
- pending deve impedir envio duplicado;
- erro deve ficar perto da origem e o valor digitado nao deve sumir;
- nao alterar payload de Server Action durante tarefa puramente visual.

## Modais

- use modal apenas para tarefa curta, confirmacao ou detalhe contextual;
- preserve `role="dialog"`, `aria-modal`, titulo e foco;
- a acao destrutiva fica distinta da de cancelar;
- se a regra exige justificativa, ela continua obrigatoria;
- nao fechar silenciosamente durante mutacao;
- mobile deve ter largura/altura utilizavel e scroll interno quando necessario.

## Navegacao

- preserve URL, route group, redirecionamentos e autorizacao;
- sidebar e aparencia, nao barreira unica de acesso;
- item ativo deve continuar correto em subrotas;
- respeite workspace e modulo habilitado;
- nao mover pagina entre workspaces sem decisao de produto.

## Estados obrigatorios

Toda tela remodelada deve cobrir, quando aplicavel:

- carregando;
- vazio inicial;
- vazio por filtro;
- erro recuperavel;
- erro de permissao;
- sucesso;
- mutacao em andamento;
- dado arquivado/inativo;
- integracao/tabela ausente;
- conteudo longo e dados incompletos.

## Responsividade

Validar pelo menos:

- mobile estreito;
- tablet/breakpoint da sidebar;
- desktop comum;
- conteudo com nomes/valores longos.

Confira overflow, quebra de texto, ordem de acoes, areas de toque, menu mobile,
tabelas e modais. Nao reduza fonte por largura de viewport para fazer caber.

## Coisas que nao podem mudar

- isolamento multiempresa e capacidades por papel;
- contratante versus financiado;
- busca de ambos sem duplicidade;
- status e transicoes de pre-venda/juridico;
- notas obrigatorias e timeline;
- regras de aprovacao do portal;
- visibilidade versus download de documentos;
- categorias de documento;
- soft delete e restauracao;
- formulas/metricas de simulacao;
- geracao de PDF/imagem;
- logs/auditoria relevantes;
- contratos de integracao;
- nomes de campos/rotas usados externamente.

## Procedimento recomendado

1. Ler `AGENTS.md`, este documento e o design system.
2. Verificar `git status` e preservar mudancas existentes.
3. Mapear comportamento e autorizacao da tela.
4. Capturar referencia visual atual, se possivel.
5. Definir escopo e criterios de equivalencia.
6. Escolher componentes de referencia.
7. Migrar em partes pequenas sem reescrever actions/regras.
8. Conferir todos os estados e papeis.
9. Rodar typecheck, testes e lint; build conforme risco.
10. Verificar visualmente mobile/desktop e console.
11. Revisar diff procurando remocoes acidentais.
12. Atualizar documentacao/estado somente depois da validacao.

## Telas de referencia atuais

O repositorio nao possui uma matriz oficial de telas migradas. Portanto, nao se
declara uma tela como "nova" ou "antiga" sem decisao explicita.

Referencias uteis pelo padrao atual:

- fila de aprovacoes: filtros, vazio, feedback e permissoes;
- previa de juros: informacao densa e responsiva;
- portal de acompanhamento: fluxo publico e estados seguros;
- listas de clientes/pre-vendas: busca, status e acoes;
- kanban juridico: cards, drag, alternativa por select e modais de justificativa;
- selecao de areas/empresas: telas sem sidebar.

Telas pendentes de migracao: **A DEFINIR** por inventario visual e prioridade de
produto. Nao inferir apenas pela idade do arquivo.

## Validacao pos-remodelagem

### Funcional

- comparar campo por campo e acao por acao;
- criar, editar, buscar, filtrar, paginar e arquivar conforme o modulo;
- verificar side effects, logs e timeline;
- testar integracao/documento quando tocados.

### Autorizacao

- sem sessao;
- seller comercial e juridico;
- manager/admin;
- platform owner com e sem empresa ativa;
- tentativa de tenant diferente.

### Visual e acessibilidade

- mobile/desktop;
- teclado e foco;
- labels, dialogos e feedback dinamico;
- texto longo, vazio, loading e erro;
- ausencia de layout shift.

### Tecnica

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Use os comandos proporcionais ao risco, mas uma remodelagem ampla deve incluir
os quatro quando o ambiente permitir.

# Parte II - Mudancas de banco

## Estado atual

Nao existe framework de migration nem comando `db migrate` confirmado. Os SQLs
sao arquivos manuais em `docs/sql/`, geralmente escritos para o SQL Editor do
Supabase. A aplicacao por ambiente nao e registrada no Git.

## Regras obrigatorias

1. Nao executar SQL em ambiente real sem autorizacao explicita.
2. Nao executar todos os arquivos em lote.
3. Nao presumir ordem apenas por data/nome.
4. Nao confiar em `IF NOT EXISTS` como prova de idempotencia completa.
5. Fazer introspeccao antes da alteracao.
6. Proteger dados, RLS, grants, triggers, indices e Storage.
7. Considerar usuario tenant e platform owner.
8. Preparar rollback de estrutura e plano para dados irreversiveis.
9. Nunca colocar secrets no SQL versionado.
10. Registrar o que foi aplicado fora do chat.

## Formato recomendado para novo SQL

Um novo arquivo em `docs/sql/` deve conter:

- objetivo e pre-requisitos;
- ambiente/ordem relativa quando confirmados;
- preflight ou checagens de existencia;
- `begin/commit` quando a operacao permitir;
- alteracoes de tabela/indices;
- RLS/policies/grants/functions/triggers relacionados;
- backfill explicito e analisado;
- validacoes pos-aplicacao;
- rollback comentado quando seguro;
- observacoes de operacao manual.

Nome sugerido: descritivo em kebab-case. Convencao de timestamp e **A DEFINIR**;
nao renomeie o historico sem necessidade.

## Preflight

Antes de aplicar, confirmar no ambiente:

- tabela e colunas existentes/tipos/defaults/nullability;
- constraints e FKs;
- indices e duplicidades;
- triggers/functions e sua definicao;
- RLS habilitada, policies e grants;
- volume de linhas e duracao esperada;
- dados invalidos para a nova constraint;
- buckets/policies de Storage;
- dependencias de codigo ja implantadas.

## Ordem de deploy

Escolha conforme compatibilidade:

- mudanca aditiva: normalmente banco compativel primeiro, depois codigo;
- backfill: coluna nullable/default seguro, backfill em lotes, validacao, depois
  constraint;
- remocao/rename: implantar codigo que tolera ambos, migrar dados, remover uso e
  somente depois excluir;
- RLS: criar/testar policies antes de depender delas; service role nao valida RLS;
- trigger: testar inserts/updates antigos e novos;
- Storage: criar bucket privado e policies antes de habilitar upload.

Nunca torne producao incompativel entre passos.

## RLS e tenant

Toda mudanca deve testar:

- usuario ativo da propria empresa;
- usuario de outra empresa;
- perfil inativo;
- seller versus manager/admin;
- platform owner;
- tabela filha sem `company_id`;
- service role com filtro manual.

Ao substituir policy, enumere as policies atuais. `DROP POLICY IF EXISTS` pode
remover uma protecao customizada do ambiente se usado sem auditoria.

## Backfill e dados

- conte e amostre linhas antes/depois;
- nao sobrescreva valor existente sem condicao;
- backfill deve ser repetivel ou ter marcador;
- evite lock longo; planeje lotes para tabelas grandes;
- constraint nova so entra depois de validar todos os dados;
- mudanca de status deve preservar historico e responsaveis;
- dados pessoais removidos nao possuem rollback real sem backup.

## Validacao pos-aplicacao

1. Confirmar colunas, tipos, defaults e constraints.
2. Confirmar functions/triggers por definicao, nao so por nome.
3. Confirmar RLS, policies e grants.
4. Executar casos de tenant/papel.
5. Verificar indices e plano das consultas criticas.
6. Rodar fluxo funcional afetado.
7. Rodar `npm run typecheck`, `npm test` e build conforme risco.
8. Registrar ambiente, arquivo, horario e resultado.
9. Atualizar `docs/DATABASE.md` e `AGENTS.md` quando o estado mudar.

## SQLs prioritarios a confirmar

- `docs/sql/security-hardening-2026-08-26.sql`;
- `docs/sql/aprovacoes-portal-cliente.sql`;
- cadeia de multiempresa/RLS de junho e julho;
- buckets privados e policies de Storage;
- tabelas opcionais de financeiro, Academy, leads, ToTalk e backups.

Aplicacao nos ambientes atuais: **A CONFIRMAR**.

## Caminho futuro para migrations formais

Adotar migrations formais pode reduzir o risco, mas nao deve ser feito como
refatoracao incidental. Antes:

1. introspectar cada ambiente;
2. definir um baseline aceito;
3. reconciliar scripts manuais e divergencias;
4. escolher ferramenta e politica de ambientes;
5. testar restore e rollback;
6. somente entao iniciar historico automatizado.

Ferramenta, responsavel e calendario: **A DEFINIR**.
