import { describe, it, expect } from 'vitest'

import { hexToHsv, hsvToHex } from '@/utils/color'

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
