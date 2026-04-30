import { useCallback, useEffect, useMemo, useState } from 'react'
import './index.css'

const API = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api'
const CAMPUS_HERO_IMAGE = `${process.env.PUBLIC_URL || ''}/landing-campus.jpg`

const emptyRegister = { username: '', email: '', password: '', filiere: '', phone: '' }
const emptyLogin = { email: '', password: '' }
const emptyListing = {
  category: '',
  title: '',
  description: '',
  image: null,
  campus: '',
  condition: 'good',
  price: '',
  eco_score: 50,
  is_available: true,
}
const emptyFilters = {
  q: '',
  category: '',
  condition: '',
  available: '',
  min_price: '',
  max_price: '',
  sort: 'newest',
}
const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const previewCategories = ['Books', 'Electronics', 'Clothes', 'Supplies', 'Furniture', 'Free/donation items']
const landingFeatures = [
  ['Student-only marketplace', 'GreenCampus keeps the community focused on EMSI students and campus life.'],
  ['Eco-friendly reuse', 'Give useful items another semester instead of letting them become waste.'],
  ['Secure accounts', 'Restricted access and verified student profiles keep the garden closed and trusted.'],
  ['Buyer and seller contact', 'Send contact requests tied to real listings without exposing unnecessary private data.'],
  ['Admin moderation', 'Campus admins can review users and listings when the community needs support.'],
  ['Simple listing management', 'Create, edit, update availability, and manage your own listings from one place.'],
]
const howItWorks = [
  ['Create your account', 'Join with your EMSI email and complete your student profile.'],
  ['List your item', 'Add a photo, price, condition, category, and campus pickup details.'],
  ['Contact buyer or seller', 'Use built-in contact requests to ask questions or arrange a handoff.'],
  ['Meet safely on campus', 'Exchange, rent, sell, or donate in familiar EMSI campus spaces.'],
]
const floatingItems = [
  ['Book Bundle', 'Used textbooks', '120 MAD'],
  ['Laptop', 'Like new', 'Rent'],
  ['Reusable Bag', 'Donation', 'Free'],
  ['Plant', 'Dorm decor', 'Exchange'],
  ['Bicycle', 'Campus rides', '450 MAD'],
]

function savedTokens() {
  return {
    access: localStorage.getItem('gc_access') || '',
    refresh: localStorage.getItem('gc_refresh') || '',
  }
}

function persistTokens(access, refresh) {
  localStorage.setItem('gc_access', access)
  localStorage.setItem('gc_refresh', refresh)
}

function clearTokens() {
  localStorage.removeItem('gc_access')
  localStorage.removeItem('gc_refresh')
}

function readError(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return payload.map((item) => readError(item, fallback)).join(' ')
  if (payload.detail) return readError(payload.detail, fallback)
  const [field, value] = Object.entries(payload)[0] || []
  if (!field) return fallback
  const message = readError(value, fallback)
  return field === 'non_field_errors' ? message : `${field}: ${message}`
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options)
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await response.json() : await response.text()
  if (!response.ok) throw new Error(readError(body, `HTTP ${response.status}`))
  return body
}

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return 'Free'
  return `${Number(value).toFixed(2)} MAD`
}

function initials(profile) {
  const source = profile?.username || profile?.email || 'GC'
  return source.slice(0, 2).toUpperCase()
}

function authHeaders(access) {
  return access ? { Authorization: `Bearer ${access}` } : {}
}

function Navbar({ page, loggedIn, profile, onPage, onLogout, onLandingSection }) {
  return (
    <nav className={`gc-navbar${loggedIn ? '' : ' gc-navbar--landing'}`}>
      <div className="gc-navbar-inner">
        <button className="gc-navbar-brand" onClick={() => onPage(loggedIn ? 'dashboard' : 'home')}>
          <span className="gc-brand-mark">GC</span>
          <span>GreenCampus</span>
        </button>
        <div className="gc-navbar-nav">
          {loggedIn ? (
            <>
              <button className={`gc-nav-link${page === 'dashboard' ? ' gc-nav-link--active' : ''}`} onClick={() => onPage('dashboard')}>Home</button>
              <button className={`gc-nav-link${page === 'marketplace' ? ' gc-nav-link--active' : ''}`} onClick={() => onPage('marketplace')}>Marketplace</button>
              {profile?.is_staff && <button className={`gc-nav-link${page === 'admin' ? ' gc-nav-link--active' : ''}`} onClick={() => onPage('admin')}>Admin</button>}
              <button className="gc-nav-link gc-nav-link--logout" onClick={onLogout}>Logout</button>
            </>
          ) : (
            <>
              <button className="gc-nav-link" onClick={() => onLandingSection('home')}>Home</button>
              <button className="gc-nav-link" onClick={() => onLandingSection('how-it-works')}>How it works</button>
              <button className="gc-nav-link" onClick={() => onLandingSection('features')}>Features</button>
              <button className="gc-nav-link" onClick={() => onLandingSection('marketplace-preview')}>Marketplace preview</button>
              <button className="gc-nav-link" onClick={() => onLandingSection('sustainability')}>Sustainability</button>
              <button className={`gc-nav-link${page === 'login' ? ' gc-nav-link--active' : ''}`} onClick={() => onPage('login')}>Sign In</button>
              <button className={`gc-nav-link gc-nav-link--cta${page === 'register' ? ' gc-nav-link--active' : ''}`} onClick={() => onPage('register')}>Create Account</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

function Alert({ type, message, onDismiss }) {
  if (!message) return null
  return (
    <div className={`gc-alert gc-alert--${type}`} role="alert">
      <span>{message}</span>
      <button className="gc-alert-dismiss" onClick={onDismiss} aria-label="Dismiss">x</button>
    </div>
  )
}

function LandingPage({ onAuthPage, setError }) {
  const [categories, setCategories] = useState([])
  const [listings, setListings] = useState([])
  const [previewError, setPreviewError] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadPreview() {
      setLoadingPreview(true)
      setPreviewError('')
      try {
        const [categoryData, listingData] = await Promise.all([
          api('/market/categories/'),
          api('/market/listings/?available=true&sort=newest'),
        ])
        if (!mounted) return
        setCategories(categoryData)
        setListings(listingData.slice(0, 3))
      } catch (error) {
        if (!mounted) return
        setPreviewError('Marketplace preview is unavailable right now. Sign in to browse once the backend is running.')
        setError(error.message)
      } finally {
        if (mounted) setLoadingPreview(false)
      }
    }
    loadPreview()
    return () => {
      mounted = false
    }
  }, [setError])

  const categoryCards = categories.length
    ? categories.slice(0, 6).map((category) => ({ name: category.name, meta: 'Live category' }))
    : previewCategories.map((name) => ({ name, meta: 'Preview category' }))

  return (
    <div className="gc-landing">
      <section id="home" className="gc-hero" style={{ backgroundImage: `url(${CAMPUS_HERO_IMAGE})` }}>
        <div className="gc-hero-overlay" />
        <div className="gc-hero-inner">
          <div className="gc-hero-copy">
            <span className="gc-eyebrow">Student marketplace for EMSI campus life</span>
            <h1>GreenCampus Marketplace</h1>
            <p>Buy, sell, exchange, rent, and donate with EMSI students.</p>
            <div className="gc-hero-actions">
              <button className="gc-btn gc-btn--hero" onClick={() => onAuthPage('register')}>Get Started</button>
              <button className="gc-btn gc-btn--hero-outline" onClick={() => onAuthPage('login')}>Sign In</button>
            </div>
            <div className="gc-hero-trust">
              <span>Student-only access</span>
              <span>Campus handoffs</span>
              <span>Reuse-first culture</span>
            </div>
          </div>
          <div className="gc-hero-visual" aria-label="Floating marketplace item cards">
            <div className="gc-orbit-card gc-orbit-card--main">
              <span>Live campus exchange</span>
              <strong>Books, tech, clothes, supplies</strong>
              <small>One trusted EMSI community</small>
            </div>
            {floatingItems.map(([title, meta, price], index) => (
              <div className={`gc-floating-card gc-floating-card--${index + 1}`} key={title}>
                <span>{title}</span>
                <strong>{price}</strong>
                <small>{meta}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="gc-landing-section gc-section-light">
        <LandingSectionHeader
          eyebrow="How it works"
          title="From unused item to useful handoff in four steps."
          text="GreenCampus keeps the flow simple, practical, and built around real campus habits."
        />
        <div className="gc-step-grid">
          {howItWorks.map(([title, text], index) => (
            <article className="gc-step-card" key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="gc-landing-section">
        <LandingSectionHeader
          eyebrow="Features"
          title="A polished marketplace without losing the campus feeling."
          text="The experience is focused on trusted students, real listings, safe contact, and easy moderation."
        />
        <div className="gc-feature-grid">
          {landingFeatures.map(([title, text]) => (
            <article className="gc-feature-card" key={title}>
              <span className="gc-feature-mark" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="categories" className="gc-landing-section gc-section-light">
        <LandingSectionHeader
          eyebrow="Categories preview"
          title="Everything students pass between semesters."
          text={categories.length ? 'These categories come from your Django marketplace API.' : 'Static preview categories are shown until live categories are available.'}
        />
        <div className="gc-category-grid">
          {categoryCards.map((category) => (
            <article className="gc-category-card" key={category.name}>
              <strong>{category.name}</strong>
              <span>{category.meta}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="marketplace-preview" className="gc-landing-section">
        <LandingSectionHeader
          eyebrow="Marketplace preview"
          title="Recent listings appear here when students publish them."
          text="Preview uses real API data only. No fake marketplace listings are shown."
        />
        {loadingPreview ? (
          <div className="gc-preview-empty">Loading marketplace preview...</div>
        ) : previewError ? (
          <div className="gc-preview-empty gc-preview-empty--error">{previewError}</div>
        ) : listings.length ? (
          <div className="gc-landing-listings">
            {listings.map((listing) => (
              <article className="gc-preview-listing" key={listing.id}>
                <div className="gc-preview-listing-image">
                  {listing.image_url ? <img src={listing.image_url} alt={listing.title} /> : <span>{listing.category_name || 'Item'}</span>}
                </div>
                <div>
                  <h3>{listing.title}</h3>
                  <p>{listing.category_name || 'General'} by {listing.seller_name || 'Student seller'}</p>
                  <strong>{formatPrice(listing.price)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="gc-preview-empty">
            <h3>No public listings yet.</h3>
            <p>Sign in and create the first GreenCampus listing with a real image from your dashboard.</p>
            <button className="gc-btn gc-btn--primary" onClick={() => onAuthPage('register')}>Create Account</button>
          </div>
        )}
      </section>

      <section id="sustainability" className="gc-landing-section gc-sustainability">
        <div>
          <span className="gc-eyebrow gc-eyebrow--dark">Sustainability</span>
          <h2>Save money, reduce waste, and give campus items a second life.</h2>
        </div>
        <div className="gc-sustainability-card">
          <p>GreenCampus helps students reuse books, electronics, supplies, clothes, furniture, and donation items instead of buying everything new. Each reused object means less waste, less spending, and a stronger campus community.</p>
          <div className="gc-impact-grid">
            <span>Reduce waste</span>
            <span>Reuse items</span>
            <span>Save money</span>
            <span>Support EMSI students</span>
          </div>
        </div>
      </section>

      <section className="gc-final-cta">
        <span className="gc-eyebrow">Ready when you are</span>
        <h2>Join GreenCampus today.</h2>
        <p>Turn unused items into value for another EMSI student.</p>
        <div className="gc-hero-actions">
          <button className="gc-btn gc-btn--hero" onClick={() => onAuthPage('register')}>Create Account</button>
          <button className="gc-btn gc-btn--hero-outline" onClick={() => onAuthPage('login')}>Sign In</button>
        </div>
      </section>
    </div>
  )
}

function LandingSectionHeader({ eyebrow, title, text }) {
  return (
    <div className="gc-landing-header">
      <span className="gc-eyebrow gc-eyebrow--dark">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

function AuthPage({ mode, onPage, onAuth, setNotice, setError }) {
  const [tab, setTab] = useState(mode === 'register' ? 'register' : 'login')
  const [registerForm, setRegisterForm] = useState(emptyRegister)
  const [loginForm, setLoginForm] = useState(emptyLogin)
  const [busy, setBusy] = useState(false)

  useEffect(() => setTab(mode === 'register' ? 'register' : 'login'), [mode])

  function change(setter, field) {
    return (event) => setter((current) => ({ ...current, [field]: event.target.value }))
  }

  async function submitRegister(event) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    setError('')
    try {
      await api('/users/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      })
      setLoginForm({ email: registerForm.email, password: registerForm.password })
      setRegisterForm(emptyRegister)
      setTab('login')
      onPage('login')
      setNotice('Account created successfully. You can now sign in.')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitLogin(event) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    setError('')
    try {
      const data = await api('/users/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      })
      onAuth(data.access, data.refresh)
      setNotice('Welcome back.')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="gc-auth-page">
      <div className="gc-auth-card">
        <header className="gc-auth-header">
          <h1>GreenCampus</h1>
          <p>Peer-to-peer academic marketplace for EMSI students.</p>
        </header>
        <div className="gc-auth-toggle">
          <button className={`gc-auth-toggle-btn${tab === 'login' ? ' gc-auth-toggle-btn--active' : ''}`} onClick={() => { setTab('login'); onPage('login') }}>Sign In</button>
          <button className={`gc-auth-toggle-btn${tab === 'register' ? ' gc-auth-toggle-btn--active' : ''}`} onClick={() => { setTab('register'); onPage('register') }}>Create Account</button>
        </div>
        {tab === 'register' ? (
          <form className="gc-form" onSubmit={submitRegister}>
            <Field label="Username" value={registerForm.username} onChange={change(setRegisterForm, 'username')} required />
            <Field label="Email (@emsi.ma)" type="email" value={registerForm.email} onChange={change(setRegisterForm, 'email')} required />
            <Field label="Password" type="password" value={registerForm.password} onChange={change(setRegisterForm, 'password')} minLength={8} required />
            <Field label="Filiere" value={registerForm.filiere} onChange={change(setRegisterForm, 'filiere')} />
            <Field label="Phone" value={registerForm.phone} onChange={change(setRegisterForm, 'phone')} />
            <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy}>{busy ? 'Creating...' : 'Create Account'}</button>
          </form>
        ) : (
          <form className="gc-form" onSubmit={submitLogin}>
            <Field label="Email" type="email" value={loginForm.email} onChange={change(setLoginForm, 'email')} required />
            <Field label="Password" type="password" value={loginForm.password} onChange={change(setLoginForm, 'password')} required />
            <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy}>{busy ? 'Signing in...' : 'Sign In'}</button>
          </form>
        )}
      </div>
    </section>
  )
}

function Field({ label, className = '', ...props }) {
  return (
    <label className={`gc-field ${className}`}>
      <span className="gc-label">{label}</span>
      <input className="gc-input" {...props} />
    </label>
  )
}

function TextareaField({ label, className = '', ...props }) {
  return (
    <label className={`gc-field ${className}`}>
      <span className="gc-label">{label}</span>
      <textarea className="gc-textarea" {...props} />
    </label>
  )
}

function ProfilePanel({ profile, onSave, busy }) {
  const [form, setForm] = useState({ filiere: '', phone: '' })

  useEffect(() => {
    setForm({ filiere: profile?.filiere || '', phone: profile?.phone || '' })
  }, [profile])

  function submit(event) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <section className="gc-profile-panel">
      <div className="gc-profile-top">
        <div className="gc-profile-avatar">{initials(profile)}</div>
        <div>
          <h1>{profile?.username || 'Student'}</h1>
          <p>{profile?.email}</p>
          <div className="gc-badge-row">
            <span className={`gc-badge ${profile?.is_verified ? 'gc-badge--active' : 'gc-badge--warn'}`}>{profile?.is_verified ? 'Verified' : 'Not verified'}</span>
            <span className={`gc-badge ${profile?.is_suspended || profile?.is_blacklisted ? 'gc-badge--danger' : 'gc-badge--active'}`}>
              {profile?.is_blacklisted ? 'Blacklisted' : profile?.is_suspended ? 'Suspended' : 'Active'}
            </span>
            {profile?.is_staff && <span className="gc-badge gc-badge--admin">Admin</span>}
          </div>
        </div>
      </div>
      <dl className="gc-profile-facts">
        <div><dt>Filiere</dt><dd>{profile?.filiere || 'Not set'}</dd></div>
        <div><dt>Phone</dt><dd>{profile?.phone || 'Not set'}</dd></div>
      </dl>
      <form className="gc-inline-form" onSubmit={submit}>
        <Field label="Filiere" value={form.filiere} onChange={(e) => setForm((x) => ({ ...x, filiere: e.target.value }))} />
        <Field label="Phone" value={form.phone} onChange={(e) => setForm((x) => ({ ...x, phone: e.target.value }))} />
        <button className="gc-btn gc-btn--secondary" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
      </form>
    </section>
  )
}

function ListingFilters({ filters, categories, onChange, onSubmit, onReset }) {
  return (
    <form className="gc-filter-bar" onSubmit={onSubmit}>
      <input className="gc-input" placeholder="Search books, calculators, electronics..." value={filters.q} onChange={(e) => onChange('q', e.target.value)} />
      <select className="gc-input" value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
        <option value="">All categories</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <select className="gc-input" value={filters.condition} onChange={(e) => onChange('condition', e.target.value)}>
        <option value="">Any condition</option>
        <option value="new">New</option>
        <option value="like_new">Like new</option>
        <option value="good">Good</option>
        <option value="fair">Fair</option>
      </select>
      <select className="gc-input" value={filters.available} onChange={(e) => onChange('available', e.target.value)}>
        <option value="">Any availability</option>
        <option value="true">Available</option>
        <option value="false">Unavailable</option>
      </select>
      <input className="gc-input" type="number" min="0" placeholder="Min price" value={filters.min_price} onChange={(e) => onChange('min_price', e.target.value)} />
      <input className="gc-input" type="number" min="0" placeholder="Max price" value={filters.max_price} onChange={(e) => onChange('max_price', e.target.value)} />
      <select className="gc-input" value={filters.sort} onChange={(e) => onChange('sort', e.target.value)}>
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="price_asc">Price low to high</option>
        <option value="price_desc">Price high to low</option>
      </select>
      <button className="gc-btn gc-btn--primary">Apply</button>
      <button className="gc-btn gc-btn--outline" type="button" onClick={onReset}>Reset</button>
    </form>
  )
}

function ListingCard({ listing, profile, onView, onEdit, onDelete }) {
  const canManage = listing.is_owner || profile?.is_staff
  return (
    <article className="gc-listing-card">
      <button className="gc-listing-image" type="button" onClick={() => onView(listing)}>
        {listing.image_url ? <img src={listing.image_url} alt={listing.title} /> : <span>{listing.category_name || 'Item'}</span>}
      </button>
      <div className="gc-listing-content">
        <div className="gc-listing-card-header">
          <h3>{listing.title}</h3>
          <strong>{formatPrice(listing.price)}</strong>
        </div>
        <p className="gc-listing-seller">{listing.seller_name || 'Student seller'} {listing.campus ? `- ${listing.campus}` : ''}</p>
        <div className="gc-listing-meta">
          <span className="gc-tag">{listing.category_name || 'General'}</span>
          <span className="gc-tag">{listing.condition?.replace('_', ' ')}</span>
          <span className={`gc-tag ${listing.is_available ? 'gc-tag--ok' : 'gc-tag--muted'}`}>{listing.is_available ? 'Available' : 'Unavailable'}</span>
          <span className="gc-tag">{formatDate(listing.created_at)}</span>
        </div>
        <p className="gc-listing-description">{listing.description}</p>
        <div className="gc-card-actions">
          <button className="gc-btn gc-btn--secondary" onClick={() => onView(listing)}>View details</button>
          {canManage && <button className="gc-btn gc-btn--outline" onClick={() => onEdit(listing)}>Edit</button>}
          {canManage && <button className="gc-btn gc-btn--danger" onClick={() => onDelete(listing)}>Delete</button>}
        </div>
      </div>
    </article>
  )
}

function ListingGrid({ listings, profile, loading, error, onView, onEdit, onDelete }) {
  if (loading) return <div className="gc-empty">Loading marketplace...</div>
  if (error) return <div className="gc-empty gc-empty--error">{error}</div>
  if (!listings.length) return <div className="gc-empty">No marketplace items yet. Create the first listing.</div>
  return (
    <div className="gc-listings-grid">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} profile={profile} onView={onView} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  )
}

function ListingForm({ categories, initialListing, busy, onCancel, onSubmit }) {
  const [form, setForm] = useState(emptyListing)
  const [imagePreview, setImagePreview] = useState('')
  const [imageError, setImageError] = useState('')

  useEffect(() => {
    if (initialListing) {
      setForm({
        category: initialListing.category || '',
        title: initialListing.title || '',
        description: initialListing.description || '',
        image: null,
        campus: initialListing.campus || '',
        condition: initialListing.condition || 'good',
        price: initialListing.price || '',
        eco_score: initialListing.eco_score ?? 50,
        is_available: Boolean(initialListing.is_available),
      })
      setImagePreview(initialListing.image_url || '')
    } else {
      setForm({ ...emptyListing })
      setImagePreview('')
    }
    setImageError('')
  }, [initialListing])

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function changeImage(event) {
    const file = event.target.files?.[0] || null
    const existingPreview = initialListing?.image_url || ''

    if (!file) {
      change('image', null)
      setImagePreview(existingPreview)
      setImageError(initialListing?.image_url ? '' : 'Please choose a picture for this listing.')
      return
    }

    if (!acceptedImageTypes.includes(file.type)) {
      event.target.value = ''
      change('image', null)
      setImagePreview(existingPreview)
      setImageError('Upload a JPG, JPEG, PNG, or WEBP image.')
      return
    }

    change('image', file)
    setImagePreview(URL.createObjectURL(file))
    setImageError('')
  }

  function submit(event) {
    event.preventDefault()
    const hasExistingImage = Boolean(initialListing?.image_url)
    if (!form.image && !hasExistingImage) {
      setImageError('Please choose a picture for this listing.')
      return
    }

    onSubmit({
      ...form,
      category: form.category || null,
      price: String(form.price || '0'),
      eco_score: Number(form.eco_score || 0),
    })
  }

  return (
    <form className="gc-listing-form" onSubmit={submit}>
      <div className="gc-form-grid">
        <Field label="Title" value={form.title} onChange={(e) => change('title', e.target.value)} required />
        <label className="gc-field">
          <span className="gc-label">Category</span>
          <select className="gc-input" value={form.category} onChange={(e) => change('category', e.target.value)}>
            <option value="">General</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <Field label="Price (MAD)" type="number" min="0" step="0.01" value={form.price} onChange={(e) => change('price', e.target.value)} required />
        <label className="gc-field">
          <span className="gc-label">Condition</span>
          <select className="gc-input" value={form.condition} onChange={(e) => change('condition', e.target.value)}>
            <option value="new">New</option>
            <option value="like_new">Like new</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
          </select>
        </label>
        <Field label="Campus / location" value={form.campus} onChange={(e) => change('campus', e.target.value)} />
        <label className="gc-field gc-image-upload">
          <span className="gc-label">Listing photo</span>
          <input
            className="gc-input gc-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={changeImage}
            required={!initialListing?.image_url}
          />
          <small>Required. Use JPG, JPEG, PNG, or WEBP.</small>
          {imageError && <span className="gc-field-error">{imageError}</span>}
        </label>
        <div className={`gc-image-preview${imagePreview ? '' : ' gc-image-preview--empty'}`}>
          {imagePreview ? <img src={imagePreview} alt="Selected listing preview" /> : <span>No image selected</span>}
        </div>
        <Field label="Eco score" type="number" min="0" max="100" value={form.eco_score} onChange={(e) => change('eco_score', e.target.value)} />
        <label className="gc-check-field">
          <input type="checkbox" checked={form.is_available} onChange={(e) => change('is_available', e.target.checked)} />
          Available
        </label>
        <TextareaField className="gc-form-wide" label="Description" rows={4} value={form.description} onChange={(e) => change('description', e.target.value)} required />
      </div>
      <div className="gc-card-actions">
        <button className="gc-btn gc-btn--primary" disabled={busy}>{busy ? 'Saving...' : initialListing ? 'Save changes' : 'Create listing'}</button>
        <button className="gc-btn gc-btn--outline" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ListingDetails({ listing, profile, contactMessage, setContactMessage, contactBusy, onClose, onContact, onEdit, onDelete }) {
  if (!listing) return null
  const canManage = listing.is_owner || profile?.is_staff
  const canContact = !canManage && listing.is_available
  return (
    <div className="gc-modal-backdrop" onClick={onClose}>
      <article className="gc-detail-modal" onClick={(event) => event.stopPropagation()}>
        <button className="gc-modal-close" onClick={onClose} aria-label="Close">x</button>
        <div className="gc-detail-image">
          {listing.image_url ? <img src={listing.image_url} alt={listing.title} /> : <span>{listing.category_name || 'Marketplace item'}</span>}
        </div>
        <div className="gc-detail-body">
          <div className="gc-detail-title-row">
            <div>
              <h2>{listing.title}</h2>
              <p>{listing.seller_name} {listing.campus ? `- ${listing.campus}` : ''}</p>
            </div>
            <strong>{formatPrice(listing.price)}</strong>
          </div>
          <div className="gc-listing-meta">
            <span className="gc-tag">{listing.category_name || 'General'}</span>
            <span className="gc-tag">{listing.condition?.replace('_', ' ')}</span>
            <span className={`gc-tag ${listing.is_available ? 'gc-tag--ok' : 'gc-tag--muted'}`}>{listing.is_available ? 'Available' : 'Unavailable'}</span>
            <span className="gc-tag">Created {formatDate(listing.created_at)}</span>
          </div>
          <p className="gc-detail-description">{listing.description}</p>
          {canContact && (
            <form className="gc-contact-form" onSubmit={(event) => { event.preventDefault(); onContact(listing) }}>
              <TextareaField label="Message seller" rows={3} value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} placeholder="Hi, is this still available?" required />
              <button className="gc-btn gc-btn--primary" disabled={contactBusy}>{contactBusy ? 'Sending...' : 'Contact seller'}</button>
            </form>
          )}
          {canManage && (
            <div className="gc-card-actions">
              <button className="gc-btn gc-btn--secondary" onClick={() => onEdit(listing)}>Edit listing</button>
              <button className="gc-btn gc-btn--danger" onClick={() => onDelete(listing)}>Delete listing</button>
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

function MyListings({ listings, onEdit, onDelete, onView }) {
  return (
    <section className="gc-panel">
      <div className="gc-section-header">
        <h2>My listings</h2>
      </div>
      {!listings.length ? (
        <div className="gc-empty gc-empty--compact">You have not created a listing yet.</div>
      ) : (
        <div className="gc-my-list">
          {listings.map((listing) => (
            <div className="gc-my-listing" key={listing.id}>
              <button onClick={() => onView(listing)}>{listing.title}</button>
              <span>{formatPrice(listing.price)}</span>
              <span>{listing.is_available ? 'Available' : 'Unavailable'}</span>
              <button className="gc-link-btn" onClick={() => onEdit(listing)}>Edit</button>
              <button className="gc-link-btn gc-link-btn--danger" onClick={() => onDelete(listing)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MessagesPanel({ received, sent, onReply, replyBusy }) {
  const [replyById, setReplyById] = useState({})
  return (
    <section className="gc-panel">
      <div className="gc-section-header">
        <h2>Contact requests</h2>
      </div>
      <div className="gc-message-columns">
        <MessageList title="Received" messages={received} replyById={replyById} setReplyById={setReplyById} onReply={onReply} replyBusy={replyBusy} allowReply />
        <MessageList title="Sent" messages={sent} />
      </div>
    </section>
  )
}

function MessageList({ title, messages, allowReply, replyById, setReplyById, onReply, replyBusy }) {
  return (
    <div>
      <h3 className="gc-message-title">{title}</h3>
      {!messages.length ? (
        <div className="gc-empty gc-empty--compact">No messages.</div>
      ) : messages.map((message) => (
        <article className="gc-message-card" key={message.id}>
          <div className="gc-message-head">
            <strong>{message.listing_title}</strong>
            <span className="gc-tag">{message.status}</span>
          </div>
          <p>{message.message}</p>
          <small>{title === 'Received' ? `From ${message.sender_name}` : `To ${message.recipient_name}`} - {formatDate(message.created_at)}</small>
          {message.reply && <p className="gc-message-reply">Reply: {message.reply}</p>}
          {allowReply && (
            <form className="gc-reply-form" onSubmit={(event) => { event.preventDefault(); onReply(message, replyById[message.id] || '') }}>
              <input className="gc-input" value={replyById[message.id] || ''} onChange={(event) => setReplyById((x) => ({ ...x, [message.id]: event.target.value }))} placeholder="Reply to buyer" />
              <button className="gc-btn gc-btn--secondary" disabled={replyBusy || !(replyById[message.id] || '').trim()}>Reply</button>
            </form>
          )}
        </article>
      ))}
    </div>
  )
}

function MarketplaceSection({ access, profile, mode, setNotice, setError }) {
  const [categories, setCategories] = useState([])
  const [listings, setListings] = useState([])
  const [myListings, setMyListings] = useState([])
  const [receivedMessages, setReceivedMessages] = useState([])
  const [sentMessages, setSentMessages] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const [loading, setLoading] = useState(true)
  const [marketError, setMarketError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingListing, setEditingListing] = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [contactMessage, setContactMessage] = useState('')
  const [contactBusy, setContactBusy] = useState(false)
  const [replyBusy, setReplyBusy] = useState(false)

  const headers = useMemo(() => authHeaders(access), [access])

  const loadMarketplace = useCallback(async (nextFilters = filters) => {
    setLoading(true)
    setMarketError('')
    try {
      const query = new URLSearchParams()
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value) query.set(key, value)
      })
      const suffix = query.toString() ? `?${query}` : ''
      const [categoryData, listingData, mineData, receivedData, sentData] = await Promise.all([
        api('/market/categories/'),
        api(`/market/listings/${suffix}`, { headers }),
        api('/market/listings/mine/', { headers }),
        api('/market/messages/?box=received', { headers }),
        api('/market/messages/?box=sent', { headers }),
      ])
      setCategories(categoryData)
      setListings(listingData)
      setMyListings(mineData)
      setReceivedMessages(receivedData)
      setSentMessages(sentData)
    } catch (error) {
      setMarketError(error.message)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [filters, headers, setError])

  useEffect(() => {
    if (access) loadMarketplace()
  }, [access, loadMarketplace])

  function changeFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  async function saveListing(payload) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const path = editingListing ? `/market/listings/${editingListing.id}/` : '/market/listings/'
      const method = editingListing ? 'PATCH' : 'POST'
      const body = new FormData()
      Object.entries(payload).forEach(([key, value]) => {
        if (key === 'image') {
          if (value) body.append(key, value)
          return
        }
        if (value !== null && value !== undefined) body.append(key, value)
      })
      await api(path, {
        method,
        headers,
        body,
      })
      setNotice(editingListing ? 'Listing updated.' : 'Listing created.')
      setShowForm(false)
      setEditingListing(null)
      await loadMarketplace()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteListing(listing) {
    const confirmed = window.confirm(`Delete "${listing.title}"?`)
    if (!confirmed) return
    setBusy(true)
    try {
      await api(`/market/listings/${listing.id}/`, { method: 'DELETE', headers })
      setNotice('Listing deleted.')
      if (selectedListing?.id === listing.id) setSelectedListing(null)
      await loadMarketplace()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function contactSeller(listing) {
    setContactBusy(true)
    setError('')
    try {
      await api('/market/messages/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ listing_id: listing.id, message: contactMessage }),
      })
      setContactMessage('')
      setNotice('Message sent to seller.')
      await loadMarketplace()
    } catch (error) {
      setError(error.message)
    } finally {
      setContactBusy(false)
    }
  }

  async function replyToMessage(message, reply) {
    setReplyBusy(true)
    try {
      await api(`/market/messages/${message.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ status: 'replied', reply }),
      })
      setNotice('Reply sent.')
      await loadMarketplace()
    } catch (error) {
      setError(error.message)
    } finally {
      setReplyBusy(false)
    }
  }

  const shownListings = mode === 'dashboard' ? listings.slice(0, 6) : listings

  return (
    <section className="gc-marketplace-shell">
      <div className="gc-section-header">
        <div>
          <h2>{mode === 'dashboard' ? 'Marketplace highlights' : 'Marketplace'}</h2>
          <p>Browse real listings from GreenCampus students.</p>
        </div>
        <button className="gc-btn gc-btn--primary" onClick={() => { setEditingListing(null); setShowForm(true) }}>Create listing</button>
      </div>

      <ListingFilters
        filters={filters}
        categories={categories}
        onChange={changeFilter}
        onSubmit={(event) => { event.preventDefault(); loadMarketplace(filters) }}
        onReset={() => { setFilters(emptyFilters); loadMarketplace(emptyFilters) }}
      />

      {showForm && (
        <section className="gc-panel">
          <div className="gc-section-header">
            <h2>{editingListing ? 'Edit listing' : 'New listing'}</h2>
          </div>
          <ListingForm key={editingListing?.id || 'new-listing'} categories={categories} initialListing={editingListing} busy={busy} onCancel={() => { setShowForm(false); setEditingListing(null) }} onSubmit={saveListing} />
        </section>
      )}

      <ListingGrid
        listings={shownListings}
        profile={profile}
        loading={loading}
        error={marketError}
        onView={setSelectedListing}
        onEdit={(listing) => { setEditingListing(listing); setShowForm(true); setSelectedListing(null) }}
        onDelete={deleteListing}
      />

      <MyListings listings={myListings} onView={setSelectedListing} onEdit={(listing) => { setEditingListing(listing); setShowForm(true) }} onDelete={deleteListing} />
      <MessagesPanel received={receivedMessages} sent={sentMessages} onReply={replyToMessage} replyBusy={replyBusy} />

      <ListingDetails
        listing={selectedListing}
        profile={profile}
        contactMessage={contactMessage}
        setContactMessage={setContactMessage}
        contactBusy={contactBusy}
        onClose={() => setSelectedListing(null)}
        onContact={contactSeller}
        onEdit={(listing) => { setEditingListing(listing); setShowForm(true); setSelectedListing(null) }}
        onDelete={deleteListing}
      />
    </section>
  )
}

function DashboardPage({ access, profile, setProfile, setNotice, setError }) {
  const [profileBusy, setProfileBusy] = useState(false)

  async function saveProfile(form) {
    setProfileBusy(true)
    setError('')
    try {
      const data = await api('/users/profile/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(access) },
        body: JSON.stringify(form),
      })
      setProfile(data)
      setNotice('Profile saved.')
    } catch (error) {
      setError(error.message)
    } finally {
      setProfileBusy(false)
    }
  }

  return (
    <div className="gc-dashboard-page">
      <ProfilePanel profile={profile} onSave={saveProfile} busy={profileBusy} />
      <MarketplaceSection access={access} profile={profile} mode="dashboard" setNotice={setNotice} setError={setError} />
    </div>
  )
}

function AdminPage({ access, setError }) {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])

  useEffect(() => {
    Promise.all([
      api('/users/admin/stats/', { headers: authHeaders(access) }),
      api('/users/admin/users/', { headers: authHeaders(access) }),
    ])
      .then(([nextStats, nextUsers]) => {
        setStats(nextStats)
        setUsers(nextUsers)
      })
      .catch((error) => setError(error.message))
  }, [access, setError])

  return (
    <section className="gc-panel">
      <div className="gc-section-header">
        <h2>Admin overview</h2>
      </div>
      <div className="gc-admin-summary">
        <span>Total users: {stats?.total_users ?? '-'}</span>
        <span>Active: {stats?.active_users ?? '-'}</span>
        <span>Suspended: {stats?.suspended_users ?? '-'}</span>
        <span>Blacklisted: {stats?.blacklisted_users ?? '-'}</span>
      </div>
      <div className="gc-my-list">
        {users.map((user) => (
          <div className="gc-my-listing" key={user.id}>
            <strong>{user.username}</strong>
            <span>{user.email}</span>
            <span>{user.is_staff ? 'Admin' : user.is_blacklisted ? 'Blacklisted' : user.is_suspended ? 'Suspended' : 'Active'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const [page, setPage] = useState(window.location.hash.slice(1) || 'home')
  const [tokens, setTokens] = useState(savedTokens)
  const [profile, setProfile] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const loggedIn = Boolean(tokens.access)

  useEffect(() => {
    const onHash = () => setPage(window.location.hash.slice(1) || (loggedIn ? 'dashboard' : 'home'))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [loggedIn])

  const loadProfile = useCallback(async () => {
    if (!tokens.access) return
    try {
      const data = await api('/users/profile/', { headers: authHeaders(tokens.access) })
      setProfile(data)
    } catch {
      setTokens({ access: '', refresh: '' })
      clearTokens()
      setProfile(null)
      setPage('home')
    }
  }, [tokens.access])

  useEffect(() => { loadProfile() }, [loadProfile])

  function go(nextPage) {
    window.location.hash = nextPage
    setPage(nextPage)
    if (nextPage !== 'home') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function scrollLandingSection(sectionId) {
    const scrollToSection = () => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    if ((page || 'home') !== 'home') {
      go('home')
      window.setTimeout(scrollToSection, 80)
      return
    }

    scrollToSection()
  }

  function handleAuth(access, refresh) {
    setTokens({ access, refresh })
    persistTokens(access, refresh)
    go('dashboard')
  }

  async function logout() {
    try {
      if (tokens.refresh) {
        await api('/users/logout/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(tokens.access) },
          body: JSON.stringify({ refresh: tokens.refresh }),
        })
      }
    } catch {
      // Local logout should still clear the browser session if the refresh token expired.
    }
    setTokens({ access: '', refresh: '' })
    clearTokens()
    setProfile(null)
    setNotice('Logged out.')
    go('home')
  }

  let activePage = page || (loggedIn ? 'dashboard' : 'home')
  if (!loggedIn && !['home', 'login', 'register'].includes(activePage)) activePage = 'home'
  if (loggedIn && !['dashboard', 'marketplace', 'admin'].includes(activePage)) activePage = 'dashboard'
  if (activePage === 'admin' && !profile?.is_staff) activePage = loggedIn ? 'dashboard' : 'login'

  return (
    <div className="gc-app">
      <Navbar page={activePage} loggedIn={loggedIn} profile={profile} onPage={go} onLogout={logout} onLandingSection={scrollLandingSection} />
      <main className={`gc-main${!loggedIn && activePage === 'home' ? ' gc-main--landing' : ''}`}>
        <Alert type="success" message={notice} onDismiss={() => setNotice('')} />
        <Alert type="error" message={error} onDismiss={() => setError('')} />
        {!loggedIn && activePage === 'home' ? (
          <LandingPage onAuthPage={go} setError={setError} />
        ) : !loggedIn ? (
          <AuthPage mode={activePage} onPage={go} onAuth={handleAuth} setNotice={setNotice} setError={setError} />
        ) : activePage === 'marketplace' ? (
          <MarketplaceSection access={tokens.access} profile={profile} mode="marketplace" setNotice={setNotice} setError={setError} />
        ) : activePage === 'admin' ? (
          <AdminPage access={tokens.access} setError={setError} />
        ) : (
          <DashboardPage access={tokens.access} profile={profile} setProfile={setProfile} setNotice={setNotice} setError={setError} />
        )}
      </main>
    </div>
  )
}
