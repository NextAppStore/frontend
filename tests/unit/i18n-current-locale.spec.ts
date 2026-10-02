/**
 * Deckt ``currentLocale()`` ab — den Wert, der als ``Accept-Language`` an das
 * Backend geht.
 *
 * Warum das einen eigenen Test verdient: Die Funktion hat in der Oberfläche
 * keine sichtbare Wirkung. Fällt sie aus oder liefert sie Unsinn, merkt das
 * niemand beim Durchklicken — es käme nur stillschweigend die falsche Sprache
 * vom Backend zurück. Die Absicherung gegen unbekannte Kürzel ist der
 * eigentliche Grund für die Funktion; ohne sie täte ein Direktzugriff auf
 * ``localStorage`` es auch.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import {
  currentLocale,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from '@/i18n/locale'

describe('currentLocale', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('gibt die gespeicherte Sprache als reines Kürzel zurück', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')

    expect(currentLocale()).toBe('en')
  })

  it('folgt einem Wechsel der Sprache', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')
    expect(currentLocale()).toBe('en')

    localStorage.setItem(LOCALE_STORAGE_KEY, 'de')
    expect(currentLocale()).toBe('de')
  })

  it('nutzt die Standardsprache, wenn nichts gespeichert ist', () => {
    // Erster Besuch — es gab noch keine Gelegenheit zu wählen.
    expect(currentLocale()).toBe(DEFAULT_LOCALE)
  })

  it('fällt bei einer nicht unterstützten Sprache auf die Standardsprache zurück', () => {
    // Das Backend hat für "fr" keine Übersetzung — dann lieber Deutsch
    // anfordern als ein Kürzel, mit dem dort niemand etwas anfangen kann.
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')

    expect(currentLocale()).toBe(DEFAULT_LOCALE)
  })

  it('fällt bei leerem Wert auf die Standardsprache zurück', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, '')

    expect(currentLocale()).toBe(DEFAULT_LOCALE)
  })

  it('liefert nur Kürzel, für die Übersetzungen vorliegen', () => {
    for (const locale of SUPPORTED_LOCALES) {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
      expect(SUPPORTED_LOCALES).toContain(currentLocale())
    }
  })

  it('nennt Deutsch als Standardsprache — passend zur i18n-Konfiguration', () => {
    expect(DEFAULT_LOCALE).toBe('de')
  })
})
