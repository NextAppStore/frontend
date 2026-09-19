export const FAILURE_DETAIL_DIVIDER = '--- Technische Details ---'

/**
 * Split a task-logs string into a friendly headline + a collapsible
 * technical-details body. The backend's ``celery_event_listener.py``
 * emits Celery-infrastructure failures (``NotRegistered``,
 * ``WorkerLostError``, …) in a stable two-section format separated
 * by ``--- Technische Details ---``; we honour that boundary so the
 * raw stack trace stays available but isn't shoved into the user's
 * face by default.
 *
 * Returns ``{headline, details, isFailure}`` — ``isFailure`` lets
 * the template pick the destructive palette without re-doing the
 * regex on render.
 */
export const splitTaskLogs = (raw: string | Record<string, unknown> | null | undefined) => {
    if (!raw) return { headline: '', details: '', isFailure: false }
    const text = String(raw)
    // Backend "infra" failure with the explicit divider — we get a
    // one-line headline and a raw block underneath.
    const dividerIdx = text.indexOf(FAILURE_DETAIL_DIVIDER)
    if (dividerIdx >= 0) {
        return {
            headline: text.slice(0, dividerIdx).trim(),
            details: text.slice(dividerIdx + FAILURE_DETAIL_DIVIDER.length).trim(),
            isFailure: true,
        }
    }
    // Fallback: the legacy ``Task failed: ...\n<traceback>`` shape.
    // Take the first line as headline if the body is multi-line.
    if (text.startsWith('Task failed:')) {
        const newlineIdx = text.indexOf('\n')
        if (newlineIdx > 0) {
            return {
                headline: text.slice(0, newlineIdx).trim(),
                details: text.slice(newlineIdx + 1).trim(),
                isFailure: true,
            }
        }
        return { headline: text.trim(), details: '', isFailure: true }
    }
    return { headline: '', details: '', isFailure: false }
}
