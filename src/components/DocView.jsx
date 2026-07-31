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
  phones: '8349997670 · 8349997676 · 8349997674', web: 'www.acemark.in', mail: 'billing@acemark.in',
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
      <span>Rates are Dealer Price (DP) per piece · One rate for all parties · Subject to Raipur jurisdiction · Sizes are approximate</span>
      <span className="doc-foot-right">
        {FIRM.mail}
        {pageNo ? <b className="pg-num">{pageNo}</b> : null}
      </span>
    </div>
  )
}

function FamilyTable({ f }) {
  return (
    <div className="fam">
      <div className="fam-head">
        <div className="fam-name">{f._sn ? <span className="fam-sn">{f._sn}.</span> : null}{f.name}{f.tag ? <span className={'tag tag-' + f.tag.replace(/\s/g, '')}>{f.tag}</span> : null}</div>
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
      {f.rulling ? <div className="fam-rulling"><b>Rulling:</b> {f.rulling}</div> : null}
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

function CatBand({ cat, cont }) {
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
// Guarded: catalog update ke beech ek render me purani measurement naye (chhote)
// category pe lag sakti hai — out-of-range index kabhi crash na kare.
function blockEl(cat, idx) {
  if (idx < cat.families.length) return <FamilyTable f={cat.families[idx]} />
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
    const m = { headerH: 0, footerH: 0, bands: {}, blocks: {} }
    m.headerH = H(root.querySelector('.doc-header'))
    m.footerH = H(root.querySelector('.doc-footer'))
    for (const el of root.querySelectorAll('[data-m="band"]')) m.bands[el.dataset.cat] = H(el)
    for (const el of root.querySelectorAll('[data-m="block"]')) {
      ;(m.blocks[el.dataset.cat] = m.blocks[el.dataset.cat] || []).push(H(el))
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
            <div data-m="band" data-cat={cat.catNo}><CatBand cat={cat} /></div>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} data-m="block" data-cat={cat.catNo} style={{ width: COL_W }}>{blockEl(cat, i)}</div>
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

// Pack categories into fixed A4 pages. Cover is page 1; sheets start at 2.
// Returns { pages, ranges: {catNo: {from,to}}, total }.
function paginate(cats, m) {
  const bodyH = PAGE_H - m.headerH - m.footerH - BODY_PAD_BOTTOM
  const pages = []
  let cur = null
  const newPage = () => { cur = { items: [] , used: 0 }; pages.push(cur) }
  newPage()
  const ranges = {}

  for (const cat of cats) {
    // Clamp to the category's real block count: measures ek render purane ho
    // sakte hain (catalog abhi-abhi badla) — extra indices render me crash
    // karate the. Agla measure pass turant sahi layout bana deta hai.
    const expected = cat.families.length + (cat.notes ? 1 : 0)
    const blocks = (m.blocks[cat.catNo] || []).slice(0, expected)
    const bandH = m.bands[cat.catNo] || 0
    let i = 0
    let cont = false

    while (true) {
      // sectionExtra = the 4px .cat-section + .cat-section band margin.
      let sectionExtra = cur.items.length ? 4 : 0
      let cap = Math.max(0, bodyH - cur.used - sectionExtra - bandH - COLS_PAD_TOP - CHUNK_PAD_BOTTOM)
      // Band + the next block must fit in the space left, else fresh page.
      if (cur.items.length && (blocks[i] || 0) > cap) {
        newPage()
        sectionExtra = 0
        cap = Math.max(0, bodyH - bandH - COLS_PAD_TOP - CHUNK_PAD_BOTTOM)
      }
      const freshPage = cur.items.length === 0

      // Greedy reading-order fill: down column 1, then column 2. A block that
      // doesn't fit waits for the next page — it is only force-placed when it
      // is taller than a whole empty page (unavoidable overflow).
      const fill = (col, allowOversize) => {
        let h = 0
        while (i < blocks.length) {
          const bh = blocks[i]
          const nh = h + (col.length ? FAM_GAP : 0) + bh
          if (nh > cap) {
            if (!col.length && allowOversize) { col.push(i); i++; h = bh }
            break
          }
          col.push(i); i++; h = nh
        }
        return h
      }
      let col1 = [], col2 = []
      let h1 = fill(col1, freshPage)
      let h2 = fill(col2, false)
      if (!col1.length && !col2.length && i < blocks.length) { newPage(); continue }

      // Category finished on this page → re-split its last chunk so the two
      // columns come out balanced instead of everything piling into column 1.
      if (i >= blocks.length && col1.length + col2.length > 1) {
        const placed = col1.concat(col2)
        let best = null
        for (let k = 0; k <= placed.length; k++) {
          const a = placed.slice(0, k), b = placed.slice(k)
          const ha = sumH(blocks, a), hb = sumH(blocks, b)
          if (ha <= cap && hb <= cap) {
            const mx = Math.max(ha, hb)
            if (!best || mx < best.mx) best = { a, b, ha, hb, mx }
          }
        }
        if (best) { col1 = best.a; col2 = best.b; h1 = best.ha; h2 = best.hb }
      }

      cur.items.push({ cat, cont, col1, col2 })
      cur.used += sectionExtra + bandH + COLS_PAD_TOP + Math.max(h1, h2) + CHUNK_PAD_BOTTOM

      const pgNo = pages.length + 1 // + cover
      if (!ranges[cat.catNo]) ranges[cat.catNo] = { from: pgNo, to: pgNo }
      ranges[cat.catNo].to = pgNo

      if (i >= blocks.length) break
      cont = true
      newPage()
    }
  }
  return { pages, ranges, total: pages.length + 1 }
}

function SheetPage({ page, pageNo, total, effective, region }) {
  const divisions = [...new Set(page.items.map((it) => it.cat.division))].join(' · ')
  return (
    <div className="doc-page doc-sheet" data-screen-label={'Page ' + pageNo}>
      <DocHeader pageNo={pageNo} total={total} division={divisions} effective={effective} region={region} />
      <div className="sheet-body">
        {page.items.map((it, i) => (
          <section className="cat-section" key={i}>
            <CatBand cat={it.cat} cont={it.cont} />
            <div className="sheet-cols">
              <div className="sheet-col">{it.col1.map((b) => <React.Fragment key={b}>{blockEl(it.cat, b)}</React.Fragment>)}</div>
              <div className="sheet-col">{it.col2.map((b) => <React.Fragment key={b}>{blockEl(it.cat, b)}</React.Fragment>)}</div>
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
          <p>Page numbers in this index refer to the pages of this document. Pages and prices are subject to change without prior notice. Subject to Raipur jurisdiction. Sizes are approximate and may vary.</p>
        </div>
      </div>
      <div className="cover-foot">
        <span>{FIRM.address}</span>
        <span>{FIRM.phones} · {FIRM.web} · {FIRM.mail}</span>
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

// A table longer than one A4 column would get clipped — split big families
// into balanced chunks of ≤ MAX_FAM_ROWS rows ("(contd.)" carries the name on).
// Lambi label wali rows (corporate ke product-naam) 2 line me wrap hoti hain,
// isliye unki chunk-limit chhoti rakhi jati hai.
const MAX_FAM_ROWS = 22
const MAX_FAM_ROWS_LONG = 15
function splitFamilies(families) {
  return families.flatMap((f) => {
    const longLabels = f.rows.some((r) => String(r.label || '').length > 26)
    const maxRows = longLabels ? MAX_FAM_ROWS_LONG : MAX_FAM_ROWS
    if (f.rows.length <= maxRows + 2) return [f]
    const parts = Math.ceil(f.rows.length / maxRows)
    const per = Math.ceil(f.rows.length / parts)
    return Array.from({ length: parts }, (_, i) => ({
      ...f,
      name: i === 0 ? f.name : f.name + ' (contd.)',
      rows: f.rows.slice(i * per, (i + 1) * per),
    }))
  })
}

export default function DocView({ catalog, fullScale, region = 'C.G.' }) {
  const effective = catalog[0]?.effective
  const cats = React.useMemo(
    () => catalog.flatMap((d) => d.pages.map((p) => ({
      ...p,
      division: d.division,
      // serial numbers: family ka number category ke andar, item ka number
      // family ke andar — split hone par bhi wahi numbers chalte rehte hain
      families: splitFamilies(p.families.map((f, fi) => ({
        ...f,
        _sn: fi + 1,
        rows: f.rows.map((r, ri) => ({ ...r, _sn: ri + 1 })),
      }))),
    }))),
    [catalog]
  )
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
