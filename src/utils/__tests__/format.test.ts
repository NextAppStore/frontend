/**
 * The date helpers were pinned to ``de-DE``, so a user who switched the UI to
 * English still got German dates. They now follow ``currentLocale()``.
 *
 * The locale is read per call rather than cached at module load — these tests
 * would not catch a cached value if they each imported the module fresh, so
 * they deliberately switch the language between assertions on the same import.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { formatDate, formatDateTime, formatBytes } from '@/utils/format'
import { LOCALE_STORAGE_KEY } from '@/i18n/locale'

/** A date with an unambiguous day/month order: 23rd of October. */
const SAMPLE = '2026-10-23T14:05:06Z'

const setLocale = (locale: string) => localStorage.setItem(LOCALE_STORAGE_KEY, locale)

describe('formatDate', () => {
  beforeEach(() => localStorage.clear())

  it('formats day-first for German', () => {
    setLocale('de')

    expect(formatDate(SAMPLE)).toBe(new Date(SAMPLE).toLocaleDateString('de'))
  })

  it('formats month-first for English', () => {
    setLocale('en')

    expect(formatDate(SAMPLE)).toBe(new Date(SAMPLE).toLocaleDateString('en'))
  })

  it('follows a language change without a reimport', () => {
    setLocale('de')
    const german = formatDate(SAMPLE)
    setLocale('en')
    const english = formatDate(SAMPLE)

    expect(german).not.toBe(english)
  })

  it('falls back to German when nothing is stored', () => {
    expect(formatDate(SAMPLE)).toBe(new Date(SAMPLE).toLocaleDateString('de'))
  })

  it('returns an unparseable value verbatim', () => {
    setLocale('en')

    expect(formatDate('not a date')).toBe('not a date')
  })
})

describe('formatDateTime', () => {
  beforeEach(() => localStorage.clear())

  it('follows the selected language', () => {
    setLocale('de')
    const german = formatDateTime(SAMPLE)
    setLocale('en')
    const english = formatDateTime(SAMPLE)

    expect(german).not.toBe(english)
  })

  it('yields a dash for empty input', () => {
    expect(formatDateTime(null)).toBe('-')
    expect(formatDateTime(undefined)).toBe('-')
    expect(formatDateTime('')).toBe('-')
  })
})

describe('formatBytes', () => {
  // Byte sizes are locale-independent; covered here so the helper module has
  // its behaviour pinned alongside the date functions.
  it('keeps values below 1 KiB as whole bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('rounds KiB to a whole number', () => {
    expect(formatBytes(2048)).toBe('2 KB')
  })

  it('keeps one decimal for MiB', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
