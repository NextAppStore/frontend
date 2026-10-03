<script setup lang="ts">
import { Terminal, AlertCircle, Loader2, ChevronDown, CircleArrowLeft, Settings, Check, Copy } from 'lucide-vue-next'
import type { Task } from '@/types'

defineProps<{
  isOwnerView: boolean
  isStreamRelevant: boolean
  historyTasks: Task[]
  selectedTask: Task | null
  activeDataTask: Task | null
  loadingTasks: boolean
  loadingTaskDetail: boolean
  taskLogsSplit: { headline: string; details: string; isFailure: boolean }
  showTaskLogsTrace: boolean
  toggleTaskLogsTrace: () => void
  logEntryCount: number | null
  tfResourcesCount: number
  copiedKey: string | null
  getStatusStyles: (status?: string) => { icon: any; badgeClass: string; label: string; dotClass: string; textClass: string }
  formatDate: (date: string | null | undefined) => string
  prettyJson: (value: unknown) => string
  highlightJson: (jsonString: string) => string
  copyToClipboard: (text: string, key: string) => Promise<void>
  selectTask: (task: Task) => Promise<void>
  deselectTask: () => void
}>()
</script>

<template>
    <!-- Tasks / Logs Section — history of finished tasks. The active
         task (if any) is rendered above in its own card, so the
         list filters it out to avoid double-rendering.
         Only the deployment owner / staff sees the actual task
         contents — members get a placeholder card instead so the
         page layout stays consistent across roles. -->
    <div v-if="!isOwnerView" class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm">
        <div class="flex items-center gap-3 mb-3">
            <div class="p-2 bg-surface-input rounded-lg">
                <Terminal :size="20" class="text-content-disabled" />
            </div>
            <span class="text-lg font-semibold text-content-secondary">{{ $t('DeploymentDetailView.tasksAndLogs') }}</span>
        </div>
        <div class="text-sm text-content-secondary flex items-start gap-2 px-2">
            <AlertCircle :size="16" class="text-content-disabled mt-0.5 flex-shrink-0" />
            <span>{{ $t('DeploymentDetailView.tasksOwnerOnly') }}</span>
        </div>
    </div>
    <div v-else class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm">
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-surface-input rounded-lg">
                    <Terminal :size="20" class="text-content-secondary" />
                </div>
                <span class="text-lg font-semibold text-content-primary">
                    {{ isStreamRelevant ? 'Task History' : 'Tasks & Logs' }}
                </span>
                <span v-if="historyTasks.length > 0"
                    class="px-2 py-0.5 bg-surface-input text-content-secondary text-xs font-bold rounded">
                    {{ historyTasks.length }}
                </span>
            </div>
            <button v-if="selectedTask" @click="deselectTask"
                class="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-sm">
                <CircleArrowLeft :size="16" />
                <span>Back to list</span>
            </button>
        </div>

        <!-- Task List View -->
        <div v-if="!selectedTask">
            <div v-if="loadingTasks" class="flex justify-center py-10">
                <Loader2 class="animate-spin text-primary" :size="32" />
            </div>

            <div v-else-if="historyTasks.length === 0" class="text-center py-10 text-content-secondary">
                {{ isStreamRelevant ? 'No previous tasks for this deployment.' : 'No tasks found' }}
            </div>

            <div v-else class="space-y-2">
                <div v-for="task in historyTasks" :key="task.taskId" @click="selectTask(task)"
                    class="flex items-center justify-between p-4 bg-surface-input rounded-lg hover:bg-surface-input transition-colors cursor-pointer border border-card-border hover:border-primary/30">
                    <div class="flex items-center gap-4 flex-1">
                        <component :is="getStatusStyles(task.status).icon" :size="18" :class="task.status === 'success' ? 'text-status-success' :
                            task.status === 'failed' ? 'text-status-error' :
                                task.status === 'running' ? 'text-tag-info' : 'text-status-warning'" />
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <span class="font-medium text-content-primary capitalize">{{ task.type }}</span>
                                <span
                                    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border capitalize"
                                    :class="getStatusStyles(task.status).badgeClass">
                                    {{ task.status }}
                                </span>
                            </div>
                            <div class="text-xs text-content-secondary">
                                Created: {{ formatDate(task.created_at) }}
                            </div>
                        </div>
                    </div>
                    <ChevronDown :size="20" class="text-content-disabled transform -rotate-90" />
                </div>
            </div>
        </div>

        <!-- Task Detail View -->
        <div v-else class="space-y-4">
            <div v-if="loadingTaskDetail" class="flex justify-center py-10">
                <Loader2 class="animate-spin text-primary" :size="32" />
            </div>

            <div v-else>
                <div class="bg-surface-input rounded-lg p-4 border border-card-border mb-4">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Type</div>
                            <div class="text-sm font-medium text-content-primary capitalize">{{ selectedTask.type }}</div>
                        </div>
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Status</div>
                            <span
                                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border capitalize"
                                :class="getStatusStyles(selectedTask.status).badgeClass">
                                {{ selectedTask.status }}
                            </span>
                        </div>
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Started</div>
                            <div class="text-sm text-content-secondary">{{ formatDate(selectedTask.started_at) }}</div>
                        </div>
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Finished</div>
                            <div class="text-sm text-content-secondary">{{ formatDate(selectedTask.finished_at) }}</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 gap-3">
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Task ID</div>
                            <div class="text-xs font-mono text-content-secondary bg-surface-card px-2 py-1 rounded">{{
                                selectedTask.taskId
                            }}</div>
                        </div>
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Celery Task ID</div>
                            <div class="text-xs font-mono text-content-secondary bg-surface-card px-2 py-1 rounded">{{
                                selectedTask.celeryTaskId }}</div>
                        </div>
                        <div>
                            <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Created At</div>
                            <div class="text-sm text-content-secondary">{{ formatDate(selectedTask.created_at) }}</div>
                        </div>
                    </div>
                </div>

                <!-- Logs — same simple ``<pre>`` rendering as the
                     Terraform State and Outputs blocks below. The
                     previous formatted/raw toggle plus numbered
                     entry cards added a lot of UI surface for
                     little extra information; pretty-printed JSON
                     is uniform and lets the browser handle search
                     (Cmd+F) consistently across all three blocks. -->
                <div v-if="selectedTask.logs" class="mb-4">
                    <div class="bg-surface-card rounded-lg border border-card-border overflow-hidden">
                        <div
                            class="bg-gradient-to-r from-status-successLight to-status-successLight px-4 py-3 border-b border-card-border flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="p-1.5 bg-surface-card rounded-md border border-status-success/30">
                                    <Terminal :size="16" class="text-status-success" />
                                </div>
                                <span class="font-semibold text-content-primary">Logs</span>
                                <span v-if="logEntryCount !== null"
                                    class="px-2 py-0.5 bg-status-successLight text-status-success text-xs font-bold rounded border border-status-success/30">
                                    {{ logEntryCount }} entries
                                </span>
                            </div>
                            <button @click="copyToClipboard(prettyJson(selectedTask.logs), 'logs')"
                                :title="copiedKey === 'logs' ? 'Copied!' : 'Copy to clipboard'"
                                class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors"
                                :class="copiedKey === 'logs'
                                    ? 'bg-status-success text-white border-status-success'
                                    : 'bg-surface-card text-content-secondary border-border hover:bg-surface-input'">
                                <component :is="copiedKey === 'logs' ? Check : Copy" :size="13" />
                                {{ copiedKey === 'logs' ? 'Copied' : 'Copy' }}
                            </button>
                        </div>
                        <div class="bg-surface-input p-4 overflow-y-auto max-h-[500px]">
                            <div class="bg-surface-card rounded-lg border border-card-border p-4">
                                <!-- Failure case: for a backend-formatted
                                     ``Task failed: ...`` string, split the
                                     friendly headline (shown in red) from the
                                     technical trace, which hides behind a toggle. -->
                                <template v-if="taskLogsSplit.isFailure">
                                    <div class="flex items-start gap-2 text-sm text-status-error mb-3">
                                        <AlertCircle :size="18" class="mt-0.5 flex-shrink-0" />
                                        <div class="font-medium leading-relaxed whitespace-pre-wrap">{{ taskLogsSplit.headline }}</div>
                                    </div>
                                    <button
                                        v-if="taskLogsSplit.details"
                                        type="button"
                                        class="text-xs text-content-secondary hover:text-content-primary underline mb-2"
                                        @click="toggleTaskLogsTrace()"
                                    >
                                        {{ showTaskLogsTrace ? 'Technische Details ausblenden' : 'Technische Details anzeigen' }}
                                    </button>
                                    <pre
                                        v-if="showTaskLogsTrace && taskLogsSplit.details"
                                        class="text-content-secondary font-mono text-xs leading-relaxed whitespace-pre-wrap"
                                    >{{ taskLogsSplit.details }}</pre>
                                </template>
                                <pre v-else class="text-content-secondary font-mono text-xs leading-relaxed whitespace-pre-wrap" v-html="highlightJson(prettyJson(selectedTask.logs))"></pre>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="mb-4">
                    <div class="bg-surface-card rounded-lg border border-card-border overflow-hidden">
                        <div class="bg-surface-input px-4 py-3 border-b border-card-border">
                            <div class="flex items-center gap-2">
                                <Terminal :size="16" class="text-content-disabled" />
                                <span class="font-semibold text-content-secondary">Logs</span>
                            </div>
                        </div>
                        <div class="text-center py-8 text-content-secondary">
                            <Terminal :size="32" class="mx-auto mb-2 text-content-disabled" />
                            <p class="text-sm">No logs available for this task</p>
                        </div>
                    </div>
                </div>

                <div v-if="activeDataTask?.tf_state" class="mb-4">
                    <div class="bg-surface-card rounded-lg border border-card-border overflow-hidden shadow-sm">

                        <div
                            class="bg-gradient-to-r from-tag-infoLight to-tag-neutralLight px-4 py-3 border-b border-card-border flex items-center justify-between select-none">
                            <div class="flex items-center gap-2">
                                <div class="p-1.5 bg-surface-card rounded-md border border-tag-infoBorder">
                                    <Settings :size="16" class="text-tag-info" />
                                </div>
                                <div class="flex flex-col text-left">
                                    <span class="font-semibold text-content-primary">{{
                                        $t('DeploymentDetailView.terraformState')
                                        }}</span>
                                    <span class="text-xs text-content-secondary">
                                        {{ tfResourcesCount > 0 ? `${tfResourcesCount} verwaltete Ressourcen` :
                                            'Erweiterte Details' }}
                                    </span>
                                </div>
                            </div>

                            <button @click="copyToClipboard(prettyJson(activeDataTask?.tf_state), 'tf_state')"
                                :title="copiedKey === 'tf_state' ? 'Kopiert!' : 'In die Zwischenablage kopieren'"
                                class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors flex-shrink-0"
                                :class="copiedKey === 'tf_state'
                                    ? 'bg-tag-info text-white border-tag-info'
                                    : 'bg-surface-card text-content-secondary border-border hover:bg-surface-input'">
                                <component :is="copiedKey === 'tf_state' ? Check : Copy" :size="13" />
                                {{ copiedKey === 'tf_state' ? 'Copied' : 'Copy' }}
                            </button>
                        </div>

                        <div class="bg-surface-card p-4 overflow-y-auto max-h-[500px]">
                            <div
                                class="font-mono text-xs leading-relaxed text-left whitespace-pre-wrap select-text">
                                <pre v-html="highlightJson(prettyJson(activeDataTask.tf_state))"></pre>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    </div>
</template>
