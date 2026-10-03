/**
 * Prüft, dass der SSE-Stream die gewählte Sprache mitschickt.
 *
 * Warum eigens getestet: Dieser ``fetch`` umgeht die axios-Instanz, weil
 * ``EventSource`` keinen Authorization-Header setzen kann — der
 * Request-Interceptor greift hier also nicht. Vergisst jemand den Header beim
 * Umbauen, bliebe ausgerechnet der Live-Log eines Deployments in der
 * Backend-Standardsprache, während der Rest der Oberfläche übersetzt ist.
 *
 * Im Browser ist das kaum prüfbar: Der Stream verbindet sich nur, wenn
 * tatsächlich ein Deployment läuft. Dafür eines anzulegen, nur um einen Header
 * zu sehen, wäre unverhältnismäßig — es landet in der gemeinsamen Datenbank.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

vi.mock('@/env', () => ({
  env: { API_URL: 'http://localhost:8000' },
}))

const getActiveAccessToken = vi.fn()

vi.mock('@/composables/useLtiSession', () => ({
  getActiveAccessToken: () => getActiveAccessToken(),
}))

import { useDeploymentStream } from '@/composables/useDeploymentStream'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '@/i18n/locale'

const fetchMock = vi.fn()

/** Die Header des zuletzt abgesetzten ``fetch``. */
function lastRequestHeaders(): Record<string, string> {
  const { calls } = fetchMock.mock
  const call = calls[calls.length - 1]
  return (call?.[1] as RequestInit | undefined)?.headers as Record<string, string>
}

/**
 * Startet den Stream und wartet, bis der ``fetch`` abgesetzt ist. Die
 * Antwort wird abgelehnt, damit der Composable nicht in die Lese-Schleife
 * läuft — geprüft wird allein, was hinausgeht.
 */
async function startStream(deploymentId = 'dep-1') {
  const stream = useDeploymentStream(ref(deploymentId))
  stream.start()
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  stream.stop()
  return stream
}

describe('useDeploymentStream — Accept-Language', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    getActiveAccessToken.mockResolvedValue(null)
    fetchMock.mockRejectedValue(new Error('stream not consumed in test'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('schickt die gewählte Sprache mit', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')

    await startStream()

    expect(lastRequestHeaders()['Accept-Language']).toBe('en')
  })

  it('folgt einem Sprachwechsel', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de')

    await startStream()

    expect(lastRequestHeaders()['Accept-Language']).toBe('de')
  })

  it('schickt bei unbekannter Sprache die Standardsprache', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')

    await startStream()

    expect(lastRequestHeaders()['Accept-Language']).toBe(DEFAULT_LOCALE)
  })

  it('lässt die übrigen Header unangetastet', async () => {
    // Der Sprach-Header darf Authorization und Accept nicht verdrängen —
    // ohne die beiden käme der Stream gar nicht erst zustande.
    getActiveAccessToken.mockResolvedValue('token-123')
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de')

    await startStream()

    const headers = lastRequestHeaders()
    expect(headers.Authorization).toBe('Bearer token-123')
    expect(headers.Accept).toBe('text/event-stream')
    expect(headers['Accept-Language']).toBe('de')
  })
})
