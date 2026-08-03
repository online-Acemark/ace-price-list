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
      <div>
        <div className="doc-firm">{FIRM.name} <span>{FIRM.name2}</span></div>
        <div className="doc-sub">{FIRM.address} · {FIRM.phones} · {FIRM.web}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="doc-div">Price List ({region}) · {division}</div>
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
        <thead><tr><th className="sn">#</th><th className="l">{f.col || 'PAGES'}</th><th>MRP</th><th>DP</th><th>PKT</th><th>CRT</th><th>BLD</th></tr></thead>
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
              <td>{r.pkt}</td><td>{r.crt}</td><td>{r.bld ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showRull && f.rulling ? <div className="fam-rulling"><b>Rulling:</b> {f.rulling}</div> : null}
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

// Column-width category banner — pages continuous 2-column flow me packed
// hain, isliye band bhi column ke andar hi baithta hai (koi blank strip nahi).
function ColBand({ cat, cont }) {
  return (
    <div className={'colband' + (cont ? ' contd' : '')}>
      <div className="colband-no">{cat.catNo}</div>
      <div className="colband-text">
        <div className="colband-kicker">{cat.division.toUpperCase()}</div>
        <div className="colband-title">{cat.title}{cont ? <span className="colband-contd"> · contd.</span> : null}</div>
      </div>
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
        const rullH = rull ? rull.getBoundingClientRect().height : 0
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
            <div data-m="band" data-cat={cat.catNo} style={{ width: COL_W }}><ColBand cat={cat} /></div>
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

// Pack categories into fixed A4 pages — CONTINUOUS 2-column flow with
// ROW-LEVEL table splitting: column me jitni rows fit hoti hain utni wahi
// rukti hain, baaki agle column/page me "(contd.)" table me chalti hain —
// isliye page me blank jagah nahi ke barabar bachti hai.
// Cover is page 1; sheets start at 2. Returns { pages, ranges, total }.
const SPLIT_SAFETY = 5   // measured row-heights ke rounding ka cushion
const MIN_PART_ROWS = 3  // ek hisse me kam se kam itni rows

function paginate(cats, m) {
  const bodyH = PAGE_H - m.headerH - m.footerH
  const colCap = bodyH - COLS_PAD_TOP - CHUNK_PAD_BOTTOM
  const pages = []
  let cur = null, colIdx = 0, colH = [0, 0]
  const newPage = () => { cur = { cols: [[], []] }; pages.push(cur); colIdx = 0; colH = [0, 0] }
  newPage()
  const ranges = {}
  const mark = (cat) => {
    const pg = pages.length + 1
    if (!ranges[cat.catNo]) ranges[cat.catNo] = { from: pg, to: pg }
    ranges[cat.catNo].to = pg
  }
  const gapFor = () => (cur.cols[colIdx].length ? FAM_GAP : 0)
  const availNow = () => colCap - colH[colIdx] - gapFor()
  const push = (entry, h) => { colH[colIdx] += gapFor() + h; cur.cols[colIdx].push(entry) }
  const advance = () => { if (colIdx === 0) colIdx = 1; else newPage() }

  // family ke bache hue hisse (from se aakhir tak) ki height
  const restH = (part, from, whole) => {
    if (!part) return whole
    let h = part.headH + SPLIT_SAFETY + part.rullH
    for (let r = from; r < part.rows.length; r++) h += part.rows[r]
    return h
  }

  for (const cat of cats) {
    // stale-measure guard: naya catalog + purani heights kabhi crash na kare
    const expected = cat.families.length + (cat.notes ? 1 : 0)
    const blocks = (m.blocks[cat.catNo] || []).slice(0, expected)
    const partsArr = (m.parts && m.parts[cat.catNo]) || []
    const bandH = m.bands[cat.catNo] || 0

    // banner + pehle table ka kuch hissa ek saath aana chahiye
    const p0 = partsArr[0]
    const firstBit = blocks.length
      ? (p0 ? p0.headH + SPLIT_SAFETY + (p0.rows[0] || 0) * Math.min(MIN_PART_ROWS, p0.rows.length) : blocks[0])
      : 0
    let guard = 0
    while (bandH + FAM_GAP + firstBit > availNow() && cur.cols[colIdx].length && guard++ < 4) advance()
    push({ cat, band: true, cont: false }, bandH)
    mark(cat)

    let i = 0, from = 0
    while (i < blocks.length) {
      const part = partsArr[i] || null
      const need = restH(part, from, blocks[i])

      if (need <= availNow() || (!cur.cols[colIdx].length && (!part || part.rows.length - from <= MIN_PART_ROWS))) {
        // poora (bacha hua) block yahin aa jata hai — ya oversized unsplittable
        push({ cat, idx: i, from: from || undefined }, need)
        mark(cat)
        i++; from = 0
        continue
      }

      // row-level split try karo
      let placed = false
      if (part && part.rows.length - from > MIN_PART_ROWS) {
        const avail = availNow()
        let acc = part.headH + SPLIT_SAFETY
        let k = 0
        while (from + k < part.rows.length && acc + part.rows[from + k] <= avail) {
          acc += part.rows[from + k]; k++
        }
        // dono taraf kam se kam MIN_PART_ROWS rahen
        if (part.rows.length - (from + k) < MIN_PART_ROWS) k = part.rows.length - from - MIN_PART_ROWS
        if (k >= MIN_PART_ROWS) {
          push({ cat, idx: i, from: from || undefined, to: from + k }, acc)
          mark(cat)
          from += k
          placed = true
        }
      }

      const toNewPage = colIdx === 1
      advance()
      if (toNewPage) push({ cat, band: true, cont: true }, bandH) // naye page pe "contd." banner
      if (!placed && !cur.cols[colIdx].length && restH(part, from, blocks[i]) > colCap) {
        // ekdam hi bada unsplittable block — akela push (safety)
        push({ cat, idx: i, from: from || undefined }, colCap)
        mark(cat)
        i++; from = 0
      }
    }
  }
  return { pages, ranges, total: pages.length + 1 }
}

function SheetPage({ page, pageNo, total, effective, region }) {
  const divisions = [...new Set(page.cols.flat().map((e) => e.cat.division))].join(' · ')
  const render = (e, i) => e.band
    ? <ColBand key={i} cat={e.cat} cont={e.cont} />
    : <React.Fragment key={i}>{blockEl(e.cat, e)}</React.Fragment>
  return (
    <div className="doc-page doc-sheet" data-screen-label={'Page ' + pageNo}>
      <DocHeader pageNo={pageNo} total={total} division={divisions} effective={effective} region={region} />
      <div className="sheet-body">
        <div className="sheet-cols">
          <div className="sheet-col">{page.cols[0].map(render)}</div>
          <div className="sheet-col">{page.cols[1].map(render)}</div>
        </div>
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
        <div className="cover-firm">{FIRM.name} <span>{FIRM.name2}</span></div>
        <div className="cover-rule" />
        <div className="cover-tag">Price List · {region === 'OD' ? 'Odisha (OD)' : 'Chhattisgarh (C.G.)'}</div>
        <div className="cover-sub2">{catalog.map((d) => d.division).join(' + ')}</div>
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
