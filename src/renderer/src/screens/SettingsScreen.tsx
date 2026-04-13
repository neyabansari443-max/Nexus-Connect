import {
  Crown,
  RefreshCw,
  ShieldAlert,
  Save,
  Smartphone,
  Plus,
  Trash2,
  LoaderCircle,
  CheckCircle2,
  ShieldCheck,
  ExternalLink
} from 'lucide-react'
import { usePlan } from '../features/subscription/plan'
import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import ActionDialog from '../components/ActionDialog'

interface WhatsAppAccount {
  id: string
  name: string
  number: string
  status?: 'connected' | 'disconnected'
}

type PairingState = 'idle' | 'loading' | 'qr' | 'connected'
const BILLING_URL = 'https://nexuslead.live/dashboard/billing'
const LEGAL_LINKS = [
  { label: 'Privacy Policy', url: 'https://nexuslead.live/privacy' },
  { label: 'Terms of Service', url: 'https://nexuslead.live/terms' }
]

export default function SettingsScreen() {
  const { planType, isPro, isLoading, error, source, userId, refresh } = usePlan()

  const [minDelay, setMinDelay] = useState<number>(10)
  const [maxDelay, setMaxDelay] = useState<number>(20)
  const [delaySaved, setDelaySaved] = useState(false)

  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string>('')
  const [connectingId, setConnectingId] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'plan' | 'accounts' | 'safety'>('plan')

  const [showAddForm, setShowAddForm] = useState(false)
  const [newAccName, setNewAccName] = useState('')
  const [newAccNumber, setNewAccNumber] = useState('')

  const [pairingState, setPairingState] = useState<PairingState>('idle')
  const [pairingAccountId, setPairingAccountId] = useState<string | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [qrString, setQrString] = useState<string>('')
  const [accountPendingRemoval, setAccountPendingRemoval] = useState<WhatsAppAccount | null>(null)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [upgradeDialogMessage, setUpgradeDialogMessage] = useState('')
  const [noticeDialog, setNoticeDialog] = useState({
    open: false,
    title: '',
    description: ''
  })
  const [openingBilling, setOpeningBilling] = useState(false)
  const [billingHint, setBillingHint] = useState<string | null>(null)

  const pairingAccountRef = useRef<string | null>(null)

  useEffect(() => {
    pairingAccountRef.current = pairingAccountId
  }, [pairingAccountId])

  useEffect(() => {
    if (!window.api || !window.api.storeGet) {
      return
    }

    void window.api.storeGet('minDelay').then((value) => setMinDelay(value || 10))
    void window.api.storeGet('maxDelay').then((value) => setMaxDelay(value || 20))

    void window.api.storeGet('whatsappAccounts').then((value) => {
      if (Array.isArray(value)) {
        setAccounts(value)
        void checkAccountStatuses(value)
      }
    })

    void window.api.storeGet('activeAccountId').then((value) => {
      if (typeof value === 'string') {
        setActiveAccountId(value)
      }
    })
  }, [])

  useEffect(() => {
    if (!window.api || !window.api.onQRCode || !window.api.onWAConnected) {
      return
    }

    const removeQRCodeListener = window.api.onQRCode((_event, qr) => {
      setQrString(qr)
      setPairingState('qr')
      setConnectingId(null)
      setPairingError(null)
    })

    const removeConnectedListener = window.api.onWAConnected(() => {
      const connectedId = pairingAccountRef.current

      setPairingState('connected')
      setQrString('')
      setConnectingId(null)
      setPairingError(null)

      if (!connectedId) {
        return
      }

      setAccounts((previousAccounts) => {
        const updatedAccounts = previousAccounts.map((account) =>
          account.id === connectedId ? { ...account, status: 'connected' as const } : account
        )
        void window.api.storeSet('whatsappAccounts', updatedAccounts)
        return updatedAccounts
      })

      setActiveAccountId(connectedId)
      void window.api.storeSet('activeAccountId', connectedId)
    })

    return () => {
      removeQRCodeListener()
      removeConnectedListener()
    }
  }, [])

  const checkAccountStatuses = async (currentAccounts: WhatsAppAccount[]) => {
    if (!window.api || !window.api.checkWhatsapp) {
      return
    }

    const updatedAccounts = await Promise.all(
      currentAccounts.map(async (account): Promise<WhatsAppAccount> => {
        const isConnected = await window.api.checkWhatsapp(account.id)
        return {
          ...account,
          status: isConnected ? 'connected' : 'disconnected'
        }
      })
    )

    setAccounts(updatedAccounts)
    void window.api.storeSet('whatsappAccounts', updatedAccounts)
  }

  const saveSettings = () => {
    if (!isPro) {
      setBillingHint('Automation safety controls are available only on Pro plan.')
      return
    }

    if (!window.api || !window.api.storeSet) {
      return
    }

    const correctMin = Math.min(minDelay, maxDelay)
    const correctMax = Math.max(minDelay, maxDelay)

    void window.api.storeSet('minDelay', correctMin)
    void window.api.storeSet('maxDelay', correctMax)

    setMinDelay(correctMin)
    setMaxDelay(correctMax)
    setDelaySaved(true)

    setTimeout(() => setDelaySaved(false), 2000)
  }

  const openBillingPortal = async () => {
    setOpeningBilling(true)
    setBillingHint(null)

    try {
      if (window.api?.openAuthUrl) {
        await window.api.openAuthUrl(BILLING_URL)
      } else {
        window.open(BILLING_URL, '_blank', 'noopener,noreferrer')
      }

      setBillingHint('Billing page opened. Complete your upgrade and plan status will auto-refresh in app.')
      void refresh()
    } catch (error) {
      console.error(error)
      setBillingHint('Unable to open billing page. Please try again.')
    } finally {
      setOpeningBilling(false)
    }
  }

  const promptUpgrade = () => {
    setUpgradeDialogMessage('This feature is locked for free/basic plans. Upgrade to Pro to continue.')
    setShowUpgradeDialog(true)
  }

  const openNotice = (title: string, description: string) => {
    setNoticeDialog({ open: true, title, description })
  }

  const closeNotice = () => {
    setNoticeDialog((previous) => ({ ...previous, open: false }))
  }

  const openLegalLink = async (url: string) => {
    const normalizedUrl = String(url ?? '').trim()

    try {
      if (!window.api?.openExternalUrl) {
        throw new Error('openExternalUrl bridge is unavailable')
      }

      await window.api.openExternalUrl(normalizedUrl)
      return
    } catch (error) {
      console.error('Default-browser open failed, trying fallback route:', error)
    }

    try {
      if (window.api?.openAuthUrl) {
        await window.api.openAuthUrl(normalizedUrl)
        return
      }
    } catch (error) {
      console.error('Fallback browser open failed:', error)
    }

    openNotice('Unable To Open Link', 'Could not open this link in your default browser. Please try again.')
  }

  const handleSaveNewAccount = async () => {
    if (!isPro) {
      promptUpgrade()
      return
    }

    if (!newAccName || !newAccNumber) {
      return
    }

    const newAccount: WhatsAppAccount = {
      id: Date.now().toString(),
      name: newAccName,
      number: newAccNumber,
      status: 'disconnected'
    }

    const updatedAccounts = [...accounts, newAccount]
    setAccounts(updatedAccounts)

    if (window.api && window.api.storeSet) {
      void window.api.storeSet('whatsappAccounts', updatedAccounts)
      if (!activeAccountId) {
        setActiveAccountId(newAccount.id)
        void window.api.storeSet('activeAccountId', newAccount.id)
      }
    }

    setShowAddForm(false)
    setNewAccName('')
    setNewAccNumber('')

    await handleConnectAccount(newAccount.id)
  }

  const handleConnectAccount = async (id: string) => {
    if (!isPro) {
      promptUpgrade()
      return
    }

    if (!window.api || !window.api.connectWhatsapp) {
      openNotice(
        'Bridge Not Ready',
        'Please restart the app to apply latest backend updates. Connect button will work after restart.'
      )
      return
    }

    setPairingAccountId(id)
    setPairingState('loading')
    setPairingError(null)
    setQrString('')
    setConnectingId(id)

    try {
      const started = await window.api.connectWhatsapp(id)

      if (!started) {
        throw new Error('Pairing engine did not start')
      }
    } catch (error) {
      console.error(error)
      setPairingState('idle')
      setPairingError('Unable to start secure pairing. Please restart the app and try again.')
      setConnectingId(null)
    }
  }

  const requestRemoveAccount = (id: string) => {
    const targetAccount = accounts.find((account) => account.id === id)
    if (!targetAccount) {
      return
    }

    setAccountPendingRemoval(targetAccount)
  }

  const removeAccount = (id: string) => {

    const updatedAccounts = accounts.filter((account) => account.id !== id)
    setAccounts(updatedAccounts)

    if (window.api && window.api.storeSet) {
      void window.api.storeSet('whatsappAccounts', updatedAccounts)

      if (activeAccountId === id) {
        const nextId = updatedAccounts.length > 0 ? updatedAccounts[0].id : ''
        setActiveAccountId(nextId)
        void window.api.storeSet('activeAccountId', nextId)
      }

      void window.api.disconnectWhatsapp(id)
    }

    if (pairingAccountId === id) {
      setPairingAccountId(null)
      setPairingState('idle')
      setPairingError(null)
      setQrString('')
      setConnectingId(null)
    }
  }

  const confirmAccountRemoval = () => {
    if (!accountPendingRemoval) {
      return
    }

    const accountId = accountPendingRemoval.id
    setAccountPendingRemoval(null)
    removeAccount(accountId)
  }

  const handleSetActiveAccount = (id: string) => {
    setActiveAccountId(id)
    if (window.api && window.api.storeSet) {
      void window.api.storeSet('activeAccountId', id)
    }
  }

  const pairingAccount = accounts.find((account) => account.id === pairingAccountId)

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Settings</h1>
        <p className="text-zinc-400">Manage your subscription, WhatsApp endpoints, and automation safety limits.</p>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('plan')}
            className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'plan'
                ? 'border-indigo-500 text-white bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
            }`}
          >
            Subscription & Plan
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'accounts'
                ? 'border-indigo-500 text-white bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
            }`}
          >
            WhatsApp Accounts
          </button>
          <button
            onClick={() => setActiveTab('safety')}
            className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'safety'
                ? 'border-indigo-500 text-white bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
            }`}
          >
            Automation Safety
          </button>
        </div>

        {activeTab === 'plan' && (
          <div className="p-8 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h3 className="text-xl font-semibold text-white">Subscription Status</h3>
                <p className="text-sm text-zinc-400 mt-1">Review your current plan benefits and data limits.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>

                <button
                  onClick={() => void openBillingPortal()}
                  disabled={openingBilling}
                  className="inline-flex items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs text-indigo-200 hover:text-white hover:bg-indigo-500/25 transition disabled:opacity-60"
                >
                  <Crown className="w-3.5 h-3.5" />
                  {openingBilling ? 'Opening Billing...' : isPro ? 'Manage Billing' : 'Get Pro'}
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 grid place-items-center">
                  <Crown className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Current Plan</p>
                  <p className="text-xl font-bold text-white mt-0.5">
                    {isLoading ? 'Checking...' : isPro ? 'PRO TIER' : (planType || 'free').toUpperCase()}
                  </p>
                </div>
              </div>

              {!isLoading && !isPro && (
                <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm space-y-3">
                  <p>You are currently on a restricted plan. Upgrade to unlock all automation and dashboard features.</p>
                  <button
                    onClick={() => void openBillingPortal()}
                    disabled={openingBilling}
                    className="inline-flex items-center rounded-md bg-white text-black px-3 py-1.5 text-xs font-semibold hover:bg-zinc-200 transition disabled:opacity-60"
                  >
                    {openingBilling ? 'Opening...' : 'Get Pro'}
                  </button>
                </div>
              )}

              {billingHint && <p className="mt-4 text-xs text-indigo-300">{billingHint}</p>}

              {error && <p className="mt-4 text-sm text-rose-400">Sync issue: {error}</p>}

              <div className="mt-6 pt-4 border-t border-zinc-800/50 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500">Source:</span> <span className="text-zinc-300 ml-1">{source}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Account ID:</span>{' '}
                  <span className="text-zinc-300 ml-1 truncate">{userId ?? 'Unauthenticated'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Connected WhatsApp Accounts</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Manage multiple business endpoints and choose which one to actively route campaigns through.
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                disabled={!isPro}
                className="inline-flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-md text-sm font-semibold transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {isPro ? 'Add New WhatsApp Account' : 'Pro Required'}
              </button>
            </div>

            {!isPro && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm flex items-center justify-between gap-3">
                <span>WhatsApp account pairing and routing are locked for free/basic plans.</span>
                <button
                  onClick={() => void openBillingPortal()}
                  disabled={openingBilling}
                  className="shrink-0 inline-flex items-center rounded-md bg-white text-black px-3 py-1.5 text-xs font-semibold hover:bg-zinc-200 transition disabled:opacity-60"
                >
                  Get Pro
                </button>
              </div>
            )}

            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.22),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.2),transparent_45%)] pointer-events-none" />
              <div className="relative p-6 md:p-7 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 text-emerald-300 text-xs font-semibold tracking-widest uppercase mb-2">
                      <ShieldCheck className="w-4 h-4" />
                      Secure Pairing Area
                    </div>
                    <h4 className="text-lg font-semibold text-white">Headless In-App QR Connection</h4>
                    <p className="text-sm text-zinc-300/90 mt-1 max-w-xl">
                      Pair accounts without opening a visible browser window. Start pairing from an account row and scan the
                      QR code shown below.
                    </p>
                  </div>

                  {pairingAccount && (
                    <span className="inline-flex items-center rounded-full border border-zinc-700/80 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-200">
                      Pairing target: {pairingAccount.name}
                    </span>
                  )}
                </div>

                {pairingState === 'loading' && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-6 flex items-center gap-3 text-zinc-200">
                    <LoaderCircle className="w-5 h-5 animate-spin text-emerald-300" />
                    <span className="text-sm font-medium">Generating secure QR code...</span>
                  </div>
                )}

                {pairingState === 'qr' && qrString && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-6 md:p-8 flex flex-col items-center gap-4">
                    <div className="bg-white rounded-xl p-3 shadow-lg shadow-black/30">
                      <QRCodeCanvas value={qrString} size={200} bgColor="#ffffff" fgColor="#0a0a0b" />
                    </div>
                    <p className="text-xs text-zinc-300 tracking-wide">
                      Scan this code from WhatsApp on your phone to authorize this account.
                    </p>
                  </div>
                )}

                {pairingState === 'connected' && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-emerald-200 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      WhatsApp: Connected securely
                    </div>
                  </div>
                )}

                {pairingState === 'idle' && (
                  <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/55 p-5 text-sm text-zinc-300">
                    Select an account and click Connect Securely to begin pairing.
                  </div>
                )}

                {pairingError && <p className="text-sm text-rose-300">{pairingError}</p>}
              </div>
            </div>

            {showAddForm && isPro && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-in fade-in slide-in-from-top-2">
                <h4 className="text-sm font-medium text-white mb-4">Add a new Account</h4>
                <div className="grid gap-4 md:grid-cols-2 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account Name</label>
                    <input
                      type="text"
                      className="w-full bg-[#0a0a0b] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="e.g. Sales Team"
                      value={newAccName}
                      onChange={(event) => setNewAccName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Phone Number</label>
                    <input
                      type="text"
                      className="w-full bg-[#0a0a0b] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="e.g. +1 234 567 890"
                      value={newAccNumber}
                      onChange={(event) => setNewAccNumber(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleSaveNewAccount()}
                    disabled={!newAccName || !newAccNumber}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-md transition-colors"
                  >
                    Save Account
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-4">
              {accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 border border-zinc-800 border-dashed rounded-xl bg-zinc-900/10">
                  <Smartphone className="w-10 h-10 text-zinc-600 mb-3" />
                  <p className="text-zinc-300 font-medium">No WhatsApp Accounts Linked</p>
                  <p className="text-zinc-500 text-sm text-center max-w-sm mt-1">
                    Add an account now and pair it instantly with the in-app secure QR experience.
                  </p>
                </div>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    className={`flex items-center justify-between p-5 rounded-xl border transition-all ${
                      activeAccountId === account.id
                        ? 'border-indigo-500/50 bg-indigo-500/5 shadow-inner'
                        : 'border-zinc-800 bg-zinc-900/30'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        <input
                          type="radio"
                          name="activeAccount"
                          checked={activeAccountId === account.id}
                          onChange={() => handleSetActiveAccount(account.id)}
                          className="w-4 h-4 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-semibold text-white">{account.name}</p>
                          {activeAccountId === account.id && (
                            <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm">
                              Active Sending Route
                            </span>
                          )}
                          {account.status === 'connected' ? (
                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Connected
                            </span>
                          ) : (
                            <span className="bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm">
                              Disconnected
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-mono text-zinc-400 mt-1">{account.number}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {account.status !== 'connected' && (
                        <button
                          onClick={() => void handleConnectAccount(account.id)}
                          disabled={!isPro || connectingId === account.id}
                          className="px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 flex items-center gap-2"
                        >
                          {connectingId === account.id ? (
                            <>
                              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                              Preparing QR...
                            </>
                          ) : (
                            'Connect Securely'
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => requestRemoveAccount(account.id)}
                        className="text-zinc-500 hover:text-rose-400 hover:bg-rose-400/10 p-2 rounded-md transition-colors"
                        title="Remove Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
                <h3 className="text-xl font-semibold text-white">Safety Engine Limits</h3>
              </div>
              <p className="text-sm text-zinc-400 mb-6">
                Control the timing between messages to heavily reduce the risk of automated spam detection flags.
              </p>

              {!isPro && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm flex items-center justify-between gap-3">
                  <span>Safety controls are available only for Pro users.</span>
                  <button
                    onClick={() => void openBillingPortal()}
                    disabled={openingBilling}
                    className="shrink-0 inline-flex items-center rounded-md bg-white text-black px-3 py-1.5 text-xs font-semibold hover:bg-zinc-200 transition disabled:opacity-60"
                  >
                    Get Pro
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6 bg-[#0a0a0b] p-6 border border-zinc-800 shadow-inner rounded-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />

              <div className="space-y-3 relative z-10">
                <label className="text-sm font-medium text-zinc-300">Minimum Delay (sec)</label>
                <input
                  type="number"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  value={minDelay}
                  onChange={(event) => setMinDelay(Number(event.target.value))}
                  disabled={!isPro}
                  min={1}
                />
              </div>

              <div className="space-y-3 relative z-10">
                <label className="text-sm font-medium text-zinc-300">Maximum Delay (sec)</label>
                <input
                  type="number"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  value={maxDelay}
                  onChange={(event) => setMaxDelay(Number(event.target.value))}
                  disabled={!isPro}
                  min={2}
                />
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/80 flex items-center justify-between">
              <button
                onClick={saveSettings}
                disabled={!isPro || delaySaved}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 px-6 py-2.5 rounded-md text-sm font-semibold transition-all shadow-sm shadow-indigo-600/20"
              >
                <Save className="w-4 h-4" />
                {delaySaved ? 'Settings Saved' : 'Update Global Configuration'}
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 md:p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white">Legal & Privacy</h3>
          <p className="mt-1 text-sm text-muted-foreground text-zinc-400 leading-relaxed">
            Local-First by design. Your campaign operations run on-device, and policy links always open in your default browser.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {LEGAL_LINKS.map((linkItem) => (
            <button
              key={linkItem.url}
              onClick={() => void openLegalLink(linkItem.url)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-muted-foreground text-zinc-300 hover:text-white hover:border-zinc-700 transition"
            >
              {linkItem.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </section>

      <ActionDialog
        open={Boolean(accountPendingRemoval)}
        tone="danger"
        title="Disconnect This WhatsApp Account?"
        description={
          accountPendingRemoval
            ? `This will remove ${accountPendingRemoval.name} and clear its local WhatsApp session from this device.`
            : ''
        }
        confirmLabel="Disconnect & Remove"
        cancelLabel="Keep Account"
        onConfirm={confirmAccountRemoval}
        onCancel={() => setAccountPendingRemoval(null)}
      />

      <ActionDialog
        open={showUpgradeDialog}
        tone="warning"
        title="Upgrade To Pro"
        description={upgradeDialogMessage}
        confirmLabel="Open Billing"
        cancelLabel="Not Now"
        onConfirm={() => {
          setShowUpgradeDialog(false)
          void openBillingPortal()
        }}
        onCancel={() => setShowUpgradeDialog(false)}
      />

      <ActionDialog
        open={noticeDialog.open}
        tone="warning"
        title={noticeDialog.title}
        description={noticeDialog.description}
        confirmLabel="Got it"
        showCancel={false}
        onConfirm={closeNotice}
        onCancel={closeNotice}
      />
    </div>
  )
}