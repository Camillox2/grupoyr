/**
 * Quadro 8 (ilustração SVG): o pai descansando na cama hospitalar em um quarto
 * claro e acolhedor, com a filha sentada na poltrona ao lado.
 *
 * Camadas animadas pelo scroll em AtHomeScene.jsx:
 * - .ah-sky-dusk / .ah-sky-night: transição da janela de tarde -> pôr do sol -> noite estrelada
 * - .ah-sunbeams: feixes de sol da tarde que suavizam ao anoitecer
 * - .ah-night-wash: véu azul-marinho suave da noite no interior do quarto
 * - .ah-lamp-glow / .ah-lamp-bulb / .ah-warm-wash: abajur que acende e banha o quarto de luz quente
 *
 * Composição centralizada (x: 240..760) para enquadrar pai, cama, janela,
 * abajur e filha perfeitamente tanto no celular 412px quanto no desktop 1440px.
 */
export default function AtHomeArt() {
  return (
    <svg
      className="athome-art"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Parede clara quente da tarde */}
        <linearGradient id="ahWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9f2e6" />
          <stop offset="1" stopColor="#efe2ce" />
        </linearGradient>
        {/* Piso madeira acolhedor */}
        <linearGradient id="ahFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7b690" />
          <stop offset="1" stopColor="#bf9a73" />
        </linearGradient>
        {/* Céu da tarde */}
        <linearGradient id="ahSkyDay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#94c8e2" />
          <stop offset=".65" stopColor="#cfe8f2" />
          <stop offset="1" stopColor="#f9e3be" />
        </linearGradient>
        {/* Céu de entardecer */}
        <linearGradient id="ahSkyDusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3c527a" />
          <stop offset=".55" stopColor="#c77b68" />
          <stop offset="1" stopColor="#f4ba78" />
        </linearGradient>
        {/* Céu noturno */}
        <linearGradient id="ahSkyNight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#071a31" />
          <stop offset=".7" stopColor="#102b4c" />
          <stop offset="1" stopColor="#1b3e62" />
        </linearGradient>
        {/* Feixe de sol da tarde */}
        <linearGradient id="ahSunbeam" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#fff4cf" stopOpacity=".46" />
          <stop offset="1" stopColor="#fff4cf" stopOpacity="0" />
        </linearGradient>
        {/* Halo quente do abajur quando acende */}
        <radialGradient id="ahLampHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffd98a" stopOpacity=".9" />
          <stop offset=".38" stopColor="#f5b962" stopOpacity=".42" />
          <stop offset=".72" stopColor="#e89e48" stopOpacity=".14" />
          <stop offset="1" stopColor="#e89e48" stopOpacity="0" />
        </radialGradient>
        {/* Clip da janela */}
        <clipPath id="ahWinClip">
          <rect x="330" y="218" width="246" height="232" rx="8" />
        </clipPath>
        {/* Vinheta superior leve para leitura do texto de tarde */}
        <linearGradient id="ahTopScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7eee1" stopOpacity=".92" />
          <stop offset=".32" stopColor="#f7eee1" stopOpacity=".55" />
          <stop offset=".52" stopColor="#f7eee1" stopOpacity="0" />
        </linearGradient>
        {/* Vinheta superior noturna para contraste AAA do texto claro à noite */}
        <linearGradient id="ahNightScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07192e" stopOpacity=".86" />
          <stop offset=".36" stopColor="#07192e" stopOpacity=".56" />
          <stop offset=".6" stopColor="#07192e" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Parede + rodapé + piso */}
      <rect x="0" y="0" width="1000" height="712" fill="url(#ahWall)" />
      <rect x="0" y="694" width="1000" height="20" fill="#e5d6bf" />
      <rect x="0" y="712" width="1000" height="288" fill="url(#ahFloor)" />

      {/* Tapete claro aconchegante */}
      <ellipse cx="495" cy="836" rx="315" ry="54" fill="#f5ecdc" opacity=".88" />

      {/* JANELA RESIDENCIAL (posicionada abaixo da faixa de título para leitura impecável) */}
      <g transform="translate(0 88)">
        {/* Fundo da janela com as 3 camadas de céu */}
        <g clipPath="url(#ahWinClip)">
          <rect x="330" y="218" width="246" height="232" fill="url(#ahSkyDay)" />
          {/* Nuvens suaves da tarde */}
          <g className="ah-clouds" fill="#fffdf8" opacity=".8">
            <ellipse cx="400" cy="306" rx="46" ry="15" />
            <ellipse cx="430" cy="296" rx="30" ry="14" />
            <ellipse cx="520" cy="340" rx="38" ry="12" />
          </g>
          {/* Camada entardecer */}
          <rect className="ah-sky-dusk" x="330" y="218" width="246" height="232" fill="url(#ahSkyDusk)" opacity="0" />
          {/* Camada noite + lua + estrelas */}
          <g className="ah-sky-night" opacity="0">
            <rect x="330" y="218" width="246" height="232" fill="url(#ahSkyNight)" />
            {/* Lua crescente acolhedora */}
            <circle cx="512" cy="276" r="22" fill="#f7e4b2" />
            <circle cx="521" cy="270" r="19" fill="#0c223c" />
            {/* Estrelas sutis */}
            <circle cx="378" cy="264" r="2.2" fill="#fff8de" />
            <circle cx="426" cy="288" r="1.8" fill="#fff8de" />
            <circle cx="468" cy="252" r="2.4" fill="#fff8de" />
            <circle cx="395" cy="336" r="1.6" fill="#fff8de" opacity=".8" />
            <circle cx="545" cy="332" r="2" fill="#fff8de" opacity=".85" />
            <circle cx="445" cy="356" r="1.5" fill="#fff8de" opacity=".7" />
          </g>
          {/* Copa de árvore lá fora na silhueta */}
          <circle cx="364" cy="442" r="56" fill="#2d665c" opacity=".55" />
          <circle cx="542" cy="448" r="46" fill="#275850" opacity=".48" />
        </g>

        {/* Moldura + divisórias da janela */}
        <rect x="326" y="214" width="254" height="240" rx="10" fill="none" stroke="#fffaf1" strokeWidth="12" />
        <line x1="453" y1="218" x2="453" y2="450" stroke="#fffaf1" strokeWidth="8" />
        <line x1="330" y1="334" x2="576" y2="334" stroke="#fffaf1" strokeWidth="8" />
        {/* Cortinas leves nas laterais */}
        <path d="M312 206 H356 Q344 335 352 468 H306 Q312 335 312 206 Z" fill="#f2e6d5" />
        <path d="M550 206 H594 Q594 335 600 468 H554 Q562 335 550 206 Z" fill="#f2e6d5" />
        <rect x="294" y="200" width="318" height="8" rx="4" fill="#7c5d45" />
      </g>

      {/* Feixes diagonais de sol da tarde atravessando o quarto */}
      <polygon className="ah-sunbeams" points="335,318 570,318 725,795 270,795" fill="url(#ahSunbeam)" />

      {/* Planta de interior à esquerda */}
      <g transform="translate(178 608)">
        <path d="M-24 106 L-18 46 L18 46 L24 106 Z" fill="#c78360" />
        <rect x="-24" y="38" width="48" height="12" rx="5" fill="#b4714f" />
        <path d="M0 42 Q-26 6 -40 -26 Q-10 -24 2 14 Z" fill="#0f766e" />
        <path d="M0 42 Q26 2 44 -28 Q12 -22 -2 12 Z" fill="#178b7f" />
        <path d="M0 42 Q-2 -14 4 -54 Q22 -26 6 22 Z" fill="#21a092" />
      </g>

      {/* CRIADO-MUDO + ABAJUR (à esquerda da cama, dentro da área visível 412px) */}
      <g transform="translate(262 592)">
        <rect x="0" y="22" width="76" height="108" rx="8" fill="#8b664b" />
        <rect x="10" y="36" width="56" height="32" rx="4" fill="#76553d" />
        <circle cx="38" cy="52" r="3.5" fill="#e5d0b5" />
        {/* Base do abajur */}
        <ellipse cx="38" cy="20" rx="14" ry="4" fill="#102a4c" />
        <rect x="34" y="-8" width="8" height="28" rx="3" fill="#102a4c" />
        {/* Cúpula do abajur */}
        <path d="M16 -6 L24 -42 H52 L60 -6 Z" fill="#f3e5cf" stroke="#d5c0a3" strokeWidth="2" />
        {/* Brilho interno da cúpula quando o abajur acende */}
        <path className="ah-lamp-bulb" d="M16 -6 L24 -42 H52 L60 -6 Z" fill="#ffe194" opacity="0" />
      </g>

      {/* CAMA HOSPITALAR YR COM O PAI DESCANSANDO SERENO (x: 342..615) */}
      <g transform="translate(340 538)">
        {/* Sombra macia sob os rodízios */}
        <ellipse cx="144" cy="236" rx="158" ry="18" fill="#6d523a" opacity=".28" />

        {/* Estrutura metálica branca + tesoura de elevação + rodízios com trava */}
        <rect x="14" y="168" width="260" height="12" rx="4" fill="#e3eaee" />
        <rect x="26" y="180" width="10" height="44" fill="#cbd5dc" />
        <rect x="252" y="180" width="10" height="44" fill="#cbd5dc" />
        <line x1="72" y1="212" x2="178" y2="176" stroke="#cfd8df" strokeWidth="8" strokeLinecap="round" />
        <line x1="214" y1="212" x2="112" y2="176" stroke="#cfd8df" strokeWidth="8" strokeLinecap="round" />
        <rect x="24" y="212" width="240" height="8" rx="3" fill="#cfd8df" />
        {/* Rodízios */}
        <circle cx="32" cy="226" r="10" fill="#132538" />
        <circle cx="256" cy="226" r="10" fill="#132538" />
        <circle cx="32" cy="226" r="4" fill="#9fb0bd" />
        <circle cx="256" cy="226" r="4" fill="#9fb0bd" />

        {/* Cabeceira e Peseira ABS (estilo real YR) */}
        <rect x="0" y="34" width="22" height="156" rx="8" fill="#eef3f6" stroke="#cfd9e0" strokeWidth="2" />
        <rect x="4" y="50" width="14" height="36" rx="4" fill="#102a4c" opacity=".88" />
        <rect x="264" y="64" width="20" height="126" rx="7" fill="#eef3f6" stroke="#cfd9e0" strokeWidth="2" />
        <rect x="268" y="80" width="12" height="28" rx="3" fill="#102a4c" opacity=".88" />

        {/* Colchão hospitalar verde-esmeralda YR com encosto elevado confortavelmente */}
        <path d="M22 142 L264 142 L264 168 L22 168 Z" fill="#17695a" />
        {/* Seção articulada do encosto elevada */}
        <path d="M20 144 L20 116 L96 78 L112 106 L96 144 Z" fill="#1a7665" />

        {/* Travesseiro macio branco */}
        <ellipse cx="64" cy="84" rx="30" ry="16" fill="#fffdf9" transform="rotate(-26 64 84)" />

        {/* PAI DESCANSANDO SERENO (formas flat acolhedoras, sem feições realistas) */}
        <g>
          {/* Cabeça apoiada no travesseiro */}
          <circle cx="84" cy="78" r="24" fill="#c78e6b" />
          {/* Cabelo grisalho gentil */}
          <path d="M62 72 Q68 49 92 52 Q106 56 105 70 Q92 60 76 64 Z" fill="#d9dde0" />
          {/* Ombro e camiseta confortável */}
          <path d="M88 100 Q114 96 126 118 L110 146 L76 132 Z" fill="#d8e6ee" />
          {/* Cobertor claro acolhedor cobrindo o corpo confortavelmente */}
          <path d="M104 114 Q188 106 264 126 L264 162 L98 162 Z" fill="#f3e6d0" />
          <path d="M104 114 Q146 112 172 122 L166 162 L98 162 Z" fill="#e8d8bd" />
          {/* Mão relaxada sobre o cobertor */}
          <ellipse cx="148" cy="126" rx="12" ry="8" fill="#c78e6b" />
        </g>

        {/* Grades laterais de proteção YR (em primeiro plano, vazadas) */}
        <g fill="#f5f8fa" stroke="#c5d2db" strokeWidth="2.5">
          <rect x="44" y="102" width="96" height="44" rx="14" />
          <rect x="60" y="114" width="24" height="20" rx="5" fill="#17695a" opacity=".2" stroke="none" />
          <rect x="96" y="114" width="28" height="20" rx="5" fill="#17695a" opacity=".2" stroke="none" />

          <rect x="150" y="108" width="94" height="38" rx="12" />
          <rect x="166" y="118" width="24" height="18" rx="5" fill="#f3e6d0" opacity=".45" stroke="none" />
          <rect x="202" y="118" width="24" height="18" rx="5" fill="#f3e6d0" opacity=".45" stroke="none" />
        </g>
        {/* Controle lateral discreto da cama elétrica */}
        <rect x="136" y="138" width="14" height="24" rx="4" fill="#102a4c" />
        <circle cx="143" cy="146" r="2" fill="#25d366" />
        <circle cx="143" cy="154" r="2" fill="#9fd0e6" />
      </g>

      {/* FILHA SENTADA NA POLTRONA AO LADO DA CAMA (x: 618..756) */}
      <g transform="translate(672 768)">
        {/* Sombra da poltrona */}
        <ellipse cx="16" cy="24" rx="76" ry="15" fill="#6d523a" opacity=".26" />
        {/* Poltrona acolhedora */}
        <rect x="-18" y="-142" width="92" height="106" rx="22" fill="#224468" />
        <rect x="-46" y="-66" width="118" height="58" rx="18" fill="#183554" />
        {/* Pés de madeira */}
        <rect x="-34" y="-12" width="10" height="30" rx="4" fill="#7c5a41" />
        <rect x="52" y="-12" width="10" height="30" rx="4" fill="#7c5a41" />

        {/* Filha sentada, postura relaxada virada para o pai */}
        {/* Pernas */}
        <path d="M-26 -58 L-68 -52 Q-78 -50 -78 -36 L-76 14 L-58 14 L-56 -32 L-16 -38 Z" fill="#152436" />
        <ellipse cx="-68" cy="15" rx="16" ry="7" fill="#e6dfd0" />
        {/* Cardigã verde-água (mesma personagem do Ato 1!) */}
        <path d="M-24 -146 Q10 -158 34 -138 L44 -58 Q8 -46 -32 -58 Z" fill="#2c7a74" />
        <path d="M-24 -146 Q-8 -106 -16 -58 L-32 -58 Z" fill="#236560" />
        {/* Pescoço + cabeça serena olhando para o pai */}
        <rect x="-8" y="-168" width="15" height="24" rx="6" fill="#b57b5a" />
        <g transform="rotate(-10 0 -170)">
          <ellipse cx="-4" cy="-192" rx="26" ry="28" fill="#c58c69" />
          <path d="M-30 -196 Q-28 -228 6 -226 Q34 -222 28 -188 Q16 -206 -4 -206 Q-18 -206 -30 -196 Z" fill="#2a1c16" />
          <circle cx="24" cy="-214" r="13" fill="#2a1c16" />
        </g>
        {/* Braço tranquilo segurando uma caneca morna */}
        <path d="M-12 -136 Q-34 -102 -46 -94" stroke="#266e68" strokeWidth="22" strokeLinecap="round" fill="none" />
        <circle cx="-50" cy="-92" r="9" fill="#c58c69" />
        <rect x="-66" y="-104" width="18" height="20" rx="4" fill="#fffaf0" />
        {/* Apoio de braço frontal da poltrona */}
        <rect x="28" y="-92" width="46" height="62" rx="14" fill="#1e3f61" />
      </g>

      {/* Véu suave noturno que entra conforme anoitece lá fora */}
      <rect className="ah-night-wash" x="0" y="0" width="1000" height="1000" fill="#0b2038" opacity="0" />

      {/* Halo de luz quente do abajur que acende e abraça a cena! */}
      <g className="ah-lamp-glow" opacity="0">
        <circle cx="300" cy="566" r="390" fill="url(#ahLampHalo)" />
      </g>

      {/* Vinhetas superiores (tarde clara -> noite azul-marinho) para leitura AAA */}
      <rect className="ah-top-scrim" x="0" y="0" width="1000" height="460" fill="url(#ahTopScrim)" />
      <rect className="ah-night-scrim" x="0" y="0" width="1000" height="520" fill="url(#ahNightScrim)" opacity="0" />
    </svg>
  )
}
