import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './styles.css'

const initialTasks = [
  { id: 1, game: '原神', icon: '✦', tone: 'blue', title: 'デイリー任務を完了する', type: 'single', period: '毎日', dueDays: 0, priority: 3, minutes: 10, completed: false },
  { id: 2, game: 'ハートピア', icon: '♡', tone: 'pink', title: '住民依頼とログイン報酬', type: 'single', period: '毎日', dueDays: 0, priority: 3, minutes: 10, completed: false },
  { id: 3, game: 'NTE', icon: '◈', tone: 'violet', title: 'デイリーミッションを消化する', type: 'single', period: '毎日', dueDays: 0, priority: 2, minutes: 15, completed: false },
  { id: 4, game: '崩壊：スターレイル', icon: '✧', tone: 'indigo', title: '歴戦余韻をクリアする', type: 'count', period: '今週', dueDays: 2, priority: 3, minutes: 15, progress: 1, target: 3 },
  { id: 5, game: 'ドラクエウォーク', icon: '◆', tone: 'amber', title: '宝の地図ウィークリーミッション', type: 'count', period: '今週', dueDays: 4, priority: 2, minutes: 20, progress: 3, target: 5 },
  { id: 6, game: '原神', icon: '✦', tone: 'blue', title: '週ボスを消化する', type: 'single', period: '今週', dueDays: 1, priority: 2, minutes: 20, completed: false },
]

const initialGames = [...new Set(initialTasks.map((task) => task.game))]

const priorityLabel = { 3: '必須', 2: 'できれば', 1: '余裕があれば' }
const priorityClass = { 3: 'must', 2: 'should', 1: 'later' }
const gameVisuals = {
  原神: { icon: '✦', tone: 'blue' },
  ハートピア: { icon: '♡', tone: 'pink' },
  NTE: { icon: '◈', tone: 'violet' },
  '崩壊：スターレイル': { icon: '✧', tone: 'indigo' },
  ドラクエウォーク: { icon: '◆', tone: 'amber' },
}

const blankTaskForm = {
  title: '',
  game: '原神',
  type: 'single',
  period: '毎日',
  priority: 2,
  minutes: '',
  target: 3,
  memo: '',
  startDate: '',
  endDate: '',
}

function getGameVisual(game) {
  return gameVisuals[game] || { icon: '●', tone: 'blue' }
}

function getPeriodKey(task, date = new Date()) {
  const period = task.period
  const startDate = task.startDate || task.start_date || ''
  const endDate = task.endDate || task.end_date || ''
  const today = toDateInputValue(date)
  if (period === '毎日') return `daily:${today}`
  if (period === '今週') {
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
  return `limited:${startDate}:${endDate}`
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
    memo: row.memo || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    dueDays: getDueDaysForPeriod(row.period, row.start_date || '', row.end_date || ''),
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

function getDueDaysForPeriod(period, startDate, endDate) {
  const today = new Date()
  if (period === '毎日') return 0
  if (period === '今週') return (7 - today.getDay()) % 7
  if (period === '2週間ごと') {
    const anchor = startDate ? dateFromInput(startDate) : today
    const elapsed = daysBetween(anchor, today)
    if (elapsed < 0) return Math.abs(elapsed)
    return (14 - (elapsed % 14)) % 14
  }
  if (period === '毎月') return new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()
  if (period === '期間限定' && endDate) return Math.max(daysBetween(today, dateFromInput(endDate)), 0)
  return 7
}

function isTaskActive(task) {
  return task.active !== false
}

function formatDate() {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date())
}

function urgencyText(task) {
  if (task.type === 'count') {
    const remaining = task.target - task.progress
    if (remaining <= 0) return '達成済み'
    if (task.dueDays === 0) return `今日中にあと${remaining}回`
    return `あと${task.dueDays}日・残り${remaining}回`
  }
  if (task.completed) return '完了'
  if (task.dueDays === 0) return '今日中'
  return `あと${task.dueDays}日`
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aDone = a.completed || (a.type === 'count' && a.progress >= a.target)
    const bDone = b.completed || (b.type === 'count' && b.progress >= b.target)
    if (aDone !== bDone) return Number(aDone) - Number(bDone)
    const aPressure = a.type === 'count' ? (a.target - a.progress) / Math.max(a.dueDays + 1, 1) : 0
    const bPressure = b.type === 'count' ? (b.target - b.progress) / Math.max(b.dueDays + 1, 1) : 0
    if (a.dueDays !== b.dueDays) return a.dueDays - b.dueDays
    if (aPressure !== bPressure) return bPressure - aPressure
    if (a.priority !== b.priority) return b.priority - a.priority
    const aMinutes = a.minutes === '' ? Number.POSITIVE_INFINITY : a.minutes
    const bMinutes = b.minutes === '' ? Number.POSITIVE_INFINITY : b.minutes
    return aMinutes - bMinutes
  })
}

function TaskRow({ task, onToggle, onIncrement, onDecrement, onEdit }) {
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
          <span>{task.period}</span>
          {task.minutes ? <><span>・</span><span>{task.minutes}分</span></> : null}
          <span className={task.dueDays <= 1 && !isDone ? 'urgent-text' : ''}>・ {urgencyText(task)}</span>
        </div>
      </div>
      {task.type === 'count' ? (
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
  const gameSuggestions = getGameSuggestions(availableGames, form.game)
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
            <label className="form-field"><span>周期</span><select value={form.period} onChange={(event) => onChange('period', event.target.value)}><option>毎日</option><option>今週</option><option>2週間ごと</option><option>毎月</option><option>期間限定</option></select></label>
          </div>
          <div className="form-grid three-fields">
            <label className="form-field"><span>タスク形式</span><select value={form.type} onChange={(event) => onChange('type', event.target.value)}><option value="single">一度で完了</option><option value="count">回数目標</option></select></label>
            <label className="form-field"><span>重要度</span><select value={form.priority} onChange={(event) => onChange('priority', Number(event.target.value))}><option value="3">必須</option><option value="2">できれば</option><option value="1">余裕があれば</option></select></label>
            <label className="form-field"><span>所要時間（任意）</span><input type="number" min="1" max="999" value={form.minutes} onChange={(event) => onChange('minutes', event.target.value === '' ? '' : Number(event.target.value))} placeholder="例：10" /><small>未設定でも登録できます</small></label>
          </div>
          {form.period === '2週間ごと' && <div className="form-grid"><label className="form-field"><span>基準日</span><input type="date" required value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} /><small>この日を起点に14日ごとに発生します</small></label><div /></div>}
          {form.period === '期間限定' && <div className="form-grid"><label className="form-field"><span>開始日</span><input type="date" required value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} /></label><label className="form-field"><span>終了日</span><input type="date" required min={form.startDate} value={form.endDate} onChange={(event) => onChange('endDate', event.target.value)} /><small>終了日が近い順に表示します</small></label></div>}
          {isCount && <div className="form-grid"><label className="form-field"><span>目標回数</span><input type="number" min="1" max="999" required value={form.target} onChange={(event) => onChange('target', Number(event.target.value))} /><small>期間内に何回やるか</small></label><div /></div>}
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
            <option value="今週">今週</option>
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

function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedGame, setSelectedGame] = useState('すべて')
  const [taskForm, setTaskForm] = useState(blankTaskForm)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [gameRecords, setGameRecords] = useState(initialGames.map((name) => ({ id: null, name, active: true })))
  const [isGameManagerOpen, setIsGameManagerOpen] = useState(false)
  const [isTaskManagerOpen, setIsTaskManagerOpen] = useState(false)
  const [taskManagerPeriod, setTaskManagerPeriod] = useState('すべて')
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [dataLoading, setDataLoading] = useState(isSupabaseConfigured)
  const [syncError, setSyncError] = useState('')
  const isCloudMode = isSupabaseConfigured && Boolean(session)
  const games = ['すべて', ...gameRecords.filter((game) => game.active).map((game) => game.name)]
  const availableGameNames = gameRecords.filter((game) => game.active).map((game) => game.name)
  const activeGameSet = useMemo(() => new Set(gameRecords.filter((game) => game.active).map((game) => game.name)), [gameRecords])
  const visibleTasks = useMemo(() => sortTasks(tasks.filter((task) => isTaskActive(task) && activeGameSet.has(task.game) && (selectedGame === 'すべて' || task.game === selectedGame))), [tasks, selectedGame, activeGameSet])
  const activeTasks = visibleTasks.filter((task) => !(task.completed || (task.type === 'count' && task.progress >= task.target)))
  const activeTasksAll = tasks.filter((task) => isTaskActive(task) && activeGameSet.has(task.game))
  const doneCount = activeTasksAll.filter((task) => task.completed || (task.type === 'count' && task.progress >= task.target)).length
  const totalCount = activeTasksAll.length
  const weeklyTasks = activeTasksAll.filter((task) => task.period === '今週')
  const weeklyProgress = weeklyTasks.reduce((total, task) => total + (task.type === 'count' ? task.progress : task.completed ? 1 : 0), 0)
  const weeklyTarget = weeklyTasks.reduce((total, task) => total + (task.type === 'count' ? task.target : 1), 0)
  const weeklyByGame = [...weeklyTasks.reduce((groups, task) => {
    const current = groups.get(task.game) || { game: task.game, progress: 0, target: 0 }
    current.progress += task.type === 'count' ? task.progress : task.completed ? 1 : 0
    current.target += task.type === 'count' ? task.target : 1
    groups.set(task.game, current)
    return groups
  }, new Map()).values()].sort((a, b) => a.game.localeCompare(b.game, 'ja'))

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
    const gamePayload = initialGames.map((name) => ({ user_id: userId, name, active: true }))
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
    setGameRecords(gameRows.map((game) => ({ id: game.id, name: game.name, active: game.active })))
    setTasks(taskRows.map((task) => mapDatabaseTask(task, gameMap.get(task.game_id) || '未分類', periodMap.get(`${task.id}:${getPeriodKey({ period: task.period, startDate: task.start_date, endDate: task.end_date })}`))))
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

  function openCreateForm() {
    const today = new Date()
    setTaskForm({ ...blankTaskForm, game: selectedGame === 'すべて' ? '原神' : selectedGame, startDate: toDateInputValue(today), endDate: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)) })
    setEditingTaskId(null)
    setIsTaskFormOpen(true)
  }

  function openEditForm(task) {
    const today = new Date()
    setTaskForm({ ...blankTaskForm, ...task, target: task.target || 3, memo: task.memo || '', startDate: task.startDate || toDateInputValue(today), endDate: task.endDate || toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)) })
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
    const normalized = { ...taskForm, game: gameName, active: taskForm.active !== false, priority: Number(taskForm.priority), minutes: taskForm.minutes === '' ? '' : Math.max(Number(taskForm.minutes) || 1, 1), dueDays: getDueDaysForPeriod(taskForm.period, taskForm.startDate, taskForm.endDate), target: Math.max(Number(taskForm.target) || 1, 1), icon: visual.icon, tone: visual.tone }
    try {
      if (isCloudMode) {
        let gameRecord = gameRecords.find((game) => game.name === gameName)
        if (!gameRecord?.id) {
          const { data, error } = await supabase.from('games').insert({ user_id: session.user.id, name: gameName, active: true }).select('*').single()
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
          active: normalized.active,
        }
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
      const { data, error } = await supabase.from('games').insert({ user_id: session.user.id, name, active: true }).select('*').single()
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
            {games.map((game) => <button key={game} className={selectedGame === game ? 'filter-chip active' : 'filter-chip'} onClick={() => setSelectedGame(game)}>{game}</button>)}
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="task-panel">
            <div className="section-heading">
              <div><h2>未完了のタスク <span>{activeTasks.length}</span></h2><p>期限が近いものから片付けよう</p></div>
              <button className="add-task-button" onClick={openCreateForm}>＋ タスクを追加</button>
            </div>
            <div className="task-list">
              {activeTasks.length > 0 ? activeTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onIncrement={incrementTask} onDecrement={decrementTask} onEdit={openEditForm} />) : <div className="empty-state"><span>🎉</span><strong>今日のタスクは完了です</strong><p>おつかれさま。完了済みから記録を確認できます。</p></div>}
            </div>
            {doneCount > 0 && <details className="completed-details"><summary>完了済みを表示（{doneCount}）</summary><div className="completed-list">{sortTasks(tasks.filter((task) => isTaskActive(task) && (task.completed || (task.type === 'count' && task.progress >= task.target)))).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onIncrement={incrementTask} onDecrement={decrementTask} onEdit={openEditForm} />)}</div></details>}
          </section>

          <aside className="side-column">
            {weeklyTasks.length > 0 && <section className="side-card weekly-card">
              <div className="side-card-heading"><div><p className="eyebrow">THIS WEEK</p><h2>今週の進捗</h2></div><span className="calendar-icon">▦</span></div>
              <div className="week-progress"><strong>{weeklyProgress}<small> / {weeklyTarget}</small></strong><span>タスク達成</span><div className="large-track"><span style={{ width: `${weeklyTarget ? weeklyProgress / weeklyTarget * 100 : 0}%` }} /></div></div>
              {weeklyByGame.slice(0, 3).map((group) => <div className="mini-progress" key={group.game}><span className={`mini-dot ${getGameVisual(group.game).tone}-dot`} /><span>{group.game}</span><strong>{group.progress} / {group.target}{group.target > 1 ? '回' : ''}</strong></div>)}
              <button className="text-link" onClick={() => { setTaskManagerPeriod('今週'); setIsTaskManagerOpen(true) }}>今週のすべてを見る <span>→</span></button>
            </section>}
            <section className="side-card tip-card"><span className="tip-icon">✦</span><div><strong>今日のヒント</strong><p>「あと1日」の週課から片付けると、週末に焦らずに済みます。</p></div></section>
          </aside>
        </div>
      </main>
      <footer className="footer"><span>ゲーム日課</span><span>{isCloudMode ? 'Supabaseに接続中' : '現在は試作データで動作しています'}</span></footer>
      {isTaskFormOpen && <TaskFormModal form={taskForm} isEditing={editingTaskId !== null} onChange={updateTaskForm} onClose={closeTaskForm} onSubmit={submitTaskForm} onDeactivate={deactivateTask} onDelete={deleteTask} availableGames={availableGameNames} />}
      {isTaskManagerOpen && <TaskManagerModal tasks={tasks} initialPeriod={taskManagerPeriod} onEdit={(task) => { setIsTaskManagerOpen(false); openEditForm(task) }} onDeactivateMany={deactivateTasks} onDeleteMany={deleteTasks} onClose={() => setIsTaskManagerOpen(false)} />}
      {isGameManagerOpen && <GameManagerModal games={gameRecords} tasks={tasks} onAdd={addGame} onRename={renameGame} onToggle={toggleGame} onReactivate={reactivateTask} onClose={() => setIsGameManagerOpen(false)} />}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`))
}
