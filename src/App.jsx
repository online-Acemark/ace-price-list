import React from 'react'
import CATALOG from './catalog.js'
import { fetchPriceList, buildIndex, applyLivePrices } from './api.js'
import { fetchSupabaseCatalog, filterByState, stateFromUrl } from './supabase.js'
import DocView from './components/DocView.jsx'
import MobileView from './components/MobileView.jsx'
import './styles/doc.css'
import './styles/mobile.css'

// Divisions covered by the printed price list (PL) — these show only the PDF's
// items. Everything else comes straight from the ERP.
const PL_DIVISIONS = ['School Stationery', 'Office Stationery']
// Divisions shown in the A4 print document (Others stays mobile-only)
const DOC_DIVISIONS = ['School Stationery', 'Office Stationery', 'Corporate']

// Price list sirf secret link-code se khulti hai: <app-url>/?list=<code>
// (codes: src/supabase.js -> LIST_CODES). Galat/bina code -> access screen.
const STATE = stateFromUrl()
const REGION_LABEL = STATE === 'OD' ? 'OD' : 'C.G.'

function AccessGate() {
  return (
    <div className="gate-wrap">
      <div className="gate-box">
        <div className="gate-brand">ACEMARK <span>STATIONERS</span></div>
        <div className="gate-title">Price list dekhne ke liye link chahiye</div>
        <p>Ye link adhura ya purana hai. Sahi link ke liye hume contact kariye:</p>
        <p className="gate-contact">📞 8349997670 · ✉️ billing@acemark.in</p>
      </div>
    </div>
  )
}

export default function Root() {
  return STATE ? <App /> : <AccessGate />
}

function App() {
  const [view, setView] = React.useState(() => localStorage.getItem('ace-view') || 'mobile')
  const [catalog, setCatalog] = React.useState(CATALOG)
  const [sync, setSync] = React.useState({ state: 'loading', matched: 0, attempted: 0, at: null })
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => { localStorage.setItem('ace-view', view) }, [view])

  // Nice filename when the browser saves the print as PDF
  React.useEffect(() => {
    const orig = document.title
    const before = () => { document.title = `ACEMARK Price List (${REGION_LABEL}) 01.08.2026` }
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

  // ---- Share PDF ----
  // The share sheet must open inside the user's tap, but building the PDF
  // takes ~20-30s. So the PDF is pre-built quietly in the background (from a
  // hidden A4 render) and cached — by the time the user taps Share, the file
  // is ready and the WhatsApp/email sheet opens directly.
  const docCatalog = React.useMemo(() => catalog.filter((d) => DOC_DIVISIONS.includes(d.division)), [catalog])
  const [pdfProg, setPdfProg] = React.useState(null)      // progress overlay
  const [capturing, setCapturing] = React.useState(false) // hidden A4 render mounted
  const [shareFallback, setShareFallback] = React.useState(null) // blob — share needs one fresh tap
  const pdfCache = React.useRef({ cat: null, blob: null, running: null })

  const buildPdf = React.useCallback((silent) => {
    const cache = pdfCache.current
    if (cache.cat === docCatalog && cache.blob) return Promise.resolve(cache.blob)
    if (cache.running) {
      if (!silent) {
        setPdfProg({ done: 0, total: 0 })
        cache.running.finally(() => setPdfProg(null))
      }
      return cache.running
    }
    const job = (async () => {
      setCapturing(true)
      if (!silent) setPdfProg({ done: 0, total: 0 })
      try {
        const [{ jsPDF }, h2c] = await Promise.all([import('jspdf'), import('html2canvas')])
        const html2canvas = h2c.default
        // hidden A4 render mount + pagination settle
        const t0 = Date.now()
        let last = -1, stable = 0, pages = []
        while (Date.now() - t0 < 20000) {
          await new Promise((r) => setTimeout(r, 250))
          pages = [...document.querySelectorAll('.pdf-capture .doc-stack > .doc-page:not(.doc-measure)')]
          if (pages.length > 1 && pages.length === last) { if (++stable >= 3) break } else { stable = 0 }
          last = pages.length
        }
        if (pages.length < 2) throw new Error('A4 pages not ready')
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
        for (let i = 0; i < pages.length; i++) {
          const canvas = await html2canvas(pages[i], { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false })
          if (i) pdf.addPage()
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297)
          if (!silent) setPdfProg({ done: i + 1, total: pages.length })
        }
        const blob = pdf.output('blob')
        pdfCache.current = { cat: docCatalog, blob, running: null }
        return blob
      } finally {
        pdfCache.current.running = null
        setCapturing(false)
        if (!silent) setPdfProg(null)
      }
    })()
    cache.running = job
    job.catch(() => {})
    return job
  }, [docCatalog])

  // pre-build quietly once ERP data settles — Share then opens instantly
  React.useEffect(() => {
    if (sync.state === 'loading') return
    const t = setTimeout(() => { buildPdf(true).catch(() => {}) }, 2500)
    return () => clearTimeout(t)
  }, [sync.state, buildPdf])

  const PDF_NAME = `ACEMARK Price List (${REGION_LABEL}) 01.08.2026.pdf`
  const deliverPdf = React.useCallback(async (blob) => {
    const file = new File([blob], PDF_NAME, { type: 'application/pdf' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'ACEMARK Price List' })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = PDF_NAME
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
  }, [])

  const sharePdf = React.useCallback(async () => {
    setMenuOpen(false)
    const cache = pdfCache.current
    if (cache.cat === docCatalog && cache.blob) {
      // cached — still inside the tap: share sheet opens directly
      try { await deliverPdf(cache.blob) } catch (e) { /* user closed the sheet */ }
      return
    }
    try {
      const blob = await buildPdf(false)
      try {
        await deliverPdf(blob)
      } catch (e) {
        if (e && e.name === 'AbortError') return
        setShareFallback(blob) // tap expired during build — one fresh Share tap
      }
    } catch (e) {
      alert('PDF banane me dikkat aayi: ' + (e.message || e))
    }
  }, [docCatalog, buildPdf, deliverPdf])

  const load = React.useCallback(async () => {
    setSync((s) => ({ ...s, state: 'loading' }))
    // Base catalog: Supabase (admin panel yahi edit karta hai) — na mile to
    // bundled catalog.js. Upar ERP ke live MRP/DP/PKT/CRT/BLD chadhte hain.
    // Rows the ERP can't match keep their saved price and get highlighted.
    let base = CATALOG
    let source = 'saved'
    try {
      base = filterByState(await fetchSupabaseCatalog(STATE), STATE)
      source = 'db'
    } catch (e) { /* Supabase unreachable — bundled catalog chalega */ }
    const plRows = base.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.families.reduce((k, f) => k + f.rows.length, 0), 0), 0)
    try {
      const records = await fetchPriceList()
      const index = buildIndex(records)
      const { catalog: merged, matched, attempted } = applyLivePrices(base, index)
      setCatalog(merged)
      setSync({ state: 'live', source, divisions: merged.length, rows: plRows, matched, unmatched: attempted - matched, at: new Date() })
    } catch (e) {
      setCatalog(base) // ERP unreachable — price list still shows
      setSync({ state: 'offline', source, divisions: base.length, rows: plRows, at: null, error: String(e.message || e) })
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
      ? `Live · ${STATE} · ${sync.divisions} divisions · ${sync.rows} rows${sync.unmatched ? ` · ${sync.unmatched} not in ERP` : ''} · ${timeStr(sync.at)}`
      : 'Live',
    offline: 'Offline — saved catalogue',
  }[sync.state]

  return (
    <>
      {view === 'doc'
        ? <DocView catalog={docCatalog} region={REGION_LABEL} />
        : <MobileView catalog={catalog} />}

      {/* hidden true-size A4 render the PDF is captured from */}
      {capturing ? (
        <div className="pdf-capture" aria-hidden="true">
          <DocView catalog={docCatalog} region={REGION_LABEL} fullScale />
        </div>
      ) : null}

      {pdfProg ? (
        <div className="pdf-overlay">
          <div className="pdf-box">
            <div className="pdf-spin" />
            <div className="pdf-title">PDF ban raha hai…</div>
            <div className="pdf-sub">{pdfProg.total ? `Page ${pdfProg.done} / ${pdfProg.total}` : 'Pages taiyar ho rahe hain'}</div>
          </div>
        </div>
      ) : null}

      {shareFallback ? (
        <div className="pdf-overlay">
          <div className="pdf-box">
            <div className="pdf-title">PDF taiyar hai ✅</div>
            <div className="pdf-actions">
              <button
                className="pdf-btn"
                onClick={async () => {
                  const b = shareFallback
                  setShareFallback(null)
                  try { await deliverPdf(b) } catch (e) { /* user closed the sheet */ }
                }}
              ><ShareIcon /> Share karo</button>
              <button className="pdf-btn ghost" onClick={() => setShareFallback(null)}>Band karo</button>
            </div>
          </div>
        </div>
      ) : null}

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
            <button className="fab-item" onClick={sharePdf} disabled={!!pdfProg}>
              <ShareIcon /> {pdfProg ? 'PDF ban raha hai…' : 'Share PDF'}
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
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8a3 3 0 1 0-3-3c0 .2 0 .5.1.7L8 9.8a3 3 0 1 0 0 4.4l7.1 4.2c-.1.2-.1.4-.1.6a3 3 0 1 0 3-2.9z"/></svg>
)
