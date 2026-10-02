<script setup lang="ts">
/**
 * Inline detail panel for ONE VM, shown directly under the clicked
 * ``InfrastructureVmCard`` in the deployment-detail page's Infrastructure section.
 *
 * Renders as part of the parent's flow, like another card in the section.
 *
 * Layout: a rounded ``bg-white border shadow-sm`` card matching the surrounding
 * sections, with ``bg-gray-50`` sub-cards per data group (Identity, Lifecycle,
 * Hardware, Addresses, Ports, SGs, Volumes, Metadata).
 *
 * The component owns its own fetch/loading/error state; the parent mounts it
 * with a target address and listens for ``close`` to collapse the panel.
 */
import { onMounted, ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeploymentResource } from '@/types'
import { deploymentApi } from '@/api/deployment.api'
import { formatUptime, pillToneClass } from '@/composables/useVmPresentation'
import {
  X,
  RefreshCw,
  AlertTriangle,
  Server,
  Cpu,
  Network as NetworkIcon,
  Shield,
  HardDrive,
  Tag,
  Activity,
} from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps<{
  deploymentId: string
  address: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isLoading = ref(false)
const detail = ref<DeploymentResource | null>(null)
const errorMessage = ref<string | null>(null)

const load = async () => {
  isLoading.value = true
  errorMessage.value = null
  try {
    const response = await deploymentApi.getResourceDetail(
      props.deploymentId,
      props.address,
    )
    detail.value = response.data
  } catch (err: any) {
    // 404 — resource removed since the list was rendered. 412 — user
    // lost their OpenStack credentials between mount and click. Both
    // are surfaced inline; the page-level toast is reserved for
    // harder errors.
    const status = err?.response?.status
    if (status === 404) {
      errorMessage.value = t('vm.drawer.errors.notFound')
    } else if (status === 412) {
      errorMessage.value = t('vm.drawer.errors.missingCredentials')
    } else if (status === 502) {
      errorMessage.value = t('vm.drawer.errors.unreachable')
    } else {
      errorMessage.value = err?.message || t('vm.drawer.errors.generic')
    }
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
// Re-fetch when the parent swaps which VM we look at without
// unmounting the panel.
watch(() => props.address, load)

// --- Lifecycle pill colour (matches InfrastructureVmCard) ---
const lifecycleTone = computed<'green' | 'red' | 'amber' | 'gray'>(() => {
  const s = detail.value?.lifecycle?.status
  if (!s) return 'gray'
  if (s === 'ACTIVE') return 'green'
  if (s === 'ERROR') return 'red'
  if (s === 'BUILD' || s === 'REBUILD') return 'amber'
  return 'gray'
})

const lifecyclePillClass = computed(() => pillToneClass(lifecycleTone.value))

const uptime = computed(() => formatUptime(detail.value?.hardware?.launched_at))

// --- Map network IDs / fixed IPs to the human-friendly network name.
// The Stage-2 ``ports`` block only carries the ``network_id`` (UUID).
// The Stage-1 ``addresses`` block, on the other hand, is keyed by
// the OpenStack-side network NAME (e.g. ``"NAT"``) and carries the
// fixed_ip for that network. So we walk addresses to build two cheap
// lookups: by-fixed-ip first, then by-mac as fallback.
const portNetworkName = (port: { fixed_ip: string | null; mac: string | null }): string | null => {
  const addrs = detail.value?.addresses
  if (!addrs || addrs.length === 0) return null
  if (port.fixed_ip) {
    const m = addrs.find((a) => a.fixed_ip === port.fixed_ip)
    if (m) return m.network
  }
  if (port.mac) {
    const m = addrs.find((a) => a.mac === port.mac)
    if (m) return m.network
  }
  return null
}
</script>

<template>
  <!--
    The outer container blends into the parent's Infrastruktur
    section: same ``bg-white rounded-xl border shadow-sm`` shell as
    the deployment-page cards. ``flex flex-col`` lets the body
    consume remaining height when the parent constrains us via
    ``flex-1 min-h-0`` (sidebar context); inline-card contexts just
    grow naturally because no parent flex is constraining us. The
    ``overflow-hidden`` on this wrapper keeps the rounded corners
    intact even when the inner body has its own ``overflow-y-auto``.
  -->
  <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
    <!-- Header — icon tile + title + close button. ``shrink-0`` so
         the body, not the header, absorbs any height squeeze. The
         gradient gives a soft visual top-edge without needing a
         separate accent line. -->
    <header class="shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3 bg-gradient-to-r from-gray-50 to-white">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-2 bg-white rounded-lg shrink-0 border border-gray-200">
          <Server :size="18" class="text-gray-600" />
        </div>
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            {{ t('vm.drawer.title') }}
          </p>
          <h3 class="text-base font-semibold text-gray-900 truncate" :title="detail?.display_name || address">
            {{ detail?.display_name || address }}
          </h3>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          @click="load"
          :disabled="isLoading"
          class="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
          :title="t('vm.actions.refresh')"
        >
          <RefreshCw :size="15" :class="isLoading ? 'animate-spin' : ''" />
        </button>
        <button
          @click="emit('close')"
          class="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          :title="t('vm.actions.closeDetails')"
        >
          <X :size="16" />
        </button>
      </div>
    </header>

    <!-- Body — ``min-h-0`` is the Tailwind incantation that lets a
         flex child shrink below its content's natural size, which is
         what enables ``overflow-y-auto`` to engage when the parent
         (the sidebar's flex column) constrains us to a viewport-
         bounded height. In a non-flex context (inline card) this
         is a no-op: the body grows to fit content. -->
    <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      <div v-if="isLoading && !detail" class="text-sm text-gray-500 italic px-4 py-6 bg-gray-50 rounded-lg border border-gray-100 text-center">
        {{ t('vm.drawer.loading') }}
      </div>

      <div
        v-else-if="errorMessage"
        class="text-sm p-3 rounded-lg border bg-red-50 text-red-800 border-red-200 flex items-start gap-2"
      >
        <AlertTriangle :size="16" class="mt-0.5 shrink-0" />
        <p>{{ errorMessage }}</p>
      </div>

      <template v-else-if="detail">
        <!-- Identity card -->
        <section class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
          <div class="flex items-center gap-2 mb-1">
            <Tag :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.identity') }}</h4>
            <span
              v-if="detail.team"
              class="ml-auto text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200"
            >
              {{ detail.team }}
            </span>
            <span
              v-else
              class="ml-auto text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200"
            >
              {{ t('vm.sharedTeam') }}
            </span>
          </div>
          <div class="text-xs space-y-1.5">
            <div class="flex items-baseline gap-2">
              <span class="text-gray-500 w-20 shrink-0">{{ t('vm.drawer.address') }}</span>
              <code class="font-mono text-gray-800 break-all">{{ detail.address }}</code>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-gray-500 w-20 shrink-0">{{ t('vm.drawer.osUuid') }}</span>
              <code class="font-mono text-gray-700 break-all">{{ detail.provider_id }}</code>
            </div>
          </div>
        </section>

        <!-- Lifecycle card -->
        <section
          v-if="detail.lifecycle"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <Activity :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.lifecycle') }}</h4>
            <span
              v-if="detail.lifecycle.status"
              class="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
              :class="lifecyclePillClass"
            >
              {{ detail.lifecycle.status }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.lifecycle.taskState') }}</span>
              <p class="font-medium text-gray-800">{{ detail.lifecycle.task_state || '—' }}</p>
            </div>
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.lifecycle.vmState') }}</span>
              <p class="font-medium text-gray-800">{{ detail.lifecycle.vm_state || '—' }}</p>
            </div>
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.lifecycle.powerState') }}</span>
              <p class="font-medium text-gray-800">{{ detail.lifecycle.power_state || '—' }}</p>
            </div>
            <div v-if="uptime">
              <span class="text-gray-500">{{ t('vm.uptimePrefix') }}</span>
              <p class="font-medium text-gray-800">{{ uptime }}</p>
            </div>
          </div>
          <div
            v-if="detail.lifecycle.fault_message"
            class="text-xs p-2 rounded border bg-red-50 text-red-800 border-red-200"
          >
            <p class="font-semibold mb-0.5">{{ t('vm.openstackFault') }}</p>
            <p class="font-mono break-all">{{ detail.lifecycle.fault_message }}</p>
          </div>
        </section>

        <!-- Hardware card -->
        <section
          v-if="detail.hardware"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <Cpu :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.hardware') }}</h4>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.hardware.flavor') }}</span>
              <p class="font-medium text-gray-800">{{ detail.hardware.flavor_name || '—' }}</p>
            </div>
            <div>
              <span class="text-gray-500">{{ t('vm.units.vcpu') }}</span>
              <p class="font-medium text-gray-800">{{ detail.hardware.vcpus ?? '—' }}</p>
            </div>
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.hardware.ram') }}</span>
              <p class="font-medium text-gray-800">
                {{ detail.hardware.ram_mb != null ? `${detail.hardware.ram_mb} MB` : '—' }}
              </p>
            </div>
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.hardware.disk') }}</span>
              <p class="font-medium text-gray-800">
                {{ detail.hardware.disk_gb != null ? `${detail.hardware.disk_gb} ${t('vm.units.gb')}` : '—' }}
              </p>
            </div>
            <div class="col-span-2">
              <span class="text-gray-500">{{ t('vm.drawer.hardware.image') }}</span>
              <p class="font-medium text-gray-800 break-all">
                <span v-if="detail.hardware.image_name">{{ detail.hardware.image_name }}</span>
                <code v-else-if="detail.hardware.image_id" class="font-mono text-xs">
                  {{ detail.hardware.image_id }}
                </code>
                <span v-else>—</span>
              </p>
            </div>
            <div>
              <span class="text-gray-500">{{ t('vm.drawer.hardware.az') }}</span>
              <p class="font-medium text-gray-800">{{ detail.hardware.availability_zone || '—' }}</p>
            </div>
          </div>
        </section>

        <!-- Network addresses card (high-level: one row per network name) -->
        <section
          v-if="detail.addresses && detail.addresses.length > 0"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <NetworkIcon :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.addresses') }}</h4>
            <span
              class="ml-auto text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded"
            >
              {{ detail.addresses.length }}
            </span>
          </div>
          <div class="space-y-2">
            <div
              v-for="addr in detail.addresses"
              :key="`${addr.network}::${addr.fixed_ip || addr.mac || ''}`"
              class="text-xs bg-white rounded border border-gray-200 p-2.5 space-y-1"
            >
              <p class="font-semibold text-gray-900">{{ addr.network }}</p>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-700">
                <div>
                  <span class="text-gray-500">{{ t('vm.drawer.network.fixedIp') }}</span>
                  <code class="ml-1 font-mono">{{ addr.fixed_ip || '—' }}</code>
                </div>
                <div v-if="addr.floating_ip">
                  <span class="text-gray-500">{{ t('vm.drawer.network.floatingIp') }}</span>
                  <code class="ml-1 font-mono text-emerald-700">{{ addr.floating_ip }}</code>
                </div>
                <!-- IPv6 and MAC get the full row — both are long enough
                     ("xxxx:xxxx:...:xxxx" / "xx:xx:xx:xx:xx:xx") that
                     cramming them into a half-width cell next to another
                     field pushes them past the panel edge. -->
                <div v-if="addr.fixed_ip_v6" class="col-span-2">
                  <span class="text-gray-500">{{ t('vm.drawer.network.fixedIpV6') }}</span>
                  <code class="ml-1 font-mono break-all">{{ addr.fixed_ip_v6 }}</code>
                </div>
                <div v-if="addr.mac" class="col-span-2">
                  <span class="text-gray-500">{{ t('vm.drawer.network.mac') }}</span>
                  <code class="ml-1 font-mono">{{ addr.mac }}</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Network ports card (low-level per-port detail) -->
        <section
          v-if="detail.ports"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <NetworkIcon :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.ports') }}</h4>
            <span
              v-if="detail.ports.length > 0"
              class="ml-auto text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded"
            >
              {{ detail.ports.length }}
            </span>
          </div>
          <div v-if="detail.ports.length === 0" class="text-xs text-gray-500 italic">
            {{ t('vm.drawer.network.noPorts') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="port in detail.ports"
              :key="port.port_id"
              class="text-xs bg-white rounded border border-gray-200 p-2.5 space-y-1"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <code class="font-mono text-gray-700 truncate" :title="port.port_id">
                    {{ port.port_id.slice(0, 8) }}…
                  </code>
                  <span
                    v-if="portNetworkName(port)"
                    class="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded"
                    :title="port.network_id || ''"
                  >
                    {{ portNetworkName(port) }}
                  </span>
                </div>
                <span
                  class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap"
                  :class="port.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'"
                >
                  {{ port.status || 'unknown' }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-700">
                <div>
                  <span class="text-gray-500">IP</span>
                  <code class="ml-1 font-mono">{{ port.fixed_ip || '—' }}</code>
                </div>
                <div v-if="port.fixed_ip_v6" class="col-span-2">
                  <span class="text-gray-500">{{ t('vm.drawer.network.fixedIpV6') }}</span>
                  <code class="ml-1 font-mono break-all">{{ port.fixed_ip_v6 }}</code>
                </div>
                <div class="col-span-2">
                  <span class="text-gray-500">{{ t('vm.drawer.network.mac') }}</span>
                  <code class="ml-1 font-mono">{{ port.mac || '—' }}</code>
                </div>
              </div>
              <p v-if="port.security_group_ids.length > 0" class="text-gray-500">
                {{ t('vm.drawer.network.securityGroupCount', { count: port.security_group_ids.length }) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Security Groups card -->
        <section
          v-if="detail.security_groups"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <Shield :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.securityGroups') }}</h4>
            <span
              v-if="detail.security_groups.length > 0"
              class="ml-auto text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded"
            >
              {{ detail.security_groups.length }}
            </span>
          </div>
          <div v-if="detail.security_groups.length === 0" class="text-xs text-gray-500 italic">
            {{ t('vm.drawer.network.noSecurityGroups') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="sg in detail.security_groups"
              :key="sg.id"
              class="text-xs bg-white rounded border border-gray-200 p-2.5 space-y-1"
            >
              <p class="font-semibold text-gray-900">{{ sg.name }}</p>
              <p v-if="sg.description" class="text-gray-500">{{ sg.description }}</p>
              <div class="flex items-center gap-2 pt-1">
                <span class="text-[10px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                  {{ sg.ingress_rules }} {{ t('vm.drawer.network.ingress') }}
                </span>
                <span class="text-[10px] font-semibold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                  {{ sg.egress_rules }} {{ t('vm.drawer.network.egress') }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Volumes card -->
        <section
          v-if="detail.volumes"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <HardDrive :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.volumes') }}</h4>
            <span
              v-if="detail.volumes.length > 0"
              class="ml-auto text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded"
            >
              {{ detail.volumes.length }}
            </span>
          </div>
          <div v-if="detail.volumes.length === 0" class="text-xs text-gray-500 italic">
            {{ t('vm.drawer.volumes.empty') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="vol in detail.volumes"
              :key="vol.volume_id"
              class="text-xs bg-white rounded border border-gray-200 p-2.5 space-y-1"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="font-semibold text-gray-900 truncate">
                  {{ vol.name || vol.volume_id.slice(0, 8) + '…' }}
                </p>
                <span
                  v-if="vol.status"
                  class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap"
                  :class="vol.status === 'in-use'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'"
                >
                  {{ vol.status }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-700">
                <div v-if="vol.size_gb != null">
                  <span class="text-gray-500">{{ t('vm.drawer.volumes.size') }}</span>
                  <span class="ml-1 font-medium">{{ vol.size_gb }} {{ t('vm.units.gb') }}</span>
                </div>
                <div v-if="vol.device">
                  <span class="text-gray-500">{{ t('vm.drawer.volumes.device') }}</span>
                  <code class="ml-1 font-mono">{{ vol.device }}</code>
                </div>
              </div>
              <p v-if="vol.bootable" class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                {{ t('vm.drawer.volumes.bootable') }}
              </p>
            </div>
          </div>
        </section>

        <!-- Metadata card -->
        <section
          v-if="detail.metadata && Object.keys(detail.metadata).length > 0"
          class="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <Tag :size="14" class="text-gray-400" />
            <h4 class="text-sm font-semibold text-gray-700">{{ t('vm.drawer.sections.metadata') }}</h4>
          </div>
          <div class="space-y-1 text-xs">
            <div
              v-for="(value, key) in detail.metadata"
              :key="key"
              class="flex items-baseline gap-2"
            >
              <code class="font-mono text-gray-600 shrink-0">{{ key }}</code>
              <span class="text-gray-400">=</span>
              <span class="text-gray-800 break-all">{{ value }}</span>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
