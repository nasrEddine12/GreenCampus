import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Lenis from 'lenis'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './index.css'

const API = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api'
const CAMPUS_HERO_IMAGE = `${process.env.PUBLIC_URL || ''}/landing-campus.jpg`
const LazyReactECharts = lazy(() => import('echarts-for-react'))

const emptyRegister = { username: '', email: '', password: '', filiere: '', phone: '' }
const emptyLogin = { email: '', password: '' }
const emptyListing = {
  category: '',
  title: '',
  description: '',
  image: null,
  listing_type: 'sale',
  campus: '',
  condition: 'good',
  price: '',
  eco_score: 50,
  is_available: true,
}
const adminTransactionFilterDefaults = {
  search: '',
  status: '',
  transaction_type: '',
  meeting_status: '',
  date_from: '',
  date_to: '',
  overdueOnly: false,
}
const emptyFilters = {
  q: '',
  category: '',
  listing_type: '',
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
const adminActionLabels = {
  suspend: 'Suspend',
  unsuspend: 'Unsuspend',
  blacklist: 'Blacklist',
  unblacklist: 'Unblacklist',
  enable_contact: 'Enable contact',
  disable_contact: 'Disable contact',
  deactivate: 'Deactivate',
  delete: 'Delete user',
}
const adminActionDetails = {
  suspend: {
    title: 'Suspend user',
    badge: 'Temporary restriction',
    tone: 'warning',
    icon: '!',
    confirmLabel: 'Suspend account',
    defaultReason: 'Temporarily suspended by admin.',
    reasonLabel: 'Suspension reason',
    reasonPlaceholder: 'Explain why this account is being suspended.',
    requiresReason: true,
    allowsDuration: true,
    impact: [
      'User login remains possible, but account is marked suspended.',
      'Contact and marketplace requests are paused.',
      'Reason is saved on the user record.',
    ],
  },
  unsuspend: {
    title: 'Unsuspend user',
    badge: 'Restore access',
    tone: 'safe',
    icon: 'OK',
    confirmLabel: 'Unsuspend account',
    defaultReason: 'Suspension cleared by admin.',
    impact: [
      'Suspension flags and reason are cleared.',
      'Contact permission is restored.',
      'The user can continue normal marketplace activity.',
    ],
  },
  blacklist: {
    title: 'Blacklist user',
    badge: 'Severe moderation',
    tone: 'danger',
    icon: '!',
    confirmLabel: 'Blacklist account',
    defaultReason: 'Blacklisted by admin.',
    reasonLabel: 'Blacklist reason',
    reasonPlaceholder: 'Explain why this account is being blacklisted.',
    requiresReason: true,
    impact: [
      'User is marked blacklisted in SQL Server.',
      'Any active suspension is cleared to avoid mixed states.',
      'Admin review is required before restoring trust.',
    ],
  },
  unblacklist: {
    title: 'Remove blacklist',
    badge: 'Restore trust',
    tone: 'safe',
    icon: 'OK',
    confirmLabel: 'Remove blacklist',
    defaultReason: 'Blacklist cleared by admin.',
    impact: [
      'Blacklist flags and reason are cleared.',
      'The user can be managed normally again.',
      'This does not automatically verify or promote the account.',
    ],
  },
  disable_contact: {
    title: 'Disable contact',
    badge: 'Communication limit',
    tone: 'warning',
    icon: '!',
    confirmLabel: 'Disable contact',
    defaultReason: 'Contact disabled by admin.',
    impact: [
      'User cannot initiate contact requests or direct messages.',
      'Existing marketplace data remains unchanged.',
      'This can be restored later from the same menu.',
    ],
  },
  enable_contact: {
    title: 'Enable contact',
    badge: 'Communication restored',
    tone: 'safe',
    icon: 'OK',
    confirmLabel: 'Enable contact',
    defaultReason: 'Contact enabled by admin.',
    impact: [
      'User can contact buyers and sellers again.',
      'Listings and transaction history remain unchanged.',
      'This only updates contact permission.',
    ],
  },
  deactivate: {
    title: 'Deactivate user',
    badge: 'Account access',
    tone: 'danger',
    icon: '!',
    confirmLabel: 'Deactivate account',
    defaultReason: 'Deactivated by admin.',
    impact: [
      'User account is marked inactive.',
      'Inactive users cannot log in normally.',
      'This is safer than deleting records with marketplace history.',
    ],
  },
  delete: {
    title: 'Delete user permanently',
    badge: 'Permanent deletion',
    tone: 'danger',
    icon: 'X',
    confirmLabel: 'Delete permanently',
    impact: [
      'This will permanently delete the user from the database.',
      'This action cannot be undone.',
      'Backend safety rules block self-delete and last-admin deletion.',
    ],
  },
}

const pageTransition = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
}

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0 },
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
}

function motionProps(reducedMotion, delay = 0) {
  if (reducedMotion) {
    return {
      initial: false,
      animate: { opacity: 1 },
      transition: { duration: 0 },
    }
  }

  return {
    initial: 'hidden',
    whileInView: 'visible',
    viewport: { once: true, amount: 0.18 },
    variants: fadeUp,
    transition: { duration: 0.56, delay, ease: [0.22, 1, 0.36, 1] },
  }
}

function cardMotionProps(reducedMotion, index = 0) {
  if (reducedMotion) {
    return {
      initial: false,
      animate: { opacity: 1 },
      transition: { duration: 0 },
    }
  }

  return {
    initial: 'hidden',
    whileInView: 'visible',
    viewport: { once: true, amount: 0.16 },
    variants: scaleIn,
    transition: { duration: 0.46, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] },
  }
}

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

function formatDateTime(value) {
  if (!value) return 'Not scheduled'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return 'Free'
  return `${Number(value).toFixed(2)} MAD`
}

function formatCondition(value) {
  if (!value) return 'Not specified'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTokenLabel(value) {
  if (!value) return 'Unknown'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function listingTypeLabel(value) {
  return formatTokenLabel(value)
}

function listingActionLabel(listing) {
  switch (listing?.listing_type) {
    case 'loan':
      return 'Request to borrow'
    case 'exchange':
      return 'Request exchange'
    case 'donate':
      return 'Request donation'
    case 'sale':
    default:
      return 'Request to buy'
  }
}

function listingPriceLabel(listingType) {
  if (listingType === 'loan') return 'Loan / rent fee'
  if (listingType === 'donate') return 'Free'
  if (listingType === 'exchange') return 'Exchange'
  return 'Sale price'
}

function badgeToneForListingStatus(status) {
  if (['sold', 'donated', 'exchanged'].includes(status)) return 'gc-badge--admin'
  if (['loaned', 'reserved'].includes(status)) return 'gc-badge--warn'
  if (status === 'hidden') return 'gc-badge--danger'
  return 'gc-badge--active'
}

function badgeToneForTransactionStatus(status) {
  if (['rejected', 'cancelled'].includes(status)) return 'gc-badge--danger'
  if (['overdue'].includes(status)) return 'gc-badge--danger'
  if (['pending', 'meeting_scheduled', 'accepted', 'handed_over'].includes(status)) return 'gc-badge--warn'
  return 'gc-badge--active'
}

function badgeToneForMeetingStatus(status) {
  if (['rejected', 'cancelled'].includes(status)) return 'gc-badge--danger'
  if (['proposed', 'rescheduled'].includes(status)) return 'gc-badge--warn'
  return 'gc-badge--active'
}

function buildRequestForm(listing) {
  const today = new Date()
  const start = today.toISOString().slice(0, 10)
  const returnDate = new Date(today)
  returnDate.setDate(returnDate.getDate() + 3)
  return {
    message: '',
    meeting_location: listing?.campus || '',
    meeting_datetime: '',
    requested_start_date: start,
    expected_return_date: returnDate.toISOString().slice(0, 10),
  }
}

function buildMeetingForm(transaction) {
  const meetingValue = transaction?.meeting_datetime
    ? new Date(new Date(transaction.meeting_datetime).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : ''
  return {
    meeting_location: transaction?.meeting_location || '',
    meeting_datetime: meetingValue,
    meeting_status: transaction?.meeting_status || '',
    seller_note: transaction?.seller_note || '',
    buyer_note: transaction?.buyer_note || '',
    actual_return_date: '',
  }
}

function buildTransactionSummary(sentTransactions, receivedTransactions) {
  const openStatuses = ['pending', 'accepted', 'meeting_scheduled', 'handed_over', 'active_loan', 'overdue']
  const finalStatuses = ['completed', 'sold', 'returned']
  const meetings = uniqueTransactions([...sentTransactions, ...receivedTransactions])

  return {
    buyer: {
      requests: sentTransactions,
      activeLoans: sentTransactions.filter((transaction) => transaction.status === 'active_loan'),
      meetings: meetings.filter((transaction) => transaction.meeting_datetime && openStatuses.includes(transaction.status)),
      completed: sentTransactions.filter((transaction) => finalStatuses.includes(transaction.status)),
      overdue: sentTransactions.filter((transaction) => transaction.status === 'overdue'),
    },
    seller: {
      incoming: receivedTransactions,
      pending: receivedTransactions.filter((transaction) => transaction.status === 'pending'),
      accepted: receivedTransactions.filter((transaction) => ['accepted', 'meeting_scheduled', 'handed_over'].includes(transaction.status)),
      activeLoans: receivedTransactions.filter((transaction) => transaction.status === 'active_loan'),
      overdue: receivedTransactions.filter((transaction) => transaction.status === 'overdue'),
      completed: receivedTransactions.filter((transaction) => finalStatuses.includes(transaction.status)),
    },
  }
}

function uniqueTransactions(transactions) {
  return transactions.filter((transaction, index, items) => (
    items.findIndex((candidate) => candidate.id === transaction.id) === index
  ))
}

function formatDeadline(value) {
  if (!value) return ''
  const deadline = new Date(value)
  const diff = deadline.getTime() - Date.now()
  if (diff <= 0) return 'Warning period ended'
  const hours = Math.ceil(diff / (60 * 60 * 1000))
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} remaining`
  const days = Math.ceil(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} remaining`
}

function initials(profile) {
  const source = profile?.username || profile?.email || 'GC'
  return source.slice(0, 2).toUpperCase()
}

function accountStatus(profile) {
  if (profile?.is_blacklisted) return 'Blacklisted'
  if (profile?.is_suspended) return 'Suspended'
  return 'Active'
}

function isAdminAccount(user) {
  return Boolean(user?.is_staff || user?.is_superuser)
}

function adminActionTone(action) {
  return adminActionDetails[action]?.tone || 'neutral'
}

function adminActionButtonClass(action) {
  const tone = adminActionTone(action)
  if (tone === 'danger') return 'gc-btn--danger'
  if (tone === 'safe') return 'gc-btn--secondary'
  return 'gc-btn--outline'
}

function buildSuspensionUntil(value) {
  if (!value) return null
  return new Date(value).toISOString()
}

function authHeaders(access) {
  return access ? { Authorization: `Bearer ${access}` } : {}
}

function Navbar({
  page,
  loggedIn,
  profile,
  onPage,
  onLogout,
  onLandingSection,
  onProfileSave,
  profileBusy,
}) {
  const [scrolled, setScrolled] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navItems = [
    ['dashboard', 'Home'],
    ['marketplace', 'Marketplace'],
    ['my-listings', 'My Listings'],
    ['transactions', 'Transactions'],
  ]

  return (
    <motion.nav
      className={`gc-navbar${loggedIn ? '' : ' gc-navbar--landing'}${scrolled ? ' gc-navbar--scrolled' : ''}`}
      initial={reducedMotion ? false : { y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="gc-navbar-inner">
        <button className="gc-navbar-brand" onClick={() => onPage(loggedIn ? 'dashboard' : 'home')}>
          <span className="gc-brand-mark">GC</span>
          <span>GreenCampus</span>
        </button>
        <div className="gc-navbar-nav">
          {loggedIn ? (
            <>
              {navItems.map(([key, label]) => (
                <button key={key} className={`gc-nav-link${page === key ? ' gc-nav-link--active' : ''}`} onClick={() => onPage(key)}>{label}</button>
              ))}
              {profile?.is_staff && <button className={`gc-nav-link${page === 'admin' ? ' gc-nav-link--active' : ''}`} onClick={() => onPage('admin')}>Admin</button>}
              <div className="gc-navbar-actions">
                <ProfileMenu profile={profile} onSave={onProfileSave} busy={profileBusy} onLogout={onLogout} />
              </div>
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
    </motion.nav>
  )
}

function ProfileMenu({ profile, onSave, busy, onLogout }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ filiere: '', phone: '' })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    setForm({ filiere: profile?.filiere || '', phone: profile?.phone || '' })
  }, [profile])

  function submit(event) {
    event.preventDefault()
    onSave(form).then(() => setEditing(false)).catch(() => {})
  }

  return (
    <div className="gc-nav-menu">
      <button className="gc-avatar-button" type="button" onClick={() => setOpen((current) => !current)} aria-label="Open profile menu">
        {initials(profile)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="gc-popover gc-profile-popover"
            initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          >
            <div className="gc-popover-user">
              <span className="gc-profile-avatar gc-profile-avatar--small">{initials(profile)}</span>
              <div>
                <strong>{profile?.username || 'Student'}</strong>
                <small>{profile?.email || 'No email loaded'}</small>
              </div>
            </div>
            <div className="gc-badge-row">
              <span className={`gc-badge ${profile?.is_verified ? 'gc-badge--active' : 'gc-badge--warn'}`}>{profile?.is_verified ? 'Verified' : 'Not verified'}</span>
              <span className={`gc-badge ${profile?.is_suspended || profile?.is_blacklisted ? 'gc-badge--danger' : 'gc-badge--active'}`}>{accountStatus(profile)}</span>
              {profile?.is_staff && <span className="gc-badge gc-badge--admin">Admin</span>}
            </div>
            <dl className="gc-profile-mini">
              <div>
                <dt>Filiere</dt>
                <dd>{profile?.filiere || 'Not set'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{profile?.phone || 'Not set'}</dd>
              </div>
            </dl>
            {editing ? (
              <form className="gc-profile-edit-form" onSubmit={submit}>
                <Field label="Filiere" value={form.filiere} onChange={(event) => setForm((current) => ({ ...current, filiere: event.target.value }))} />
                <Field label="Phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                <div className="gc-card-actions">
                  <button className="gc-btn gc-btn--primary gc-btn--compact" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
                  <button className="gc-btn gc-btn--outline gc-btn--compact" type="button" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="gc-popover-actions">
                <button className="gc-btn gc-btn--secondary" type="button" onClick={() => setEditing(true)}>Edit profile</button>
                <button className="gc-btn gc-btn--outline" type="button" onClick={onLogout}>Logout</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Alert({ type, message, onDismiss }) {
  const reducedMotion = useReducedMotion()
  if (!message) return null
  return (
    <motion.div
      className={`gc-alert gc-alert--${type}`}
      role="alert"
      initial={reducedMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: reducedMotion ? 0 : 0.24 }}
    >
      <span>{message}</span>
      <button className="gc-alert-dismiss" onClick={onDismiss} aria-label="Dismiss">x</button>
    </motion.div>
  )
}

function LandingPage({ onAuthPage, setError }) {
  const [categories, setCategories] = useState([])
  const [listings, setListings] = useState([])
  const [previewError, setPreviewError] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(true)
  const reducedMotion = useReducedMotion()

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
      <section
        id="home"
        className="gc-hero"
        style={{ backgroundImage: `url(${CAMPUS_HERO_IMAGE})` }}
      >
        <div className="gc-hero-overlay" />
        <div className="gc-hero-inner">
          <motion.div
            className="gc-hero-copy"
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            variants={staggerContainer}
          >
            <motion.span className="gc-eyebrow" variants={fadeUp}>Student marketplace for EMSI campus life</motion.span>
            <motion.h1 variants={fadeUp}>GreenCampus Marketplace</motion.h1>
            <motion.p variants={fadeUp}>Buy, sell, exchange, rent, and donate with EMSI students.</motion.p>
            <motion.div className="gc-hero-actions" variants={fadeUp}>
              <motion.button className="gc-btn gc-btn--hero" onClick={() => onAuthPage('register')} whileHover={reducedMotion ? {} : { y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}>Get Started</motion.button>
              <motion.button className="gc-btn gc-btn--hero-outline" onClick={() => onAuthPage('login')} whileHover={reducedMotion ? {} : { y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}>Sign In</motion.button>
            </motion.div>
            <motion.div className="gc-hero-trust" variants={fadeUp}>
              {['Student-only access', 'Campus handoffs', 'Reuse-first culture'].map((label) => (
                <motion.span key={label} whileHover={reducedMotion ? {} : { y: -2 }}>{label}</motion.span>
              ))}
            </motion.div>
          </motion.div>
          <motion.div
            className="gc-hero-visual"
            aria-label="Floating marketplace item cards"
            initial={reducedMotion ? false : { opacity: 0, x: 32, rotateY: -8 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div className="gc-orbit-card gc-orbit-card--main">
              <span>Live campus exchange</span>
              <strong>Books, tech, clothes, supplies</strong>
              <small>One trusted EMSI community</small>
            </motion.div>
            {floatingItems.map(([title, meta, price], index) => (
              <motion.div
                className={`gc-floating-card gc-floating-card--${index + 1}`}
                key={title}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.5, delay: 0.18 + index * 0.08 }}
              >
                <span>{title}</span>
                <strong>{price}</strong>
                <small>{meta}</small>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <motion.section id="how-it-works" className="gc-landing-section gc-section-light" {...motionProps(reducedMotion)}>
        <LandingSectionHeader
          eyebrow="How it works"
          title="From unused item to useful handoff in four steps."
          text="GreenCampus keeps the flow simple, practical, and built around real campus habits."
        />
        <motion.div className="gc-step-grid" initial={reducedMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.16 }} variants={staggerContainer}>
          {howItWorks.map(([title, text], index) => (
            <motion.article className="gc-step-card" key={title} {...cardMotionProps(reducedMotion, index)} whileHover={reducedMotion ? {} : { y: -6 }}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.article>
          ))}
        </motion.div>
      </motion.section>

      <motion.section id="features" className="gc-landing-section" {...motionProps(reducedMotion)}>
        <LandingSectionHeader
          eyebrow="Features"
          title="A polished marketplace without losing the campus feeling."
          text="The experience is focused on trusted students, real listings, safe contact, and easy moderation."
        />
        <motion.div className="gc-feature-grid" initial={reducedMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.16 }} variants={staggerContainer}>
          {landingFeatures.map(([title, text], index) => (
            <motion.article className="gc-feature-card" key={title} {...cardMotionProps(reducedMotion, index)} whileHover={reducedMotion ? {} : { y: -6 }}>
              <span className="gc-feature-mark" />
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.article>
          ))}
        </motion.div>
      </motion.section>

      <motion.section id="categories" className="gc-landing-section gc-section-light" {...motionProps(reducedMotion)}>
        <LandingSectionHeader
          eyebrow="Categories preview"
          title="Everything students pass between semesters."
          text={categories.length ? 'These categories come from your Django marketplace API.' : 'Static preview categories are shown until live categories are available.'}
        />
        <motion.div className="gc-category-grid" initial={reducedMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.16 }} variants={staggerContainer}>
          {categoryCards.map((category, index) => (
            <motion.article className="gc-category-card" key={category.name} {...cardMotionProps(reducedMotion, index)} whileHover={reducedMotion ? {} : { y: -6, rotateX: 2 }}>
              <strong>{category.name}</strong>
              <span>{category.meta}</span>
            </motion.article>
          ))}
        </motion.div>
      </motion.section>

      <motion.section id="marketplace-preview" className="gc-landing-section" {...motionProps(reducedMotion)}>
        <LandingSectionHeader
          eyebrow="Marketplace preview"
          title="Recent listings appear here when students publish them."
          text="Preview uses real API data only. No fake marketplace listings are shown."
        />
        {loadingPreview ? (
          <LoadingSkeleton label="Loading marketplace preview..." />
        ) : previewError ? (
          <motion.div className="gc-preview-empty gc-preview-empty--error" {...motionProps(reducedMotion)}>{previewError}</motion.div>
        ) : listings.length ? (
          <motion.div className="gc-landing-listings" initial={reducedMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.16 }} variants={staggerContainer}>
            {listings.map((listing, index) => (
              <motion.article className="gc-preview-listing" key={listing.id} {...cardMotionProps(reducedMotion, index)} whileHover={reducedMotion ? {} : { y: -6 }}>
                <div className="gc-preview-listing-image">
                  {listing.image_url ? <img src={listing.image_url} alt={listing.title} loading="lazy" decoding="async" /> : <span>{listing.category_name || 'Item'}</span>}
                </div>
                <div>
                  <h3>{listing.title}</h3>
                  <p>{listing.category_name || 'General'} by {listing.seller_name || 'Student seller'}</p>
                  <strong>{formatPrice(listing.price)}</strong>
                </div>
              </motion.article>
            ))}
          </motion.div>
        ) : (
          <motion.div className="gc-preview-empty" {...motionProps(reducedMotion)}>
            <h3>No public listings yet.</h3>
            <p>Sign in and create the first GreenCampus listing with a real image from your dashboard.</p>
            <button className="gc-btn gc-btn--primary" onClick={() => onAuthPage('register')}>Create Account</button>
          </motion.div>
        )}
      </motion.section>

      <motion.section id="sustainability" className="gc-landing-section gc-sustainability" {...motionProps(reducedMotion)}>
        <div>
          <span className="gc-eyebrow gc-eyebrow--dark">Sustainability</span>
          <h2>Save money, reduce waste, and give campus items a second life.</h2>
        </div>
        <motion.div className="gc-sustainability-card" whileHover={reducedMotion ? {} : { y: -5 }}>
          <p>GreenCampus helps students reuse books, electronics, supplies, clothes, furniture, and donation items instead of buying everything new. Each reused object means less waste, less spending, and a stronger campus community.</p>
          <div className="gc-impact-grid">
            <span>Reduce waste</span>
            <span>Reuse items</span>
            <span>Save money</span>
            <span>Support EMSI students</span>
          </div>
        </motion.div>
      </motion.section>

      <motion.section className="gc-final-cta" {...motionProps(reducedMotion)}>
        <span className="gc-eyebrow">Ready when you are</span>
        <h2>Join GreenCampus today.</h2>
        <p>Turn unused items into value for another EMSI student.</p>
        <div className="gc-hero-actions">
          <button className="gc-btn gc-btn--hero" onClick={() => onAuthPage('register')}>Create Account</button>
          <button className="gc-btn gc-btn--hero-outline" onClick={() => onAuthPage('login')}>Sign In</button>
        </div>
      </motion.section>
    </div>
  )
}

function LandingSectionHeader({ eyebrow, title, text }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.div className="gc-landing-header" {...motionProps(reducedMotion)}>
      <span className="gc-eyebrow gc-eyebrow--dark">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </motion.div>
  )
}

function LoadingSkeleton({ label = 'Loading...' }) {
  return (
    <div className="gc-skeleton-panel" aria-live="polite" aria-busy="true">
      <span>{label}</span>
      <div className="gc-skeleton-lines">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

const chartPalette = ['#126b38', '#18a957', '#2367a6', '#f5a524', '#bb2f35', '#6b7280']

function hasChartData(data) {
  return Array.isArray(data) && data.some((item) => Number(item.value) > 0)
}

function lineChartOption(data, label, color = '#126b38') {
  return {
    color: [color],
    grid: { top: 34, right: 18, bottom: 34, left: 44 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((item) => item.label),
      axisLine: { lineStyle: { color: '#d8e3dc' } },
      axisLabel: { color: '#617065' },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#617065' },
      splitLine: { lineStyle: { color: '#edf2ef' } },
    },
    series: [
      {
        name: label,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        areaStyle: { opacity: 0.14 },
        lineStyle: { width: 3 },
        data: data.map((item) => item.value),
      },
    ],
  }
}

function barChartOption(data, label, horizontal = false) {
  const categories = data.map((item) => item.label)
  const values = data.map((item) => item.value)
  return {
    color: chartPalette,
    grid: { top: 28, right: 18, bottom: horizontal ? 24 : 42, left: horizontal ? 92 : 42 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: horizontal
      ? { type: 'value', minInterval: 1, axisLabel: { color: '#617065' }, splitLine: { lineStyle: { color: '#edf2ef' } } }
      : { type: 'category', data: categories, axisLabel: { color: '#617065', rotate: categories.length > 5 ? 28 : 0 }, axisLine: { lineStyle: { color: '#d8e3dc' } } },
    yAxis: horizontal
      ? { type: 'category', data: categories, axisLabel: { color: '#617065' }, axisLine: { lineStyle: { color: '#d8e3dc' } } }
      : { type: 'value', minInterval: 1, axisLabel: { color: '#617065' }, splitLine: { lineStyle: { color: '#edf2ef' } } },
    series: [
      {
        name: label,
        type: 'bar',
        barMaxWidth: 34,
        itemStyle: { borderRadius: horizontal ? [0, 10, 10, 0] : [10, 10, 0, 0] },
        data: values,
      },
    ],
  }
}

function pieChartOption(data, title) {
  return {
    color: chartPalette,
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#617065' } },
    series: [
      {
        name: title,
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 10, borderColor: '#ffffff', borderWidth: 3 },
        label: { formatter: '{b}: {c}', color: '#10231b', fontWeight: 700 },
        data: data.map((item) => ({ name: item.label, value: item.value })),
      },
    ],
  }
}

function ChartCard({ title, description, option, data, loading }) {
  const reducedMotion = useReducedMotion()
  const empty = !loading && !hasChartData(data)
  return (
    <motion.article className="gc-chart-card" {...motionProps(reducedMotion)}>
      <div className="gc-chart-card-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {loading ? (
        <LoadingSkeleton label="Loading chart data..." />
      ) : empty ? (
        <div className="gc-chart-empty">No data yet.</div>
      ) : (
        <Suspense fallback={<LoadingSkeleton label="Loading chart engine..." />}>
          <LazyReactECharts option={option} style={{ height: 310, width: '100%' }} notMerge lazyUpdate />
        </Suspense>
      )}
    </motion.article>
  )
}

function AuthPage({ mode, onPage, onAuth, setNotice, setError }) {
  const [tab, setTab] = useState(mode === 'register' ? 'register' : 'login')
  const [registerForm, setRegisterForm] = useState(emptyRegister)
  const [loginForm, setLoginForm] = useState(emptyLogin)
  const [busy, setBusy] = useState(false)
  const reducedMotion = useReducedMotion()

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
    <motion.section className="gc-auth-page" {...pageTransition} transition={{ duration: reducedMotion ? 0 : 0.32 }}>
      <div className="gc-auth-shell">
        <motion.aside className="gc-auth-story" initial={reducedMotion ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reducedMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] }}>
          <span className="gc-eyebrow gc-eyebrow--dark">EMSI-only marketplace</span>
          <h2>Trade smarter inside the campus circle.</h2>
          <p>Buy, sell, rent, exchange, and donate with verified students while keeping every handoff close to campus.</p>
          <div className="gc-auth-proof">
            <span>Verified EMSI emails</span>
            <span>Campus handoffs</span>
            <span>Reuse-first culture</span>
          </div>
        </motion.aside>
        <motion.div className="gc-auth-card" initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}>
          <header className="gc-auth-header">
            <h1>{tab === 'register' ? 'Create your account' : 'Welcome back'}</h1>
            <p>{tab === 'register' ? 'Join GreenCampus with your EMSI identity.' : 'Sign in to manage listings, requests, and meetings.'}</p>
          </header>
          <div className="gc-auth-toggle">
            <button className={`gc-auth-toggle-btn${tab === 'login' ? ' gc-auth-toggle-btn--active' : ''}`} onClick={() => { setTab('login'); onPage('login') }}>Sign In</button>
            <button className={`gc-auth-toggle-btn${tab === 'register' ? ' gc-auth-toggle-btn--active' : ''}`} onClick={() => { setTab('register'); onPage('register') }}>Create Account</button>
          </div>
          <AnimatePresence mode="wait">
            {tab === 'register' ? (
              <motion.form className="gc-form" onSubmit={submitRegister} key="register-form" initial={reducedMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -18 }} transition={{ duration: reducedMotion ? 0 : 0.24 }}>
                <Field label="Username" value={registerForm.username} onChange={change(setRegisterForm, 'username')} required />
                <Field label="Email (@emsi.ma)" type="email" value={registerForm.email} onChange={change(setRegisterForm, 'email')} required />
                <Field label="Password" type="password" value={registerForm.password} onChange={change(setRegisterForm, 'password')} minLength={8} required />
                <Field label="Filiere" value={registerForm.filiere} onChange={change(setRegisterForm, 'filiere')} />
                <Field label="Phone" value={registerForm.phone} onChange={change(setRegisterForm, 'phone')} />
                <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy}>{busy ? <span className="gc-button-loading">Creating...</span> : 'Create Account'}</button>
              </motion.form>
            ) : (
              <motion.form className="gc-form" onSubmit={submitLogin} key="login-form" initial={reducedMotion ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 18 }} transition={{ duration: reducedMotion ? 0 : 0.24 }}>
                <Field label="Email" type="email" value={loginForm.email} onChange={change(setLoginForm, 'email')} required />
                <Field label="Password" type="password" value={loginForm.password} onChange={change(setLoginForm, 'password')} required />
                <button className="gc-btn gc-btn--primary gc-btn--full" disabled={busy}>{busy ? <span className="gc-button-loading">Signing in...</span> : 'Sign In'}</button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.section>
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

function DashboardHero({ profile, onCreate }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.section className="gc-dashboard-hero" {...motionProps(reducedMotion)}>
      <div>
        <span className="gc-eyebrow gc-eyebrow--dark">Welcome back</span>
        <h1>Find what you need on campus.</h1>
        <p>Browse real EMSI student listings, create your own item, and manage requests, meetings, loans, and sales from one place.</p>
        <div className="gc-badge-row">
          <span className="gc-badge gc-badge--active">{profile?.filiere || 'EMSI student'}</span>
          <span className={`gc-badge ${profile?.is_verified ? 'gc-badge--active' : 'gc-badge--warn'}`}>{profile?.is_verified ? 'Verified account' : 'Verification pending'}</span>
          <span className={`gc-badge ${profile?.is_suspended || profile?.is_blacklisted ? 'gc-badge--danger' : 'gc-badge--active'}`}>{accountStatus(profile)}</span>
          {profile?.overdue_count > 0 && <span className="gc-badge gc-badge--warn">Overdue history: {profile.overdue_count}</span>}
        </div>
      </div>
      <button className="gc-btn gc-btn--primary gc-btn--hero-action" type="button" onClick={onCreate}>Create listing</button>
    </motion.section>
  )
}
function ListingFilters({ filters, categories, onChange, onSubmit, onReset }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.form className="gc-filter-bar" onSubmit={onSubmit} {...motionProps(reducedMotion)}>
      <input className="gc-input" placeholder="Search books, calculators, electronics..." value={filters.q} onChange={(e) => onChange('q', e.target.value)} />
      <select className="gc-input" value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
        <option value="">All categories</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <select className="gc-input" value={filters.listing_type} onChange={(e) => onChange('listing_type', e.target.value)}>
        <option value="">All listing types</option>
        <option value="sale">Sell</option>
        <option value="loan">Loan / rent</option>
        <option value="exchange">Exchange</option>
        <option value="donate">Donate</option>
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
    </motion.form>
  )
}

function ListingCard({ listing, index = 0, onView }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.article className="gc-listing-card" {...cardMotionProps(reducedMotion, index)} whileHover={reducedMotion ? {} : { y: -7 }}>
      <button className="gc-listing-image" type="button" onClick={() => onView(listing)}>
        {listing.image_url ? <img src={listing.image_url} alt={listing.title} loading="lazy" decoding="async" /> : <span>{listing.category_name || 'Item'}</span>}
      </button>
      <div className="gc-listing-content">
        <div className="gc-listing-card-header">
          <h3>{listing.title}</h3>
          <strong>{formatPrice(listing.price)}</strong>
        </div>
        <p className="gc-listing-seller">{listing.seller_name || 'Student seller'}</p>
        <div className="gc-listing-meta">
          <span className="gc-tag">{listing.listing_type_display || listingTypeLabel(listing.listing_type)}</span>
          <span className="gc-tag">{formatCondition(listing.condition)}</span>
          <span className={`gc-badge ${badgeToneForListingStatus(listing.status)}`}>{listing.status_display || formatTokenLabel(listing.status)}</span>
        </div>
        <div className="gc-card-actions">
          <button className="gc-btn gc-btn--secondary" onClick={() => onView(listing)}>View details</button>
        </div>
      </div>
    </motion.article>
  )
}

function ListingGrid({ listings, loading, error, onView }) {
  const reducedMotion = useReducedMotion()
  if (loading) return <LoadingSkeleton label="Loading marketplace..." />
  if (error) return <div className="gc-empty gc-empty--error">{error}</div>
  if (!listings.length) return <div className="gc-empty">No marketplace items yet. Create the first listing.</div>
  return (
    <motion.div className="gc-listings-grid" initial={reducedMotion ? false : 'hidden'} animate="visible" variants={staggerContainer}>
      {listings.map((listing, index) => (
        <ListingCard key={listing.id} listing={listing} index={index} onView={onView} />
      ))}
    </motion.div>
  )
}

function ListingForm({ categories, initialListing, busy, onCancel, onSubmit }) {
  const [form, setForm] = useState(emptyListing)
  const [imagePreview, setImagePreview] = useState('')
  const [imageError, setImageError] = useState('')
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (initialListing) {
      setForm({
        category: initialListing.category || '',
        title: initialListing.title || '',
        description: initialListing.description || '',
        image: null,
        listing_type: initialListing.listing_type || 'sale',
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
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'listing_type' && ['exchange', 'donate'].includes(value)) next.price = '0'
      return next
    })
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
    <motion.form className="gc-listing-form" onSubmit={submit} initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }} transition={{ duration: reducedMotion ? 0 : 0.28 }}>
      <div className="gc-form-grid">
        <Field label="Title" value={form.title} onChange={(e) => change('title', e.target.value)} required />
        <label className="gc-field">
          <span className="gc-label">Category</span>
          <select className="gc-input" value={form.category} onChange={(e) => change('category', e.target.value)}>
            <option value="">General</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Listing type</span>
          <select className="gc-input" value={form.listing_type} onChange={(e) => change('listing_type', e.target.value)}>
            <option value="sale">Sell</option>
            <option value="loan">Loan / rent</option>
            <option value="exchange">Exchange</option>
            <option value="donate">Donate</option>
          </select>
        </label>
        <Field
          label={`${listingPriceLabel(form.listing_type)}${form.listing_type === 'donate' || form.listing_type === 'exchange' ? '' : ' (MAD)'}`}
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={(e) => change('price', e.target.value)}
          disabled={form.listing_type === 'donate' || form.listing_type === 'exchange'}
          required
        />
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
          {imagePreview ? <img src={imagePreview} alt="Selected listing preview" decoding="async" /> : <span>No image selected</span>}
        </div>
        <Field label="Eco score" type="number" min="0" max="100" value={form.eco_score} onChange={(e) => change('eco_score', e.target.value)} />
        <label className="gc-field">
          <span className="gc-label">Availability</span>
          <select className="gc-input" value={form.is_available ? 'available' : 'hidden'} onChange={(e) => change('is_available', e.target.value === 'available')}>
            <option value="available">Available now</option>
            <option value="hidden">Unavailable / hidden</option>
          </select>
        </label>
        <TextareaField className="gc-form-wide" label="Description" rows={4} value={form.description} onChange={(e) => change('description', e.target.value)} required />
      </div>
      <div className="gc-card-actions">
        <button className="gc-btn gc-btn--primary" disabled={busy}>{busy ? <span className="gc-button-loading">Saving...</span> : initialListing ? 'Save changes' : 'Create listing'}</button>
        <button className="gc-btn gc-btn--outline" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </motion.form>
  )
}

function ListingFormModal({ categories, initialListing, busy, onCancel, onSubmit }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.div className="gc-modal-backdrop" onClick={onCancel} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
      <motion.article className="gc-listing-form-modal" onClick={(event) => event.stopPropagation()} initial={reducedMotion ? false : { opacity: 0, x: 32, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.24 }}>
        <button className="gc-modal-close" onClick={onCancel} aria-label="Close">x</button>
        <div className="gc-listing-form-head">
          <span className="gc-eyebrow gc-eyebrow--dark">{initialListing ? 'Edit listing' : 'New listing'}</span>
          <h2>{initialListing ? 'Update your campus item' : 'Create a polished marketplace listing'}</h2>
          <p>Add a clear photo, honest condition, price, and campus handoff details.</p>
        </div>
        <ListingForm categories={categories} initialListing={initialListing} busy={busy} onCancel={onCancel} onSubmit={onSubmit} />
      </motion.article>
    </motion.div>
  )
}

function ListingDetails({
  listing,
  profile,
  requestForm,
  setRequestForm,
  requestBusy,
  onClose,
  onRequest,
  onEdit,
  onDelete,
}) {
  const reducedMotion = useReducedMotion()
  if (!listing) return null
  const canManage = listing.is_owner || profile?.is_staff
  const blockedBySuspension = Boolean(profile?.is_suspended)
  const canRequest = !canManage && listing.is_available && !blockedBySuspension
  const detailFacts = [
    ['Listing type', listing.listing_type_display || listingTypeLabel(listing.listing_type)],
    ['Seller', listing.seller_name || 'Student seller'],
    ['Campus', listing.campus || 'Campus not specified'],
    ['Category', listing.category_name || 'General'],
    ['Condition', formatCondition(listing.condition)],
    ['Status', listing.status_display || formatTokenLabel(listing.status)],
    ['Posted', formatDate(listing.created_at)],
  ]

  return (
    <motion.div className="gc-modal-backdrop" onClick={onClose} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
      <motion.article className="gc-detail-modal" role="dialog" aria-modal="true" aria-labelledby={`listing-title-${listing.id}`} onClick={(event) => event.stopPropagation()} initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <button className="gc-modal-close gc-detail-close" type="button" onClick={onClose} aria-label="Close listing details">x</button>
        <div className="gc-detail-image">
          {listing.image_url ? <img src={listing.image_url} alt={listing.title} decoding="async" fetchPriority="high" /> : <span>{listing.category_name || 'Marketplace item'}</span>}
        </div>
        <div className="gc-detail-body">
          <div className="gc-detail-header">
            <div>
              <span className={`gc-detail-status ${listing.is_available ? 'gc-detail-status--available' : ''}`}>{listing.status_display || (listing.is_available ? 'Available' : 'Unavailable')}</span>
              <h2 id={`listing-title-${listing.id}`}>{listing.title}</h2>
              <p>{listing.seller_name || 'Student seller'} {listing.campus ? `- ${listing.campus}` : ''}</p>
            </div>
            <strong className="gc-detail-price">{formatPrice(listing.price)}</strong>
          </div>

          <dl className="gc-detail-facts">
            {detailFacts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <section className="gc-detail-description-block" aria-label="Listing description">
            <h3>Description</h3>
            <p className="gc-detail-description">{listing.description}</p>
          </section>

          {canRequest && (
            <motion.form className="gc-contact-form" onSubmit={(event) => { event.preventDefault(); onRequest(listing) }} initial={reducedMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: reducedMotion ? 0 : 0.24 }}>
              <h3>{listingActionLabel(listing)}</h3>
              <TextareaField
                label="Message"
                rows={3}
                value={requestForm.message}
                onChange={(event) => setRequestForm((current) => ({ ...current, message: event.target.value }))}
                placeholder="Share your request details with the seller."
                required
              />
              <Field
                label="Proposed meeting location"
                value={requestForm.meeting_location}
                onChange={(event) => setRequestForm((current) => ({ ...current, meeting_location: event.target.value }))}
                required
              />
              <label className="gc-field">
                <span className="gc-label">Proposed meeting date and time</span>
                <input
                  className="gc-input"
                  type="datetime-local"
                  value={requestForm.meeting_datetime}
                  onChange={(event) => setRequestForm((current) => ({ ...current, meeting_datetime: event.target.value }))}
                  required
                />
              </label>
              {listing.listing_type === 'loan' && (
                <div className="gc-form-grid">
                  <Field
                    label="Requested start date"
                    type="date"
                    value={requestForm.requested_start_date}
                    onChange={(event) => setRequestForm((current) => ({ ...current, requested_start_date: event.target.value }))}
                    required
                  />
                  <Field
                    label="Expected return date"
                    type="date"
                    value={requestForm.expected_return_date}
                    onChange={(event) => setRequestForm((current) => ({ ...current, expected_return_date: event.target.value }))}
                    required
                  />
                </div>
              )}
              <button className="gc-btn gc-btn--primary" disabled={requestBusy}>
                {requestBusy ? <span className="gc-button-loading">Sending...</span> : listingActionLabel(listing)}
              </button>
            </motion.form>
          )}
          {!canManage && blockedBySuspension && (
            <div className="gc-empty gc-empty--compact">
              Your account is suspended until {profile?.suspension_until ? formatDateTime(profile.suspension_until) : 'an admin clears it'}, so requests and contact are paused.
            </div>
          )}
          {!canManage && !blockedBySuspension && !canRequest && (
            <div className="gc-empty gc-empty--compact">This listing already has an active status and cannot receive a new request right now.</div>
          )}
          {canManage && (
            <div className="gc-card-actions">
              <button className="gc-btn gc-btn--secondary" onClick={() => onEdit(listing)}>Edit listing</button>
              <button className="gc-btn gc-btn--danger" onClick={() => onDelete(listing)}>Delete listing</button>
            </div>
          )}
        </div>
      </motion.article>
    </motion.div>
  )
}

function ListingDeleteModal({ listing, busy, onCancel, onConfirm }) {
  const reducedMotion = useReducedMotion()
  if (!listing) return null
  return (
    <motion.div className="gc-modal-backdrop gc-admin-action-backdrop" onClick={busy ? undefined : onCancel} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
      <motion.article className="gc-admin-action-modal gc-admin-action-modal--danger" onClick={(event) => event.stopPropagation()} initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
        <button className="gc-modal-close" onClick={onCancel} disabled={busy} aria-label="Close">x</button>
        <div className="gc-admin-action-modal-head">
          <span className="gc-admin-action-icon" aria-hidden="true">X</span>
          <div>
            <span className="gc-badge gc-admin-action-badge gc-admin-action-badge--danger">Listing deletion</span>
            <h2>Delete listing?</h2>
            <p>This removes the listing from the marketplace. Students will no longer be able to browse or request it.</p>
          </div>
        </div>
        <div className="gc-admin-action-user">
          <span className="gc-profile-avatar gc-profile-avatar--small">{String(listing.title || 'GC').slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{listing.title}</strong>
            <small>{listing.category_name || 'Marketplace item'} - {formatPrice(listing.price)}</small>
          </div>
          <span className={`gc-badge ${badgeToneForListingStatus(listing.status)}`}>{listing.status_display || formatTokenLabel(listing.status)}</span>
        </div>
        <div className="gc-card-actions gc-admin-action-modal-actions">
          <button className="gc-btn gc-btn--danger" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? <span className="gc-button-loading">Deleting...</span> : 'Delete listing'}
          </button>
          <button className="gc-btn gc-btn--outline" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </motion.article>
    </motion.div>
  )
}

function MyListings({ listings, onEdit, onDelete, onView }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.section className="gc-panel" {...motionProps(reducedMotion)}>
      <div className="gc-section-header">
        <h2>My listings</h2>
      </div>
      {!listings.length ? (
        <div className="gc-empty gc-empty--compact">You have not created a listing yet.</div>
      ) : (
        <motion.div className="gc-my-list" initial={reducedMotion ? false : 'hidden'} animate="visible" variants={staggerContainer}>
          {listings.map((listing, index) => (
            <motion.div className="gc-my-listing" key={listing.id} {...cardMotionProps(reducedMotion, index)}>
              <button onClick={() => onView(listing)}>{listing.title}</button>
              <span>{listing.listing_type_display || listingTypeLabel(listing.listing_type)}</span>
              <span>{formatPrice(listing.price)}</span>
              <span>{listing.status_display || formatTokenLabel(listing.status)}</span>
              <button className="gc-link-btn" onClick={() => onEdit(listing)}>Edit</button>
              <button className="gc-link-btn gc-link-btn--danger" onClick={() => onDelete(listing)}>Delete</button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.section>
  )
}

function MessageList({ title, messages, allowReply, replyById, setReplyById, onReply, replyBusy, compact = false }) {
  const reducedMotion = useReducedMotion()
  const isReceivedBox = title.toLowerCase().includes('received')
  return (
    <div className={compact ? 'gc-message-list gc-message-list--compact' : 'gc-message-list'}>
      <h3 className="gc-message-title">{title}</h3>
      {!messages.length ? (
        <div className="gc-empty gc-empty--compact">No messages.</div>
      ) : messages.map((message, index) => (
        <motion.article className="gc-message-card" key={message.id} {...cardMotionProps(reducedMotion, index)}>
          <div className="gc-message-head">
            <strong>{message.listing_title}</strong>
            <span className="gc-tag">{message.status}</span>
          </div>
          <p>{message.message}</p>
          <small>{isReceivedBox ? `From ${message.sender_name}` : `To ${message.recipient_name}`} - {formatDate(message.created_at)}</small>
          {message.reply && <p className="gc-message-reply">Reply: {message.reply}</p>}
          {allowReply && (
            <form className="gc-reply-form" onSubmit={(event) => { event.preventDefault(); onReply(message, replyById[message.id] || '') }}>
              <input className="gc-input" value={replyById[message.id] || ''} onChange={(event) => setReplyById((x) => ({ ...x, [message.id]: event.target.value }))} placeholder="Reply to buyer" />
              <button className="gc-btn gc-btn--secondary" disabled={replyBusy || !(replyById[message.id] || '').trim()}>Reply</button>
            </form>
          )}
        </motion.article>
      ))}
    </div>
  )
}

function NotificationList({ notifications, compact = false }) {
  const reducedMotion = useReducedMotion()
  const visibleNotifications = notifications || []
  return (
    <div className={compact ? 'gc-notification-list gc-notification-list--compact' : 'gc-notification-list'}>
      {!compact && <h3 className="gc-message-title">Notifications</h3>}
      {!visibleNotifications.length ? (
        <div className="gc-empty gc-empty--compact">No notifications.</div>
      ) : visibleNotifications.map((notification, index) => {
        const deadlineText = formatDeadline(notification.deadline)
        return (
          <motion.article className={`gc-notification-card gc-notification-card--${notification.severity || 'info'}`} key={notification.id} {...cardMotionProps(reducedMotion, index)}>
            <div>
              <strong>{notification.type === 'suspension' ? 'Account suspended' : 'Overdue item warning'}</strong>
              <p>{notification.message}</p>
            </div>
            <div className="gc-notification-meta">
              {notification.listing_title && <span>{notification.listing_title}</span>}
              {notification.deadline && <span>{deadlineText}</span>}
              {notification.suspension_until && <span>Until {formatDateTime(notification.suspension_until)}</span>}
            </div>
          </motion.article>
        )
      })}
    </div>
  )
}

function TransactionTimeline({ transaction }) {
  const reducedMotion = useReducedMotion()
  const stepsByType = {
    sale: ['Request', 'Accepted', 'Meeting', 'Sold'],
    loan: ['Request', 'Accepted', 'Meeting', 'Loan active', 'Returned'],
    exchange: ['Request', 'Accepted', 'Meeting', 'Completed'],
    donate: ['Request', 'Accepted', 'Meeting', 'Completed'],
  }
  const statusIndex = {
    pending: 0,
    accepted: 1,
    meeting_scheduled: 2,
    handed_over: 2,
    active_loan: 3,
    overdue: 3,
    sold: 3,
    completed: 3,
    returned: 4,
  }
  const steps = stepsByType[transaction.transaction_type] || stepsByType.sale
  const currentIndex = statusIndex[transaction.status] ?? 0

  return (
    <motion.div className="gc-transaction-timeline" {...motionProps(reducedMotion)}>
      {steps.map((step, index) => (
        <div
          key={`${transaction.id}-${step}`}
          className={`gc-transaction-step${index <= currentIndex ? ' gc-transaction-step--done' : ''}${transaction.status === 'overdue' && index === currentIndex ? ' gc-transaction-step--danger' : ''}`}
        >
          <span>{index + 1}</span>
          <small>{step}</small>
        </div>
      ))}
    </motion.div>
  )
}

function TransactionCard({
  transaction,
  profile,
  formsById,
  setFormsById,
  busyKey,
  onAction,
  adminMode = false,
  onResolve,
}) {
  const reducedMotion = useReducedMotion()
  const form = formsById[transaction.id] || buildMeetingForm(transaction)
  const isBusy = busyKey.startsWith(`${transaction.id}-`)
  const canEditSellerNote = transaction.is_seller || profile?.is_staff || adminMode
  const canEditBuyerNote = transaction.is_requester || profile?.is_staff || adminMode

  function updateForm(field, value) {
    setFormsById((current) => ({
      ...current,
      [transaction.id]: {
        ...buildMeetingForm(transaction),
        ...(current[transaction.id] || {}),
        [field]: value,
      },
    }))
  }

  function submitMeeting(event) {
    event.preventDefault()
    const payload = {
      meeting_location: form.meeting_location,
      meeting_datetime: form.meeting_datetime ? new Date(form.meeting_datetime).toISOString() : '',
    }
    if (canEditSellerNote) payload.seller_note = form.seller_note
    if (canEditBuyerNote) payload.buyer_note = form.buyer_note
    onAction(transaction, 'meeting', payload)
  }

  const counterpart = transaction.is_seller
    ? transaction.requester_name
    : transaction.seller_name

  return (
    <motion.article className="gc-transaction-card" {...cardMotionProps(reducedMotion)}>
      <div className="gc-transaction-card-head">
        <div>
          <h4>{transaction.listing_title}</h4>
          <p>
            {adminMode
              ? `${transaction.requester_name} to ${transaction.seller_name}`
              : `${transaction.is_seller ? 'Requested by' : 'Seller'} ${counterpart}`} · {formatDate(transaction.created_at)}
          </p>
        </div>
        <div className="gc-badge-row">
          <span className={`gc-badge ${badgeToneForTransactionStatus(transaction.status)}`}>{transaction.status_display || formatTokenLabel(transaction.status)}</span>
          <span className="gc-badge">{transaction.transaction_type_display || listingTypeLabel(transaction.transaction_type)}</span>
        </div>
      </div>

      <div className="gc-transaction-meta-grid">
        <div>
          <span>Price</span>
          <strong>{formatPrice(transaction.price)}</strong>
        </div>
        <div>
          <span>Listing status</span>
          <strong>{transaction.listing_status_display || formatTokenLabel(transaction.listing_status)}</strong>
        </div>
        <div>
          <span>Meeting</span>
          <strong>{transaction.meeting_datetime ? formatDateTime(transaction.meeting_datetime) : 'Not scheduled'}</strong>
        </div>
        <div>
          <span>Return due</span>
          <strong>{transaction.expected_return_date ? formatDate(transaction.expected_return_date) : 'Not applicable'}</strong>
        </div>
      </div>

      <div className="gc-transaction-chip-row">
        <span className={`gc-badge ${badgeToneForMeetingStatus(transaction.meeting_status)}`}>{transaction.meeting_status_display || formatTokenLabel(transaction.meeting_status)}</span>
        {transaction.status === 'overdue' && <span className="gc-badge gc-badge--danger">Overdue count: {transaction.requester_overdue_count ?? 0}</span>}
        {transaction.was_ever_overdue && transaction.status !== 'overdue' && <span className="gc-badge gc-badge--warn">Previously overdue</span>}
      </div>

      {transaction.message && <p className="gc-transaction-message">{transaction.message}</p>}

      {(transaction.meeting_datetime || transaction.meeting_location) && (
        <div className="gc-meeting-card">
          <strong>Meeting</strong>
          <span>{transaction.meeting_location || 'Location pending'}</span>
          <small>{formatDateTime(transaction.meeting_datetime)}</small>
        </div>
      )}

      {(transaction.seller_note || transaction.buyer_note) && (
        <div className="gc-note-grid">
          {transaction.seller_note && <p><strong>Seller note:</strong> {transaction.seller_note}</p>}
          {transaction.buyer_note && <p><strong>Buyer note:</strong> {transaction.buyer_note}</p>}
        </div>
      )}

      <TransactionTimeline transaction={transaction} />

      {transaction.available_actions?.includes('meeting') && (
        <form className="gc-transaction-form" onSubmit={submitMeeting}>
          <div className="gc-form-grid">
            <Field
              label="Meeting location"
              value={form.meeting_location}
              onChange={(event) => updateForm('meeting_location', event.target.value)}
              required
            />
            <label className="gc-field">
              <span className="gc-label">Meeting date and time</span>
              <input
                className="gc-input"
                type="datetime-local"
                value={form.meeting_datetime}
                onChange={(event) => updateForm('meeting_datetime', event.target.value)}
                required
              />
            </label>
            {canEditSellerNote && (
              <TextareaField
                className="gc-form-wide"
                label="Seller note"
                rows={2}
                value={form.seller_note}
                onChange={(event) => updateForm('seller_note', event.target.value)}
              />
            )}
            {canEditBuyerNote && (
              <TextareaField
                className="gc-form-wide"
                label="Buyer note"
                rows={2}
                value={form.buyer_note}
                onChange={(event) => updateForm('buyer_note', event.target.value)}
              />
            )}
          </div>
          <button className="gc-btn gc-btn--outline gc-btn--compact" disabled={isBusy || !form.meeting_location || !form.meeting_datetime}>
            {isBusy ? <span className="gc-button-loading">Saving...</span> : transaction.meeting_datetime ? 'Update meeting' : 'Schedule meeting'}
          </button>
        </form>
      )}

      <div className="gc-card-actions">
        {transaction.available_actions?.includes('accept') && (
          <button className="gc-btn gc-btn--primary gc-btn--compact" type="button" disabled={isBusy} onClick={() => onAction(transaction, 'accept')}>
            Accept
          </button>
        )}
        {transaction.available_actions?.includes('reject') && (
          <button className="gc-btn gc-btn--danger gc-btn--compact" type="button" disabled={isBusy} onClick={() => onAction(transaction, 'reject')}>
            Reject
          </button>
        )}
        {transaction.available_actions?.includes('cancel') && (
          <button className="gc-btn gc-btn--outline gc-btn--compact" type="button" disabled={isBusy} onClick={() => onAction(transaction, 'cancel')}>
            Cancel
          </button>
        )}
        {transaction.available_actions?.includes('handover') && (
          <button className="gc-btn gc-btn--secondary gc-btn--compact" type="button" disabled={isBusy} onClick={() => onAction(transaction, 'handover', { seller_note: form.seller_note })}>
            Confirm handover
          </button>
        )}
        {transaction.available_actions?.includes('return') && (
          <div className="gc-inline-action">
            <input
              className="gc-input"
              type="date"
              value={form.actual_return_date}
              onChange={(event) => updateForm('actual_return_date', event.target.value)}
            />
            <button
              className="gc-btn gc-btn--secondary gc-btn--compact"
              type="button"
              disabled={isBusy}
              onClick={() => onAction(transaction, 'return', {
                actual_return_date: form.actual_return_date || new Date().toISOString().slice(0, 10),
                seller_note: form.seller_note,
              })}
            >
              Confirm return
            </button>
          </div>
        )}
        {transaction.available_actions?.includes('sold') && (
          <button className="gc-btn gc-btn--primary gc-btn--compact" type="button" disabled={isBusy} onClick={() => onAction(transaction, 'sold', { seller_note: form.seller_note })}>
            Mark sold
          </button>
        )}
        {transaction.available_actions?.includes('complete') && (
          <button className="gc-btn gc-btn--primary gc-btn--compact" type="button" disabled={isBusy} onClick={() => onAction(transaction, 'complete', { seller_note: form.seller_note })}>
            Mark completed
          </button>
        )}
        {(adminMode || transaction.available_actions?.includes('resolve')) && onResolve && (
          <button className="gc-btn gc-btn--outline gc-btn--compact" type="button" disabled={isBusy} onClick={() => onResolve(transaction)}>
            Resolve
          </button>
        )}
      </div>

      {transaction.resolution_note && (
        <div className="gc-transaction-resolution">
          <strong>Resolution</strong>
          <p>{transaction.resolution_note}</p>
          {transaction.resolved_at && <small>Resolved {formatDateTime(transaction.resolved_at)}</small>}
        </div>
      )}
    </motion.article>
  )
}

function CompactEmptyState({ title, text }) {
  return (
    <div className="gc-compact-empty">
      <span aria-hidden="true">GC</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function TransactionSection({ title, description, transactions, emptyMessage, profile, formsById, setFormsById, busyKey, onAction, onResolve }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.section className="gc-panel gc-transaction-section" {...motionProps(reducedMotion)}>
      <div className="gc-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="gc-badge gc-badge--active">{transactions.length}</span>
      </div>
      {!transactions.length ? (
        <CompactEmptyState title={emptyMessage || `No ${title.toLowerCase()} yet`} text="When activity appears, it will show here in a compact list." />
      ) : (
        <div className="gc-transaction-list">
          {transactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              profile={profile}
              formsById={formsById}
              setFormsById={setFormsById}
              busyKey={busyKey}
              onAction={onAction}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </motion.section>
  )
}

function AdminResolveModal({ transaction, busy, onCancel, onResolve }) {
  const reducedMotion = useReducedMotion()
  const [note, setNote] = useState(transaction?.resolution_note || '')

  useEffect(() => {
    setNote(transaction?.resolution_note || '')
  }, [transaction])

  if (!transaction) return null

  return (
    <motion.div className="gc-modal-backdrop" onClick={onCancel} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
      <motion.article className="gc-listing-form-modal gc-resolve-modal" onClick={(event) => event.stopPropagation()} initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.22 }}>
        <button className="gc-modal-close" onClick={onCancel} aria-label="Close">x</button>
        <div className="gc-listing-form-head">
          <span className="gc-eyebrow gc-eyebrow--dark">Admin resolution</span>
          <h2>Resolve transaction</h2>
          <p>{transaction.listing_title} · {transaction.requester_name} to {transaction.seller_name}</p>
        </div>
        <TextareaField label="Resolution note" rows={4} value={note} onChange={(event) => setNote(event.target.value)} required />
        <div className="gc-card-actions">
          <button className="gc-btn gc-btn--primary" disabled={busy || !note.trim()} onClick={() => onResolve(note)}>
            {busy ? <span className="gc-button-loading">Saving...</span> : 'Save resolution'}
          </button>
          <button className="gc-btn gc-btn--outline" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </motion.article>
    </motion.div>
  )
}

function MarketplaceSection({ access, profile, mode, openCreateSignal = 0, setNotice, setError }) {
  const [categories, setCategories] = useState([])
  const [listings, setListings] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const [loading, setLoading] = useState(true)
  const [marketError, setMarketError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingListing, setEditingListing] = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [requestForm, setRequestForm] = useState(buildRequestForm(null))
  const [requestBusy, setRequestBusy] = useState(false)
  const [busy, setBusy] = useState(false)

  const headers = useMemo(() => authHeaders(access), [access])
  const reducedMotion = useReducedMotion()
  const isSuspended = Boolean(profile?.is_suspended)
  const selectedListingIdRef = useRef(null)
  const filtersRef = useRef(filters)

  useEffect(() => {
    selectedListingIdRef.current = selectedListing?.id || null
  }, [selectedListing])

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const loadMarketplace = useCallback(async (nextFilters = filtersRef.current) => {
    setLoading(true)
    setMarketError('')
    try {
      const activeListingId = selectedListingIdRef.current
      const query = new URLSearchParams()
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value) query.set(key, value)
      })
      const suffix = query.toString() ? `?${query}` : ''
      const [categoryData, listingData] = await Promise.all([
        api('/market/categories/'),
        api(`/market/listings/${suffix}`, { headers }),
      ])
      setCategories(categoryData)
      setListings(listingData)
      if (activeListingId) {
        const refreshedListing = listingData.find((listing) => listing.id === activeListingId)
        setSelectedListing(refreshedListing || null)
      }
    } catch (error) {
      setMarketError(error.message)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [headers, setError])

  useEffect(() => {
    if (access) loadMarketplace()
  }, [access, loadMarketplace])

  useEffect(() => {
    if (!openCreateSignal) return
    setEditingListing(null)
    setSelectedListing(null)
    setShowForm(true)
  }, [openCreateSignal])

  useEffect(() => {
    if (selectedListing) setRequestForm(buildRequestForm(selectedListing))
  }, [selectedListing])

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

  async function confirmDeleteListing(listing) {
    setBusy(true)
    try {
      await api(`/market/listings/${listing.id}/`, { method: 'DELETE', headers })
      setNotice('Listing deleted.')
      setDeleteCandidate(null)
      if (selectedListing?.id === listing.id) setSelectedListing(null)
      await loadMarketplace()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function createTransactionRequest(listing) {
    setRequestBusy(true)
    setError('')
    try {
      const payload = {
        listing_id: listing.id,
        message: requestForm.message,
        meeting_location: requestForm.meeting_location,
        meeting_datetime: requestForm.meeting_datetime ? new Date(requestForm.meeting_datetime).toISOString() : '',
      }
      if (listing.listing_type === 'loan') {
        payload.requested_start_date = requestForm.requested_start_date
        payload.expected_return_date = requestForm.expected_return_date
      }
      await api('/market/transactions/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      })
      setNotice('Transaction request sent.')
      setSelectedListing(null)
      setRequestForm(buildRequestForm(listing))
      await loadMarketplace()
    } catch (error) {
      setError(error.message)
    } finally {
      setRequestBusy(false)
    }
  }

  const shownListings = mode === 'dashboard' ? listings.slice(0, 9) : listings

  return (
    <motion.section className="gc-marketplace-shell" {...pageTransition} transition={{ duration: reducedMotion ? 0 : 0.34 }}>
      <motion.div className="gc-section-header" {...motionProps(reducedMotion)}>
        <div>
          <h2>{mode === 'dashboard' ? 'Marketplace highlights' : 'Marketplace'}</h2>
          <p>Browse real listings from GreenCampus students.</p>
        </div>
        <button className="gc-btn gc-btn--primary" disabled={isSuspended} title={isSuspended ? 'Suspended accounts cannot create listings.' : ''} onClick={() => { setEditingListing(null); setShowForm(true) }}>Create listing</button>
      </motion.div>

      <ListingFilters
        filters={filters}
        categories={categories}
        onChange={changeFilter}
        onSubmit={(event) => { event.preventDefault(); loadMarketplace(filters) }}
        onReset={() => { setFilters(emptyFilters); loadMarketplace(emptyFilters) }}
      />

      <AnimatePresence>
        {showForm && (
          <ListingFormModal
            key={editingListing?.id || 'new-listing'}
            categories={categories}
            initialListing={editingListing}
            busy={busy}
            onCancel={() => { setShowForm(false); setEditingListing(null) }}
            onSubmit={saveListing}
          />
        )}
      </AnimatePresence>

      <ListingGrid
        listings={shownListings}
        loading={loading}
        error={marketError}
        onView={setSelectedListing}
      />

      <AnimatePresence>
        {selectedListing && (
          <ListingDetails
            listing={selectedListing}
            profile={profile}
            requestForm={requestForm}
            setRequestForm={setRequestForm}
            requestBusy={requestBusy}
            onClose={() => setSelectedListing(null)}
            onRequest={createTransactionRequest}
            onEdit={(listing) => { setEditingListing(listing); setShowForm(true); setSelectedListing(null) }}
            onDelete={setDeleteCandidate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteCandidate && (
          <ListingDeleteModal
            listing={deleteCandidate}
            busy={busy}
            onCancel={() => setDeleteCandidate(null)}
            onConfirm={() => confirmDeleteListing(deleteCandidate)}
          />
        )}
      </AnimatePresence>
    </motion.section>
  )
}

function MyListingsPage({ access, profile, setNotice, setError }) {
  const [categories, setCategories] = useState([])
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingListing, setEditingListing] = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [requestForm, setRequestForm] = useState(buildRequestForm(null))
  const [busy, setBusy] = useState(false)
  const headers = useMemo(() => authHeaders(access), [access])
  const reducedMotion = useReducedMotion()
  const isSuspended = Boolean(profile?.is_suspended)
  const selectedListingIdRef = useRef(null)

  useEffect(() => {
    selectedListingIdRef.current = selectedListing?.id || null
  }, [selectedListing])

  const loadListings = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const activeListingId = selectedListingIdRef.current
      const [categoryData, listingData] = await Promise.all([
        api('/market/categories/'),
        api('/market/listings/mine/', { headers }),
      ])
      setCategories(categoryData)
      setListings(listingData)
      if (activeListingId) {
        setSelectedListing(listingData.find((listing) => listing.id === activeListingId) || null)
      }
    } catch (error) {
      setPageError(error.message)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [headers, setError])

  useEffect(() => { loadListings() }, [loadListings])
  useEffect(() => {
    if (selectedListing) setRequestForm(buildRequestForm(selectedListing))
  }, [selectedListing])

  async function saveListing(payload) {
    setBusy(true)
    setError('')
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
      await api(path, { method, headers, body })
      setNotice(editingListing ? 'Listing updated.' : 'Listing created.')
      setShowForm(false)
      setEditingListing(null)
      await loadListings()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteListing(listing) {
    setBusy(true)
    try {
      await api(`/market/listings/${listing.id}/`, { method: 'DELETE', headers })
      setNotice('Listing deleted.')
      setDeleteCandidate(null)
      if (selectedListing?.id === listing.id) setSelectedListing(null)
      await loadListings()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section className="gc-marketplace-shell" {...pageTransition} transition={{ duration: reducedMotion ? 0 : 0.34 }}>
      <div className="gc-section-header">
        <div>
          <h2>My Listings</h2>
          <p>Create, update, hide, or delete the items you own.</p>
        </div>
        <button className="gc-btn gc-btn--primary" disabled={isSuspended} title={isSuspended ? 'Suspended accounts cannot create listings.' : ''} onClick={() => { setEditingListing(null); setSelectedListing(null); setShowForm(true) }}>Create listing</button>
      </div>

      {loading ? (
        <LoadingSkeleton label="Loading your listings..." />
      ) : pageError ? (
        <div className="gc-empty gc-empty--error">{pageError}</div>
      ) : (
        <MyListings
          listings={listings}
          onView={setSelectedListing}
          onEdit={(listing) => { setEditingListing(listing); setSelectedListing(null); setShowForm(true) }}
          onDelete={setDeleteCandidate}
        />
      )}

      <AnimatePresence>
        {showForm && (
          <ListingFormModal
            key={editingListing?.id || 'new-listing'}
            categories={categories}
            initialListing={editingListing}
            busy={busy}
            onCancel={() => { setShowForm(false); setEditingListing(null) }}
            onSubmit={saveListing}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedListing && (
          <ListingDetails
            listing={selectedListing}
            profile={profile}
            requestForm={requestForm}
            setRequestForm={setRequestForm}
            requestBusy={false}
            onClose={() => setSelectedListing(null)}
            onRequest={() => {}}
            onEdit={(listing) => { setEditingListing(listing); setShowForm(true); setSelectedListing(null) }}
            onDelete={setDeleteCandidate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteCandidate && (
          <ListingDeleteModal
            listing={deleteCandidate}
            busy={busy}
            onCancel={() => setDeleteCandidate(null)}
            onConfirm={() => confirmDeleteListing(deleteCandidate)}
          />
        )}
      </AnimatePresence>
    </motion.section>
  )
}

function TransactionMetricCard({ label, value, text, tone = 'neutral' }) {
  return (
    <article className={`gc-transaction-metric gc-transaction-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  )
}

function TransactionActivityList({ transactions }) {
  return (
    <section className="gc-panel gc-activity-panel">
      <div className="gc-section-header gc-section-header--compact">
        <div>
          <h2>Recent activity</h2>
          <p>The latest movement across your requests, meetings, and handoffs.</p>
        </div>
      </div>
      {!transactions.length ? (
        <CompactEmptyState title="No recent activity" text="Requests, meetings, and completed deals will appear here." />
      ) : (
        <div className="gc-activity-list">
          {transactions.slice(0, 6).map((transaction) => (
            <article className="gc-activity-item" key={transaction.id}>
              <div>
                <strong>{transaction.listing_title}</strong>
                <span>
                  {transaction.is_seller ? `Buyer: ${transaction.requester_name}` : `Seller: ${transaction.seller_name}`} - {formatDate(transaction.created_at)}
                </span>
              </div>
              <span className={`gc-badge ${badgeToneForTransactionStatus(transaction.status)}`}>{transaction.status_display || formatTokenLabel(transaction.status)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function TransactionAttentionList({ pendingRequests, overdueTransactions, unreadMessages, notifications }) {
  const attentionItems = [
    ...pendingRequests.slice(0, 3).map((transaction) => ({
      key: `pending-${transaction.id}`,
      title: transaction.listing_title,
      text: transaction.is_seller ? `Request from ${transaction.requester_name}` : `Waiting on ${transaction.seller_name}`,
      tone: 'gc-badge--warn',
      label: 'Pending',
    })),
    ...overdueTransactions.slice(0, 3).map((transaction) => ({
      key: `overdue-${transaction.id}`,
      title: transaction.listing_title,
      text: transaction.expected_return_date ? `Return due ${formatDate(transaction.expected_return_date)}` : 'Return is overdue',
      tone: 'gc-badge--danger',
      label: 'Overdue',
    })),
    ...unreadMessages.slice(0, 3).map((message) => ({
      key: `message-${message.id}`,
      title: message.listing_title,
      text: `Message from ${message.sender_name}`,
      tone: 'gc-badge--active',
      label: 'Unread',
    })),
    ...notifications.slice(0, 2).map((notification) => ({
      key: `notice-${notification.id}`,
      title: notification.listing_title || 'Account notice',
      text: notification.message,
      tone: notification.severity === 'danger' ? 'gc-badge--danger' : 'gc-badge--warn',
      label: notification.severity || 'Notice',
    })),
  ]

  return (
    <section className="gc-panel gc-attention-panel">
      <div className="gc-section-header gc-section-header--compact">
        <div>
          <h2>Needs attention</h2>
          <p>Small queue of things worth checking first.</p>
        </div>
      </div>
      {!attentionItems.length ? (
        <CompactEmptyState title="All clear" text="No pending requests, overdue items, or unread contact requests right now." />
      ) : (
        <div className="gc-attention-list">
          {attentionItems.map((item) => (
            <article className="gc-attention-item" key={item.key}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
              <span className={`gc-badge ${item.tone}`}>{item.label}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function TransactionsInboxPanel({ receivedMessages, sentMessages, notifications, replyById, setReplyById, onReply, replyBusy }) {
  return (
    <div className="gc-transaction-inbox-grid">
      <NotificationList notifications={notifications} />
      <div className="gc-message-columns">
        <MessageList title="Received contact requests" messages={receivedMessages} replyById={replyById} setReplyById={setReplyById} onReply={onReply} replyBusy={replyBusy} allowReply />
        <MessageList title="Sent contact requests" messages={sentMessages} />
      </div>
    </div>
  )
}

function TransactionHubPage({ access, profile, setNotice, setError }) {
  const [sentTransactions, setSentTransactions] = useState([])
  const [receivedTransactions, setReceivedTransactions] = useState([])
  const [receivedMessages, setReceivedMessages] = useState([])
  const [sentMessages, setSentMessages] = useState([])
  const [notifications, setNotifications] = useState([])
  const [replyById, setReplyById] = useState({})
  const [replyBusy, setReplyBusy] = useState(false)
  const [formsById, setFormsById] = useState({})
  const [busyKey, setBusyKey] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const headers = useMemo(() => authHeaders(access), [access])
  const reducedMotion = useReducedMotion()

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const [sentData, receivedData] = await Promise.all([
        api('/market/transactions/sent/', { headers }),
        api('/market/transactions/received/', { headers }),
      ])
      setSentTransactions(sentData)
      setReceivedTransactions(receivedData)

      const [receivedMessageData, sentMessageData, notificationData] = await Promise.all([
        api('/market/messages/?box=received', { headers }).catch(() => []),
        api('/market/messages/?box=sent', { headers }).catch(() => []),
        api('/market/notifications/', { headers }).catch(() => []),
      ])
      setReceivedMessages(receivedMessageData)
      setSentMessages(sentMessageData)
      setNotifications(notificationData)
    } catch (error) {
      setPageError(error.message)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [headers, setError])

  useEffect(() => { loadTransactions() }, [loadTransactions])

  async function runTransactionAction(transaction, action, payload = {}) {
    const endpointMap = {
      accept: 'accept',
      reject: 'reject',
      cancel: 'cancel',
      meeting: 'meeting',
      handover: 'handover',
      return: 'return',
      sold: 'sold',
      complete: 'complete',
    }
    const endpoint = endpointMap[action]
    if (!endpoint) return

    setBusyKey(`${transaction.id}-${action}`)
    setError('')
    try {
      await api(`/market/transactions/${transaction.id}/${endpoint}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      })
      setNotice('Transaction updated.')
      await loadTransactions()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusyKey('')
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
      setReplyById((current) => ({ ...current, [message.id]: '' }))
      await loadTransactions()
    } catch (error) {
      setError(error.message)
    } finally {
      setReplyBusy(false)
    }
  }

  const summary = useMemo(
    () => buildTransactionSummary(sentTransactions, receivedTransactions),
    [sentTransactions, receivedTransactions],
  )
  const allTransactions = useMemo(
    () => uniqueTransactions([...sentTransactions, ...receivedTransactions]),
    [receivedTransactions, sentTransactions],
  )
  const sortedTransactions = useMemo(() => (
    [...allTransactions].sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))
  ), [allTransactions])

  const openStatuses = ['pending', 'accepted', 'meeting_scheduled', 'handed_over', 'active_loan', 'overdue']
  const finalStatuses = ['completed', 'sold', 'returned']
  const closedStatuses = ['cancelled', 'rejected']
  const loanTransactions = allTransactions.filter((transaction) => transaction.transaction_type === 'loan')
  const activeLoans = loanTransactions.filter((transaction) => ['active_loan', 'overdue', 'handed_over'].includes(transaction.status))
  const borrowedLoans = loanTransactions.filter((transaction) => transaction.is_requester)
  const loanedLoans = loanTransactions.filter((transaction) => transaction.is_seller)
  const pendingRequests = allTransactions.filter((transaction) => transaction.status === 'pending')
  const upcomingMeetings = allTransactions.filter((transaction) => transaction.meeting_datetime && openStatuses.includes(transaction.status))
  const needsScheduling = allTransactions.filter((transaction) => ['accepted', 'handed_over'].includes(transaction.status) && !transaction.meeting_datetime)
  const overdueTransactions = allTransactions.filter((transaction) => transaction.status === 'overdue')
  const completedTransactions = allTransactions.filter((transaction) => finalStatuses.includes(transaction.status))
  const historyTransactions = sortedTransactions.filter((transaction) => finalStatuses.includes(transaction.status) || closedStatuses.includes(transaction.status))
  const unreadMessages = receivedMessages.filter((message) => ['sent', 'pending', 'unread'].includes(message.status))

  const tabs = [
    ['overview', 'Overview', allTransactions.length],
    ['buying', 'Buying', summary.buyer.requests.length],
    ['selling', 'Selling', summary.seller.incoming.length],
    ['loans', 'Loans', loanTransactions.length],
    ['meetings', 'Meetings', upcomingMeetings.length + needsScheduling.length],
    ['inbox', 'Inbox', receivedMessages.length + sentMessages.length + notifications.length],
    ['history', 'History', historyTransactions.length],
    ['overdue', 'Overdue', overdueTransactions.length],
  ]

  const summaryCards = [
    ['Pending requests', pendingRequests.length, 'Buying and selling requests waiting for a decision.', 'warn'],
    ['Active loans', activeLoans.length, 'Borrowed or loaned items that are still open.', 'active'],
    ['Upcoming meetings', upcomingMeetings.length, 'Scheduled campus rendez-vous for handoffs.', 'neutral'],
    ['Overdue items', overdueTransactions.length, 'Loans that need urgent attention.', 'danger'],
    ['Completed deals', completedTransactions.length, 'Finished sales, exchanges, donations, and returns.', 'active'],
    ['Unread messages', unreadMessages.length, 'Contact requests waiting for a reply.', 'neutral'],
  ]

  function renderTab() {
    if (activeTab === 'buying') {
      return (
        <TransactionSection
          title="Requests I sent"
          description="Everything you asked to buy, borrow, exchange, or receive."
          transactions={summary.buyer.requests}
          emptyMessage="No buying requests yet"
          profile={profile}
          formsById={formsById}
          setFormsById={setFormsById}
          busyKey={busyKey}
          onAction={runTransactionAction}
        />
      )
    }

    if (activeTab === 'selling') {
      return (
        <TransactionSection
          title="Requests received"
          description="Requests from students on listings you own. Accept, reject, or schedule a meeting."
          transactions={summary.seller.incoming}
          emptyMessage="No received requests yet"
          profile={profile}
          formsById={formsById}
          setFormsById={setFormsById}
          busyKey={busyKey}
          onAction={runTransactionAction}
        />
      )
    }

    if (activeTab === 'loans') {
      return (
        <div className="gc-transaction-split">
          <TransactionSection
            title="Items I borrowed"
            description="Loan/rent items tied to requests you sent."
            transactions={borrowedLoans}
            emptyMessage="No borrowed items"
            profile={profile}
            formsById={formsById}
            setFormsById={setFormsById}
            busyKey={busyKey}
            onAction={runTransactionAction}
          />
          <TransactionSection
            title="Items I loaned"
            description="Loan/rent items handed over from your listings."
            transactions={loanedLoans}
            emptyMessage="No loaned items"
            profile={profile}
            formsById={formsById}
            setFormsById={setFormsById}
            busyKey={busyKey}
            onAction={runTransactionAction}
          />
        </div>
      )
    }

    if (activeTab === 'meetings') {
      return (
        <div className="gc-transaction-split">
          <TransactionSection
            title="Upcoming rendez-vous"
            description="Scheduled campus meetings with a date, time, and location."
            transactions={upcomingMeetings}
            emptyMessage="No scheduled meetings"
            profile={profile}
            formsById={formsById}
            setFormsById={setFormsById}
            busyKey={busyKey}
            onAction={runTransactionAction}
          />
          <TransactionSection
            title="Needs scheduling"
            description="Accepted requests still waiting for a meeting plan."
            transactions={needsScheduling}
            emptyMessage="No meetings to schedule"
            profile={profile}
            formsById={formsById}
            setFormsById={setFormsById}
            busyKey={busyKey}
            onAction={runTransactionAction}
          />
        </div>
      )
    }

    if (activeTab === 'inbox') {
      return (
        <TransactionsInboxPanel
          receivedMessages={receivedMessages}
          sentMessages={sentMessages}
          notifications={notifications}
          replyById={replyById}
          setReplyById={setReplyById}
          onReply={replyToMessage}
          replyBusy={replyBusy}
        />
      )
    }

    if (activeTab === 'history') {
      return (
        <TransactionSection
          title="Completed and closed"
          description="Sold, returned, donated, exchanged, rejected, or cancelled transactions."
          transactions={historyTransactions}
          emptyMessage="No completed history yet"
          profile={profile}
          formsById={formsById}
          setFormsById={setFormsById}
          busyKey={busyKey}
          onAction={runTransactionAction}
        />
      )
    }

    if (activeTab === 'overdue') {
      return (
        <div className="gc-transaction-split">
          <TransactionSection
            title="Overdue items"
            description="Items that should already have been returned."
            transactions={overdueTransactions}
            emptyMessage="No overdue items"
            profile={profile}
            formsById={formsById}
            setFormsById={setFormsById}
            busyKey={busyKey}
            onAction={runTransactionAction}
          />
          <section className="gc-panel gc-overdue-guide">
            <div className="gc-section-header gc-section-header--compact">
              <div>
                <h2>Overdue guidance</h2>
                <p>Return borrowed items quickly to keep your account healthy.</p>
              </div>
            </div>
            <NotificationList notifications={notifications.filter((notification) => notification.type === 'overdue' || notification.severity === 'danger')} />
          </section>
        </div>
      )
    }

    return (
      <>
        <div className="gc-transaction-overview-grid">
          {summaryCards.map(([label, value, text, tone]) => (
            <TransactionMetricCard key={label} label={label} value={value} text={text} tone={tone} />
          ))}
        </div>
        <div className="gc-transaction-split">
          <TransactionActivityList transactions={sortedTransactions} />
          <TransactionAttentionList pendingRequests={pendingRequests} overdueTransactions={overdueTransactions} unreadMessages={unreadMessages} notifications={notifications} />
        </div>
      </>
    )
  }

  return (
    <motion.section className="gc-marketplace-shell gc-hub-page gc-transactions-page" {...pageTransition} transition={{ duration: reducedMotion ? 0 : 0.34 }}>
      <div className="gc-section-header gc-transactions-header">
        <div>
          <span className="gc-eyebrow gc-eyebrow--dark">Marketplace operations</span>
          <h2>Transactions</h2>
          <p>Manage buying, selling, loans, meetings, inbox, history, and overdue items from one clean workspace.</p>
        </div>
        <button className="gc-btn gc-btn--outline" type="button" onClick={loadTransactions}>Refresh</button>
      </div>

      {profile?.overdue_count > 0 && (
        <div className="gc-inline-warning">
          <strong>Overdue history: {profile.overdue_count}</strong>
          <span>Return active loans on time to keep your account clear.</span>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton label="Loading transactions..." />
      ) : pageError ? (
        <div className="gc-empty gc-empty--error">{pageError}</div>
      ) : (
        <>
          <div className="gc-transaction-tabs" role="tablist" aria-label="Transaction sections">
            {tabs.map(([key, label, count]) => (
              <button
                className={`gc-transaction-tab${activeTab === key ? ' gc-transaction-tab--active' : ''}`}
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              className="gc-transaction-tab-panel"
              key={activeTab}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
            >
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </motion.section>
  )
}
function DashboardNotifications({ access, setError }) {
  const [notifications, setNotifications] = useState([])
  const headers = useMemo(() => authHeaders(access), [access])

  useEffect(() => {
    if (!access) return
    let active = true
    api('/market/notifications/', { headers })
      .then((data) => { if (active) setNotifications(data) })
      .catch((error) => { if (active) setError(error.message) })
    return () => { active = false }
  }, [access, headers, setError])

  if (!notifications.length) return null
  return <NotificationList notifications={notifications} compact />
}

function DashboardPage({ access, profile, setNotice, setError }) {
  const [createSignal, setCreateSignal] = useState(0)
  const reducedMotion = useReducedMotion()

  return (
    <motion.div className="gc-dashboard-page" {...pageTransition} transition={{ duration: reducedMotion ? 0 : 0.34 }}>
      <DashboardNotifications access={access} setError={setError} />
      <DashboardHero profile={profile} onCreate={() => setCreateSignal((current) => current + 1)} />
      <MarketplaceSection access={access} profile={profile} mode="dashboard" openCreateSignal={createSignal} setNotice={setNotice} setError={setError} />
    </motion.div>
  )
}

function AdminUserActionsMenu({ user, profile, adminAccountCount, busy, onAction }) {
  const [open, setOpen] = useState(false)
  const isTargetAdmin = isAdminAccount(user)
  const isSelf = user.email === profile?.email
  const canDelete = !isSelf && !(isTargetAdmin && adminAccountCount <= 1) && !(isTargetAdmin && !profile?.is_superuser)
  const lockedModeration = Boolean(busy || isTargetAdmin)
  const actions = [
    user.is_suspended ? 'unsuspend' : 'suspend',
    user.is_blacklisted ? 'unblacklist' : 'blacklist',
    user.can_contact ? 'disable_contact' : 'enable_contact',
    user.is_active ? 'deactivate' : null,
    'delete',
  ].filter(Boolean)

  function choose(action) {
    setOpen(false)
    onAction(user, action)
  }

  return (
    <div className="gc-admin-action-menu">
      <button className="gc-btn gc-btn--outline gc-btn--compact gc-admin-menu-trigger" type="button" disabled={busy} onClick={() => setOpen((current) => !current)}>
        More actions
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="gc-admin-action-popover"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            {actions.map((action) => {
              const deleteDisabled = action === 'delete' && !canDelete
              const moderationDisabled = action !== 'delete' && lockedModeration
              const disabled = Boolean(deleteDisabled || moderationDisabled)
              const label = adminActionLabels[action] || action
              return (
                <button
                  className={`gc-admin-action-option gc-admin-action-option--${adminActionTone(action)}`}
                  type="button"
                  key={action}
                  disabled={disabled}
                  onClick={() => choose(action)}
                >
                  <span>{label}</span>
                  {disabled && (
                    <small>
                      {action === 'delete'
                        ? (isSelf ? 'Self-delete blocked' : isTargetAdmin ? 'Admin deletion protected' : 'Unavailable')
                        : 'Admin accounts protected'}
                    </small>
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AdminActionModal({ user, action, busy, onCancel, onConfirm }) {
  const reducedMotion = useReducedMotion()
  const details = adminActionDetails[action] || adminActionDetails.deactivate
  const [reason, setReason] = useState(details.defaultReason || '')
  const [suspensionUntil, setSuspensionUntil] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    setReason(details.defaultReason || '')
    setSuspensionUntil('')
    setLocalError('')
  }, [action, details.defaultReason])

  function submit(event) {
    event.preventDefault()
    const trimmedReason = reason.trim()
    if (details.requiresReason && !trimmedReason) {
      setLocalError('Please provide a clear moderation reason before continuing.')
      return
    }
    const payload = action === 'delete'
      ? {}
      : {
          action,
          reason: trimmedReason || details.defaultReason || `Admin action: ${adminActionLabels[action] || action}`,
        }
    if (action === 'suspend' && suspensionUntil) {
      payload.suspension_until = buildSuspensionUntil(suspensionUntil)
    }
    onConfirm(user, action, payload)
  }

  return (
    <motion.div className="gc-modal-backdrop gc-admin-action-backdrop" onClick={busy ? undefined : onCancel} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
      <motion.article className={`gc-admin-action-modal gc-admin-action-modal--${details.tone}`} onClick={(event) => event.stopPropagation()} initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
        <button className="gc-modal-close" onClick={onCancel} disabled={busy} aria-label="Close">x</button>
        <div className="gc-admin-action-modal-head">
          <span className="gc-admin-action-icon" aria-hidden="true">{details.icon}</span>
          <div>
            <span className={`gc-badge gc-admin-action-badge gc-admin-action-badge--${details.tone}`}>{details.badge}</span>
            <h2>{details.title}</h2>
            <p>{details.tone === 'danger' ? 'Review this carefully before applying the change.' : 'Confirm the account update before saving it.'}</p>
          </div>
        </div>

        <div className="gc-admin-action-user">
          <span className="gc-profile-avatar gc-profile-avatar--small">{initials(user)}</span>
          <div>
            <strong>{user.username || 'Unnamed user'}</strong>
            <small>{user.email}</small>
          </div>
          <span className={`gc-badge ${isAdminAccount(user) ? 'gc-badge--admin' : 'gc-badge--active'}`}>{isAdminAccount(user) ? 'Admin' : 'Student'}</span>
        </div>

        <div className="gc-admin-impact-box">
          <strong>Impact</strong>
          <ul>
            {details.impact.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <form className="gc-admin-action-form" onSubmit={submit}>
          {action !== 'delete' && (
            <TextareaField
              label={details.reasonLabel || 'Admin note'}
              rows={3}
              value={reason}
              onChange={(event) => { setReason(event.target.value); setLocalError('') }}
              placeholder={details.reasonPlaceholder || 'Optional admin note.'}
              required={details.requiresReason}
            />
          )}
          {details.allowsDuration && (
            <label className="gc-field">
              <span className="gc-label">Optional suspension end</span>
              <input className="gc-input" type="datetime-local" value={suspensionUntil} onChange={(event) => setSuspensionUntil(event.target.value)} />
            </label>
          )}
          {localError && <p className="gc-field-error">{localError}</p>}
          <div className="gc-card-actions gc-admin-action-modal-actions">
            <button className={`gc-btn ${adminActionButtonClass(action)}`} type="submit" disabled={busy}>
              {busy ? <span className="gc-button-loading">Saving...</span> : details.confirmLabel}
            </button>
            <button className="gc-btn gc-btn--outline" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </motion.article>
    </motion.div>
  )
}

function AdminPage({ access, profile, setNotice, setError }) {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [transactionFilters, setTransactionFilters] = useState(adminTransactionFilterDefaults)
  const [transactionFormsById, setTransactionFormsById] = useState({})
  const [transactionBusy, setTransactionBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [resolveCandidate, setResolveCandidate] = useState(null)
  const [userFilters, setUserFilters] = useState({ search: '', status: 'all' })
  const reducedMotion = useReducedMotion()

  const loadAdminData = useCallback(async (nextFilters = adminTransactionFilterDefaults) => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (!value || key === 'overdueOnly') return
        query.set(key, value)
      })
      const transactionPath = nextFilters.overdueOnly
        ? `/market/admin/transactions/overdue/${query.toString() ? `?${query}` : ''}`
        : `/market/admin/transactions/${query.toString() ? `?${query}` : ''}`
      const [nextStats, nextUsers, nextTransactions] = await Promise.all([
        api('/users/admin/stats/', { headers: authHeaders(access) }),
        api('/users/admin/users/', { headers: authHeaders(access) }),
        api(transactionPath, { headers: authHeaders(access) }),
      ])
      setStats(nextStats)
      setUsers(nextUsers)
      setTransactions(nextTransactions)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [access, setError])

  useEffect(() => { loadAdminData(adminTransactionFilterDefaults) }, [access, loadAdminData])

  function openUserAction(user, action) {
    const adminAccountCount = users.filter(isAdminAccount).length
    const targetIsAdmin = isAdminAccount(user)

    if (action !== 'delete' && targetIsAdmin) {
      setError('Admin accounts cannot be moderated from this table.')
      return
    }

    if (action === 'delete' && user.email === profile?.email) {
      setError('You cannot delete your own admin account.')
      return
    }

    if (action === 'delete' && targetIsAdmin && adminAccountCount <= 1) {
      setError('Cannot delete the last admin or superuser account.')
      return
    }

    if (action === 'delete' && targetIsAdmin && !profile?.is_superuser) {
      setError('Only a superuser can delete another admin account.')
      return
    }

    setPendingAction({ user, action })
  }

  async function confirmUserAction(user, action, payload = {}) {
    setActionBusy(`${user.id}-${action}`)
    try {
      const result = action === 'delete'
        ? await api(`/users/admin/users/${user.id}/delete/`, {
            method: 'DELETE',
            headers: authHeaders(access),
          })
        : await api(`/users/admin/users/${user.id}/moderation/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders(access) },
            body: JSON.stringify(payload),
          })
      setNotice(result.detail || `${adminActionLabels[action] || action} completed.`)
      await loadAdminData()
      setPendingAction(null)
    } catch (error) {
      setError(error.message)
    } finally {
      setActionBusy('')
    }
  }

  async function runAdminTransactionAction(transaction, action, payload = {}) {
    const endpointMap = {
      accept: 'accept',
      reject: 'reject',
      cancel: 'cancel',
      meeting: 'meeting',
      handover: 'handover',
      return: 'return',
      sold: 'sold',
      complete: 'complete',
    }
    const endpoint = endpointMap[action]
    if (!endpoint) return

    setTransactionBusy(`${transaction.id}-${action}`)
    try {
      await api(`/market/transactions/${transaction.id}/${endpoint}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(access) },
        body: JSON.stringify(payload),
      })
      setNotice('Transaction updated.')
      await loadAdminData()
    } catch (error) {
      setError(error.message)
    } finally {
      setTransactionBusy('')
    }
  }

  async function resolveTransaction(note) {
    if (!resolveCandidate) return
    setTransactionBusy(`${resolveCandidate.id}-resolve`)
    try {
      await api(`/market/admin/transactions/${resolveCandidate.id}/resolve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(access) },
        body: JSON.stringify({ resolution_note: note }),
      })
      setResolveCandidate(null)
      setNotice('Transaction resolution saved.')
      await loadAdminData()
    } catch (error) {
      setError(error.message)
    } finally {
      setTransactionBusy('')
    }
  }

  const userStatusData = stats?.chart_status || []
  const verificationData = stats?.chart_verification || []
  const usersOverTime = stats?.chart_total_users_over_time || []
  const newUsersByDay = stats?.chart_new_users_by_day || []
  const newUsersByWeek = stats?.chart_new_users_by_week || []
  const usersByFiliere = stats?.chart_users_by_filiere || []
  const listingsByCategory = stats?.chart_listings_by_category || []
  const listingsByStatus = stats?.chart_listings_by_status || []
  const messagesOverTime = stats?.chart_contact_messages_over_time || []
  const adminAccountCount = users.filter(isAdminAccount).length
  const filteredUsers = users.filter((user) => {
    const search = userFilters.search.trim().toLowerCase()
    const matchesSearch = !search || [
      user.username,
      user.email,
      user.filiere,
      user.suspension_reason,
      user.blacklist_reason,
    ].some((value) => String(value || '').toLowerCase().includes(search))

    const status = userFilters.status
    const matchesStatus = status === 'all'
      || (status === 'active' && user.is_active && !user.is_suspended && !user.is_blacklisted)
      || (status === 'inactive' && !user.is_active)
      || (status === 'suspended' && user.is_suspended)
      || (status === 'blacklisted' && user.is_blacklisted)
      || (status === 'no_contact' && !user.can_contact)
      || (status === 'admin' && isAdminAccount(user))
      || (status === 'overdue' && user.overdue_count > 0)

    return matchesSearch && matchesStatus
  })

  return (
    <motion.section className="gc-panel" {...pageTransition} transition={{ duration: reducedMotion ? 0 : 0.34 }}>
      <div className="gc-section-header gc-admin-hero">
        <div>
          <h2>Admin analytics</h2>
          <p>Real-time GreenCampus health metrics from the Django backend.</p>
        </div>
      </div>
      <motion.div className="gc-admin-summary" initial={reducedMotion ? false : 'hidden'} animate="visible" variants={staggerContainer}>
        {[
          ['Total users', stats?.total_users ?? '-'],
          ['Active', stats?.active_users ?? '-'],
          ['Verified', stats?.verified_users ?? '-'],
          ['Listings', stats?.total_listings ?? '-'],
          ['Messages', stats?.total_messages ?? '-'],
          ['Transactions', stats?.total_transactions ?? '-'],
          ['Active loans', stats?.active_loans ?? '-'],
          ['Overdue loans', stats?.overdue_transactions ?? '-'],
          ['Meetings', stats?.meetings_scheduled ?? '-'],
          ['Completed deals', stats?.completed_transactions ?? '-'],
          ['Suspended', stats?.suspended_users ?? '-'],
          ['Blacklisted', stats?.blacklisted_users ?? '-'],
        ].map(([label, value], index) => (
          <motion.span key={label} {...cardMotionProps(reducedMotion, index)}>{label}: {value}</motion.span>
        ))}
      </motion.div>

      <div className="gc-chart-grid">
        <ChartCard
          title="Total users over time"
          description="Cumulative registered users during the last 14 days."
          data={usersOverTime}
          loading={loading}
          option={lineChartOption(usersOverTime, 'Total users', '#126b38')}
        />
        <ChartCard
          title="New users by day"
          description="Daily account creation volume."
          data={newUsersByDay}
          loading={loading}
          option={lineChartOption(newUsersByDay, 'New users', '#18a957')}
        />
        <ChartCard
          title="New users by week"
          description="Weekly signup trend for the last 8 weeks."
          data={newUsersByWeek}
          loading={loading}
          option={barChartOption(newUsersByWeek, 'New users')}
        />
        <ChartCard
          title="Active vs moderated users"
          description="Current account moderation state."
          data={userStatusData}
          loading={loading}
          option={pieChartOption(userStatusData, 'User status')}
        />
        <ChartCard
          title="Verified vs unverified"
          description="Email verification coverage."
          data={verificationData}
          loading={loading}
          option={pieChartOption(verificationData, 'Verification')}
        />
        <ChartCard
          title="Users by filiere"
          description="Student department distribution."
          data={usersByFiliere}
          loading={loading}
          option={barChartOption(usersByFiliere, 'Users', true)}
        />
        <ChartCard
          title="Listings by category"
          description="Marketplace supply by category."
          data={listingsByCategory}
          loading={loading}
          option={barChartOption(listingsByCategory, 'Listings', true)}
        />
        <ChartCard
          title="Listings by status"
          description="Available, reserved, sold, and hidden listings."
          data={listingsByStatus}
          loading={loading}
          option={pieChartOption(listingsByStatus, 'Listing status')}
        />
        <ChartCard
          title="Contact messages over time"
          description="Buyer-seller contact activity during the last 14 days."
          data={messagesOverTime}
          loading={loading}
          option={lineChartOption(messagesOverTime, 'Messages', '#2367a6')}
        />
      </div>

      <motion.section className="gc-panel gc-admin-transaction-panel" {...motionProps(reducedMotion)}>
        <div className="gc-section-header">
          <div>
            <h2>Transaction oversight</h2>
            <p>Search marketplace requests, loans, meetings, and overdue cases.</p>
          </div>
        </div>
        <form
          className="gc-admin-transaction-filters"
          onSubmit={(event) => {
            event.preventDefault()
            loadAdminData(transactionFilters)
          }}
        >
          <input
            className="gc-input"
            placeholder="Search username, email, or listing title"
            value={transactionFilters.search}
            onChange={(event) => setTransactionFilters((current) => ({ ...current, search: event.target.value }))}
          />
          <select className="gc-input" value={transactionFilters.transaction_type} onChange={(event) => setTransactionFilters((current) => ({ ...current, transaction_type: event.target.value }))}>
            <option value="">All types</option>
            <option value="sale">Sale</option>
            <option value="loan">Loan / rent</option>
            <option value="exchange">Exchange</option>
            <option value="donate">Donate</option>
          </select>
          <select className="gc-input" value={transactionFilters.status} onChange={(event) => setTransactionFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="meeting_scheduled">Meeting scheduled</option>
            <option value="active_loan">Active loan</option>
            <option value="overdue">Overdue</option>
            <option value="sold">Sold</option>
            <option value="completed">Completed</option>
            <option value="returned">Returned</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="gc-input" value={transactionFilters.meeting_status} onChange={(event) => setTransactionFilters((current) => ({ ...current, meeting_status: event.target.value }))}>
            <option value="">All meeting states</option>
            <option value="proposed">Proposed</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Field label="Date from" type="date" value={transactionFilters.date_from} onChange={(event) => setTransactionFilters((current) => ({ ...current, date_from: event.target.value }))} />
          <Field label="Date to" type="date" value={transactionFilters.date_to} onChange={(event) => setTransactionFilters((current) => ({ ...current, date_to: event.target.value }))} />
          <label className="gc-checkbox-field">
            <input type="checkbox" checked={transactionFilters.overdueOnly} onChange={(event) => setTransactionFilters((current) => ({ ...current, overdueOnly: event.target.checked }))} />
            <span>Only overdue loans</span>
          </label>
          <div className="gc-card-actions">
            <button className="gc-btn gc-btn--primary" type="submit">Apply</button>
            <button
              className="gc-btn gc-btn--outline"
              type="button"
              onClick={() => {
                setTransactionFilters(adminTransactionFilterDefaults)
                loadAdminData(adminTransactionFilterDefaults)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        {loading ? (
          <LoadingSkeleton label="Loading transactions..." />
        ) : transactions.length ? (
          <div className="gc-transaction-list">
            {transactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                profile={profile}
                formsById={transactionFormsById}
                setFormsById={setTransactionFormsById}
                busyKey={transactionBusy}
                onAction={runAdminTransactionAction}
                adminMode
                onResolve={setResolveCandidate}
              />
            ))}
          </div>
        ) : (
          <div className="gc-empty">No transactions match the current filters.</div>
        )}
      </motion.section>

      <motion.section className="gc-panel gc-admin-moderation-panel" {...motionProps(reducedMotion)}>
        <div className="gc-section-header gc-admin-table-head">
          <div>
            <h2>User moderation</h2>
            <p>Search accounts, review trust signals, and apply protected moderation actions.</p>
          </div>
          <span className="gc-badge gc-badge--admin">{filteredUsers.length} shown</span>
        </div>

        <form className="gc-admin-user-filters" onSubmit={(event) => event.preventDefault()}>
          <input
            className="gc-input"
            placeholder="Search username, email, filiere, or reason"
            value={userFilters.search}
            onChange={(event) => setUserFilters((current) => ({ ...current, search: event.target.value }))}
          />
          <select className="gc-input" value={userFilters.status} onChange={(event) => setUserFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="all">All users</option>
            <option value="active">Active and clear</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="blacklisted">Blacklisted</option>
            <option value="no_contact">Contact disabled</option>
            <option value="overdue">Overdue history</option>
            <option value="admin">Admins</option>
          </select>
          <button className="gc-btn gc-btn--outline" type="button" onClick={() => setUserFilters({ search: '', status: 'all' })}>Reset</button>
        </form>

        <motion.div className="gc-admin-user-table gc-admin-user-table--compact" initial={reducedMotion ? false : 'hidden'} animate="visible" variants={staggerContainer}>
          <div className="gc-admin-user-row gc-admin-user-row--head">
            <span>User</span>
            <span>Status</span>
            <span>Details</span>
            <span>Actions</span>
          </div>
          {loading ? (
            <LoadingSkeleton label="Loading users..." />
          ) : filteredUsers.length ? filteredUsers.map((user, index) => {
            const role = isAdminAccount(user) ? (user.is_superuser ? 'Superuser' : 'Admin') : 'Student'
            const statusClass = isAdminAccount(user) ? 'gc-badge--admin' : 'gc-badge--active'

            return (
              <motion.div className="gc-admin-user-row" key={user.id} {...cardMotionProps(reducedMotion, index)}>
                <div className="gc-admin-user-identity">
                  <span className="gc-profile-avatar gc-profile-avatar--small">{initials(user)}</span>
                  <div className="gc-admin-user-main">
                    <strong>{user.username || 'Unnamed user'}</strong>
                    <span>{user.email}</span>
                    <small>{user.filiere || 'No filiere'} - Joined {formatDate(user.date_joined)}</small>
                  </div>
                </div>
                <div className="gc-admin-status-stack">
                  <span className={`gc-badge ${statusClass}`}>{role}</span>
                  <span className={`gc-badge ${user.is_active ? 'gc-badge--active' : 'gc-badge--danger'}`}>{user.is_active ? 'Active' : 'Inactive'}</span>
                  <span className={`gc-badge ${user.is_suspended ? 'gc-badge--warn' : 'gc-badge--active'}`}>{user.is_suspended ? 'Suspended' : 'Not suspended'}</span>
                  <span className={`gc-badge ${user.is_blacklisted ? 'gc-badge--danger' : 'gc-badge--active'}`}>{user.is_blacklisted ? 'Blacklisted' : 'Not blacklisted'}</span>
                  <span className={`gc-badge ${user.can_contact ? 'gc-badge--active' : 'gc-badge--warn'}`}>{user.can_contact ? 'Contact on' : 'Contact off'}</span>
                </div>
                <div className="gc-admin-user-meta">
                  {user.overdue_count > 0 && <span className="gc-admin-meta-warning">Overdue count: {user.overdue_count}</span>}
                  {user.suspension_until && <span>Suspended until {formatDateTime(user.suspension_until)}</span>}
                  {user.suspension_reason && <span>Suspension: {user.suspension_reason}</span>}
                  {user.blacklist_reason && <span>Blacklist: {user.blacklist_reason}</span>}
                  {!user.overdue_count && !user.suspension_reason && !user.blacklist_reason && <span>No moderation notes.</span>}
                </div>
                <AdminUserActionsMenu
                  user={user}
                  profile={profile}
                  adminAccountCount={adminAccountCount}
                  busy={Boolean(actionBusy)}
                  onAction={openUserAction}
                />
              </motion.div>
            )
          }) : (
            <CompactEmptyState title="No users match these filters" text="Try clearing the search or choosing a different moderation status." />
          )}
        </motion.div>
      </motion.section>

      <AnimatePresence>
        {pendingAction && (
          <AdminActionModal
            key={`${pendingAction.user.id}-${pendingAction.action}`}
            user={pendingAction.user}
            action={pendingAction.action}
            busy={actionBusy === `${pendingAction.user.id}-${pendingAction.action}`}
            onCancel={() => setPendingAction(null)}
            onConfirm={confirmUserAction}
          />
        )}
      </AnimatePresence>      <AnimatePresence>
        {resolveCandidate && (
          <AdminResolveModal
            transaction={resolveCandidate}
            busy={transactionBusy === `${resolveCandidate.id}-resolve`}
            onCancel={() => setResolveCandidate(null)}
            onResolve={resolveTransaction}
          />
        )}
      </AnimatePresence>
    </motion.section>
  )
}

export default function App() {
  const [page, setPage] = useState(window.location.hash.slice(1) || 'home')
  const [tokens, setTokens] = useState(savedTokens)
  const [profile, setProfile] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)

  const loggedIn = Boolean(tokens.access)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return undefined

    const lenis = new Lenis({
      duration: 0.95,
      smoothWheel: true,
      wheelMultiplier: 0.9,
    })
    let rafId = 0
    const raf = (time) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [reducedMotion])

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

  async function saveProfile(form) {
    setProfileBusy(true)
    setError('')
    try {
      const data = await api('/users/profile/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(tokens.access) },
        body: JSON.stringify(form),
      })
      setProfile(data)
      setNotice('Profile saved.')
      return data
    } catch (saveError) {
      setError(saveError.message)
      throw saveError
    } finally {
      setProfileBusy(false)
    }
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
  const legacyTransactionPages = ['seller-hub', 'buyer-hub', 'loans', 'meetings', 'inbox']
  if (loggedIn && legacyTransactionPages.includes(activePage)) activePage = 'transactions'
  const authenticatedPages = ['dashboard', 'marketplace', 'my-listings', 'transactions', 'admin']
  if (loggedIn && !authenticatedPages.includes(activePage)) activePage = 'dashboard'
  if (activePage === 'admin' && !profile?.is_staff) activePage = loggedIn ? 'dashboard' : 'login'

  return (
    <div className="gc-app">
      <Navbar
        page={activePage}
        loggedIn={loggedIn}
        profile={profile}
        onPage={go}
        onLogout={logout}
        onLandingSection={scrollLandingSection}
        onProfileSave={saveProfile}
        profileBusy={profileBusy}
      />
      <main className={`gc-main${!loggedIn && activePage === 'home' ? ' gc-main--landing' : ''}`}>
        <AnimatePresence>
          {notice && <Alert key="notice" type="success" message={notice} onDismiss={() => setNotice('')} />}
          {error && <Alert key="error" type="error" message={error} onDismiss={() => setError('')} />}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div key={`${loggedIn ? 'in' : 'out'}-${activePage}`} initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }} transition={{ duration: reducedMotion ? 0 : 0.28 }}>
            {!loggedIn && activePage === 'home' ? (
              <LandingPage onAuthPage={go} setError={setError} />
            ) : !loggedIn ? (
              <AuthPage mode={activePage} onPage={go} onAuth={handleAuth} setNotice={setNotice} setError={setError} />
            ) : activePage === 'marketplace' ? (
              <MarketplaceSection access={tokens.access} profile={profile} mode="marketplace" setNotice={setNotice} setError={setError} />
            ) : activePage === 'my-listings' ? (
              <MyListingsPage access={tokens.access} profile={profile} setNotice={setNotice} setError={setError} />
            ) : activePage === 'transactions' ? (
              <TransactionHubPage access={tokens.access} profile={profile} setNotice={setNotice} setError={setError} />
            ) : activePage === 'admin' ? (
              <AdminPage access={tokens.access} profile={profile} setNotice={setNotice} setError={setError} />
            ) : (
              <DashboardPage access={tokens.access} profile={profile} setNotice={setNotice} setError={setError} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

