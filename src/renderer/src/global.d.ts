/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      startSending: (data: { leads: any[]; template: string; userId?: string | null, isPro?: boolean }) => void
      stopSending: () => void
      onTerminalLog: (callback: (_event: unknown, message: string) => void) => (() => void)
      openAuthUrl: (url: string) => Promise<boolean>
      openExternalUrl: (url: string) => Promise<boolean>
      focusMainWindow: () => Promise<boolean>
      getAppVersion: () => Promise<string>
      getPlanType: (userId: string) => Promise<{ planType: 'pro' | 'basic' | 'free' | 'unknown'; source: string }>
      getLeadsByUser: (payload: {
        userId: string
        category?: string
      }) => Promise<{ rows: any[]; source: 'service-role' | 'anon' | 'error'; error?: string }>
      sendTelegramSupport: (payload: {
        email: string
        category: string
        subject: string
        message: string
      }) => Promise<{ ok: boolean }>
      storeGet: (key: string) => Promise<any>
      storeSet: (key: string, value: any) => Promise<void>
      disconnectWhatsapp: (accountId?: string) => Promise<boolean>
      checkWhatsapp: (accountId?: string) => Promise<boolean>
      connectWhatsapp: (accountId?: string) => Promise<boolean>
      onQRCode: (callback: (_event: unknown, qr: string) => void) => (() => void)
      onWAConnected: (callback: () => void) => (() => void)
      onEngineStatus: (callback: (_event: unknown, status: boolean) => void) => (() => void)
      onReplyDetected: (callback: (_event: unknown, chatName: string) => void) => (() => void)
      onForceLogsRefresh: (callback: () => void) => (() => void)
      onAuthDeepLink: (callback: (_event: unknown, url: string) => void) => (() => void)
    }
  }
}

export {}
