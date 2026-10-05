import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast.store'
import { taskApi } from '@/api/task.api'
import type { ComputedRef } from 'vue'
import type { Task } from '@/types'

export function useDeploymentTasks(
  deploymentId: string,
  isOwnerView: ComputedRef<boolean>,
) {
  const { t } = useI18n()
  const toastStore = useToastStore()

  const tasks = ref<Task[]>([])
  const loadingTasks = ref(false)
  const selectedTask = ref<Task | null>(null)
  const latestTaskOutputs = ref<Task | null>(null)
  const activeDataTask = computed(() => selectedTask.value || latestTaskOutputs.value)
  const loadingTaskDetail = ref(false)

  const loadTasks = async () => {
    // Members can't read tasks (backend returns 403 for the
    // owner-only endpoint). Skip the call entirely so the network
    // tab stays clean and the UI doesn't briefly flicker a loader
    // for data we'll never receive.
    if (!isOwnerView.value) {
      tasks.value = []
      return
    }
    loadingTasks.value = true
    try {
      const { data } = await taskApi.listByDeployment(deploymentId)
      tasks.value = data
    } catch (err) {
      console.error('Error loading tasks:', err)
    } finally {
      loadingTasks.value = false
    }
  }

  // Tasks that aren't the currently running one. Shown as the history
  // list below the active-task card so the running task isn't rendered
  // twice (once in the live block, once in the static list).
  const historyTasks = (activeTask: Task | null, isStreamRelevant: boolean): Task[] => {
    const list = [...tasks.value].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (!activeTask || !isStreamRelevant) return list
    return list.filter((t) => t.taskId !== activeTask.taskId)
  }

  // Counts the resources in the state for the header sub-headline.
  const tfResourcesCount = computed(() => {
    const state = selectedTask.value?.tf_state
    if (!state) return 0

    try {
      const parsed = typeof state === 'string' ? JSON.parse(state) : state
      return parsed?.resources?.length || 0
    } catch {
      return 0
    }
  })

  // Count of log entries inside ``selectedTask.logs`` for the badge in
  // the Logs card header. Logs arrive in three flavours:
  //
  //  * an object ``{logs: [...], error?: ...}`` — the Failure payload
  //    serialised by the worker on a failed deploy
  //  * a plain array on the success path (the success result is just
  //    ``logs: list[dict]``)
  //  * a JSON string when the API serialises one of the above as text
  //
  // The computed handles all three so the "N entries" pill stays
  // accurate regardless of the wire shape; returns null when the count
  // can't be determined (e.g. logs is a non-JSON string), in which case
  // the badge is hidden.
  const logEntryCount = computed<number | null>(() => {
    const raw = selectedTask.value?.logs
    if (raw == null) return null
    let value: unknown = raw
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          value = JSON.parse(trimmed)
        } catch {
          return null
        }
      } else {
        return null
      }
    }
    if (Array.isArray(value)) return value.length
    if (value && typeof value === 'object') {
      const inner = (value as Record<string, unknown>).logs
      if (Array.isArray(inner)) return inner.length
    }
    return null
  })

  const prettyJson = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      // Cheap pre-check: only attempt JSON.parse on strings that look
      // like JSON. Saves a try/catch round-trip for ordinary log
      // text and avoids accidentally parsing a bare number or "null"
      // string into something the consumer didn't expect.
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return JSON.stringify(JSON.parse(trimmed), null, 2)
        } catch {
          return value
        }
      }
      return value
    }
    return String(value)
  }

  // Lightweight, safe syntax highlighting for JSON.
  const highlightJson = (jsonString: string): string => {
    if (!jsonString) return ''

    let safeStr = jsonString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    return safeStr.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-status-warning'

        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-tag-info font-medium' // keys
          } else {
            cls = 'text-status-success' // string values
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-tag-accent font-bold' // booleans
        } else if (/null/.test(match)) {
          cls = 'text-content-disabled italic' // null
        } else {
          cls = 'text-cyan-500' // numbers
        }

        return `<span class="${cls}">${match}</span>`
      }
    )
  }

  const FAILURE_DETAIL_DIVIDER = '--- Technische Details ---'

  /**
   * Split a raw ``task.error`` string into a user-facing headline and an
   * optional technical details block. The worker serialises two shapes:
   *
   *  1. Backend infra failure: ``<headline>\n--- Technische Details ---\n<trace>``
   *  2. Legacy shape: ``Task failed: <one-liner>\n<traceback>``
   *
   * Returns ``isFailure: true`` for both so the caller / the template pick
   * the destructive palette without re-doing the regex on render.
   */
  const splitTaskLogs = (raw: string | Record<string, unknown> | null | undefined) => {
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

  // ``logs`` can be either a backend-formatted ``Task failed: ...`` string
  // (the failure shape this splitter cares about) or a structured
  // ``TaskLogsObject`` for normal runs. Only the string form triggers the
  // headline/details split — anything else falls through to the generic
  // pretty-print path below.
  const taskLogsSplit = computed(() => {
    const raw = selectedTask.value?.logs
    return splitTaskLogs(typeof raw === 'string' ? raw : null)
  })
  const showTaskLogsTrace = ref(false)

  const selectTask = async (task: Task) => {
    loadingTaskDetail.value = true
    try {
      const { data } = await taskApi.getById(task.taskId)
      selectedTask.value = data
    } catch (err) {
      console.error('Error loading task details:', err)
      toastStore.addToast({
        type: 'error',
        message: t('DeploymentDetailView.taskDetailsError'),
      })
    } finally {
      loadingTaskDetail.value = false
    }
  }

  const deselectTask = () => {
    selectedTask.value = null
  }

  return {
    tasks,
    loadingTasks,
    loadTasks,
    selectedTask,
    latestTaskOutputs,
    activeDataTask,
    loadingTaskDetail,
    historyTasks,
    tfResourcesCount,
    logEntryCount,
    prettyJson,
    highlightJson,
    splitTaskLogs,
    taskLogsSplit,
    showTaskLogsTrace,
    selectTask,
    deselectTask,
  }
}
