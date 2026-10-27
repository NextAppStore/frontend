import { describe, it, expect } from 'vitest'

import { contrastRatio, darken, hexToHsv, hexToRgb, hsvToHex, lighten, rgba } from '@/utils/color'

describe('hexToRgb', () => {
  it('parses #RRGGBB with or without the hash', () => {
    expect(hexToRgb('#0052CC')).toEqual({ r: 0, g: 82, b: 204 })
    expect(hexToRgb('0052cc')).toEqual({ r: 0, g: 82, b: 204 })
  })

  it('returns null for anything else', () => {
    expect(hexToRgb('#abc')).toBeNull()
    expect(hexToRgb('red')).toBeNull()
    expect(hexToRgb('')).toBeNull()
  })
})

describe('lighten / darken', () => {
  it('mixes towards white and black', () => {
    expect(lighten('#000000', 0.5)).toBe('#808080')
    expect(darken('#FFFFFF', 0.5)).toBe('#808080')
  })

  it('reaches white / black at amount 1 and keeps the color at 0', () => {
    expect(lighten('#0052CC', 1)).toBe('#FFFFFF')
    expect(darken('#0052CC', 1)).toBe('#000000')
    expect(lighten('#0052CC', 0)).toBe('#0052CC')
  })

  it('returns invalid input unchanged', () => {
    expect(lighten('nope', 0.5)).toBe('nope')
    expect(darken('nope', 0.5)).toBe('nope')
  })
})

describe('rgba', () => {
  it('builds an rgba() string from hex', () => {
    expect(rgba('#0052CC', 0.25)).toBe('rgba(0, 82, 204, 0.25)')
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG extremes and is symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrastRatio('#0052CC', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#0052CC'), 10)
  })
})

describe('hsvToHex', () => {
  it('converts the primary hues', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000')
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00FF00')
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000FF')
  })

  it('maps saturation 0 to grey and value 0 to black', () => {
    expect(hsvToHex({ h: 200, s: 0, v: 1 })).toBe('#FFFFFF')
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe('#000000')
  })

  it('wraps the hue and clamps out-of-range input', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#FF0000')
    expect(hsvToHex({ h: -120, s: 2, v: 2 })).toBe('#0000FF')
  })
})

describe('hexToHsv', () => {
  it('returns null for invalid input', () => {
    expect(hexToHsv('#abc')).toBeNull()
    expect(hexToHsv('red')).toBeNull()
  })

  it('round-trips the accent presets exactly', () => {
    for (const hex of ['#E10210', '#0052CC', '#0A7C3E', '#5B21B6', '#C2410C', '#0F766E']) {
      const hsv = hexToHsv(hex)
      expect(hsv).not.toBeNull()
      expect(hsvToHex(hsv!)).toBe(hex)
    }
  })
})
