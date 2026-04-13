import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Clock3,
  RefreshCw,
  Rocket,
  Send,
  Smartphone,
  Users
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { useCampaignStore } from '../store/useCampaignStore'
import { cn } from '../lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

interface DashboardStats {
  totalLeadsAvailable: number
  connectedAccounts: number
  pendingQueue: number
  totalMessagesSent: number
}

interface CampaignHistoryEntry {
  date: string
  sentCount: number
}

interface CampaignLogEntry {
  date: string
  leadName: string
  status: string
}

interface WhatsAppAccount {
  id: string
  status?: 'connected' | 'disconnected'
}

interface ChartPoint {
  day: string
  dateKey: string
  messages: number
}

const INITIAL_STATS: DashboardStats = {
  totalLeadsAvailable: 0,
  connectedAccounts: 0,
  pendingQueue: 0,
  totalMessagesSent: 0
}

function toDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildLast7DaySeries(history: CampaignHistoryEntry[]): ChartPoint[] {
  const totalsByDay: Record<string, number> = {}

  history.forEach((entry) => {
    const date = new Date(entry.date)
    if (Number.isNaN(date.getTime())) {
      return
    }

    const sentCount = Number(entry.sentCount)
    if (!Number.isFinite(sentCount)) {
      return
    }

    const key = toDayKey(date)
    totalsByDay[key] = (totalsByDay[key] || 0) + sentCount
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const points: ChartPoint[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)

    const key = toDayKey(date)
    points.push({
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateKey: key,
      messages: totalsByDay[key] || 0
    })
  }

  return points
}

function formatActivityTime(rawDate: string): string {
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time'
  }

  const diffMs = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < 2 * minute) {
    return 'Just now'
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'secondary' {
  const normalized = status.toLowerCase()

  if (normalized.includes('sent') || normalized.includes('replied')) {
    return 'success'
  }

  if (normalized.includes('pending')) {
    return 'warning'
  }

  if (normalized.includes('invalid') || normalized.includes('failed')) {
    return 'danger'
  }

  return 'secondary'
}

export default function DashboardScreen() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const isEngineRunning = useCampaignStore((state) => state.isEngineRunning)

  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS)
  const [chartData, setChartData] = useState<ChartPoint[]>(buildLast7DaySeries([]))
  const [recentActivity, setRecentActivity] = useState<CampaignLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        let totalLeadsAvailable = 0

        if (userId) {
          const { count, error } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)

          if (!error && count !== null) {
            totalLeadsAvailable = count
          }
        }

        const historyRaw = (await window.api?.storeGet?.('campaignHistory')) || []
        const logsRaw = (await window.api?.storeGet?.('campaignLogs')) || []
        const accountsRaw = (await window.api?.storeGet?.('whatsappAccounts')) || []

        const history = Array.isArray(historyRaw) ? (historyRaw as CampaignHistoryEntry[]) : []
        const logs = Array.isArray(logsRaw) ? (logsRaw as CampaignLogEntry[]) : []
        const accounts = Array.isArray(accountsRaw) ? (accountsRaw as WhatsAppAccount[]) : []

        let connectedAccounts = accounts.filter((account) => account.status === 'connected').length
        if (accounts.length > 0 && window.api?.checkWhatsapp) {
          const connectivity = await Promise.all(
            accounts.map(async (account) => {
              try {
                return await window.api.checkWhatsapp(account.id)
              } catch {
                return account.status === 'connected'
              }
            })
          )

          connectedAccounts = connectivity.filter(Boolean).length
        }

        const pendingQueue = logs.filter((log) => String(log.status).toLowerCase() === 'pending').length
        const totalMessagesSent = history.reduce((sum, entry) => {
          const sent = Number(entry.sentCount)
          return sum + (Number.isFinite(sent) ? sent : 0)
        }, 0)

        const latestFive = logs
          .slice()
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5)

        setStats({
          totalLeadsAvailable,
          connectedAccounts,
          pendingQueue,
          totalMessagesSent
        })
        setChartData(buildLast7DaySeries(history))
        setRecentActivity(latestFive)
      } catch (error) {
        console.error('Failed to load dashboard analytics', error)
      } finally {
        if (silent) {
          setRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [userId]
  )

  useEffect(() => {
    void loadDashboard()

    const interval = setInterval(() => {
      void loadDashboard(true)
    }, 20000)

    let removeRefreshListener: (() => void) | undefined
    if (window.api?.onForceLogsRefresh) {
      removeRefreshListener = window.api.onForceLogsRefresh(() => {
        void loadDashboard(true)
      })
    }

    return () => {
      clearInterval(interval)
      if (removeRefreshListener) {
        removeRefreshListener()
      }
    }
  }, [loadDashboard])

  const hasChartActivity = useMemo(() => chartData.some((point) => point.messages > 0), [chartData])
  const isConnected = stats.connectedAccounts > 0

  return (
    <div className="space-y-8 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Command Center</h1>
          <p className="mt-2 text-zinc-400">Live performance, queue pressure, and engine readiness at a glance.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadDashboard(true)}
          disabled={loading || refreshing}
          className="self-start border-zinc-700 bg-zinc-900/70 hover:bg-zinc-800"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing ? 'animate-spin' : '')} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Leads Available"
          value={stats.totalLeadsAvailable.toLocaleString()}
          subtitle="Ready to target"
          icon={Users}
          iconTone="text-indigo-300"
          loading={loading}
        />
        <KpiCard
          title="WhatsApp Accounts Connected"
          value={stats.connectedAccounts.toLocaleString()}
          subtitle={isConnected ? 'Channel online' : 'No active connection'}
          icon={Smartphone}
          iconTone="text-emerald-300"
          loading={loading}
        />
        <KpiCard
          title="Pending in Queue"
          value={stats.pendingQueue.toLocaleString()}
          subtitle={isEngineRunning ? 'Engine is dispatching now' : 'Waiting for next launch'}
          icon={Clock3}
          iconTone="text-amber-300"
          loading={loading}
        />
        <KpiCard
          title="Total Messages Sent"
          value={stats.totalMessagesSent.toLocaleString()}
          subtitle="Lifetime campaign volume"
          icon={Send}
          iconTone="text-sky-300"
          loading={loading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 border-zinc-800 bg-gradient-to-b from-[#15151a] to-[#101014]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold text-white">Messages Sent Over Last 7 Days</CardTitle>
              <CardDescription>Watch momentum build as campaigns go live.</CardDescription>
            </div>
            <BarChart3 className="h-5 w-5 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="relative h-[300px] w-full overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0d0d11] p-3">
              {hasChartActivity ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="messagesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#2f2f37" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#121216',
                        border: '1px solid #2c2c33',
                        borderRadius: '10px'
                      }}
                      labelStyle={{ color: '#f4f4f5', fontWeight: 600 }}
                      formatter={(value: number) => [value, 'Messages']}
                      labelFormatter={(_, payload) => {
                        const first = payload?.[0]?.payload as ChartPoint | undefined
                        return first ? first.dateKey : ''
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="#818cf8"
                      strokeWidth={2.2}
                      fillOpacity={1}
                      fill="url(#messagesGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 grid place-items-center">
                  <div
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(82,82,91,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(82,82,91,0.2) 1px, transparent 1px)',
                      backgroundSize: '34px 34px'
                    }}
                  />
                  <div className="relative z-10 max-w-sm text-center">
                    <p className="text-sm font-medium text-zinc-200">
                      No activity this week. Launch a campaign to see your stats grow!
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-zinc-800 bg-[#121214]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold text-white">System Status</CardTitle>
              <CardDescription>Automation engine and channel readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={cn('h-2.5 w-2.5 rounded-full', isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500')} />
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {isConnected ? 'Connected' : 'Idle'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {isEngineRunning ? 'Campaign engine is currently active.' : 'Engine is ready for the next launch.'}
                    </p>
                  </div>
                </div>
                <Badge variant={isConnected ? 'success' : 'secondary'}>{isConnected ? 'Online' : 'Idle'}</Badge>
              </div>

              <Button className="w-full" onClick={() => navigate('/campaigns')}>
                <Rocket className="h-4 w-4" />
                Launch New Campaign
              </Button>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-[#121214]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold text-white">Recent Activity</CardTitle>
              <CardDescription>Latest tracking events from your local campaign logs.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
                  No recent activity.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentActivity.map((item, index) => (
                    <div
                      key={`${item.date}-${item.leadName}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{item.leadName || 'Unknown lead'}</p>
                        <p className="text-xs text-zinc-500">{formatActivityTime(item.date)}</p>
                      </div>
                      <Badge variant={getStatusVariant(item.status)} className="shrink-0">
                        {item.status || 'Unknown'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconTone,
  loading
}: {
  title: string
  value: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  iconTone: string
  loading: boolean
}) {
  return (
    <Card className="border-zinc-800 bg-gradient-to-b from-[#15151a] to-[#101014]">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
        <div className="rounded-md border border-zinc-700 bg-zinc-900/80 p-2">
          <Icon className={cn('h-4 w-4', iconTone)} />
        </div>
          <div className="text-2xl font-semibold tracking-tight text-white">{loading ? '-' : value}</div>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      </CardContent>
    </Card>
  )
}