import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Dumbbell, Flame, Library, LoaderCircle, LogIn, LogOut, Plus, Search, Settings2, Sparkles, TimerReset, Trash2, Trophy, X } from 'lucide-react'
import { Badge, Button, Card } from './components/ui'
import { exercises, groups, routineExercise, starterRoutines } from './data/exercises'
import { db, enqueue, getLocalData, getSetting, setSetting, syncOutbox } from './lib/db'
import { cloudConfigured, supabase } from './lib/supabase'
import { useApp, type Tab } from './store/app'
import type { Routine, RoutineDay, RoutineExercise, SessionExercise, WorkoutLog, WorkoutSession, WorkoutSet } from './types'

const tabs: { id: Tab; icon: typeof Activity; title: string }[] = [{ id: 'Today', icon: Activity, title: 'Today' }, { id: 'Routines', icon: CalendarDays, title: 'Routines' }, { id: 'Library', icon: Library, title: 'Library' }, { id: 'Progress', icon: BarChart3, title: 'Progress' }]
const ProgressChart = lazy(() => import('./components/ProgressChart'))
const uid = () => crypto.randomUUID()
const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const progressSets = (log: WorkoutLog) => { const sets = log.setDetails?.filter((set) => set.type !== 'Warm-up') ?? []; return sets.length ? sets : [{ weight: log.weight, reps: log.reps }] }
const volume = (log: WorkoutLog) => progressSets(log).reduce((sum, set) => sum + set.weight * set.reps, 0)
const prettyWeight = (kg: number, unit: 'kg' | 'lb') => `${(unit === 'lb' ? kg * 2.20462262 : kg).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
const blankSet = (weight = 0, reps = 8): WorkoutSet => ({ id: uid(), type: 'Working', weight, reps, complete: false })
type Notice = { text: string; kind?: 'success' | 'error' }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export default function App() {
  const store = useApp()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<NonNullable<Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getUser']>>['data']['user']> | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [sessionOpen, setSessionOpen] = useState(false)
  const [exerciseOpen, setExerciseOpen] = useState<string | null>(null)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [routineEditId, setRoutineEditId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [timer, setTimer] = useState(0)
  const [timerDuration, setTimerDuration] = useState(0)
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const local = await getLocalData()
        if (!active) return
        let routines = local.routines
        let logs = local.logs
        let session = local.session
        // Bring forward legacy localStorage data from the single-file app.
        const legacy = JSON.parse(localStorage.getItem('gym-progress-v1') || 'null')
        if (legacy) {
          if (!routines.length && Array.isArray(legacy.routines)) { routines = legacy.routines; await db.routines.bulkPut(routines) }
          if (!logs.length && Array.isArray(legacy.logs)) { logs = legacy.logs.map((l: Record<string, unknown>) => ({ ...l, group: l.group ?? 'Other', setDetails: l.setDetails ?? [] })) as WorkoutLog[]; await db.logs.bulkPut(logs) }
          if (!session && legacy.activeSession) { const recovered = legacy.activeSession as WorkoutSession; session = recovered; await db.sessions.put(recovered) }
        }
        store.set({ routines: routines.length ? routines : starterRoutines, activeRoutineId: routines.length ? (String(await getSetting('activeRoutineId', routines[0]?.id ?? '')) || routines[0]?.id) : starterRoutines[0].id, logs, session, unit: local.unit === 'lb' ? 'lb' : 'kg', theme: String(local.theme) })
        if (!routines.length) await db.routines.bulkPut(starterRoutines)
        setBusy(false)
      } catch { setBusy(false) }
    })()
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => { if (active) { setUser(data.session?.user ?? null); setAuthReady(true) } })
      const { data } = supabase.auth.onAuthStateChange((_event, next) => { setUser(next?.user ?? null); setAuthReady(true) })
      return () => { active = false; data.subscription.unsubscribe() }
    }
    return () => { active = false }
  }, [])

  const remote = useQuery({ queryKey: ['cloud-data', user?.id], enabled: !!user && !!supabase, queryFn: async () => {
    const [{ data: settings, error: settingsError }, { data: rows, error: logsError }] = await Promise.all([
      supabase!.from('gym_settings').select('routines,active_routine_id,active_session').eq('user_id', user!.id).maybeSingle(),
      supabase!.from('exercise_logs').select('*').eq('user_id', user!.id).order('logged_on', { ascending: false }),
    ])
    if (settingsError) throw settingsError
    if (logsError) throw logsError
    return { settings, logs: rows ?? [] }
  } })
  useEffect(() => {
    if (!remote.data || busy) return
    void (async () => {
      const remoteRoutines = remote.data!.settings?.routines as Routine[] | undefined
      const remoteLogs: WorkoutLog[] = remote.data!.logs.map((row) => ({ id: row.id, exercise: row.exercise, muscle: row.muscle ?? 'Other', group: row.exercise_group ?? 'Other', weight: Number(row.weight), reps: Number(row.reps), sets: Number(row.sets), date: row.logged_on, sessionId: row.session_id ?? undefined, routineName: row.routine_name ?? undefined, setDetails: row.set_details ?? [], notes: row.notes ?? '' }))
      const localLogs = await db.logs.toArray()
      const cloudIds = new Set(remoteLogs.map((l) => l.id))
      const mergedLogs = [...remoteLogs, ...localLogs.filter((l) => !cloudIds.has(l.id))].sort((a, b) => b.date.localeCompare(a.date))
      store.set({ logs: mergedLogs })
      if (mergedLogs.length) await db.logs.bulkPut(mergedLogs)
      if (remoteRoutines?.length) { store.set({ routines: remoteRoutines, activeRoutineId: remote.data!.settings?.active_routine_id ?? remoteRoutines[0].id }); await db.routines.clear(); await db.routines.bulkPut(remoteRoutines) }
      else await enqueue('settings', { routines: store.routines.length ? store.routines : starterRoutines, activeRoutineId: store.activeRoutineId || starterRoutines[0].id, session: store.session })
      for (const log of localLogs) if (!cloudIds.has(log.id)) await enqueue('log', log)
      const remoteSession = remote.data!.settings?.active_session as WorkoutSession | null
      if (remoteSession) { store.set({ session: remoteSession }); await db.sessions.put(remoteSession) }
      else if (store.session) await enqueue('settings', { routines: store.routines, activeRoutineId: store.activeRoutineId, session: store.session })
      if (!remoteLogs.length || mergedLogs.length > remoteLogs.length) void syncOutbox().then(() => queryClient.invalidateQueries({ queryKey: ['cloud-data'] }))
    })()
  }, [remote.data, busy, queryClient])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 3400)
    return () => window.clearTimeout(timeout)
  }, [notice])
  useEffect(() => {
    if (timer <= 0) return
    const id = window.setTimeout(() => setTimer((n) => n - 1), 1000)
    return () => window.clearTimeout(id)
  }, [timer])
  useEffect(() => {
    const sync = () => { void syncOutbox().then(() => queryClient.invalidateQueries({ queryKey: ['cloud-data'] })) }
    window.addEventListener('online', sync)
    window.addEventListener('focus', sync)
    navigator.serviceWorker?.addEventListener('message', (event) => { if (event.data?.type === 'SYNC_OUTBOX') sync() })
    return () => { window.removeEventListener('online', sync); window.removeEventListener('focus', sync) }
  }, [queryClient])
  useEffect(() => {
    const onOnline = () => setNetworkOnline(true)
    const onOffline = () => setNetworkOnline(false)
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('beforeinstallprompt', onInstall)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('beforeinstallprompt', onInstall) }
  }, [])
  useEffect(() => {
    if (store.theme === 'dark' || (store.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark'
    else document.documentElement.dataset.theme = 'light'
  }, [store.theme])

  const activeRoutine = store.routines.find((r) => r.id === store.activeRoutineId) ?? store.routines[0]
  const currentExercise = exercises.find((e) => e.name === exerciseOpen)
  const userLogsForSelected = useMemo(() => store.logs.filter((l) => l.exercise === exerciseOpen).sort((a, b) => a.date.localeCompare(b.date)), [store.logs, exerciseOpen])
  const filteredExercises = useMemo(() => exercises.filter((e) => (!exerciseQuery || `${e.name} ${e.muscle} ${e.group}`.toLowerCase().includes(exerciseQuery.toLowerCase())) && (!store.beginOnly || e.level === 'Beginner')), [exerciseQuery, store.beginOnly])

  function flash(text: string, kind: Notice['kind'] = 'success') { setNotice({ text, kind }) }
  async function persistRoutines(routines: Routine[], activeRoutineId = store.activeRoutineId, session = store.session) {
    store.set({ routines, activeRoutineId }); await db.routines.bulkPut(routines); await setSetting('activeRoutineId', activeRoutineId)
    if (user) await enqueue('settings', { routines, activeRoutineId, session })
  }
  async function persistSession(session: WorkoutSession | null) {
    store.set({ session }); if (session) await db.sessions.put(session); else await db.sessions.clear()
    if (user) await enqueue('settings', { routines: store.routines, activeRoutineId: store.activeRoutineId, session })
  }
  async function startSession(routine: Routine, day: RoutineDay) {
    if (day.rest) { flash('A rest day is planned. Take time to recover.'); return }
    if (store.session && !window.confirm('Replace the workout currently in progress? Its draft will be saved as a recovery copy.')) return
    const old = store.session
    if (old) await setSetting(`recovery-${old.id}`, old)
    const entries = day.exercises.map((e) => {
      const previous = store.logs.find((l) => l.exercise === e.name)
      const last = previous?.setDetails?.filter((s) => s.type !== 'Warm-up').at(-1)
      return { ...e, targetSets: e.sets || 3, sets: Array.from({ length: e.sets || 3 }, () => blankSet(last?.weight ?? 0, last?.reps ?? 8)) } as SessionExercise
    })
    const session: WorkoutSession = { id: uid(), routineId: routine.id, routineName: routine.name, dayId: day.id, dayName: day.name, date: dateKey(), startedAt: new Date().toISOString(), exercises: entries }
    await persistSession(session); setSessionOpen(true); store.set({ tab: 'Today' })
  }
  async function updateSession(fn: (s: WorkoutSession) => WorkoutSession) {
    if (!store.session) return
    const next = fn(structuredClone(store.session)); await persistSession(next)
  }
  async function finishSession() {
    const session = store.session
    if (!session) return
    const newLogs: WorkoutLog[] = session.exercises.flatMap((exercise) => {
      const completed = exercise.sets.filter((s) => s.complete && s.reps > 0)
      if (!completed.length) return []
      const working = completed.filter((s) => s.type !== 'Warm-up')
      const useful = working.length ? working : completed
      return [{ id: uid(), exercise: exercise.name, muscle: exercise.muscle, group: exercise.group, weight: Math.max(...useful.map((s) => s.weight)), reps: Math.round(useful.reduce((sum, s) => sum + s.reps, 0) / useful.length), sets: useful.length, date: session.date, sessionId: session.id, routineName: session.routineName, setDetails: completed, notes: exercise.notes }]
    })
    if (!newLogs.length) { flash('Mark at least one set done before finishing.', 'error'); return }
    const prs = newLogs.filter((entry) => entry.weight > Math.max(0, ...store.logs.filter((l) => l.exercise === entry.exercise).map((l) => l.weight)))
    for (const entry of newLogs) { await db.logs.put({ ...entry, pendingSync: !!user }); if (user) await enqueue('log', entry) }
    await db.sessions.clear(); store.set({ session: null, logs: [...newLogs, ...store.logs] }); setSessionOpen(false); setTimer(0)
    if (user) { await enqueue('settings', { routines: store.routines, activeRoutineId: store.activeRoutineId, session: null }); void syncOutbox().then(() => queryClient.invalidateQueries({ queryKey: ['cloud-data'] })) }
    flash(prs.length ? `🏆 New personal record: ${prs.map((p) => p.exercise).join(', ')}` : `Workout saved · ${newLogs.length} exercises logged`)
  }
  async function logSet(exerciseIndex: number, setIndex: number, routineRest = 90) {
    await updateSession((s) => { s.exercises[exerciseIndex].sets[setIndex].complete = true; return s })
    const rest = timerDuration || routineRest
    setTimer(rest); flash(`Set complete · ${rest === 120 ? '2 minutes' : `${rest} seconds`} rest started`)
  }
  async function saveRoutine(name: string, days: RoutineDay[], editingId?: string) {
    const dayData = [{ id: uid(), name: 'Workout A', focus: '', exercises: [routineExercise(exercises[0].name)] }]
    const existing = store.routines.find((r) => r.id === editingId)
    const routine: Routine = { id: existing?.id ?? uid(), name: name.trim() || 'My routine', days: days.length ? days : dayData }
    const all = existing ? store.routines.map((r) => r.id === existing.id ? routine : r) : [...store.routines, routine]
    await persistRoutines(all, routine.id); setRoutineOpen(false); setRoutineEditId(null); flash(existing ? 'Routine updated' : 'Routine created')
  }
  async function removeRoutine(id: string) {
    if (store.routines.length < 2) { flash('Keep at least one routine.', 'error'); return }
    const all = store.routines.filter((r) => r.id !== id); await persistRoutines(all, id === store.activeRoutineId ? all[0].id : store.activeRoutineId); flash('Routine removed')
  }
  async function duplicateRoutine(routine: Routine) {
    const copy: Routine = { ...structuredClone(routine), id: uid(), name: `${routine.name} copy`, days: routine.days.map((d) => ({ ...d, id: uid(), exercises: d.exercises.map((e) => ({ ...e })) })) }
    await persistRoutines([...store.routines, copy], copy.id); flash('Routine duplicated')
  }
  async function changeUnit(unit: 'kg' | 'lb') { store.set({ unit }); await setSetting('unit', unit) }
  async function changeTheme(theme: string) { store.set({ theme }); await setSetting('theme', theme) }
  async function addExerciseToWorkout(name: string) {
    const routine = activeRoutine
    const day = routine?.days.find((d) => d.id === store.session?.dayId) ?? (today && !today.rest ? today : routine?.days.find((d) => !d.rest))
    if (!routine || !day) { flash('Choose a training day in Routines first.', 'error'); return }
    const exercise = routineExercise(name)
    if (store.session && store.session.dayId === day.id) {
      await updateSession((s) => ({ ...s, exercises: [...s.exercises, { ...exercise, targetSets: 3, sets: Array.from({ length: 3 }, () => blankSet()) }] }))
      setSessionOpen(true)
    } else {
      const next = { ...day, exercises: [...day.exercises, exercise] }
      await persistRoutines(store.routines.map((r) => r.id !== routine.id ? r : { ...r, days: r.days.map((d) => d.id === day.id ? next : d) }))
      flash(`Added ${name} to ${day.name}`)
    }
    setExerciseOpen(null)
  }
  async function authSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const form = new FormData(event.currentTarget); setAuthError(''); setAuthMessage('')
    const email = String(form.get('email')), password = String(form.get('password'))
    const result = authMode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    if (result.error) setAuthError(result.error.message)
    else if (authMode === 'signup' && !result.data.session) setAuthMessage('Check your email for the confirmation link, then return here to sign in.')
    else { setUser(result.data.user); setAuthOpen(false); flash('Account connected') }
  }
  async function signOut() { await supabase?.auth.signOut(); setUser(null); flash('Signed out · this device keeps its saved workouts') }
  async function deleteLog(id: string) { await db.logs.delete(id); store.set({ logs: store.logs.filter((l) => l.id !== id) }); if (user) { await enqueue('deleteLog', { id }); void syncOutbox().then(() => queryClient.invalidateQueries({ queryKey: ['cloud-data'] })) } flash('Workout entry deleted') }
  function exportCsv() {
    const rows = [['Date', 'Routine', 'Exercise', 'Muscle', 'Weight kg', 'Reps', 'Sets'], ...store.logs.map((l) => [l.date, l.routineName ?? '', l.exercise, l.muscle, l.weight, l.reps, l.sets])]
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'gym-progress.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  async function installApp() { if (installPrompt) { await installPrompt.prompt(); const choice = await installPrompt.userChoice; setInstallPrompt(null); if (choice.outcome === 'accepted') flash('Gym Progress is ready on your home screen') } else flash('Use your browser menu and choose “Add to Home Screen” to install the app.') }

  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i); return dateKey(d) })
  const dayStreak = (() => { const days = new Set(store.logs.map((log) => log.date)); let d = new Date(); if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1); let n = 0; while (days.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1) } return n })()
  const todayIndex = activeRoutine?.days.length ? (new Date().getDay() - 1 + 7) % activeRoutine.days.length : -1
  const today = activeRoutine?.days[todayIndex]

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={(e) => { e.preventDefault(); store.set({ tab: 'Today', group: undefined, muscle: undefined, exercise: undefined }) }}><span className="brand-mark">✳</span><span>gym<span className="brand-light">progress</span></span></a><div className="top-actions"><span className={`connection ${networkOnline ? 'online' : 'offline'}`}><i />{user ? (remote.isFetching ? 'Syncing' : 'Synced') : networkOnline ? 'On this device' : 'Offline'}</span><Button variant="ghost" className="settings-trigger" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></Button>{user ? <Button variant="ghost" className="account-button" onClick={signOut}><LogOut size={17} /><span>Sign out</span></Button> : cloudConfigured && <Button variant="soft" className="account-button" onClick={() => setAuthOpen(true)}><LogIn size={17} /><span>Sign in</span></Button>}</div></header>
    {user && remote.isError && <div className="cloud-warning" role="status"><CircleHelp size={16} /><span>Cloud sync is paused. Check that the workout fields from <strong>supabase/workout-upgrade.sql</strong> have been added. Your device copy is safe.</span></div>}
    <main className="main-content">
      {!authReady || busy ? <div className="loading-screen"><LoaderCircle className="spin" size={30} /><span>Getting your gym ready…</span></div> : store.session && sessionOpen ? <WorkoutSessionView session={store.session} unit={store.unit} logs={store.logs} duration={timerDuration} timer={timer} onDuration={setTimerDuration} onEdit={updateSession} onComplete={logSet} onFinish={finishSession} onClose={() => { setSessionOpen(false); store.set({ tab: 'Today' }) }} onTimer={setTimer} /> : store.tab === 'Today' ? <>
        <div className="page-heading"><div><span className="eyebrow">MONDAY MINDSET, ANY DAY</span><h1>Your training,<br className="mobile-break" /> one day at a time.</h1><p className="lede">Open today’s plan, follow the steps, and see yourself getting stronger.</p></div><Badge tone="green"><Sparkles size={13} /> Beginner friendly</Badge></div>
        <section className="dashboard-grid"><Card className="today-card"><div className="today-top"><span className="eyebrow">TODAY · {new Date().toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()}</span><CalendarDays size={19} /></div><h2>{today?.name.split(' · ').at(-1) ?? 'Rest & recover'}</h2><p>{today?.focus || 'Your body gets stronger while it recovers.'}</p>{today?.rest ? <Button onClick={() => flash('Enjoy your recovery day!')} variant="soft">Rest & recover <Check size={16} /></Button> : <Button onClick={() => activeRoutine && today && void startSession(activeRoutine, today)}>Start today’s workout <ArrowRight size={17} /></Button>}</Card>
          <Card className="coach-card"><div className="coach-icon"><Sparkles size={17} /></div><span className="eyebrow">YOUR NEXT STEP</span><h3>{(() => { const last = store.logs[0]; return !last ? 'Start with a comfortable weight' : last.reps >= 12 ? `Ready to add ${store.unit === 'kg' ? '2.5 kg' : '5 lb'}?` : `Build toward 12 reps on ${last.exercise}` })()}</h3><p>Keep your reps controlled and your technique consistent. Small, steady steps win.</p><button className="text-link" onClick={() => store.set({ tab: 'Library' })}>Explore the exercise library <ArrowRight size={14} /></button></Card>
        </section>
        {store.session && <button className="resume-session" onClick={() => setSessionOpen(true)}><span className="resume-icon"><Activity size={17} /></span><span><strong>Workout in progress · {store.session.dayName}</strong><small>Continue your saved draft · {store.session.exercises.length} exercises</small></span><ArrowRight size={17} /></button>}
        <div className="section-header"><div><span className="eyebrow">YOUR PLAN</span><h2>{activeRoutine?.name ?? 'Choose a routine'}</h2></div><button className="text-link" onClick={() => store.set({ tab: 'Routines' })}>All routines <ArrowRight size={14} /></button></div>
        <div className="day-grid">{activeRoutine?.days.map((day, i) => <button className={`day-card ${day === today ? 'is-today' : ''}`} key={day.id} onClick={() => day.rest ? flash('This is a recovery day.') : activeRoutine && void startSession(activeRoutine, day)}><span className="day-number">{String(i + 1).padStart(2, '0')}</span><div><span className="day-title">{day.name.split(' · ').at(-1)}</span><span className="day-focus">{day.focus || (day.rest ? 'Recovery' : `${day.exercises.length} exercises`)}</span></div><ArrowRight size={17} /></button>)}</div>
        <section className="quick-stats"><div><span>Workout days</span><strong>{new Set(store.logs.map((l) => l.date)).size}</strong></div><div><span>Day streak</span><strong>{dayStreak} <Flame size={16} className="flame" /></strong></div><div><span>Exercise entries</span><strong>{store.logs.length}</strong></div></section>
      </> : store.tab === 'Routines' ? <RoutinesView routines={store.routines} activeId={store.activeRoutineId} onSelect={(r) => { store.set({ activeRoutineId: r.id }); void setSetting('activeRoutineId', r.id) }} onStart={startSession} onCreate={() => { setRoutineEditId(null); setRoutineOpen(true) }} onEdit={(r) => { setRoutineEditId(r.id); setRoutineOpen(true) }} onDuplicate={duplicateRoutine} onDelete={removeRoutine} /> : store.tab === 'Library' ? <LibraryView query={exerciseQuery} onQuery={setExerciseQuery} results={filteredExercises} group={store.group} muscle={store.muscle} beginOnly={store.beginOnly} setBeginOnly={(value) => store.set({ beginOnly: value })} onGroup={(g) => store.set({ group: g, muscle: undefined })} onMuscle={(m) => store.set({ muscle: m })} onBack={() => store.set({ group: undefined, muscle: undefined })} onExercise={setExerciseOpen} /> : <ProgressView logs={store.logs} unit={store.unit} days={weekDays} streak={dayStreak} onDelete={deleteLog} onExercise={setExerciseOpen} onExport={exportCsv} />}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({ id, icon: Icon, title }) => <button key={id} className={`nav-item ${store.tab === id ? 'active' : ''}`} onClick={() => { store.set({ tab: id, group: undefined, muscle: undefined, exercise: undefined }); setExerciseQuery('') }}><Icon size={19} strokeWidth={store.tab === id ? 2.3 : 1.8} /><span>{title}</span></button>)}</nav>
    {timer > 0 && <aside className="rest-timer"><div><span className="eyebrow">REST TIMER</span><strong>{String(Math.floor(timer / 60)).padStart(2, '0')}:{String(timer % 60).padStart(2, '0')}</strong></div><button aria-label="Add 30 seconds" onClick={() => setTimer((n) => n + 30)}>+30s</button><button aria-label="Stop timer" onClick={() => setTimer(0)}><X size={17} /></button></aside>}
    {settingsOpen && <Modal title="Settings" eyebrow="MAKE IT YOURS" onClose={() => setSettingsOpen(false)}><div className="settings-block"><span>WEIGHT UNITS</span><div><button className={`setting-choice ${store.unit === 'kg' ? 'chosen' : ''}`} onClick={() => void changeUnit('kg')}>Kilograms · kg</button><button className={`setting-choice ${store.unit === 'lb' ? 'chosen' : ''}`} onClick={() => void changeUnit('lb')}>Pounds · lb</button></div></div><div className="settings-block"><span>APPEARANCE</span><div><button className={`setting-choice ${store.theme === 'system' ? 'chosen' : ''}`} onClick={() => void changeTheme('system')}>Device</button><button className={`setting-choice ${store.theme === 'light' ? 'chosen' : ''}`} onClick={() => void changeTheme('light')}>Light</button><button className={`setting-choice ${store.theme === 'dark' ? 'chosen' : ''}`} onClick={() => void changeTheme('dark')}>Dark</button></div></div><div className="settings-block"><span>BACKUP</span><p className="muted">Your workouts are saved on this device and queued for cloud sync when you sign in.</p><Button variant="soft" onClick={exportCsv}>Export workouts CSV <ArrowRight size={15} /></Button> <Button variant="soft" onClick={installApp}>Add to Home Screen <Plus size={15} /></Button></div><div className="settings-block"><span>ACCOUNT SYNC</span>{user ? <div><p className="muted">Signed in as {user.email}</p><Button variant="soft" onClick={signOut}><LogOut size={15} /> Sign out</Button></div> : <Button variant="soft" onClick={() => { setSettingsOpen(false); setAuthOpen(true) }} disabled={!cloudConfigured}><LogIn size={15} /> Sign in to sync</Button>}</div></Modal>}
    {authOpen && <Modal title={authMode === 'signin' ? 'Welcome back' : 'Create your account'} eyebrow="YOUR WORKOUTS, YOURS ALONE" onClose={() => setAuthOpen(false)}><p className="muted">Sign in to sync your workouts across devices. You can keep logging on this device without an account.</p><form className="stack-form" onSubmit={authSubmit}><label>Email<input name="email" type="email" placeholder="you@example.com" required autoComplete="email" /></label><label>Password<input name="password" type="password" placeholder="At least 6 characters" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></label>{authError && <p className="form-error">{authError}</p>}{authMessage && <p className="form-success">{authMessage}</p>}<Button type="submit" disabled={!cloudConfigured}>{authMode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></Button></form><button className="text-link auth-switch" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); setAuthMessage('') }}>{authMode === 'signin' ? 'New to Gym Progress? Create account' : 'Already have an account? Sign in'}</button></Modal>}
    {routineOpen && <RoutineModal initial={store.routines.find((r) => r.id === routineEditId)} onClose={() => setRoutineOpen(false)} onSave={(name, days) => void saveRoutine(name, days, routineEditId ?? undefined)} />}
    {exerciseOpen && currentExercise && <ExerciseModal exercise={currentExercise} logs={userLogsForSelected} unit={store.unit} onClose={() => setExerciseOpen(null)} onAdd={() => void addExerciseToWorkout(currentExercise.name)} />}
    {notice && <div className={`toast ${notice.kind === 'error' ? 'toast-error' : ''}`} role="status"><span>{notice.kind === 'error' ? <CircleHelp size={17} /> : <Check size={17} />}</span>{notice.text}</div>}
  </div>
}

function WorkoutSessionView({ session, unit, logs, duration, timer, onDuration, onEdit, onComplete, onFinish, onClose, onTimer }: { session: WorkoutSession; unit: 'kg' | 'lb'; logs: WorkoutLog[]; duration: number; timer: number; onDuration: (n: number) => void; onEdit: (fn: (s: WorkoutSession) => WorkoutSession) => Promise<void>; onComplete: (e: number, s: number, rest: number) => void; onFinish: () => void; onClose: () => void; onTimer: (n: number) => void }) {
  const completed = session.exercises.flatMap((e) => e.sets).filter((s) => s.complete).length
  const total = session.exercises.reduce((n, e) => n + e.sets.length, 0)
  function editSet(ei: number, si: number, patch: Partial<WorkoutSet>) { void onEdit((s) => { s.exercises[ei].sets[si] = { ...s.exercises[ei].sets[si], ...patch }; return s }) }
  function repeatPrevious(ei: number, si: number) { const ex = session.exercises[ei], last = logs.find((l) => l.exercise === ex.name); if (!last) return; const previous = last.setDetails?.filter((s) => s.type !== 'Warm-up')[si] ?? last.setDetails?.filter((s) => s.type !== 'Warm-up').at(-1); editSet(ei, si, { weight: previous?.weight ?? last.weight, reps: previous?.reps ?? last.reps, complete: false }) }
  function cloneSet(ei: number, si: number) { void onEdit((s) => { const source = s.exercises[ei].sets[si]; s.exercises[ei].sets.splice(si + 1, 0, { ...source, id: uid(), complete: false }); return s }) }
  function addSet(ei: number) { void onEdit((s) => { const sets = s.exercises[ei].sets; sets.push({ ...sets.at(-1)!, id: uid(), complete: false }); return s }) }
  return <div className="session-page"><div className="session-header"><button className="icon-back" onClick={onClose} aria-label="Back to today"><ArrowLeft size={19} /></button><div><span className="eyebrow">WORKOUT IN PROGRESS · {formatDate(session.date)}</span><h1>{session.dayName}</h1><p>{session.routineName} · {completed} of {total} sets completed · auto-saved</p></div><Button variant="soft" onClick={onFinish}>Finish <Check size={16} /></Button></div><div className="session-progress"><span style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div><Card className="session-guide"><div className="guide-symbol"><CircleHelp size={18} /></div><p><strong>New to lifting?</strong> A rep is one repetition; a set is a group of reps. RPE 7 means you could do about 3 more. Aim for smooth, controlled movement.</p></Card><div className="session-toolbar"><label><Clock3 size={17} /> Rest after a set <select value={duration} onChange={(e) => onDuration(Number(e.target.value))}><option value={0}>Routine default</option><option value={60}>60 sec</option><option value={90}>90 sec</option><option value={120}>2 min</option></select></label><button className="text-link" onClick={() => onTimer(duration || 90)}>Start timer <TimerReset size={15} /></button>{timer > 0 && <b className="inline-timer">{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</b>}</div>{session.exercises.length === 0 && <Card><div className="empty-state">This workout has no exercises yet. Add some in your routine.</div></Card>}
    <div className="session-exercises">{session.exercises.map((exercise, ei) => { const previous = logs.find((l) => l.exercise === exercise.name); return <Card className="session-exercise" key={`${exercise.name}-${ei}`}><div className="session-exercise-head"><div><span className="eyebrow">{exercise.group} · {exercise.muscle}</span><h2>{exercise.name}</h2>{previous ? <p className="previous-line">Last time · {prettyWeight(previous.weight, unit)} × {previous.reps} reps · {previous.sets} sets ({formatDate(previous.date)})</p> : <p className="previous-line">First time? Start light with 3 sets of 8–12.</p>}</div><span className="target-chip">{exercise.targetSets} × {exercise.reps}</span></div><div className="set-table-head"><span>Set</span><span>Type</span><span>Weight</span><span>Reps</span><span>Done</span></div>{exercise.sets.map((set, si) => <div className={`set-row ${set.complete ? 'set-done' : ''}`} key={set.id}><span className="set-index">{si + 1}</span><select aria-label="Set type" value={set.type} onChange={(e) => editSet(ei, si, { type: e.target.value as WorkoutSet['type'] })}><option>Warm-up</option><option>Working</option><option>Failure</option><option>Drop</option></select><label className="unit-input"><input type="number" min="0" step={unit === 'kg' ? '0.5' : '1'} value={Number((unit === 'kg' ? set.weight : set.weight * 2.20462262).toFixed(1))} onChange={(e) => editSet(ei, si, { weight: Number(e.target.value) / (unit === 'kg' ? 1 : 2.20462262) })} /><small>{unit}</small></label><label className="rep-input"><input type="number" min="0" value={set.reps} onChange={(e) => editSet(ei, si, { reps: Number(e.target.value) })} /><small>reps</small></label><button className={`set-check ${set.complete ? 'checked' : ''}`} aria-label={set.complete ? 'Mark set incomplete' : 'Complete set'} onClick={() => set.complete ? editSet(ei, si, { complete: false }) : onComplete(ei, si, exercise.rest)}>{set.complete ? <Check size={17} /> : 'Done'}</button><div className="set-more"><select aria-label="Optional RPE" value={set.rpe ?? ''} onChange={(e) => editSet(ei, si, { rpe: e.target.value ? Number(e.target.value) : undefined })}><option value="">RPE · optional</option>{Array.from({ length: 13 }, (_, i) => i).filter((i) => i > 0).map((i) => <option key={i} value={i}>{i}</option>)}</select><input placeholder="Set note (optional)" value={set.notes ?? ''} onChange={(e) => editSet(ei, si, { notes: e.target.value })} /><button className="use-last" disabled={!previous} onClick={() => repeatPrevious(ei, si)} title="Use the matching set from last time">↻ Last</button><button className="mini-icon" onClick={() => cloneSet(ei, si)} aria-label="Duplicate this set"><Plus size={15} /></button></div></div>)}<button className="add-set" onClick={() => addSet(ei)}><Plus size={15} /> Add set</button><label className="exercise-note">Exercise note<input value={exercise.notes ?? ''} placeholder="Optional note for this movement" onChange={(e) => void onEdit((s) => { s.exercises[ei].notes = e.target.value; return s })} /></label></Card> })}</div><Button className="finish-workout" onClick={onFinish}>Finish workout · Save completed exercises <ArrowRight size={17} /></Button></div>
}

function RoutinesView({ routines, activeId, onSelect, onStart, onCreate, onEdit, onDuplicate, onDelete }: { routines: Routine[]; activeId: string; onSelect: (r: Routine) => void; onStart: (r: Routine, d: RoutineDay) => void; onCreate: () => void; onEdit: (r: Routine) => void; onDuplicate: (r: Routine) => void; onDelete: (id: string) => void }) {
  const selected = routines.find((r) => r.id === activeId) ?? routines[0]
  const [daysPerWeek, setDaysPerWeek] = useState('3')
  const suggestions: Record<string, { name: string; reason: string }> = { '2': { name: 'Upper / Lower', reason: 'Two focused days leave room for recovery between sessions.' }, '3': { name: 'Full Body · Beginner', reason: 'Train the major muscle groups three times each week with recovery days between.' }, '4': { name: 'Upper / Lower', reason: 'Two upper and two lower days balance focused training with recovery.' }, '5': { name: '5-Day Split', reason: 'A different focus each day gives you time for a full weekly routine.' }, '6': { name: 'Push / Pull / Legs', reason: 'Repeat each training focus twice, with a recovery day at the end of the week.' } }
  const recommendation = routines.find((r) => r.name === suggestions[daysPerWeek]?.name)
  return <><div className="page-heading"><div><span className="eyebrow">BUILD A ROUTINE THAT FITS</span><h1>Your routines</h1><p className="lede">Choose a plan, open a training day, and keep your sets moving.</p></div><Button onClick={onCreate}><Plus size={17} /> New routine</Button></div><Card className="routine-recommender"><div><span className="eyebrow">NOT SURE WHERE TO START?</span><h2>Find a routine that fits</h2><p>Pick how many days you can train most weeks.</p><label className="recommend-select">Training days<select value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} days</option>)}</select></label></div><div className="recommend-result"><Badge tone="green"><Sparkles size={13} /> Suggested for you</Badge><strong>{suggestions[daysPerWeek]?.name}</strong><p>{suggestions[daysPerWeek]?.reason}</p><Button onClick={() => recommendation && onSelect(recommendation)} disabled={!recommendation}>Use this routine <ArrowRight size={15} /></Button></div></Card><div className="routine-layout"><div className="routine-list">{routines.map((r) => <button className={`routine-choice ${r.id === selected?.id ? 'selected' : ''}`} key={r.id} onClick={() => onSelect(r)}><span className="routine-mark"><Dumbbell size={18} /></span><span><strong>{r.name}</strong><small>{r.days.filter((day) => !day.rest).length} training days</small></span><ChevronDown size={16} /></button>)}</div>{selected && <Card className="routine-detail"><div className="routine-detail-head"><div><span className="eyebrow">WEEK OVERVIEW</span><h2>{selected.name}</h2><p>{selected.days.filter((day) => !day.rest).length} planned workouts · tap any day to start</p></div><div className="routine-actions"><button className="mini-icon" title="Edit routine" onClick={() => onEdit(selected)}><Settings2 size={16} /></button><button className="mini-icon" title="Duplicate routine" onClick={() => onDuplicate(selected)}><CopyIcon /></button><button className="mini-icon" title="Delete routine" onClick={() => onDelete(selected.id)}><Trash2 size={16} /></button></div></div><div className="routine-days">{selected.days.map((day, i) => <button className="routine-day" key={day.id} onClick={() => onStart(selected, day)}><span className="routine-day-index">{String(i + 1).padStart(2, '0')}</span><div><strong>{day.name}</strong><span>{day.rest ? 'Recovery day' : `${day.focus} · ${day.exercises.length} exercises`}</span></div><span className="start-day"><ArrowRight size={16} /></span></button>)}</div><div className="beginner-tip"><Sparkles size={16} /><span>Start lighter than you think you need. Build up once the reps feel smooth.</span></div></Card>}</div></>
}
function CopyIcon() { return <span aria-hidden="true">⧉</span> }

function LibraryView({ query, onQuery, results, group, muscle, beginOnly, setBeginOnly, onGroup, onMuscle, onBack, onExercise }: { query: string; onQuery: (v: string) => void; results: typeof exercises; group?: string; muscle?: string; beginOnly: boolean; setBeginOnly: (v: boolean) => void; onGroup: (g: string) => void; onMuscle: (m: string) => void; onBack: () => void; onExercise: (n: string) => void }) {
  const [localQuery, setLocalQuery] = useState(query)
  useEffect(() => { const t = setTimeout(() => onQuery(localQuery), 160); return () => clearTimeout(t) }, [localQuery])
  const muscleRows = group ? groups.find((g) => g.name === group)?.muscles ?? [] : []
  const visible = results.filter((e) => (!group || e.group === group) && (!muscle || e.muscle === muscle))
  return <><div className="page-heading"><div><span className="eyebrow">72 EXERCISES · 18 MUSCLE AREAS</span><h1>{muscle ?? group ?? 'Exercise library'}</h1><p className="lede">Pick a movement, learn the form, and keep a record of every session.</p></div><Badge tone="green"><Dumbbell size={13} /> Beginner to expert</Badge></div><div className="library-search"><div className="search-field"><Search size={17} /><input aria-label="Search exercises" placeholder="Find an exercise or muscle…" value={localQuery} onChange={(e) => setLocalQuery(e.target.value)} />{localQuery && <button aria-label="Clear search" onClick={() => setLocalQuery('')}><X size={15} /></button>}</div><button className={`filter-button ${beginOnly ? 'filter-on' : ''}`} onClick={() => setBeginOnly(!beginOnly)}>{beginOnly && <Check size={14} />} Beginner only</button></div>{localQuery ? <div className="library-list">{visible.map((e) => <ExerciseRow key={e.name} exercise={e} onClick={() => onExercise(e.name)} />)}{!visible.length && <Card className="empty-state">No exercises match that search.</Card>}</div> : !group ? <div className="library-groups">{groups.map((g, i) => <button className="library-group" key={g.name} onClick={() => onGroup(g.name)}><span className={`group-symbol symbol-${i}`}>{['↗', '◈', '✳', '⌁', '◒', '◎'][i]}</span><strong>{g.name}</strong><span>{g.muscles.length} muscles · {g.count} variations</span><ArrowRight size={16} /></button>)}</div> : !muscle ? <><button className="text-link back-link" onClick={onBack}><ArrowLeft size={15} /> All muscle groups</button><div className="muscle-grid">{muscleRows.map((m) => <button className="muscle-card" key={m} onClick={() => onMuscle(m)}><div><span className="eyebrow">4 MOVEMENTS</span><strong>{m}</strong><small>Beginner → Intermediate → Advanced → Expert</small></div><ArrowRight size={17} /></button>)}</div></> : <><button className="text-link back-link" onClick={onBack}><ArrowLeft size={15} /> Back to {group}</button><Card className="muscle-intro"><div className="step-circles"><span>1</span><span>2</span><span>3</span><span>4</span></div><div><strong>Four options, one clear progression</strong><p>Start with Beginner. Move to the next level when you can complete your reps with steady, confident form.</p></div></Card><div className="library-list">{visible.map((exercise, i) => <button className="exercise-tile" key={exercise.name} onClick={() => onExercise(exercise.name)}><span className={`level-count ${i === 0 ? 'first' : ''}`}>{i === 0 ? 'Start' : `0${i + 1}`}</span><span className="exercise-tile-main"><span><strong>{exercise.name}</strong><small>{exercise.equipment}</small></span><Badge tone={i === 0 ? 'green' : 'neutral'}>{exercise.level}</Badge></span><ArrowRight size={16} /></button>)}</div></>}</>
}
function ExerciseRow({ exercise, onClick }: { exercise: (typeof exercises)[number]; onClick: () => void }) { return <button className="exercise-tile" onClick={onClick}><span className="level-count">{exercise.level === 'Beginner' ? '01' : exercise.level === 'Intermediate' ? '02' : exercise.level === 'Advanced' ? '03' : '04'}</span><span className="exercise-tile-main"><span><strong>{exercise.name}</strong><small>{exercise.muscle} · {exercise.group}</small></span><Badge>{exercise.level}</Badge></span><ArrowRight size={16} /></button> }

function ProgressView({ logs, unit, days, streak, onDelete, onExercise, onExport }: { logs: WorkoutLog[]; unit: 'kg' | 'lb'; days: string[]; streak: number; onDelete: (id: string) => void; onExercise: (n: string) => void; onExport: () => void }) {
  const [exercise, setExercise] = useState(logs[0]?.exercise ?? '')
  const [metric, setMetric] = useState<'weight' | 'volume' | 'e1rm'>('weight')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  useEffect(() => { if (!logs.some((l) => l.exercise === exercise)) setExercise(logs[0]?.exercise ?? '') }, [logs, exercise])
  const chosen = logs.filter((l) => l.exercise === exercise).sort((a, b) => a.date.localeCompare(b.date))
  const chart = chosen.map((l) => { const sets = progressSets(l); const bestWeight = Math.max(...sets.map((s) => s.weight)); const best1RM = Math.max(...sets.map((s) => s.weight * (1 + s.reps / 30))); return { date: formatDate(l.date), weight: Number((unit === 'kg' ? bestWeight : bestWeight * 2.20462262).toFixed(1)), volume: Math.round(unit === 'kg' ? volume(l) : volume(l) * 2.20462262), e1rm: Number((unit === 'kg' ? best1RM : best1RM * 2.20462262).toFixed(1)) } })
  const personal = new Map<string, { weight: number; bestReps: number; oneRM: number; muscle: string }>()
  for (const log of logs) { const p = personal.get(log.exercise) ?? { weight: 0, bestReps: 0, oneRM: 0, muscle: log.muscle }; for (const set of progressSets(log)) { p.weight = Math.max(p.weight, set.weight); if (set.reps > p.bestReps) p.bestReps = set.reps; p.oneRM = Math.max(p.oneRM, set.weight * (1 + set.reps / 30)) } personal.set(log.exercise, p) }
  const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() - ((thisWeek.getDay() + 6) % 7)); thisWeek.setHours(0, 0, 0, 0); const weekLogs = logs.filter((l) => new Date(`${l.date}T12:00:00`) >= thisWeek); const lastWeekStart = new Date(thisWeek); lastWeekStart.setDate(lastWeekStart.getDate() - 7); const lastWeekKey = dateKey(lastWeekStart); const thisWeekKey = dateKey(thisWeek); const lastWeekLogs = logs.filter((l) => l.date >= lastWeekKey && l.date < thisWeekKey); const thisWeekVolume = weekLogs.reduce((sum, l) => sum + volume(l), 0); const lastWeekVolume = lastWeekLogs.reduce((sum, l) => sum + volume(l), 0)
  const muscleVolume = [...weekLogs.reduce((map, l) => map.set(l.muscle, (map.get(l.muscle) ?? 0) + volume(l)), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  return <><div className="page-heading"><div><span className="eyebrow">LOOK HOW FAR YOU’VE COME</span><h1>Your progress</h1><p className="lede">Simple signals to show that your effort is paying off.</p></div><Button variant="soft" onClick={onExport}><ArrowRight className="export-icon" size={16} /> Export CSV</Button></div><div className="metric-grid"><Card><span className="metric-label">Training days</span><strong>{new Set(logs.map((l) => l.date)).size}</strong><small>days logged</small></Card><Card><span className="metric-label">Current streak</span><strong>{streak} <Flame className="flame" size={19} /></strong><small>consecutive days</small></Card><Card><span className="metric-label">Exercise entries</span><strong>{logs.length}</strong><small>saved to history</small></Card></div><Card className="progress-card"><div className="section-top"><div><span className="eyebrow">CONSISTENCY</span><h2>Last 7 days</h2></div><span className="muted-small">Training days light up</span></div><div className="week-grid">{days.map((d, i) => <div key={d} className="week-day"><span>{'MTWTFSS'[i]}</span><b className={logs.some((l) => l.date === d) ? 'worked' : ''}>{new Date(`${d}T12:00:00`).getDate()}</b></div>)}</div></Card><Card className="progress-card"><div className="section-top"><div><span className="eyebrow">STRENGTH OVER TIME</span><h2>Exercise progression</h2></div><div className="chart-controls"><select className="simple-select" aria-label="Choose exercise" value={exercise} onChange={(e) => setExercise(e.target.value)}>{[...new Set(logs.map((l) => l.exercise))].map((name) => <option key={name}>{name}</option>)}</select><select className="simple-select" aria-label="Chart measure" value={metric} onChange={(e) => setMetric(e.target.value as 'weight' | 'volume' | 'e1rm')}><option value="weight">Weight</option><option value="volume">Volume</option><option value="e1rm">Estimated 1RM</option></select></div></div>{chart.length > 1 ? <div className="chart-frame"><Suspense fallback={<div className="chart-empty">Preparing your chart…</div>}><ProgressChart data={chart} unit={unit} metric={metric} /></Suspense></div> : <div className="chart-empty"><BarChart3 size={25} /><span>Log this exercise a few times to see your strength trend.</span></div>}<div className="chart-legend"><span><i /> Weight over time</span><span>Est. 1RM: {chart.length ? `${chart.at(-1)?.e1rm} ${unit}` : '—'}</span><span>Volume: {chart.length ? `${chart.at(-1)?.volume.toLocaleString()} ${unit}` : '—'}</span></div></Card><Card className="progress-card"><span className="eyebrow">WEEKLY COMPARISON</span><h2>This week vs last week</h2><div className="comparison-row"><div><strong>{weekLogs.length}</strong><span>exercise entries this week</span></div><div><strong>{lastWeekLogs.length}</strong><span>exercise entries last week</span></div><div><strong>{prettyWeight(thisWeekVolume, unit)}</strong><span>volume this week</span></div><div><strong>{lastWeekVolume ? `${Math.round((thisWeekVolume - lastWeekVolume) / lastWeekVolume * 100)}%` : "—"}</strong><span>volume change vs last week</span></div></div></Card><Card className="progress-card"><span className="eyebrow">WEEKLY MUSCLE VOLUME</span><h2>This week</h2><div className="volume-list">{muscleVolume.length ? muscleVolume.map(([muscle, amount]) => <div className="volume-row" key={muscle}><span>{muscle}</span><b>{prettyWeight(amount, unit)}</b><i style={{ width: `${Math.min(100, amount / Math.max(...muscleVolume.map((m) => m[1])) * 100)}%` }} /></div>) : <p className="muted-small">Finish a workout to see weekly training volume.</p>}</div></Card><Card className="progress-card"><div className="section-top"><div><span className="eyebrow">PERSONAL RECORDS</span><h2>Strength you’ve earned</h2></div><Trophy size={19} className="trophy" /></div><div className="records-grid">{[...personal.entries()].sort((a, b) => b[1].oneRM - a[1].oneRM).slice(0, 8).map(([name, p]) => <button className="pr-card" key={name} onClick={() => onExercise(name)}><span>{p.muscle}</span><strong>{name}</strong><div><b>{prettyWeight(p.weight, unit)}</b><small>heaviest · best {p.bestReps} reps · est 1RM {prettyWeight(p.oneRM, unit)}</small></div></button>)}</div>{!personal.size && <p className="muted-small">Complete your first workout to start building personal records.</p>}</Card><Card className="progress-card"><div className="section-top"><div><span className="eyebrow">RECENT WORKOUTS</span><h2>Your history</h2></div></div><div className="history-list">{[...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((l) => <div className="history-row" key={l.id}><button onClick={() => onExercise(l.exercise)}><strong>{l.exercise}</strong><span>{l.muscle} · {formatDate(l.date)}</span></button><b>{prettyWeight(l.weight, unit)}<small>{l.reps} reps × {l.sets}</small></b>{confirmDelete === l.id ? <button className="confirm-delete" onClick={() => { onDelete(l.id); setConfirmDelete(null) }}>Delete?</button> : <button className="mini-icon" aria-label={`Delete ${l.exercise} entry`} onClick={() => setConfirmDelete(l.id)}><Trash2 size={15} /></button>}</div>)}{!logs.length && <div className="chart-empty">Your completed exercises will appear here.</div>}</div></Card></>
}

function ExerciseModal({ exercise, logs, unit, onClose, onAdd }: { exercise: (typeof exercises)[number]; logs: WorkoutLog[]; unit: 'kg' | 'lb'; onClose: () => void; onAdd: () => void }) {
  const videoSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} proper form`)}`
  const last = logs.at(-1)
  return <Modal title={exercise.name} eyebrow={`${exercise.group.toUpperCase()} · ${exercise.muscle.toUpperCase()}`} onClose={onClose}><div className="level-path">{['Beginner', 'Intermediate', 'Advanced', 'Expert'].map((l) => <Badge key={l} tone={l === exercise.level ? 'green' : 'neutral'}>{l}</Badge>)}</div><p className="muted">{exercise.level === 'Beginner' ? 'A friendly first variation. Learn the movement with a light, controlled load.' : `This ${exercise.level.toLowerCase()} variation builds on the movement. Keep control through every rep.`}</p><div className="exercise-facts"><div><span>Muscle focus</span><strong>{exercise.muscle}</strong></div><div><span>Equipment</span><strong>{exercise.equipment}</strong></div><div><span>Good starting point</span><strong>3 sets · 8–12 reps</strong></div></div><div className="coach-callout"><Sparkles size={17} /><span>{last ? last.reps >= 12 ? `Last time: ${prettyWeight(last.weight, unit)} × ${last.reps}. Consider a small increase next time.` : `Last time: ${prettyWeight(last.weight, unit)} × ${last.reps}. Build toward 12 reps.` : 'Use a manageable load. You can add weight after you own the movement.'}</span></div><h3 className="modal-subhead">Three form cues</h3><ol className="form-cues">{exercise.cues.map((cue, i) => <li key={cue}><span>{i + 1}</span>{cue}</li>)}</ol><div className="modal-actions"><a className="btn btn-soft" href={videoSearch} target="_blank" rel="noreferrer">Watch form videos <ArrowRight size={15} /></a><Button onClick={onAdd}>Add to workout <Plus size={15} /></Button></div></Modal>
}

function RoutineModal({ initial, onClose, onSave }: { initial?: Routine; onClose: () => void; onSave: (name: string, days: RoutineDay[]) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [days, setDays] = useState(initial?.days ?? [{ id: uid(), name: 'Workout A', focus: 'Full body', exercises: [routineExercise(exercises[0].name)] }])
  const addDay = () => setDays([...days, { id: uid(), name: `Workout ${String.fromCharCode(65 + days.length)}`, focus: '', exercises: [] }])
  const updateExercise = (dayId: string, index: number, patch: Partial<RoutineExercise>) => setDays((current) => current.map((day) => day.id === dayId ? { ...day, exercises: day.exercises.map((exercise, i) => i === index ? { ...exercise, ...patch } : exercise) } : day))
  return <Modal title={initial ? 'Edit your routine' : 'Create a routine'} eyebrow="YOUR PLAN, YOUR WAY" onClose={onClose}><label className="field-label">ROUTINE NAME<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upper / Lower" /></label><div className="routine-builder">{days.map((d, i) => <div className="builder-day" key={d.id}><span>DAY {i + 1}</span><input aria-label={`Day ${i + 1} name`} value={d.name} onChange={(e) => setDays(days.map((day) => day.id === d.id ? { ...day, name: e.target.value } : day))} /><input aria-label={`Day ${i + 1} muscle focus`} value={d.focus} onChange={(e) => setDays(days.map((day) => day.id === d.id ? { ...day, focus: e.target.value } : day))} placeholder="Muscle focus" /><select aria-label="Add exercise" defaultValue="" onChange={(e) => { if (e.target.value) setDays(days.map((day) => day.id === d.id ? { ...day, exercises: [...day.exercises, routineExercise(e.target.value)] } : day)); e.target.value = '' }}><option value="">Add exercise…</option>{exercises.map((ex) => <option key={ex.name}>{ex.name}</option>)}</select><div className="builder-exercises">{d.exercises.map((ex, j) => <div className="builder-exercise-row" key={`${ex.name}-${j}`}><strong>{ex.name}</strong><div className="builder-exercise-fields"><label>Sets<input type="number" min="1" max="10" value={ex.sets} onChange={(e) => updateExercise(d.id, j, { sets: Number(e.target.value) })} /></label><label>Target reps<input value={ex.reps} onChange={(e) => updateExercise(d.id, j, { reps: e.target.value })} /></label><label>Rest sec<input type="number" min="0" max="300" step="15" value={ex.rest} onChange={(e) => updateExercise(d.id, j, { rest: Number(e.target.value) })} /></label></div><label className="builder-note">Exercise note<input value={ex.notes ?? ''} placeholder="Optional cue" onChange={(e) => updateExercise(d.id, j, { notes: e.target.value })} /></label><button className="builder-exercise-remove" aria-label={`Remove ${ex.name}`} onClick={() => setDays(days.map((day) => day.id === d.id ? { ...day, exercises: day.exercises.filter((_, k) => j !== k) } : day))}><X size={14} /></button></div>)}</div><button className="text-link builder-remove" onClick={() => setDays(days.filter((day) => day.id !== d.id))}><Trash2 size={13} /> Remove day</button></div>)}</div><div className="modal-actions"><Button variant="soft" onClick={addDay}><Plus size={15} /> Add workout day</Button><Button onClick={() => onSave(name, days)} disabled={!name.trim() || !days.length}>Save routine <Check size={15} /></Button></div></Modal>
}
function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="mini-icon" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>{children}</section></div> }
