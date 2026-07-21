// Live ERP price-list integration.
//
// Source: http://eksai12.ddns.net:8786/ek_api/googleAutomation/PriceList.ashx
// In dev we hit it via the Vite proxy at /erp-api (see vite.config.js) so the
// request stays same-origin. If the proxy path 404s (e.g. a plain static
// `vite preview` build with no proxy) we fall back to the direct HTTP URL.

// Config comes from .env (Vite exposes VITE_* to the client). Hardcoded values
// are only fallbacks so the app still runs if .env is missing.
const ENV = import.meta.env || {}
const PROXY_URL = ENV.VITE_ERP_PROXY_PATH || '/erp-api/googleAutomation/PriceList.ashx'
const DIRECT_URL = ENV.VITE_ERP_API_URL || 'http://eksai12.ddns.net:8786/ek_api/googleAutomation/PriceList.ashx'
const API_KEY = ENV.VITE_ERP_API_KEY || ''

export async function fetchPriceList() {
  let recs = null
  try {
    recs = await tryFetch(PROXY_URL)
  } catch (e) {
    recs = await tryFetch(DIRECT_URL) // may fail under https (mixed content)
  }
  return recs
}

async function tryFetch(url) {
  const headers = { Accept: 'application/json' }
  if (API_KEY) { headers.Authorization = 'Bearer ' + API_KEY; headers['x-api-key'] = API_KEY }
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const json = await res.json()
  if (!json || !Array.isArray(json.DataRec)) throw new Error('bad payload')
  return json.DataRec
}

const norm = (s) => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '')

// Build a resolver from the raw API records. Groups every live-priced record
// (NewDP > 0) under a key of  <leading family letters> + <first page number>,
// which collapses all rulling/variety variants (C801, C802, C80K …) together.
export function buildIndex(records) {
  const groups = new Map() // pageKey -> Map(dp -> {mrp,dp,pack,crt,count})
  const byCode = new Map() // exact normalised ProductCode -> Map(dp -> {...})
  let liveCount = 0
  for (const r of records) {
    const dp = Number(r.NewDP)
    if (!dp || dp <= 0) continue
    liveCount++
    const code = norm(r.ProductCode)
    const price = { mrp: Number(r.NewMRP) || null, dp, odp: Number(r.OldDP) || 0, pack: r.Pack, crt: r.CRT, bld: r.Bld, name: String(r.ProductName || '').toUpperCase() }

    // exact full-code index (precise, unambiguous)
    add(byCode, code, dp, price)

    // page-group index — collapses rulling/variety variants (C801, C802, C80K…)
    const m = code.match(/^([A-Z]*)(\d+)/)
    if (m) add(groups, m[1] + '|' + String(Number(m[2])), dp, price)
  }
  return { groups, byCode, liveCount, total: records.length }
}

function add(map, key, dp, price) {
  let bucket = map.get(key)
  if (!bucket) map.set(key, (bucket = new Map()))
  const dpKey = dp.toFixed(2)
  const cur = bucket.get(dpKey) || { ...price, count: 0 }
  cur.count++
  bucket.set(dpKey, cur)
}

function pick(bucket) {
  if (!bucket || bucket.size === 0) return null
  if (bucket.size === 1) return bucket.values().next().value
  return null // ambiguous — caller keeps the saved price
}

// Resolve one catalog row to a live price. Conservative: only returns a value
// when the match is unambiguous (a single distinct DP among the variants).
// Otherwise returns null and the caller keeps the saved fallback price.
// Words too generic to prove two products are the same family.
const STOP = new Set(['ACE', 'MARK', 'ECO', 'THE', 'AND', 'NET', 'RATE', 'RATES',
  'WITH', 'SIZE', 'PCS', 'NEW', 'NOTE', 'BOOK', 'COPY', 'PAPER', 'CM', 'PAGE', 'PAGES',
  'PLAIN', 'LINE', 'SIDE', 'PRINTED', 'REGULAR', 'DELUXE', 'DELUX', 'PLUS', 'ITEMS', 'ITEM',
  'COVER', 'BROWN', 'UV', 'DEMI', 'BIG', 'SMALL', 'JUMBO'])

function famTokens(name) {
  return new Set(
    String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  )
}

// A match is trusted only if the ERP product name shares a distinctive word
// with the catalog family name — this rejects short-code collisions
// (e.g. family "SC" for Small College accidentally hitting an "SC84" product).
function nameOk(tokens, hitName) {
  if (!hitName) return false
  const h = ' ' + hitName + ' '
  for (const t of tokens) if (h.includes(' ' + t) || h.includes(t + ' ') || hitName.includes(t)) return true
  return false
}

export function resolveRow(index, familyCode, rowLabel, familyName) {
  const label = norm(rowLabel)
  const codes = String(familyCode || '').split('/').map(norm).filter(Boolean)
  const pageMatch = String(rowLabel).match(/\d+/)
  const page = pageMatch ? String(Number(pageMatch[0])) : null
  const tokens = famTokens(familyName)

  // 1) exact full-code match — precise, catches code-like labels (4F36, EP101,
  //    MB-28) and stale rows the page-group can't. Guarded by name check.
  const exactKeys = [label]
  for (const c of codes) {
    exactKeys.push(c + label)
    if (page) exactKeys.push(c + page)
  }
  for (const k of exactKeys) {
    const hit = pick(index.byCode.get(k))
    if (hit && nameOk(tokens, hit.name)) return hit
  }

  // 2) page-group fallback — unambiguous variants only, name-guarded.
  if (page) {
    for (const c of codes) {
      const hit = pick(index.groups.get(c + '|' + page))
      if (hit && nameOk(tokens, hit.name)) return hit
    }
  }
  return null
}

// Apply live prices onto a copy of the catalog. Returns { catalog, matched }.
export function applyLivePrices(catalog, index) {
  let matched = 0, attempted = 0
  const fmt = (n) => (n == null ? '' : Number(n).toFixed(2))
  const cInt = (n) => (n == null || n === '' ? '' : Math.round(Number(n)))
  const next = catalog.map((div) => ({
    ...div,
    pages: div.pages.map((p) => ({
      ...p,
      families: p.families.map((f) => {
        let rows = f.rows.map((row) => {
          attempted++
          const live = resolveRow(index, f.code, row.label, f.name)
          if (!live) return { ...row, bld: row.bld ?? '' }
          matched++
          // DP trend vs the ERP's previous dealer price (OldDP)
          const trend = live.odp && Math.abs(live.dp - live.odp) > 0.005
            ? (live.dp > live.odp ? 'up' : 'down') : null
          return {
            ...row,
            mrp: live.mrp != null ? Math.round(live.mrp) : row.mrp,
            dp: fmt(live.dp),
            _trend: trend,
            _odp: live.odp ? fmt(live.odp) : null,
            pkt: live.pack != null ? cInt(live.pack) : row.pkt,
            // ERP splits carton (CRT) and bundle (BLD). Take its split for
            // matched rows; unmatched rows keep the saved value under CRT for now.
            crt: live.crt != null ? cInt(live.crt) : (live.bld != null ? '' : row.crt),
            bld: live.bld != null ? cInt(live.bld) : '',
            _live: true,
          }
        })
        // Normalise the family: a product line packs in cartons OR bundles, not
        // both. Learn which from the live rows, then move the saved rows' single
        // value into the same column so the family reads consistently.
        const bundleVotes = rows.filter((r) => r._live && r.bld !== '' && (r.crt === '' || r.crt == null)).length
        const cartonVotes = rows.filter((r) => r._live && r.crt !== '' && r.crt != null && (r.bld === '' || r.bld == null)).length
        if (bundleVotes > cartonVotes) {
          rows = rows.map((r) => (!r._live && r.crt !== '' && r.crt != null && (r.bld === '' || r.bld == null))
            ? { ...r, bld: r.crt, crt: '' } : r)
        }
        return { ...f, rows }
      }),
    })),
  }))
  return { catalog: next, matched, attempted }
}

// ---------------------------------------------------------------------------
// Fully API-driven catalogue. Builds divisions → categories → families → rows
// entirely from the ERP (all ProdDivision values), overlaying curated
// size/tag metadata from the local catalog where a family code matches.
// ---------------------------------------------------------------------------

const DIV_ORDER = ['School Stationery', 'Office Stationery', 'Corporate', 'Others']
const DIV_LETTER = { 'School Stationery': 'S', 'Office Stationery': 'O', 'Corporate': 'G', 'Others': 'X' }

const titleCase = (s) =>
  String(s || '').toLowerCase().replace(/\b([a-z0-9])/g, (m, c) => c.toUpperCase()).trim()

function cleanPages(pp) {
  const s = String(pp == null ? '' : pp).trim()
  const m = s.match(/^(\d+)\s*Pages?$/i)
  if (m) return m[1] + 'P'
  return s && s.toUpperCase() !== 'N/A' ? s : ''
}

// "1 Line, 2 Line, 4 Line, Plain, Dabba" — numbered rullings first, then the rest
function sortVarieties(list) {
  const rank = (s) => { const m = String(s).match(/^(\d+)\s*line/i); return m ? Number(m[1]) : 99 }
  return list.sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)))
}

function commonCode(codes) {
  // most frequent leading-letters prefix among the product codes
  const counts = new Map()
  for (const c of codes.filter(Boolean)) {
    const m = String(c).match(/^[A-Za-z]+/)
    const k = (m ? m[0] : String(c).slice(0, 3)).toUpperCase()
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let best = '', bc = 0
  for (const [k, v] of counts) if (v > bc) { bc = v; best = k }
  return best
}

// Maps a curated division name to the ERP ProdDivision it corresponds to.
const API_DIV_FOR_CURATED = {
  'School Stationery': 'School Stationery',
  'Office Stationery': 'Office Stationery',
  'General & Diaries': 'Corporate',
}

// Strip trailing page-range noise from an ERP SubCat so page-range-split
// sub-categories collapse to one family name.
//   "ACE CROWN NOTE BOOK 032P TO 192P" -> "ACE CROWN NOTE BOOK"
//   "JUMBO REGISTER ECO & GALAXY 472P TO 864P" -> "JUMBO REGISTER ECO & GALAXY"
//   "MARK CROWN NOTE BOOK 276P" -> "MARK CROWN NOTE BOOK"
function baseName(s) {
  const out = String(s || '')
    .replace(/\s+\d+\s*P?\s+TO\s+\d+\s*P?.*$/i, '')
    .replace(/\s+\d+\s*Q(\s+TO\s+\d+\s*Q)?\s*$/i, '')
    .replace(/\s+\d+\s*P?\s*$/i, '')
    .trim()
  return out || String(s || '').trim()
}

export function buildCatalogFromApi(records, curated) {
  // Curated families per ERP division, with name tokens for matching.
  const curatedByDiv = new Map() // apiDiv -> [{tokens,name,size,tag,catTitle,catNotes,catOrder}]
  if (curated) for (const cdiv of curated) {
    const apiDiv = API_DIV_FOR_CURATED[cdiv.division] || cdiv.division
    if (!curatedByDiv.has(apiDiv)) curatedByDiv.set(apiDiv, [])
    const arr = curatedByDiv.get(apiDiv)
    cdiv.pages.forEach((p, idx) => {
      for (const f of p.families) arr.push({ tokens: famTokens(f.name), name: f.name, size: f.size, tag: f.tag, catTitle: p.title, catNotes: p.notes || null, catOrder: idx })
    })
  }

  const cInt = (n) => (n == null || n === '' ? '' : Math.round(Number(n)))

  // Pass 1: group records by division -> SubCat (raw family)
  const rawTree = new Map() // div -> Map(sub -> {sub, erpCat, codes[], rows})
  for (const r of records) {
    const dp = Number(r.NewDP); if (!dp || dp <= 0) continue
    const div = (String(r.ProdDivision || '').trim()) || 'Others'
    let erpCat = String(r.BaseCat || '').trim()
    if (!erpCat) {
      const g = String(r.ProdGroup || '').trim()
      erpCat = (g && !['ALL', 'UNREGULAR', 'N/A', 'OTHER', 'OTHERS', 'CUSTOM ORDER'].includes(g.toUpperCase())) ? g : 'Other'
    }
    const sub = (String(r.SubCat || '').trim()) || erpCat
    if (!rawTree.has(div)) rawTree.set(div, new Map())
    const subs = rawTree.get(div)
    if (!subs.has(sub)) subs.set(sub, { sub, erpCat, codes: [], rows: new Map(), varieties: new Set() })
    const fam = subs.get(sub)
    fam.codes.push(String(r.ProductCode || ''))
    // rulling / variety list for this family (N/A excluded)
    const variety = String(r.ProdVariety || '').trim()
    if (variety && variety.toUpperCase() !== 'N/A') fam.varieties.add(variety)
    const label = cleanPages(r.ProdPages) ||
      (r.ProdVariety && r.ProdVariety !== 'N/A' ? String(r.ProdVariety) : String(r.ProductCode))
    if (!fam.rows.has(label)) fam.rows.set(label, new Map())
    const bucket = fam.rows.get(label)
    const key = dp.toFixed(2)
    const cur = bucket.get(key) ||
      { dp, mrp: Number(r.NewMRP) || null, odp: Number(r.OldDP) || 0, pack: r.Pack, crt: r.CRT, bld: r.Bld, count: 0 }
    cur.count++; bucket.set(key, cur)
  }

  const buildRows = (rowsMap) => [...rowsMap.entries()].map(([label, bucket]) => {
    let best = null; for (const v of bucket.values()) if (!best || v.count > best.count) best = v
    const trend = best.odp && Math.abs(best.dp - best.odp) > 0.005 ? (best.dp > best.odp ? 'up' : 'down') : null
    return {
      label, mrp: best.mrp != null ? Math.round(best.mrp) : '', dp: best.dp.toFixed(2),
      pkt: cInt(best.pack), crt: best.crt != null ? cInt(best.crt) : '', bld: best.bld != null ? cInt(best.bld) : '',
      _live: true, _trend: trend, _odp: best.odp ? best.odp.toFixed(2) : null,
      _pg: Number((String(label).match(/\d+/) || [99999])[0]),
    }
  }).sort((a, b) => a._pg - b._pg)

  const divisions = [...rawTree.keys()].sort((a, b) => {
    const ia = DIV_ORDER.indexOf(a), ib = DIV_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })

  return divisions.map((div) => {
    const letter = DIV_LETTER[div] || div[0].toUpperCase()
    const clist = curatedByDiv.get(div) || []
    // category title -> { order, notes, fams: Map(mergeKey -> {name,code,size,tag,rowsMap}) }
    const catMap = new Map()

    for (const fam of rawTree.get(div).values()) {
      const base = baseName(fam.sub)
      const tok = famTokens(base)
      // best curated family by name-token overlap (reliable for category)
      let best = null, bs = 0
      for (const e of clist) { let s = 0; for (const t of tok) if (e.tokens.has(t)) s++; if (s > bs) { bs = s; best = e } }
      const matched = bs >= 1
      const code = commonCode(fam.codes.map(norm))
      const name = titleCase(base)                                  // clean ERP name (page range stripped)
      const catTitle = matched ? best.catTitle : titleCase(fam.erpCat)
      const catNotes = matched ? best.catNotes : null
      const catOrder = matched ? best.catOrder : 900
      const size = matched ? best.size : null                        // size from best in-category match
      const tag = bs >= 2 ? best.tag : null                          // tag needs a strong match
      const mergeKey = 'N|' + base.toUpperCase()                     // merges page-range-split SubCats

      if (!catMap.has(catTitle)) catMap.set(catTitle, { order: catOrder, notes: null, fams: new Map() })
      const cat = catMap.get(catTitle)
      if (catOrder < cat.order) cat.order = catOrder
      if (catNotes && !cat.notes) cat.notes = catNotes
      if (!cat.fams.has(mergeKey)) cat.fams.set(mergeKey, { name, code, size, tag, rowsMap: new Map(), varieties: new Set() })
      const dstFam = cat.fams.get(mergeKey)
      for (const v of fam.varieties) dstFam.varieties.add(v)
      const dst = dstFam.rowsMap
      for (const [label, bucket] of fam.rows) {
        if (!dst.has(label)) dst.set(label, new Map())
        const d = dst.get(label)
        for (const [k, v] of bucket) { const e = d.get(k); if (e) e.count += v.count; else d.set(k, { ...v }) }
      }
    }

    const cats = [...catMap.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    let catNo = 0
    const pages = cats.map(([title, cat]) => {
      catNo++
      const families = [...cat.fams.values()]
        .map((f) => ({
          name: f.name, code: f.code, size: f.size || null, tag: f.tag || null, col: null,
          rulling: sortVarieties([...f.varieties]).join(', '),
          rows: buildRows(f.rowsMap),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      return { catNo: letter + '-' + catNo, title, families, notes: cat.notes || null }
    })
    return { division: div, effective: '01.04.2026', pages }
  })
}
