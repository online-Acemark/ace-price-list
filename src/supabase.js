// Supabase se catalog (pl_categories / pl_families / pl_items).
// Admin panel yahi tables edit karta hai; client app har load pe inhe padhta
// hai aur upar ERP ke live rates chadhata hai. Supabase na mile to caller
// bundled catalog.js pe gir jata hai.

const ENV = import.meta.env || {}
export const SUPA_URL = ENV.VITE_SUPABASE_URL || 'https://dgsuenfqujouikjefymm.supabase.co'
export const SUPA_KEY = ENV.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnc3VlbmZxdWpvdWlramVmeW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyODIxNzQsImV4cCI6MjA4NTg1ODE3NH0.WE6CZBqSkZB5m5iE0iFsiru2FSJ70O1ZJBc_xNL9FYM'
export const PHOTO_BUCKET = 'pl-product-photos'

async function rest(path) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Supabase HTTP ' + res.status)
  return res.json()
}

const DIV_ORDER = ['School Stationery', 'Office Stationery', 'Corporate', 'Others']

// pl_* tables -> catalog.js jaisa shape:
// [{ division, effective, pages: [{catNo,title,notes,families:[{name,code,...,rows}]}] }]
export async function fetchSupabaseCatalog() {
  const [cats, fams, items] = await Promise.all([
    rest('pl_categories?select=*&visible=eq.true&order=sort_order'),
    rest('pl_families?select=*&visible=eq.true&order=sort_order'),
    rest('pl_items?select=*&visible=eq.true&order=sort_order'),
  ])
  if (!cats.length) throw new Error('pl_categories empty')

  const itemsByFam = new Map()
  for (const it of items) {
    if (!itemsByFam.has(it.family_id)) itemsByFam.set(it.family_id, [])
    itemsByFam.get(it.family_id).push({
      label: it.label,
      mrp: it.mrp == null ? '' : (isNaN(Number(it.mrp)) ? it.mrp : Number(it.mrp)),
      dp: it.dp == null ? '' : String(it.dp),
      pkt: it.pkt == null ? '' : it.pkt,
      crt: it.crt == null ? '' : it.crt,
      bld: it.bld == null ? '' : it.bld,
      id: it.product_id == null ? null : Number(it.product_id),
      states: it.states || ['CG', 'OD'],
    })
  }

  const famsByCat = new Map()
  for (const f of fams) {
    if (!famsByCat.has(f.category_id)) famsByCat.set(f.category_id, [])
    famsByCat.get(f.category_id).push({
      name: f.name, code: f.code, size: f.size, tag: f.tag, col: f.col,
      rows: itemsByFam.get(f.id) || [],
      states: f.states || ['CG', 'OD'],
      img: f.photo_url || null,          // admin ki upload photo — API photo se upar
      _photoOverride: !!f.photo_url,
      _rulesOv: f.rulling_override || null,
    })
  }

  const byDiv = new Map()
  for (const c of cats) {
    if (!byDiv.has(c.division)) byDiv.set(c.division, [])
    byDiv.get(c.division).push({
      catNo: c.cat_no, title: c.title,
      notes: c.notes && c.notes.length ? c.notes : null,
      families: famsByCat.get(c.id) || [],
    })
  }

  const divisions = [...byDiv.keys()].sort((a, b) => {
    const ia = DIV_ORDER.indexOf(a), ib = DIV_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  return divisions.map((div) => ({
    division: div,
    effective: '01.08.2026',
    pages: byDiv.get(div).filter((p) => p.families.length),
  }))
}

// CG/OD filter: family/row jinke states me ye state ho wahi rahe.
// (bundled catalog.js me states nahi hote — wo sab jagah dikhta hai)
export function filterByState(catalog, state) {
  return catalog
    .map((d) => ({
      ...d,
      pages: d.pages
        .map((p) => ({
          ...p,
          families: p.families
            .filter((f) => !f.states || f.states.includes(state))
            .map((f) => ({
              ...f,
              rows: f.rows.filter((r) => !r.states || r.states.includes(state)),
            }))
            .filter((f) => f.rows.length),
        }))
        .filter((p) => p.families.length),
    }))
    .filter((d) => d.pages.length)
}

// URL se state: ?state=OD ya #od -> OD, warna CG
export function stateFromUrl() {
  const s = (new URLSearchParams(window.location.search).get('state') || '').toUpperCase()
  if (s === 'OD' || s === 'CG') return s
  if (/#od\b/i.test(window.location.hash)) return 'OD'
  return 'CG'
}
