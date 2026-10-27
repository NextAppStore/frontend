/**
 * The accent comes from ``VITE_ACCENT_COLOR`` and is written as inline CSS
 * variables, which always win over style.css. These tests pin the two rules
 * that keep that safe: the default accent writes nothing (so style.css and
 * its dark-mode tuning stay in charge), and a custom accent stays readable
 * as text in both modes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEnv = vi.hoisted(() => ({ ACCENT_COLOR: '' }))
vi.mock('@/env', () => ({ env: mockEnv }))

import {
  DEFAULT_ACCENT,
  applyAccentColor,
  clearAccentColor,
  initAccentColor,
  readableAccent,
  resolveAccentColor,
} from '@/composables/useAccentColor'
import { contrastRatio } from '@/utils/color'

const inline = (prop: string) =>
  document.documentElement.style.getPropertyValue(prop)

describe('resolveAccentColor', () => {
  it('normalizes valid hex values to uppercase #RRGGBB', () => {
    expect(resolveAccentColor('#0052cc')).toBe('#0052CC')
    expect(resolveAccentColor('0052CC')).toBe('#0052CC')
    expect(resolveAccentColor('  #0a7c3e ')).toBe('#0A7C3E')
  })

  it('strips quotes kept by compose list syntax', () => {
    expect(resolveAccentColor('"#0052CC"')).toBe('#0052CC')
    expect(resolveAccentColor("'0052cc'")).toBe('#0052CC')
  })

  it('falls back to the default for empty or invalid values', () => {
    expect(resolveAccentColor('')).toBe(DEFAULT_ACCENT)
    expect(resolveAccentColor(undefined)).toBe(DEFAULT_ACCENT)
    // envsubst leaves the placeholder when the variable is not substituted
    expect(resolveAccentColor('$VITE_ACCENT_COLOR')).toBe(DEFAULT_ACCENT)
    expect(resolveAccentColor('#abc')).toBe(DEFAULT_ACCENT)
    expect(resolveAccentColor('red')).toBe(DEFAULT_ACCENT)
  })
})

describe('readableAccent', () => {
  it('reaches 4.5:1 as text on the card surface in both modes', () => {
    for (const hex of ['#0052CC', '#5B21B6', '#E10210', '#FFD400']) {
      expect(contrastRatio(readableAccent(hex, true), '#0F161F')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(readableAccent(hex, false), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps a color that is already readable unchanged', () => {
    expect(readableAccent('#0052CC', false)).toBe('#0052CC')
  })
})

describe('applyAccentColor', () => {
  beforeEach(() => {
    clearAccentColor()
    document.documentElement.classList.remove('dark')
    mockEnv.ACCENT_COLOR = ''
  })

  it('writes nothing inline for the default accent, so style.css applies', () => {
    applyAccentColor(DEFAULT_ACCENT)
    expect(inline('--color-primary')).toBe('')
    expect(inline('--color-btn-primary')).toBe('')
    expect(inline('--color-surface-page')).toBe('')
  })

  it('overrides the accent tokens for a custom color', () => {
    applyAccentColor('#0052CC')
    expect(inline('--color-btn-primary')).toBe('#0052CC')
    expect(inline('--color-primary')).toBe('#0052CC')
  })

  it('uses a lighter, readable primary for text in dark mode', () => {
    document.documentElement.classList.add('dark')
    applyAccentColor('#0052CC')
    const primary = inline('--color-primary')
    expect(primary).not.toBe('#0052CC')
    expect(contrastRatio(primary, '#0F161F')).toBeGreaterThanOrEqual(4.5)
    // Filled buttons keep the raw accent.
    expect(inline('--color-btn-primary')).toBe('#0052CC')
  })

  it('switching back to the default removes every override again', () => {
    applyAccentColor('#0052CC')
    applyAccentColor(DEFAULT_ACCENT)
    expect(document.documentElement.getAttribute('style') ?? '').toBe('')
  })
})

describe('initAccentColor', () => {
  beforeEach(() => clearAccentColor())

  it('applies the color configured via VITE_ACCENT_COLOR', () => {
    mockEnv.ACCENT_COLOR = '#0a7c3e'
    initAccentColor()
    expect(inline('--color-btn-primary')).toBe('#0A7C3E')
  })
})
