import React from 'react'

export function TrendArrow({ row }) {
  if (!row || !row._trend) return null
  const up = row._trend === 'up'
  const title = (up ? 'Increased' : 'Decreased') + (row._odp ? ' from ₹' + row._odp : '')
  return <span className={'trend trend-' + row._trend} title={title}>{up ? '▲' : '▼'}</span>
}

const FIRM = {
  name: 'ACEMARK', name2: 'STATIONERS',
  address: 'Infront of CSIDC Commercial Complex, Mahadev Ghat Road, Raipura Chowk, Raipur (C.G.)',
  phones: '8349997670 · 8349997676 · 8349997674', web: 'www.acemark.in', mail: 'social@acemark.in',
}

// A4 sheet geometry (px @96dpi: 210×297mm). Categories are packed into real
// fixed-height pages so screen, print and the cover index all agree.
const PAGE_W = 794
const PAGE_H = 1123
const PAD_X = 34                              // page side padding (band + cols)
const COL_GAP = 26
const COL_W = (PAGE_W - PAD_X * 2 - COL_GAP) / 2 // 350
const FAM_GAP = 18                            // gap between ranges in a column
const COLS_PAD_TOP = 18                       // band → tables
const CHUNK_PAD_BOTTOM = 14                   // after a category's tables
const BODY_PAD_BOTTOM = 8                     // breathing room above footer

function DocHeader({ pageNo, total, division, effective, region = 'C.G.' }) {
  return (
    <div className="doc-header">
      {/* slim: address/phone sirf cover pe — har page pe repeat nahi */}
      <div className="doc-head-left">
        <img className="doc-logo" src="/Ace_Logo_bg.png" alt="ACE" />
        <div className="doc-firm">{FIRM.name} <span>{FIRM.name2}</span></div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="doc-div">Price List ({region})</div>
        <div className="doc-sub">Effective {effective}{pageNo ? ' · Page ' + pageNo + (total ? ' of ' + total : '') : ''}</div>
      </div>
    </div>
  )
}

function DocFooter({ pageNo }) {
  return (
    <div className="doc-footer">
      <span>Rates are Dealer Price (DP) per piece · Subject to Raipur jurisdiction · Sizes are approximate</span>
      <span className="doc-foot-right">
        {FIRM.mail}
        {pageNo ? <b className="pg-num">{pageNo}</b> : null}
      </span>
    </div>
  )
}

function FamilyTable({ f, cont, showRull = true }) {
  return (
    <div className="fam">
      <div className="fam-head">
        <div className="fam-name">{f._sn ? <span className="fam-sn">{f._sn}.</span> : null}{f.name}{cont ? <span className="fam-contd"> (contd.)</span> : null}{f.tag ? <span className={'tag tag-' + f.tag.replace(/\s/g, '')}>{f.tag}</span> : null}</div>
        {f.size && f.size !== '—' ? <div className="fam-meta">{f.size}</div> : null}
      </div>
      <table>
        <thead><tr><th className="sn">#</th><th className="l">{f.col || 'PAGES'}</th><th>MRP</th><th>DP</th><th>{f.pktHeader || 'PKT'}</th><th>CRT</th><th>BLD</th></tr></thead>
        <tbody>
          {f.rows.map((r, j) => (
            <tr key={j}>
              <td className="sn">{r._sn ?? j + 1}</td>
              <td className="l">{r.label}</td>
              <td className={r.mrp === '' ? 'pending' : ''}>{r.mrp}</td>
              <td
                className={'dp' + (r.dp === '' ? ' pending' : '') + (r._unmatched ? ' nomatch' : '')}
                title={r._unmatched ? 'ERP me nahi mila — saved price' : undefined}
              >{r.dp}<TrendArrow row={r} /></td>
              <td>{f.pktValue != null && f.pktValue !== '' ? f.pktValue : r.pkt}</td><td>{r.crt}</td><td>{r.bld ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showRull && f.rulling ? <div className="fam-rulling"><b>Rulling:</b> {f.rulling}</div> : null}
      {showRull && f.availItems ? (
        <div className="fam-avail">
          <b>Available in</b>
          {String(f.availItems).split(/[,\n]/).map((s) => s.trim()).filter(Boolean).map((s, i) => (
            <div key={i} className="fam-avail-item">• {s}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function NotesBlock({ notes }) {
  if (!notes || !notes.length) return null
  return (
    <div className="cat-notes">
      <b>NOTES</b>
      {notes.map((n, i) => <div key={i}>• {n}</div>)}
    </div>
  )
}

// Full-width category band — neeche uski families 2 columns me aati hain,
// isliye clear rehta hai kaunsi tables kis category ki hain.
function CatBandFull({ cat, cont }) {
  return (
    <div className="cat-band">
      <div className="cat-no-badge">{cat.catNo}</div>
      <div className="cat-band-text">
        <div className="cat-kicker">{cat.division.toUpperCase()}</div>
        <div className="cat-title">{cat.title}{cont ? <span className="cat-contd"> · contd.</span> : null}</div>
      </div>
      <div className="cat-count">{cont ? 'continued' : cat.families.length + (cat.families.length === 1 ? ' range' : ' ranges')}</div>
    </div>
  )
}

// A category's column blocks in order: its family tables, then its notes box.
// Entry me from/to ho to table ka utna hissa hi render hota hai (row-level
// split) — serial numbers absolute hain isliye numbering wahi chalti rehti hai.
// Guarded: stale measurement kabhi crash na kare.
function blockEl(cat, e) {
  const idx = e.idx
  if (idx < cat.families.length) {
    const f = cat.families[idx]
    const from = e.from || 0
    const to = e.to == null ? f.rows.length : Math.min(e.to, f.rows.length)
    const part = from === 0 && to >= f.rows.length ? f : { ...f, rows: f.rows.slice(from, to) }
    return <FamilyTable f={part} cont={from > 0} showRull={to >= f.rows.length} />
  }
  return <NotesBlock notes={cat.notes} />
}

/* ------------------------------------------------------------------
   Measurement: render every band + block hidden at true print width,
   read heights, then pack them into pages.
------------------------------------------------------------------ */
function MeasureLayer({ cats, effective, onMeasured }) {
  const ref = React.useRef(null)
  const [fontTick, setFontTick] = React.useState(0)

  // Heights change once webfonts arrive — re-measure then.
  React.useEffect(() => {
    let on = true
    if (document.fonts?.ready) document.fonts.ready.then(() => { if (on) setFontTick((t) => t + 1) })
    return () => { on = false }
  }, [])

  React.useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    // float-precise heights: integer offsetHeight rounding accumulates a few px
    // over a stacked column and can push the last table past the page edge
    const H = (el) => (el ? el.getBoundingClientRect().height : 0)
    const m = { headerH: 0, footerH: 0, bands: {}, blocks: {}, parts: {} }
    m.headerH = H(root.querySelector('.doc-header'))
    m.footerH = H(root.querySelector('.doc-footer'))
    for (const el of root.querySelectorAll('[data-m="band"]')) m.bands[el.dataset.cat] = H(el)
    for (const el of root.querySelectorAll('[data-m="block"]')) {
      ;(m.blocks[el.dataset.cat] = m.blocks[el.dataset.cat] || []).push(H(el))
      // row-level split ke liye: head/rows/rulling ki alag-alag heights
      const fam = el.querySelector('.fam')
      let part = null
      if (fam) {
        const rows = [...fam.querySelectorAll('tbody tr')].map((tr) => tr.getBoundingClientRect().height)
        const rull = fam.querySelector('.fam-rulling')
        const avail = fam.querySelector('.fam-avail')
        const rullH = (rull ? rull.getBoundingClientRect().height : 0) + (avail ? avail.getBoundingClientRect().height : 0)
        part = { headH: H(el) - rows.reduce((a, b) => a + b, 0) - rullH, rows, rullH }
      }
      ;(m.parts[el.dataset.cat] = m.parts[el.dataset.cat] || []).push(part)
    }
    onMeasured(m)
  }, [cats, fontTick, onMeasured])

  return (
    <div ref={ref} className="doc-page doc-measure" aria-hidden="true">
      <DocHeader pageNo={9} total={99} division="Measure" effective={effective} />
      <div style={{ position: 'relative', height: 40 }}><DocFooter pageNo={99} /></div>
      {cats.map((cat) => {
        const n = cat.families.length + (cat.notes ? 1 : 0)
        return (
          <React.Fragment key={cat.catNo}>
            <div data-m="band" data-cat={cat.catNo}><CatBandFull cat={cat} /></div>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} data-m="block" data-cat={cat.catNo} style={{ width: COL_W }}>{blockEl(cat, { idx: i })}</div>
            ))}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function sumH(blocks, idxs) {
  return idxs.reduce((s, idx, j) => s + blocks[idx] + (j ? FAM_GAP : 0), 0)
}

// Pack categories into fixed A4 pages — har category ek SECTION hai:
// full-width band + uske neeche uski families 2 balanced columns me.
// Tables row-level pe split hoti hain, isliye dono columns lagbhag barabar
// bharte hain aur blank jagah kam se kam bachti hai.
const SPLIT_SAFETY = 5   // measured row-heights ke rounding ka cushion
const MIN_PART_ROWS = 3  // ek hisse me kam se kam itni rows
const SECTION_EXTRA = 4  // .cat-section + .cat-section band ka margin-top

function paginate(cats, m) {
  const bodyH = PAGE_H - m.headerH - m.footerH - BODY_PAD_BOTTOM
  const pages = []
  let cur = null, used = 0
  const newPage = () => { cur = { sections: [] }; pages.push(cur); used = 0 }
  newPage()
  const ranges = {}
  const mark = (cat) => {
    const pg = pages.length + 1
    if (!ranges[cat.catNo]) ranges[cat.catNo] = { from: pg, to: pg }
    ranges[cat.catNo].to = pg
  }
  // family ke bache hisse (from se aakhir tak) ki height
  const restH = (part, from, whole) => {
    if (!part) return whole
    let h = part.headH + SPLIT_SAFETY + part.rullH
    for (let r = from; r < part.rows.length; r++) h += part.rows[r]
    return h
  }

  for (const cat of cats) {
    // stale-measure guard
    const expected = cat.families.length + (cat.notes ? 1 : 0)
    const blocks = (m.blocks[cat.catNo] || []).slice(0, expected)
    const partsArr = ((m.parts && m.parts[cat.catNo]) || []).slice(0, expected)
    const bandH = m.bands[cat.catNo] || 0

    let i = 0, from = 0, cont = false
    do {
      const sectionExtra = cur.sections.length ? SECTION_EXTRA : 0
      const colAvail = bodyH - used - sectionExtra - bandH - COLS_PAD_TOP - CHUNK_PAD_BOTTOM

      // band + pehle block ka chhota hissa bhi na aa sake to fresh page
      const p0 = partsArr[i]
      const minFirst = i >= blocks.length ? 0
        : p0 ? p0.headH + SPLIT_SAFETY + p0.rows.slice(from, from + Math.min(2, p0.rows.length - from)).reduce((a, b) => a + b, 0)
        : blocks[i]
      if (colAvail < minFirst && cur.sections.length) { newPage(); continue }

      // is category ka bacha hua total content
      let restTotal = 0
      for (let b = i; b < blocks.length; b++) restTotal += restH(partsArr[b], b === i ? from : 0, blocks[b]) + FAM_GAP

      const section = { cat, cont, cols: [[], []] }
      const h = [0, 0]
      const pushE = (c, e, hh) => { h[c] += (section.cols[c].length ? FAM_GAP : 0) + hh; section.cols[c].push(e) }

      const fillCol = (c, cap) => {
        while (i < blocks.length) {
          const part = partsArr[i]
          const rest = restH(part, from, blocks[i])
          const gap = section.cols[c].length ? FAM_GAP : 0
          if (h[c] + gap + rest <= cap) {
            pushE(c, { idx: i, from: from || undefined }, rest)
            i++; from = 0
            continue
          }
          // oversized + akela column khali: force (safety, aage split hoga hi)
          if (part && part.rows.length - from > MIN_PART_ROWS) {
            const avail = cap - h[c] - gap
            let acc = part.headH + SPLIT_SAFETY, k = 0
            while (from + k < part.rows.length && acc + part.rows[from + k] <= avail) { acc += part.rows[from + k]; k++ }
            if (part.rows.length - (from + k) < MIN_PART_ROWS) k = Math.min(k, part.rows.length - from - MIN_PART_ROWS)
            if (k >= MIN_PART_ROWS) { pushE(c, { idx: i, from: from || undefined, to: from + k }, acc); from += k }
          } else if (!section.cols[c].length && h[c] === 0 && rest > cap) {
            pushE(c, { idx: i, from: from || undefined }, rest)
            i++; from = 0
            continue
          }
          break
        }
      }

      // aakhri section ke liye: har mumkin split (block/row boundary) scan
      // karke wo chuno jisme dono columns sabse barabar bharen
      const balancedFill = () => {
        const n = blocks.length
        if (i >= n) return true
        const start = i, from0 = from
        const wholeH = [], fromArr = []
        for (let b = start; b < n; b++) {
          const fb = b === start ? from0 : 0
          fromArr[b] = fb
          wholeH[b] = restH(partsArr[b] || null, fb, blocks[b])
        }
        const suffix = []
        suffix[n] = 0
        for (let b = n - 1; b >= start; b--) suffix[b] = wholeH[b] + (b + 1 < n ? FAM_GAP + suffix[b + 1] : 0)
        let best = null
        const consider = (cand) => {
          if (cand.h1 > colAvail + 0.5 || cand.h2 > colAvail + 0.5) return
          const score = Math.max(cand.h1, cand.h2) + (cand.split ? 6 : 0)
          if (!best || score < best.score) best = { ...cand, score }
        }
        let prefix = 0
        for (let b = start; b < n; b++) {
          const gap1 = b === start ? 0 : FAM_GAP
          const part = partsArr[b]
          if (part) {
            const fb = fromArr[b]
            const len = part.rows.length
            if (len - fb >= MIN_PART_ROWS * 2) {
              let acc = part.headH + SPLIT_SAFETY
              for (let k = 1; fb + k <= len - MIN_PART_ROWS; k++) {
                acc += part.rows[fb + k - 1]
                if (k < MIN_PART_ROWS) continue
                const part2 = part.headH + SPLIT_SAFETY + part.rullH + part.rows.slice(fb + k).reduce((a, x) => a + x, 0)
                consider({ b, k, split: true, h1: prefix + gap1 + acc, h2: part2 + (b + 1 < n ? FAM_GAP + suffix[b + 1] : 0) })
              }
            }
          }
          prefix += gap1 + wholeH[b]
          consider({ b, k: 0, split: false, h1: prefix, h2: b + 1 < n ? suffix[b + 1] : 0 })
        }
        if (!best) return false
        for (let b = start; b < n; b++) {
          const fb = fromArr[b]
          if (b < best.b || (!best.split && b === best.b)) {
            pushE(0, { idx: b, from: fb || undefined }, wholeH[b])
          } else if (best.split && b === best.b) {
            const part = partsArr[b]
            const p1 = part.headH + SPLIT_SAFETY + part.rows.slice(fb, fb + best.k).reduce((a, x) => a + x, 0)
            const p2 = part.headH + SPLIT_SAFETY + part.rullH + part.rows.slice(fb + best.k).reduce((a, x) => a + x, 0)
            pushE(0, { idx: b, from: fb || undefined, to: fb + best.k }, p1)
            pushE(1, { idx: b, from: fb + best.k }, p2)
          } else {
            pushE(1, { idx: b, from: fb || undefined }, wholeH[b])
          }
        }
        i = n; from = 0
        return true
      }

      if (restTotal <= colAvail * 2) {
        // aakhri section: optimal balance; na ho paye to normal fill
        if (!balancedFill()) {
          fillCol(0, colAvail)
          fillCol(1, colAvail)
        }
      } else {
        // beech ka section: dono columns poore bharo
        fillCol(0, colAvail)
        fillCol(1, colAvail)
      }

      cur.sections.push(section)
      mark(cat)
      used += sectionExtra + bandH + COLS_PAD_TOP + Math.max(h[0], h[1]) + CHUNK_PAD_BOTTOM
      if (i < blocks.length) { cont = true; newPage() }
    } while (i < blocks.length)
  }
  return { pages, ranges, total: pages.length + 1 }
}

function SheetPage({ page, pageNo, total, effective, region }) {
  const divisions = [...new Set(page.sections.map((sec) => sec.cat.division))].join(' · ')
  const col = (sec, c) => sec.cols[c].map((e, i) => <React.Fragment key={i}>{blockEl(sec.cat, e)}</React.Fragment>)
  return (
    <div className="doc-page doc-sheet" data-screen-label={'Page ' + pageNo}>
      <DocHeader pageNo={pageNo} total={total} division={divisions} effective={effective} region={region} />
      <div className="sheet-body">
        {page.sections.map((sec, si) => (
          <section className="cat-section" key={si}>
            <CatBandFull cat={sec.cat} cont={sec.cont} />
            <div className="sheet-cols">
              <div className="sheet-col">{col(sec, 0)}</div>
              <div className="sheet-col">{col(sec, 1)}</div>
            </div>
          </section>
        ))}
      </div>
      <DocFooter pageNo={pageNo} />
    </div>
  )
}

function pgLabel(r) {
  if (!r) return ''
  return r.from === r.to ? String(r.from) : r.from + '–' + r.to
}

function CoverPage({ catalog, effective, ranges, total, region = 'C.G.' }) {
  const groups = catalog.map((d) => ({
    division: d.division,
    cats: d.pages.map((p) => ({ no: p.catNo, title: p.title, pg: pgLabel(ranges?.[p.catNo]) })),
  }))
  return (
    <div className="doc-page doc-cover" data-screen-label="Cover">
      <div className="cover-top">
        <div className="cover-year">2026</div>
        <img className="cover-logo" src="/Ace_Logo_bg.png" alt="ACE" />
        <div className="cover-firm">{FIRM.name} <span>{FIRM.name2}</span></div>
        <div className="cover-rule" />
        <div className="cover-tag">Price List · {region === 'OD' ? 'Odisha (OD)' : 'Chhattisgarh (C.G.)'}</div>
        <div className="cover-sub2">{catalog.map((d) => (d.division === 'Corporate' ? 'Corporate Stationery' : d.division)).join(' + ')}</div>
        <div className="cover-eff">Effective {effective}{total ? ' · ' + total + ' pages' : ''}</div>
      </div>
      <div className="cover-body">
        <div className="cover-index">
          <div className="cover-index-head">Contents</div>
          {groups.map((g, gi) => (
            <React.Fragment key={gi}>
              <div className="cover-index-div">{g.division}</div>
              {g.cats.map((c, i) => (
                <div className="cover-index-row" key={i}>
                  <span className="ci-no">{c.no}</span>
                  <span className="ci-title">{c.title}</span>
                  <span className="ci-dots"></span>
                  <span className="ci-pg">{c.pg}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="cover-legend">
          <div className="cover-index-head">How to read this list</div>
          <p>All rates are <b>Dealer Price (DP)</b> per piece. One rate for all parties. MRP printed for reference.</p>
          <p><b>PKT</b> = pieces per packet · <b>CRT</b> = pieces per carton/bundle.</p>
          <p>
            <span className="trend trend-up">▲</span> = rate <b>increased</b> from the previous list ·{' '}
            <span className="trend trend-down">▼</span> = rate <b>decreased</b>. No arrow = no change.
          </p>
          <p>Page numbers in this index refer to the pages of this document. Pages and prices are subject to change without prior notice. Subject to Raipur jurisdiction. Sizes are approximate and may vary.</p>
        </div>
      </div>
      <div className="cover-foot">
        <span>{FIRM.address}</span>
        <span className="doc-foot-right">
          {FIRM.phones} · {FIRM.web} · {FIRM.mail}
          <b className="pg-num">1</b>
        </span>
      </div>
    </div>
  )
}

function OrderFormPage({ pageNo, effective }) {
  const field = (label, wide) => (
    <div className={'of-field' + (wide ? ' wide' : '')}>
      <span className="of-label">{label}</span>
      <span className="of-line"></span>
    </div>
  )
  return (
    <div className="doc-page doc-fixed" data-screen-label="Order Form">
      <DocHeader pageNo={pageNo} division="Order Form" effective={effective} />
      <div className="cat-band">
        <div className="cat-band-text">
          <div className="cat-no">ORDER DETAILS</div>
          <div className="cat-title">Order Form</div>
        </div>
      </div>
      <div className="of-body">
        <div className="of-grid">
          {field('Party Name', true)}
          {field('Mobile')}
          {field('GSTIN')}
          {field('Address', true)}
          {field('Order Date')}
          {field('Delivery Date')}
          {field('Payment Mode')}
          {field('Transport')}
        </div>
        <div className="of-note">
          <b>HOW TO ORDER</b>
          <div>• Note the category, product code and pages/size from this list (e.g. S-1 · CM · 112P).</div>
          <div>• WhatsApp your order with quantities to 8349997670, or email {FIRM.mail}.</div>
          <div>• Rates are Dealer Price (DP) per piece · One rate for all parties.</div>
        </div>
        <div className="of-sign">
          <div className="of-sign-box"><span>Party Seal &amp; Signature</span></div>
          <div className="of-sign-box"><span>For ACEMARK Stationers</span></div>
        </div>
      </div>
      <DocFooter />
    </div>
  )
}

export default function DocView({ catalog, fullScale, region = 'C.G.' }) {
  const effective = catalog[0]?.effective
  const cats = React.useMemo(() => {
    // serial numbers: family/table ka number POORE document me continuous
    // (category badalne par 1 se restart nahi hota); item ka number apni
    // family ke andar — split hone par bhi wahi numbers chalte rehte hain
    let tableNo = 0
    return catalog.flatMap((d) => d.pages.map((p) => ({
      ...p,
      division: d.division,
      families: p.families.map((f) => ({
        ...f,
        _sn: ++tableNo,
        rows: f.rows.map((r, ri) => ({ ...r, _sn: ri + 1 })),
      })),
    })))
  }, [catalog])
  const [measures, setMeasures] = React.useState(null)
  const onMeasured = React.useCallback((m) => {
    setMeasures((old) => (old && JSON.stringify(old) === JSON.stringify(m) ? old : m))
  }, [])
  const result = React.useMemo(() => (measures ? paginate(cats, measures) : null), [cats, measures])

  // On narrow screens (phone), scale the fixed-width A4 sheets to fit the
  // viewport instead of cropping left/right. Layout/print stay at true size.
  const [scale, setScale] = React.useState(1)
  React.useEffect(() => {
    const upd = () => setScale(Math.min(1, (window.innerWidth - 12) / PAGE_W))
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [])

  return (
    // fullScale: PDF capture needs the sheets at true A4 size, not phone-fit
    <div className="doc-stack" style={{ '--doc-scale': fullScale ? 1 : scale }}>
      <CoverPage catalog={catalog} effective={effective} ranges={result?.ranges} total={result?.total} region={region} />
      {result?.pages.map((pg, i) => (
        <SheetPage key={i} page={pg} pageNo={i + 2} total={result.total} effective={effective} region={region} />
      ))}
      <MeasureLayer cats={cats} effective={effective} onMeasured={onMeasured} />
    </div>
  )
}
