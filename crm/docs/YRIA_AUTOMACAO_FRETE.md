# YRIA: contratos automáticos e frete

## Ativação

1. Em **Equipamentos → Preços e tabela de frete**, confira preços e códigos de todos os patrimônios do mesmo modelo.
2. Cadastre a tabela manual por cidade/bairro/código. Os valores são por pedido. Retirada é necessária para locações; zero só quando o serviço for realmente gratuito.
3. Para cotação por API, abra **API de frete e medidas embaladas**. Informe medidas da embalagem em cm, peso em kg e valor segurado em cada patrimônio. Só marque apto a transportadora depois de conferir a adequação do produto.
4. Como administrador, informe o token da própria conta Melhor Envio, CEP de origem e ID de um serviço previamente autorizado. Comece em sandbox, teste e só depois escolha produção. O token fica no servidor e não é devolvido pela API. Também pode ser fornecido por MELHOR_ENVIO_TOKEN no ambiente do servidor.
5. Confira razão social, CNPJ, endereço e e-mail da empresa nas configurações. Validação de dígitos do documento não comprova identidade nem situação cadastral. Revise juridicamente o modelo antes de usar.
6. Em **YRIA**, ative pedido assistido e, se desejado, contratos automáticos. Salve, teste no laboratório e publique. Ambas as opções começam desligadas; o texto personalizado existente é preservado.

## Comportamento

- Só usa preços cadastrados e estoque disponível. Sem modelo inequívoco, preço, quantidade, período ou frete válido, encaminha para um consultor.
- A API Melhor Envio cota por CEPs, peso, dimensões e quantidade, não por rota rodoviária em km. Não emite etiquetas, não compra frete e não inclui montagem. Equipamentos fora dos limites das transportadoras usam tabela manual.
- Em falha/ausência da API, usa a região correspondente da tabela. Sem regra, não inventa frete nem gera contrato. Sandbox nunca é usado como cotação real no WhatsApp.
- Coleta nome completo, CPF/CNPJ, e-mail e endereço, acesso e data solicitada. Escadas, elevadores, negociações, alterações e dúvidas vão para a equipe. Data solicitada não confirma agendamento.
- Antes de gerar, exibe dados/valores e exige a autorização explícita do cliente. Reconferência evita aceitar estoque/preço/frete que mudou.
- Um lote atômico grava contrato não assinado, reserva, parcelas pendentes e mensagem de saída. A mesma tentativa não gera dois contratos.
- O link é enviado pelo transporte WhatsApp já configurado. Sem conexão ou em entrega incerta, fica pendente para conferência/reenvio manual; não há repetição automática de envio incerto.
- Reserva pendente expira após 24 horas. O servidor confere a cada minuto e na inicialização, cancela cobranças pendentes e libera os itens ainda reservados por aquele contrato.
- O próprio cliente lê, aceita e desenha a assinatura no link público. Assinatura não confirma pagamento. Venda passa o item para vendido; locação, para alugado. Cancelar venda assinada não recoloca automaticamente o item no estoque.
- Pagamento e logística continuam dependendo de confirmação real. A YRIA nunca pode marcar “pago” só porque o cliente disse que pagou.
- O laboratório nunca cria documentos, reservas, cobranças ou mensagens de WhatsApp reais.

Documentação do provedor: https://docs.melhorenvio.com.br/docs/cotacao-de-fretes

## Verificação

No servidor: npm test.
No cliente: npm run build.
O teste automático usa dados fictícios e transporte/cotação simulados. Uma cotação real exige credencial válida e conferência do serviço pela equipe.

