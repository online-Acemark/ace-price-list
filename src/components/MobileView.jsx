import React from 'react'
import { TrendArrow } from './DocView.jsx'

const M_FIRM = {
  phones: '8349997670', mail: 'billing@acemark.in', web: 'www.acemark.in',
  wa: 'https://wa.me/918349997670',
}

function MTag({ kind }) {
  if (!kind) return null
  return <span className={'mtag mtag-' + kind.replace(/\s/g, '')}>{kind}</span>
}

function MFamilyCard({ f }) {
  return (
    <div className="mfam">
      <div className="mfam-head">
        <div className="mfam-name">{f.name} <MTag kind={f.tag} /></div>
        <div className="mfam-meta">Code {f.code}{f.size && f.size !== '—' ? ' · ' + f.size : ''}</div>
      </div>
      <table>
        <thead><tr><th className="l">{f.col || 'PAGES'}</th><th>MRP</th><th>DP</th><th>PKT</th><th>CRT</th><th>BLD</th></tr></thead>
        <tbody>
          {f.rows.map((r, j) => (
            <tr key={j}>
              <td className="l">{r.label}</td>
              <td className={r.mrp === '' ? 'pending' : ''}>{r.mrp}</td>
              <td
                className={'dp' + (r.dp === '' ? ' pending' : '') + (r._unmatched ? ' nomatch' : '')}
                title={r._unmatched ? 'ERP me nahi mila — saved price' : undefined}
              >{r.dp}<TrendArrow row={r} /></td>
              <td>{r.pkt}</td><td>{r.crt}</td><td>{r.bld ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.rulling ? <div className="mfam-rulling"><b>Rulling:</b> {f.rulling}</div> : null}
    </div>
  )
}

function MCategory({ page }) {
  return (
    <section className="mcat" id={'cat-' + page.catNo} data-screen-label={page.catNo + ' ' + page.title}>
      <div className="mcat-band">
        <span className="mcat-no">{page.catNo}</span>
        <span className="mcat-title">{page.title}</span>
      </div>
      <div className="mcat-body">
        {page.families.map((f, i) => <MFamilyCard key={i} f={f} />)}
        {page.notes ? (
          <div className="mcat-notes">{page.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
        ) : null}
      </div>
    </section>
  )
}

function matches(f, q) {
  const hay = (f.name + ' ' + f.code + ' ' + f.rows.map((r) => r.label).join(' ')).toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}

export default function MobileView({ catalog }) {
  const [divIdx, setDivIdx] = React.useState(() => {
    const s = parseInt(localStorage.getItem('aceml-div') || '0', 10)
    return s >= 0 && s < catalog.length ? s : 0
  })
  const [query, setQuery] = React.useState('')
  const [activeCat, setActiveCat] = React.useState(null) // null = All
  const div = catalog[divIdx]
  const q = query.trim().toLowerCase()

  React.useEffect(() => { localStorage.setItem('aceml-div', String(divIdx)) }, [divIdx])
  // division badalne par category filter reset
  React.useEffect(() => { setActiveCat(null) }, [divIdx])

  const selectCat = (catNo, el) => {
    setActiveCat(catNo)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }

  const shownPages = activeCat ? div.pages.filter((p) => p.catNo === activeCat) : div.pages

  let searchResults = null
  if (q) {
    searchResults = []
    catalog.forEach((d) => d.pages.forEach((p) => p.families.forEach((f) => {
      if (matches(f, q)) searchResults.push({ f, cat: p.catNo + ' · ' + p.title })
    })))
  }

  return (
    <div className="mwrap">
      <header className="mhead">
        <div className="mhead-top">
          <div className="mhead-firm">ACEMARK <span>STATIONERS</span></div>
          <div className="mhead-eff">Effective {div.effective}</div>
        </div>
        <div className="mtabs">
          {catalog.map((d, i) => (
            <button key={i} className={'mtab' + (i === divIdx && !q ? ' on' : '')} onClick={() => { setQuery(''); setDivIdx(i); window.scrollTo({ top: 0 }) }}>
              {d.division}
            </button>
          ))}
        </div>
        <div className="msearch">
          <input type="search" placeholder="Search product or code…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!q && (
          <div className="mchips-wrap">
            <div className="mchips">
              <button
                className={'mchip' + (activeCat === null ? ' on' : '')}
                onClick={(e) => selectCat(null, e.currentTarget)}
              >All</button>
              {div.pages.map((p, i) => (
                <button
                  key={i}
                  className={'mchip' + (activeCat === p.catNo ? ' on' : '')}
                  onClick={(e) => selectCat(p.catNo, e.currentTarget)}
                >{p.title}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      {q ? (
        <div className="msearch-results">
          <div className="msr-count">{searchResults.length ? searchResults.length + ' result' + (searchResults.length > 1 ? 's' : '') : 'No matches — try a shorter word'}</div>
          {searchResults.map((r, i) => (
            <div key={i}>
              <div className="msr-cat">{r.cat}</div>
              <MFamilyCard f={r.f} />
            </div>
          ))}
        </div>
      ) : (
        <main>
          {shownPages.map((p, i) => <MCategory key={i} page={p} />)}
        </main>
      )}

      <footer className="mfoot">
        <div className="mfoot-note">Rates are Dealer Price (DP) per piece · One rate for all parties · Subject to Raipur jurisdiction</div>
        <div className="mfoot-contact">{M_FIRM.phones} · {M_FIRM.mail} · {M_FIRM.web}</div>
      </footer>

      <a className="mwa" href={M_FIRM.wa} target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"/></svg>
        Order
      </a>
    </div>
  )
}
