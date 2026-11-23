/**
 * Dados reais dos cômodos do Ato 2 (A casa em miniatura).
 * Baseados exclusivamente em src/catalog.js e src/bed3d/specs.js —
 * sem preços, sem números inventados e sem equipamentos fora do catálogo.
 */
import { BED_SPECS } from '../../bed3d/specs.js'

export const ROOM_INFO = {
  quarto: {
    id: 'quarto',
    name: 'Quarto',
    badge: 'Compra ou locação',
    available: true,
    equipmentTitle: 'Cama hospitalar articulada',
    whatIs:
      'Cama hospitalar elétrica ou manual (3 movimentos) com grades de proteção e rodízios com trava — e opção de colchão pneumático por cima.',
    purpose:
      'Eleva encosto, pernas e altura do leito para comer, respirar melhor e descansar com segurança.',
    caregiverHelp:
      'Ajustar a altura do leito (de 48 a 75 cm) poupa a coluna de quem cuida e reduz o esforço em cada mudança de posição.',
    specsNote: `Leito interno ${BED_SPECS.internalLength.toFixed(2).replace('.', ',')} m × ${BED_SPECS.internalWidth.toFixed(2).replace('.', ',')} m · padrão 66 cm.`,
  },
  banheiro: {
    id: 'banheiro',
    name: 'Banheiro',
    badge: 'Compra ou locação',
    available: true,
    equipmentTitle: 'Cadeira de banho',
    whatIs:
      'Estrutura em alumínio (leve de mover e não enferruja) com assento sanitário, apoios de braço e rodízios com trava.',
    purpose:
      'Encaixa sobre o vaso sanitário ou entra direto no box quando ficar em pé no chuveiro deixou de ser seguro.',
    caregiverHelp:
      'Traz firmeza no banho e na higiene sem exigir que o cuidador sustente o peso no piso molhado.',
    specsNote: 'Altura regulável e rodízios com trava. Modelo e disponibilidade confirmados na cotação.',
  },
  sala: {
    id: 'sala',
    name: 'Sala',
    badge: 'Em breve',
    available: false,
    equipmentTitle: 'Novos equipamentos em breve',
    whatIs:
      'Itens de apoio para permanência e circulação na sala ainda estão chegando ao catálogo da YR.',
    purpose:
      'Hoje o atendimento reúne camas hospitalares (elétrica e manual), colchão pneumático (venda) e cadeira de banho.',
    caregiverHelp:
      'Se a sua família está adaptando mais ambientes em casa, nossa equipe orienta o que já temos disponível e o melhor caminho.',
    specsNote: 'Atendimento humano em Curitiba e região.',
  },
}

export const ROOM_ORDER = ['quarto', 'banheiro', 'sala']
