/**
 * Prüft, dass jeder Request die gewählte Sprache als ``Accept-Language``
 * mitnimmt.
 *
 * Der Test greift den Request-Interceptor direkt ab, statt einen echten
 * Request zu stellen: Geprüft werden soll die Verdrahtung, nicht axios. Dass
 * der Header im Browser ankommt, sieht man in der Netzwerk-Ansicht —
 * automatisiert abzusichern ist nur, dass der Interceptor ihn setzt.
 *
 * Ohne diesen Test fällt ein Bruch nirgends auf: Die Oberfläche sieht
 * unverändert aus, und das Backend würde stillschweigend in seiner
 * Standardsprache antworten.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'

vi.mock('@/env', () => ({
  env: { API_URL: 'http://localhost:8000' },
}))

const getActiveAccessToken = vi.fn()

vi.mock('@/composables/useLtiSession', () => ({
  getActiveAccessToken: () => getActiveAccessToken(),
  useLtiSession: () => ({
    isAuthenticated: { value: false },
    logout: vi.fn(),
  }),
}))

vi.mock('@/composables/useKeycloak', () => ({
  useKeycloak: () => ({
    ensureValidToken: vi.fn().mockResolvedValue(true),
    login: vi.fn(),
  }),
}))

import api from '@/api/axios'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '@/i18n/locale'

type RequestHandler = {
  fulfilled: (config: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig>
}

/** Ruft den registrierten Request-Interceptor mit einer leeren Config auf. */
async function runInterceptor(): Promise<InternalAxiosRequestConfig> {
  const { handlers } = api.interceptors.request as unknown as { handlers: RequestHandler[] }
  const config = { headers: {} } as unknown as InternalAxiosRequestConfig
  return handlers[0]!.fulfilled(config)
}

describe('axios — Accept-Language', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    getActiveAccessToken.mockResolvedValue(null)
  })

  it('hängt die gewählte Sprache an den Request', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de')

    const config = await runInterceptor()

    expect(config.headers['Accept-Language']).toBe('de')
  })

  it('folgt einem Sprachwechsel', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')

    const config = await runInterceptor()

    expect(config.headers['Accept-Language']).toBe('en')
  })

  it('setzt den Header auch ohne angemeldeten Nutzer', async () => {
    // Der Fall vor dem Login — genau dafür ist der Header einer
    // Account-Einstellung überlegen.
    getActiveAccessToken.mockResolvedValue(null)
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')

    const config = await runInterceptor()

    expect(config.headers.Authorization).toBeUndefined()
    expect(config.headers['Accept-Language']).toBe('en')
  })

  it('setzt Token und Sprache gemeinsam, wenn angemeldet', async () => {
    getActiveAccessToken.mockResolvedValue('token-123')
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de')

    const config = await runInterceptor()

    expect(config.headers.Authorization).toBe('Bearer token-123')
    expect(config.headers['Accept-Language']).toBe('de')
  })

  it('schickt bei unbekannter Sprache die Standardsprache', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')

    const config = await runInterceptor()

    expect(config.headers['Accept-Language']).toBe(DEFAULT_LOCALE)
  })
})
