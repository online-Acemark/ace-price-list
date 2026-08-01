// Live ERP price-list integration.
//
// Source: http://eksai12.ddns.net:8786/ek_api/googleAutomation/PriceList.ashx
// In dev we hit it via the Vite proxy at /erp-api (see vite.config.js) so the
// request stays same-origin. If the proxy path 404s (e.g. a plain static
// `vite preview` build with no proxy) we fall back to the direct HTTP URL.

// Config comes from .env (Vite exposes VITE_* to the client). Hardcoded values
// are only fallbacks so the app still runs if .env is missing.
import CATALOGUE_SIZES from './catalogue-sizes.js'
import { SECTION_TITLES, CODE_SECTION, NAME_OVERRIDES } from './catalogue-sections.js'

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
  // The ERP sends "Cache-Control: private", so the browser can serve a stale
  // copy on refresh. Bypass the cache and add a unique param so every load /
  // Refresh really hits the ERP and shows the latest prices.
  const bust = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now()
  const res = await fetch(bust, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const json = await res.json()
  if (!json || !Array.isArray(json.DataRec)) throw new Error('bad payload')
  return json.DataRec
}

const norm = (s) => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '')

// ERP image URL fields — blank/N/A become '' so callers can just truthy-check.
function imgUrl(u) {
  const s = String(u == null ? '' : u).trim()
  return s && s.toUpperCase() !== 'N/A' && /^https?:\/\//i.test(s) ? s : ''
}

// "28-Jul-26" -> timestamp (0 if unparseable). Used to prefer the most
// recently revised rate when a product's varieties disagree on DP.
function effTime(s) {
  const m = String(s || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (!m) return 0
  const yr = m[3].length === 2 ? '20' + m[3] : m[3]
  const t = Date.parse(m[2] + ' ' + m[1] + ', ' + yr)
  return Number.isNaN(t) ? 0 : t
}

// Size for a family code, from the product catalogue PDF. A family code can be
// a "/" list (e.g. "SH/VB/RB") — use the first variant the catalogue knows.
export function catalogueSize(code) {
  for (const c of String(code || '').split('/')) {
    const hit = CATALOGUE_SIZES[norm(c)]
    if (hit) return hit
  }
  return null
}

// Build a resolver from the raw API records. Groups every live-priced record
// (NewDP > 0) under a key of  <leading family letters> + <first page number>,
// which collapses all rulling/variety variants (C801, C802, C80K …) together.
export function buildIndex(records) {
  const groups = new Map() // pageKey -> Map(dp -> {mrp,dp,pack,crt,count})
  const byCode = new Map() // exact normalised ProductCode -> Map(dp -> {...})
  const byId = new Map()   // ERP ProductID -> price (exact, always preferred)
  let liveCount = 0
  for (const r of records) {
    const dp = Number(r.NewDP)
    if (!dp || dp <= 0) continue
    liveCount++
    const code = norm(r.ProductCode)
    const variety = String(r.ProdVariety || '').trim()
    const price = {
      mrp: Number(r.NewMRP) || null, dp, odp: Number(r.OldDP) || 0,
      pack: r.Pack, crt: r.CRT, bld: r.Bld,
      eff: effTime(r.NewEffective),
      name: String(r.ProductName || '').toUpperCase(),
      variety: variety && variety.toUpperCase() !== 'N/A' ? variety : '',
      img: imgUrl(r.ImgUrl1), grpImg: imgUrl(r.GroupImgUrl), catImg: imgUrl(r.CatImgURL),
    }

    // exact ProductID index — one record per id, no ambiguity possible
    const pid = Number(r.ProductID)
    if (pid) byId.set(pid, { ...price, count: 1, varieties: new Set(price.variety ? [price.variety] : []) })

    // exact full-code index (precise, unambiguous)
    add(byCode, code, dp, price)

    // page-group index — collapses rulling/variety variants (C801, C802, C80K…).
    // The page comes from ProdPages, NOT from the digits in the code: "C801" is
    // family C + 80 pages + variety 1, so parsing the code would key it as 801.
    const alpha = (code.match(/^([A-Z]+)/) || [, ''])[1]
    const pgm = String(r.ProdPages || '').match(/\d+/)
    if (pgm) {
      const pg = String(Number(pgm[0]))
      if (alpha) add(groups, alpha + '|' + pg, dp, price)
      // key on the code up to the page number, so mixed codes like "A5M481"
      // (family A5M + 48 pages + variety 1) index as "A5M|48", not "A|48".
      const i = code.indexOf(pg)
      if (i > 0) add(groups, code.slice(0, i) + '|' + pg, dp, price)
    }
    // keep the code-digit key too, for products with no ProdPages
    const m = code.match(/^([A-Z]*)(\d+)/)
    if (m) add(groups, m[1] + '|' + String(Number(m[2])), dp, price)
  }
  return { groups, byCode, byId, liveCount, total: records.length }
}

function add(map, key, dp, price) {
  let bucket = map.get(key)
  if (!bucket) map.set(key, (bucket = new Map()))
  const dpKey = dp.toFixed(2)
  const cur = bucket.get(dpKey) || { ...price, count: 0, varieties: new Set() }
  cur.count++
  if (price.eff > cur.eff) cur.eff = price.eff
  if (price.variety) cur.varieties.add(price.variety)
  bucket.set(dpKey, cur)
}

function pick(bucket) {
  if (!bucket || bucket.size === 0) return null
  if (bucket.size === 1) return bucket.values().next().value
  // Several distinct DPs under one page. Rules, in order:
  // 1) The most recently revised rate wins (a fresh ERP price change shows up
  //    immediately, even while its sibling varieties still carry the old rate).
  // 2) Same date (bulk update) — the rate the majority of variants carry wins,
  //    so a deliberately pricier variant (Combind etc.) can't hijack the family.
  // 3) A genuine tie stays unmatched (caller keeps the saved price).
  const sorted = [...bucket.values()].sort((a, b) => (b.eff - a.eff) || (b.count - a.count))
  const [a, b] = sorted
  if (a.eff > b.eff) return a
  return a.count > b.count ? a : null
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
      // keep words of 3+ chars, plus short size codes with a digit (A5, B5, A4)
      .filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w))
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

// Union of every variety in the row's page-group (all rullings the family
// comes in) — the byId exact match sees only its own record's single variety,
// so the "Rulling:" line is collected from the whole group instead.
export function collectVarieties(index, familyCode, rowLabel, familyName, into) {
  const rawLabel = String(rowLabel)
  const isPageLike = !/\d\s*[×x]\s*\d/i.test(rawLabel)
  const pageMatch = isPageLike ? rawLabel.match(/\d+/) : null
  const page = pageMatch ? String(Number(pageMatch[0])) : null
  if (!page) return
  const tokens = famTokens(familyName)
  for (const c of String(familyCode || '').split('/').map(norm).filter(Boolean)) {
    const bucket = index.groups.get(c + '|' + page)
    if (!bucket) continue
    for (const v of bucket.values()) {
      if (!nameOk(tokens, v.name)) continue
      for (const vy of v.varieties) into.add(vy)
    }
  }
}

export function resolveRow(index, familyCode, rowLabel, familyName) {
  const label = norm(rowLabel)
  const codes = String(familyCode || '').split('/').map(norm).filter(Boolean)
  // Only treat the label as a page count when it really is one ("80P", "236P",
  // "28P (No.2)", "100 Sheet"). Pack specs like "1x16 (No.0)" or "Half Size"
  // must NOT yield a page number, or they match an unrelated product.
  const rawLabel = String(rowLabel)
  const isPageLike = !/\d\s*[×x]\s*\d/i.test(rawLabel)
  const pageMatch = isPageLike ? rawLabel.match(/\d+/) : null
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

// A few families use a different code in the ERP than in the price list.
// Keyed by family name so a short/ambiguous code can't match the wrong product.
const CODE_ALIAS = {
  'Prime Rough Note Book': 'PRS',
  'Graph Paper Sheet': 'GP',
  'Mark A5 N/B': 'A5M', // catalog code "A5", ERP codes are "A5M481" etc.
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
        const famVarieties = new Set()
        const imgVotes = new Map() // GroupImgUrl -> votes (family photo = majority)
        let catImg = ''
        // OD me display-naam alag ho sakta hai — ERP matching asli naam se
        const matchName = f._matchName || f.name
        const lookupCode = CODE_ALIAS[matchName] || f.code
        let rows = f.rows.map((row) => {
          attempted++
          // saved ProductID = exact ERP record; fall back to code/page matching
          const live = (row.id && index.byId.get(Number(row.id))) ||
            resolveRow(index, lookupCode, row.label, matchName)
          // family photo: product photo (ImgUrl1) first — GroupImgUrl files are
          // not uploaded on the server yet (404) — then category photo fallback
          const iv = live && (live.img || live.grpImg)
          if (iv) imgVotes.set(iv, (imgVotes.get(iv) || 0) + 1)
          if (live && live.catImg && !catImg) catImg = live.catImg
          // PL item jo ERP me nahi mila — dikhega par highlight ke saath
          if (!live) return { ...row, bld: row.bld ?? '', _unmatched: true }
          matched++
          if (live.varieties) for (const v of live.varieties) famVarieties.add(v)
          // full rulling list: every variety the page-group carries, not just
          // the exact matched record's own variety
          collectVarieties(index, lookupCode, row.label, matchName, famVarieties)
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
        let famImg = ''
        for (const [u, n] of imgVotes) if (!famImg || n > imgVotes.get(famImg)) famImg = u
        // rulling: admin override jeet-ta hai — 'HIDE' / 'NA' / 'N/A' likho to
        // line poori hat jati hai, koi aur text ho to wahi dikhta hai, khali
        // ho to ERP se auto
        const autoRulling = sortVarieties([...famVarieties]).join(', ')
        const ov = String(f._rulesOv || '').trim()
        const rulling = /^(hide|na|n\/a)$/i.test(ov) ? '' : (ov || autoRulling)
        return {
          ...f,
          // size: curated first, else the product catalogue (API has no size)
          size: f.size && f.size !== '—' ? f.size : catalogueSize(f.code),
          rows,
          rulling,
          // photo: admin ki upload sabse upar, phir ERP group/category photo
          img: (f._photoOverride && f.img) || famImg || catImg || f.img || null,
        }
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
    if (!subs.has(sub)) subs.set(sub, { sub, erpCat, codes: [], rows: new Map(), varieties: new Set(), imgs: new Map() })
    const fam = subs.get(sub)
    fam.codes.push(String(r.ProductCode || ''))
    const gi = imgUrl(r.ImgUrl1) || imgUrl(r.GroupImgUrl) || imgUrl(r.CatImgURL)
    if (gi) fam.imgs.set(gi, (fam.imgs.get(gi) || 0) + 1)
    // rulling / variety list for this family (N/A excluded)
    const variety = String(r.ProdVariety || '').trim()
    if (variety && variety.toUpperCase() !== 'N/A') fam.varieties.add(variety)
    const label = cleanPages(r.ProdPages) ||
      (r.ProdVariety && r.ProdVariety !== 'N/A' ? String(r.ProdVariety) : String(r.ProductCode))
    if (!fam.rows.has(label)) fam.rows.set(label, new Map())
    const bucket = fam.rows.get(label)
    const key = dp.toFixed(2)
    const cur = bucket.get(key) ||
      { dp, mrp: Number(r.NewMRP) || null, odp: Number(r.OldDP) || 0, pack: r.Pack, crt: r.CRT, bld: r.Bld, eff: 0, count: 0 }
    cur.count++
    const et = effTime(r.NewEffective)
    if (et > cur.eff) cur.eff = et
    bucket.set(key, cur)
  }

  const buildRows = (rowsMap) => [...rowsMap.entries()].map(([label, bucket]) => {
    // newest revised rate first, then the majority rate (same rule as pick())
    let best = null
    for (const v of bucket.values()) if (!best || v.eff > best.eff || (v.eff === best.eff && v.count > best.count)) best = v
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
      if (!cat.fams.has(mergeKey)) cat.fams.set(mergeKey, { name, code, size, tag, rowsMap: new Map(), varieties: new Set(), imgs: new Map() })
      const dstFam = cat.fams.get(mergeKey)
      for (const v of fam.varieties) dstFam.varieties.add(v)
      for (const [u, n] of fam.imgs) dstFam.imgs.set(u, (dstFam.imgs.get(u) || 0) + n)
      const dst = dstFam.rowsMap
      for (const [label, bucket] of fam.rows) {
        if (!dst.has(label)) dst.set(label, new Map())
        const d = dst.get(label)
        for (const [k, v] of bucket) {
          const e = d.get(k)
          if (e) { e.count += v.count; if (v.eff > e.eff) e.eff = v.eff } else d.set(k, { ...v })
        }
      }
    }

    const cats = [...catMap.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    let catNo = 0
    const pages = cats.map(([title, cat]) => {
      catNo++
      const families = [...cat.fams.values()]
        .map((f) => {
          let img = ''
          for (const [u, n] of f.imgs) if (!img || n > f.imgs.get(img)) img = u
          return {
            name: f.name, code: f.code, size: f.size || catalogueSize(f.code), tag: f.tag || null, col: null,
            rulling: sortVarieties([...f.varieties]).join(', '),
            rows: buildRows(f.rowsMap),
            img: img || null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      return { catNo: letter + '-' + catNo, title, families, notes: cat.notes || null }
    })
    return { division: div, effective: '01.08.2026', pages }
  })
}

// ---------------------------------------------------------------------------
// Regroup the PL (price-list) families under the PRODUCT CATALOGUE's own
// section numbers (S-1..S-11 / O-1..O-9) so the app lines up with the printed
// catalogue instead of the price-list PDF's different numbering.
// ---------------------------------------------------------------------------

const SEC_KEY = (() => {
  const m = new Map()
  for (const [k, v] of Object.entries(CODE_SECTION)) {
    const K = k.toUpperCase().trim()
    if (!m.has(K)) m.set(K, v)
    for (const part of K.split('/')) if (part.length >= 2 && !m.has(part)) m.set(part, v)
  }
  return m
})()

function codeVariants(code) {
  const out = new Set()
  for (let c of String(code || '').split('/')) {
    c = c.trim().toUpperCase(); if (!c) continue
    out.add(c)
    out.add(c.replace(/^\d+/, ''))   // 12BR -> BR (long-book variants)
    out.add(c.replace(/\d+$/, ''))   // LC72 -> LC, PW100 -> PW
  }
  return [...out].filter(Boolean)
}

export function sectionForFamily(name, code) {
  const over = NAME_OVERRIDES[String(name || '').toUpperCase().trim()]
  if (over) return over
  const vs = codeVariants(code)
  for (const v of vs) if (SEC_KEY.has(v)) return SEC_KEY.get(v)
  for (const v of vs) {
    if (v.length < 2) continue
    for (const [k, s] of SEC_KEY) if (k.startsWith(v) || v.startsWith(k)) return s
  }
  return null
}

const secNum = (s) => Number(String(s).split('-')[1] || 999)

// catalog: PL divisions (already price-merged). Returns the same shape, but with
// families regrouped into the catalogue's sections.
export function regroupByCatalogue(catalog) {
  const buckets = new Map()   // section -> families[]
  const loose = []            // families with no catalogue section
  for (const div of catalog) {
    for (const p of div.pages) {
      for (const f of p.families) {
        const sec = sectionForFamily(f.name, f.code)
        if (!sec) { loose.push({ f, div: div.division }); continue }
        if (!buckets.has(sec)) buckets.set(sec, [])
        buckets.get(sec).push(f)
      }
    }
  }
  const effective = catalog[0]?.effective
  const build = (letter, divisionName) => {
    const pages = [...buckets.keys()]
      .filter((s) => s.startsWith(letter + '-'))
      .sort((a, b) => secNum(a) - secNum(b))
      .map((s) => ({ catNo: s, title: SECTION_TITLES[s] || s, families: buckets.get(s), notes: null }))
    const extras = loose.filter((l) => l.div === divisionName).map((l) => l.f)
    if (extras.length) pages.push({ catNo: letter + '-·', title: 'Other', families: extras, notes: null })
    return { division: divisionName, effective, pages }
  }
  return [build('S', 'School Stationery'), build('O', 'Office Stationery')]
}
