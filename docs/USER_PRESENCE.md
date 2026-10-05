# Presenca no dashboard de Gestao

## Ativacao

1. No projeto Supabase usado pelo CRM, abrir o SQL Editor.
2. Executar `docs/sql/user-presence.sql`. Requer as tabelas companies e
   user_profiles existentes, inclusive is_platform_owner.
3. Recarregar as abas autenticadas do CRM. A aplicacao nao instala SQL sozinha.
4. Com uma conta ativa em uma aba visivel, aguardar a atualizacao do indicador
   (ate 30s). Testar com duas contas distintas da mesma empresa e outra empresa.
5. Fechar/ocultar as abas de uma conta e confirmar que sai da contagem apos
   90s, mais o intervalo de atualizacao. Desativados nunca sao contados.

Em 05/10/2026 a consulta remota retornou PGRST205: tabela ausente. A escrita de
presenca real e a RLS ainda precisam de homologacao apos aplicar o script.

## Semantica e seguranca

- Contas ativas: user_profiles.is_active=true na empresa selecionada.
- Online: conta ativa com heartbeat nos ultimos 90 segundos. Nao significa
  apenas login efetuado e nao e uma contagem instantanea de conexoes.
- Uma linha por perfil; varias abas da mesma conta nao duplicam a contagem.
- Abas visiveis enviam sinal a cada 40s. Aba oculta nao mantem online; fechar
  navegador ou sair nao exige chamada de logout para limpar outras abas.
- O banco define o horario do sinal, impedindo timestamps futuros enviados
  pelo cliente. RLS permite escrita somente do proprio perfil ativo e empresa.
- Gestores/admins leem a propria empresa. Operador da plataforma usa a empresa
  selecionada autorizada na API. Seu heartbeat pertence a empresa do perfil,
  nao a empresa de um cliente que esteja visualizando.
- Presenca nao gera eventos de auditoria. Sem tabela/erro de consulta, exibir
  indisponivel, nunca inventar usuarios online. API nao possui cache.

## Indicadores do dia

Simulacoes: registros em financing_calculations; pre-vendas: registros em
pre_sales. created_at entre 00:00 e 00:00 seguinte no horario de Brasilia.
Compara o dia atual parcial com ontem completo. Excluir registros tambem os
remove dessas contagens; nao sao totais historicos imutaveis de auditoria.

## Rollback

Desativar o componente UserPresenceHeartbeat no layout antes do rollback.
Remover somente a tabela public.user_presence e a funcao stamp_user_presence
se nao houver outros consumidores. Isso apaga apenas os sinais de presenca;
nenhuma conta, simulacao ou pre-venda. Dashboard voltara a mostrar presenca
indisponivel ate reativar o recurso. Reaplicar o script recria a infraestrutura,
mas nao restaura timestamps antigos (novos sinais os substituem).
