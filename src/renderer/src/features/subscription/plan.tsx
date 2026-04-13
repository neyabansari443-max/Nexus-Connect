import { useAuth } from '@clerk/clerk-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../../lib/supabase'

export type PlanType = 'pro' | 'basic' | 'free' | 'unknown'
export type FeatureKey = 'dashboard' | 'campaigns' | 'settings'

const PLAN_ACCESS: Record<PlanType, Record<FeatureKey, boolean>> = {
  pro: { dashboard: true, campaigns: true, settings: true },
  basic: { dashboard: false, campaigns: false, settings: true },
  free: { dashboard: false, campaigns: false, settings: true },
  unknown: { dashboard: false, campaigns: false, settings: true }
}

type PlanContextValue = {
  planType: PlanType
  isPro: boolean
  isLoading: boolean
  error: string | null
  source: string
  userId: string | null
  refresh: () => Promise<void>
  canAccess: (feature: FeatureKey) => boolean
}

const PlanContext = createContext<PlanContextValue | null>(null)

function normalizePlanType(rawPlanType: string | null | undefined): PlanType {
  const normalized = (rawPlanType ?? '').toLowerCase()

  if (normalized === 'pro') {
    return 'pro'
  }

  if (normalized === 'basic') {
    return 'basic'
  }

  if (normalized === 'free') {
    return 'free'
  }

  return 'free'
}

async function fetchPlanTypeByUserId(userId: string): Promise<{ planType: PlanType; source: string; errors: string[] }> {
  const errors: string[] = []

  if (!supabase) {
    return { planType: 'free', source: 'none', errors }
  }

  const settingsResult = await supabase
    .from('user_settings')
    .select('plan_type')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (settingsResult.error) {
    errors.push(`user_settings: ${settingsResult.error.message}`)
  }

  if (settingsResult.data?.plan_type) {
    return {
      planType: normalizePlanType(settingsResult.data.plan_type),
      source: 'user_settings',
      errors
    }
  }

  const usageResult = await supabase
    .from('user_usage')
    .select('plan_type')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (usageResult.error) {
    errors.push(`user_usage: ${usageResult.error.message}`)
  }

  if (usageResult.data?.plan_type) {
    return {
      planType: normalizePlanType(usageResult.data.plan_type),
      source: 'user_usage',
      errors
    }
  }

  return {
    planType: 'free',
    source: 'not-found',
    errors
  }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth()
  const [planType, setPlanType] = useState<PlanType>('unknown')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('none')
  const lastResolvedUserIdRef = useRef<string | null>(null)

  const loadPlan = useCallback(async () => {
    if (!isLoaded) {
      return
    }

    if (!userId) {
      setPlanType('unknown')
      setIsLoading(false)
      setError(null)
      setSource('none')
      return
    }

    if (!supabase) {
      setPlanType('free')
      setIsLoading(false)
      setError('Supabase is not configured.')
      setSource('none')
      return
    }

    // Only show full-screen loading when the authenticated user changes.
    if (lastResolvedUserIdRef.current !== userId) {
      setIsLoading(true)
    }
    setError(null)

    const lookup = await fetchPlanTypeByUserId(userId)
    setPlanType(lookup.planType)
    setSource(lookup.source)
    setIsLoading(false)
    lastResolvedUserIdRef.current = userId

    if (lookup.errors.length && lookup.source === 'not-found') {
      setError(lookup.errors.join(' | '))
    }
  }, [isLoaded, userId])

  useEffect(() => {
    void loadPlan()
  }, [loadPlan])

  useEffect(() => {
    if (!isLoaded || !userId) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadPlan()
    }, 15000)

    const handleFocus = () => {
      void loadPlan()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isLoaded, userId, loadPlan])

  const value = useMemo<PlanContextValue>(() => {
    const accessMap = PLAN_ACCESS[planType] ?? PLAN_ACCESS.free

    return {
      planType,
      isPro: planType === 'pro',
      isLoading,
      error,
      source,
      userId,
      refresh: loadPlan,
      canAccess: (feature) => accessMap[feature]
    }
  }, [planType, isLoading, error, source, userId, loadPlan])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan(): PlanContextValue {
  const context = useContext(PlanContext)

  if (!context) {
    throw new Error('usePlan must be used inside PlanProvider')
  }

  return context
}
