/**
 * Locale parity: ``de.ts`` and ``en.ts`` must declare exactly the same keys.
 *
 * Why a test and not a lint rule: the locale files are TypeScript modules, so
 * importing them here gives us the real, evaluated objects â€” no parsing, no
 * regex guesswork. It also means the check rides along in the existing
 * blocking ``test`` CI job without extra wiring.
 *
 * What a failure means: a key was added to one language and forgotten in the
 * other. The UI then silently falls back to printing the raw key (``fallbackLocale``
 * only helps in one direction), which is easy to miss in review â€” the German
 * default locale still looks fine.
 *
 * This is the automated counterpart to the i18n checkbox in the PR template.
 */
import { describe, it, expect } from 'vitest'

import de from '@/i18n/locales/de'
import en from '@/i18n/locales/en'

/** Flatten a nested message object into dotted key paths. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  )
}

describe('i18n locale parity', () => {
  const deKeys = new Set(keyPaths(de))
  const enKeys = new Set(keyPaths(en))

  it('hat keine Keys, die nur auf Deutsch existieren', () => {
    const missingInEn = [...deKeys].filter((k) => !enKeys.has(k)).sort()
    expect(
      missingInEn,
      `Diese Keys fehlen in en.ts:\n  ${missingInEn.join('\n  ')}`,
    ).toEqual([])
  })

  it('hat keine Keys, die nur auf Englisch existieren', () => {
    const missingInDe = [...enKeys].filter((k) => !deKeys.has(k)).sort()
    expect(
      missingInDe,
      `Diese Keys fehlen in de.ts:\n  ${missingInDe.join('\n  ')}`,
    ).toEqual([])
  })

  it('hat in beiden Sprachen nicht-leere Werte', () => {
    const empty = (obj: unknown, prefix = ''): string[] => {
      if (typeof obj === 'string') return obj.trim() === '' ? [prefix] : []
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return []
      return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        empty(v, prefix ? `${prefix}.${k}` : k),
      )
    }
    expect([...empty(de, 'de'), ...empty(en, 'en')]).toEqual([])
  })
})
