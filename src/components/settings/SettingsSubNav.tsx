import type { ReactNode } from 'react'
import './SettingsSubNav.css'

export interface SettingsSubNavItem {
  id: string
  label: string
  icon?: ReactNode
}

interface SettingsSubNavProps {
  items: SettingsSubNavItem[]
  activeId: string
  onSelect: (id: string) => void
}

/** Pill-style sub-navigation for switching between sub-pages within a settings area. */
export default function SettingsSubNav({ items, activeId, onSelect }: SettingsSubNavProps) {
  return (
    <div className="settings-subnav" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          className={`settings-subnav__item ${activeId === item.id ? 'settings-subnav__item--active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
