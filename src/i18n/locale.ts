/**
 * Sprachkürzel — bewusst **ohne** Abhängigkeit zu ``vue-i18n``.
 *
 * Diese Datei liest die gewählte Sprache allein aus ``localStorage``. Der
 * naheliegendere Weg wäre, die laufende i18n-Instanz zu fragen; das zieht aber
 * ``createI18n`` in jedes Modul, das die Sprache braucht — unter anderem in
 * ``api/axios.ts``, das praktisch überall importiert wird. In den Tests, die
 * ``vue-i18n`` mocken, bricht dadurch der Import.
 *
 * Die Trennung ist unkritisch, weil ``changeLocale`` in ``AppLayout`` beides
 * im selben Schritt setzt: erst ``locale``, dann ``localStorage``. Beide Quellen
 * stimmen also überein.
 */

/** Schlüssel, unter dem die Sprachwahl im ``localStorage`` liegt. */
export const LOCALE_STORAGE_KEY = 'locale'

/** Sprache, wenn nichts gespeichert ist oder der Wert unbekannt ist. */
export const DEFAULT_LOCALE = 'de'

/** Sprachkürzel, für die Übersetzungen vorliegen. */
export const SUPPORTED_LOCALES = ['de', 'en'] as const

/**
 * Die gewählte Sprache als reines Kürzel (``de`` / ``en``).
 *
 * Der Rückfall auf {@link DEFAULT_LOCALE} bei unbekannten Werten ist der
 * eigentliche Zweck der Funktion: Der Rückgabewert geht als
 * ``Accept-Language`` ans Backend, und dort soll kein Kürzel ankommen, für das
 * es keine Übersetzung gibt.
 */
export function currentLocale(): string {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) ?? ''
  return (SUPPORTED_LOCALES as readonly string[]).includes(stored)
    ? stored
    : DEFAULT_LOCALE
}
