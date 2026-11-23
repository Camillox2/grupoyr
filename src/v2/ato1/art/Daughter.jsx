/**
 * Personagem estilizada: a filha. Sem feições (só formas), flat.
 * Origem (0,0) nos pés; altura ~ 460 unidades.
 * `pose="phone"` olha o celular; `pose="phone-up"` segura o celular perto do rosto.
 */
export default function Daughter({ x = 0, y = 0, scale = 1, glowId = 'phoneGlow', className = '' }) {
  return (
    <g className={`daughter ${className}`} transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="4" cy="2" rx="78" ry="12" fill="#000" opacity=".28" />
      {/* pernas */}
      <path d="M-30 -196 L-33 -14 Q-33 -6 -25 -6 L-12 -6 Q-6 -6 -6 -14 L-2 -196 Z" fill="#1b2a3c" />
      <path d="M2 -196 L8 -14 Q8 -6 16 -6 L28 -6 Q34 -6 33 -14 L30 -196 Z" fill="#17253a" />
      {/* sapatos */}
      <path d="M-40 -10 Q-38 -18 -24 -18 L-6 -18 Q-2 -18 -2 -10 L-2 0 L-42 0 Q-44 -4 -40 -10 Z" fill="#e9e1d2" />
      <path d="M6 -10 Q8 -18 20 -18 L36 -18 Q42 -18 44 -10 L46 0 L6 0 Z" fill="#e1d8c7" />
      {/* casaco longo (cardigã) */}
      <path d="M-48 -378 Q0 -398 48 -378 L66 -184 Q2 -166 -66 -184 Z" fill="#2c7a74" />
      <path d="M-48 -378 Q-30 -300 -40 -186 L-66 -184 Z" fill="#256c67" />
      {/* blusa por baixo */}
      <path d="M-18 -380 L0 -326 L18 -380 Z" fill="#efe4d1" />
      <path d="M-4 -330 L-10 -186 L10 -186 L4 -330 Z" fill="#256c67" opacity=".55" />
      {/* bolsa transversal */}
      <path d="M-40 -372 L58 -232" stroke="#7b4f33" strokeWidth="7" strokeLinecap="round" />
      <rect x="40" y="-246" width="46" height="54" rx="11" fill="#93623f" />
      <rect x="40" y="-246" width="46" height="16" rx="8" fill="#7b4f33" />
      {/* pescoço e cabeça inclinada para o celular */}
      <path d="M-9 -404 L9 -404 L11 -376 L-11 -376 Z" fill="#b57b5a" />
      <g transform="rotate(14 0 -404)">
        <ellipse cx="4" cy="-432" rx="31" ry="34" fill="#c58c69" />
        {/* cabelo preso com coque */}
        <path d="M-28 -436 Q-30 -474 6 -472 Q40 -470 36 -432 Q24 -452 2 -452 Q-14 -452 -28 -436 Z" fill="#2a1c16" />
        <path d="M-28 -436 Q-34 -414 -22 -400 Q-30 -420 -18 -440 Z" fill="#2a1c16" />
        <circle cx="-26" cy="-466" r="15" fill="#2a1c16" />
      </g>
      {/* braços dobrados segurando o celular */}
      <path d="M-44 -370 Q-66 -300 -40 -270 Q-22 -262 -6 -300" stroke="#27706a" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M44 -370 Q62 -300 38 -272 Q20 -266 8 -302" stroke="#27706a" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="-4" cy="-304" r="11" fill="#c58c69" />
      <circle cx="8" cy="-306" r="11" fill="#c58c69" />
      {/* celular + brilho no rosto */}
      <g transform="rotate(-14 2 -318)">
        <rect x="-12" y="-342" width="28" height="44" rx="6" fill="#0b1826" />
        <rect className="daughter__screen" x="-9" y="-338" width="22" height="36" rx="4" fill="#9fe6ff" />
      </g>
      <ellipse className="daughter__glow" cx="6" cy="-372" rx="78" ry="70" fill={`url(#${glowId})`} />
    </g>
  )
}
