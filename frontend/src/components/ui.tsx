/** Reusable UI primitives.
 *
 *  Everything here is used by at least three role layouts. Deliberately plain:
 *  no animation library, no component framework, so the student bundle stays
 *  small enough for a low-end phone on a hostel connection.
 */

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'

export type Tone =
  | 'open'
  | 'progress'
  | 'blocked'
  | 'done'
  | 'dead'
  | 'urgent'
  | 'warn'
  | 'agent'
  | 'ghost'

export function Badge({
  tone = 'ghost',
  children,
  block,
  title,
  className = '',
}: {
  tone?: Tone
  children: ReactNode
  block?: boolean
  title?: string
  className?: string
}) {
  return (
    <span className={`badge badge-${tone}${block ? ' badge-block' : ''}${className ? ` ${className}` : ''}`} title={title}>
      {children}
    </span>
  )
}

export function Card({
  children,
  style,
  className = '',
  onClick,
  as = 'div',
  accent,
  ariaLabel,
  ...props
}: {
  children: ReactNode
  style?: CSSProperties
  className?: string
  onClick?: () => void
  as?: 'div' | 'article' | 'section' | 'li'
  accent?: 'signal' | 'urgent' | 'sun' | 'mint'
  ariaLabel?: string
  /** Tour anchor. Attribute props are declared so the guide can target cards. */
  'data-guide'?: string
}) {
  const Tag = (onClick ? 'button' : as) as any
  return (
    <Tag
      className={`card${onClick ? ' card-clickable' : ''}${accent ? ` card-accent-${accent}` : ''} ${className}`}
      style={style}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-label={ariaLabel}
      data-guide={props['data-guide']}
    >
      {children}
    </Tag>
  )
}

/** One header shape for every screen: kicker, title, optional subtitle,
 *  optional actions. Every page uses it, so the placement of a title and its
 *  buttons does not change from one screen to the next.
 *
 *  The kicker names the station the screen belongs to ("Case management",
 *  "Gate", "Administrator") and is what turns a heading into a page header. */
export function PageHeader({
  title,
  subtitle,
  actions,
  kicker,
  guide,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  kicker?: ReactNode
  guide?: string
}) {
  return (
    <header className="page-head" data-guide={guide}>
      <div className="grow">
        {kicker ? <div className="page-kicker">{kicker}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </header>
  )
}

/** A panel: a plate with an engraved header bar. This is the structural unit
 *  screens are built from - a header that names the block, a body, and an
 *  optional footer for the actions that belong to the whole block.
 *
 *  Cards are for items in a list; panels are for the sections of a page. Using
 *  them for their intended purpose is what stopped the layout reading as one
 *  undifferentiated scroll. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  footer,
  flush,
  hazard,
  className = '',
  guide,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Remove body padding, for a table that should meet the panel edge. */
  flush?: boolean
  /** A hazard stripe above the header. Reserved for live or irreversible
   *  states so the marking keeps its meaning. */
  hazard?: boolean
  className?: string
  guide?: string
}) {
  return (
    <section className={`panel ${className}`} data-guide={guide}>
      {hazard ? <div className="hazard-band" aria-hidden="true" /> : null}
      {title ? (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {actions ? <div className="row" style={{ gap: 'var(--sp-2)' }}>{actions}</div> : null}
          {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
        </header>
      ) : null}
      <div className={`panel-body${flush ? ' panel-body-flush' : ''}`}>{children}</div>
      {footer ? <footer className="panel-foot">{footer}</footer> : null}
    </section>
  )
}

/** The filter and action row that sits under a page header on every list
 *  screen. Two groups: what you are looking at, and what you can do about it. */
export function Toolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="toolbar" role="toolbar">
      <div className="toolbar-group">{children}</div>
      {actions ? <div className="toolbar-group">{actions}</div> : null}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row-between">
      <h2 className="section-title" style={{ marginBottom: 0 }}>
        {children}
      </h2>
      {right}
    </div>
  )
}

export function Metric({
  label,
  value,
  hint,
  tone,
  onClick,
  ...props
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  onClick?: () => void
  'data-guide'?: string
}) {
  // Tone is a soft leading rail, matching the card accents, rather than a heavy
  // top rule - the number stays the loudest thing in the tile.
  const accentStyle: CSSProperties | undefined = tone
    ? { borderInlineStart: `4px solid var(--${toneColor(tone)})` }
    : undefined
  return (
    <div
      className={`metric${onClick ? ' card-clickable' : ''}`}
      style={accentStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-guide={props['data-guide']}
      onKeyDown={onClick ? (event) => event.key === 'Enter' && onClick() : undefined}
    >
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </div>
  )
}

function toneColor(tone: Tone): string {
  const map: Record<Tone, string> = {
    open: 'status-open',
    progress: 'status-progress',
    blocked: 'status-blocked',
    done: 'status-done',
    dead: 'status-dead',
    urgent: 'status-urgent',
    warn: 'status-warn',
    agent: 'lilac',
    ghost: 'surface-alt',
  }
  return map[tone]
}

export function Button({
  children,
  onClick,
  variant = 'default',
  type = 'button',
  disabled,
  size,
  block,
  title,
  ariaLabel,
  busy,
  style,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'attention' | 'success' | 'info' | 'danger' | 'ghost' | 'agent'
  type?: 'button' | 'submit'
  disabled?: boolean
  size?: 'sm' | 'lg' | 'xl'
  block?: boolean
  title?: string
  ariaLabel?: string
  busy?: boolean
  style?: CSSProperties
  className?: string
}) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      className={classes}
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      style={style}
    >
      {busy ? 'Working…' : children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  id,
  autoComplete,
  inputMode,
  maxLength,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  id?: string
  autoComplete?: string
  inputMode?: 'text' | 'numeric' | 'email' | 'tel' | 'search'
  maxLength?: number
}) {
  return (
    <input
      className="input"
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function TextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
  id,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  id?: string
  disabled?: boolean
}) {
  return (
    <textarea
      className="textarea"
      id={id}
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  id,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  id?: string
  disabled?: boolean
}) {
  return (
    <select
      className="select"
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  id?: string
}) {
  return (
    <label className="row" style={{ cursor: 'pointer', minHeight: 44 }} htmlFor={id}>
      <input
        className="checkbox"
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          className="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? ` (${tab.count})` : ''}
        </button>
      ))}
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} ariaLabel="Close">
            ✕
          </Button>
        </div>
        {children}
        {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} ariaLabel="Close">
            ✕
          </Button>
        </div>
        {children}
        {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="state" role="status">
      <div className="state-title">{title}</div>
      {detail ? <p className="muted">{detail}</p> : null}
      {action}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <div className="skeleton" style={{ height: 68 }} />
      <div className="skeleton" style={{ height: 68 }} />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  offline,
}: {
  message: string
  onRetry?: () => void
  offline?: boolean
}) {
  return (
    <div className="state" role="alert">
      <div className="state-title">{offline ? 'No connection' : 'That did not work'}</div>
      <p>{message}</p>
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function KV({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="kv">
      {items.map((item) => (
        <div key={item.label} style={{ display: 'contents' }}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ProgressBar({ value, max, tone = 'signal' }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${pct}%`, background: `var(--${tone})` }} />
    </div>
  )
}

/** Vertical bars. Rendered as plain DOM rather than a chart library: the data
 *  volumes here are tiny and a dependency would cost more than it saves. */
export function BarChart({
  data,
  labelFormatter,
  valueFormatter,
}: {
  data: { label: string; value: number; secondary?: number }[]
  labelFormatter?: (label: string) => string
  valueFormatter?: (value: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="chart" role="img" aria-label="Bar chart">
        {data.map((item) => (
          <div
            key={item.label}
            className="col"
            style={{ height: `${Math.max(4, (item.value / max) * 100)}%` }}
            title={`${labelFormatter ? labelFormatter(item.label) : item.label}: ${valueFormatter ? valueFormatter(item.value) : item.value}`}
          />
        ))}
      </div>
      <div className="chart-legend" style={{ marginTop: 8 }}>
        <span className="muted">
          {data.length ? `${labelFormatter ? labelFormatter(data[0].label) : data[0].label} → ` : ''}
          {data.length ? (labelFormatter ? labelFormatter(data[data.length - 1].label) : data[data.length - 1].label) : ''}
        </span>
      </div>
    </div>
  )
}

export function PillRow({ children }: { children: ReactNode }) {
  return <div className="pill-row">{children}</div>
}

export function useDomId(prefix: string): string {
  const id = useId()
  return `${prefix}-${id.replace(/:/g, '')}`
}
