/**
 * Tenant accent color theming.
 *
 * The accent is configured per deployment via the runtime env variable
 * ``VITE_ACCENT_COLOR`` (``#RRGGBB``, see ``src/env.ts`` / ``env-config.js``),
 * so it is the same for every user and survives reloads without a backend.
 *
 * ``style.css`` is the source of truth for the default ScholarStack red:
 * with the default accent nothing is written inline, so the light/dark values
 * defined there apply untouched. Only a custom accent overrides variables on
 * ``<html>`` — and only those that are actually used and not already derived
 * from another overridden variable in style.css (``var()`` / ``color-mix``).
 * Every property set here is tracked so ``clearAccentColor`` can remove it.
 */
import { env } from '@/env'
import { contrastRatio, darken, lighten, rgba } from '@/utils/color'

export const DEFAULT_ACCENT = '#E10210'

/** Normalizes a configured value to ``#RRGGBB``; anything invalid or empty
 *  falls back to ``DEFAULT_ACCENT`` so a typo in the env never breaks the UI.
 *  Accepts the value with or without ``#`` and with surrounding quotes —
 *  ``#`` starts a comment in .env files and YAML, so it is usually quoted
 *  (``VITE_ACCENT_COLOR="#0052CC"``) and compose's list syntax keeps them. */
export function resolveAccentColor(raw: string | undefined | null): string {
  const value = (raw ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim()
  const digits = /^#?([0-9a-f]{6})$/i.exec(value)?.[1]
  return digits ? `#${digits.toUpperCase()}` : DEFAULT_ACCENT
}

// Card surfaces from style.css (``--color-surface-card``) — the backgrounds
// accent-coloured text sits on. Keep in sync when those change.
const TEXT_BG_LIGHT = '#FFFFFF'
const TEXT_BG_DARK = '#0F161F'

/** Shifts ``hex`` towards white (dark mode) or black (light mode) until it
 *  reaches WCAG AA (4.5:1) as text on the card surface — the same tuning
 *  style.css applies to the default red (#F0303F in dark mode). */
export function readableAccent(hex: string, darkMode: boolean): string {
  const bg = darkMode ? TEXT_BG_DARK : TEXT_BG_LIGHT
  let color = hex
  for (let step = 1; step <= 20 && contrastRatio(color, bg) < 4.5; step++) {
    color = darkMode ? lighten(hex, step * 0.05) : darken(hex, step * 0.05)
  }
  return color
}

const appliedProps = new Set<string>()

// The accent as chosen — not read back from ``--color-primary``, which holds
// the contrast-tuned text variant and would drift on every mode switch.
let currentAccent = DEFAULT_ACCENT

/** Removes every inline override set by ``applyAccentColor``. */
export function clearAccentColor() {
  const root = document.documentElement.style
  appliedProps.forEach(p => root.removeProperty(p))
  appliedProps.clear()
}

/** Re-applies the current accent, e.g. after a light/dark switch — several
 *  derived values differ per mode. */
export function reapplyAccentColor() {
  applyAccentColor(currentAccent)
}

export function applyAccentColor(input: string) {
  const hex = resolveAccentColor(input)
  currentAccent = hex
  // Start from a clean slate every time: values set for the other mode (or a
  // previous preview) must never linger and shadow style.css.
  clearAccentColor()
  // Default accent: let style.css do its job — inline values would override
  // the dark-mode tuning there (e.g. the lighter primary for text contrast).
  if (hex === DEFAULT_ACCENT) return

  const root = document.documentElement.style
  const set = (prop: string, value: string) => {
    root.setProperty(prop, value)
    appliedProps.add(prop)
  }
  const darkMode = document.documentElement.classList.contains('dark')
  const dark     = darken(hex, 0.35)
  const darkest  = darken(hex, 0.65)
  // ``--color-primary`` doubles as text colour (``text-primary``), so it gets
  // the contrast-tuned variant; filled buttons keep the raw accent.
  const text     = readableAccent(hex, darkMode)

  // ── Brand, buttons, text ──────────────────────────────────────
  set('--color-primary',           text)
  set('--color-primary-dark',      dark)
  set('--color-btn-primary',       hex)
  set('--color-btn-primary-hover', dark)
  set('--color-btn-ghost-text',    text)
  set('--color-btn-ghost-hover',   rgba(hex, 0.08))
  set('--color-btn-secondary',       darkMode ? rgba(hex, 0.15) : lighten(hex, 0.88))
  set('--color-btn-secondary-hover', darkMode ? rgba(hex, 0.25) : lighten(hex, 0.80))
  set('--color-content-link',      text)
  set('--color-border-focus',      hex)

  // ── Navigation & header ───────────────────────────────────────
  set('--color-nav-indicator',  hex)
  set('--color-nav-bg-hover',   rgba(hex, darkMode ? 0.10 : 0.07))
  set('--color-nav-bg-active',  rgba(hex, darkMode ? 0.25 : 0.10))
  set('--color-header-border',
    `linear-gradient(90deg, ${hex} 0%, ${rgba(hex, 0.35)} 38%, ${rgba(hex, 0)} 78%)`)

  // ── Background mesh & dashboard decoration ────────────────────
  set('--color-mesh-spot-1', rgba(hex, darkMode ? 0.25 : 0.06))
  set('--color-mesh-spot-2', rgba(hex, darkMode ? 0.15 : 0.08))
  set('--color-mesh-spot-4', rgba(hex, darkMode ? 0.06 : 0.04))

  set('--color-dash-mark-drop-shadow', rgba(hex, darkMode ? 0.20 : 0.38))
  set('--color-dash-mark-halo-inner',  rgba(hex, darkMode ? 0.35 : 0.20))
  set('--color-dash-mark-halo-outer',  rgba(hex, darkMode ? 0.15 : 0.07))
  set('--color-dash-mark-ring',        rgba(hex, darkMode ? 0.30 : 0.16))
  set('--color-dash-mark-orbit',       rgba(hex, darkMode ? 0.35 : 0.22))
  set('--color-dash-mark-plate',       rgba(hex, darkMode ? 0.30 : 0.16))
  set('--color-dash-mark-plate-outer', rgba(hex, darkMode ? 0.10 : 0.03))
  // In dark mode, reduce the overlay so the banner bg stays dark/neutral
  set('--color-dash-hero-overlay',     rgba(hex, darkMode ? 0.06 : 0.12))
  set('--color-dash-kpi-red-glow',     rgba(hex, 0.14))

  set('--color-dash-quota-icon-bg',
    `linear-gradient(135deg, ${rgba(hex, darkMode ? 0.18 : 0.10)} 0%, ${rgba(hex, darkMode ? 0.06 : 0.03)} 100%)`)
  set('--color-dash-activity-row-hover',
    `linear-gradient(90deg, ${rgba(hex, darkMode ? 0.10 : 0.06)} 0%, ${rgba(hex, darkMode ? 0.02 : 0.01)} 100%)`)
  set('--color-dash-activity-all-hover', rgba(hex, darkMode ? 0.08 : 0.04))
  set('--color-dash-empty-icon-bg',
    `linear-gradient(135deg, ${rgba(hex, darkMode ? 0.20 : 0.12)} 0%, ${rgba(hex, darkMode ? 0.06 : 0.03)} 100%)`)
  set('--color-dash-panel-head-bg',
    `linear-gradient(90deg, ${rgba(hex, darkMode ? 0.10 : 0.05)} 0%, ${rgba(hex, 0)} 60%)`)

  // Dark mode stops here: its surfaces are neutral, and the dashboard's
  // accent text (icons, arrows, "all" link …) already reads
  // ``var(--color-content-link)`` in style.css, which is set above.
  if (darkMode) return

  // ── Light mode only: accent text with fixed values in style.css ─
  set('--color-btn-secondary-text',   dark)
  set('--color-nav-text-active',      dark)
  set('--color-dash-hero-greeting',   dark)
  set('--color-dash-cta-ghost-text',  dark)
  set('--color-dash-kpi-icon-red',    dark)
  set('--color-dash-kpi-arrow-hover', dark)
  set('--color-dash-quota-icon-text', dark)
  set('--color-dash-activity-arrow-hover', dark)
  set('--color-dash-activity-all-text',    dark)
  set('--color-dash-empty-icon-text',      dark)

  // ── Light mode only: accent-tinted surfaces and borders ────────
  set('--color-surface-page',   lighten(hex, 0.97))
  set('--color-surface-input',  lighten(hex, 0.94))
  set('--color-surface-hover',  lighten(hex, 0.90))
  set('--color-sidebar-border', lighten(hex, 0.88))
  set('--color-card-border',    lighten(hex, 0.85))
  set('--color-border',         lighten(hex, 0.82))
  set('--color-border-strong',  lighten(hex, 0.72))
  set('--color-surface-sidebar-grad',
    `linear-gradient(180deg, #ffffff 0%, ${lighten(hex, 0.97)} 45%, ${lighten(hex, 0.92)} 100%)`)
  set('--color-surface-header',
    `linear-gradient(90deg, #ffffff 0%, ${lighten(hex, 0.98)} 50%, ${lighten(hex, 0.94)} 100%)`)

  set('--color-dash-hero-bg',
    `linear-gradient(120deg, ${lighten(hex, 0.97)} 0%, ${lighten(hex, 0.92)} 55%, ${lighten(hex, 0.88)} 100%)`)
  set('--color-dash-hero-border',      lighten(hex, 0.82))
  set('--color-dash-hero-shadow',      rgba(darkest, 0.30))
  set('--color-dash-hero-shape',       rgba(hex, 0.05))
  set('--color-dash-cta-ghost-border', lighten(hex, 0.80))
  set('--color-dash-kpi-shadow',       rgba(darkest, 0.16))
  set('--color-dash-kpi-border',       lighten(hex, 0.88))
  set('--color-dash-kpi-border-hover', lighten(hex, 0.80))
  set('--color-dash-panel-shadow',     rgba(darkest, 0.16))
  set('--color-dash-panel-border',     lighten(hex, 0.88))
  set('--color-dash-quota-border',     lighten(hex, 0.88))
  set('--color-dash-quota-track-bg',
    `linear-gradient(90deg, ${lighten(hex, 0.92)} 0%, ${lighten(hex, 0.88)} 100%)`)
  set('--color-dash-quota-track-shadow', rgba(darkest, 0.07))
}

/** Applies the accent configured via ``VITE_ACCENT_COLOR`` (default: none). */
export function initAccentColor() {
  applyAccentColor(env.ACCENT_COLOR)
}
