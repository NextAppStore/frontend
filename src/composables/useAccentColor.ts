// TODO: replace this stub with a real API call once the backend
//       exposes a tenant-settings endpoint (e.g. GET /api/tenant/settings).
//       The rest of this file requires no changes — just swap the resolved
//       value of `fetchAccentColor` below.
const DEFAULT_ACCENT = '#E10210'

async function fetchAccentColor(): Promise<string> {
  // Stub: return the current ScholarStack red until the backend is ready.
  return DEFAULT_ACCENT
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function toRgbString(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '0, 0, 0'
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount))
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount))
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)))
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)))
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function rgba(hex: string, alpha: number): string {
  return `rgba(${toRgbString(hex)}, ${alpha})`
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function applyAccentColor(hex: string) {
  const root = document.documentElement.style
  const light   = lighten(hex, 0.2)
  const dark    = darken(hex, 0.35)
  const darker  = darken(hex, 0.55)
  const darkest = darken(hex, 0.65)
  const darkMode = isDarkMode()

  // ── Core brand tokens (both modes) ────────────────────────────
  root.setProperty('--color-primary',        hex)
  root.setProperty('--color-primary-light',  light)
  root.setProperty('--color-primary-dark',   dark)

  root.setProperty('--color-secondary',      dark)
  root.setProperty('--color-secondary-light', hex)
  root.setProperty('--color-secondary-dark', darker)

  root.setProperty('--color-highlight',      hex)
  root.setProperty('--color-highlight-light', light)
  root.setProperty('--color-highlight-dark', dark)

  // ── Buttons (both modes) ───────────────────────────────────────
  root.setProperty('--color-btn-primary',       hex)
  root.setProperty('--color-btn-primary-hover', dark)
  root.setProperty('--color-btn-ghost-text',    darkMode ? light : hex)
  root.setProperty('--color-btn-ghost-hover',   rgba(hex, 0.08))
  if (darkMode) {
    root.setProperty('--color-btn-secondary',       rgba(hex, 0.15))
    root.setProperty('--color-btn-secondary-hover', rgba(hex, 0.25))
    root.setProperty('--color-btn-secondary-text',  '#FFFFFF')
  } else {
    root.setProperty('--color-btn-secondary',       lighten(hex, 0.88))
    root.setProperty('--color-btn-secondary-hover', lighten(hex, 0.80))
    root.setProperty('--color-btn-secondary-text',  dark)
  }

  // ── Text & borders (both modes) ────────────────────────────────
  root.setProperty('--color-content-link',  darkMode ? light : hex)
  root.setProperty('--color-border-focus',  hex)
  root.setProperty('--color-nav-indicator', hex)

  // ── Navigation (both modes) ────────────────────────────────────
  root.setProperty('--color-nav-text-active', darkMode ? '#FFFFFF' : dark)
  root.setProperty('--color-nav-bg-hover',    rgba(hex, darkMode ? 0.10 : 0.07))
  root.setProperty('--color-nav-bg-active',   rgba(hex, darkMode ? 0.25 : 0.10))

  // ── Header border (both modes) ─────────────────────────────────
  root.setProperty('--color-header-border',
    `linear-gradient(90deg, ${hex} 0%, ${rgba(hex, 0.35)} 38%, ${rgba(hex, 0)} 78%)`)

  // ── Hero background (both modes — dark gradient uses accent hue) ─
  root.setProperty('--color-hero-bg',
    `linear-gradient(135deg, ${darken(hex, 0.20)} 0%, ${darken(hex, 0.55)} 60%, ${darken(hex, 0.70)} 100%)`)

  // ── Mesh background spots (both modes) ────────────────────────
  root.setProperty('--color-mesh-spot-1', rgba(hex, darkMode ? 0.25 : 0.06))
  root.setProperty('--color-mesh-spot-2', rgba(hex, darkMode ? 0.15 : 0.08))
  root.setProperty('--color-mesh-spot-4', rgba(hex, darkMode ? 0.06 : 0.04))

  // ── Dashboard — Mark decoration (both modes) ───────────────────
  root.setProperty('--color-dash-mark-drop-shadow', rgba(hex, darkMode ? 0.20 : 0.38))
  root.setProperty('--color-dash-mark-halo-inner',  rgba(hex, darkMode ? 0.35 : 0.20))
  root.setProperty('--color-dash-mark-halo-outer',  rgba(hex, darkMode ? 0.15 : 0.07))
  root.setProperty('--color-dash-mark-ring',        rgba(hex, darkMode ? 0.30 : 0.16))
  root.setProperty('--color-dash-mark-orbit',       rgba(hex, darkMode ? 0.35 : 0.22))
  root.setProperty('--color-dash-mark-plate',       rgba(hex, darkMode ? 0.30 : 0.16))
  root.setProperty('--color-dash-mark-plate-outer', rgba(hex, darkMode ? 0.10 : 0.03))

  // In dark mode, reduce the overlay so the banner bg stays dark/neutral
  root.setProperty('--color-dash-hero-overlay', rgba(hex, darkMode ? 0.06 : 0.12))

  // ── Dashboard — KPI glow (both modes) ─────────────────────────
  root.setProperty('--color-dash-kpi-red-glow',  rgba(hex, 0.14))
  root.setProperty('--color-dash-kpi-icon-red',  darkMode ? light : dark)
  root.setProperty('--color-dash-kpi-arrow-hover', darkMode ? light : dark)

  // ── Dashboard — Quota icon (both modes) ───────────────────────
  root.setProperty('--color-dash-quota-icon-bg',
    `linear-gradient(135deg, ${rgba(hex, darkMode ? 0.18 : 0.10)} 0%, ${rgba(hex, darkMode ? 0.06 : 0.03)} 100%)`)
  root.setProperty('--color-dash-quota-icon-text',  darkMode ? light : dark)

  // ── Dashboard — Activity list (both modes) ─────────────────────
  root.setProperty('--color-dash-activity-row-hover',
    `linear-gradient(90deg, ${rgba(hex, darkMode ? 0.10 : 0.06)} 0%, ${rgba(hex, darkMode ? 0.02 : 0.01)} 100%)`)
  root.setProperty('--color-dash-activity-arrow-hover', darkMode ? light : dark)
  root.setProperty('--color-dash-activity-all-text',    darkMode ? light : dark)
  root.setProperty('--color-dash-activity-all-hover',   rgba(hex, darkMode ? 0.08 : 0.04))
  root.setProperty('--color-dash-empty-icon-bg',
    `linear-gradient(135deg, ${rgba(hex, darkMode ? 0.20 : 0.12)} 0%, ${rgba(hex, darkMode ? 0.06 : 0.03)} 100%)`)
  root.setProperty('--color-dash-empty-icon-text', darkMode ? light : dark)

  // ── Dashboard — Panel head (both modes) ───────────────────────
  root.setProperty('--color-dash-panel-head-bg',
    `linear-gradient(90deg, ${rgba(hex, darkMode ? 0.10 : 0.05)} 0%, ${rgba(hex, 0)} 60%)`)

  // ── Light mode only: surface tints ────────────────────────────
  if (darkMode) {
    // Remove any inline overrides set during a previous light-mode apply
    // so the dark-mode values from style.css take over again.
    const lightOnlyProps = [
      '--color-surface-page', '--color-surface-input', '--color-surface-hover',
      '--color-sidebar-border', '--color-card-border', '--color-border',
      '--color-border-strong', '--color-card-shadow',
      '--color-surface-sidebar-grad', '--color-surface-header',
      '--color-hero-bg-light', '--color-dash-hero-bg', '--color-dash-hero-border',
      '--color-dash-hero-greeting', '--color-dash-hero-shadow', '--color-dash-hero-shape',
      '--color-dash-cta-ghost-text', '--color-dash-cta-ghost-border',
      '--color-dash-cta-ghost-border-hover',
      '--color-dash-kpi-shadow', '--color-dash-kpi-border', '--color-dash-kpi-border-hover',
      '--color-dash-panel-shadow', '--color-dash-panel-border',
      '--color-dash-quota-border', '--color-dash-quota-track-bg', '--color-dash-quota-track-shadow',
    ]
    lightOnlyProps.forEach(p => root.removeProperty(p))
  } else {
    root.setProperty('--color-surface-page',   lighten(hex, 0.97))
    root.setProperty('--color-surface-input',  lighten(hex, 0.94))
    root.setProperty('--color-surface-hover',  lighten(hex, 0.90))
    root.setProperty('--color-sidebar-border', lighten(hex, 0.88))
    root.setProperty('--color-card-border',    lighten(hex, 0.85))
    root.setProperty('--color-border',         lighten(hex, 0.82))
    root.setProperty('--color-border-strong',  lighten(hex, 0.72))
    root.setProperty('--color-card-shadow',    rgba(hex, 0.06))

    root.setProperty('--color-surface-sidebar-grad',
      `linear-gradient(180deg, #ffffff 0%, ${lighten(hex, 0.97)} 45%, ${lighten(hex, 0.92)} 100%)`)
    root.setProperty('--color-surface-header',
      `linear-gradient(90deg, #ffffff 0%, ${lighten(hex, 0.98)} 50%, ${lighten(hex, 0.94)} 100%)`)
    root.setProperty('--color-hero-bg-light',
      `linear-gradient(135deg, ${lighten(hex, 0.97)} 0%, ${lighten(hex, 0.90)} 40%, ${lighten(hex, 0.82)} 100%)`)
    root.setProperty('--color-dash-hero-bg',
      `linear-gradient(120deg, ${lighten(hex, 0.97)} 0%, ${lighten(hex, 0.92)} 55%, ${lighten(hex, 0.88)} 100%)`)
    root.setProperty('--color-dash-hero-border',     lighten(hex, 0.82))
    root.setProperty('--color-dash-hero-greeting',   dark)
    root.setProperty('--color-dash-hero-shadow',     rgba(darkest, 0.30))
    root.setProperty('--color-dash-hero-shape',      rgba(hex, 0.05))
    root.setProperty('--color-dash-cta-ghost-text',  dark)
    root.setProperty('--color-dash-cta-ghost-border', lighten(hex, 0.80))
    root.setProperty('--color-dash-cta-ghost-border-hover', hex)
    root.setProperty('--color-dash-hero-overlay',    rgba(hex, 0.12))
    root.setProperty('--color-dash-hero-cta-shadow', rgba(hex, 0.85))
    root.setProperty('--color-dash-hero-cta-shadow-hover', rgba(hex, 0.9))

    root.setProperty('--color-dash-kpi-shadow',       rgba(darkest, 0.16))
    root.setProperty('--color-dash-kpi-border',       lighten(hex, 0.88))
    root.setProperty('--color-dash-kpi-border-hover', lighten(hex, 0.80))
    root.setProperty('--color-dash-panel-shadow',     rgba(darkest, 0.16))
    root.setProperty('--color-dash-panel-border',     lighten(hex, 0.88))
    root.setProperty('--color-dash-quota-border',     lighten(hex, 0.88))
    root.setProperty('--color-dash-quota-track-bg',
      `linear-gradient(90deg, ${lighten(hex, 0.92)} 0%, ${lighten(hex, 0.88)} 100%)`)
    root.setProperty('--color-dash-quota-track-shadow', rgba(darkest, 0.07))
  }
}

export async function initAccentColor() {
  const color = await fetchAccentColor()
  applyAccentColor(color)
}
