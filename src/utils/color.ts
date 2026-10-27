/**
 * Color math for the tenant accent: hex parsing, tints/shades and WCAG
 * contrast. Hex output is always ``#RRGGBB``.
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

/** ``rgba()`` string for ``hex`` with ``alpha`` (0–1). Unlike lighten/darken,
 *  invalid input yields black — callers pass already validated colors. */
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
