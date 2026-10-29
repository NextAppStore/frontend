/**
 * Prüft das Einmal-Passwort der Kubernetes-App-Lab-Tasks im SSE-Stream.
 *
 * Warum eigens getestet: Das Backend speichert ein generiertes Passwort
 * nirgends — es steht nur im ``succeeded``-Event des Tasks. Geht es beim
 * Parsen verloren, gibt es keinen zweiten Weg, an es heranzukommen. Und weil
 * Lab-Tasks oft fertig sind, bevor der Stream verbindet, muss ``replay`` den
 * Header ``Last-Event-ID: 0`` senden, damit das Backend die Events des schon
 * beendeten Tasks noch einmal schickt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

vi.mock('@/env', () => ({
  env: { API_URL: 'http://localhost:8000' },
}))

vi.mock('@/composables/useLtiSession', () => ({
  getActiveAccessToken: () => Promise.resolve(null),
}))

import { useDeploymentStream } from '@/composables/useDeploymentStream'

const fetchMock = vi.fn()

/** Eine Antwort, deren Body die übergebenen SSE-Frames liefert und endet. */
function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frames.join('')))
      controller.close()
    },
  })
  return { ok: true, status: 200, body } as unknown as Response
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function lastRequestHeaders(): Record<string, string> {
  const { calls } = fetchMock.mock
  return (calls[calls.length - 1]?.[1] as RequestInit).headers as Record<string, string>
}

describe('useDeploymentStream — Lab-Ergebnis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('übernimmt lab_result aus dem succeeded-Event', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      frame('snapshot', { task_id: 't-1', status: 'running', type: 'lab_add_student' }),
      frame('succeeded', {
        task_id: 't-1',
        task_type: 'lab_add_student',
        lab_result: { username: 'alice', generated_password: 's3cret', port: 30001 },
      }),
    ]))

    const stream = useDeploymentStream(ref('dep-1'))
    stream.start()
    await vi.waitFor(() => expect(stream.connectionState.value).toBe('ended'))

    expect(stream.labResult.value).toEqual({ username: 'alice', generated_password: 's3cret', port: 30001 })
  })

  it('ignoriert succeeded-Events ohne gültiges lab_result', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      frame('succeeded', { task_id: 't-1', task_type: 'deploy' }),
    ]))

    const stream = useDeploymentStream(ref('dep-1'))
    stream.start()
    await vi.waitFor(() => expect(stream.connectionState.value).toBe('ended'))

    expect(stream.labResult.value).toBeNull()
  })

  it('übernimmt kein lab_result aus einem failed-Event', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      frame('failed', { task_id: 't-1', lab_result: { username: 'a', generated_password: 'x' } }),
    ]))

    const stream = useDeploymentStream(ref('dep-1'))
    stream.start()
    await vi.waitFor(() => expect(stream.connectionState.value).toBe('ended'))

    expect(stream.labResult.value).toBeNull()
  })

  it('sendet Last-Event-ID: 0 nur mit replay', async () => {
    // Jede Verbindung braucht einen eigenen Body — ein Stream lässt sich
    // nur einmal lesen.
    fetchMock.mockImplementation(() => Promise.resolve(sseResponse([])))
    const stream = useDeploymentStream(ref('dep-1'))

    stream.start()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(lastRequestHeaders()['Last-Event-ID']).toBeUndefined()

    stream.start({ replay: true })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(lastRequestHeaders()['Last-Event-ID']).toBe('0')

    stream.stop()
  })

  it('verwirft ein altes Passwort beim nächsten Start', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      frame('succeeded', { lab_result: { username: 'alice', generated_password: 's3cret' } }),
    ]))
    const stream = useDeploymentStream(ref('dep-1'))
    stream.start()
    await vi.waitFor(() => expect(stream.labResult.value).not.toBeNull())

    fetchMock.mockImplementation(() => Promise.resolve(sseResponse([])))
    stream.start()

    expect(stream.labResult.value).toBeNull()
    stream.stop()
  })
})
