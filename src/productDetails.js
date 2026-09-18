// Guias descritivos, nao ficha tecnica. Fotos e modelos sao referencias:
// nenhuma medida, capacidade ou recurso e afirmado aqui sem passar pela
// cotacao. As chaves sao os IDs de src/catalog.js; se o catalogo mudar, ESTE
// arquivo muda junto, senao o site mostra o detalhe de um produto na foto de
// outro. x/y sao percentuais sobre a foto quadrada de public/products/.
const measures = {
  label: 'Medidas',
  title: 'Vai caber no seu espaço?',
  text: 'Peça as dimensões do modelo cotado e compare com portas, corredor, escada e o espaço de circulação do quarto. Medidas e capacidade são confirmadas pela equipe.',
}

export const imageDimensions = { 1: [1200, 1200], 2: [1200, 1200], 3: [1200, 1200], 4: [1200, 1200] }

export const productDetails = {
  // Cama eletrica luxo
  1: [
    { label: 'Encosto', title: 'A posição muda pelo controle', text: 'Na cama elétrica os movimentos são acionados por controle, sem manivela. Consulte quais movimentos o modelo cotado oferece e como funciona em caso de falta de energia.', x: 70, y: 36 },
    { label: 'Grades', title: 'Proteção nas laterais', text: 'A fotografia mostra grades laterais. Confirme o tipo de grade, como ela abaixa para a transferência e a orientação de uso com a equipe de saúde.', x: 43, y: 50 },
    { label: 'Base', title: 'Rodízios e travas', text: 'A base da foto tem rodízios. Confirme as travas e a forma correta de movimentar a cama dentro de casa antes da contratação.', x: 32, y: 87 },
    { ...measures, x: 84, y: 62 },
  ],
  // Cama manual 3 movimentos
  2: [
    { label: 'Manivelas', title: 'Três movimentos, sem tomada', text: 'Os ajustes são feitos pelas manivelas na peseira. Peça à equipe para mostrar qual manivela faz cada movimento no modelo cotado.', x: 63, y: 71 },
    { label: 'Grades', title: 'Proteção nas laterais', text: 'A fotografia mostra grades laterais. Confirme o tipo de grade e como ela abaixa para a transferência.', x: 18, y: 44 },
    { ...measures, x: 40, y: 48 },
  ],
  // Colchao pneumatico
  3: [
    { label: 'Células', title: 'O apoio se alterna', text: 'As células inflam e esvaziam em ciclo, variando os pontos de apoio do corpo. A indicação e o tempo de uso devem seguir a orientação do profissional de saúde responsável.', x: 39, y: 58 },
    { label: 'Compressor', title: 'Fica ao lado da cama', text: 'O compressor trabalha de forma contínua. Confirme a voltagem, o nível de ruído informado e onde ele pode ficar apoiado no quarto.', x: 81, y: 88 },
    { label: 'Uso', title: 'Vai sobre o colchão', text: 'O pneumático é colocado por cima do colchão existente. Confirme as dimensões do modelo para a cama que será usada.', x: 60, y: 38 },
  ],
  // Cadeira de banho
  4: [
    { label: 'Assento', title: 'Assento sanitário', text: 'A fotografia mostra assento com abertura e tampa. Confirme o tipo de assento e a capacidade informada para o modelo cotado.', x: 62, y: 50 },
    { label: 'Apoios', title: 'Braços para sentar e levantar', text: 'Os apoios de braço ajudam na transferência. Confirme se são fixos ou escamoteáveis no modelo cotado.', x: 43, y: 33 },
    { label: 'Rodízios', title: 'Do quarto ao banheiro', text: 'A base da foto tem rodízios. Confirme as travas e se a altura permite encaixar sobre o vaso da sua casa.', x: 37, y: 84 },
    { ...measures, x: 84, y: 40 },
  ],
}
