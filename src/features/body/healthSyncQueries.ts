import { supabase } from '../../lib/supabase'

export type HealthSyncStatus = {
  enabled: boolean
  issued_at: string | null
  last_synced_at: string | null
  last_synced_count: number | null
}
export type IssuedHealthSyncToken = { token: string; issued_at: string }
export const healthSyncEndpoint = `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/body-metrics`

const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Health sync response')
  return value as Record<string, unknown>
}
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nullableTimestamp = (value: unknown): value is string | null => value === null || timestamp(value)

export async function issueHealthSyncToken(): Promise<IssuedHealthSyncToken> {
  const { data, error } = await supabase.rpc('health_sync_issue_token')
  if (error) throw error
  const result = object(data)
  if (typeof result.token !== 'string' || !/^[a-f0-9]{64}$/.test(result.token) || !timestamp(result.issued_at)) {
    throw new Error('Invalid Health sync response')
  }
  return { token: result.token, issued_at: result.issued_at }
}

export async function fetchHealthSyncStatus(): Promise<HealthSyncStatus> {
  const { data, error } = await supabase.rpc('health_sync_status')
  if (error) throw error
  const result = object(data)
  if (typeof result.enabled !== 'boolean' || !nullableTimestamp(result.issued_at) || !nullableTimestamp(result.last_synced_at)
    || !(result.last_synced_count === null || (typeof result.last_synced_count === 'number' && Number.isInteger(result.last_synced_count) && result.last_synced_count >= 0))) {
    throw new Error('Invalid Health sync response')
  }
  return { enabled: result.enabled, issued_at: result.issued_at, last_synced_at: result.last_synced_at, last_synced_count: result.last_synced_count }
}

export async function revokeHealthSyncToken(): Promise<void> {
  const { error } = await supabase.rpc('health_sync_revoke_token')
  if (error) throw error
}
