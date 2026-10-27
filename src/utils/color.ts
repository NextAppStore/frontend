/**
 * Color math for the tenant accent: hex parsing, tints/shades, WCAG contrast
 * and the HSV conversion behind the color wheel.
 *
 * HSV (not HSL) because it maps 1:1 onto the picker: hue = angle on the
 * wheel, saturation = distance from the center, value = brightness slider.
 * h: 0–360, s and v: 0–1. Hex output is always ``#RRGGBB``.
 */

export interface Hsv {
  h: number
  s: number
  v: number
}

interface Rgb {
  r: number
  g: number
  b: number
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Parses ``#RRGGBB`` (``#`` optional) to 0–255 channels; ``null`` otherwise. */
export function hexToRgb(hex: string): Rgb | null {
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!digits) return null
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/** Mixes ``hex`` towards white by ``amount`` (0–1). Invalid input is returned as is. */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const mix = (c: number) => c + (255 - c) * amount
  return rgbToHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) })
}

/** Mixes ``hex`` towards black by ``amount`` (0–1). Invalid input is returned as is. */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const mix = (c: number) => c * (1 - amount)
  return rgbToHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) })
}

export function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const val = clamp(v, 0, 1)
  const c = val * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = val - c
  const [r, g, b] =
    hue < 60  ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] :
                [c, 0, x]
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

/** Returns ``null`` for anything that is not ``#RRGGBB``. */
export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}
