import React from 'react'
import { createRoot } from 'react-dom/client'
import HomeV2 from './HomeV2.jsx'
import './v2.css'

// A v2 é client-render: o #root traz um fallback estático (sem JS) que é substituído aqui.
const root = document.getElementById('root')
root.replaceChildren()
createRoot(root).render(
  <React.StrictMode>
    <HomeV2 />
  </React.StrictMode>,
)
