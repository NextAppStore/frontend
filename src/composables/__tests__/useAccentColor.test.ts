import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ``env`` is read once at import time — mock it so each test can set the value.
const mockEnv = vi.hoisted(() => ({ ACCENT_COLOR: '' }))
vi.mock('@/env', () => ({ env: mockEnv }))

import {
  DEFAULT_ACCENT,
  accentFromHue,
  applyAccentColor,
  configuredAccent,
  initAccentColor,
  readableAccent,
  resolveAccentColor,
} from '@/composables/useAccentColor'
import { contrastRatio } from '@/utils/color'

const brand = () => document.documentElement.style.getPropertyValue('--color-brand')

describe('resolveAccentColor', () => {
  it('normalizes valid values to upper-case #RRGGBB', () => {
    expect(resolveAccentColor('#0052cc')).toBe('#0052CC')
    expect(resolveAccentColor('0052CC')).toBe('#0052CC')
  })

  // ``#`` starts a comment in .env/YAML, so the value usually arrives quoted.
  it('strips surrounding quotes and whitespace', () => {
    expect(resolveAccentColor(' "#0052CC" ')).toBe('#0052CC')
    expect(resolveAccentColor("'#0052CC'")).toBe('#0052CC')
  })

  it('falls back to the default for empty or invalid values', () => {
    expect(resolveAccentColor('')).toBe(DEFAULT_ACCENT)
    expect(resolveAccentColor(undefined)).toBe(DEFAULT_ACCENT)
    expect(resolveAccentColor('blue')).toBe(DEFAULT_ACCENT)
    expect(resolveAccentColor('#FFF')).toBe(DEFAULT_ACCENT)
  })
})

describe('readableAccent', () => {
  it('keeps colors that are already readable — the default red included', () => {
    expect(readableAccent(DEFAULT_ACCENT)).toBe(DEFAULT_ACCENT)
    expect(readableAccent('#0052CC')).toBe('#0052CC')
  })

  it('darkens light colors until white text reaches 4.5:1', () => {
    const yellow = readableAccent('#FFE600')
    expect(yellow).not.toBe('#FFE600')
    expect(contrastRatio(yellow, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('accentFromHue', () => {
  it('yields a readable accent for every hue', () => {
    for (let h = 0; h < 360; h += 5) {
      expect(contrastRatio(accentFromHue(h), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    }
  })

  // The slider track in style.css is precomputed; if the picker constants
  // change, this fails until the gradient is regenerated.
  it('matches the precomputed slider track in style.css', () => {
    const css = readFileSync(resolve(__dirname, '../../style.css'), 'utf8')
    const track = /--gradient-accent-hue:\s*linear-gradient\(90deg,([^;]+)\);/.exec(css)?.[1]
    const stops = [...(track ?? '').matchAll(/#[0-9A-F]{6}/g)].map(m => m[0])
    expect(stops).toEqual(Array.from({ length: 13 }, (_, i) => accentFromHue(i * 30)))
  })
})

describe('applyAccentColor / initAccentColor', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--color-brand')
    mockEnv.ACCENT_COLOR = ''
  })

  it('sets --color-brand for a custom accent', () => {
    applyAccentColor('#0052CC')
    expect(brand()).toBe('#0052CC')
  })

  it('removes the override for the default, so style.css applies', () => {
    applyAccentColor('#0052CC')
    applyAccentColor(DEFAULT_ACCENT)
    expect(brand()).toBe('')
  })

  it('applies the env value, made readable', () => {
    mockEnv.ACCENT_COLOR = '"#FFE600"'
    initAccentColor()
    expect(brand()).toBe(configuredAccent())
    expect(contrastRatio(brand(), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('writes nothing without an env value', () => {
    initAccentColor()
    expect(brand()).toBe('')
  })
})
