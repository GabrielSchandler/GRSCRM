# Banco de dados do GRSCRM

## Fonte e limites desta documentacao

O banco e PostgreSQL no Supabase, acessado por PostgREST/Supabase JS. Supabase
Auth guarda identidades e Supabase Storage guarda arquivos.

Este documento foi derivado de `docs/sql/`, `src/types/` e consultas do codigo.
Nao houve introspeccao do projeto remoto. Portanto:

- existencia no SQL/codigo nao prova aplicacao no ambiente;
- tipos TypeScript nao substituem o schema;
- ordem por nome ou data de arquivo nao e uma cadeia de migrations;
- estado de tabelas, policies, triggers, grants e buckets remotos e
  **A CONFIRMAR**.

## Regra de ouro multiempresa

Toda consulta ou mutacao operacional deve ser limitada a empresa autorizada.

1. Obtenha `companyId` de `getCurrentUserContext()`.
2. Nao aceite `company_id` do formulario como autorizacao.
3. Inclua `company_id` em registros tenant-aware.
4. Em tabelas filhas sem `company_id`, valide o pai (`client_id` ou
   `pre_sale_id`) dentro do tenant.
5. Mantenha RLS como segunda barreira.
6. Ao usar service role, refaca todas essas verificacoes manualmente.

## Identificadores principais

- IDs de entidades: UUID, normalmente `gen_random_uuid()`.
- identidade Auth: `auth.users.id`.
- perfil operacional: `public.user_profiles.id`.
- vinculo: `user_profiles.auth_user_id -> auth.users.id`.
- tenant: `public.companies.id` referenciado por `company_id`.
- protocolo publico: `pre_sales.tracking_protocol`, numerico na regra atual.
- protocolo de simulacao: `financing_calculations.protocol_number`.
- IDs externos/importacoes: campos `legacy_*`, `source_*` e dados brutos.

Nao reutilize protocolo como chave primaria ou autorizacao isolada.

## Entidades principais

### Plataforma e identidade

#### `companies`

Tenant e cadastro institucional: razao/nome, CNPJ, contato, endereco, logo,
textos de simulacao e limite de licencas. Platform owner pode selecionar uma
empresa ativa para operar.

#### `user_profiles`

Perfil ligado ao Auth e a uma empresa. Campos importantes: papel, area,
`legal_role`, capacidade de editar esteira, estado ativo, troca obrigatoria de
senha e `is_platform_owner`.

Nao adicionar senha recuperavel. O SQL de 2026-08-26 remove
`last_set_password` se existir.

#### `company_platform_settings`

Status da conta (`active`, `trial`, `suspended`, `cancelled`), limite de storage
e flags de modulos. Uma linha por empresa.

#### `company_audit_logs`

Historico de operacoes relevantes da empresa. Nao representa log literal de
toda leitura/acesso.

### Comercial e clientes

#### `clients`

Contratante/cliente da assessoria. Contem dados pessoais, contato, endereco,
responsaveis e soft delete (`deleted_at`, `deleted_by`). CPF deve ser tratado no
escopo da empresa conforme regras existentes.

#### `pre_sales`

Oportunidade/contratacao: cliente, consultor, tipo (`emprestimo`, `veiculo`,
`imovel`), status, valores, negociacao, campos juridicos, etapa e protocolo.
Status confirmados incluem `lead`, `pre_venda`, `em_contato`, `em_negociacao`,
`aprovado`, `perdido`, `inativo`, `distrato`.

#### `pre_sale_client_snapshot`

Snapshot dos dados do cliente no contexto da pre-venda. Relacao por
`pre_sale_id`.

#### `pre_sale_debt_holders`

Financiado/titular da divida, que pode ser diferente do cliente. A busca deve
considerar nome/CPF desta entidade sem duplicar a pre-venda.

#### `pre_sale_financial_cases`

Financeira, CNPJ/endereco, numero do contrato, valores, parcelas e bem. Nao ha
coluna `pre_sales.protocol`; use os campos confirmados (`tracking_protocol`,
`legal_protocol`, `contract_number` no caso financeiro) conforme o objetivo.

#### `pre_sale_payments`

Parcelas/pagamentos ligados a pre-venda, com valor, meta, metodo, data e status.

#### `lead_sources` e `leads`

Configuracao de fontes Google Sheets e leads importados. Dedupe por
`(company_id, source_id, source_row_key)`. Sellers enxergam leads atribuidos;
admin/manager gerenciam distribuicao conforme policy proposta.

### Simulacoes

#### `financing_calculations`

Uma linha representa uma simulacao/análise. Guarda entrada, resultados
calculados, protocolo, estado e caminhos de PDF/imagem. Contagens de simulacao
devem contar linhas desta tabela, nao arquivos no Storage.

Artefatos:

- `pdf_storage_path`, `pdf_file_name`;
- `summary_image_storage_path`, `summary_image_file_name`.

### Documentos e comunicacao

#### `document_templates`

Template por empresa, tipo, etapa juridica, HTML e originais DOCX/PDF. Gestao
deve ficar restrita a admin/manager conforme regras atuais.

#### `generated_documents`

Documento criado para pre-venda/cliente/template, com conteudo renderizado,
variaveis, caminhos DOCX/PDF, fonte de renderizacao e erro de conversao.

#### `client_documents`

Arquivo anexado ao cliente e, opcionalmente, a uma pre-venda. Usa soft delete.
Categorias atuais: `documentacao`, `extrajudicial`, `processual`; valores legados
sao normalizados na UI.

Campos de acesso do cliente:

- `client_visibility_requested`;
- `client_download_requested`;
- `client_access_status`;
- solicitante/data e revisor/data/nota.

Download requer visibilidade. Aprovacao requer documento `extrajudicial`,
pre-venda associada e visibilidade solicitada.

#### `email_integrations`, `email_templates`, `email_logs`

Conexao Outlook por usuario/empresa, templates e registro de envio/rascunho.
Tokens ficam criptografados. Logs podem conter destinatarios, assunto, corpo e
anexos; trate como dados sensiveis.

### Timeline, portal e aprovacoes

#### `client_timeline_events`

Historico interno de mudancas relevantes do cliente/pre-venda. Nao deve ser
confundido com publicacao no portal.

#### `client_tracking_updates`

Atualizacoes preparadas para o cliente, com status, data do evento, soft delete,
visibilidade e workflow de aprovacao:

- `not_requested`;
- `pending`;
- `approved`;
- `rejected`.

Um item so e publico quando `visible_to_client = true`,
`approval_status = 'approved'` e nao esta excluido.

#### `public_tracking_rate_limits`

Buckets de rate limit com chave HMAC, janela e tentativas. Sem acesso direto de
anon/authenticated; RPC somente para service role.

### Juridico

#### `legal_workflow_stages`

Etapas configuraveis por empresa. Ha seed de etapas padrao e limite protegido
por trigger.

#### `legal_workflow_bulk_moves` e `legal_workflow_bulk_move_items`

Registro de movimentacoes em massa e itens afetados.

#### `legal_payment_types`, `legal_commission_tiers`, `legal_payments`

Tipos de pagamento, faixas de comissao e pagamentos vinculados a operacao
juridica.

### Financeiro

- `finance_categories`: categorias de receita/despesa.
- `finance_accounts`: contas/bancos/caixa/plataformas/cartoes.
- `finance_transactions`: contas previstas/pagas.
- `finance_sales`: vendas e metas.
- `finance_chargebacks`: estornos/cobrancas.
- `finance_import_batches`: lote de planilha.
- `finance_import_rows`: linhas do lote.
- `finance_audit_logs`: before/after e restauracao.

O SQL proposto restringe o modulo a admin da empresa. Confirme policies reais
antes de ampliar papeis.

### Academy

- `academy_chapter_progress`: progresso por usuario/capitulo.
- `academy_exam_attempts`: tentativas e resultado de prova.

Conteudo dos cursos nao e tabela confirmada; esta em
`src/lib/academy/course.ts`.

### Integracoes, backup e legado

- `totalk_integrations`: token criptografado e configuracao por empresa.
- `backup_jobs`: execucoes, destino, status e metadados.
- `legacy_rd_import`: importacao legada.
- `rd_crm_activity_import` e `rd_crm_activity_import_batches`: referenciadas no
  hardening e scripts de importacao; criacao/base completa **A CONFIRMAR** no
  conjunto atual de SQLs.

## Relacionamentos essenciais

```text
companies
  |-- user_profiles
  |-- clients
  |    |-- pre_sales
  |    |    |-- pre_sale_client_snapshot
  |    |    |-- pre_sale_debt_holders
  |    |    |-- pre_sale_financial_cases
  |    |    |-- pre_sale_payments
  |    |    |-- generated_documents
  |    |    `-- legal_payments
  |    |-- client_documents
  |    |-- client_timeline_events
  |    `-- client_tracking_updates
  |-- financing_calculations
  |-- document_templates
  |-- email_integrations/templates/logs
  |-- legal_workflow_stages
  |-- lead_sources -> leads
  |-- finance_*
  |-- academy_*
  |-- backup_jobs
  `-- company_platform_settings
```

Algumas relacoes podem ser opcionais e nem todos os FKs estao reproduzidos
aqui. Leia o SQL e o codigo da tarefa antes de mudar constraints.

## RLS e funcoes de contexto

Scripts principais:

- `docs/sql/security-multi-tenant-rls.sql`;
- `docs/sql/security-multi-tenant-fix-missing-policies.sql`;
- `docs/sql/security-multi-tenant-audit.sql`;
- `docs/sql/plataforma-multiempresas.sql`;
- SQLs especificos de cada modulo.

Helpers confirmados nos scripts:

- `current_user_profile_id()`;
- `current_user_company_id()`;
- `current_user_is_active()`;
- `current_user_role()`;
- `current_user_is_admin()`;
- `current_user_is_admin_or_manager()`;
- `current_user_is_platform_owner()`;
- `client_belongs_to_current_company(uuid)`;
- `pre_sale_belongs_to_current_company(uuid)`.

Essas functions usam `SECURITY DEFINER` com `search_path` limitado. Preserve
revoke/grant e nao introduza SQL dinamico com dados do usuario.

### Platform owner

`plataforma-multiempresas.sql` adiciona policies cross-tenant para operador da
plataforma. Uma alteracao de RLS precisa considerar policies tenant normais e
policies do platform owner; remover uma delas pode quebrar o SaaS ou abrir dados.

### Filhos sem `company_id`

Pre-venda snapshot, financiados, casos e pagamentos sao escopados por
`pre_sale_id` e helper de ownership. Nao adicione policy que compare coluna
`company_id` inexistente.

### Service role

O cliente admin ignora todas as policies. Use somente em codigo server-only.
Uma `.eq('company_id', companyId)` e necessaria, mas nao suficiente: confirme
que `companyId` veio do contexto confiavel e que IDs pais pertencem a ele.

## Triggers e invariantes relevantes

### Portal do cliente

`protect_client_portal_approval_decisions()`:

- impede usuario nao privilegiado de aprovar/rejeitar;
- protege campos de revisao;
- impede editar materialmente item aprovado sem novo fluxo;
- aplica-se a acompanhamento e documento.

Constraints adicionais exigem:

- download implica visibilidade;
- acompanhamento aprovado implica visibilidade;
- documento aprovado e extrajudicial, visivel e ligado a pre-venda.

### Esteira juridica

- seed de etapas padrao ao criar empresa;
- limite de etapas por empresa;
- atribuicao da primeira etapa a pre-venda quando aplicavel.

### Rate limit

`consume_public_tracking_rate_limit(text, integer, integer)` faz upsert atomico e
retorna se a tentativa esta dentro do limite. So service role deve executa-la.

## Storage

Buckets privados confirmados nos SQLs/codigo:

- `documents`;
- `client-documents`;
- `calculation-reports`;
- bucket de backups: nome exato **A CONFIRMAR** no codigo/ambiente antes de
  alterar policies.

Policies propostas verificam que o primeiro segmento do caminho e o
`company_id` atual. Platform owner possui policies adicionais.

Regras:

- nunca tornar bucket publico;
- caminho deve iniciar com empresa autorizada;
- validar MIME, extensao e tamanho no servidor;
- URLs assinadas devem ter duracao curta;
- metadado no banco e objeto no Storage precisam permanecer coerentes;
- exclusao/restore deve considerar ambos.

## Historico de SQL e aplicacao

`docs/sql/` contem scripts desde abril de 2026 para documentos, usuarios,
pre-vendas, juridico, simulacoes, imports, financeiro, multiempresa, portal,
leads, Academy, ToTalk, seguranca e aprovacoes.

Arquivos mais recentes e criticos:

- `security-hardening-2026-08-26.sql`;
- `usuarios-senha-provisoria.sql`;
- `aprovacoes-portal-cliente.sql`.

Nao ha tabela de historico de migration confirmada. Varios scripts usam
`IF NOT EXISTS`, blocos condicionais e `DROP POLICY IF EXISTS`, mas isso nao os
torna automaticamente seguros para qualquer estado anterior.

Procedimento completo em [MIGRATION_RULES.md](MIGRATION_RULES.md).

## Consultas e indices

Ao adicionar busca/filtro:

- sempre inclua tenant e soft delete;
- normalize CPF/telefone como o fluxo existente espera;
- evite `.or()` montado com entrada sem sanitizacao;
- busque cliente e financiado, deduplicando por pre-venda;
- indices devem refletir tenant primeiro quando a cardinalidade justificar;
- pagina publica deve selecionar apenas colunas necessarias e aplicar limites.

Indices parciais recentes suportam filas de aprovacao e documentos publicos.
Antes de criar indice, confirme os existentes no remoto.

## Dados pessoais e auditoria

Clientes, documentos, emails e simulacoes contem dados pessoais/financeiros.

- nao logar payloads completos ou tokens;
- nao expor CPF/endereco em erro;
- manter soft delete onde ja existe;
- registrar autor/revisor quando o modelo possui os campos;
- auditoria registra alteracoes relevantes, nao toda leitura;
- backups sao altamente sensiveis e devem permanecer privados.

## Checklist antes de mexer no banco

1. Identificar o ambiente e obter autorizacao.
2. Ler este documento e o SQL relacionado.
3. Introspectar tabela, colunas, constraints, indices, triggers, grants e RLS.
4. Mapear impacto em tipos, actions, queries, Storage e integracoes.
5. Verificar tenant normal, seller/manager/admin e platform owner.
6. Preparar preflight, SQL transacional quando possivel e rollback.
7. Fazer backup adequado ao risco.
8. Testar em ambiente nao produtivo.
9. Aplicar uma mudanca por vez e registrar execucao.
10. Validar dados e acesso cruzado depois.
11. Atualizar tipos, testes e documentacao.

## A CONFIRMAR

- quais SQLs foram aplicados em desenvolvimento, homologacao e producao;
- estado real de RLS, FORCE RLS, grants e policies;
- buckets existentes e suas policies atuais;
- constraints/indices legados que nao aparecem nos scripts;
- schema base original de tabelas anteriores a `docs/sql/`;
- rotina oficial e bucket de backup;
- retencao legal e politica de exclusao de dados;
- se os imports RD auxiliares possuem todas as tabelas no ambiente atual.
