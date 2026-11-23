/**
 * Quadro 3 (ilustração SVG): o quarto de casa improvisado, apertado,
 * cama comum baixa demais para cuidar com conforto. Estilo flat acolhedor,
 * sem feições realistas.
 */
export default function CrampedRoomArt() {
  return (
    <svg
      className="worry-art"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="wrWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#263342" />
          <stop offset="1" stopColor="#1b2634" />
        </linearGradient>
        <linearGradient id="wrWallSide" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#172230" />
          <stop offset="1" stopColor="#202e3d" />
        </linearGradient>
        <linearGradient id="wrFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d2624" />
          <stop offset="1" stopColor="#1a1718" />
        </linearGradient>
        <linearGradient id="wrWinLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8eb4cc" stopOpacity=".24" />
          <stop offset="1" stopColor="#8eb4cc" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wrVignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1822" stopOpacity=".72" />
          <stop offset=".38" stopColor="#0f1822" stopOpacity=".18" />
          <stop offset=".75" stopColor="#0f1822" stopOpacity=".25" />
          <stop offset="1" stopColor="#0f1822" stopOpacity=".85" />
        </linearGradient>
      </defs>

      <g className="worry-art__scene">
        {/* Paredes apertadas (cômodo estreito) */}
        <rect x="0" y="0" width="1000" height="690" fill="url(#wrWall)" />
        {/* Parede lateral esquerda fechando o enquadramento */}
        <polygon points="0,0 165,95 165,715 0,855" fill="url(#wrWallSide)" />
        {/* Guarda-roupa pesado à direita apertando o espaço */}
        <polygon points="820,80 1000,0 1000,860 820,720" fill="#18222e" />
        <rect x="786" y="138" width="170" height="585" rx="4" fill="#2c2422" />
        <line x1="870" y1="150" x2="870" y2="710" stroke="#1e1817" strokeWidth="4" />
        <circle cx="855" cy="435" r="6" fill="#70625b" />
        <circle cx="885" cy="435" r="6" fill="#70625b" />
        {/* Caixas empilhadas no alto do guarda-roupa */}
        <rect x="798" y="88" width="96" height="50" rx="4" fill="#6b5645" />
        <rect x="852" y="48" width="84" height="42" rx="4" fill="#57463a" />

        {/* Piso */}
        <polygon points="0,855 165,715 820,715 1000,855 1000,1000 0,1000" fill="url(#wrFloor)" />
        <line x1="165" y1="715" x2="820" y2="715" stroke="#14181e" strokeWidth="5" />

        {/* Janela pequena semi-fechada com luz fria */}
        <g transform="translate(215 190)">
          <rect x="0" y="0" width="175" height="215" rx="6" fill="#16202b" />
          <rect x="12" y="12" width="151" height="191" rx="3" fill="#46657c" opacity=".7" />
          {/* Veneziana quase fechada */}
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <rect key={i} x="14" y={18 + i * 26} width="147" height="10" fill="#243545" opacity=".78" />
          ))}
          <rect x="84" y="12" width="7" height="191" fill="#1b2734" />
        </g>
        {/* Facho de luz fria oblíquo */}
        <polygon points="227,202 378,202 580,730 280,730" fill="url(#wrWinLight)" />

        {/* Mesinha de cabeceira improvisada (banquinho + sacola de farmácia + papéis) */}
        <g transform="translate(178 585)">
          <rect x="0" y="24" width="112" height="118" rx="6" fill="#4a3c34" />
          <rect x="10" y="38" width="92" height="40" rx="3" fill="#3a2f28" />
          <circle cx="56" cy="58" r="4" fill="#8b7a6f" />
          {/* Papéis da alta / receitas espalhados */}
          <rect x="12" y="10" width="54" height="14" rx="2" fill="#d8d3c8" transform="rotate(-6 39 17)" />
          <rect x="28" y="4" width="46" height="12" rx="2" fill="#ece8de" transform="rotate(4 51 10)" />
          {/* Caixa de remédio */}
          <rect x="74" y="4" width="28" height="20" rx="3" fill="#d2e4e1" />
          <rect x="74" y="10" width="28" height="6" fill="#0f766e" />
        </g>

        {/* CAMA COMUM BAIXA (o ponto central da preocupação: baixa, estreita, sem grade) */}
        <g className="worry-art__bed" transform="translate(290 612) scale(0.84)">
          {/* Sombra no chão */}
          <ellipse cx="245" cy="198" rx="255" ry="26" fill="#090c10" opacity=".62" />
          {/* Cabeceira comum de madeira escura */}
          <rect x="0" y="0" width="24" height="186" rx="5" fill="#433128" />
          <rect x="18" y="26" width="14" height="110" fill="#362720" />
          {/* Peseira baixa */}
          <rect x="466" y="88" width="20" height="98" rx="4" fill="#433128" />
          {/* Base muito baixa próxima ao chão */}
          <rect x="18" y="128" width="452" height="32" rx="4" fill="#4e3a2f" />
          <rect x="28" y="160" width="16" height="26" fill="#362720" />
          <rect x="448" y="160" width="16" height="26" fill="#362720" />
          {/* Colchão comum fino e meio amassado */}
          <path d="M24 94 Q240 84 466 96 L466 132 L24 132 Z" fill="#d9d1c3" />
          {/* Travesseiros empilhados no improviso para tentar elevar o encosto */}
          <rect x="30" y="58" width="76" height="40" rx="16" fill="#c7bfb0" transform="rotate(-14 68 78)" />
          <rect x="52" y="44" width="74" height="36" rx="15" fill="#e5dfd3" transform="rotate(-28 89 62)" />
          {/* Cobertor dobrado desajeitado */}
          <path d="M168 92 Q325 82 468 98 L468 148 Q315 156 172 142 Z" fill="#355068" />
          <path d="M168 92 Q250 100 320 96 L310 144 Q235 148 172 142 Z" fill="#2b4257" />
        </g>

        {/* Seta tracejada discreta marcando a altura baixa da cama e o corredor estreito */}
        <g className="worry-art__marks" stroke="#e8a97a" strokeWidth="2.5" strokeDasharray="7 7" fill="none" opacity=".82">
          {/* Altura baixa */}
          <line x1="718" y1="690" x2="718" y2="770" />
          <path d="M710 699 L718 690 L726 699 M710 761 L718 770 L726 761" strokeDasharray="none" strokeLinecap="round" />
          {/* Aperto entre cama e guarda-roupa */}
          <line x1="704" y1="794" x2="764" y2="794" />
        </g>

        {/* Cadeira comum encostada / improvisada */}
        <g transform="translate(108 678)">
          <rect x="0" y="0" width="14" height="145" rx="4" fill="#3b2f2a" />
          <rect x="0" y="72" width="84" height="14" rx="4" fill="#4c3c35" />
          <rect x="70" y="80" width="12" height="65" rx="3" fill="#3b2f2a" />
          {/* Sacola de hospital sobre a cadeira */}
          <path d="M18 32 L72 32 L76 74 L14 74 Z" fill="#d9e3e6" />
          <path d="M32 32 Q45 14 58 32" fill="none" stroke="#9ab0b8" strokeWidth="4" />
        </g>

        {/* Filha ao lado da cama baixa, curva leve de cansaço/preocupação (sem feições) */}
        <g className="worry-art__daughter" transform="translate(566 862) scale(0.84)">
          <ellipse cx="0" cy="4" rx="68" ry="12" fill="#000" opacity=".36" />
          {/* Pernas */}
          <path d="M-24 -188 L-28 -12 Q-28 -4 -20 -4 L-8 -4 L-2 -188 Z" fill="#172434" />
          <path d="M4 -188 L12 -12 Q12 -4 22 -4 L34 -4 L26 -188 Z" fill="#131f2e" />
          {/* Sapatos */}
          <path d="M-38 -8 Q-34 -16 -20 -16 L-4 -16 L-4 2 L-40 2 Z" fill="#dfd7c8" />
          <path d="M8 -8 Q12 -16 26 -16 L40 -16 L42 2 L8 2 Z" fill="#d3cab9" />
          {/* Tronco levemente inclinado olhando para a cama baixa */}
          <g transform="rotate(-11 0 -190)">
            <path d="M-44 -366 Q0 -386 44 -366 L58 -182 Q0 -168 -58 -182 Z" fill="#296f6a" />
            <path d="M-44 -366 Q-26 -292 -34 -184 L-58 -182 Z" fill="#215e59" />
            {/* Pescoço e cabeça baixa, olhando a cama */}
            <path d="M-9 -392 L9 -392 L11 -364 L-11 -364 Z" fill="#b57b5a" />
            <g transform="rotate(-16 0 -392)">
              <ellipse cx="-4" cy="-420" rx="30" ry="33" fill="#c58c69" />
              <path d="M-34 -424 Q-32 -460 4 -458 Q36 -456 32 -418 Q20 -438 -2 -438 Q-18 -438 -34 -424 Z" fill="#2a1c16" />
              <circle cx="24" cy="-448" r="14" fill="#2a1c16" />
            </g>
            {/* Um braço caído, outro tocando o ombro / testa em gesto de preocupação */}
            <path d="M-40 -354 Q-64 -296 -46 -248" stroke="#22635e" strokeWidth="24" strokeLinecap="round" fill="none" />
            <path d="M36 -354 Q62 -320 26 -388" stroke="#276e68" strokeWidth="23" strokeLinecap="round" fill="none" />
            <circle cx="22" cy="-392" r="10" fill="#c58c69" />
          </g>
        </g>
      </g>

      <rect width="1000" height="1000" fill="url(#wrVignette)" />
    </svg>
  )
}
