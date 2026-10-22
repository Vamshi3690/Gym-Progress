import { create } from 'zustand'
import type { Routine, WorkoutLog, WorkoutSession } from '../types'
export type Tab = 'Today' | 'Routines' | 'Library' | 'Progress'
type AppStore = { tab: Tab; routines: Routine[]; activeRoutineId: string; logs: WorkoutLog[]; session: WorkoutSession | null; unit: 'kg' | 'lb'; theme: string; group?: string; muscle?: string; exercise?: string; query: string; beginOnly: boolean; set: (partial: Partial<AppStore>) => void }
export const useApp = create<AppStore>((set) => ({ tab: 'Today', routines: [], activeRoutineId: '', logs: [], session: null, unit: 'kg', theme: 'system', query: '', beginOnly: false, set: (partial) => set(partial) }))
