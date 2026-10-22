import Dexie, { type EntityTable } from 'dexie'
import type { Routine, WorkoutLog, WorkoutSession } from '../types'
import { supabase } from './supabase'

type LocalSetting = { key: string; value: unknown }
type OutboxItem = { id?: number; entity: 'log' | 'settings' | 'deleteLog'; payload: unknown; createdAt: number }
class GymDatabase extends Dexie {
  settings!: EntityTable<LocalSetting, 'key'>
  routines!: EntityTable<Routine, 'id'>
  logs!: EntityTable<WorkoutLog, 'id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>
  constructor() { super('gym-progress-v2'); this.version(1).stores({ settings: 'key', routines: 'id', logs: 'id,date,exercise,muscle,sessionId', sessions: 'id,date', outbox: '++id,entity,createdAt' }) }
}
export const db = new GymDatabase()
export async function getSetting<T>(key: string, fallback: T): Promise<T> { return ((await db.settings.get(key))?.value as T | undefined) ?? fallback }
export async function setSetting(key: string, value: unknown) { await db.settings.put({ key, value }) }
export async function getLocalData() { const [routines, logs, session, unit, theme] = await Promise.all([db.routines.toArray(), db.logs.orderBy('date').reverse().toArray(), db.sessions.toCollection().first(), getSetting('unit', 'kg'), getSetting('theme', 'system')]); return { routines, logs, session: session ?? null, unit, theme } }
export async function enqueue(entity: OutboxItem['entity'], payload: unknown) { if (entity === 'settings') await db.outbox.where('entity').equals('settings').delete(); await db.outbox.add({ entity, payload, createdAt: Date.now() }); void requestBackgroundSync() }
async function requestBackgroundSync() { try { const reg = await navigator.serviceWorker?.ready; const syncReg = reg as (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }) | undefined; await syncReg?.sync?.register('gym-progress-outbox') } catch { /* online/foreground sync remains available */ } }
export async function syncOutbox() {
  if (!supabase || !navigator.onLine) return 0
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  let synced = 0
  for (const item of await db.outbox.orderBy('createdAt').toArray()) {
    try {
      if (item.entity === 'log') {
        const l = item.payload as WorkoutLog
        const { error } = await supabase.from('exercise_logs').upsert({ id: l.id, user_id: user.id, exercise: l.exercise, muscle: l.muscle, exercise_group: l.group, weight: l.weight, reps: l.reps, sets: l.sets, logged_on: l.date, session_id: l.sessionId ?? null, routine_name: l.routineName ?? null, set_details: l.setDetails ?? [], notes: l.notes ?? '' }, { onConflict: 'id' })
        if (error) throw error
        await db.logs.update(l.id, { pendingSync: false })
      } else if (item.entity === 'deleteLog') {
        const { error } = await supabase.from('exercise_logs').delete().eq('id', (item.payload as { id: string }).id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const s = item.payload as { routines: Routine[]; activeRoutineId: string; session: WorkoutSession | null }
        const { error } = await supabase.from('gym_settings').upsert({ user_id: user.id, routines: s.routines, active_routine_id: s.activeRoutineId, active_session: s.session }, { onConflict: 'user_id' })
        if (error) throw error
      }
      await db.outbox.delete(item.id!)
      synced++
    } catch (error) {
      console.info('Workout data is safely queued for a later sync.', error)
      break
    }
  }
  return synced
}
