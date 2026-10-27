import { describe, it, expect } from 'vitest'
import { contrastRatio, hexToHue, hexToRgb, hslToHex, rgbToHex } from '@/utils/color'

describe('hexToRgb', () => {
  it('parses #RRGGBB with or without # and in any case', () => {
    expect(hexToRgb('#E10210')).toEqual({ r: 225, g: 2, b: 16 })
    expect(hexToRgb('e10210')).toEqual({ r: 225, g: 2, b: 16 })
  })

  it('rejects short, long and non-hex values', () => {
    expect(hexToRgb('#FFF')).toBeNull()
    expect(hexToRgb('#E1021000')).toBeNull()
    expect(hexToRgb('#GG0000')).toBeNull()
    expect(hexToRgb('')).toBeNull()
  })
})

describe('rgbToHex', () => {
  it('formats upper case and clamps out-of-range channels', () => {
    expect(rgbToHex({ r: 225, g: 2, b: 16 })).toBe('#E10210')
    expect(rgbToHex({ r: 300, g: -5, b: 15.6 })).toBe('#FF0010')
  })
})

describe('hslToHex', () => {
  it('converts primary hues', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#FF0000')
    expect(hslToHex(120, 1, 0.5)).toBe('#00FF00')
    expect(hslToHex(240, 1, 0.5)).toBe('#0000FF')
  })

  it('wraps hues outside 0–359', () => {
    expect(hslToHex(360, 1, 0.5)).toBe('#FF0000')
    expect(hslToHex(-120, 1, 0.5)).toBe('#0000FF')
  })
})

describe('hexToHue', () => {
  it('returns the hue in whole degrees', () => {
    expect(hexToHue('#FF0000')).toBe(0)
    expect(hexToHue('#00FF00')).toBe(120)
    expect(hexToHue('#0000FF')).toBe(240)
    expect(hexToHue('#E10210')).toBe(356)
  })

  it('round-trips with hslToHex', () => {
    for (const h of [15, 75, 200, 310]) expect(hexToHue(hslToHex(h, 0.85, 0.45))).toBe(h)
  })

  it('returns 0 for greys and invalid input', () => {
    expect(hexToHue('#808080')).toBe(0)
    expect(hexToHue('nope')).toBe(0)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
  })

  it('matches the WCAG value for the default red on white', () => {
    expect(contrastRatio('#E10210', '#FFFFFF')).toBeCloseTo(4.98, 1)
  })

  it('is 1 for invalid input', () => {
    expect(contrastRatio('nope', '#FFFFFF')).toBe(1)
  })
})
