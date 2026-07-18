import React from 'react'
import CATALOG from './catalog.js'
import { fetchPriceList, buildCatalogFromApi } from './api.js'
import DocView from './components/DocView.jsx'
import MobileView from './components/MobileView.jsx'
import './styles/doc.css'
import './styles/mobile.css'

export default function App() {
  const [view, setView] = React.useState(() => localStorage.getItem('ace-view') || 'doc')
  const [catalog, setCatalog] = React.useState(CATALOG)
  const [sync, setSync] = React.useState({ state: 'loading', matched: 0, attempted: 0, at: null })
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => { localStorage.setItem('ace-view', view) }, [view])

  const load = React.useCallback(async () => {
    setSync((s) => ({ ...s, state: 'loading' }))
    try {
      const records = await fetchPriceList()
      // Divisions, categories, families and rows all come from the ERP.
      // Curated CATALOG only supplies size/tag overlay where a code matches.
      const built = buildCatalogFromApi(records, CATALOG)
      setCatalog(built)
      const rows = built.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.families.reduce((k, f) => k + f.rows.length, 0), 0), 0)
      setSync({ state: 'live', divisions: built.length, rows, at: new Date() })
    } catch (e) {
      setCatalog(CATALOG) // offline: fall back to the saved curated catalogue
      setSync({ state: 'offline', divisions: 0, rows: 0, at: null, error: String(e.message || e) })
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const syncText = {
    loading: 'Loading from ERP…',
    live: sync.at ? `Live · ${sync.divisions} divisions · ${sync.rows} rows · ${timeStr(sync.at)}` : 'Live',
    offline: 'Offline — saved catalogue',
  }[sync.state]

  return (
    <>
      {view === 'doc' ? <DocView catalog={catalog} /> : <MobileView catalog={catalog} />}

      {/* Floating controls — sits above the WhatsApp order button */}
      <div className="fab-wrap">
        {menuOpen && (
          <div className="fab-menu" role="menu">
            <div className="fab-sync">
              <span className={'app-dot ' + sync.state} />
              {syncText}
            </div>
            <div className="fab-seg">
              <button className={view === 'doc' ? 'on' : ''} onClick={() => { setView('doc'); setMenuOpen(false) }}>A4 Document</button>
              <button className={view === 'mobile' ? 'on' : ''} onClick={() => { setView('mobile'); setMenuOpen(false) }}>Mobile</button>
            </div>
            <button className="fab-item" onClick={load} disabled={sync.state === 'loading'}>
              <RefreshIcon /> {sync.state === 'loading' ? 'Refreshing…' : 'Refresh prices'}
            </button>
            {view === 'doc' && (
              <button className="fab-item" onClick={() => { setMenuOpen(false); setTimeout(() => window.print(), 50) }}>
                <PrintIcon /> Print / PDF
              </button>
            )}
          </div>
        )}
        <button
          className={'fab-btn' + (menuOpen ? ' open' : '')}
          onClick={() => setMenuOpen((o) => !o)}
          title="Views &amp; refresh"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <CloseIcon /> : <GearIcon />}
          <span className={'fab-dot ' + sync.state} />
        </button>
      </div>
    </>
  )
}

function timeStr(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8.4-2a6.5 6.5 0 0 0-.1-1l1.7-1.3-1.7-3-2 .8a7 7 0 0 0-1.7-1l-.3-2.1H9.7L9.4 5.5a7 7 0 0 0-1.7 1l-2-.8-1.7 3L5.7 11a6.5 6.5 0 0 0 0 2l-1.7 1.3 1.7 3 2-.8c.5.4 1.1.7 1.7 1l.3 2.1h4.6l.3-2.1c.6-.3 1.2-.6 1.7-1l2 .8 1.7-3L20.3 13c.1-.3.1-.7.1-1z"/></svg>
)
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4L10.6 10.6 16.9 4.3z"/></svg>
)
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
)
const PrintIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM18 3H6v4h12V3z"/></svg>
)
