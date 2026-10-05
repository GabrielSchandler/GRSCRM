# Master: empresas, bloqueio e recuperacao

## Estado em 05/10/2026

- Painel /empresas refinado: pesquisa, filtro de status, indicadores reais,
  detalhes laterais, acesso/configuracao e confirmacao pelo nome da empresa.
- Autorizacao pelo is_platform_owner existente, no servidor. O redesign nao
  concede acesso master a outros logins nem depende de um nome hardcoded.
- Bloqueio/suspensao impede o contexto autenticado comum de usuarios nao-master.
  O master continua podendo inspecionar empresas bloqueadas.
- A empresa com perfil master e protegida nos novos controles de ciclo de vida.
- Exclusao recuperavel e limpeza definitiva implementadas em codigo, mas NAO
  ativadas no banco atual. A tabela company_lifecycle esta ausente: o botao de
  exclusao fica desabilitado. Nenhuma empresa foi excluida, bloqueada ou restaurada
  durante a verificacao visual.

## Regra solicitada

Excluir arquiva a empresa e bloqueia seu acesso; nao apaga os dados imediatamente.
Restaurar e permitido antes de purge_after, definido por tres meses de calendario
no banco (nao noventa dias). Restaurar recupera o status anterior. Apos o prazo,
a restauracao e indisponivel e a rotina diaria tenta a limpeza definitiva.
A execucao diaria pode ocorrer ate cerca de 24 horas depois do vencimento.
Falhas preservam o registro de limpeza e permitem nova tentativa; nao prolongam
o prazo de restauracao nem apresentam exclusao incompleta como sucesso.

## Ativacao pendente

1. Revisar docs/sql/company-lifecycle.sql em staging conforme MIGRATION_RULES.
   Requer o schema de companies, company_platform_settings, user_profiles,
   backup_jobs e a funcao current_user_is_platform_owner ja existentes.
2. Auditar TODAS as tabelas dependentes, inclusive relacoes indiretas, politicas
   RLS e arquivos. A rotina recusa FKs diretas sem ON DELETE CASCADE; isso nao
   substitui a auditoria de registros sem FK ou relacionamentos indiretos.
3. Confirmar que todos os objetos Storage da empresa usam company_id como
   primeiro segmento do caminho. Objetos legados fora desse padrao precisam
   de inventario e tratamento antes de habilitar a rotina.
4. Resolver os backups externos. Ha backups reais em GitHub Releases; o SQL
   recusa limpeza quando a empresa possui backup_jobs nesse armazenamento.
   Remover/expirar copias externas com verificacao, inclusive copias compartilhadas
   entre empresas, sem apagar dados de outras empresas. Auditoria de retencao
   em outros provedores tambem e obrigatoria.
5. Aplicar a migracao revisada. Validar archive/restore em empresa de teste,
   permissao comum negada, prazo vencido, retries e remocao de dados/arquivos.
6. Configurar CRON_SECRET seguro no ambiente e no agendador. Somente depois
   das verificacoes anteriores definir COMPANY_PURGE_ENABLED=true.
   vercel.json agenda /api/companies/purge diariamente as 06:00 UTC.

O endpoint requer Bearer CRON_SECRET, processa ate cinco empresas por execucao,
remove arquivos via Storage API e entao remove empresa/dados em transacao.
Identidades Auth somente sao removidas se nao estiverem vinculadas a outro perfil.
Os RPCs destrutivos sao exclusivos de service_role. O guard de status serializa
alteracoes com archive/restore para impedir desbloqueio concorrente de arquivadas.

## Limites de seguranca e verificacao

As politicas restritivas preparadas complementam as politicas de tenant existentes;
nao concedem novos acessos. Ainda precisam ser aplicadas e testadas no banco.
URLs Storage ja assinadas podem permanecer validas ate sua expiracao. Jobs,
webhooks e provedores externos que nao usam o contexto comum exigem auditoria
separada de bloqueio. Nao afirmar revogacao completa antes dessa verificacao.

Testes locais: 51 aprovados em 11 arquivos; TypeScript e lint aprovados.
Cobertura nova: autorizacao master, nome de confirmacao, empresa protegida,
preservacao de modulos no bloqueio, prazo de tres meses, autenticacao da rotina
e falha segura antes de remover Storage. SQL nao foi executado nem validado
contra Postgres nesta entrega. Testes mutaveis ponta a ponta permanecem pendentes.

Capturas de desktop claro/escuro e mobile: outputs/newsec-reference-qa.
Podem conter dados privados: nao publicar automaticamente.
