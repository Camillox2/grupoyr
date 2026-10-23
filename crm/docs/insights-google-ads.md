# Insights e conexão Google Ads — Grupo YR

Aba administrativa: **Insights e Ads**. Períodos de 7, 30 e 90 dias em America/Sao_Paulo; dia atual ainda parcial.

## Indicadores

- Recebimentos: faturas pagas pela data de baixa. Sem data não entram no período.
- Custos: despesas registradas em contractExpenses, pela data informada. Saldo parcial não é lucro.
- Leads: data de criação; origem cadastrada não comprova atribuição de anúncios.
- Contratos assinados: data da assinatura; percentual de leads com contrato conta cada lead uma vez.
- Frota, base mensal de locações assinadas e vigentes, pendências e cobranças vencidas são a situação atual, independentemente do período.
- Alertas determinísticos, sem chamadas Gemini: última interação há 48h, vencimentos, assinaturas e contratos a terminar em até sete dias.

## Google Ads

Conta fixa: 707-147-2143. Integração de relatórios por Google Ads Scripts / GAQL, sem mutações de campanhas, orçamento, lances, faturamento ou conversões.

1. Em Insights e Ads, gerar script como administrador. Isso invalida a chave anterior; guardar o novo código de forma privada.
2. Google Ads → Ferramentas → Ações em massa → Scripts → Novo script.
3. Colar, salvar, autorizar na conta correta e executar. A visualização prévia também faz a transmissão HTTP ao CRM.
4. Conferir confirmação nos registros do script e a última sincronização no CRM.
5. Configurar frequência no Google Ads somente após autorização do responsável. Atualizar no CRM apenas relê o banco, não dispara o Google.
6. Para revogar o envio, gerar uma nova chave no CRM e desativar/remover o script antigo no Google, com autorização do responsável.

O servidor recebe o relatório em /api/integrations/google-ads/ingest com chave restrita no cabeçalho X-YR-Ads-Key. Somente o hash é persistido no Neon; nenhum segredo é retornado pelo endpoint de insights ou exportado em CSV. O código do script contém a chave e não deve ir ao Git, capturas de tela ou mensagens públicas.

Coleta: últimos 186 dias, atualizados por substituição das datas, sem somar relatórios repetidos. Histórico local mantido por até 551 dias; conversões históricas podem mudar por atraso de atribuição. Totais ausentes/incompletos aparecem como indisponíveis, não como zero. CPC, CTR e custo por conversão derivam dos totais da mesma janela. Conversões do Google não são vendas confirmadas do CRM; ROAS/CAC não são inferidos.

A instalação não ativa campanhas nem corrige/valida automaticamente tags de conversão. Confirmar essas tarefas separadamente antes de qualquer alteração de marketing.

## Verificação

- npm run build em client
- npm test em server
- server/test/insights.test.js: datas, recebimentos/custos, frota, locações, coorte, conta fixa, payload, chave, rotação, idempotência, permissões e falhas de persistência.
- QA de navegador deve usar dados fictícios ou cópia de leitura separada, nunca faturas/contratos de teste no Neon de produção.

