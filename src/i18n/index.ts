import { createI18n } from 'vue-i18n'

import de from './locales/de'
import en from './locales/en'
import { currentLocale } from './locale'

const i18n = createI18n({
  legacy: false,
  // Dieselbe Quelle wie der ``Accept-Language``-Header. Sonst könnten
  // Oberfläche und Backend bei einem unbekannten gespeicherten Wert
  // auseinanderlaufen: die Oberfläche über ``fallbackLocale`` auf Englisch,
  // das Backend auf der Standardsprache.
  locale: currentLocale(),
  fallbackLocale: 'en',
  messages: {
    de,
    en,
  },
})

export default i18n
