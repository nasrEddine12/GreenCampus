import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './index.css'

const API = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api'

/* ── helpers ── */
function errMsg(p, fb) {
  if (!p) return fb
  if (typeof p === 'string') return p
  if (Array.isArray(p)) return p.map(i => errMsg(i, fb)).join(' ')
  if (p.detail) return errMsg(p.detail, fb)
  const [k, v] = Object.entries(p)[0] || []
  if (!k) return fb
  const m = errMsg(v, fb)
  return k === 'non_field_errors' ? m : `${k}: ${m}`
}

async function api(url, opts = {}) {
  console.log('[GC] api() called:', opts.method || 'GET', url)
  let res
  try {
    res = await fetch(url, opts)
  } catch (fetchErr) {
    console.error('[GC] fetch failed:', fetchErr)
    throw new Error('Cannot reach the server. Make sure Django is running at ' + API)
  }
  const json = res.headers.get('content-type')?.includes('application/json')
  const body = json ? await res.json() : await res.text()
  if (!res.ok) throw new Error(errMsg(body, `HTTP ${res.status}`))
  return body
}

function tokenExtract(raw) {
  const s = raw.trim()
  if (!s) return ''
  if (!s.includes('token=')) return s
  try { return new URL(s).searchParams.get('token') || '' } catch (e) { return s }
}

function savedTokens() {
  try {
    return {
      access: localStorage.getItem('gc_access') || '',
      refresh: localStorage.getItem('gc_refresh') || '',
    }
  } catch (e) { return { access: '', refresh: '' } }
}

function persistTokens(a, r) {
  try { localStorage.setItem('gc_access', a); localStorage.setItem('gc_refresh', r) } catch (e) { /* ignore */ }
}

function clearTokens() {
  try { localStorage.removeItem('gc_access'); localStorage.removeItem('gc_refresh') } catch (e) { /* ignore */ }
}

/* ── tiny router ── */
function useHash() {
  const [h, setH] = useState(window.location.hash.slice(1) || '')
  useEffect(() => {
    const fn = () => setH(window.location.hash.slice(1) || '')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return h
}
function go(page) { window.location.hash = page }

/* ── icons (inline SVG) ── */
function LeafIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66L13 14" />
      <path d="M2 12s4.36-3.76 7-5c5.5-2.6 12-1 12-1s1.6 6.5-1 12c-1.24 2.64-5 7-5 7" />
    </svg>
  )
}

function Spinner({ dark }) {
  return <span className={`gc-spinner${dark ? ' gc-spinner--dark' : ''}`} />
}

/* ══════════════════════════════════════════
   ALERT BANNER
   ══════════════════════════════════════════ */
function Alert({ type, message, onDismiss }) {
  if (!message) return null
  return (
    <div className={`gc-alert gc-alert--${type}`} role="alert">
      <span>{type === 'success' ? '✓' : '⚠'}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button className="gc-alert-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  )
}

/* ══════════════════════════════════════════
   NAVBAR
   ══════════════════════════════════════════ */
function Navbar({ page, loggedIn, profile, onLogout, busy }) {
  const initial = profile?.email?.[0]?.toUpperCase() || '?'
  return (
    <nav className="gc-navbar">
      <div className="gc-navbar-inner">
        <button className="gc-navbar-brand" onClick={() => go(loggedIn ? 'dashboard' : 'login')} style={{ cursor: 'pointer' }}>
          <LeafIcon /> GreenCampus
        </button>

        <div className="gc-navbar-nav">
          {loggedIn ? (
            <>
              <button className={`gc-nav-link${page === 'dashboard' ? ' gc-nav-link--active' : ''}`} onClick={() => go('dashboard')}>Dashboard</button>
              <button className={`gc-nav-link${page === 'marketplace' ? ' gc-nav-link--active' : ''}`} onClick={() => go('marketplace')}>Marketplace</button>
              {profile?.is_staff && (
                <button className={`gc-nav-link${page === 'admin' ? ' gc-nav-link--active' : ''}`} onClick={() => go('admin')}>🛡 Admin</button>
              )}
              <div className="gc-nav-user">
                <div className="gc-nav-avatar">{initial}</div>
                <button className="gc-nav-link gc-nav-link--logout" onClick={onLogout} disabled={busy}>Logout</button>
              </div>
            </>
          ) : (
            <>
              <button className={`gc-nav-link${page === 'login' ? ' gc-nav-link--active' : ''}`} onClick={() => go('login')}>Login</button>
              <button className={`gc-nav-link${page === 'register' ? ' gc-nav-link--active' : ''}`} onClick={() => go('register')}>Register</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

/* ══════════════════════════════════════════
   AUTH PAGE (Login / Register / Verify)
   ══════════════════════════════════════════ */
function AuthPage({ mode, setNotice, setError, onAuth }) {
  const [tab, setTab] = useState(mode === 'register' ? 'register' : 'login')
  const [busy, setBusy] = useState(false)
  const [reg, setReg] = useState({ username: '', email: '', password: '', filiere: '', phone: '' })
  const [login, setLogin] = useState({ email: '', password: '' })
  const [verify, setVerify] = useState('')

  useEffect(() => { setTab(mode === 'register' ? 'register' : 'login') }, [mode])

  const inp = (setter) => (field) => (e) => setter(p => ({ ...p, [field]: e.target.value }))

  async function doRegister(e) {
    e.preventDefault()
    console.log('[GC] doRegister fired, form data:', reg)
    setBusy(true); setNotice(''); setError('')
    try {
      const url = `${API}/users/register/`
      console.log('[GC] POSTing to:', url)
      const d = await api(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reg),
      })
      console.log('[GC] Register response:', d)
      setLogin({ email: reg.email, password: reg.password })

      // If backend returned verification token (DEBUG mode), auto-fill verify input
      if (d.verification_token) {
        setVerify(d.verification_token)
        setNotice('Registration successful! Verification token auto-filled below — click Verify to activate your account.')
      } else {
        setNotice(d.detail || 'Registration successful! Check your email for the verification link.')
        setTab('login'); go('login')
      }
    } catch (err) {
      console.error('[GC] Register error:', err)
      setError(err.message)
    } finally { setBusy(false) }
  }

  async function doLogin(e) {
    e.preventDefault(); setBusy(true); setNotice(''); setError('')
    try {
      const d = await api(`${API}/users/login/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login),
      })
      onAuth(d.access, d.refresh)
      setNotice('Welcome back!')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function doVerify(e) {
    e.preventDefault(); setBusy(true); setNotice(''); setError('')
    try {
      const t = tokenExtract(verify)
      if (!t) throw new Error('Enter a verification token or paste the full URL.')
      const d = await api(`${API}/users/verify-email/?token=${encodeURIComponent(t)}`)
      setNotice(d.detail || 'Email verified! You can now log in.')
      setVerify(''); setTab('login')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="gc-auth-page gc-fade-in">
      <div className="gc-auth-card">
        <div className="gc-auth-header">
          <h1>🌿 GreenCampus</h1>
          <p>Eco-friendly campus marketplace for EMSI students</p>
        </div>

        <div className="gc-card">
          <div className="gc-auth-toggle">
            <button className={`gc-auth-toggle-btn${tab === 'login' ? ' gc-auth-toggle-btn--active' : ''}`} onClick={() => { setTab('login'); go('login') }}>Sign In</button>
            <button className={`gc-auth-toggle-btn${tab === 'register' ? ' gc-auth-toggle-btn--active' : ''}`} onClick={() => { setTab('register'); go('register') }}>Create Account</button>
          </div>

          {tab === 'register' ? (
            <form className="gc-form" onSubmit={doRegister}>
              <div className="gc-field">
                <label className="gc-label" htmlFor="reg-user">Username</label>
                <input id="reg-user" className="gc-input" value={reg.username} onChange={inp(setReg)('username')} required placeholder="johndoe" />
              </div>
              <div className="gc-field">
                <label className="gc-label" htmlFor="reg-email">Email (@emsi.ma)</label>
                <input id="reg-email" className="gc-input" type="email" value={reg.email} onChange={inp(setReg)('email')} required placeholder="student@emsi.ma" />
              </div>
              <div className="gc-field">
                <label className="gc-label" htmlFor="reg-pass">Password</label>
                <input id="reg-pass" className="gc-input" type="password" value={reg.password} onChange={inp(setReg)('password')} required minLength={8} placeholder="Min 8 characters" />
              </div>
              <div className="gc-field">
                <label className="gc-label" htmlFor="reg-fil">Filière (optional)</label>
                <input id="reg-fil" className="gc-input" value={reg.filiere} onChange={inp(setReg)('filiere')} placeholder="e.g. GI, SIC" />
              </div>
              <div className="gc-field">
                <label className="gc-label" htmlFor="reg-phone">Phone (optional)</label>
                <input id="reg-phone" className="gc-input" value={reg.phone} onChange={inp(setReg)('phone')} placeholder="06XXXXXXXX" />
              </div>
              <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy} type="submit">
                {busy ? <><Spinner /> Creating…</> : 'Create Account'}
              </button>
            </form>
          ) : (
            <form className="gc-form" onSubmit={doLogin}>
              <div className="gc-field">
                <label className="gc-label" htmlFor="login-email">Email</label>
                <input id="login-email" className="gc-input" type="email" value={login.email} onChange={inp(setLogin)('email')} required placeholder="student@emsi.ma" />
              </div>
              <div className="gc-field">
                <label className="gc-label" htmlFor="login-pass">Password</label>
                <input id="login-pass" className="gc-input" type="password" value={login.password} onChange={inp(setLogin)('password')} required placeholder="Your password" />
              </div>
              <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy} type="submit">
                {busy ? <><Spinner /> Signing in…</> : 'Sign In'}
              </button>
            </form>
          )}

          <div className="gc-verify-section">
            <h3>📧 Verify Email</h3>
            <p>Paste your verification token or the full URL from the email.</p>
            <form className="gc-verify-row" onSubmit={doVerify}>
              <input className="gc-input" value={verify} onChange={e => setVerify(e.target.value)} placeholder="Token or full verification URL" />
              <button className="gc-btn gc-btn--amber" disabled={busy} type="submit">
                {busy ? <Spinner /> : 'Verify'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   DASHBOARD (Profile)
   ══════════════════════════════════════════ */
function DashboardPage({ access, profile, setProfile, setNotice, setError }) {
  const [form, setForm] = useState({ filiere: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!profile)
  const authH = useMemo(() => ({ Authorization: `Bearer ${access}` }), [access])

  const loadProfile = useCallback(async () => {
    if (!access) return
    setLoading(true)
    try {
      const d = await api(`${API}/users/profile/`, { headers: authH })
      setProfile(d)
      setForm({ filiere: d.filiere || '', phone: d.phone || '' })
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [access, authH, setProfile, setError])

  useEffect(() => { loadProfile() }, [loadProfile])

  async function saveProfile(e) {
    e.preventDefault(); setBusy(true); setNotice(''); setError('')
    try {
      const d = await api(`${API}/users/profile/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify(form),
      })
      setProfile(d); setNotice('Profile saved successfully.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="gc-empty"><Spinner dark /><p style={{ marginTop: '1rem' }}>Loading profile…</p></div>

  const initial = profile?.email?.[0]?.toUpperCase() || '?'

  return (
    <div className="gc-fade-in">
      <h1 className="gc-page-title">Dashboard</h1>

      <div className="gc-dashboard-grid">
        <div className="gc-card">
          <div className="gc-profile-header">
            <div className="gc-profile-avatar">{initial}</div>
            <div className="gc-profile-info">
              <h2>{profile?.username || 'User'}</h2>
              <p>{profile?.email || ''}</p>
            </div>
          </div>

          <div className="gc-stat-row" style={{ marginBottom: 'var(--gc-space-lg)' }}>
            <span className={`gc-stat-chip${profile?.is_verified ? '' : ' gc-stat-chip--warn'}`}>
              {profile?.is_verified ? '✓ Verified' : '⏳ Not verified'}
            </span>
            {profile?.is_suspended && <span className="gc-stat-chip gc-stat-chip--warn">⚠ Suspended</span>}
          </div>

          <form className="gc-form" onSubmit={saveProfile}>
            <div className="gc-profile-fields">
              <div className="gc-field">
                <label className="gc-label" htmlFor="prof-fil">Filière</label>
                <input id="prof-fil" className="gc-input" value={form.filiere} onChange={e => setForm(p => ({ ...p, filiere: e.target.value }))} placeholder="e.g. GI, SIC" />
              </div>
              <div className="gc-field">
                <label className="gc-label" htmlFor="prof-phone">Phone</label>
                <input id="prof-phone" className="gc-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="06XXXXXXXX" />
              </div>
            </div>
            <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy} type="submit">
              {busy ? <><Spinner /> Saving…</> : 'Save Profile'}
            </button>
          </form>
        </div>

        <div className="gc-card">
          <div className="gc-card-header">
            <h2 className="gc-card-title">Quick Actions</h2>
            <p className="gc-card-subtitle">Navigate the platform</p>
          </div>
          <div className="gc-form">
            <button className="gc-btn gc-btn--secondary gc-btn--full" onClick={() => go('marketplace')}>🛒 Browse Marketplace</button>
            <button className="gc-btn gc-btn--outline gc-btn--full" onClick={loadProfile} disabled={loading}>
              {loading ? <><Spinner dark /> Refreshing…</> : '🔄 Refresh Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   MARKETPLACE
   ══════════════════════════════════════════ */
function MarketplacePage({ access, setNotice, setError }) {
  const [cats, setCats] = useState([])
  const [listings, setListings] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ category: '', title: '', description: '', condition: 'good', price: '', eco_score: 50, is_available: true })
  const [creating, setCreating] = useState(false)

  const authH = useMemo(() => access ? { Authorization: `Bearer ${access}` } : {}, [access])

  const load = useCallback(async (search) => {
    setBusy(true)
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : ''
      const [c, l] = await Promise.all([
        api(`${API}/market/categories/`),
        api(`${API}/market/listings/${qs}`, { headers: authH }),
      ])
      setCats(c); setListings(l)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }, [authH, setError])

  useEffect(() => { load('') }, [load])

  async function search(e) { e.preventDefault(); setError(''); await load(q) }

  async function createListing(e) {
    e.preventDefault(); setCreating(true); setNotice(''); setError('')
    try {
      if (!access) throw new Error('Please log in to create a listing.')
      await api(`${API}/market/listings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ ...form, category: form.category ? Number(form.category) : null, eco_score: Number(form.eco_score) }),
      })
      setForm({ category: '', title: '', description: '', condition: 'good', price: '', eco_score: 50, is_available: true })
      setNotice('Listing created!'); setShowCreate(false); await load(q)
    } catch (err) { setError(err.message) } finally { setCreating(false) }
  }

  async function toggleFav(listing) {
    if (!access) { setError('Log in to manage favorites.'); return }
    try {
      if (listing.is_favorited) {
        await api(`${API}/market/favorites/${listing.id}/`, { method: 'DELETE', headers: authH })
      } else {
        await api(`${API}/market/favorites/`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authH }, body: JSON.stringify({ listing_id: listing.id }) })
      }
      await load(q)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="gc-fade-in">
      <div className="gc-marketplace-header">
        <h1>🛒 Marketplace</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <form className="gc-search-bar" onSubmit={search}>
            <input className="gc-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search listings…" />
            <button className="gc-btn gc-btn--primary" disabled={busy} type="submit">{busy ? <Spinner /> : 'Search'}</button>
          </form>
          {access && (
            <button className="gc-btn gc-btn--secondary" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? '✕ Cancel' : '+ New Listing'}
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="gc-card gc-create-listing gc-fade-in">
          <div className="gc-card-header"><h2 className="gc-card-title">Create Listing</h2></div>
          <form className="gc-form" onSubmit={createListing}>
            <div className="gc-create-form-grid">
              <div className="gc-field">
                <label className="gc-label">Category</label>
                <select className="gc-select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="">No category</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="gc-field">
                <label className="gc-label">Condition</label>
                <select className="gc-select" value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}>
                  <option value="new">New</option>
                  <option value="like_new">Like New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                </select>
              </div>
              <div className="gc-field gc-field--full">
                <label className="gc-label">Title</label>
                <input className="gc-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required placeholder="What are you selling?" />
              </div>
              <div className="gc-field gc-field--full">
                <label className="gc-label">Description</label>
                <textarea className="gc-textarea" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} required placeholder="Describe the item…" />
              </div>
              <div className="gc-field">
                <label className="gc-label">Price (MAD)</label>
                <input className="gc-input" type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} required placeholder="0.00" />
              </div>
              <div className="gc-field">
                <label className="gc-label">Eco Score (0–100)</label>
                <input className="gc-input" type="number" min="0" max="100" value={form.eco_score} onChange={e => setForm(p => ({ ...p, eco_score: e.target.value }))} />
              </div>
            </div>
            <button className="gc-btn gc-btn--primary gc-btn--full" disabled={creating} type="submit">
              {creating ? <><Spinner /> Creating…</> : 'Publish Listing'}
            </button>
          </form>
        </div>
      )}

      {busy ? (
        <div className="gc-empty"><Spinner dark /><p style={{ marginTop: '1rem' }}>Loading marketplace…</p></div>
      ) : listings.length === 0 ? (
        <div className="gc-empty">
          <div className="gc-empty-icon">📦</div>
          <p>No listings yet. Be the first to post!</p>
        </div>
      ) : (
        <div className="gc-listings-grid">
          {listings.map(l => (
            <article key={l.id} className="gc-listing-card">
              <div className="gc-listing-card-header">
                <h3>{l.title}</h3>
                {access && (
                  <button className="gc-fav-btn" onClick={() => toggleFav(l)} title={l.is_favorited ? 'Remove from favorites' : 'Add to favorites'}>
                    {l.is_favorited ? '❤️' : '🤍'}
                  </button>
                )}
              </div>
              <p className="gc-listing-seller">{l.seller_email}{l.category_name ? ` · ${l.category_name}` : ''}</p>
              <div className="gc-listing-card-body"><p>{l.description}</p></div>
              <div className="gc-listing-meta">
                <span className="gc-tag gc-tag--price">{l.price} MAD</span>
                <span className="gc-tag gc-tag--condition">{l.condition}</span>
                <span className="gc-tag gc-tag--eco">🌿 {l.eco_score}/100</span>
                {l.category_name && <span className="gc-tag gc-tag--category">{l.category_name}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   ADMIN PAGE
   ══════════════════════════════════════════ */

/* — D3 Donut Chart Hook — */
function useDonutChart(ref, data, colors) {
  useEffect(() => {
    if (!ref.current || !data || !window.d3) return
    const d3 = window.d3
    const container = ref.current
    container.innerHTML = ''

    const total = data.reduce((s, d) => s + d.value, 0)
    if (total === 0) {
      container.innerHTML = '<p style="color:#94a3b8;font-size:0.875rem">No data</p>'
      return
    }

    const w = 220, h = 220, radius = Math.min(w, h) / 2
    const svg = d3.select(container).append('svg').attr('width', w).attr('height', h)
      .append('g').attr('transform', `translate(${w / 2},${h / 2})`)

    const pie = d3.pie().value(d => d.value).sort(null)
    const arc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 0.9)
    const arcHover = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 0.95)

    svg.selectAll('path')
      .data(pie(data))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('transition', 'all 0.2s ease')
      .on('mouseover', function () { d3.select(this).attr('d', arcHover) })
      .on('mouseout', function () { d3.select(this).attr('d', arc) })

    // Center text
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
      .style('font-size', '1.5rem').style('font-weight', '700').style('fill', '#0f172a')
      .text(total)
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
      .style('font-size', '0.7rem').style('fill', '#64748b').style('font-weight', '500')
      .text('Total')
  }, [ref, data, colors])
}

/* — D3 Bar Chart Hook — */
function useBarChart(ref, data, colors) {
  useEffect(() => {
    if (!ref.current || !data || !window.d3) return
    const d3 = window.d3
    const container = ref.current
    container.innerHTML = ''

    const total = data.reduce((s, d) => s + d.value, 0)
    if (total === 0) {
      container.innerHTML = '<p style="color:#94a3b8;font-size:0.875rem">No data</p>'
      return
    }

    const margin = { top: 20, right: 20, bottom: 40, left: 50 }
    const w = 300, h = 220
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom

    const svg = d3.select(container).append('svg').attr('width', w).attr('height', h)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand().domain(data.map(d => d.label)).range([0, innerW]).padding(0.35)
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).nice().range([innerH, 0])

    svg.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
      .selectAll('text').style('font-size', '0.7rem').style('fill', '#64748b')

    svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d')))
      .selectAll('text').style('font-size', '0.7rem').style('fill', '#64748b')

    svg.selectAll('rect').data(data).enter().append('rect')
      .attr('x', d => x(d.label)).attr('y', d => y(d.value))
      .attr('width', x.bandwidth()).attr('height', d => innerH - y(d.value))
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('mouseover', function () { d3.select(this).attr('opacity', 0.8) })
      .on('mouseout', function () { d3.select(this).attr('opacity', 1) })

    // Value labels on bars
    svg.selectAll('.bar-label').data(data).enter().append('text')
      .attr('x', d => x(d.label) + x.bandwidth() / 2).attr('y', d => y(d.value) - 6)
      .attr('text-anchor', 'middle').style('font-size', '0.7rem').style('font-weight', '600')
      .style('fill', '#334155').text(d => d.value)
  }, [ref, data, colors])
}

/* — Confirmation Modal — */
function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, showReason, busy }) {
  const [reason, setReason] = useState('')
  return (
    <div className="gc-modal-backdrop" onClick={onCancel}>
      <div className="gc-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        {showReason && (
          <div className="gc-field">
            <label className="gc-label" htmlFor="mod-reason">Reason</label>
            <textarea id="mod-reason" className="gc-textarea" rows={3} value={reason}
              onChange={e => setReason(e.target.value)} placeholder="Explain why this action is being taken…" />
          </div>
        )}
        <div className="gc-modal-actions">
          <button className="gc-btn gc-btn--outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`gc-btn ${confirmClass}`} onClick={() => onConfirm(reason)}
            disabled={busy || (showReason && !reason.trim())}>
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* — Status Badge — */
function StatusBadge({ user }) {
  if (user.is_blacklisted) return <span className="gc-badge gc-badge--blacklisted">⛔ Blacklisted</span>
  if (user.is_suspended) return <span className="gc-badge gc-badge--suspended">⏸ Suspended</span>
  if (user.is_staff) return <span className="gc-badge gc-badge--admin">🛡 Admin</span>
  return <span className="gc-badge gc-badge--active">✓ Active</span>
}

function AdminPage({ access, setNotice, setError }) {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  const donutRef = useRef(null)
  const barRef = useRef(null)

  const authH = useMemo(() => ({ Authorization: `Bearer ${access}` }), [access])

  const donutColors = ['#22c55e', '#f59e0b', '#ef4444']
  const barColors = ['#8b5cf6', '#22c55e']

  const loadData = useCallback(async (f) => {
    setLoading(true)
    try {
      const statusParam = f && f !== 'all' ? `?status=${f}` : ''
      const [s, u] = await Promise.all([
        api(`${API}/users/admin/stats/`, { headers: authH }),
        api(`${API}/users/admin/users/${statusParam}`, { headers: authH }),
      ])
      setStats(s)
      setUsers(u)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [authH, setError])

  useEffect(() => { loadData(filter) }, [loadData, filter])

  // D3 Charts
  useDonutChart(donutRef, stats?.chart_status, donutColors)
  useBarChart(barRef, stats?.chart_overdue, barColors)

  async function doAction(type, userId, reason) {
    setActionBusy(true)
    try {
      const url = `${API}/users/admin/users/${userId}/${type}/`
      const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
      }
      if (type !== 'reactivate') opts.body = JSON.stringify({ reason })
      const d = await api(url, opts)
      setNotice(d.detail || `User ${type}d successfully.`)
      setModal(null)
      await loadData(filter)
    } catch (err) { setError(err.message) } finally { setActionBusy(false) }
  }

  const filters = [
    { key: 'all', label: 'All Users' },
    { key: 'active', label: 'Active' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'blacklisted', label: 'Blacklisted' },
    { key: 'overdue', label: 'Overdue' },
  ]

  if (loading && !stats) return <div className="gc-empty"><Spinner dark /><p style={{ marginTop: '1rem' }}>Loading admin panel…</p></div>

  return (
    <div className="gc-fade-in">
      <div className="gc-admin-header">
        <h1>🛡 Admin Moderation</h1>
      </div>

      {/* — Stat Cards — */}
      <div className="gc-admin-stats">
        <div className="gc-stat-card gc-stat-card--active">
          <div className="gc-stat-card-icon">✅</div>
          <div className="gc-stat-card-value">{stats?.active_users ?? '—'}</div>
          <div className="gc-stat-card-label">Active Users</div>
        </div>
        <div className="gc-stat-card gc-stat-card--suspended">
          <div className="gc-stat-card-icon">⏸</div>
          <div className="gc-stat-card-value">{stats?.suspended_users ?? '—'}</div>
          <div className="gc-stat-card-label">Suspended</div>
        </div>
        <div className="gc-stat-card gc-stat-card--blacklisted">
          <div className="gc-stat-card-icon">⛔</div>
          <div className="gc-stat-card-value">{stats?.blacklisted_users ?? '—'}</div>
          <div className="gc-stat-card-label">Blacklisted</div>
        </div>
        <div className="gc-stat-card gc-stat-card--overdue">
          <div className="gc-stat-card-icon">⏰</div>
          <div className="gc-stat-card-value">{stats?.overdue_users ?? '—'}</div>
          <div className="gc-stat-card-label">Overdue</div>
        </div>
      </div>

      {/* — Charts — */}
      <div className="gc-admin-charts">
        <div className="gc-chart-card">
          <h3>Users by Status</h3>
          <div className="gc-chart-container" ref={donutRef} />
          <div className="gc-chart-legend">
            {(stats?.chart_status || []).map((d, i) => (
              <div key={d.label} className="gc-legend-item">
                <span className="gc-legend-dot" style={{ background: donutColors[i] }} />
                {d.label} ({d.value})
              </div>
            ))}
          </div>
        </div>
        <div className="gc-chart-card">
          <h3>Overdue vs On Time</h3>
          <div className="gc-chart-container" ref={barRef} />
          <div className="gc-chart-legend">
            {(stats?.chart_overdue || []).map((d, i) => (
              <div key={d.label} className="gc-legend-item">
                <span className="gc-legend-dot" style={{ background: barColors[i] }} />
                {d.label} ({d.value})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* — Filter Tabs — */}
      <div className="gc-filter-tabs">
        {filters.map(f => (
          <button key={f.key}
            className={`gc-filter-tab${filter === f.key ? ' gc-filter-tab--active' : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* — Users Table — */}
      <div className="gc-admin-table-wrap">
        <table className="gc-admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Status</th>
              <th>Overdue</th>
              <th>Reason / Info</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No users found</td></tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.username}</td>
                <td>{u.email}</td>
                <td><StatusBadge user={u} /></td>
                <td>{u.overdue_count > 0 ? <span className="gc-badge gc-badge--overdue">{u.overdue_count}</span> : '—'}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.blacklist_reason || u.suspension_reason || '—'}
                </td>
                <td className="gc-actions-cell">
                  {!u.is_staff && !u.is_suspended && !u.is_blacklisted && (
                    <button className="gc-btn gc-btn--amber gc-btn--sm" onClick={() => setModal({ type: 'suspend', user: u })}>Suspend</button>
                  )}
                  {!u.is_staff && !u.is_blacklisted && (
                    <button className="gc-btn gc-btn--danger gc-btn--sm" onClick={() => setModal({ type: 'blacklist', user: u })}>Blacklist</button>
                  )}
                  {!u.is_staff && (u.is_suspended || u.is_blacklisted) && (
                    <button className="gc-btn gc-btn--primary gc-btn--sm" onClick={() => setModal({ type: 'reactivate', user: u })}>Reactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* — Confirmation Modal — */}
      {modal?.type === 'suspend' && (
        <ConfirmModal
          title="Suspend User"
          message={`Are you sure you want to suspend ${modal.user.email}? They will be unable to log in.`}
          confirmLabel="Suspend" confirmClass="gc-btn--amber"
          showReason busy={actionBusy}
          onCancel={() => setModal(null)}
          onConfirm={(reason) => doAction('suspend', modal.user.id, reason)}
        />
      )}
      {modal?.type === 'blacklist' && (
        <ConfirmModal
          title="Blacklist User"
          message={`Are you sure you want to blacklist ${modal.user.email}? This is a severe action — they will be permanently blocked.`}
          confirmLabel="Blacklist" confirmClass="gc-btn--danger"
          showReason busy={actionBusy}
          onCancel={() => setModal(null)}
          onConfirm={(reason) => doAction('blacklist', modal.user.id, reason)}
        />
      )}
      {modal?.type === 'reactivate' && (
        <ConfirmModal
          title="Reactivate User"
          message={`Reactivate ${modal.user.email}? All suspension and blacklist flags will be cleared.`}
          confirmLabel="Reactivate" confirmClass="gc-btn--primary"
          showReason={false} busy={actionBusy}
          onCancel={() => setModal(null)}
          onConfirm={() => doAction('reactivate', modal.user.id)}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   APP ROOT
   ══════════════════════════════════════════ */
export default function App() {
  const page = useHash()
  const [tokens, setTokens] = useState(savedTokens)
  const [profile, setProfile] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loggedIn = Boolean(tokens.access)

  function handleAuth(access, refresh) {
    setTokens({ access, refresh })
    persistTokens(access, refresh)
    go('dashboard')
  }

  async function handleLogout() {
    setBusy(true); setNotice(''); setError('')
    try {
      if (tokens.refresh) {
        await api(`${API}/users/logout/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.access}` },
          body: JSON.stringify({ refresh: tokens.refresh }),
        })
      }
    } catch {} finally {
      setTokens({ access: '', refresh: '' }); clearTokens()
      setProfile(null); setNotice('Logged out.'); setBusy(false); go('login')
    }
  }

  // Route logic
  let activePage = page || (loggedIn ? 'dashboard' : 'login')
  if (!loggedIn && (activePage === 'dashboard' || activePage === 'admin')) activePage = 'login'

  let content
  if (activePage === 'register' || activePage === 'login') {
    content = <AuthPage mode={activePage} setNotice={setNotice} setError={setError} onAuth={handleAuth} />
  } else if (activePage === 'dashboard') {
    content = <DashboardPage access={tokens.access} profile={profile} setProfile={setProfile} setNotice={setNotice} setError={setError} />
  } else if (activePage === 'marketplace') {
    content = <MarketplacePage access={tokens.access} setNotice={setNotice} setError={setError} />
  } else if (activePage === 'admin' && profile?.is_staff) {
    content = <AdminPage access={tokens.access} setNotice={setNotice} setError={setError} />
  } else {
    content = <AuthPage mode="login" setNotice={setNotice} setError={setError} onAuth={handleAuth} />
  }

  return (
    <div className="gc-app">
      <Navbar page={activePage} loggedIn={loggedIn} profile={profile} onLogout={handleLogout} busy={busy} />
      <main className="gc-main">
        <Alert type="success" message={notice} onDismiss={() => setNotice('')} />
        <Alert type="error" message={error} onDismiss={() => setError('')} />
        {content}
      </main>
    </div>
  )
}
