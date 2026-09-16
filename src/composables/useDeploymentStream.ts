/**
 * Live deployment progress + log stream via Server-Sent Events.
 *
 * The browser's native ``EventSource`` would be the obvious fit but it
 * cannot attach an ``Authorization`` header — and we authenticate with
 * Keycloak Bearer tokens, not cookies. So we use ``fetch`` + a
 * ``ReadableStream`` reader instead, which lets us carry the same
 * Bearer token the rest of the API uses and gives us explicit control
 * over reconnect behaviour.
 *
 * Returns reactive state:
 *
 * * ``progress`` — 0..100, ``null`` while no progress event has
 *   arrived (the snapshot frame seeds it from the DB).
 * * ``currentPhase`` — name of the active phase (e.g.
 *   ``TERRAFORM_APPLY``), or null pre-snapshot.
 * * ``totalPhases`` — last seen total (8 or 11 depending on whether
 *   the deployment includes a Packer build).
 * * ``liveLogs`` — bounded array of the most recent log entries
 *   (default 100). Auto-scroll consumers should render the tail.
 * * ``connectionState`` — high-level state machine surface for the
 *   detail view to show "connecting" / "live" / "reconnecting" /
 *   "ended" badges.
 */

import { ref, type Ref } from 'vue'
import { getActiveAccessToken } from '@/composables/useLtiSession'
import { env } from '@/env'

export interface LogEntry {
  timestamp: string
  level: string
  category?: string
  message: string
  tool?: string
  streaming?: boolean
  phase?: string
  progress_pct?: number
  [key: string]: any
}

export interface ProgressEvent {
  phase: string
  phase_index: number
  total_phases: number
  progress_pct: number
  message?: string
  // Full ordered phase-name sequence for the active task. Multi-image
  // deploys produce a dynamic sequence (N×3 Packer phases for N
  // templates) whose template keys cannot be guessed from
  // observation order — the worker ships the authoritative list with
  // every event. Single-image / non-deploy tasks omit this and the
  // UI falls back to the static phase tables it bundles for the
  // legacy shape.
  phase_names?: string[]
}

export interface SnapshotEvent {
  task_id: string | null
  status: string | null
  current_phase: string | null
  progress_pct: number | null
  type: string | null
}

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error'

const MAX_LOG_BUFFER = 100
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

export function useDeploymentStream(deploymentId: Ref<string | null>) {
  const progress = ref<number | null>(null)
  const currentPhase = ref<string | null>(null)
  // 1-based phase index from the worker's progress event. Lets the
  // detail view highlight the right dot in the stepper without
  // reconstructing it from ``progress_pct`` (which is rounded and
  // collides on consecutive phases when total is small).
  const currentPhaseIndex = ref<number | null>(null)
  const totalPhases = ref<number>(11)
  // Authoritative phase-name list from the worker. ``[]`` means no
  // event with ``phase_names`` has been received yet (or the task
  // doesn't ship it, like the legacy single-image deploy where the
  // UI's static table already covers the shape). Consumers should
  // prefer this list over their own predictions when non-empty.
  const phaseNames = ref<string[]>([])
  const liveLogs = ref<LogEntry[]>([])
  // Running count of every log line we've received this stream —
  // independent of ``liveLogs.length``, which is capped by the ring
  // buffer (``MAX_LOG_BUFFER``). The detail view shows this in the
  // tail header so the number keeps growing past 100 as the worker
  // produces output, instead of plateauing at the buffer cap.
  const totalLogCount = ref<number>(0)
  const connectionState = ref<ConnectionState>('idle')
  const lastError = ref<string | null>(null)

  let abortController: AbortController | null = null
  let reconnectAttempt = 0
  let reconnectTimer: number | null = null

  const reset = () => {
    progress.value = null
    currentPhase.value = null
    currentPhaseIndex.value = null
    // Reset the dot count back to the default so a previous run's
    // total (e.g. 11 for deploy) doesn't briefly bleed into the next
    // run's stepper (e.g. 7 for destroy) before its first progress
    // event arrives.
    totalPhases.value = 11
    phaseNames.value = []
    liveLogs.value = []
    totalLogCount.value = 0
    lastError.value = null
  }

  const pushLog = (entry: LogEntry) => {
    // Bounded ring buffer — older entries fall off the head. Vue's
    // reactivity needs an array reassignment for the splice case to
    // be tracked across all consumers reliably.
    const next = [...liveLogs.value, entry]
    if (next.length > MAX_LOG_BUFFER) {
      next.splice(0, next.length - MAX_LOG_BUFFER)
    }
    liveLogs.value = next
    // The visible buffer is capped, but the total counter isn't —
    // it reflects every line the worker produced this run.
    totalLogCount.value += 1
  }

  const handleEvent = (eventName: string, data: any) => {
    if (eventName === 'snapshot') {
      const snap = data as SnapshotEvent
      const status = (snap.status || '').toUpperCase()
      const isActive = status === 'PENDING' || status === 'RUNNING'
      // Only adopt the snapshot's progress/phase when the latest task
      // is actually live. After a successful deploy the snapshot still
      // carries ``progress_pct=100`` and ``current_phase="OUTPUTS_…"``
      // for the *finished* deploy task; if a destroy then starts, the
      // backend's ``latest_task`` query briefly returns the old success
      // task. Painting those into the UI would flash the stale 11-step
      // deploy stepper at 100% before the destroy's first progress
      // event arrives. Skip adoption for terminal-status snapshots.
      if (isActive) {
        if (snap.progress_pct !== null) progress.value = snap.progress_pct
        if (snap.current_phase !== null) currentPhase.value = snap.current_phase
      }
      // Snapshot doesn't carry total_phases; the first progress event
      // will fill it in. We keep the conservative default (11).
      if (status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED') {
        connectionState.value = 'ended'
      }
      return
    }

    if (eventName === 'progress') {
      const ev = data as ProgressEvent
      progress.value = ev.progress_pct
      currentPhase.value = ev.phase
      currentPhaseIndex.value = ev.phase_index
      totalPhases.value = ev.total_phases
      // The worker sends the full phase sequence with every progress event once
      // the task has a ``_PhaseTracker`` (all real deploy/destroy/pause/resume/
      // redeploy paths). This is the authoritative source for the stepper,
      // especially for multi-image deploys where template keys aren't guessable.
      if (Array.isArray(ev.phase_names) && ev.phase_names.length > 0) {
        phaseNames.value = ev.phase_names
      }
      return
    }

    if (eventName === 'log') {
      // Worker logs ship the human-readable ISO time as ``iso_timestamp``
      // (the wire-level ``timestamp`` is reserved for Celery's
      // Unix-time float). Re-key to ``timestamp`` for downstream
      // consumers that don't need to know that detail.
      const raw = data as Record<string, any>
      const entry: LogEntry = {
        ...(raw as object),
        timestamp: raw.iso_timestamp || raw.timestamp || new Date().toISOString(),
      } as LogEntry
      pushLog(entry)
      return
    }

    if (eventName === 'overflow') {
      pushLog({
        timestamp: new Date().toISOString(),
        level: 'WARNING',
        category: 'system',
        message: 'Live stream lagged behind — older entries dropped',
      })
      return
    }

    if (eventName === 'succeeded' || eventName === 'failed' || eventName === 'revoked') {
      connectionState.value = 'ended'
      return
    }
  }

  const connect = async () => {
    if (!deploymentId.value) return

    abortController?.abort()
    abortController = new AbortController()
    connectionState.value = reconnectAttempt === 0 ? 'connecting' : 'reconnecting'

    const token = await getActiveAccessToken()

    let response: Response
    try {
      response = await fetch(`${env.API_URL}/deployments/${deploymentId.value}/stream`, {
        signal: abortController.signal,
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          Accept: 'text/event-stream',
        },
      })
    } catch (err) {
      // Network error — schedule a retry. Auto-cancel from the user
      // closing the page also lands here as ``AbortError``; we ignore
      // those.
      if ((err as DOMException)?.name !== 'AbortError') {
        lastError.value = (err as Error).message
        scheduleReconnect()
      }
      return
    }

    if (!response.ok || !response.body) {
      lastError.value = `HTTP ${response.status}`
      // Don't reconnect on 401/403/404 — those won't fix themselves.
      if (response.status >= 400 && response.status < 500) {
        connectionState.value = 'error'
        return
      }
      scheduleReconnect()
      return
    }

    connectionState.value = 'live'
    reconnectAttempt = 0

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are delimited by a blank line. Split on \n\n;
        // keep the trailing partial frame for the next chunk.
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''
        for (const frame of frames) {
          parseFrame(frame, handleEvent)
        }
      }
    } catch (err) {
      // Body iteration aborted — could be client cancellation or
      // network drop. Same retry logic as the initial connect.
      if ((err as DOMException)?.name !== 'AbortError') {
        scheduleReconnect()
      }
      return
    }

    // Stream closed cleanly by the server (terminal task state).
    if ((connectionState.value as ConnectionState) !== 'ended') {
      connectionState.value = 'ended'
    }
  }

  const scheduleReconnect = () => {
    if (connectionState.value === 'ended') return
    reconnectAttempt += 1
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (reconnectAttempt - 1), RECONNECT_MAX_MS)
    connectionState.value = 'reconnecting'
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
    }
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const start = () => {
    reset()
    reconnectAttempt = 0
    connect()
  }

  const stop = () => {
    abortController?.abort()
    abortController = null
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    connectionState.value = 'ended'
  }

  return {
    progress,
    currentPhase,
    currentPhaseIndex,
    totalPhases,
    phaseNames,
    liveLogs,
    totalLogCount,
    connectionState,
    lastError,
    start,
    stop,
  }
}

/**
 * Parse one ``event: ...\\ndata: ...`` block.
 *
 * SSE allows the client to receive multi-line ``data:`` fields (joined
 * with ``\\n``) and arbitrary ``event:`` names. Comment lines start
 * with ``:`` and are silently ignored — used here for keepalives.
 */
function parseFrame(rawFrame: string, dispatch: (eventName: string, data: any) => void) {
  if (!rawFrame.trim() || rawFrame.startsWith(':')) return
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of rawFrame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    } else if (line.startsWith(':')) {
      // comment, ignore
    }
  }
  if (dataLines.length === 0) return
  const dataStr = dataLines.join('\n')
  try {
    const data = JSON.parse(dataStr)
    dispatch(eventName, data)
  } catch {
    // Non-JSON payload — pass the raw string through. Unlikely in our
    // pipeline (backend always emits JSON) but keeps the parser
    // robust against future probes.
    dispatch(eventName, dataStr)
  }
}
