import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { createServer } from 'http'
import type { Server } from 'http'
import { dirname, join, resolve } from 'path'
import { existsSync, readFileSync, rmSync } from 'fs'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { Client, LocalAuth } from 'whatsapp-web.js'
import StoreType from 'electron-store'
import { createClient } from '@supabase/supabase-js'
import { config as dotenvConfig } from 'dotenv'

const Store = (StoreType as unknown as { default: typeof StoreType }).default || StoreType

type WindowBounds = {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_WINDOW_WIDTH = 1360
const DEFAULT_WINDOW_HEIGHT = 800
const MIN_WINDOW_WIDTH = 1260
const MIN_WINDOW_HEIGHT = 720
const PACKAGED_RENDERER_HOST = 'localhost'
const PACKAGED_RENDERER_PORT = 5173
const CUSTOM_PROTOCOL_SCHEME = 'nexusconnect'

// Initialize Supabase in the Main Process using the provided env variables.
const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://njcobfocjxzbgjpvriis.supabase.co'
const supabaseKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qY29iZm9janh6YmdqcHZyaWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNDI3MjUsImV4cCI6MjA4NjYxODcyNX0.SUzf_LQ6BAnPCq9hfATzC7sUVe8a9Rg_EenB0fTYo8E'
const supabase = createClient(supabaseUrl, supabaseKey)

const store = new Store({
  defaults: {
    messagesSent: 0,
    campaignHistory: [],
    windowBounds: {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT
    }
  }
})

type Lead = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  phone?: string
  number?: string
  whatsapp?: string
  business_name?: string
  city?: string
}

type SupportTicketPayload = {
  email?: string
  category?: string
  subject?: string
  message?: string
}

type PlanType = 'pro' | 'basic' | 'free' | 'unknown'

type LogCallback = (message: string) => void
type StatusCallback = (status: boolean) => void

interface WhatsAppSession {
  client: Client
  isReady: boolean
  isInitializing: boolean
}

const WA_AUTH_FOLDER = 'wwebjs_auth'
const DEFAULT_ACCOUNT_ID = 'default'
const waSessions = new Map<string, WhatsAppSession>()

let mainWindowRef: BrowserWindow | null = null
let isEngineRunning = false
let rendererServer: Server | null = null
let rendererServerUrl: string | null = null
let pendingDeepLinkUrl: string | null = null
let runtimeEnvLoaded = false

function loadRuntimeEnvIfNeeded(): void {
  if (runtimeEnvLoaded) {
    return
  }

  const envCandidates = [
    join(process.cwd(), '.env'),
    join(app.getAppPath(), '.env'),
    resolve(app.getAppPath(), '..', '.env'),
    resolve(app.getAppPath(), '..', '..', '.env'),
    join(dirname(app.getPath('exe')), '.env'),
    join(process.resourcesPath, '.env'),
    join(process.resourcesPath, 'app.asar.unpacked', '.env')
  ]

  for (const envPath of envCandidates) {
    if (existsSync(envPath)) {
      dotenvConfig({ path: envPath, override: true })
    }
  }

  runtimeEnvLoaded = true
}

function splitTelegramMessage(text: string, maxLength = 3800): string[] {
  const input = String(text || '')
  if (!input) {
    return ['']
  }

  if (input.length <= maxLength) {
    return [input]
  }

  const chunks: string[] = []
  let start = 0

  while (start < input.length) {
    let end = Math.min(start + maxLength, input.length)

    if (end < input.length) {
      const newlineIndex = input.lastIndexOf('\n', end)
      if (newlineIndex > start + Math.floor(maxLength * 0.6)) {
        end = newlineIndex
      }
    }

    chunks.push(input.slice(start, end).trim())
    start = end
  }

  return chunks.filter((chunk) => chunk.length > 0)
}

function getTelegramConfig(): { token: string; chatId: string } {
  loadRuntimeEnvIfNeeded()
  return {
    token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: String(process.env.TELEGRAM_CHAT_ID || '').trim()
  }
}

function extractDeepLinkFromArgs(argv: string[]): string | null {
  const prefix = `${CUSTOM_PROTOCOL_SCHEME}://`
  const matched = argv.find((arg) => arg.startsWith(prefix))
  return matched || null
}

function focusMainWindow(): void {
  const win = mainWindowRef ?? BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) {
    return
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.show()
  win.focus()
}

function handleDeepLink(url: string): void {
  const normalized = String(url || '').trim()
  if (!normalized.startsWith(`${CUSTOM_PROTOCOL_SCHEME}://`)) {
    return
  }

  pendingDeepLinkUrl = normalized

  const win = mainWindowRef ?? BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) {
    return
  }

  focusMainWindow()
  win.webContents.send('auth-deep-link', normalized)
  pendingDeepLinkUrl = null
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = extractDeepLinkFromArgs(argv)
    if (deepLink) {
      handleDeepLink(deepLink)
      return
    }

    focusMainWindow()
  })
}

const initialDeepLink = extractDeepLinkFromArgs(process.argv)
if (initialDeepLink) {
  pendingDeepLinkUrl = initialDeepLink
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

function resolveAccountId(accountId?: string): string {
  const normalized = accountId?.trim()
  return normalized ? normalized : DEFAULT_ACCOUNT_ID
}

function getWaAuthDataPath(): string {
  return join(app.getPath('userData'), WA_AUTH_FOLDER)
}

function getWaSessionPath(accountId: string): string {
  return join(getWaAuthDataPath(), `session-${accountId}`)
}

function emitToRenderer(channel: string, ...payload: unknown[]): void {
  const targetWindow = mainWindowRef ?? BrowserWindow.getAllWindows()[0]
  if (!targetWindow || targetWindow.isDestroyed()) {
    return
  }

  targetWindow.webContents.send(channel, ...payload)
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function openInChrome(url: string): boolean {
  const candidates = [
    join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe'
    ),
    join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ]

  for (const executablePath of candidates) {
    if (!existsSync(executablePath)) {
      continue
    }

    const chrome = spawn(executablePath, ['--new-window', url], {
      detached: true,
      stdio: 'ignore'
    })

    chrome.unref()
    return true
  }

  return false
}

async function handleIncomingReply(message: any): Promise<void> {
  try {
    if (!message || message.fromMe || typeof message.from !== 'string' || !message.from.endsWith('@c.us')) {
      return
    }

    let chatName = message.from
    try {
      const contact = await message.getContact()
      chatName = contact?.pushname || contact?.name || contact?.number || chatName
    } catch {
      // Keep the chat id fallback when contact metadata is unavailable.
    }

    emitToRenderer('reply-detected', chatName)

    const repliesCount = (store.get('repliesDetected') as number) || 0
    store.set('repliesDetected', repliesCount + 1)

    const fromDigits = String(message.from).replace(/[^0-9]/g, '')
    const campaignLogs = ((store.get('campaignLogs') as any[]) || []).map((item) => ({ ...item }))

    let updated = false
    for (const log of campaignLogs) {
      const targetDigits = String(log.targetPhone || '').replace(/[^0-9]/g, '')
      const sameNumber =
        targetDigits.length > 0 &&
        fromDigits.length > 0 &&
        (fromDigits.endsWith(targetDigits) || targetDigits.endsWith(fromDigits))

      const sameName =
        typeof log.leadName === 'string' &&
        log.leadName.trim().length > 0 &&
        log.leadName.toLowerCase() === chatName.toLowerCase()

      if ((sameNumber || sameName) && log.status !== 'Replied') {
        log.status = 'Replied'
        updated = true
      }
    }

    if (updated) {
      store.set('campaignLogs', campaignLogs)
      emitToRenderer('force-logs-refresh')
    }
  } catch (error) {
    console.error('Reply tracking failed:', error)
  }
}

function createWhatsAppSession(accountId: string): WhatsAppSession {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: accountId,
      dataPath: getWaAuthDataPath()
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  })

  const session: WhatsAppSession = {
    client,
    isReady: false,
    isInitializing: false
  }

  client.on('qr', (qr: string) => {
    emitToRenderer('on-qr-code', qr)
  })

  client.on('ready', () => {
    session.isReady = true
    emitToRenderer('on-wa-connected')
  })

  client.on('auth_failure', (message: string) => {
    session.isReady = false
    console.error(`WhatsApp authentication failed for account ${accountId}:`, message)
  })

  client.on('disconnected', (reason: string) => {
    session.isReady = false
    console.warn(`WhatsApp disconnected for account ${accountId}:`, reason)
  })

  client.on('message', (message: any) => {
    void handleIncomingReply(message)
  })

  return session
}

function initializeWhatsAppSession(accountId: string, session: WhatsAppSession): void {
  if (session.isReady || session.isInitializing) {
    return
  }

  session.isInitializing = true

  void session.client
    .initialize()
    .catch((error) => {
      session.isReady = false
      console.error(`Failed to initialize WhatsApp session for account ${accountId}:`, error)
    })
    .finally(() => {
      session.isInitializing = false
    })
}

async function ensureWhatsAppSession(accountId: string): Promise<WhatsAppSession> {
  const existing = waSessions.get(accountId)
  if (existing) {
    initializeWhatsAppSession(accountId, existing)
    return existing
  }

  const created = createWhatsAppSession(accountId)
  waSessions.set(accountId, created)
  initializeWhatsAppSession(accountId, created)
  return created
}

async function waitForSessionReady(session: WhatsAppSession, timeoutMs: number): Promise<boolean> {
  if (session.isReady) {
    return true
  }

  return new Promise<boolean>((resolve) => {
    const onReady = (): void => finish(true)
    const onAuthFailure = (): void => finish(false)
    const onDisconnected = (): void => finish(false)

    const timeout = setTimeout(() => finish(false), timeoutMs)

    const finish = (result: boolean): void => {
      clearTimeout(timeout)
      session.client.off('ready', onReady)
      session.client.off('auth_failure', onAuthFailure as any)
      session.client.off('disconnected', onDisconnected as any)
      resolve(result)
    }

    session.client.on('ready', onReady)
    session.client.on('auth_failure', onAuthFailure as any)
    session.client.on('disconnected', onDisconnected as any)
  })
}

async function destroyWhatsAppSession(accountId: string): Promise<void> {
  const existing = waSessions.get(accountId)
  if (!existing) {
    return
  }

  try {
    await existing.client.destroy()
  } catch {
    // Ignore shutdown errors to keep disconnect flow resilient.
  }

  waSessions.delete(accountId)
}

function hasStoredWhatsAppSession(accountId: string): boolean {
  return existsSync(getWaSessionPath(accountId))
}

function pickRandomOption(options: string[]): string {
  if (options.length === 0) {
    return ''
  }

  const randomIndex = Math.floor(Math.random() * options.length)
  return options[randomIndex]
}

function resolveSpintax(input: string): string {
  let output = input
  const spinPattern = /\{([^{}]*\|[^{}]*)\}/g
  const spinPatternCheck = /\{([^{}]*\|[^{}]*)\}/

  // Repeat passes so nested or newly revealed segments can also be resolved.
  for (let i = 0; i < 10; i++) {
    if (!spinPatternCheck.test(output)) {
      break
    }

    output = output.replace(spinPattern, (_match, group: string) => {
      const options = group
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)

      return options.length > 0 ? pickRandomOption(options) : ''
    })
  }

  return output
}

function buildPersonalizedMessage(template: string, lead: Lead, senderName: string): string {
  const mergedName = [lead.first_name, lead.last_name]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim()

  const contactName = lead.name || mergedName || lead.business_name || 'there'
  const businessName = lead.business_name || contactName
  const cityName = lead.city || 'your area'

  const tokenized = template
    .replace(/{name}/g, contactName)
    .replace(/{business_name}/g, businessName)
    .replace(/{city}/g, cityName)
    .replace(/{my_name}/g, senderName)

  return resolveSpintax(tokenized)
}

function sanitizeWindowNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getInitialWindowBounds(): WindowBounds {
  const raw = (store.get('windowBounds') as Partial<WindowBounds> | undefined) || {}
  const width = Math.max(sanitizeWindowNumber(raw.width) || DEFAULT_WINDOW_WIDTH, MIN_WINDOW_WIDTH)
  const height = Math.max(sanitizeWindowNumber(raw.height) || DEFAULT_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT)
  const x = sanitizeWindowNumber(raw.x)
  const y = sanitizeWindowNumber(raw.y)

  return {
    width,
    height,
    ...(typeof x === 'number' ? { x } : {}),
    ...(typeof y === 'number' ? { y } : {})
  }
}

function persistWindowBounds(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return
  }

  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
  store.set('windowBounds', {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y
  })
}

function getRendererRootPath(): string {
  const candidates = [
    join(app.getAppPath(), 'out', 'renderer'),
    join(__dirname, '../renderer'),
    join(process.cwd(), 'out', 'renderer')
  ]

  const resolved = candidates.find((candidate) => existsSync(join(candidate, 'index.html')))
  return resolved || join(__dirname, '../renderer')
}

function getContentType(filePath: string): string {
  if (filePath.endsWith('.js')) return 'application/javascript'
  if (filePath.endsWith('.css')) return 'text/css'
  if (filePath.endsWith('.html')) return 'text/html'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

async function ensureRendererServer(): Promise<string> {
  if (rendererServerUrl) {
    return rendererServerUrl
  }

  const rendererRoot = getRendererRootPath()
  const rootResolved = resolve(rendererRoot)
  const indexPath = join(rootResolved, 'index.html')

  rendererServer = createServer((req, res) => {
    const requestedPath = decodeURIComponent((req.url || '/').split('?')[0])
    const candidatePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '')
    const absolutePath = resolve(rootResolved, candidatePath)

    let filePath = absolutePath
    if (!absolutePath.startsWith(rootResolved)) {
      filePath = indexPath
    }

    try {
      const content = readFileSync(filePath)
      res.writeHead(200, { 'Content-Type': getContentType(filePath) })
      res.end(content)
      return
    } catch {
      // SPA fallback to index.html when route or asset is unavailable.
    }

    try {
      const content = readFileSync(indexPath)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(content)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Failed to load renderer')
    }
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    rendererServer?.once('error', rejectPromise)
    rendererServer?.listen(PACKAGED_RENDERER_PORT, PACKAGED_RENDERER_HOST, () => {
      const address = rendererServer?.address()
      if (address && typeof address === 'object') {
        rendererServerUrl = `http://${PACKAGED_RENDERER_HOST}:${address.port}`
        resolvePromise()
      } else {
        rejectPromise(new Error('Unable to allocate local renderer port'))
      }
    })
  })

  return rendererServerUrl as string
}

function closeRendererServer(): void {
  if (!rendererServer) {
    return
  }

  rendererServer.close()
  rendererServer = null
  rendererServerUrl = null
}

async function ensurePackagedAuthReset(mainWindow: BrowserWindow): Promise<void> {
  if (!app.isPackaged) {
    return
  }

  const currentVersion = app.getVersion()
  const markerKey = 'authStorageResetVersion'
  const alreadyResetForVersion = (store.get(markerKey) as string | undefined) === currentVersion

  if (alreadyResetForVersion) {
    return
  }

  try {
    await mainWindow.webContents.session.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
    })
    console.log(`[auth] Cleared persisted auth storage for app version ${currentVersion}`)
  } catch (error) {
    console.error('[auth] Failed to clear auth storage:', error)
  } finally {
    store.set(markerKey, currentVersion)
  }
}

async function createWindow(): Promise<void> {
  const initialBounds = getInitialWindowBounds()

  const iconCandidates = [
    join(process.resourcesPath, 'icons', 'icon.png'),
    join(process.cwd(), 'src', 'renderer', 'assets', 'logo-removebg-preview.png'),
    join(app.getAppPath(), 'src', 'renderer', 'assets', 'logo-removebg-preview.png'),
    join(__dirname, '../../src/renderer/assets/logo-removebg-preview.png'),
    join(process.cwd(), 'src', 'renderer', 'assets', 'logo.png'),
    join(app.getAppPath(), 'src', 'renderer', 'assets', 'logo.png'),
    join(__dirname, '../../src/renderer/assets/logo.png')
  ]

  const windowIconPath = iconCandidates.find((candidate) => existsSync(candidate))

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    ...(typeof initialBounds.x === 'number' ? { x: initialBounds.x } : {}),
    ...(typeof initialBounds.y === 'number' ? { y: initialBounds.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    icon: windowIconPath,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('resize', () => {
    persistWindowBounds(mainWindow)
  })

  mainWindow.on('move', () => {
    persistWindowBounds(mainWindow)
  })

  mainWindow.on('close', () => {
    persistWindowBounds(mainWindow)
  })

  mainWindowRef = mainWindow

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingDeepLinkUrl) {
      return
    }

    mainWindow.webContents.send('auth-deep-link', pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Clerk popup flow starts from about:blank and then navigates to provider OAuth pages.
    if (details.url.startsWith('about:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          autoHideMenuBar: true,
          backgroundColor: '#111111',
          webPreferences: {
            sandbox: false,
            contextIsolation: true
          }
        }
      }
    }

    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  await ensurePackagedAuthReset(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererUrl = await ensureRendererServer()
    mainWindow.loadURL(rendererUrl)
  }
}

function setupAutoUpdaterLogging(): void {
  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version || 'unknown version'}`)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No updates available')
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version || 'unknown version'}`)
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] Auto-update error:', error)
  })
}

async function startWhatsAppSendingSession(
  client: Client,
  leads: Lead[],
  template: string,
  logCallback: LogCallback,
  onStatusChange: StatusCallback
): Promise<void> {
  try {
    logCallback('[WHATSAPP] Session is ready. Starting campaign dispatch...')

    const validLeads = leads || []
    const minDelayRaw = (store.get('minDelay') as number | undefined) || 10
    const maxDelayRaw = (store.get('maxDelay') as number | undefined) || 20
    const minDelay = Math.min(minDelayRaw, maxDelayRaw) * 1000
    const maxDelay = Math.max(minDelayRaw, maxDelayRaw) * 1000
    const senderName = (store.get('senderName') as string | undefined) || 'Nexus Connect'

    const campaignLogs = (store.get('campaignLogs') as any[]) || []
    let sentCount = 0

    for (let i = 0; i < validLeads.length; i++) {
      const lead = validLeads[i]
      const rawPhone = lead.phone || lead.number || lead.whatsapp
      const businessName = lead.business_name || 'there'

      let formattedPhone = rawPhone ? String(rawPhone).replace(/[^0-9]/g, '') : ''

      if (formattedPhone.length === 11 && formattedPhone.startsWith('0')) {
        formattedPhone = formattedPhone.slice(1)
      }

      if (formattedPhone.length === 10) {
        formattedPhone = `91${formattedPhone}`
      }

      const messageBody = buildPersonalizedMessage(template, lead, senderName)

      if (!isEngineRunning) {
        logCallback('[STOP] Campaign halted before completion.')
        campaignLogs.push({
          date: new Date().toISOString(),
          leadName: businessName,
          targetPhone: formattedPhone || 'Unknown',
          messagePreview: messageBody.substring(0, 40) + '...',
          status: 'Pending'
        })
        store.set('campaignLogs', campaignLogs)
        break
      }

      if (!rawPhone || !formattedPhone) {
        logCallback(`[WHATSAPP] Skipping lead ${i + 1}: No phone number provided.`)
        continue
      }

      logCallback(`[WHATSAPP] Processing lead ${i + 1}/${validLeads.length}: ${businessName} (${formattedPhone})...`)

      const chatId = `${formattedPhone}@c.us`
      let deliveryStatus = 'Pending'
      let isInvalid = false

      try {
        const isRegistered = await client.isRegisteredUser(chatId)

        if (!isRegistered) {
          deliveryStatus = 'Invalid Number'
          isInvalid = true
          logCallback(`[WARNING] ${formattedPhone} is not a valid WhatsApp number. Skipping.`)
        } else {
          await client.sendMessage(chatId, messageBody)
          deliveryStatus = 'Sent'
          sentCount++
          logCallback(`[OK] Message sent to ${businessName} (${formattedPhone})`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (/invalid|not registered|wid/i.test(errorMessage)) {
          deliveryStatus = 'Invalid Number'
          isInvalid = true
          logCallback(`[WARNING] Invalid number detected for ${businessName} (${formattedPhone}).`)
        } else {
          deliveryStatus = 'Failed/Invalid'
          logCallback(`[WARNING] Failed to send to ${businessName} (${formattedPhone}): ${errorMessage}`)
        }
      }

      if (isInvalid && lead.id) {
        const invalidLeadIds = (store.get('invalidLeadIds') as string[]) || []
        if (!invalidLeadIds.includes(lead.id)) {
          invalidLeadIds.push(lead.id)
          store.set('invalidLeadIds', invalidLeadIds)
        }
      }

      campaignLogs.push({
        date: new Date().toISOString(),
        leadName: businessName,
        targetPhone: formattedPhone,
        messagePreview: messageBody.substring(0, 40) + '...',
        status: deliveryStatus
      })
      store.set('campaignLogs', campaignLogs)

      if (i < validLeads.length - 1 && isEngineRunning) {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
        logCallback(`[WAIT] Sleeping for ${(delay / 1000).toFixed(1)} seconds...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    if (isEngineRunning) {
      logCallback(`[SUCCESS] Campaign finished! Messages sent: ${sentCount}/${validLeads.length}`)
    } else {
      logCallback(`[SYSTEM] Campaign aborted early. Messages sent: ${sentCount}`)
    }

    const history = (store.get('campaignHistory') as any[]) || []
    history.push({ date: new Date().toISOString(), sentCount })
    store.set('campaignHistory', history)
  } catch (error) {
    if (isEngineRunning) {
      const message = error instanceof Error ? error.message : String(error)
      logCallback(`[ERROR] WhatsApp engine error: ${message}`)
    }
  } finally {
    isEngineRunning = false
    onStatusChange(false)
  }
}

// -------------------------------------------------------------
// STEP 3: IPC Communication & Main Process
// -------------------------------------------------------------
ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('send-telegram-support', async (_event, payload: SupportTicketPayload) => {
  const email = String(payload?.email ?? '').trim()
  const category = String(payload?.category ?? '').trim()
  const subject = String(payload?.subject ?? '').trim()
  const message = String(payload?.message ?? '').trim()

  if (!email || !category || !subject || !message) {
    throw new Error('Missing required support fields')
  }

  const { token: telegramBotToken, chatId: telegramChatId } = getTelegramConfig()

  if (!telegramBotToken || !telegramChatId) {
    throw new Error('Telegram support is not configured')
  }

  const text = [
    'New Support Ticket - NexusConnect',
    `User Email: ${email}`,
    `Category: ${category}`,
    `Subject: ${subject}`,
    `Message: ${message}`
  ].join('\n')

  const chunks = splitTelegramMessage(text)

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const chunkText =
      chunks.length > 1 ? `[Part ${index + 1}/${chunks.length}]\n${chunk}` : chunk

    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: chunkText,
        disable_web_page_preview: true
      })
    })

    const result = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null

    if (!response.ok || !result?.ok) {
      const reason = result?.description || `HTTP ${response.status}`
      throw new Error(`Telegram API error: ${reason}`)
    }
  }

  return { ok: true }
})

ipcMain.handle('store-get', (_event, key) => {
  return store.get(key)
})

ipcMain.handle('store-set', (_event, key, value) => {
  store.set(key, value)
})

ipcMain.on('start-sending-engine', async (event, args) => {
  if (isEngineRunning) {
    return
  }

  isEngineRunning = true
  event.sender.send('engine-status', true)

  const logToTerminal = (message: string): void => {
    event.sender.send('terminal-log', message)
  }

  const leads = Array.isArray(args?.leads) ? args.leads : []
  const template = typeof args?.template === 'string' ? args.template : ''
  const userId = typeof args?.userId === 'string' ? args.userId : ''

  logToTerminal('[SYSTEM] Initializing Nexus Connect Engine...')

  if (!leads.length) {
    logToTerminal('[ERROR] No valid leads provided to the engine.')
    isEngineRunning = false
    event.sender.send('engine-status', false)
    return
  }

  if (!userId) {
    logToTerminal('[ERROR] Authentication missing. Please sign in again to continue.')
    isEngineRunning = false
    event.sender.send('engine-status', false)
    return
  }

  const isProUser = !!args?.isPro
  if (!isProUser) {
    logToTerminal('[LOCKED] Pro subscription required. Please upgrade from Settings > Subscription tab.')
    isEngineRunning = false
    event.sender.send('engine-status', false)
    return
  }

  const selectedAccountId = resolveAccountId((store.get('activeAccountId') as string | undefined) || '')
  logToTerminal(`[WHATSAPP] Resolving account session: ${selectedAccountId}`)

  const session = await ensureWhatsAppSession(selectedAccountId)
  const waitTimeout = hasStoredWhatsAppSession(selectedAccountId) ? 45000 : 120000
  const ready = await waitForSessionReady(session, waitTimeout)

  if (!ready) {
    logToTerminal('[ERROR] WhatsApp session is not ready yet. Open Settings and complete QR pairing first.')
    isEngineRunning = false
    event.sender.send('engine-status', false)
    return
  }

  logToTerminal(`[SUCCESS] Passed ${leads.length} valid leads. Launching WhatsApp engine...`)

  void startWhatsAppSendingSession(session.client, leads, template, logToTerminal, (status) => {
    event.sender.send('engine-status', status)
  })
})

ipcMain.on('stop-sending-engine', (event) => {
  isEngineRunning = false
  event.sender.send('engine-status', false)
  event.sender.send('terminal-log', '[STOP] Engine manually halted by user.')
})

ipcMain.handle('auth:open-external', async (_event, url: string) => {
  if (!isSafeHttpUrl(url)) {
    throw new Error('Invalid auth URL')
  }

  const openedInChrome = openInChrome(url)

  if (!openedInChrome) {
    await shell.openExternal(url)
  }

  return openedInChrome
})

ipcMain.handle('auth:open-external-default', async (_event, url: string) => {
  const targetUrl = String(url ?? '').trim()

  if (!isSafeHttpUrl(targetUrl)) {
    throw new Error('Invalid URL')
  }

  try {
    await shell.openExternal(targetUrl, { activate: true })
    return true
  } catch (error) {
    const openedInChrome = openInChrome(targetUrl)
    if (openedInChrome) {
      return true
    }

    throw error
  }
})

ipcMain.handle('auth:focus-main-window', async () => {
  const win = mainWindowRef ?? BrowserWindow.getAllWindows()[0]

  if (!win) {
    return false
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.show()
  win.focus()
  return true
})

ipcMain.handle('auth:disconnect-whatsapp', async (_event, accountId?: string) => {
  try {
    const selectedAccountId = resolveAccountId(accountId)
    await destroyWhatsAppSession(selectedAccountId)

    const sessionPath = getWaSessionPath(selectedAccountId)
    if (existsSync(sessionPath)) {
      rmSync(sessionPath, { recursive: true, force: true })
    }

    return true
  } catch (error) {
    console.error('Failed to disconnect WhatsApp:', error)
    return false
  }
})

ipcMain.handle('auth:check-whatsapp', async (_event, accountId?: string) => {
  try {
    const selectedAccountId = resolveAccountId(accountId)
    const session = waSessions.get(selectedAccountId)
    return Boolean(session?.isReady) || hasStoredWhatsAppSession(selectedAccountId)
  } catch {
    return false
  }
})

ipcMain.handle('auth:connect-whatsapp', async (_event, accountId?: string) => {
  try {
    const selectedAccountId = resolveAccountId(accountId)
    const session = await ensureWhatsAppSession(selectedAccountId)

    if (session.isReady) {
      emitToRenderer('on-wa-connected')
    }

    return true
  } catch (error) {
    console.error('Failed to connect WhatsApp account:', error)
    return false
  }
})

app.whenReady().then(() => {
  loadRuntimeEnvIfNeeded()

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL_SCHEME, process.execPath, [resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL_SCHEME)
  }

  electronApp.setAppUserModelId('com.nexuslead.connect')

  setupAutoUpdaterLogging()
  void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[updater] checkForUpdatesAndNotify failed:', error)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  void createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('before-quit', () => {
  closeRendererServer()

  for (const session of waSessions.values()) {
    void session.client.destroy().catch(() => undefined)
  }
  waSessions.clear()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})