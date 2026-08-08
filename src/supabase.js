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
// state = 'OD' ho to family apni od_category_id (agar set hai) ke andar
// group hoti hai — CG me hamesha apni asli category me. Family ek hi hai,
// bas OD list me alag jagah dikh sakti hai.
export async function fetchSupabaseCatalog(state) {
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
      // manual DP override — set ho to ERP ke upar jeet-ta hai (api.js dekho)
      _dpOverride: it.dp_override == null ? '' : String(it.dp_override),
      // manual PKT override — set ho to ERP pack ke upar jeet-ta hai
      _pktOverride: it.pkt_override == null ? '' : String(it.pkt_override),
      pkt: it.pkt == null ? '' : it.pkt,
      crt: it.crt == null ? '' : it.crt,
      bld: it.bld == null ? '' : it.bld,
      id: it.product_id == null ? null : Number(it.product_id),
      states: it.states || ['CG', 'OD'],
    })
  }

  const famsByCat = new Map()
  for (const f of fams) {
    // OD list me od_category_id jeet-ta hai (set ho to); CG me hamesha asli
    const useOd = state === 'OD' && f.od_category_id
    const catId = useOd ? f.od_category_id : f.category_id
    const sortKey = useOd ? (f.od_sort_order ?? 1000 + f.sort_order) : f.sort_order
    if (!famsByCat.has(catId)) famsByCat.set(catId, [])
    famsByCat.get(catId).push({
      // OD me alag naam ho sakta hai; ERP-matching hamesha asli naam se hoti
      // hai (_matchName) taaki rulling/fallback na bigde
      name: (state === 'OD' && f.od_name) ? f.od_name : f.name,
      _matchName: f.name,
      code: f.code, size: f.size, tag: f.tag, col: f.col,
      pktHeader: f.pkt_header || null,   // PKT column ka custom naam (jaise BOX)
      dpHeader: f.dp_header || null,     // DP column ka custom naam (jaise "DP in Kg")
      pktValue: f.pkt_value || null,     // sab rows me fixed value (jaise 500)
      availItems: f.available_items || null, // table ke neeche "Available:" list
      rows: itemsByFam.get(f.id) || [],
      states: f.states || ['CG', 'OD'],
      img: f.photo_url || null,          // admin ki upload photo — API photo se upar
      _photoOverride: !!f.photo_url,
      _rulesOv: f.rulling_override || null,
      _sortKey: sortKey,
    })
  }
  for (const list of famsByCat.values()) list.sort((a, b) => a._sortKey - b._sortKey)

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

// CG/OD filter: family ka tick master hai — family pe state ho to wo dikhegi.
// Rows ka tick sirf fine-tuning hai: agar family ke KISI row pe wo state hai
// to sirf wahi rows aayengi; kisi pe nahi hai to POORI family aayegi (matlab
// employee ne sirf family-level tick lagaya tha — usko blank mat karo).
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
            .map((f) => {
              const rows = f.rows.filter((r) => !r.states || r.states.includes(state))
              return { ...f, rows: rows.length ? rows : f.rows }
            })
            .filter((f) => f.rows.length),
        }))
        .filter((p) => p.families.length),
    }))
    .filter((d) => d.pages.length)
}

// Secret link codes — price list SIRF inhi links se khulti hai:
//   <app-url>/?list=<code>
// Bina/galat code ke access screen dikhti hai. Kisi client se link leak ho
// jaye to yahan code badal do — purana link turant band, naya bhej do.
export const LIST_CODES = {
  'cg-7kq4m92xa': 'CG',
  'od-3prn86wz1': 'OD',
}

// URL ke ?list= code se state; galat/koi code nahi -> null (no access)
export function stateFromUrl() {
  const code = (new URLSearchParams(window.location.search).get('list') || '').trim().toLowerCase()
  return LIST_CODES[code] || null
}
