/**
 * Color math for the accent color: hex parsing, HSL conversion and WCAG
 * contrast. Hex output is always ``#RRGGBB`` in upper case.
 *
 * Only the accent picker needs this — everything derived from the accent
 * (tints, shades, dark-mode variants) is computed by CSS in ``style.css``.
 */

export interface Rgb {
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

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/** HSL (hue in degrees, saturation/lightness 0–1) to ``#RRGGBB``. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const k = (n: number) => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 })
}

/** Hue of ``hex`` in whole degrees (0–359); 0 for greys and invalid input. */
export function hexToHue(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return Math.round((h * 60 + 360) % 360) % 360
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colors (1–21); 1 if either is invalid. */
export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return 1
  const la = luminance(ra)
  const lb = luminance(rb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
