/**
 * Catalogo comercial do Grupo YR.
 *
 * Quatro itens, que sao os que efetivamente vendem. Regra de modalidade
 * definida pela operacao: o colchao pneumatico e SO VENDA (item de contato
 * direto com a pele, nao volta para o estoque de locacao); os demais sao
 * venda e locacao.
 *
 * `room` posiciona a peca na cena do quarto que se monta na home: a ordem do
 * array e a ordem em que os itens entram conforme o visitante rola.
 */

export const products = [
  {
    id: 1,
    slug: 'cama-eletrica-luxo',
    name: 'Cama elétrica luxo',
    short: 'Cama elétrica',
    category: 'Camas',
    description:
      'Articulação por controle, elevação de altura e grades de proteção. A posição muda sem esforço do cuidador nem do paciente.',
    image: '/products/cama-eletrica-luxo.webp',
    // Foto em resolucao cheia para a cena de abertura; `focus` e o ponto que
    // o object-fit preserva quando a moldura corta a imagem.
    scene: '/products/cena-cama-eletrica.webp',
    focus: '50% 60%',
    sale: true,
    rent: true,
    featured: true,
    idealFor:
      'Permanência mais longa em casa, cuidador sozinho, pessoa com pouca mobilidade ou dor ao ser reposicionada.',
    benefits: [
      'Muda de posição pelo controle, sem manivela',
      'Altura regulável poupa a coluna de quem cuida',
      'Grades laterais e rodízios com trava',
    ],
    room: { step: 1, label: 'A cama chega' },
  },
  {
    id: 2,
    slug: 'cama-manual-3-movimentos',
    name: 'Cama manual 3 movimentos',
    short: 'Cama manual',
    category: 'Camas',
    description:
      'Três movimentos por manivela: encosto, pernas e altura. A opção mais direta para quem precisa de articulação sem depender de energia.',
    image: '/products/cama-manual-3-movimentos.webp',
    // Foto em resolucao cheia para a cena de abertura; `focus` e o ponto que
    // o object-fit preserva quando a moldura corta a imagem.
    scene: '/products/cena-cama-manual.webp',
    focus: '50% 62%',
    sale: true,
    rent: true,
    idealFor:
      'Recuperação por período definido, quartos sem tomada próxima e orçamentos mais enxutos.',
    benefits: [
      'Três movimentos independentes',
      'Não depende de tomada nem de bateria',
      'Manutenção simples e peça robusta',
    ],
    room: { step: 1, label: 'A cama chega' },
  },
  {
    id: 3,
    slug: 'colchao-pneumatico',
    name: 'Colchão pneumático',
    short: 'Colchão pneumático',
    category: 'Prevenção',
    description:
      'Compressor alterna a pressão entre as células em ciclo contínuo, variando os pontos de apoio do corpo ao longo do dia.',
    image: '/products/colchao-pneumatico.webp',
    // Foto em resolucao cheia para a cena de abertura; `focus` e o ponto que
    // o object-fit preserva quando a moldura corta a imagem.
    scene: '/products/cena-colchao.webp',
    focus: '50% 58%',
    // Item de contato direto com a pele: sai apenas em venda.
    sale: true,
    rent: false,
    idealFor:
      'Permanência longa na cama, mobilidade muito reduzida e situações em que a equipe de saúde orienta alternar os pontos de apoio.',
    benefits: [
      'Alternância contínua dos pontos de apoio',
      'Compressor silencioso, fica na cabeceira',
      'Vai sobre o colchão que já existe',
    ],
    room: { step: 2, label: 'O colchão entra' },
  },
  {
    id: 4,
    slug: 'cadeira-de-banho',
    name: 'Cadeira de banho',
    short: 'Cadeira de banho',
    category: 'Higiene',
    description:
      'Estrutura em alumínio com assento sanitário, apoios de braço e rodízios. Encaixa sobre o vaso ou vai direto para o box.',
    image: '/products/cadeira-banho.webp',
    // Foto em resolucao cheia para a cena de abertura; `focus` e o ponto que
    // o object-fit preserva quando a moldura corta a imagem.
    scene: '/products/cena-cadeira-banho.webp',
    focus: '58% 55%',
    sale: true,
    rent: true,
    idealFor:
      'Banho e higiene com segurança quando ficar em pé no chuveiro deixou de ser possível.',
    benefits: [
      'Altura regulável e rodízios com trava',
      'Encaixa sobre o vaso ou entra no box',
      'Alumínio: não enferruja e é leve de mover',
    ],
    room: { step: 3, label: 'O banho fica seguro' },
  },
]

export const faqs = [
  {
    q: 'É melhor comprar ou alugar um equipamento hospitalar?',
    a: 'Depende principalmente do tempo de uso, da frequência e do orçamento. A locação costuma fazer mais sentido para necessidades temporárias. A compra tende a ser mais interessante quando o uso será prolongado ou recorrente. A equipe da YR pode ajudar a comparar as duas opções antes de você decidir. O colchão pneumático é o único item oferecido apenas para compra, por ser de contato direto com a pele.',
  },
  {
    q: 'A YR atende pessoas físicas e empresas?',
    a: 'Sim. O atendimento foi pensado tanto para famílias e cuidadores quanto para clínicas, consultórios e outras operações profissionais de saúde.',
  },
  {
    q: 'Posso pedir orientação antes de escolher o produto?',
    a: 'Sim. Você pode explicar o cenário, o período de uso e a necessidade principal. A proposta da YR é tornar a escolha mais simples, sem exigir que o cliente já saiba exatamente qual modelo precisa.',
  },
  {
    q: 'Como funciona a entrega?',
    a: 'Prazo, região atendida e condições de entrega são confirmados na cotação, conforme o produto e a disponibilidade. Assim, tudo fica alinhado antes da contratação.',
  },
  {
    q: 'Os valores aparecem no site?',
    a: 'Os valores são informados por cotação. Isso permite considerar disponibilidade, modalidade de compra ou locação, período de uso e condições de entrega antes de fechar.',
  },
]

export const productPath = (product) => `/equipamentos/${product.slug}`

/** Rotulo de modalidade, derivado das flags (nunca escrito a mao na tela). */
export const modalityLabel = (product) =>
  product.rent && product.sale ? 'Compra e locação' : product.rent ? 'Locação' : 'Compra'
