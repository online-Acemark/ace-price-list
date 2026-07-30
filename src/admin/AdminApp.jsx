import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPA_URL, SUPA_KEY, PHOTO_BUCKET } from '../supabase.js'

const sb = createClient(SUPA_URL, SUPA_KEY)

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
    if (error) setErr(error.message)
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
/*  Family editor card                                                 */
/* ------------------------------------------------------------------ */
function FamilyCard({ fam, items, onSaved }) {
  const [f, setF] = React.useState(fam)
  const [rows, setRows] = React.useState(items)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const dirty = JSON.stringify({ f, rows }) !== JSON.stringify({ f: fam, rows: items })

  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const { error } = await sb.from('pl_families').update({
        name: f.name, code: f.code, size: f.size, col: f.col, tag: f.tag || null,
        states: f.states, visible: f.visible,
        rulling_override: f.rulling_override || null,
        photo_url: f.photo_url || null,
      }).eq('id', f.id)
      if (error) throw error
      for (const r of rows) {
        const orig = items.find((x) => x.id === r.id)
        if (JSON.stringify(orig) === JSON.stringify(r)) continue
        const { error: e2 } = await sb.from('pl_items').update({
          label: r.label, states: r.states, visible: r.visible,
          mrp: r.mrp, dp: r.dp, pkt: r.pkt, crt: r.crt, bld: r.bld,
        }).eq('id', r.id)
        if (e2) throw e2
      }
      setMsg('✅ Saved')
      onSaved({ f, rows })
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

  return (
    <div className={'fcard' + (f.visible ? '' : ' hidden-fam')}>
      <div className="fcard-head" onClick={() => setOpen((o) => !o)}>
        <div className="fcard-photo">
          {f.photo_url
            ? <img src={f.photo_url} alt="" />
            : <span className="nophoto" title="Photo API se aayegi (agar ERP me hai); apni photo upload karne ke liye card kholo">API</span>}
        </div>
        <div className="fcard-title">
          <b>{f.name}</b>
          <small>Code {f.code || '—'}{f.size ? ' · ' + f.size : ''} · {rows.length} items</small>
        </div>
        <div className="fcard-flags">
          {(f.states || []).join('+') || '—'}
          {!f.visible ? ' · HIDDEN' : ''}
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
            <label>Rulling override
              <input value={f.rulling_override || ''} onChange={(e) => set('rulling_override', e.target.value)}
                placeholder="khali = ERP auto · HIDE = line hatao · ya apna text" />
            </label>
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

          <table className="itbl">
            <thead>
              <tr><th>Label</th><th>ERP ID</th><th>MRP*</th><th>DP*</th><th>PKT*</th><th>CRT*</th><th>BLD*</th><th>State</th><th>Show</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.visible ? '' : 'hidden-row'}>
                  <td><input value={r.label || ''} onChange={(e) => setRow(i, 'label', e.target.value)} /></td>
                  <td className="pid">{r.product_id || '—'}</td>
                  <td><input value={r.mrp ?? ''} onChange={(e) => setRow(i, 'mrp', e.target.value)} /></td>
                  <td><input value={r.dp ?? ''} onChange={(e) => setRow(i, 'dp', e.target.value)} /></td>
                  <td><input value={r.pkt ?? ''} onChange={(e) => setRow(i, 'pkt', e.target.value)} /></td>
                  <td><input value={r.crt ?? ''} onChange={(e) => setRow(i, 'crt', e.target.value)} /></td>
                  <td><input value={r.bld ?? ''} onChange={(e) => setRow(i, 'bld', e.target.value)} /></td>
                  <td><StateTicks value={r.states} onChange={(v) => setRow(i, 'states', v)} /></td>
                  <td><input type="checkbox" checked={!!r.visible} onChange={(e) => setRow(i, 'visible', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fcard-note">* MRP/DP/PKT/CRT/BLD fallback hain — jab ERP me item na mile tab dikhte hain. Live rate hamesha ERP ID se aata hai.</div>

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
  const [session, setSession] = React.useState(undefined) // undefined = checking
  const [cats, setCats] = React.useState([])
  const [fams, setFams] = React.useState([])
  const [items, setItems] = React.useState([])
  const [selCat, setSelCat] = React.useState(null)
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

  if (session === undefined) return <div className="login-wrap"><div className="login-box">Checking login…</div></div>
  if (!session) return <Login onDone={() => {}} />

  const query = q.trim().toLowerCase()
  const catList = cats
  const shownFams = fams.filter((f) => {
    if (query) {
      const cat = cats.find((c) => c.id === f.category_id)
      const hay = (f.name + ' ' + (f.code || '') + ' ' + (cat?.title || '')).toLowerCase()
      return query.split(/\s+/).every((w) => hay.includes(w))
    }
    return selCat ? f.category_id === selCat : true
  })

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
        <div className="abrand">ACEMARK <span>Admin</span></div>
        <input className="asearch" type="search" placeholder="Search family / code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="linkbtn" onClick={loadAll} disabled={loading}>{loading ? 'Loading…' : '⟳ Reload'}</button>
        <button className="linkbtn" onClick={() => sb.auth.signOut()}>Logout</button>
      </header>

      <div className="abody">
        <nav className="anav">
          <button className={selCat == null && !query ? 'on' : ''} onClick={() => { setSelCat(null); setQ('') }}>All ({fams.length})</button>
          {catList.map((c) => (
            <button key={c.id} className={selCat === c.id ? 'on' : ''} onClick={() => { setSelCat(c.id); setQ('') }}>
              <b>{c.cat_no}</b> {c.title}
              <small>{fams.filter((f) => f.category_id === c.id).length}</small>
            </button>
          ))}
        </nav>

        <main className="amain">
          {loading ? <div className="aload">Loading…</div> : null}
          {shownFams.map((f) => (
            <FamilyCard
              key={f.id + ':' + f.updated_at}
              fam={f}
              items={items.filter((i) => i.family_id === f.id)}
              onSaved={(next) => patch(f.id, next)}
            />
          ))}
          {!loading && !shownFams.length ? <div className="aload">Kuch nahi mila</div> : null}
        </main>
      </div>
    </div>
  )
}
