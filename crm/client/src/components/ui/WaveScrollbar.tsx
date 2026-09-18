import React, { useEffect, useRef, useState } from 'react'

/**
 * Barra de rolagem horizontal em forma de onda.
 *
 * A barra nativa nao aceita formato, entao esta e uma barra propria, ligada a
 * um elemento rolavel: o trilho e uma onda cor de areia e o trecho visivel
 * aparece pintado de azul. Os dois usam a MESMA mascara de onda; o trecho azul
 * desloca a mascara pelo proprio `left`, entao a fase das duas ondas coincide
 * e o azul parece apenas "acender" um pedaco do trilho.
 *
 * E um atalho de ponteiro: a rolagem por teclado, roda do mouse e toque
 * continua sendo a do proprio elemento, por isso a barra e aria-hidden.
 */
export const WaveScrollbar: React.FC<{ target: React.RefObject<HTMLElement | null> }> = ({ target }) => {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [thumb, setThumb] = useState({ left: 0, width: 0, visible: false })
  const drag = useRef<{ startX: number; startScroll: number } | null>(null)

  useEffect(() => {
    const element = target.current
    const track = trackRef.current
    if (!element || !track) return undefined

    const measure = () => {
      const overflow = element.scrollWidth - element.clientWidth
      if (overflow <= 1) {
        setThumb((current) => (current.visible ? { left: 0, width: 0, visible: false } : current))
        return
      }
      const trackWidth = track.clientWidth
      const width = Math.max(56, (element.clientWidth / element.scrollWidth) * trackWidth)
      const left = (element.scrollLeft / overflow) * (trackWidth - width)
      setThumb({ left, width, visible: true })
    }

    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const observer = 'ResizeObserver' in window ? new ResizeObserver(measure) : null
    observer?.observe(element)
    observer?.observe(track)
    // O conteudo (colunas) tambem muda de largura: observa o primeiro filho.
    if (element.firstElementChild) observer?.observe(element.firstElementChild)
    window.addEventListener('resize', measure)
    return () => {
      element.removeEventListener('scroll', measure)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [target])

  const scrollToRatio = (ratio: number) => {
    const element = target.current
    if (!element) return
    element.scrollLeft = ratio * (element.scrollWidth - element.clientWidth)
  }

  const onThumbDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = target.current
    if (!element) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startScroll: element.scrollLeft }
  }

  const onThumbMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = target.current
    const track = trackRef.current
    if (!drag.current || !element || !track) return
    const free = track.clientWidth - thumb.width
    if (free <= 0) return
    const overflow = element.scrollWidth - element.clientWidth
    element.scrollLeft = drag.current.startScroll + ((event.clientX - drag.current.startX) / free) * overflow
  }

  const onThumbUp = () => {
    drag.current = null
  }

  // Clique no trilho leva o trecho azul para debaixo do ponteiro.
  const onTrackDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track) return
    const box = track.getBoundingClientRect()
    const free = box.width - thumb.width
    if (free <= 0) return
    scrollToRatio(Math.min(1, Math.max(0, (event.clientX - box.left - thumb.width / 2) / free)))
  }

  return (
    <div
      ref={trackRef}
      className={`wave-scroll ${thumb.visible ? 'is-on' : ''}`}
      onPointerDown={onTrackDown}
      aria-hidden="true"
    >
      <div className="wave-scroll-track" />
      <div
        className="wave-scroll-thumb"
        style={{
          width: thumb.width,
          transform: `translateX(${thumb.left}px)`,
          // mesma fase do trilho: a mascara anda para tras o quanto o trecho andou
          WebkitMaskPositionX: `${-thumb.left}px`,
          maskPosition: `${-thumb.left}px 0`,
        }}
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={onThumbUp}
        onPointerCancel={onThumbUp}
      />
    </div>
  )
}
