import React from 'react'
import CATALOG from './catalog.js'
import { fetchPriceList, buildCatalogFromApi, buildIndex, applyLivePrices } from './api.js'
import DocView from './components/DocView.jsx'
import MobileView from './components/MobileView.jsx'
import './styles/doc.css'
import './styles/mobile.css'

// Divisions covered by the printed price list (PL) — these show only the PDF's
// items. Everything else comes straight from the ERP.
const PL_DIVISIONS = ['School Stationery', 'Office Stationery']
// Divisions shown in the A4 print document (Others stays mobile-only)
const DOC_DIVISIONS = ['School Stationery', 'Office Stationery', 'Corporate']

export default function App() {
  const [view, setView] = React.useState(() => localStorage.getItem('ace-view') || 'mobile')
  const [catalog, setCatalog] = React.useState(CATALOG)
  const [sync, setSync] = React.useState({ state: 'loading', matched: 0, attempted: 0, at: null })
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => { localStorage.setItem('ace-view', view) }, [view])

  // Nice filename when the browser saves the print as PDF
  React.useEffect(() => {
    const orig = document.title
    const before = () => { document.title = 'ACEMARK Price List (C.G.) 01.08.2026' }
    const after = () => { document.title = orig }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after) }
  }, [])

  // Always print the A4 document — switch to it first (works even from mobile view)
  const printDoc = React.useCallback(() => {
    setMenuOpen(false)
    setView('doc')
    setTimeout(() => window.print(), 250)
  }, [])

  const load = React.useCallback(async () => {
    setSync((s) => ({ ...s, state: 'loading' }))
    // PL (School/Office/Corporate) items come from the price-list xlsx (CATALOG);
    // every load overlays the ERP's latest MRP/DP/PKT/CRT/BLD on top of them.
    // Rows the ERP can't match keep their saved price and get highlighted.
    const plRows = CATALOG.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.families.reduce((k, f) => k + f.rows.length, 0), 0), 0)
    try {
      const records = await fetchPriceList()
      const index = buildIndex(records)
      const { catalog: merged, matched, attempted } = applyLivePrices(CATALOG, index)
      // "Others" isn't in the price list — pull it live from the ERP (mobile only).
      const others = buildCatalogFromApi(records, CATALOG).filter((d) => d.division === 'Others')
      setCatalog([...merged, ...others])
      setSync({ state: 'live', divisions: merged.length + others.length, rows: plRows, matched, unmatched: attempted - matched, at: new Date() })
    } catch (e) {
      setCatalog(CATALOG) // ERP unreachable — price list still shows (xlsx)
      setSync({ state: 'offline', divisions: CATALOG.length, rows: plRows, at: null, error: String(e.message || e) })
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  // Auto-refresh: re-pull ERP prices every 30 minutes while the app stays open.
  React.useEffect(() => {
    const id = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  const syncText = {
    loading: 'Loading from ERP…',
    live: sync.at
      ? `Live · ${sync.divisions} divisions · ${sync.rows} rows${sync.unmatched ? ` · ${sync.unmatched} not in ERP` : ''} · ${timeStr(sync.at)}`
      : 'Live',
    offline: 'Offline — saved catalogue',
  }[sync.state]

  return (
    <>
      {view === 'doc'
        ? <DocView catalog={catalog.filter((d) => DOC_DIVISIONS.includes(d.division))} />
        : <MobileView catalog={catalog} />}

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
            <button className="fab-item" onClick={printDoc}>
              <PrintIcon /> Print
            </button>
            <button className="fab-item" onClick={printDoc} title="In the dialog choose “Save as PDF”">
              <DownloadIcon /> Download PDF
            </button>
            <button className="fab-item" onClick={load} disabled={sync.state === 'loading'}>
              <RefreshIcon /> {sync.state === 'loading' ? 'Refreshing…' : 'Refresh data'}
            </button>
          </div>
        )}
        <button
          className={'fab-btn' + (menuOpen ? ' open' : '')}
          onClick={() => setMenuOpen((o) => !o)}
          title="Pricelist — download, print &amp; views"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <CloseIcon /> : <DownloadIcon />}
          <span className="fab-label">Pricelist</span>
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
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4l-4.7-4.7 1.4-1.4L12 13.6V3h0zM5 19h14v2H5z"/></svg>
)
