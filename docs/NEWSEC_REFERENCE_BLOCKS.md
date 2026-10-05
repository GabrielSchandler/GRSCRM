# Newsec: blocos de referencias visuais

Atualizado em 2026-10-05. Complementa AI_HANDOFF_NEWSEC_REDESIGN.md.

## Escopo entregue

| Bloco | Rotas | Dados e adaptacoes |
| --- | --- | --- |
| Fontes de leads | /integracoes/leads | Fontes Google Sheets reais, status, fila e configuracoes existentes. Sem estatisticas ficticias de velocidade ou automacao. |
| Documentos | /documentos | Documentos reais, filtros, paginacao, selecao e painel lateral. Previa HTML sanitizada quando disponivel; DOCX usa visualizacao existente, sem capa artificial. |
| Usuarios | /usuarios/novo e /usuarios/[id]/editar | Formulario original reorganizado e resumo dos campos. Autenticacao por login e senha temporaria conforme backend; sem convite por e-mail ou treinamento ficticio. |
| Academy | /academy | Catalogo, capitulos e progresso reais. Sem inventar instrutores, avaliacoes ou contagem de alunos indisponiveis. |
| Pre-venda | /pre-vendas/[id] | Resumo, dados e pagamentos, documentos, valores e atividades reais. Fluxos legais e permissoes preservados. |
| Simulacao | /calculos/[id] | Resultados salvos, comparativo de parcelas, parametros e PDF. Acoes laterais compactas; controles completos na aba PDF. |
| Conta e contexto | /areas | Empresa, areas permitidas, perfil e troca de contexto reais. Sem simular 2FA, dispositivos ou localizacao de acesso. |
| Contratos e templates | /contratos e /documentos/templates | Contratos existentes e templates para perfis autorizados. Sem versoes, revisoes ou uso ficticios. |
| Backups | /backups | Historico, tamanho, expiracao e downloads existentes. Retencao real de sete dias. Soma dos arquivos listados nao representa capacidade total de armazenamento. |

As imagens sao referencias de composicao, cores e hierarquia. Campos, indicadores
e acoes foram adaptados quando nao existem no dominio atual. Nao ha equivalencia
pixel a pixel nem implementacao de funcionalidades ficticias para preencher a tela.

## Componentes compartilhados

- ReferenceCollection: pesquisa sem distinguir acentos, filtros, oito registros
  por pagina, destaque discreto e detalhes por hover, foco ou clique. Painel
  lateral sticky em desktop, com rolagem interna se necessario.
- O hover nao troca os dados durante a edicao de um formulario no painel lateral.
- ReferenceActions: menu compacto que expande dentro da linha, sem corte pela tabela.
- RecordTabs: navegacao por abas e teclado, preservando os formularios montados.
- RevealDetailsButton: abre e foca secoes recolhidas, sem atalhos inoperantes.
- Cores via tokens --ns-* e regras limitadas a reference-page.

## Validacoes realizadas

- npm run test: 39 testes aprovados em oito arquivos.
- npm run typecheck: aprovado.
- npm run lint: aprovado.
- Comparacao visual manual das dez telas (incluindo cadastro/edicao de usuario)
  e da tela auxiliar de templates em claro e escuro, com dados existentes.
- Pesquisa, filtros, selecao, paginacao, abertura de secoes e abas conferidos.
- Simulacao e lista de templates verificadas em 390 x 844, sem transbordamento
  horizontal da pagina; tabelas possuem rolagem horizontal propria.
- Capturas: outputs/newsec-reference-qa. Esses arquivos podem conter dados
  privados do CRM: nao publicar automaticamente.
- Nenhum cadastro, exclusao, restauracao de backup, envio ou alteracao de senha
  executado na verificacao visual. Acoes mutaveis preservadas, mas nao testadas
  ponta a ponta contra os dados reais.

## Continuidade

### Refinamento e master (05/10/2026)

- Tabelas mais compactas, destaque escuro preservado e fatos laterais mais curtos.
- Filtros adicionais de documentos/templates recolhidos sem remover capacidades.
- Menu com contexto Workspace real, rolagem interna e destaque da rota corrigido.
- Pequenos ajustes de contraste, campos, foco e arquivos nas paginas auxiliares;
  nenhum redesign estrutural completo dessas paginas foi feito.
- Tema salvo restaurado quando a navegacao recria a raiz do shell.
- Capturas refinadas dos blocos principais em claro/escuro; formulários auxiliares
  de templates, e-mail, senha e empresa tambem conferidos. Nao equivale a uma
  auditoria ponta a ponta de todas as rotas/dados/perfis do CRM.
- Validacao atual: 51 testes em 11 arquivos, typecheck e lint aprovados.
- Master e limites da ativacao: docs/MASTER_COMPANY_LIFECYCLE.md.

Repositorio: C:\Users\Gabriel\Desktop\PROJETOS\GRS\CRM\GRSCRM.
Execucao local: npm run dev; http://localhost:3000.
Antes de modificar: ler AGENTS.md, DESIGN_SYSTEM.md e o handoff principal.
Preservar alteracoes anteriores e manter filtros de empresa e autorizacao.
