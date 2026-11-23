/**
 * Especificacoes fisicas reais (em metros) da cama hospitalar Grupo YR
 * usadas tanto no palco 3D quanto na exportacao 1:1 para AR (.glb / .usdz).
 */
export const BED_SPECS = {
  internalLength: 1.96, // comprimento interno do leito (m)
  internalWidth: 0.89, // largura interna do leito (m)
  externalLength: 2.1, // comprimento externo aproximado com cabeceira/peseira (m)
  externalWidth: 0.99, // largura externa aproximada com grades laterais (m)
  minHeight: 0.48, // altura minima do topo do colchao (m)
  defaultHeight: 0.66, // altura padrao informada (m)
  maxHeight: 0.75, // altura maxima do topo do colchao (m)
  mattressThickness: 0.135,
  caregiverMargin: 0.6, // faixa lateral de circulacao recomendada para o cuidador (m)
}

/** Converte slider lift (0..1) em altura real do topo do colchao em metros. */
export const liftToHeightMeters = (lift) =>
  BED_SPECS.minHeight + Math.min(1, Math.max(0, lift)) * (BED_SPECS.maxHeight - BED_SPECS.minHeight)

/** Valor do slider lift correspondente a altura padrao de 0,66 m. */
export const DEFAULT_LIFT =
  (BED_SPECS.defaultHeight - BED_SPECS.minHeight) / (BED_SPECS.maxHeight - BED_SPECS.minHeight)

/** Pose inicial: altura em 66 cm com leve articulacao convidativa. */
export const REST_POSE = {
  back: 0.56,
  legs: 0.3,
  lift: DEFAULT_LIFT,
}

/** Posicoes clinicas com 1 toque. */
export const CLINICAL_PRESETS = [
  {
    id: 'repouso',
    label: 'Repouso',
    pose: { back: 0.0, legs: 0.0, lift: 0.48 },
  },
  {
    id: 'refeicao',
    label: 'Refeição',
    pose: { back: 0.78, legs: 0.24, lift: DEFAULT_LIFT },
  },
  {
    id: 'pernas',
    label: 'Pernas',
    pose: { back: 0.28, legs: 0.85, lift: 0.55 },
  },
  {
    id: 'cuidado',
    label: 'Cuidado',
    pose: { back: 0.14, legs: 0.08, lift: 1.0 },
  },
]

export const AR_MODELS = {
  eletrica: {
    label: 'Cama elétrica luxo',
    glb: '/models/cama-eletrica-yr.glb',
    usdz: '/models/cama-eletrica-yr.usdz',
    title: 'Cama Hospitalar Elétrica Luxo — Grupo YR',
  },
  manual: {
    label: 'Cama manual 3 movimentos',
    glb: '/models/cama-manual-yr.glb',
    usdz: '/models/cama-manual-yr.usdz',
    title: 'Cama Hospitalar Manual 3 Movimentos — Grupo YR',
  },
}
