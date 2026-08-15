import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './styles.css'

const initialTasks = [
  { id: 1, game: '原神', icon: '✦', tone: 'blue', title: 'デイリー任務を完了する', type: 'single', period: '毎日', dueDays: 0, priority: 3, minutes: 10, completed: false },
  { id: 2, game: 'ハートピア', icon: '♡', tone: 'pink', title: '住民依頼とログイン報酬', type: 'single', period: '毎日', dueDays: 0, priority: 3, minutes: 10, completed: false },
  { id: 3, game: 'NTE', icon: '◈', tone: 'violet', title: 'デイリーミッションを消化する', type: 'single', period: '毎日', dueDays: 0, priority: 2, minutes: 15, completed: false },
  { id: 4, game: '崩壊：スターレイル', icon: '✧', tone: 'indigo', title: '歴戦余韻をクリアする', type: 'count', period: '毎週', dueDays: 2, priority: 3, minutes: 15, progress: 1, target: 3 },
  { id: 5, game: 'ドラクエウォーク', icon: '◆', tone: 'amber', title: '宝の地図ウィークリーミッション', type: 'count', period: '毎週', dueDays: 4, priority: 2, minutes: 20, progress: 3, target: 5 },
  { id: 6, game: '原神', icon: '✦', tone: 'blue', title: '週ボスを消化する', type: 'single', period: '毎週', dueDays: 1, priority: 2, minutes: 20, completed: false },
]

const initialGames = [...new Set(initialTasks.map((task) => task.game))]
const initialGameRecords = initialGames.map((name) => ({ id: null, name, active: true }))

const priorityLabel = { 3: '必須', 2: 'できれば', 1: '余裕があれば' }
const priorityClass = { 3: 'must', 2: 'should', 1: 'later' }
const gameVisuals = {
  原神: { icon: '✦', tone: 'blue' },
  ハートピア: { icon: '♡', tone: 'pink' },
  NTE: { icon: '◈', tone: 'violet' },
  '崩壊：スターレイル': { icon: '✧', tone: 'indigo' },
  ドラクエウォーク: { icon: '◆', tone: 'amber' },
}

const defaultResourceUrls = {
  原神: 'https://act.hoyolab.com/app/community-game-records-sea/index.html#/ys',
  '崩壊：スターレイル': 'https://act.hoyolab.com/app/community-game-records-sea/rpg/m.html',
  ZZZ: 'https://act.hoyolab.com/app/zzz-game-record/index.html#/zzz',
  NTE: '',
}

const blankTaskForm = {
  title: '',
  game: '原神',
  type: 'single',
  period: '毎日',
  priority: 2,
  minutes: '',
  target: 3,
  stockIntervalHours: 24,
  stockCapacity: 7,
  stockAmount: 0,
  stockUpdatedAt: '',
  memo: '',
  startDate: '',
  endDate: '',
  startAt: '',
  endAt: '',
  limitedDays: 7,
  limitedHours: 0,
}

const blankResourceForm = {
  name: 'スタミナ',
  game: '原神',
  currentAmount: 0,
  maxAmount: 200,
  recoveryMinutes: 8,
  checkUrl: defaultResourceUrls.原神,
}

function getGameVisual(game) {
  return gameVisuals[game] || { icon: '●', tone: 'blue' }
}

function getDefaultResourceUrl(game) {
  return defaultResourceUrls[game] || ''
}

function getPeriodKey(task, date = new Date()) {
  const period = task.period
  const startDate = task.startDate || task.start_date || ''
  const endDate = task.endDate || task.end_date || ''
  const today = toDateInputValue(date)
  if (period === '毎日') return `daily:${today}`
  if (period === '毎週') {
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay())
    return `weekly:${toDateInputValue(weekStart)}`
  }
  if (period === '2週間ごと') {
    const anchor = startDate ? dateFromInput(startDate) : date
    const elapsed = Math.max(daysBetween(anchor, date), 0)
    const periodStart = new Date(anchor)
    periodStart.setDate(anchor.getDate() + Math.floor(elapsed / 14) * 14)
    return `biweekly:${toDateInputValue(periodStart)}`
  }
  if (period === '毎月') return `monthly:${today.slice(0, 7)}`
  return `limited:${task.startAt || task.start_at || startDate}:${task.endAt || task.end_at || endDate}`
}

function getCurrentStock(task, now = new Date()) {
  if (task.type !== 'stock') return 0
  const intervalHours = Math.max(Number(task.stockIntervalHours) || 24, 1)
  const capacity = Math.max(Number(task.stockCapacity) || 1, 1)
  const storedAmount = Math.min(Math.max(Number(task.stockAmount) || 0, 0), capacity)
  const updatedAt = task.stockUpdatedAt ? new Date(task.stockUpdatedAt) : now
  const elapsedHours = Math.max((now.getTime() - updatedAt.getTime()) / 3600000, 0)
  return Math.min(storedAmount + Math.floor(elapsedHours / intervalHours), capacity)
}

function getStockHoursUntilNext(task, now = new Date()) {
  if (task.type !== 'stock' || getCurrentStock(task, now) >= task.stockCapacity) return 0
  const intervalHours = Math.max(Number(task.stockIntervalHours) || 24, 1)
  const updatedAt = task.stockUpdatedAt ? new Date(task.stockUpdatedAt) : now
  const elapsedHours = Math.max((now.getTime() - updatedAt.getTime()) / 3600000, 0)
  const remainder = elapsedHours % intervalHours
  return Math.max(intervalHours - remainder, 0)
}

function formatStockTime(hours) {
  if (hours <= 0) return 'まもなく'
  if (hours < 1) return `${Math.max(Math.ceil(hours * 60), 1)}分後`
  return `${Math.ceil(hours)}時間後`
}

function getCurrentResource(resource, now = new Date()) {
  const maxAmount = Math.max(Number(resource.maxAmount) || 1, 1)
  const baseAmount = Math.min(Math.max(Number(resource.currentAmount) || 0, 0), maxAmount)
  const recoveryMinutes = Math.max(Number(resource.recoveryMinutes) || 1, 1)
  const updatedAt = resource.updatedAt ? new Date(resource.updatedAt) : now
  const elapsedMinutes = Math.max((now.getTime() - updatedAt.getTime()) / 60000, 0)
  return Math.min(baseAmount + Math.floor(elapsedMinutes / recoveryMinutes), maxAmount)
}

function getResourceMinutesUntilFull(resource, now = new Date()) {
  const currentAmount = getCurrentResource(resource, now)
  if (currentAmount >= resource.maxAmount) return 0
  const recoveryMinutes = Math.max(Number(resource.recoveryMinutes) || 1, 1)
  const updatedAt = resource.updatedAt ? new Date(resource.updatedAt) : now
  const elapsedMinutes = Math.max((now.getTime() - updatedAt.getTime()) / 60000, 0)
  const remainder = elapsedMinutes % recoveryMinutes
  return Math.max((resource.maxAmount - currentAmount) * recoveryMinutes - remainder, 0)
}

function formatResourceTime(minutes) {
  if (minutes <= 0) return '満タン'
  if (minutes < 60) return `${Math.ceil(minutes)}分後に満タン`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.ceil(minutes % 60)
  return remainingMinutes > 0 ? `${hours}時間${remainingMinutes}分後に満タン` : `${hours}時間後に満タン`
}

function mapDatabaseResource(row, gameName) {
  return {
    ...row,
    game: gameName,
    name: row.name,
    currentAmount: row.current_amount || 0,
    maxAmount: row.max_amount || 1,
    recoveryMinutes: row.recovery_minutes || 1,
    checkUrl: row.check_url || getDefaultResourceUrl(gameName),
    updatedAt: row.updated_at || new Date().toISOString(),
    active: row.active !== false,
  }
}

function sortResources(resources, now = new Date()) {
  return [...resources].sort((a, b) => {
    const aRatio = getCurrentResource(a, now) / Math.max(Number(a.maxAmount) || 1, 1)
    const bRatio = getCurrentResource(b, now) / Math.max(Number(b.maxAmount) || 1, 1)
    if (aRatio !== bRatio) return bRatio - aRatio
    return `${a.game}${a.name}`.localeCompare(`${b.game}${b.name}`, 'ja')
  })
}

function mapDatabaseTask(row, gameName, periodRow) {
  const visual = getGameVisual(gameName)
  const progress = periodRow?.progress || 0
  return {
    ...row,
    game: gameName,
    icon: visual.icon,
    tone: visual.tone,
    type: row.type,
    period: row.period,
    priority: row.priority,
    minutes: row.minutes ?? '',
    target: row.target || 1,
    stockIntervalHours: row.stock_interval_hours || 24,
    stockCapacity: row.stock_capacity || 7,
    stockAmount: row.stock_amount || 0,
    stockUpdatedAt: row.stock_updated_at || new Date().toISOString(),
    memo: row.memo || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    startAt: row.start_at || '',
    endAt: row.end_at || '',
    ...getLimitedDurationValues(row.end_at || '', row.end_date || '', new Date()),
    dueDays: getDueDaysForPeriod(row.period, row.start_date || '', row.end_date || '', row.end_at || ''),
    active: row.active,
    progress,
    completed: Boolean(periodRow?.completed) || (row.type === 'count' && progress >= row.target),
  }
}

function normalizeGameSearch(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/[\s:：・_\-]/g, '')
    .toLocaleLowerCase()
}

function getGameSuggestions(games, query) {
  const normalizedQuery = normalizeGameSearch(query)
  if (!normalizedQuery) return games

  return games
    .map((game) => {
      const normalizedGame = normalizeGameSearch(game)
      const isSubsequence = [...normalizedQuery].reduce((position, character) => {
        const nextPosition = normalizedGame.indexOf(character, position)
        return nextPosition === -1 ? Number.POSITIVE_INFINITY : nextPosition + 1
      }, 0) !== Number.POSITIVE_INFINITY
      let score = 99
      if (normalizedGame === normalizedQuery) score = 0
      else if (normalizedGame.startsWith(normalizedQuery)) score = 1
      else if (normalizedGame.includes(normalizedQuery)) score = 2
      else if (isSubsequence) score = 3
      return { game, score }
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || a.game.localeCompare(b.game, 'ja'))
    .map(({ game }) => game)
}

function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function daysBetween(from, to) {
  return Math.round((to - from) / 86400000)
}

function getRemainingLimitedHours(endAt, endDate, now = new Date()) {
  const end = endAt ? new Date(endAt) : endDate ? new Date(`${endDate}T23:59:59`) : null
  if (!end || Number.isNaN(end.getTime())) return 0
  return Math.max(Math.ceil((end - now) / 3600000), 0)
}

function formatLimitedRemaining(hours) {
  if (hours <= 0) return '期限切れ'
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (days > 0 && remainingHours > 0) return `あと${days}日${remainingHours}時間`
  if (days > 0) return `あと${days}日`
  return `あと${remainingHours}時間`
}

function getLimitedDurationValues(endAt, endDate = '', now = new Date()) {
  const remainingHours = getRemainingLimitedHours(endAt, endDate, now)
  return { limitedDays: Math.floor(remainingHours / 24), limitedHours: remainingHours % 24 }
}

function getDueDaysForPeriod(period, startDate, endDate, endAt) {
  const today = new Date()
  if (period === '毎日') return 0
  if (period === '毎週') return (7 - today.getDay()) % 7
  if (period === '2週間ごと') {
    const anchor = startDate ? dateFromInput(startDate) : today
    const elapsed = daysBetween(anchor, today)
    if (elapsed < 0) return Math.abs(elapsed)
    return (14 - (elapsed % 14)) % 14
  }
  if (period === '毎月') return new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()
  if (period === '期間限定') return Math.floor(getRemainingLimitedHours(endAt, endDate, today) / 24)
  return 7
}

function isTaskActive(task) {
  return task.active !== false
}

function formatDate() {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date())
}

function urgencyText(task, now = new Date()) {
  if (task.type === 'stock') {
    const currentStock = getCurrentStock(task, now)
    if (currentStock >= task.stockCapacity) return '満タン・受け取ってください'
    const remaining = task.stockCapacity - currentStock
    return `あと${remaining}個・次は${formatStockTime(getStockHoursUntilNext(task, now))}`
  }
  if (task.type === 'count') {
    const remaining = task.target - task.progress
    if (remaining <= 0) return '達成済み'
    if (task.period === '期間限定') return `${formatLimitedRemaining(getRemainingLimitedHours(task.endAt, task.endDate, now))}・残り${remaining}回`
    if (task.dueDays === 0) return `今日中にあと${remaining}回`
    return `あと${task.dueDays}日・残り${remaining}回`
  }
  if (task.completed) return '完了'
  if (task.period === '期間限定') return formatLimitedRemaining(getRemainingLimitedHours(task.endAt, task.endDate, now))
  if (task.dueDays === 0) return '今日中'
  return `あと${task.dueDays}日`
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aDone = a.completed || (a.type === 'count' && a.progress >= a.target)
    const bDone = b.completed || (b.type === 'count' && b.progress >= b.target)
    if (aDone !== bDone) return Number(aDone) - Number(bDone)
    const aPressure = a.type === 'count'
      ? (a.target - a.progress) / Math.max(a.dueDays + 1, 1)
      : a.type === 'stock' ? getCurrentStock(a) / Math.max(a.stockCapacity, 1) : 0
    const bPressure = b.type === 'count'
      ? (b.target - b.progress) / Math.max(b.dueDays + 1, 1)
      : b.type === 'stock' ? getCurrentStock(b) / Math.max(b.stockCapacity, 1) : 0
    if (a.dueDays !== b.dueDays) return a.dueDays - b.dueDays
    if (aPressure !== bPressure) return bPressure - aPressure
    if (a.priority !== b.priority) return b.priority - a.priority
    const aMinutes = a.minutes === '' ? Number.POSITIVE_INFINITY : a.minutes
    const bMinutes = b.minutes === '' ? Number.POSITIVE_INFINITY : b.minutes
    return aMinutes - bMinutes
  })
}

function TaskRow({ task, onToggle, onIncrement, onDecrement, onCollect, onEdit, now }) {
  const isDone = task.completed || (task.type === 'count' && task.progress >= task.target)
  return (
    <article className={`task-row ${isDone ? 'is-done' : ''}`}>
      <div className={`game-mark ${task.tone || getGameVisual(task.game).tone}`} aria-hidden="true">{task.icon || getGameVisual(task.game).icon}</div>
      <div className="task-content">
        <div className="task-heading">
          <span className="game-name">{task.game}</span>
          <span className={`priority ${priorityClass[task.priority]}`}>{priorityLabel[task.priority]}</span>
        </div>
        <h3>{task.title}</h3>
        <div className="task-meta">
          <span>{task.type === 'stock' ? '蓄積型' : task.period}</span>
          {task.minutes ? <><span>・</span><span>{task.minutes}分</span></> : null}
          <span className={task.type === 'stock' || (task.dueDays <= 1 && !isDone) ? 'urgent-text' : ''}>・ {urgencyText(task, now)}</span>
        </div>
      </div>
      {task.type === 'stock' ? (
        <div className="stock-control" aria-label={`${task.title}の蓄積状況`}>
          <div className="count-number"><strong>{getCurrentStock(task, now)}</strong><span> / {task.stockCapacity}個</span></div>
          <div className="progress-track"><span style={{ width: `${Math.min(getCurrentStock(task, now) / task.stockCapacity * 100, 100)}%` }} /></div>
          <div className="count-actions">
            <button className="edit-button compact-edit" onClick={() => onEdit(task)} aria-label={`${task.title}を編集`}>編集</button>
            <button className="add-button" onClick={() => onCollect(task.id)} disabled={getCurrentStock(task, now) === 0}>受け取る</button>
          </div>
        </div>
      ) : task.type === 'count' ? (
        <div className="count-control" aria-label={`${task.title}の進捗`}>
          <div className="count-number"><strong>{task.progress}</strong><span> / {task.target}回</span></div>
          <div className="progress-track"><span style={{ width: `${Math.min(task.progress / task.target * 100, 100)}%` }} /></div>
          <div className="count-actions">
            <button className="edit-button compact-edit" onClick={() => onEdit(task)} aria-label={`${task.title}を編集`}>編集</button>
            <button className="step-button" onClick={() => onDecrement(task.id)} disabled={task.progress === 0} aria-label="1回減らす">−</button>
            <button className={`add-button ${isDone ? 'done-button' : ''}`} onClick={() => onIncrement(task.id)} disabled={isDone}>{isDone ? '達成済み' : '+1 回'}</button>
          </div>
        </div>
      ) : (
        <div className="single-actions">
          <button className="edit-button" onClick={() => onEdit(task)} aria-label={`${task.title}を編集`}>編集</button>
          <button className={`complete-button ${isDone ? 'checked' : ''}`} onClick={() => onToggle(task.id)} aria-label={`${task.title}を${isDone ? '未完了に戻す' : '完了にする'}`}>
            <span className="check-icon">{isDone ? '✓' : ''}</span>
            <span>{isDone ? '完了' : '完了にする'}</span>
          </button>
        </div>
      )}
    </article>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSignUp = mode === 'signup'

  async function signInWithGoogle() {
    setError('')
    setMessage('')
    setIsSubmitting(true)
  const redirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  const redirectTo = redirectUrl.pathname === '/' ? window.location.origin : redirectUrl.toString().replace(/\/$/, '')
  const { error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
    })
    if (oauthError) {
      setIsSubmitting(false)
      setError(oauthError.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (isSignUp && !result.data.session) setMessage('確認メールを送信しました。メール内のリンクを開いてからログインしてください。')
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span className="brand-mark">✓</span><div><strong>ゲーム日課</strong><small>今日やることを、迷わず。</small></div></div>
        <p className="eyebrow">{isSignUp ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</p>
        <h1 id="auth-title">{isSignUp ? 'アカウントを作成' : 'ログイン'}</h1>
        <p className="auth-description">PCとスマホで同じゲーム日課を確認できます。</p>
        <button className="google-button" type="button" onClick={signInWithGoogle} disabled={isSubmitting}><span className="google-mark" aria-hidden="true">G</span>Googleでログイン</button>
        <div className="auth-divider"><span>または</span></div>
        <form className="auth-form" onSubmit={submit}>
          <label className="form-field"><span>メールアドレス</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label className="form-field"><span>パスワード</span><input type="password" required minLength="6" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6文字以上" /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="save-button auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? '処理中…' : isSignUp ? 'アカウントを作成' : 'ログイン'}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(isSignUp ? 'login' : 'signup'); setError(''); setMessage('') }}>{isSignUp ? 'すでにアカウントがある場合はログイン' : '初めて使う場合はアカウントを作成'}</button>
      </section>
    </main>
  )
}

function TaskFormModal({ form, isEditing, onChange, onClose, onSubmit, onDeactivate, onDelete, availableGames }) {
  const isCount = form.type === 'count'
  const isStock = form.type === 'stock'
  const gameSuggestions = getGameSuggestions(availableGames, form.game)

  function handleTypeChange(type) {
    onChange('type', type)
    if (type === 'stock') onChange('period', '毎日')
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-heading">
          <div><p className="eyebrow">TASK SETTINGS</p><h2 id="task-modal-title">{isEditing ? 'タスクを編集' : 'タスクを追加'}</h2><p>あとから周期や優先度も変更できます。</p></div>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={onSubmit}>
          <label className="form-field full-field"><span>タスク名</span><input autoFocus required value={form.title} onChange={(event) => onChange('title', event.target.value)} placeholder="例：ログインボーナスを受け取る" /></label>
          <div className="form-grid">
            <label className="form-field"><span>ゲーム</span><input required value={form.game} onChange={(event) => onChange('game', event.target.value)} placeholder="ゲーム名" /><div className="game-suggestions" aria-label="登録済みのゲーム">{gameSuggestions.length > 0 ? gameSuggestions.map((game) => <button key={game} type="button" className={form.game === game ? 'game-suggestion active' : 'game-suggestion'} onClick={() => onChange('game', game)}>{game}</button>) : <small className="game-suggestion-empty">一致する登録済みゲームがありません。新しい名前も入力できます。</small>}</div></label>
            <label className="form-field"><span>周期</span>{isStock ? <div className="form-static"><strong>蓄積間隔で管理</strong><small>毎日・週次の周期は使いません</small></div> : <select value={form.period} onChange={(event) => onChange('period', event.target.value)}><option>毎日</option><option>毎週</option><option>2週間ごと</option><option>毎月</option><option>期間限定</option></select>}</label>
          </div>
          <div className="form-grid three-fields">
            <label className="form-field"><span>タスク形式</span><select value={form.type} onChange={(event) => handleTypeChange(event.target.value)}><option value="single">一度で完了</option><option value="count">回数目標</option><option value="stock">蓄積型</option></select></label>
            <label className="form-field"><span>重要度</span><select value={form.priority} onChange={(event) => onChange('priority', Number(event.target.value))}><option value="3">必須</option><option value="2">できれば</option><option value="1">余裕があれば</option></select></label>
            <label className="form-field"><span>所要時間（任意）</span><input type="number" min="1" max="999" value={form.minutes} onChange={(event) => onChange('minutes', event.target.value === '' ? '' : Number(event.target.value))} placeholder="例：10" /><small>未設定でも登録できます</small></label>
          </div>
          {form.period === '2週間ごと' && <div className="form-grid"><label className="form-field"><span>基準日</span><input type="date" required value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} /><small>この日を起点に14日ごとに発生します</small></label><div /></div>}
          {form.period === '期間限定' && <div className="form-grid limited-duration-grid"><label className="form-field"><span>残り日数</span><input type="number" min="0" max="3650" required value={form.limitedDays} onChange={(event) => onChange('limitedDays', event.target.value === '' ? '' : Number(event.target.value))} /><small>保存した時点からの期間</small></label><label className="form-field"><span>残り時間</span><input type="number" min="0" max="23" required value={form.limitedHours} onChange={(event) => onChange('limitedHours', event.target.value === '' ? '' : Number(event.target.value))} /><small>0〜23時間で入力</small></label></div>}
          {isCount && <div className="form-grid"><label className="form-field"><span>目標回数</span><input type="number" min="1" max="999" required value={form.target} onChange={(event) => onChange('target', Number(event.target.value))} /><small>期間内に何回やるか</small></label><div /></div>}
          {isStock && <div className="form-grid stock-form-grid"><label className="form-field"><span>生産間隔（時間）</span><input type="number" min="1" max="8760" required value={form.stockIntervalHours} onChange={(event) => onChange('stockIntervalHours', Number(event.target.value))} /><small>例：24時間で1個</small></label><label className="form-field"><span>最大保管数</span><input type="number" min="1" max="999" required value={form.stockCapacity} onChange={(event) => onChange('stockCapacity', Number(event.target.value))} /><small>満タンになる前に受け取ります</small></label><label className="form-field"><span>現在の蓄積数</span><input type="number" min="0" max={form.stockCapacity || 999} required value={form.stockAmount} onChange={(event) => onChange('stockAmount', Number(event.target.value))} /><small>登録時点のゲーム内の数</small></label></div>}
          <label className="form-field full-field"><span>メモ（任意）</span><textarea value={form.memo} onChange={(event) => onChange('memo', event.target.value)} placeholder="ステージ名や交換するものなど" rows="3" /></label>
          <div className="modal-actions"><div className="destructive-actions">{isEditing && <><button type="button" className="danger-link" onClick={onDeactivate}>無効化</button><button type="button" className="danger-link delete-link" onClick={onDelete}>削除</button></>}</div><div className="modal-main-actions"><button type="button" className="cancel-button" onClick={onClose}>キャンセル</button><button type="submit" className="save-button">{isEditing ? '変更を保存' : 'タスクを追加'}</button></div></div>
        </form>
      </section>
    </div>
  )
}

function GameManagerModal({ games, tasks, onAdd, onRename, onToggle, onReactivate, onClose }) {
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(null)
  const [draftName, setDraftName] = useState('')

  function submitNewGame(event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name || games.some((game) => game.name === name)) return
    onAdd(name)
    setNewName('')
  }

  function startRename(game) {
    setEditingName(game.name)
    setDraftName(game.name)
  }

  function saveRename() {
    const name = draftName.trim()
    if (!name || name === editingName || games.some((game) => game.name === name)) return
    onRename(editingName, name)
    setEditingName(null)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-modal game-modal" role="dialog" aria-modal="true" aria-labelledby="game-modal-title">
        <div className="modal-heading">
          <div><p className="eyebrow">GAME SETTINGS</p><h2 id="game-modal-title">ゲームを管理</h2><p>遊ばないゲームは休止すると一覧から隠せます。</p></div>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form className="new-game-form" onSubmit={submitNewGame}>
          <label className="form-field"><span>新しいゲームを追加</span><input required value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="ゲーム名を入力" /></label>
          <button className="save-button" type="submit">追加</button>
        </form>
        <div className="manager-divider" />
        <div className="game-manager-list">
          {games.map((game) => {
            const taskCount = tasks.filter((task) => task.game === game.name).length
            const isEditing = editingName === game.name
            return <div className={`game-manager-row ${game.active ? '' : 'paused-row'}`} key={game.name}>
              <div className={`game-mark ${getGameVisual(game.name).tone}`} aria-hidden="true">{getGameVisual(game.name).icon}</div>
              {isEditing ? <input className="rename-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label={`${game.name}の新しい名前`} /> : <div className="game-manager-info"><strong>{game.name}</strong><span>{taskCount}件のタスク ・ {game.active ? '使用中' : '休止中'}</span></div>}
              <div className="manager-actions">{isEditing ? <><button className="edit-button" onClick={saveRename} type="button">保存</button><button className="edit-button" onClick={() => setEditingName(null)} type="button">取消</button></> : <><button className="edit-button" onClick={() => startRename(game)} type="button">名前変更</button><button className="pause-button" onClick={() => onToggle(game.name)} type="button">{game.active ? '休止' : '再開'}</button></>}</div>
            </div>
          })}
        </div>
        {tasks.some((task) => task.active === false) && <div className="inactive-task-section">
          <div className="manager-section-heading"><div><p className="eyebrow">INACTIVE TASKS</p><h3>無効化したタスク</h3></div><span>{tasks.filter((task) => task.active === false).length}件</span></div>
          <div className="inactive-task-list">
            {tasks.filter((task) => task.active === false).map((task) => <div className="inactive-task-row" key={task.id}>
              <div className="inactive-task-info"><strong>{task.title}</strong><span>{task.game} ・ {task.period}</span></div>
              <button className="pause-button" onClick={() => onReactivate(task.id)} type="button">再有効化</button>
            </div>)}
          </div>
        </div>}
        <p className="manager-note">ゲームを削除する代わりに休止を使うと、過去の履歴やタスクを残せます。</p>
      </section>
    </div>
  )
}

function TaskManagerModal({ tasks, initialPeriod = 'すべて', onEdit, onDeactivateMany, onDeleteMany, onClose }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [period, setPeriod] = useState(initialPeriod)
  const [selectedIds, setSelectedIds] = useState([])
  const normalizedQuery = normalizeGameSearch(query)
  const filteredTasks = useMemo(() => sortTasks(tasks.filter((task) => {
    const matchesStatus = status === 'all' || (status === 'active' ? isTaskActive(task) : !isTaskActive(task))
    const searchable = normalizeGameSearch(`${task.game} ${task.title}`)
    return matchesStatus && (period === 'すべて' || task.period === period) && (!normalizedQuery || searchable.includes(normalizedQuery))
  })), [tasks, status, period, normalizedQuery])
  const visibleIds = filteredTasks.map((task) => task.id)
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length

  function toggleSelected(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function toggleVisible() {
    setSelectedIds((current) => selectedVisibleCount === visibleIds.length
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])])
  }

  async function deactivateSelected() {
    if (selectedIds.length === 0) return
    await onDeactivateMany(selectedIds)
    setSelectedIds([])
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return
    const count = selectedIds.length
    if (!window.confirm(`選択した${count}件のタスクを削除しますか？完了履歴も削除され、元に戻せません。`)) return
    await onDeleteMany(selectedIds)
    setSelectedIds([])
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-modal task-manager-modal" role="dialog" aria-modal="true" aria-labelledby="task-manager-title">
        <div className="modal-heading">
          <div><p className="eyebrow">TASK LIST</p><h2 id="task-manager-title">タスクを一括管理</h2><p>ゲーム情報は残したまま、タスクをまとめて整理できます。</p></div>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <div className="task-manager-toolbar">
          <input className="task-manager-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ゲーム名・タスク名で検索" aria-label="タスクを検索" />
          <select className="task-manager-status" value={status} onChange={(event) => { setStatus(event.target.value); setSelectedIds([]) }} aria-label="表示するタスク">
            <option value="active">有効なタスク</option>
            <option value="inactive">無効化したタスク</option>
            <option value="all">すべてのタスク</option>
          </select>
          <select className="task-manager-status" value={period} onChange={(event) => { setPeriod(event.target.value); setSelectedIds([]) }} aria-label="表示する周期">
            <option value="すべて">すべての周期</option>
            <option value="毎日">毎日</option>
            <option value="毎週">毎週</option>
            <option value="2週間ごと">2週間ごと</option>
            <option value="毎月">毎月</option>
            <option value="期間限定">期間限定</option>
          </select>
        </div>
        <div className="task-manager-selection">
          <label className="select-all-label"><input type="checkbox" checked={visibleIds.length > 0 && selectedVisibleCount === visibleIds.length} onChange={toggleVisible} />表示中を全選択</label>
          <span>{selectedIds.length}件選択中 / {filteredTasks.length}件表示</span>
        </div>
        <div className="bulk-task-list">
          {filteredTasks.length > 0 ? filteredTasks.map((task) => {
            const isSelected = selectedIds.includes(task.id)
            return <label className={`bulk-task-row ${isSelected ? 'selected' : ''} ${!isTaskActive(task) ? 'inactive' : ''}`} key={task.id}>
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(task.id)} />
              <div className={`game-mark ${task.tone || getGameVisual(task.game).tone}`} aria-hidden="true">{task.icon || getGameVisual(task.game).icon}</div>
              <div className="bulk-task-info"><strong>{task.title}</strong><span>{task.game} ・ {task.period} ・ {priorityLabel[task.priority]}{!isTaskActive(task) ? ' ・ 無効' : ''}</span></div>
              <button className="edit-button" type="button" onClick={(event) => { event.preventDefault(); onEdit(task) }}>編集</button>
            </label>
          }) : <div className="empty-state compact-empty"><span>✓</span><strong>該当するタスクはありません</strong><p>検索条件や表示対象を変えてください。</p></div>}
        </div>
        <div className="bulk-actions">
          <span className="manager-note">削除すると、このタスクの完了履歴も削除されます。</span>
          <div className="bulk-action-buttons"><button className="pause-button" type="button" onClick={deactivateSelected} disabled={selectedIds.length === 0}>選択を無効化</button><button className="danger-button" type="button" onClick={deleteSelected} disabled={selectedIds.length === 0}>選択を削除</button></div>
        </div>
      </section>
    </div>
  )
}

function ResourceCard({ resource, now, onConsume, onEdit }) {
  const currentAmount = getCurrentResource(resource, now)
  const maxAmount = Math.max(Number(resource.maxAmount) || 1, 1)
  const isFull = currentAmount >= maxAmount
  const percentage = Math.min(currentAmount / maxAmount * 100, 100)

  return (
    <article className="resource-card">
      <div className="resource-card-heading">
        <div className={`game-mark ${getGameVisual(resource.game).tone}`} aria-hidden="true">{getGameVisual(resource.game).icon}</div>
        <div className="resource-card-title"><span>{resource.game}</span><h3>{resource.name}</h3></div>
        {isFull && <span className="resource-full-badge">満タン</span>}
      </div>
      <div className="resource-amount"><strong>{currentAmount}</strong><span> / {maxAmount}</span></div>
      <div className="progress-track resource-progress"><span style={{ width: `${percentage}%` }} /></div>
      <div className="resource-meta"><span>{formatResourceTime(getResourceMinutesUntilFull(resource, now))}</span><span>1回復 / {resource.recoveryMinutes}分</span></div>
      {resource.checkUrl && <div className="resource-source-row"><a className="resource-link" href={resource.checkUrl} target="_blank" rel="noreferrer">確認先を開く ↗</a></div>}
      <div className="resource-actions">
        {[10, 20, 40].map((amount) => <button key={amount} className="step-button" type="button" onClick={() => onConsume(resource.id, amount)} disabled={currentAmount === 0}>−{amount}</button>)}
        <button className="edit-button resource-edit-button" type="button" onClick={() => onEdit(resource)}>現在値を修正</button>
      </div>
    </article>
  )
}

function ResourceManagerModal({ resources, form, editingId, availableGames, now, onChange, onSubmit, onEdit, onDelete, onClose }) {
  const gameSuggestions = getGameSuggestions(availableGames, form.game)

  function changeGame(game) {
    onChange('game', game)
    if (!form.checkUrl || form.checkUrl === getDefaultResourceUrl(form.game)) onChange('checkUrl', getDefaultResourceUrl(game))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-modal resource-manager-modal" role="dialog" aria-modal="true" aria-labelledby="resource-manager-title">
        <div className="modal-heading">
          <div><p className="eyebrow">RESOURCE SETTINGS</p><h2 id="resource-manager-title">スタミナ・リソース管理</h2><p>HoYoLABなどで確認した現在値を入力すると、時間経過で自動回復します。</p></div>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="form-grid resource-form-grid">
            <label className="form-field"><span>リソース名</span><input required value={form.name} onChange={(event) => onChange('name', event.target.value)} placeholder="例：スタミナ" /></label>
            <label className="form-field"><span>ゲーム</span><input required value={form.game} onChange={(event) => changeGame(event.target.value)} placeholder="ゲーム名" /><div className="game-suggestions" aria-label="登録済みのゲーム">{gameSuggestions.length > 0 ? gameSuggestions.map((game) => <button key={game} type="button" className={form.game === game ? 'game-suggestion active' : 'game-suggestion'} onClick={() => changeGame(game)}>{game}</button>) : <small className="game-suggestion-empty">新しいゲーム名も入力できます。</small>}</div></label>
          </div>
          <div className="form-grid resource-form-grid">
            <label className="form-field"><span>現在値</span><input type="number" min="0" max={form.maxAmount || 9999} required value={form.currentAmount} onChange={(event) => onChange('currentAmount', event.target.value === '' ? '' : Number(event.target.value))} /><small>HoYoLABで見た値を入力</small></label>
            <label className="form-field"><span>最大値</span><input type="number" min="1" max="9999" required value={form.maxAmount} onChange={(event) => onChange('maxAmount', event.target.value === '' ? '' : Number(event.target.value))} /><small>満タンになる上限</small></label>
            <label className="form-field"><span>回復間隔（分）</span><input type="number" min="1" max="10080" required value={form.recoveryMinutes} onChange={(event) => onChange('recoveryMinutes', event.target.value === '' ? '' : Number(event.target.value))} /><small>1ポイント回復する時間</small></label>
          </div>
          <label className="form-field full-field"><span>確認先URL（任意）</span><input type="url" value={form.checkUrl} onChange={(event) => onChange('checkUrl', event.target.value)} placeholder="HoYoLABなどの確認ページURL" /><small>スマホではアプリが開く場合があります。NTEなどは公式サイトのURLも登録できます。</small></label>
          <div className="modal-actions"><div>{editingId && <button type="button" className="danger-link delete-link" onClick={() => onDelete(editingId)}>このリソースを削除</button>}</div><div className="modal-main-actions"><button type="button" className="cancel-button" onClick={onClose}>閉じる</button><button type="submit" className="save-button">{editingId ? '変更を保存' : 'リソースを追加'}</button></div></div>
        </form>
        <div className="manager-divider" />
        <div className="manager-section-heading"><div><p className="eyebrow">REGISTERED RESOURCES</p><h3>登録済みのリソース</h3></div><span>{resources.length}件</span></div>
        <div className="resource-manager-list">
          {sortResources(resources, now).length > 0 ? sortResources(resources, now).map((resource) => <div className="resource-manager-row" key={resource.id}>
            <div className={`game-mark ${getGameVisual(resource.game).tone}`} aria-hidden="true">{getGameVisual(resource.game).icon}</div>
            <div className="game-manager-info"><strong>{resource.game} ・ {resource.name}</strong><span>{getCurrentResource(resource, now)} / {resource.maxAmount} ・ 1回復 {resource.recoveryMinutes}分</span></div>
            <button className="edit-button" type="button" onClick={() => onEdit(resource)}>編集</button>
          </div>) : <div className="empty-state compact-empty"><span>⚡</span><strong>まだ登録されていません</strong><p>HoYoLABで現在値を確認して、上のフォームから追加できます。</p></div>}
        </div>
      </section>
    </div>
  )
}

function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [resources, setResources] = useState([])
  const [selectedGame, setSelectedGame] = useState('すべて')
  const [taskForm, setTaskForm] = useState(blankTaskForm)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [gameRecords, setGameRecords] = useState(initialGameRecords)
  const gameRecordsRef = useRef(initialGameRecords)
  const gameLongPressRef = useRef({ timer: null, game: '', activated: false })
  const suppressGameClickRef = useRef(false)
  const [isGameReorderMode, setIsGameReorderMode] = useState(false)
  const [draggingGame, setDraggingGame] = useState('')
  const [isGameManagerOpen, setIsGameManagerOpen] = useState(false)
  const [isTaskManagerOpen, setIsTaskManagerOpen] = useState(false)
  const [taskManagerPeriod, setTaskManagerPeriod] = useState('すべて')
  const [isResourceManagerOpen, setIsResourceManagerOpen] = useState(false)
  const [resourceForm, setResourceForm] = useState(blankResourceForm)
  const [editingResourceId, setEditingResourceId] = useState(null)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [dataLoading, setDataLoading] = useState(isSupabaseConfigured)
  const [syncError, setSyncError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const isCloudMode = isSupabaseConfigured && Boolean(session)
  const games = ['すべて', ...gameRecords.filter((game) => game.active).map((game) => game.name)]
  const availableGameNames = gameRecords.filter((game) => game.active).map((game) => game.name)
  const activeGameSet = useMemo(() => new Set(gameRecords.filter((game) => game.active).map((game) => game.name)), [gameRecords])
  const visibleTasks = useMemo(() => sortTasks(tasks.filter((task) => isTaskActive(task) && activeGameSet.has(task.game) && (selectedGame === 'すべて' || task.game === selectedGame))), [tasks, selectedGame, activeGameSet])
  const activeTasks = visibleTasks.filter((task) => !(task.completed || (task.type === 'count' && task.progress >= task.target)))
  const activeTasksAll = tasks.filter((task) => isTaskActive(task) && activeGameSet.has(task.game))
  const doneCount = activeTasksAll.filter((task) => task.completed || (task.type === 'count' && task.progress >= task.target)).length
  const totalCount = activeTasksAll.length
  const weeklyTasks = activeTasksAll.filter((task) => task.period === '毎週')
  const weeklyProgress = weeklyTasks.reduce((total, task) => total + (task.type === 'count' ? task.progress : task.completed ? 1 : 0), 0)
  const weeklyTarget = weeklyTasks.reduce((total, task) => total + (task.type === 'count' ? task.target : 1), 0)
  const weeklyByGame = [...weeklyTasks.reduce((groups, task) => {
    const current = groups.get(task.game) || { game: task.game, progress: 0, target: 0 }
    current.progress += task.type === 'count' ? task.progress : task.completed ? 1 : 0
    current.target += task.type === 'count' ? task.target : 1
    groups.set(task.game, current)
    return groups
  }, new Map()).values()].sort((a, b) => a.game.localeCompare(b.game, 'ja'))
  const visibleResources = useMemo(() => sortResources(resources.filter((resource) => resource.active !== false && (selectedGame === 'すべて' || resource.game === selectedGame)), now), [resources, selectedGame, now])

  useEffect(() => {
    gameRecordsRef.current = gameRecords
  }, [gameRecords])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  function clearGameLongPress() {
    if (gameLongPressRef.current.timer) window.clearTimeout(gameLongPressRef.current.timer)
    gameLongPressRef.current.timer = null
  }

  function startGameLongPress(game, event) {
    if (game === 'すべて') return
    clearGameLongPress()
    gameLongPressRef.current = { timer: window.setTimeout(() => {
      gameLongPressRef.current.activated = true
      suppressGameClickRef.current = true
      setIsGameReorderMode(true)
      setDraggingGame(game)
    }, 500), game, activated: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function reorderGameRecords(sourceGame, targetGame) {
    if (!sourceGame || !targetGame || sourceGame === targetGame || targetGame === 'すべて') return
    const current = gameRecordsRef.current
    const activeGames = current.filter((game) => game.active)
    const sourceIndex = activeGames.findIndex((game) => game.name === sourceGame)
    const targetIndex = activeGames.findIndex((game) => game.name === targetGame)
    if (sourceIndex < 0 || targetIndex < 0) return
    const nextActiveGames = [...activeGames]
    const [movedGame] = nextActiveGames.splice(sourceIndex, 1)
    nextActiveGames.splice(targetIndex, 0, movedGame)
    const nextRecords = [...nextActiveGames, ...current.filter((game) => !game.active)]
    gameRecordsRef.current = nextRecords
    setGameRecords(nextRecords)
  }

  function handleGameChipMove(event) {
    if (!isGameReorderMode || !draggingGame) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-game-chip]')
    reorderGameRecords(draggingGame, target?.dataset.gameChip || '')
  }

  async function saveGameOrder(records = gameRecordsRef.current) {
    if (!isCloudMode) return
    const activeGames = records.filter((game) => game.active && game.id)
    const results = await Promise.all(activeGames.map((game, index) => supabase.from('games').update({ sort_order: index }).eq('id', game.id).eq('user_id', session.user.id)))
    const failed = results.find((result) => result.error)
    if (failed?.error) showSyncError(failed.error)
  }

  function finishGameLongPress() {
    const wasActivated = gameLongPressRef.current.activated
    clearGameLongPress()
    gameLongPressRef.current = { timer: null, game: '', activated: false }
    if (wasActivated) {
      setIsGameReorderMode(false)
      setDraggingGame('')
      void saveGameOrder()
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return undefined
    }
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setSyncError(error.message)
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession)
    })
    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function seedInitialData(userId) {
    const gamePayload = initialGames.map((name, sortOrder) => ({ user_id: userId, name, active: true, sort_order: sortOrder }))
    const { data: createdGames, error: gameError } = await supabase.from('games').insert(gamePayload).select('*')
    if (gameError) throw gameError
    const gameIds = new Map(createdGames.map((game) => [game.name, game.id]))
    const taskPayload = initialTasks.map((task) => ({
      user_id: userId,
      game_id: gameIds.get(task.game),
      title: task.title,
      type: task.type,
      period: task.period,
      priority: task.priority,
      minutes: task.minutes === '' ? null : task.minutes,
      target: task.target || 1,
      memo: '',
      active: true,
    }))
    const { error: taskError } = await supabase.from('tasks').insert(taskPayload)
    if (taskError) throw taskError
  }

  async function loadCloudData(userId) {
    let { data: gameRows, error: gameError } = await supabase.from('games').select('*').eq('user_id', userId).order('created_at')
    if (gameError) throw gameError
    let { data: taskRows, error: taskError } = await supabase.from('tasks').select('*').eq('user_id', userId).order('created_at')
    if (taskError) throw taskError
    if (gameRows.length === 0 && taskRows.length === 0) {
      await seedInitialData(userId)
      const gameResult = await supabase.from('games').select('*').eq('user_id', userId).order('created_at')
      const taskResult = await supabase.from('tasks').select('*').eq('user_id', userId).order('created_at')
      if (gameResult.error) throw gameResult.error
      if (taskResult.error) throw taskResult.error
      gameRows = gameResult.data
      taskRows = taskResult.data
    }
    const { data: periodRows, error: periodError } = await supabase.from('task_periods').select('*').eq('user_id', userId)
    if (periodError) throw periodError
    const gameMap = new Map(gameRows.map((game) => [game.id, game.name]))
    const periodMap = new Map(periodRows.map((period) => {
      const task = taskRows.find((item) => item.id === period.task_id)
      return [`${period.task_id}:${task ? getPeriodKey({ period: task.period, startDate: task.start_date, endDate: task.end_date }) : period.period_key}`, period]
    }))
    gameRows.sort((a, b) => {
      const aOrder = a.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(a.sort_order)
      const bOrder = b.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(b.sort_order)
      return aOrder - bOrder || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
    setGameRecords(gameRows.map((game) => ({ id: game.id, name: game.name, active: game.active })))
    setTasks(taskRows.map((task) => mapDatabaseTask(task, gameMap.get(task.game_id) || '未分類', periodMap.get(`${task.id}:${getPeriodKey({ period: task.period, startDate: task.start_date, endDate: task.end_date })}`))))
    const resourceResult = await supabase.from('resources').select('*').eq('user_id', userId).order('created_at')
    if (resourceResult.error) {
      if (resourceResult.error.code === 'PGRST205' || resourceResult.error.code === '42P01') {
        setResources([])
      } else {
        throw resourceResult.error
      }
    } else {
      setResources(resourceResult.data.map((resource) => mapDatabaseResource(resource, gameMap.get(resource.game_id) || '未分類')))
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !session) {
      setDataLoading(false)
      return undefined
    }
    let mounted = true
    setDataLoading(true)
    loadCloudData(session.user.id)
      .catch((error) => {
        if (mounted) setSyncError(`データの読み込みに失敗しました: ${error.message}`)
      })
      .finally(() => {
        if (mounted) setDataLoading(false)
      })
    return () => { mounted = false }
  }, [session])

  async function saveTaskPeriod(task, progress, completed) {
    if (!isCloudMode) return
    const { error } = await supabase.from('task_periods').upsert({
      user_id: session.user.id,
      task_id: task.id,
      period_key: getPeriodKey(task),
      progress,
      completed,
    }, { onConflict: 'task_id,period_key' })
    if (error) throw error
  }

  function showSyncError(error) {
    setSyncError(`保存に失敗しました: ${error.message}`)
  }

  async function signOut() {
    if (isCloudMode) await supabase.auth.signOut()
  }

  async function toggleTask(id) {
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    const completed = !task.completed
    setTasks((current) => current.map((item) => item.id === id ? { ...item, completed } : item))
    try {
      await saveTaskPeriod(task, completed ? 1 : 0, completed)
    } catch (error) {
      showSyncError(error)
    }
  }

  async function incrementTask(id) {
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    const progress = Math.min(task.progress + 1, task.target)
    const completed = progress >= task.target
    setTasks((current) => current.map((item) => item.id === id ? { ...item, progress, completed } : item))
    try {
      await saveTaskPeriod(task, progress, completed)
    } catch (error) {
      showSyncError(error)
    }
  }

  async function decrementTask(id) {
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    const progress = Math.max(task.progress - 1, 0)
    const completed = progress >= task.target
    setTasks((current) => current.map((item) => item.id === id ? { ...item, progress, completed } : item))
    try {
      await saveTaskPeriod(task, progress, completed)
    } catch (error) {
      showSyncError(error)
    }
  }

  async function collectStock(id) {
    const task = tasks.find((item) => item.id === id)
    if (!task || task.type !== 'stock') return
    const currentStock = getCurrentStock(task, now)
    if (currentStock === 0) return
    const stockUpdatedAt = new Date().toISOString()
    setTasks((current) => current.map((item) => item.id === id ? { ...item, stockAmount: 0, stockUpdatedAt } : item))
    if (isCloudMode) {
      const { error } = await supabase.from('tasks').update({ stock_amount: 0, stock_updated_at: stockUpdatedAt }).eq('id', id).eq('user_id', session.user.id)
      if (error) showSyncError(error)
    }
  }

  function openResourceManager() {
    setEditingResourceId(null)
    const game = selectedGame === 'すべて' ? '原神' : selectedGame
    setResourceForm({ ...blankResourceForm, game, checkUrl: getDefaultResourceUrl(game) })
    setIsResourceManagerOpen(true)
  }

  function openResourceEdit(resource) {
    setEditingResourceId(resource.id)
    setResourceForm({
      name: resource.name,
      game: resource.game,
      currentAmount: getCurrentResource(resource, now),
      maxAmount: resource.maxAmount,
      recoveryMinutes: resource.recoveryMinutes,
      checkUrl: resource.checkUrl || '',
    })
    setIsResourceManagerOpen(true)
  }

  function updateResourceForm(field, value) {
    setResourceForm((current) => ({ ...current, [field]: value }))
  }

  async function submitResourceForm(event) {
    event.preventDefault()
    const gameName = String(resourceForm.game || '').trim()
    const name = String(resourceForm.name || '').trim()
    if (!gameName || !name) return
    const maxAmount = Math.max(Number(resourceForm.maxAmount) || 1, 1)
    const currentAmount = Math.min(Math.max(Number(resourceForm.currentAmount) || 0, 0), maxAmount)
    const recoveryMinutes = Math.max(Number(resourceForm.recoveryMinutes) || 1, 1)
    const checkUrl = String(resourceForm.checkUrl || '').trim()
    const updatedAt = new Date().toISOString()
    try {
      let gameRecord = gameRecords.find((game) => game.name === gameName)
      if (isCloudMode && !gameRecord?.id) {
        const { data, error } = await supabase.from('games').insert({ user_id: session.user.id, name: gameName, active: true, sort_order: gameRecords.filter((game) => game.active).length }).select('*').single()
        if (error) throw error
        gameRecord = { id: data.id, name: data.name, active: data.active }
        setGameRecords((current) => [...current, gameRecord])
      } else if (!isCloudMode && !gameRecord) {
        gameRecord = { id: null, name: gameName, active: true }
        setGameRecords((current) => [...current, gameRecord])
      }
      const normalized = { name, game: gameName, currentAmount, maxAmount, recoveryMinutes, checkUrl, updatedAt, active: true }
      if (isCloudMode) {
        const dbResource = { user_id: session.user.id, game_id: gameRecord.id, name, current_amount: currentAmount, max_amount: maxAmount, recovery_minutes: recoveryMinutes, check_url: checkUrl, updated_at: updatedAt, active: true }
        const result = editingResourceId
          ? await supabase.from('resources').update(dbResource).eq('id', editingResourceId).eq('user_id', session.user.id).select('*').single()
          : await supabase.from('resources').insert(dbResource).select('*').single()
        if (result.error) throw result.error
        const savedResource = mapDatabaseResource(result.data, gameName)
        setResources((current) => editingResourceId ? current.map((resource) => resource.id === editingResourceId ? savedResource : resource) : [...current, savedResource])
      } else if (editingResourceId) {
        setResources((current) => current.map((resource) => resource.id === editingResourceId ? { ...resource, ...normalized } : resource))
      } else {
        setResources((current) => [...current, { ...normalized, id: Date.now() }])
      }
      setEditingResourceId(null)
      const nextGame = selectedGame === 'すべて' ? gameName : selectedGame
      setResourceForm({ ...blankResourceForm, game: nextGame, checkUrl: getDefaultResourceUrl(nextGame) })
    } catch (error) {
      showSyncError(error)
    }
  }

  async function consumeResource(id, amount) {
    const resource = resources.find((item) => item.id === id)
    if (!resource) return
    const currentAmount = getCurrentResource(resource, now)
    if (currentAmount === 0) return
    const updatedAt = new Date().toISOString()
    const nextAmount = Math.max(currentAmount - amount, 0)
    setResources((current) => current.map((item) => item.id === id ? { ...item, currentAmount: nextAmount, updatedAt } : item))
    if (isCloudMode) {
      const { error } = await supabase.from('resources').update({ current_amount: nextAmount, updated_at: updatedAt }).eq('id', id).eq('user_id', session.user.id)
      if (error) showSyncError(error)
    }
  }

  async function deleteResource(id) {
    const resource = resources.find((item) => item.id === id)
    if (!resource || !window.confirm(`「${resource.game}の${resource.name}」を削除しますか？`)) return
    if (isCloudMode) {
      const { error } = await supabase.from('resources').delete().eq('id', id).eq('user_id', session.user.id)
      if (error) {
        showSyncError(error)
        return
      }
    }
    setResources((current) => current.filter((item) => item.id !== id))
    setEditingResourceId(null)
    const nextGame = selectedGame === 'すべて' ? '原神' : selectedGame
    setResourceForm({ ...blankResourceForm, game: nextGame, checkUrl: getDefaultResourceUrl(nextGame) })
  }

  function openCreateForm() {
    const today = new Date()
    setTaskForm({ ...blankTaskForm, game: selectedGame === 'すべて' ? '原神' : selectedGame, startDate: toDateInputValue(today), endDate: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)), limitedDays: 7, limitedHours: 0 })
    setEditingTaskId(null)
    setIsTaskFormOpen(true)
  }

  function openEditForm(task) {
    const today = new Date()
    const currentStock = task.type === 'stock' ? getCurrentStock(task, now) : task.stockAmount || 0
    const limitedValues = task.period === '期間限定' ? getLimitedDurationValues(task.endAt, task.endDate, now) : { limitedDays: 7, limitedHours: 0 }
    setTaskForm({ ...blankTaskForm, ...task, ...limitedValues, target: task.target || 3, stockIntervalHours: task.stockIntervalHours || 24, stockCapacity: task.stockCapacity || 7, stockAmount: currentStock, stockUpdatedAt: task.type === 'stock' ? new Date().toISOString() : task.stockUpdatedAt || '', memo: task.memo || '', startDate: task.startDate || toDateInputValue(today), endDate: task.endDate || toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)), startAt: task.startAt || '', endAt: task.endAt || '' })
    setEditingTaskId(task.id)
    setIsTaskFormOpen(true)
  }

  function closeTaskForm() {
    setEditingTaskId(null)
    setTaskForm(blankTaskForm)
    setIsTaskFormOpen(false)
  }

  function updateTaskForm(field, value) {
    setTaskForm((current) => ({ ...current, [field]: value }))
  }

  async function submitTaskForm(event) {
    event.preventDefault()
    const gameName = taskForm.game.trim()
    if (!gameName) return
    const visual = getGameVisual(gameName)
    const stockCapacity = Math.max(Number(taskForm.stockCapacity) || 1, 1)
    const normalizedPeriod = taskForm.type === 'stock' ? '毎日' : taskForm.period
    const limitedDays = Math.max(Number(taskForm.limitedDays) || 0, 0)
    const limitedHours = Math.min(Math.max(Number(taskForm.limitedHours) || 0, 0), 23)
    const limitedDurationHours = limitedDays * 24 + limitedHours
    if (normalizedPeriod === '期間限定' && limitedDurationHours <= 0) {
      setSyncError('期間限定タスクは、残り時間を1時間以上入力してください。')
      return
    }
    const limitedStartAt = normalizedPeriod === '期間限定' ? new Date() : null
    const limitedEndAt = limitedStartAt ? new Date(limitedStartAt.getTime() + limitedDurationHours * 3600000) : null
    const normalizedStartDate = limitedStartAt ? toDateInputValue(limitedStartAt) : taskForm.startDate
    const normalizedEndDate = limitedEndAt ? toDateInputValue(limitedEndAt) : taskForm.endDate
    const normalized = { ...taskForm, game: gameName, period: normalizedPeriod, active: taskForm.active !== false, priority: Number(taskForm.priority), minutes: taskForm.minutes === '' ? '' : Math.max(Number(taskForm.minutes) || 1, 1), startDate: normalizedStartDate, endDate: normalizedEndDate, startAt: limitedStartAt?.toISOString() || taskForm.startAt || '', endAt: limitedEndAt?.toISOString() || taskForm.endAt || '', limitedDays, limitedHours, dueDays: getDueDaysForPeriod(normalizedPeriod, normalizedStartDate, normalizedEndDate, limitedEndAt?.toISOString() || taskForm.endAt || ''), target: Math.max(Number(taskForm.target) || 1, 1), stockIntervalHours: Math.max(Number(taskForm.stockIntervalHours) || 24, 1), stockCapacity, stockAmount: Math.min(Math.max(Number(taskForm.stockAmount) || 0, 0), stockCapacity), stockUpdatedAt: taskForm.stockUpdatedAt || new Date().toISOString(), icon: visual.icon, tone: visual.tone }
    try {
      if (isCloudMode) {
        let gameRecord = gameRecords.find((game) => game.name === gameName)
        if (!gameRecord?.id) {
          const { data, error } = await supabase.from('games').insert({ user_id: session.user.id, name: gameName, active: true, sort_order: gameRecords.filter((game) => game.active).length }).select('*').single()
          if (error) throw error
          gameRecord = { id: data.id, name: data.name, active: data.active }
          setGameRecords((current) => [...current, gameRecord])
        }
        const dbTask = {
          user_id: session.user.id,
          game_id: gameRecord.id,
          title: normalized.title,
          type: normalized.type,
          period: normalized.period,
          priority: normalized.priority,
          minutes: normalized.minutes === '' ? null : normalized.minutes,
          target: normalized.target,
          memo: normalized.memo || '',
          start_date: normalized.startDate || null,
          end_date: normalized.endDate || null,
          start_at: normalized.startAt || null,
          end_at: normalized.endAt || null,
          active: normalized.active,
        }
        if (normalized.type === 'stock') Object.assign(dbTask, { stock_interval_hours: normalized.stockIntervalHours, stock_capacity: normalized.stockCapacity, stock_amount: normalized.stockAmount, stock_updated_at: normalized.stockUpdatedAt })
        const result = editingTaskId
          ? await supabase.from('tasks').update(dbTask).eq('id', editingTaskId).eq('user_id', session.user.id).select('*').single()
          : await supabase.from('tasks').insert(dbTask).select('*').single()
        if (result.error) throw result.error
        const existingTask = tasks.find((task) => task.id === editingTaskId)
        const savedTask = { ...normalized, id: result.data.id, progress: existingTask?.progress || 0, completed: existingTask?.completed || false }
        if (editingTaskId) setTasks((current) => current.map((task) => task.id === editingTaskId ? savedTask : task))
        else setTasks((current) => [...current, savedTask])
      } else {
        setGameRecords((current) => current.some((game) => game.name === gameName) ? current : [...current, { id: null, name: gameName, active: true }])
        if (editingTaskId) {
          setTasks((current) => current.map((task) => task.id === editingTaskId ? { ...task, ...normalized } : task))
        } else {
          setTasks((current) => [...current, { ...normalized, id: Date.now(), completed: false, progress: normalized.type === 'count' ? 0 : undefined }])
        }
      }
      closeTaskForm()
    } catch (error) {
      showSyncError(error)
    }
  }

  async function deactivateTask() {
    if (editingTaskId === null) return
    setTasks((current) => current.map((task) => task.id === editingTaskId ? { ...task, active: false } : task))
    if (isCloudMode) {
      const { error } = await supabase.from('tasks').update({ active: false }).eq('id', editingTaskId).eq('user_id', session.user.id)
      if (error) showSyncError(error)
    }
    closeTaskForm()
  }

  async function reactivateTask(id) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, active: true } : task))
    if (isCloudMode) {
      const { error } = await supabase.from('tasks').update({ active: true }).eq('id', id).eq('user_id', session.user.id)
      if (error) showSyncError(error)
    }
  }

  async function deleteTask() {
    if (editingTaskId === null) return
    const task = tasks.find((item) => item.id === editingTaskId)
    if (!task || !window.confirm(`「${task.title}」を削除しますか？この操作は元に戻せません。`)) return
    setTasks((current) => current.filter((item) => item.id !== editingTaskId))
    if (isCloudMode) {
      const { error } = await supabase.from('tasks').delete().eq('id', editingTaskId).eq('user_id', session.user.id)
      if (error) showSyncError(error)
    }
    closeTaskForm()
  }

  async function deactivateTasks(ids) {
    try {
      if (isCloudMode) {
        const { error } = await supabase.from('tasks').update({ active: false }).in('id', ids).eq('user_id', session.user.id)
        if (error) throw error
      }
      setTasks((current) => current.map((task) => ids.includes(task.id) ? { ...task, active: false } : task))
    } catch (error) {
      showSyncError(error)
    }
  }

  async function deleteTasks(ids) {
    try {
      if (isCloudMode) {
        const { error } = await supabase.from('tasks').delete().in('id', ids).eq('user_id', session.user.id)
        if (error) throw error
      }
      setTasks((current) => current.filter((task) => !ids.includes(task.id)))
    } catch (error) {
      showSyncError(error)
    }
  }

  async function addGame(name) {
    if (gameRecords.some((game) => game.name === name)) return
    if (isCloudMode) {
      const { data, error } = await supabase.from('games').insert({ user_id: session.user.id, name, active: true, sort_order: gameRecords.filter((game) => game.active).length }).select('*').single()
      if (error) {
        showSyncError(error)
        return
      }
      setGameRecords((current) => [...current, { id: data.id, name: data.name, active: data.active }])
      return
    }
    setGameRecords((current) => [...current, { id: null, name, active: true }])
  }

  async function renameGame(oldName, newName) {
    const game = gameRecords.find((item) => item.name === oldName)
    if (isCloudMode && game?.id) {
      const { error } = await supabase.from('games').update({ name: newName }).eq('id', game.id).eq('user_id', session.user.id)
      if (error) {
        showSyncError(error)
        return
      }
    }
    setGameRecords((current) => current.map((game) => game.name === oldName ? { ...game, name: newName } : game))
    setTasks((current) => current.map((task) => task.game === oldName ? { ...task, game: newName, ...getGameVisual(newName) } : task))
    setResources((current) => current.map((resource) => resource.game === oldName ? { ...resource, game: newName } : resource))
    if (selectedGame === oldName) setSelectedGame(newName)
  }

  async function toggleGame(name) {
    const game = gameRecords.find((item) => item.name === name)
    const active = !game?.active
    if (isCloudMode && game?.id) {
      const { error } = await supabase.from('games').update({ active }).eq('id', game.id).eq('user_id', session.user.id)
      if (error) {
        showSyncError(error)
        return
      }
    }
    setGameRecords((current) => current.map((game) => game.name === name ? { ...game, active: !game.active } : game))
    if (selectedGame === name) setSelectedGame('すべて')
  }

  if (isSupabaseConfigured && authLoading) return <main className="auth-shell"><section className="auth-card loading-card"><span className="brand-mark">✓</span><h1>接続を確認しています</h1><p>Supabaseへ接続中です。</p></section></main>
  if (isSupabaseConfigured && !session) return <AuthScreen />
  if (isSupabaseConfigured && dataLoading) return <main className="auth-shell"><section className="auth-card loading-card"><span className="brand-mark">✓</span><h1>データを読み込んでいます</h1><p>ゲーム日課を準備中です。</p></section></main>

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ゲーム日課トップへ">
          <span className="brand-mark">✓</span>
          <span><strong>ゲーム日課</strong><small>今日やることを、迷わず。</small></span>
        </a>
        <nav className="top-actions" aria-label="アプリメニュー">
          <button className="icon-button" aria-label="タスクを一括管理" title="タスクを一括管理" onClick={() => { setTaskManagerPeriod('すべて'); setIsTaskManagerOpen(true) }}>☷</button>
          <button className="icon-button" aria-label="スタミナ・リソース管理" title="スタミナ・リソース管理" onClick={openResourceManager}>⚡</button>
          <button className="icon-button" aria-label="ゲーム管理" onClick={() => setIsGameManagerOpen(true)}>⚙</button>
          <button className="avatar" aria-label="ログアウト" title={isCloudMode ? 'ログアウト' : 'デモモード'} onClick={signOut}>T</button>
        </nav>
      </header>

      <main className="main-content">
        {syncError && <div className="sync-error" role="alert">{syncError}<button type="button" onClick={() => setSyncError('')} aria-label="エラーを閉じる">×</button></div>}
        <section className="welcome-row">
          <div>
            <p className="eyebrow">TODAY'S ROUTINE</p>
            <h1>今日やること</h1>
            <p className="date-text">{formatDate()}　<span>期限が近い順に表示中</span></p>
          </div>
          <div className="completion-summary">
            <span>今日の達成度</span>
            <strong>{doneCount}<small> / {totalCount}</small></strong>
            <div className="summary-track"><span style={{ width: `${totalCount ? doneCount / totalCount * 100 : 0}%` }} /></div>
          </div>
        </section>

        <section className="filter-bar" aria-label="ゲームで絞り込む">
          <span className="filter-label">ゲームで絞り込む</span>
          <div className="game-filters">
            {games.map((game) => <button key={game} type="button" data-game-chip={game} className={`${selectedGame === game ? 'filter-chip active' : 'filter-chip'}${isGameReorderMode ? ' reorder-mode' : ''}${draggingGame === game ? ' dragging' : ''}`} title={game === 'すべて' ? 'すべてのゲームを表示' : '長押しして並び替え'} onClick={(event) => { if (suppressGameClickRef.current) { suppressGameClickRef.current = false; event.preventDefault(); return } if (!isGameReorderMode) setSelectedGame(game) }} onPointerDown={(event) => startGameLongPress(game, event)} onPointerMove={handleGameChipMove} onPointerUp={finishGameLongPress} onPointerCancel={finishGameLongPress}>{game}</button>)}
          </div>
        </section>

        {visibleResources.length > 0 && <section className="resource-panel">
          <div className="section-heading">
            <div><h2>スタミナ・リソース <span>{visibleResources.length}</span></h2><p>HoYoLABで確認した値を基準に自動回復</p></div>
            <button className="add-task-button" onClick={openResourceManager}>＋ リソースを追加</button>
          </div>
          <div className="resource-grid">{visibleResources.map((resource) => <ResourceCard key={resource.id} resource={resource} now={now} onConsume={consumeResource} onEdit={openResourceEdit} />)}</div>
        </section>}

        <div className="dashboard-grid">
          <section className="task-panel">
            <div className="section-heading">
              <div><h2>未完了のタスク <span>{activeTasks.length}</span></h2><p>期限が近いものから片付けよう</p></div>
              <button className="add-task-button" onClick={openCreateForm}>＋ タスクを追加</button>
            </div>
            <div className="task-list">
              {activeTasks.length > 0 ? activeTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onIncrement={incrementTask} onDecrement={decrementTask} onCollect={collectStock} onEdit={openEditForm} now={now} />) : <div className="empty-state"><span>🎉</span><strong>今日のタスクは完了です</strong><p>おつかれさま。完了済みから記録を確認できます。</p></div>}
            </div>
            {doneCount > 0 && <details className="completed-details"><summary>完了済みを表示（{doneCount}）</summary><div className="completed-list">{sortTasks(tasks.filter((task) => isTaskActive(task) && (task.completed || (task.type === 'count' && task.progress >= task.target)))).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onIncrement={incrementTask} onDecrement={decrementTask} onCollect={collectStock} onEdit={openEditForm} now={now} />)}</div></details>}
          </section>

          <aside className="side-column">
            {weeklyTasks.length > 0 && <section className="side-card weekly-card">
              <div className="side-card-heading"><div><p className="eyebrow">THIS WEEK</p><h2>今週の進捗</h2></div><span className="calendar-icon">▦</span></div>
              <div className="week-progress"><strong>{weeklyProgress}<small> / {weeklyTarget}</small></strong><span>タスク達成</span><div className="large-track"><span style={{ width: `${weeklyTarget ? weeklyProgress / weeklyTarget * 100 : 0}%` }} /></div></div>
              {weeklyByGame.slice(0, 3).map((group) => <div className="mini-progress" key={group.game}><span className={`mini-dot ${getGameVisual(group.game).tone}-dot`} /><span>{group.game}</span><strong>{group.progress} / {group.target}{group.target > 1 ? '回' : ''}</strong></div>)}
              <button className="text-link" onClick={() => { setTaskManagerPeriod('毎週'); setIsTaskManagerOpen(true) }}>今週のすべてを見る <span>→</span></button>
            </section>}
            <section className="side-card tip-card"><span className="tip-icon">✦</span><div><strong>今日のヒント</strong><p>「あと1日」の週課から片付けると、週末に焦らずに済みます。</p></div></section>
          </aside>
        </div>
      </main>
      <footer className="footer"><span>ゲーム日課</span><span>{isCloudMode ? 'Supabaseに接続中' : '現在は試作データで動作しています'}</span></footer>
      {isTaskFormOpen && <TaskFormModal form={taskForm} isEditing={editingTaskId !== null} onChange={updateTaskForm} onClose={closeTaskForm} onSubmit={submitTaskForm} onDeactivate={deactivateTask} onDelete={deleteTask} availableGames={availableGameNames} />}
      {isTaskManagerOpen && <TaskManagerModal tasks={tasks} initialPeriod={taskManagerPeriod} onEdit={(task) => { setIsTaskManagerOpen(false); openEditForm(task) }} onDeactivateMany={deactivateTasks} onDeleteMany={deleteTasks} onClose={() => setIsTaskManagerOpen(false)} />}
      {isResourceManagerOpen && <ResourceManagerModal resources={resources} form={resourceForm} editingId={editingResourceId} availableGames={availableGameNames} now={now} onChange={updateResourceForm} onSubmit={submitResourceForm} onEdit={openResourceEdit} onDelete={deleteResource} onClose={() => { setIsResourceManagerOpen(false); setEditingResourceId(null) }} />}
      {isGameManagerOpen && <GameManagerModal games={gameRecords} tasks={tasks} onAdd={addGame} onRename={renameGame} onToggle={toggleGame} onReactivate={reactivateTask} onClose={() => setIsGameManagerOpen(false)} />}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`))
}
