import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Si se abre la app fuera del basename (p.ej. "/" o "/Telcomdashboard" sin barra),
// React Router no renderiza nada (pagina en blanco). Redirigir al base configurado.
const base = import.meta.env.BASE_URL // '/Telcomdashboard/'
const baseNoSlash = base.replace(/\/$/, '')
const { pathname, search, hash } = window.location
if (baseNoSlash && pathname !== baseNoSlash && !pathname.startsWith(base)) {
  window.history.replaceState(null, '', base + search + hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
