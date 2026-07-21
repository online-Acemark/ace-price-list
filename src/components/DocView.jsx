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

function DocPhotoPH({ w, h, label }) {
  return (
    <div style={{ width: w, height: h, flex: 'none', background: 'var(--bg-accent-tint)', border: '1px solid var(--border-subtle)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '8px', color: '#5b7d8c', padding: '3px', lineHeight: 1.3 }}>{label}</div>
  )
}

function DocHeader({ pageNo, division, effective }) {
  return (
    <div className="doc-header">
      <div>
        <div className="doc-firm">{FIRM.name} <span>{FIRM.name2}</span></div>
        <div className="doc-sub">{FIRM.address} · {FIRM.phones} · {FIRM.web}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="doc-div">Price List · {division}</div>
        <div className="doc-sub">Effective {effective} · Page {pageNo}</div>
      </div>
    </div>
  )
}

function DocFooter() {
  return (
    <div className="doc-footer">
      <span>Rates are Dealer Price (DP) per piece · One rate for all parties · Subject to Raipur jurisdiction · Sizes are approximate</span>
      <span>{FIRM.mail}</span>
    </div>
  )
}

function FamilyTable({ f }) {
  return (
    <div className="fam">
      <div className="fam-head">
        <div className="fam-name">{f.name}{f.tag ? <span className={'tag tag-' + f.tag.replace(/\s/g, '')}>{f.tag}</span> : null}</div>
        <div className="fam-meta">Code {f.code}{f.size && f.size !== '—' ? ' · ' + f.size : ''}</div>
      </div>
      <table>
        <thead><tr><th className="l">{f.col || 'PAGES'}</th><th>MRP</th><th>DP</th><th>PKT</th><th>CRT</th><th>BLD</th></tr></thead>
        <tbody>
          {f.rows.map((r, j) => (
            <tr key={j}>
              <td className="l">{r.label}</td>
              <td className={r.mrp === '' ? 'pending' : ''}>{r.mrp}</td>
              <td className={'dp' + (r.dp === '' ? ' pending' : '')}>{r.dp}<TrendArrow row={r} /></td>
              <td>{r.pkt}</td><td>{r.crt}</td><td>{r.bld ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.rulling ? <div className="fam-rulling"><b>Rulling:</b> {f.rulling}</div> : null}
    </div>
  )
}

function CategoryPage({ page, pageNo, division, effective }) {
  return (
    <div className="doc-page" data-screen-label={page.catNo + ' ' + page.title}>
      <DocHeader pageNo={pageNo} division={division} effective={effective} />
      <div className="cat-band">
        <div className="cat-band-text">
          <div className="cat-no">{page.catNo} · {division.toUpperCase()}</div>
          <div className="cat-title">{page.title}</div>
        </div>
        <div className="cat-photos">
          {page.families.slice(0, 6).map((f, i) => <DocPhotoPH key={i} w="52px" h="66px" label={f.code} />)}
        </div>
      </div>
      <div className="cat-cols">
        {page.families.map((f, i) => <FamilyTable key={i} f={f} />)}
        {page.notes ? (
          <div className="cat-notes">
            <b>NOTES</b>
            {page.notes.map((n, i) => <div key={i}>• {n}</div>)}
          </div>
        ) : null}
      </div>
      <DocFooter />
    </div>
  )
}

function CoverPage({ catalog, effective }) {
  let pg = 1
  const groups = catalog.map((d) => ({
    division: d.division,
    cats: d.pages.map((p) => ({ no: p.catNo, title: p.title, pg: ++pg })),
  }))
  return (
    <div className="doc-page doc-cover" data-screen-label="Cover">
      <div className="cover-top">
        <div className="cover-firm">{FIRM.name} <span>{FIRM.name2}</span></div>
        <div className="cover-tag">Price List · {catalog.map((d) => d.division).join(' + ')}</div>
        <div className="cover-eff">Effective {effective}</div>
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
          <p>Pages and prices are subject to change without prior notice. Subject to Raipur jurisdiction. Sizes are approximate and may vary.</p>
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
    <div className="doc-page" data-screen-label="Order Form">
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

export default function DocView({ catalog }) {
  const effective = catalog[0]?.effective
  let pg = 1
  return (
    <div className="doc-stack">
      <CoverPage catalog={catalog} effective={effective} />
      {catalog.map((d, di) =>
        d.pages.map((p, i) => (
          <CategoryPage key={di + '-' + i} page={p} pageNo={++pg} division={d.division} effective={effective} />
        ))
      )}
      <OrderFormPage pageNo={++pg} effective={effective} />
    </div>
  )
}
