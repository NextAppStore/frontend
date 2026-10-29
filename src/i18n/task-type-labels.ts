import type { TaskType } from "@/types"

/**
 * Task-type label registry, mirroring ``deployment-status-labels.ts``.
 * The detail view used to print ``task.type`` verbatim; with the
 * Kubernetes-App lab tasks that would surface ``lab_add_student`` in the
 * task list and live card.
 */
const KEYS: Record<TaskType, string> = {
  deploy: "taskTypes.deploy",
  destroy: "taskTypes.destroy",
  update: "taskTypes.update",
  pause: "taskTypes.pause",
  resume: "taskTypes.resume",
  redeploy: "taskTypes.redeploy",
  lab_reassign: "taskTypes.lab_reassign",
  lab_reset: "taskTypes.lab_reset",
  lab_add_student: "taskTypes.lab_add_student",
  lab_remove_student: "taskTypes.lab_remove_student",
}

/** True for the Kubernetes-App student-pod tasks (``lab_*``). */
export function isLabTaskType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.startsWith("lab_")
}

/**
 * Label key for a task type, or ``null`` for a type the frontend doesn't
 * know yet — the caller then prints the raw value, as before.
 */
export function taskTypeLabelKey(type: string | null | undefined): string | null {
  if (type && type in KEYS) return KEYS[type as TaskType]
  return null
}
