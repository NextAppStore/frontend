<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import type { Task } from '@/types'
import type { LogEntry } from '@/composables/useDeploymentStream'

defineProps<{
  activeTask: Task
  streamConnectionState: string
  streamCurrentPhaseIndex: number | null
  streamCurrentPhase: string | null
  streamProgress: number | null
  streamLiveLogs: LogEntry[]
  streamTotalLogCount: number
  phaseStepCount: number
  currentPhaseIndex: number
  phaseLabel: (phase: unknown) => string
  phaseStepLabel: (idx: number) => string
  formatDate: (date: string | null | undefined) => string
}>()
</script>

<template>
    <!-- Active Task — live progress + log tail for the currently
         running task. Replaces the previous mix of "Latest Task"
         info card + duplicate entry in the Tasks & Logs list. -->
    <div class="bg-surface-card rounded-xl border border-tag-infoBorder shadow-sm overflow-hidden">
        <!-- Header strip: gradient + live indicator + task type/status -->
        <div class="bg-gradient-to-r from-tag-infoLight to-tag-neutralLight px-6 py-4 border-b border-tag-infoBorder">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <div class="w-2.5 h-2.5 bg-status-success rounded-full"></div>
                        <div class="absolute inset-0 w-2.5 h-2.5 bg-status-success rounded-full animate-ping"></div>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-content-primary capitalize">{{ activeTask.type
                            }}</span>
                            <span class="text-xs font-medium text-content-secondary">·</span>
                            <span class="text-xs text-content-secondary">running since {{ formatDate(activeTask.started_at ||
                                activeTask.created_at) }}</span>
                        </div>
                        <div class="text-xs text-content-secondary font-mono mt-0.5">{{ activeTask.taskId }}</div>
                    </div>
                </div>
                <span class="text-xs px-2 py-1 rounded-md font-medium" :class="streamConnectionState === 'live'
                    ? 'bg-status-successLight text-status-success border border-status-success/30'
                    : streamConnectionState === 'reconnecting'
                        ? 'bg-status-warningLight text-status-warning border border-status-warning/30'
                        : 'bg-surface-input text-content-secondary border border-card-border'">
                    {{ streamConnectionState === 'live' ? 'Stream live' : streamConnectionState }}
                </span>
            </div>
        </div>

        <!-- Body: progress bar + phase stepper + live tail -->
        <div class="p-6 space-y-5">
            <!-- The "Worker is starting up" loader covers the very
                 first seconds of a fresh task, before any phase
                 info is available — neither the SSE stream nor
                 the DB-seeded ``current_phase`` is set yet.
                 ``streamCurrentPhaseIndex`` carries either the
                 authoritative live value or the percent-derived
                 guess from the DB seed, so checking it alone is
                 enough to decide whether to render the stepper. -->
            <template v-if="streamCurrentPhaseIndex === null && !streamCurrentPhase">
                <div class="flex items-center gap-3 py-6 justify-center text-content-secondary">
                    <Loader2 class="animate-spin" :size="20" />
                    <span class="text-sm">Worker is starting up…</span>
                </div>
            </template>
            <template v-else>
                <!-- Progress headline -->
                <div>
                    <div class="flex items-baseline justify-between mb-2">
                        <span class="text-base font-semibold text-content-primary">
                            {{ phaseLabel(streamCurrentPhase) || 'Starting…' }}
                        </span>
                        <span class="text-2xl font-bold text-content-primary tabular-nums">
                            {{ streamProgress ?? 0 }}<span class="text-sm text-content-secondary font-medium">%</span>
                        </span>
                    </div>
                    <div class="w-full bg-surface-input rounded-full h-2 overflow-hidden">
                        <div class="bg-gradient-to-r from-tag-info to-tag-neutral h-2 rounded-full transition-all duration-500 ease-out"
                            :style="{ width: (streamProgress ?? 0) + '%' }"></div>
                    </div>
                </div>

                <!-- Phase stepper. Renders ``phaseStepCount`` dots based
                     on the live ``totalPhases``, with labels picked by
                     the live total (matches deploy/destroy presets).
                     Generous ``py-3`` padding prevents the active
                     dot's ``ring-4`` + ``scale-125`` halo from clipping
                     against the parent's bottom edge. -->
                <div class="flex items-start gap-1.5 overflow-x-auto py-3">
                    <template v-for="idx in phaseStepCount" :key="idx - 1">
                        <div class="flex-shrink-0 flex flex-col items-center gap-2 min-w-[60px]">
                            <div class="w-2.5 h-2.5 rounded-full transition-all" :class="(idx - 1) < currentPhaseIndex
                                ? 'bg-tag-info'
                                : (idx - 1) === currentPhaseIndex
                                    ? 'bg-tag-info ring-4 ring-tag-infoLight scale-125'
                                    : 'bg-surface-hover'"></div>
                            <span
                                class="text-[10px] uppercase tracking-wide font-medium whitespace-nowrap text-center"
                                :class="(idx - 1) <= currentPhaseIndex ? 'text-tag-info' : 'text-content-disabled'">
                                {{ phaseStepLabel(idx - 1) }}
                            </span>
                        </div>
                        <div v-if="(idx - 1) < phaseStepCount - 1" class="flex-1 h-px min-w-[8px] mt-[5px]"
                            :class="(idx - 1) < currentPhaseIndex ? 'bg-tag-info/50' : 'bg-surface-hover'"></div>
                    </template>
                </div>
            </template>

            <!-- Live log tail. ``streamTotalLogCount`` keeps
                 growing past the visible buffer (capped at 100
                 lines via the ring buffer in the composable),
                 so the user sees that the worker is still
                 producing output even after the box is full. -->
            <div v-if="streamLiveLogs.length > 0" class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-xs uppercase tracking-wide font-semibold text-content-secondary">Live output</span>
                    <span class="text-xs text-content-secondary">
                        {{ streamTotalLogCount.toLocaleString() }} {{ streamTotalLogCount === 1 ? 'line' : 'lines'
                        }}
                        <span v-if="streamLiveLogs.length < streamTotalLogCount" class="text-content-disabled">
                            · last {{ streamLiveLogs.length }} shown
                        </span>
                    </span>
                </div>
                <div class="bg-gray-900 rounded-md p-3 max-h-72 overflow-y-auto font-mono text-xs">
                    <div v-for="(log, idx) in streamLiveLogs" :key="`${log.timestamp}-${idx}`"
                        class="text-content-inverse whitespace-pre-wrap break-words" :class="{
                            'text-status-error': log.level === 'ERROR',
                            'text-status-warning': log.level === 'WARNING',
                            'text-status-success': log.level === 'SUCCESS',
                            'text-content-disabled': log.streaming,
                        }">
                        <span class="text-content-secondary mr-2">{{ log.timestamp.split('T')[1]?.slice(0, 8) || '' }}</span>
                        <span v-if="log.tool" class="text-tag-info mr-1">[{{ log.tool }}]</span>{{ log.message }}
                    </div>
                </div>
            </div>
            <div v-else class="bg-surface-input border border-card-border rounded-md p-4 text-center text-xs text-content-secondary">
                Waiting for first log line…
            </div>
        </div>
    </div>
</template>
