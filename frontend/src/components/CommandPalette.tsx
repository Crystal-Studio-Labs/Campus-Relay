/** Quick switcher (Ctrl/Cmd-K).
 *
 *  A deliberate, honest scope: it navigates between the screens the person can
 *  already reach, and nothing else. It does not search case contents, notices or
 *  students, because there is no search index behind it - offering a box that
 *  *looked* like global search but returned nothing would be exactly the kind of
 *  fake functionality this product refuses.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NavItem } from '../lib/navigation'

export interface PaletteEntry {
  item: NavItem
  group: string
}

export function CommandPalette({
  open,
  onClose,
  entries,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  entries: PaletteEntry[]
  onSelect: (to: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) =>
      `${entry.item.label} ${entry.group} ${entry.item.to}`.toLowerCase().includes(needle),
    )
  }, [entries, query])

  // Reset and focus each time it opens, so a previous query never lingers.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        const chosen = results[active]
        if (chosen) {
          event.preventDefault()
          onSelect(chosen.item.to)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, results, active, onClose, onSelect])

  if (!open) return null

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a screen"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-input">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="palette-field"
            value={query}
            placeholder="Jump to a screen…"
            aria-label="Search screens"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
          />
        </div>
        <ul className="palette-list" role="listbox" aria-label="Screens">
          {results.length === 0 ? (
            <li className="palette-empty">No screen matches “{query}”.</li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.item.to}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`palette-item${index === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onSelect(entry.item.to)}
                >
                  <span aria-hidden="true" className="palette-icon">
                    {entry.item.icon}
                  </span>
                  <span className="palette-label">{entry.item.label}</span>
                  <span className="palette-group">{entry.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
