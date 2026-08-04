import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPA_URL, SUPA_KEY, PHOTO_BUCKET } from '../supabase.js'

const sb = createClient(SUPA_URL, SUPA_KEY)
const DIVISIONS = ['School Stationery', 'Office Stationery', 'Corporate']

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */
function Login({ onDone }) {
  const [email, setEmail] = React.useState('')
  const [pass, setPass] = React.useState('')
  const [err, setErr] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const go = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await sb.auth.signInWithPassword({ email, password: pass })
    setBusy(false)
    if (error) setErr(error.message || 'Login failed')
    else onDone()
  }
  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={go}>
        <div className="login-brand">ACEMARK <span>STATIONERS</span></div>
        <div className="login-sub">PriceList Admin Panel</div>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        {err ? <div className="login-err">{err}</div> : null}
        <button disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
        <div className="login-note">User banane ke liye: Supabase Dashboard → Authentication → Add user</div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Small bits                                                         */
/* ------------------------------------------------------------------ */
function StateTicks({ value, onChange }) {
  const has = (s) => (value || []).includes(s)
  const toggle = (s) => {
    const cur = new Set(value || [])
    cur.has(s) ? cur.delete(s) : cur.add(s)
    onChange([...cur])
  }
  return (
    <span className="ticks">
      {['CG', 'OD'].map((s) => (
        <label key={s} className={has(s) ? 'on' : ''}>
          <input type="checkbox" checked={has(s)} onChange={() => toggle(s)} />{s}
        </label>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Category Manager                                                   */
/* ------------------------------------------------------------------ */
function CatRow({ cat, famCount, cats, onSaved, onDeleted, onMove }) {
  const [c, setC] = React.useState(cat)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  React.useEffect(() => { setC(cat) }, [cat])
  const dirty = JSON.stringify(c) !== JSON.stringify(cat)
  const set = (k, v) => setC((o) => ({ ...o, [k]: v }))

  const save = async () => {
    const no = String(c.cat_no || '').trim().toUpperCase()
    if (!no) { setMsg('❌ Number khali hai'); return }
    if (cats.some((x) => x.id !== c.id && x.cat_no.toUpperCase() === no)) {
      setMsg('❌ "' + no + '" pehle se hai — number unique hona chahiye')
      return
    }
    setBusy(true); setMsg('')
    const { error } = await sb.from('pl_categories')
      .update({ cat_no: no, title: c.title, division: c.division, visible: c.visible })
      .eq('id', c.id)
    setBusy(false)
    if (error) setMsg('❌ ' + error.message)
    else { setMsg('✅ Saved'); onSaved({ ...c, cat_no: no }) }
    setTimeout(() => setMsg(''), 3000)
  }

  const del = async () => {
    if (famCount > 0) return
    if (!window.confirm(`"${c.cat_no} ${c.title}" delete karein?`)) return
    setBusy(true)
    const { error } = await sb.from('pl_categories').delete().eq('id', c.id)
    setBusy(false)
    if (error) setMsg('❌ ' + error.message)
    else onDeleted(c.id)
  }

  return (
    <div className={'catrow' + (c.visible ? '' : ' hidden-fam')}>
      <div className="catrow-move">
        <button onClick={() => onMove(cat, -1)} title="Upar">▲</button>
        <button onClick={() => onMove(cat, 1)} title="Neeche">▼</button>
      </div>
      <input className="catrow-no" value={c.cat_no || ''} onChange={(e) => set('cat_no', e.target.value)} />
      <input className="catrow-title" value={c.title || ''} onChange={(e) => set('title', e.target.value)} />
      <select className="catrow-div" value={c.division} onChange={(e) => set('division', e.target.value)}>
        {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <span className="catrow-count">{famCount} fam</span>
      <label className="vis"><input type="checkbox" checked={!!c.visible} onChange={(e) => set('visible', e.target.checked)} /> Show</label>
      <button className="savebtn sm" disabled={busy || !dirty} onClick={save}>{dirty ? 'Save' : 'Saved'}</button>
      <button className="linkbtn danger" disabled={famCount > 0} onClick={del}
        title={famCount > 0 ? 'Pehle iski families kahin aur move karo' : 'Delete'}>🗑</button>
      <span className="msg">{msg}</span>
    </div>
  )
}

function CatManager({ cats, fams, setCats }) {
  const [busy, setBusy] = React.useState(false)
  const famCount = (cid) => fams.filter((f) => f.category_id === cid).length

  // division ke andar order swap
  const move = async (cat, dir) => {
    const sibs = cats.filter((x) => x.division === cat.division).sort((a, b) => a.sort_order - b.sort_order)
    const i = sibs.findIndex((x) => x.id === cat.id)
    const j = i + dir
    if (j < 0 || j >= sibs.length) return
    const a = sibs[i], b = sibs[j]
    setBusy(true)
    await sb.from('pl_categories').update({ sort_order: b.sort_order }).eq('id', a.id)
    await sb.from('pl_categories').update({ sort_order: a.sort_order }).eq('id', b.id)
    setBusy(false)
    setCats((cs) => cs.map((x) => x.id === a.id ? { ...x, sort_order: b.sort_order } : x.id === b.id ? { ...x, sort_order: a.sort_order } : x))
  }

  const addNew = async () => {
    const division = window.prompt('Division? (School Stationery / Office Stationery / Corporate)', 'School Stationery')
    if (!division || !DIVISIONS.includes(division)) { if (division) alert('Division exact likhna hota hai'); return }
    const no = window.prompt('Category number (jaise S-11):', '')
    if (!no) return
    const noU = no.trim().toUpperCase()
    if (cats.some((x) => x.cat_no.toUpperCase() === noU)) { alert('"' + noU + '" pehle se hai'); return }
    const title = window.prompt('Category ka naam:', '')
    if (!title) return
    const maxOrder = Math.max(-1, ...cats.filter((x) => x.division === division).map((x) => x.sort_order))
    const { data, error } = await sb.from('pl_categories')
      .insert({ cat_no: noU, title, division, sort_order: maxOrder + 1, visible: true })
      .select().single()
    if (error) alert(error.message)
    else setCats((cs) => [...cs, data])
  }

  const byDiv = DIVISIONS.map((d) => ({
    division: d,
    list: cats.filter((c) => c.division === d).sort((a, b) => a.sort_order - b.sort_order),
  }))

  return (
    <div className="catmgr">
      <div className="catmgr-head">
        <h3>Categories</h3>
        <button className="savebtn sm" onClick={addNew}>+ New Category</button>
      </div>
      <div className="catmgr-note">Number badlo (O-5 → S-11), naam/division badlo, ▲▼ se order — sab turant live. Delete sirf khali category ka hota hai (pehle families move karo).</div>
      {byDiv.map((g) => (
        <div key={g.division}>
          <div className="catmgr-div">{g.division}</div>
          {g.list.map((c) => (
            <CatRow key={c.id} cat={c} famCount={famCount(c.id)} cats={cats} onMove={move}
              onSaved={(next) => setCats((cs) => cs.map((x) => (x.id === next.id ? next : x)))}
              onDeleted={(id) => setCats((cs) => cs.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      ))}
      {busy ? <div className="aload">…</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Family editor card                                                 */
/* ------------------------------------------------------------------ */
function FamilyCard({ fam, items, cats, onSaved, onMoveFam, onReload }) {
  const [f, setF] = React.useState(fam)
  const [rows, setRows] = React.useState(items)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  React.useEffect(() => { setF(fam); setRows(items) }, [fam, items])
  const dirty = JSON.stringify({ f, rows }) !== JSON.stringify({ f: fam, rows: items })

  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  // naya item row (temp negative id — Save pe insert hota hai)
  const addRow = () => {
    setOpen(true)
    setRows((rs) => [...rs, {
      id: -Date.now(), family_id: fam.id, sort_order: rs.length,
      label: '', product_id: '', mrp: '', dp: '', dp_override: '', pkt: '', crt: '', bld: '',
      states: f.states || ['CG', 'OD'], visible: true, _new: true,
    }])
  }

  const delRow = async (r) => {
    if (r.id < 0) { setRows((rs) => rs.filter((x) => x.id !== r.id)); return }
    if (!window.confirm(`"${r.label}" item delete karein? (wapas nahi aayega)`)) return
    setBusy(true)
    const { error } = await sb.from('pl_items').delete().eq('id', r.id)
    setBusy(false)
    if (error) { setMsg('❌ ' + error.message); return }
    setRows((rs) => rs.filter((x) => x.id !== r.id))
    onReload()
  }

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const patch = {
        name: f.name, code: f.code, size: f.size, col: f.col, tag: f.tag || null,
        states: f.states, visible: f.visible,
        rulling_override: f.rulling_override || null,
        photo_url: f.photo_url || null,
        od_category_id: f.od_category_id || null,
        od_sort_order: f.od_category_id ? (f.od_sort_order ?? null) : null,
        od_name: (f.od_name || '').trim() || null,
        pkt_header: (f.pkt_header || '').trim() || null,
        pkt_value: (f.pkt_value || '').trim() || null,
        available_items: (f.available_items || '').trim() || null,
      }
      // category badli ho to target ke aakhir me jodo
      if (f.category_id !== fam.category_id) {
        patch.category_id = f.category_id
        patch.sort_order = 1000 + Date.now() % 100000
      }
      const { error } = await sb.from('pl_families').update(patch).eq('id', f.id)
      if (error) throw error
      let inserted = false
      for (const r of rows) {
        if (r.id < 0) {
          // naya item — insert
          if (!String(r.label || '').trim()) throw new Error('Naye item ka Label khali hai')
          const pid = String(r.product_id || '').trim()
          const { error: e3 } = await sb.from('pl_items').insert({
            family_id: fam.id, sort_order: r.sort_order,
            label: r.label.trim(),
            product_id: pid && !isNaN(Number(pid)) ? Number(pid) : null,
            mrp: r.mrp || null, dp: r.dp || null, dp_override: String(r.dp_override || '').trim() || null,
            pkt: r.pkt || null, crt: r.crt || null, bld: r.bld || null,
            states: r.states, visible: r.visible,
          })
          if (e3) throw e3
          inserted = true
          continue
        }
        const orig = items.find((x) => x.id === r.id)
        if (JSON.stringify(orig) === JSON.stringify(r)) continue
        const { error: e2 } = await sb.from('pl_items').update({
          label: r.label, states: r.states, visible: r.visible,
          mrp: r.mrp, dp: r.dp, dp_override: String(r.dp_override || '').trim() || null,
          pkt: r.pkt, crt: r.crt, bld: r.bld,
        }).eq('id', r.id)
        if (e2) throw e2
      }
      setMsg('✅ Saved')
      if (inserted) onReload()
      else onSaved({ f: { ...f, sort_order: patch.sort_order ?? f.sort_order }, rows })
    } catch (e) {
      setMsg('❌ ' + (e.message || e))
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(''), 3500)
    }
  }

  const upload = async (file) => {
    if (!file) return
    setBusy(true); setMsg('Uploading…')
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `fam-${f.id}-${Date.now()}.${ext}`
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path)
      const url = data.publicUrl
      const { error: e2 } = await sb.from('pl_families').update({ photo_url: url }).eq('id', f.id)
      if (e2) throw e2
      set('photo_url', url)
      setMsg('✅ Photo uploaded')
      onSaved({ f: { ...f, photo_url: url }, rows })
    } catch (e) {
      setMsg('❌ ' + (e.message || e) + (String(e.message || '').includes('Bucket') ? ' — Dashboard me "pl-product-photos" bucket banao (Public)' : ''))
    } finally {
      setBusy(false)
    }
  }

  const removePhoto = async () => {
    setBusy(true)
    const { error } = await sb.from('pl_families').update({ photo_url: null }).eq('id', f.id)
    setBusy(false)
    if (!error) { set('photo_url', null); onSaved({ f: { ...f, photo_url: null }, rows }) }
  }

  const catOpts = DIVISIONS.flatMap((d) =>
    cats.filter((c) => c.division === d).sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, label: `${c.cat_no} · ${c.title} (${d.split(' ')[0]})` }))
  )

  return (
    <div className={'fcard' + (f.visible ? '' : ' hidden-fam')}>
      <div className="fcard-head" onClick={() => setOpen((o) => !o)}>
        <div className="fcard-photo">
          {f.photo_url
            ? <img src={f.photo_url} alt="" />
            : <span className="nophoto" title="Photo API se aayegi (agar ERP me hai)">API</span>}
        </div>
        <div className="fcard-title">
          <b>{f.name}</b>
          <small>Code {f.code || '—'}{f.size ? ' · ' + f.size : ''} · {rows.length} items</small>
        </div>
        <div className="fcard-flags">
          {(f.states || []).join('+') || '—'}
          {!f.visible ? ' · HIDDEN' : ''}
        </div>
        <div className="fcard-updown" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onMoveFam(fam, -1)} title="Upar">▲</button>
          <button onClick={() => onMoveFam(fam, 1)} title="Neeche">▼</button>
        </div>
        <div className="fcard-arrow">{open ? '▲' : '▼'}</div>
      </div>

      {open ? (
        <div className="fcard-body">
          <div className="grid2">
            <label>Name <input value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></label>
            <label>Code <input value={f.code || ''} onChange={(e) => set('code', e.target.value)} /></label>
            <label>Size <input value={f.size || ''} onChange={(e) => set('size', e.target.value)} placeholder="24×18 cm" /></label>
            <label>Column header <input value={f.col || ''} onChange={(e) => set('col', e.target.value)} placeholder="PAGES / QUIRE / ITEM / CODE" /></label>
            <label>Tag <input value={f.tag || ''} onChange={(e) => set('tag', e.target.value)} placeholder="NEW / RATE REVISED" /></label>
            <label>PKT column ka naam <input value={f.pkt_header || ''} onChange={(e) => set('pkt_header', e.target.value)} placeholder="khali = PKT · ya likho BOX" /></label>
            <label>PKT fixed value <input value={f.pkt_value || ''} onChange={(e) => set('pkt_value', e.target.value)} placeholder="khali = ERP se · ya likho 500" /></label>
            <label>Rulling override
              <input value={f.rulling_override || ''} onChange={(e) => set('rulling_override', e.target.value)}
                placeholder="khali = ERP auto · HIDE ya NA = line hatao · ya apna text" />
            </label>
            <label>Available items list (table ke neeche dikhegi)
              <input value={f.available_items || ''} onChange={(e) => set('available_items', e.target.value)}
                placeholder="khali = kuch nahi · jaise: Black, Blue, Green, Pink" />
            </label>
            <label>Category (move karne ke liye badlo)
              <select value={f.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
                {catOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label>OD Name (OD list me alag naam dikhana ho to — khali = same naam)
              <input value={f.od_name || ''} onChange={(e) => set('od_name', e.target.value)} placeholder="khali = CG wala hi naam" />
            </label>
            <label>OD Category (OD list me alag jagah dikhana ho to — CG pe asar nahi)
              <select value={f.od_category_id || ''} onChange={(e) => set('od_category_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— apni hi category me —</option>
                {catOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            {f.od_category_id ? (
              <label>OD order (chhota number = upar)
                <input type="number" value={f.od_sort_order ?? ''} placeholder="auto"
                  onChange={(e) => set('od_sort_order', e.target.value === '' ? null : Number(e.target.value))} />
              </label>
            ) : null}
          </div>

          <div className="fcard-row2">
            <span>State: <StateTicks value={f.states} onChange={(v) => set('states', v)} /></span>
            <label className="vis">
              <input type="checkbox" checked={!!f.visible} onChange={(e) => set('visible', e.target.checked)} /> Visible
            </label>
            <span className="photo-actions">
              <label className="upbtn">
                📷 {f.photo_url ? 'Photo badlo' : 'Photo upload'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files[0])} />
              </label>
              {f.photo_url ? <button className="linkbtn" onClick={removePhoto}>Remove (API wali chalegi)</button> : null}
            </span>
          </div>

          <div className="itbl-wrap">
          <table className="itbl">
            <thead>
              <tr><th>Label</th><th>ERP ID</th><th>MRP*</th><th>DP*</th><th title="Set ho to ERP ke upar yahi DP dikhega. Khali = ERP se.">DP force</th><th>PKT*</th><th>CRT*</th><th>BLD*</th><th>State</th><th>Show</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={(r.visible ? '' : 'hidden-row') + (r._new ? ' new-row' : '')}>
                  <td><input value={r.label || ''} onChange={(e) => setRow(i, 'label', e.target.value)} placeholder={r._new ? 'jaise 96P' : ''} /></td>
                  <td className="pid">
                    {r._new
                      ? <input value={r.product_id || ''} onChange={(e) => setRow(i, 'product_id', e.target.value)} placeholder="ERP ID" style={{ width: 70 }} />
                      : (r.product_id || '—')}
                  </td>
                  <td><input value={r.mrp ?? ''} onChange={(e) => setRow(i, 'mrp', e.target.value)} /></td>
                  <td><input value={r.dp ?? ''} onChange={(e) => setRow(i, 'dp', e.target.value)} /></td>
                  <td><input className={'ovdp' + (String(r.dp_override ?? '').trim() ? ' set' : '')} value={r.dp_override ?? ''} onChange={(e) => setRow(i, 'dp_override', e.target.value)} placeholder="ERP" title="Value dalo to wahi DP dikhega (ERP ke upar). Khali = ERP live rate." /></td>
                  <td><input value={r.pkt ?? ''} onChange={(e) => setRow(i, 'pkt', e.target.value)} /></td>
                  <td><input value={r.crt ?? ''} onChange={(e) => setRow(i, 'crt', e.target.value)} /></td>
                  <td><input value={r.bld ?? ''} onChange={(e) => setRow(i, 'bld', e.target.value)} /></td>
                  <td><StateTicks value={r.states} onChange={(v) => setRow(i, 'states', v)} /></td>
                  <td><input type="checkbox" checked={!!r.visible} onChange={(e) => setRow(i, 'visible', e.target.checked)} /></td>
                  <td><button className="rowdel" title={r._new ? 'Hatao' : 'Delete item'} onClick={() => delRow(r)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button className="addrow" onClick={addRow}>+ Item add karo</button>
          <div className="fcard-note">* MRP/DP/PKT/CRT/BLD fallback hain — jab ERP me item na mile tab dikhte hain. Live rate hamesha ERP ID se aata hai.<br /><b>DP force</b> = manual DP jo ERP ke <b>upar</b> jeet-ta hai (yellow highlight nahi). Value dalo to wahi dikhega; khali karo to fir ERP ka live rate aa jayega.</div>

          <div className="fcard-save">
            <button className="savebtn" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
            <span className="msg">{msg}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main app                                                           */
/* ------------------------------------------------------------------ */
export default function AdminApp() {
  const [session, setSession] = React.useState(undefined)
  const [cats, setCats] = React.useState([])
  const [fams, setFams] = React.useState([])
  const [items, setItems] = React.useState([])
  const [selCat, setSelCat] = React.useState(null)
  const [view, setView] = React.useState('fams') // 'fams' | 'cats'
  const [q, setQ] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    const [c, f, i] = await Promise.all([
      sb.from('pl_categories').select('*').order('sort_order'),
      sb.from('pl_families').select('*').order('sort_order'),
      sb.from('pl_items').select('*').order('sort_order'),
    ])
    setCats(c.data || [])
    setFams(f.data || [])
    setItems(i.data || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { if (session) loadAll() }, [session, loadAll])

  // nayi family banao — selected category me, warna category number puchho
  const addFamily = React.useCallback(async () => {
    let catId = selCat
    if (!catId) {
      const no = window.prompt('Kis category me banani hai? Category number likho (jaise O-5):', '')
      if (!no) return
      const c = cats.find((x) => x.cat_no.toUpperCase() === no.trim().toUpperCase())
      if (!c) { alert('"' + no + '" naam ki category nahi mili'); return }
      catId = c.id
    }
    const name = window.prompt('Nayi family ka naam:', '')
    if (!name || !name.trim()) return
    const maxOrder = Math.max(-1, ...fams.filter((f) => f.category_id === catId).map((f) => f.sort_order))
    const { error } = await sb.from('pl_families').insert({
      category_id: catId, sort_order: maxOrder + 1, name: name.trim(),
      code: '', col: 'PAGES', states: ['CG'], visible: true,
    })
    if (error) alert(error.message)
    else { setSelCat(catId); setQ(''); loadAll() }
  }, [selCat, cats, fams, loadAll])

  // family ko apni category ke andar upar/neeche (order swap)
  const moveFam = React.useCallback(async (fam, dir) => {
    const sibs = fams.filter((x) => x.category_id === fam.category_id).sort((a, b) => a.sort_order - b.sort_order)
    const i = sibs.findIndex((x) => x.id === fam.id)
    const j = i + dir
    if (j < 0 || j >= sibs.length) return
    const a = sibs[i], b = sibs[j]
    await sb.from('pl_families').update({ sort_order: b.sort_order }).eq('id', a.id)
    await sb.from('pl_families').update({ sort_order: a.sort_order }).eq('id', b.id)
    setFams((fs) => fs.map((x) => x.id === a.id ? { ...x, sort_order: b.sort_order } : x.id === b.id ? { ...x, sort_order: a.sort_order } : x))
  }, [fams])

  if (session === undefined) return <div className="login-wrap"><div className="login-box">Checking login…</div></div>
  if (!session) return <Login onDone={() => {}} />

  const query = q.trim().toLowerCase()
  const shownFams = fams
    .filter((f) => {
      if (query) {
        const cat = cats.find((c) => c.id === f.category_id)
        const hay = (f.name + ' ' + (f.code || '') + ' ' + (cat?.title || '')).toLowerCase()
        return query.split(/\s+/).every((w) => hay.includes(w))
      }
      return selCat ? f.category_id === selCat : true
    })
    .sort((a, b) => a.category_id - b.category_id || a.sort_order - b.sort_order)

  const patch = (fid, next) => {
    setFams((fs) => fs.map((x) => (x.id === fid ? { ...x, ...next.f } : x)))
    setItems((its) => its.map((x) => {
      const r = next.rows.find((y) => y.id === x.id)
      return r ? { ...x, ...r } : x
    }))
  }

  return (
    <div className="admin">
      <header className="abar">
        <div className="abrand"><img className="abrand-logo" src="/Ace_Logo_bg.png" alt="ACE" />ACEMARK <span>Admin</span></div>
        <button className={'linkbtn tab' + (view === 'cats' ? ' on' : '')} onClick={() => setView(view === 'cats' ? 'fams' : 'cats')}>
          {view === 'cats' ? '← Items' : '🗂 Categories'}
        </button>
        <button className="linkbtn" onClick={loadAll} disabled={loading}>{loading ? 'Loading…' : '⟳ Reload'}</button>
        <button className="linkbtn" onClick={() => sb.auth.signOut()}>Logout</button>
        {view === 'fams' ? (
          <input className="asearch" type="search" placeholder="Search family / code…" value={q} onChange={(e) => setQ(e.target.value)} />
        ) : null}
      </header>

      {view === 'cats' ? (
        <div className="abody"><main className="amain"><CatManager cats={cats} fams={fams} setCats={setCats} /></main></div>
      ) : (
        <div className="abody">
          <nav className="anav">
            <button className={selCat == null && !query ? 'on' : ''} onClick={() => { setSelCat(null); setQ('') }}>All ({fams.length})</button>
            {cats.map((c) => (
              <button key={c.id} className={selCat === c.id ? 'on' : ''} onClick={() => { setSelCat(c.id); setQ('') }}>
                <b>{c.cat_no}</b> {c.title}
                <small>{fams.filter((f) => f.category_id === c.id).length}</small>
              </button>
            ))}
          </nav>

          <main className="amain">
            <div className="amain-actions">
              <button className="savebtn sm" onClick={addFamily}>
                + New Family{selCat ? ' (' + (cats.find((c) => c.id === selCat)?.cat_no || '') + ' me)' : ''}
              </button>
            </div>
            {loading ? <div className="aload">Loading…</div> : null}
            {shownFams.map((f) => (
              <FamilyCard
                key={f.id + ':' + f.updated_at + ':' + f.sort_order}
                fam={f}
                items={items.filter((i) => i.family_id === f.id)}
                cats={cats}
                onSaved={(next) => patch(f.id, next)}
                onMoveFam={moveFam}
                onReload={loadAll}
              />
            ))}
            {!loading && !shownFams.length ? <div className="aload">Kuch nahi mila</div> : null}
          </main>
        </div>
      )}
    </div>
  )
}
