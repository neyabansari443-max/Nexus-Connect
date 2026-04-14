import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', {
      startSending: (data: any) => ipcRenderer.send('start-sending-engine', data),
      stopSending: () => ipcRenderer.send('stop-sending-engine'),
      onTerminalLog: (callback: (event: any, message: string) => void) => {
        ipcRenderer.on('terminal-log', callback);
        return () => {
          ipcRenderer.removeListener('terminal-log', callback);
        };
      },
      openAuthUrl: (url: string) => ipcRenderer.invoke('auth:open-external', url),
      openExternalUrl: (url: string) => ipcRenderer.invoke('auth:open-external-default', url),
      focusMainWindow: () => ipcRenderer.invoke('auth:focus-main-window'),
      getAppVersion: () => ipcRenderer.invoke('app:get-version'),
      sendTelegramSupport: (payload: { email: string; category: string; subject: string; message: string }) =>
        ipcRenderer.invoke('send-telegram-support', payload),
      storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
      storeSet: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
      disconnectWhatsapp: (accountId?: string) => ipcRenderer.invoke('auth:disconnect-whatsapp', accountId),
      checkWhatsapp: (accountId?: string) => ipcRenderer.invoke('auth:check-whatsapp', accountId),
      connectWhatsapp: (accountId?: string) => ipcRenderer.invoke('auth:connect-whatsapp', accountId),
      onQRCode: (callback: (event: any, qr: string) => void) => {
        ipcRenderer.on('on-qr-code', callback);
        return () => {
          ipcRenderer.removeListener('on-qr-code', callback);
        };
      },
      onWAConnected: (callback: () => void) => {
        ipcRenderer.on('on-wa-connected', callback);
        return () => {
          ipcRenderer.removeListener('on-wa-connected', callback);
        };
      },
      onEngineStatus: (callback: (event: any, status: boolean) => void) => {
        ipcRenderer.on('engine-status', callback);
        return () => {
          ipcRenderer.removeListener('engine-status', callback);
        };
      },
      onReplyDetected: (callback: (event: any, chatName: string) => void) => {
        ipcRenderer.on('reply-detected', callback);
        return () => {
          ipcRenderer.removeListener('reply-detected', callback);
        };
      },
      onForceLogsRefresh: (callback: () => void) => {
        ipcRenderer.on('force-logs-refresh', callback);
        return () => {
          ipcRenderer.removeListener('force-logs-refresh', callback);
        };
      },
      onAuthDeepLink: (callback: (event: any, url: string) => void) => {
        ipcRenderer.on('auth-deep-link', callback);
        return () => {
          ipcRenderer.removeListener('auth-deep-link', callback);
        };
      }
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = {
    startSending: (data: any) => ipcRenderer.send('start-sending-engine', data),
    stopSending: () => ipcRenderer.send('stop-sending-engine'),
    onTerminalLog: (callback: (event: any, message: string) => void) => {
      ipcRenderer.on('terminal-log', callback);
      return () => {
        ipcRenderer.removeListener('terminal-log', callback);
      };
    },
    openAuthUrl: (url: string) => ipcRenderer.invoke('auth:open-external', url),
    openExternalUrl: (url: string) => ipcRenderer.invoke('auth:open-external-default', url),
    focusMainWindow: () => ipcRenderer.invoke('auth:focus-main-window'),
    getAppVersion: () => ipcRenderer.invoke('app:get-version'),
    sendTelegramSupport: (payload: { email: string; category: string; subject: string; message: string }) =>
      ipcRenderer.invoke('send-telegram-support', payload),
    storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
    storeSet: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
    disconnectWhatsapp: (accountId?: string) => ipcRenderer.invoke('auth:disconnect-whatsapp', accountId),
    checkWhatsapp: (accountId?: string) => ipcRenderer.invoke('auth:check-whatsapp', accountId),
    connectWhatsapp: (accountId?: string) => ipcRenderer.invoke('auth:connect-whatsapp', accountId),
    onQRCode: (callback: (event: any, qr: string) => void) => {
      ipcRenderer.on('on-qr-code', callback);
      return () => {
        ipcRenderer.removeListener('on-qr-code', callback);
      };
    },
    onWAConnected: (callback: () => void) => {
      ipcRenderer.on('on-wa-connected', callback);
      return () => {
        ipcRenderer.removeListener('on-wa-connected', callback);
      };
    },
    onEngineStatus: (callback: (event: any, status: boolean) => void) => {
      ipcRenderer.on('engine-status', callback);
      return () => {
        ipcRenderer.removeListener('engine-status', callback);
      };
    },
    onReplyDetected: (callback: (event: any, chatName: string) => void) => {
      ipcRenderer.on('reply-detected', callback);
      return () => {
        ipcRenderer.removeListener('reply-detected', callback);
      };
    },
    onForceLogsRefresh: (callback: () => void) => {
      ipcRenderer.on('force-logs-refresh', callback);
      return () => {
        ipcRenderer.removeListener('force-logs-refresh', callback);
      };
    },
    onAuthDeepLink: (callback: (event: any, url: string) => void) => {
      ipcRenderer.on('auth-deep-link', callback);
      return () => {
        ipcRenderer.removeListener('auth-deep-link', callback);
      };
    }
  }
}