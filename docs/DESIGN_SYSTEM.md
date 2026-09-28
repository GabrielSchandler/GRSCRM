# Padrao visual e UX do GRSCRM

## Escopo

O projeto ainda nao possui biblioteca formal de componentes, tokens completos
ou Storybook. Este documento registra o padrao **real** recorrente no codigo.
Nao invente novos tokens para preencher lacunas; marque decisoes ausentes como
**A DEFINIR**.

Referencias principais:

- `src/app/globals.css`
- `src/components/layout/authenticated-shell.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/sidebar-frame.tsx`
- `src/components/layout/sidebar-nav.tsx`
- `src/components/layout/page-header.tsx`
- `src/components/approvals/client-approval-queue.tsx`
- `src/components/calculations/interest-rate-preview-card.tsx`
- `src/components/clients/client-list.tsx`
- `src/components/pre-sales/pre-sales-kanban.tsx`
- `src/components/legal/legal-kanban.tsx`
- `src/components/shared/change-note-modal.tsx`

## Principios observados

- interface operacional direta, sem hero ou enquadramento de landing page;
- fundo neutro claro, superficies brancas e teal como cor primaria;
- hierarquia por tipografia, borda e espacamento antes de sombras fortes;
- raio contido (`rounded-md`/`rounded-lg`, em geral ate 8 px);
- estados semanticos com texto, cor e icone;
- controles devem ter foco visivel e estados pending/disabled;
- mobile primeiro, evoluindo para grids/sidebar/tabelas no desktop;
- dados sensiveis e acoes perigosas precisam de confirmacao/contexto;
- mudancas operacionais importantes pedem anotacao quando a regra exige.

## Fundacao

### Cores

Paleta recorrente por classes Tailwind:

- fundo da aplicacao: `slate-100` ou `#f7f8fa`;
- superficie: `white`;
- texto forte: `slate-950`;
- texto secundario: `slate-600`/`slate-500`;
- bordas: `slate-200`/`slate-300`;
- primaria: `teal-700`, hover `teal-800`;
- primaria suave: `teal-50`, borda `teal-200`;
- sucesso: `emerald-50/200/700/800`;
- alerta: `amber-50/200/700`;
- erro/perigo: `rose-50/200/700/800` ou `red-*` em calculos.

Nao substituir a paleta por uma familia monocromatica diferente sem tarefa
visual explicita. Cores pontuais definidas diretamente existem no portal; ao
editar, preserve contraste e coerencia.

### Tipografia

`globals.css` usa Arial, Helvetica, sans-serif. Nao ha fonte de UI carregada via
`next/font`. Uma fonte Noto Sans em `public/fonts/` e incluida no tracing para
geracao de artefatos, nao define a tipografia global.

Escala recorrente:

- titulo de pagina: `text-2xl font-semibold`;
- titulo de secao: `text-xl` ou `text-lg font-semibold`;
- titulo de card: `text-base font-semibold`;
- corpo: `text-sm`, frequentemente `leading-6`;
- legenda/metadado: `text-xs`;
- eyebrow: `text-xs`/`text-sm font-semibold uppercase`.

Letter spacing positivo aparece apenas em labels uppercase. Nao usar tracking
negativo nem fonte escalada por largura de viewport.

### Espacamento e largura

- padding de pagina/cabecalho: normalmente `px-4/5/6`, `py-5/6`;
- grupos verticais: `space-y-4`, `space-y-6`;
- gaps: `gap-2`, `gap-3`, `gap-4`, `gap-6`;
- conteudo publico usa `max-w-6xl mx-auto`;
- conteudo autenticado ocupa a area restante do shell.

Uma escala oficial de tokens alem das utilities Tailwind e **A DEFINIR**.

### Bordas, raios e sombras

- inputs/botoes: `rounded-md` ou `rounded-lg`;
- cards/modais: `rounded-lg`;
- borda padrao: `border border-slate-200`;
- sombra: `shadow-sm`; modal pode usar `shadow-2xl`;
- badges de status podem ser pill (`rounded-full`) quando pequenos.

Nao aninhar cards decorativos. Um subbloco com borda deve existir por funcao,
como tabela, permissao, alerta ou grupo repetido.

## Estrutura de pagina autenticada

### Shell

`AuthenticatedShell` usa fundo `slate-100` e layout `md:flex`:

- desktop: sidebar sticky de 288 px (`w-72`) e conteudo flexivel;
- mobile: barra superior com `<details>` para menu;
- footer exibe versao do `package.json`;
- selecao de area/empresa pode esconder a sidebar.

### Sidebar

- superficie branca, borda direita, logo/nome e rotulo do workspace;
- "Tela inicial" e CTA teal preenchido;
- item ativo usa `bg-teal-50 text-teal-900`;
- item comum usa slate e hover neutro;
- icones Lucide de 16 px;
- itens sao filtrados por workspace, papel e modulo habilitado.

Nao use visibilidade da sidebar como unica autorizacao.

### Cabecalho

`PageHeader` e a referencia simples:

- faixa branca com borda inferior;
- eyebrow "CRM SaaS" em teal;
- titulo e descricao curta com largura limitada.

Algumas paginas possuem headers compostos com acoes. Preserve a hierarquia:
identidade/contexto a esquerda, acoes primarias facilmente encontradas.

## Componentes e padroes

### Cards e secoes

Padrao base:

```text
rounded-lg border border-slate-200 bg-white shadow-sm
```

Cards devem representar uma unidade funcional: resumo, item repetido, preview
ou ferramenta. Secoes de pagina nao precisam virar cards automaticamente.

O card de previa de juros e referencia para informacao densa responsiva:
cabecalho teal suave, resumo em `dl`, tabela comparativa, painel lateral,
alerta semantico e nota tecnica.

### Botoes

Primario:

- `bg-teal-700 text-white hover:bg-teal-800`;
- texto `text-sm font-semibold`;
- padding aproximado `px-4 py-2.5/3`;
- foco `ring-2 ring-teal-*`;
- disabled reduz opacidade e bloqueia cursor.

Secundario:

- branco, borda slate, texto slate, hover neutro.

Sucesso/aprovar:

- emerald preenchido.

Perigo/rejeitar/excluir:

- rose, geralmente outline/superficie suave; exclusao destrutiva requer
  confirmacao apropriada.

Icon-only deve ter `aria-label`. A DEFINIR: componente Button unico; hoje as
classes sao repetidas localmente.

### Inputs e formularios

Padrao recorrente:

```text
w-full rounded-md/rounded-lg border border-slate-300 bg-white
px-3 py-2.5/3 text-sm outline-none
focus:border-teal-600 focus:ring-2 focus:ring-teal-100
```

- label visivel e associada ao campo;
- placeholder complementa, nao substitui label;
- helper abaixo do campo quando necessario;
- erro proximo ao campo ou bloco de feedback;
- mascara e normalizacao devem reutilizar helpers;
- campos desabilitados mantem leitura e nao causam layout shift;
- formularios longos usam secoes sem cards aninhados arbitrariamente.

### Busca e filtros

- busca com `type="search"`, icone a esquerda e label `sr-only` quando o contexto
  torna a finalidade clara;
- filtros podem ser tabs/botoes com `role="tablist"` e `aria-selected`;
- contagens ficam em badge interno;
- filtro ativo tem contraste forte;
- busca de pre-venda mostra badges de origem (cliente/financiado).

Filtros devem continuar utilizaveis no mobile com wrap ou empilhamento.

### Tabelas

- container com `overflow-x-auto` quando a largura exceder;
- cabecalho `bg-slate-100`, texto slate e `font-semibold`;
- linhas separadas por `divide-y`/bordas;
- numeros e percentuais alinhados a direita;
- acoes permanecem claras e com alvos adequados;
- hover de linha pode destacar a linha com fundo/borda sem deslocar layout;
- no mobile, usar scroll horizontal ou representacao responsiva validada; nao
  esconder informacao essencial.

### Kanbans

Comercial e Juridico usam colunas horizontais e cards arrastaveis. Regras:

- largura das colunas deve ser estavel;
- drag nao pode ser o unico meio de mover; select/acao equivalente deve existir;
- estado arrastando muda cursor/opacidade, nao dimensoes;
- cards mostram cliente, status/responsaveis/valor e acoes relevantes;
- movimentacao juridica pede anotacao.

Referencias: `pre-sales-kanban.tsx` e `legal-kanban.tsx`.

### Badges

- status pequeno, contraste suficiente e texto explicito;
- pill e aceitavel para status;
- teal para informacao/ativo, emerald sucesso, amber alerta, rose erro;
- nao depender somente da cor.

### Modais

Referencia: `src/components/shared/change-note-modal.tsx` e modal do kanban.

- overlay `bg-slate-950/45`;
- painel branco `max-w-* rounded-lg p-6 shadow-2xl`;
- `role="dialog"`, `aria-modal="true"`, titulo associado;
- foco, Escape e aprisionamento de foco: cobertura uniforme **A DEFINIR**;
- acoes no rodape com borda superior;
- impedir fechamento durante mutacao quando isso evita perda.

### Feedback, loading e erros

- feedback inline com `role="status"` ou `aria-live="polite"`;
- sucesso emerald, erro rose/red, aviso amber;
- loading deve descrever a acao: "Salvando...", "Movendo...";
- botoes ficam desabilitados durante pending;
- nao trocar dimensoes do controle ao mudar o texto;
- mensagens nao devem revelar stack, query ou segredo.

Nao ha componente universal de toast/alerta. Reutilize o padrao do dominio antes
de criar outro. Padronizacao global e **A DEFINIR**.

### Estados vazios

Referencia: fila de aprovacoes e portal.

- area com altura minima estavel;
- borda tracejada opcional;
- icone em superficie suave;
- titulo objetivo e explicacao curta;
- CTA somente quando existe proxima acao real.

### Confirmacoes e justificativas

Operacoes que mudam etapa, arquivam, rejeitam ou afetam o cliente devem pedir
confirmacao/nota quando a regra de negocio exige. Nao reduza esse fluxo a um
clique silencioso durante remodelagem visual.

## Portal publico

`src/app/acompanhamento/page.tsx` e uma experiencia separada, mas usa a mesma
familia teal/slate. Estrutura:

- faixa introdutoria clara;
- formulario de consulta;
- painel de resultado/estado vazio/erro;
- timeline e documentos liberados;
- mensagens de seguranca sem revelar existencia de CPF isolado.

No portal, linguagem deve ser simples. Nunca expor estado interno de aprovacao,
IDs, caminhos de Storage ou detalhes de rate limit.

## Responsividade

Breakpoints observados: `sm`, `md`, `lg` do Tailwind.

- sidebar desktop surge em `md`; menu mobile usa `<details>`;
- grids colapsam para uma coluna e ganham tracks em `sm`/`lg`;
- cabecalhos empilham no mobile;
- listas de acoes usam `flex-wrap`;
- tabelas/kanbans precisam de overflow controlado;
- texto deve quebrar (`min-w-0`, `truncate`, `break-words`) sem sair do pai;
- elementos fixos devem ter dimensoes estaveis.

Toda alteracao visual deve ser conferida ao menos em largura mobile e desktop.

## Acessibilidade minima

- HTML semantico (`header`, `nav`, `main`, `section`, `table`);
- labels e nomes acessiveis;
- `aria-current` na navegacao;
- `aria-live`/`role=status` em feedback dinamico;
- `aria-modal` e titulo em dialogos;
- icones decorativos com `aria-hidden`;
- foco visivel;
- operacao por teclado, especialmente filtros, modais e kanban;
- contraste suficiente e estado nao comunicado so por cor.

Cobertura automatizada de acessibilidade e **A DEFINIR**.

## Coisas que nao devem mudar em uma remodelagem

- visibilidade por papel, workspace e modulo;
- ordem e semantica de campos;
- validacoes, mascaras e defaults;
- busca por cliente/financiado e origem do resultado;
- confirmacoes, anotacoes e auditoria;
- soft delete e estados arquivados;
- autorizacao de portal/documentos;
- contagem de simulacoes por entidade;
- geracao/download de artefatos;
- URLs, parametros e deep links sem plano de compatibilidade.

## O que ainda nao esta formalizado

- tokens de espacamento/tipografia alem do uso Tailwind;
- componentes primitivos universais para Button/Input/Alert/Modal/Table;
- tema escuro;
- padrao unico de toast;
- skeletons globais;
- foco preso e restaurado em todos os modais;
- matriz oficial de telas "migradas" versus "antigas";
- testes visuais automatizados.

Esses itens sao **A DEFINIR**, nao convites para uma refatoracao incidental.

## Checklist visual

1. A tela inicia na tarefa principal, sem apresentacao promocional.
2. Usa shell e `PageHeader`/header equivalente existente.
3. Cores, raios, sombras e tipografia seguem as referencias.
4. Nao ha cards dentro de cards sem funcao.
5. Campos possuem label, erro e foco.
6. Pending/disabled/empty/error/success estao presentes.
7. Conteudo nao muda dimensoes ao atualizar.
8. Funciona em mobile e desktop.
9. Teclado e leitor de tela recebem nomes/estado basicos.
10. Nenhuma regra de negocio foi removida em nome do design.
