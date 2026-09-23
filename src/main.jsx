import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import PageRouter from './PageRouter.jsx'
import './styles.css'
import './assistant.css'
import './experience-fixes.css'
import './refinements.css'
import './editorial.css'
import './experience-v3.css'
import './showroom.css'
import './hero.css'
import './room.css'
import './warm.css'
import './motion-sections.css'
import './motion.css'
import './header-brand-size.css'
import { enableProductMorph, enableBlurUp } from './viewTransitions.js'

enableProductMorph()

const root = document.getElementById('root')
const page = <React.StrictMode><PageRouter path={window.location.pathname} /></React.StrictMode>
if (root.hasChildNodes()) hydrateRoot(root, page)
else createRoot(root).render(page)

enableBlurUp()
