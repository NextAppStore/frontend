<script setup lang="ts">
/**
 * Small "how do I connect" helper for the RDP pill in the Teams &
 * Mitglieder table. The ready-to-paste ``mstsc`` command next to it only
 * works on Windows — this gives Mac/Linux users a quick path (app name
 * or CLI command) without cluttering the pill itself.
 *
 * Wraps the existing ``ui/Modal`` rather than a custom-positioned
 * popover: a table cell has little room to safely anchor and flip a
 * floating panel near the viewport edge, and Modal already handles the
 * overlay and click-outside-to-close.
 *
 * Local to this view rather than promoted to ``ui/`` — the
 * click-triggered info panel pattern has exactly one call site so far;
 * extract it if a second one appears.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info } from 'lucide-vue-next'
import Modal from '@/components/ui/Modal.vue'

const props = defineProps<{
  ip: string
  port?: number
}>()

const { t } = useI18n()

const isOpen = ref(false)

const linuxCommand = () => {
  const target = props.port && props.port !== 3389 ? `${props.ip}:${props.port}` : props.ip
  return `xfreerdp /v:${target}`
}
</script>

<template>
  <button
    type="button"
    @click="isOpen = true"
    class="text-content-disabled hover:text-status-warning p-0.5 rounded hover:bg-surface-input transition-colors flex-shrink-0"
    :title="t('DeploymentDetailView.rdpHelp.triggerLabel')"
    :aria-label="t('DeploymentDetailView.rdpHelp.triggerLabel')"
  >
    <Info :size="12" />
  </button>

  <Modal :show="isOpen" @close="isOpen = false">
    <template #title>{{ t('DeploymentDetailView.rdpHelp.title') }}</template>
    <template #body>
      <div class="space-y-4 text-sm text-content-secondary">
        <div>
          <h5 class="font-semibold text-content-primary mb-1">{{ t('DeploymentDetailView.rdpHelp.windows.heading') }}</h5>
          <p>{{ t('DeploymentDetailView.rdpHelp.windows.body') }}</p>
        </div>
        <div>
          <h5 class="font-semibold text-content-primary mb-1">{{ t('DeploymentDetailView.rdpHelp.macos.heading') }}</h5>
          <p>{{ t('DeploymentDetailView.rdpHelp.macos.body', { ip: props.ip }) }}</p>
        </div>
        <div>
          <h5 class="font-semibold text-content-primary mb-1">{{ t('DeploymentDetailView.rdpHelp.linux.heading') }}</h5>
          <p>{{ t('DeploymentDetailView.rdpHelp.linux.body') }}</p>
          <code class="mt-1 block bg-surface-input border border-card-border rounded px-2 py-1 font-mono text-xs text-content-primary break-all">
            {{ linuxCommand() }}
          </code>
        </div>
      </div>
    </template>
  </Modal>
</template>
