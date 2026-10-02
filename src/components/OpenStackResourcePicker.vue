<script setup lang="ts">
/**
 * OpenStack resource picker.
 *
 * Rendered in the wizard for variables whose backend response carries an
 * ``osType`` (set only when the variable's ``description`` has an
 * ``@openstack:<type>`` marker; see ``backend/app/routers/apps.py``).
 *
 * Loads the matching list from the backend (60s backend cache + a frontend
 * display cache shared between picker instances) and shows a single- or
 * multi-select.
 *
 * Wire format (``v-model``):
 *  - osMode='id'   → stores the UUID(s)
 *  - osMode='name' → stores the name(s)
 *  - multi=false   → string
 *  - multi=true    → Array<String> or comma-separated string (echoes input)
 *
 * The UI always shows the display name even when the stored value is a UUID;
 * lookups go through ``composables/useOpenStackResourceCache``.
 *
 * The dropdown opens as a floating layer via ``<Teleport to="body">`` so other
 * wizard fields don't shift. Position is computed from the trigger's bounding
 * rect and recalibrated on scroll/resize; scrolling the trigger out of view
 * closes the dropdown.
 *
 * Edge cases handled:
 *  - 412 credentials missing → CTA banner instead of an empty list
 *  - 502 OpenStack down → banner + fallback to free-text input
 *  - default value is a UUID whose name isn't cached yet → show the raw value
 *    with a "(manual)" tag until the cache loads
 *  - empty list → hint with free-text option
 *  - subnet filter: ``networkId`` prop can change at runtime → reactive reload
 *  - dropdown taller than space below → flips up
 *  - unmount with dropdown open → body teleport cleaned up
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  RefreshCw,
  Search,
  X,
} from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import {
  openstackResourcesApi,
  type OsResourceType,
} from '@/api/openstack-resources.api'
import {
  prime as primeDisplayCache,
  invalidate as invalidateDisplayCache,
  getDisplayName,
  ensureLoaded,
} from '@/composables/useOpenStackResourceCache'
// CredentialMissingBanner is not imported here — the parent
// (NewDeploymentVariableView) renders the full banner once above the variables
// grid when any picker emits ``credentials-missing``. Here we only show a
// compact placeholder so banners don't stack.

// ----------------------------------------------------------------
// Props / Emits
// ----------------------------------------------------------------
type Mode = 'id' | 'name'

const props = defineProps<{
  osType: OsResourceType
  osMode?: Mode
  multi?: boolean
  modelValue?: string | string[] | null
  filterNetworkId?: string | null
  azService?: 'compute' | 'network' | 'volume'
  placeholder?: string
  allowFreeText?: boolean
  /** The app author's HCL default for this variable. Used only to mark the
   *  matching entry in the option list as "recommended" — it never
   *  pre-selects anything, that is the caller's job via ``modelValue``. */
  recommendedValue?: string | number | boolean | unknown[] | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | string[]): void
  // Fired when entering/leaving the ``credentials_missing`` state. The parent
  // renders a single shared banner above the variables grid in response.
  (e: 'credentials-missing', missing: boolean): void
}>()

const toast = useToast()
const { t } = useI18n()

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------
type ResourceItem = {
  id: string
  name: string
  secondary?: string
  tertiary?: string
  raw: any
}

const items = ref<ResourceItem[]>([])
const isLoading = ref(false)
const errorReason = ref<'credentials_missing' | 'unavailable' | null>(null)
const errorMessage = ref<string>('')
const isOpen = ref(false)
const searchQuery = ref('')
const isFreeTextMode = ref(false)
const freeTextValue = ref('')

// Floating-layer anchor: live-tracked bounding rect of the trigger so the
// teleport panel lands exactly below (or above) it.
const triggerEl = ref<HTMLElement | null>(null)
const dropdownEl = ref<HTMLElement | null>(null)
const searchInputEl = ref<HTMLInputElement | null>(null)
const popupStyle = ref<Record<string, string>>({})
// 'down' | 'up' — flip when there isn't enough space below.
const popupDir = ref<'down' | 'up'>('down')

// ----------------------------------------------------------------
// Resource-specific mappings
// ----------------------------------------------------------------
function fetchByType(): Promise<{ data: any[] }> {
  switch (props.osType) {
    case 'network':
      return openstackResourcesApi.listNetworks()
    case 'subnet':
      return openstackResourcesApi.listSubnets(props.filterNetworkId || undefined)
    case 'flavor':
      return openstackResourcesApi.listFlavors()
    case 'image':
      return openstackResourcesApi.listImages('active')
    case 'keypair':
      return openstackResourcesApi.listKeypairs()
    case 'security_group':
      return openstackResourcesApi.listSecurityGroups()
    case 'floating_ip_pool':
      return openstackResourcesApi.listFloatingIpPools()
    case 'volume':
      return openstackResourcesApi.listVolumes()
    case 'router':
      return openstackResourcesApi.listRouters()
    case 'availability_zone':
      return openstackResourcesApi.listAvailabilityZones(props.azService || 'compute')
  }
}

function adapt(raw: any): ResourceItem {
  // Per-type display adaptation. Secondary = rough spec info.
  switch (props.osType) {
    case 'flavor':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: `${raw.vcpus ?? 0} vCPU · ${formatRam(raw.ram)} RAM · ${raw.disk ?? 0} GB Disk`,
        tertiary: raw.is_public ? '' : t('openstackPicker.network.private'),
        raw,
      }
    case 'image':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: raw.disk_format ? `${raw.disk_format} · ${formatBytes(raw.size)}` : formatBytes(raw.size),
        tertiary: raw.status === 'active' ? '' : raw.status,
        raw,
      }
    case 'network':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: raw.description || '',
        tertiary: [raw.shared ? t('openstackPicker.network.shared') : '', raw.external ? t('openstackPicker.network.external') : ''].filter(Boolean).join(' · '),
        raw,
      }
    case 'subnet':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: `${raw.cidr || '?'}  IPv${raw.ip_version ?? 4}`,
        tertiary: raw.gateway_ip ? `${t('openstackPicker.network.gatewayPrefix')} ${raw.gateway_ip}` : '',
        raw,
      }
    case 'keypair':
      return {
        id: raw.name ?? '',
        name: raw.name ?? '',
        secondary: raw.fingerprint ? raw.fingerprint.slice(0, 16) + '…' : '',
        tertiary: raw.type || 'ssh',
        raw,
      }
    case 'security_group':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: raw.description || '',
        raw,
      }
    case 'floating_ip_pool':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: raw.description || '',
        raw,
      }
    case 'volume':
      return {
        id: raw.id ?? '',
        name: raw.name || t('openstackPicker.unnamed'),
        secondary: `${raw.size ?? 0} GB · ${raw.volume_type || ''}`,
        tertiary: [raw.bootable ? 'bootable' : '', raw.status].filter(Boolean).join(' · '),
        raw,
      }
    case 'router':
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        secondary: raw.status || '',
        tertiary: raw.external_gateway_info ? t('openstackPicker.network.externalGateway') : '',
        raw,
      }
    case 'availability_zone':
      return {
        id: raw.name ?? '',
        name: raw.name ?? '',
        secondary: raw.state || '',
        raw,
      }
  }
}

// ----------------------------------------------------------------
// Selection logic
// ----------------------------------------------------------------
// String-coerce: HCL defaults can arrive as number/boolean (``default = 2``),
// which would be invisible without coercion. ``null``/``undefined`` and the
// literal strings ``"null"``/``"undefined"`` are treated as empty.
const toKey = (x: unknown): string => {
  if (x === null || x === undefined) return ''
  const s = String(x)
  if (s === 'null' || s === 'undefined') return ''
  return s
}

/** Normalises a scalar, list or comma-string value into a set of item keys. */
const toKeySet = (v: unknown, multi: boolean): Set<string> => {
  if (multi) {
    if (Array.isArray(v)) return new Set(v.map(toKey).filter(Boolean))
    if (typeof v === 'string' && v.trim()) {
      return new Set(v.split(',').map((s) => s.trim()).filter(Boolean))
    }
    return new Set()
  }
  const key = toKey(v)
  return new Set(key ? [key] : [])
}

const selectedKeys = computed<Set<string>>(() =>
  toKeySet(props.modelValue, Boolean(props.multi)),
)

/**
 * The author's default as a key set. Marking it in the option list is what
 * keeps the recommendation findable AFTER the user picked something else —
 * at that moment the "recommended" badge on the variable card disappears,
 * and without this the original suggestion would be lost in the list.
 */
const recommendedKeys = computed<Set<string>>(() =>
  toKeySet(props.recommendedValue, Boolean(props.multi)),
)

const valueOf = (item: ResourceItem): string =>
  props.osMode === 'id' ? item.id : item.name

const isSelected = (item: ResourceItem): boolean =>
  selectedKeys.value.has(valueOf(item))

const isRecommended = (item: ResourceItem): boolean =>
  recommendedKeys.value.has(valueOf(item))

/**
 * Display list of the current selection. Two sources: this picker's ``items``
 * if loaded, otherwise the shared display cache. Falls back to the raw value
 * marked ``known: false`` when neither has it.
 */
const selectedDisplay = computed(() => {
  const out: { value: string; displayName: string; known: boolean }[] = []
  const mode: Mode = props.osMode || 'name'
  for (const key of selectedKeys.value) {
    // Local items are the source of truth when loaded.
    const local = items.value.find((it) => valueOf(it) === key)
    if (local) {
      out.push({ value: key, displayName: local.name, known: true })
      continue
    }
    // Otherwise ask the shared display cache.
    const cached = getDisplayName(props.osType, mode, key)
    if (cached) {
      out.push({ value: key, displayName: cached.name, known: cached.known })
    } else {
      out.push({ value: key, displayName: key, known: false })
    }
  }
  return out
})

const filteredItems = computed<ResourceItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const base = q
    ? items.value.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.id.toLowerCase().includes(q) ||
          (it.secondary || '').toLowerCase().includes(q),
      )
    : items.value
  // Pull selected entries to the top so a set default is immediately visible in
  // a long list, then the recommended one — otherwise it would be buried once
  // the user has selected something else, which is exactly when it is needed.
  // Relative order inside a group is preserved (stable sort).
  return [...base].sort((a, b) => {
    const sa = isSelected(a) ? 0 : 1
    const sb = isSelected(b) ? 0 : 1
    if (sa !== sb) return sa - sb
    const ra = isRecommended(a) ? 0 : 1
    const rb = isRecommended(b) ? 0 : 1
    return ra - rb
  })
})

function toggle(item: ResourceItem) {
  const key = valueOf(item)
  if (props.multi) {
    const current = new Set(selectedKeys.value)
    if (current.has(key)) current.delete(key)
    else current.add(key)
    // Multi-select always emits an Array, regardless of how the parent
    // initialised ``modelValue`` (the backend's ``map(list(string))`` HCL type
    // requires an array).
    emit('update:modelValue', Array.from(current))
  } else {
    const newVal = isSelected(item) ? '' : key
    emit('update:modelValue', newVal)
    closeDropdown()
  }
}

function removeChip(value: string) {
  if (!props.multi) {
    emit('update:modelValue', '')
    return
  }
  const current = new Set(selectedKeys.value)
  current.delete(value)
  // Multi-select always emits Array — see ``toggle`` above for the
  // rationale.
  emit('update:modelValue', Array.from(current))
}

// ----------------------------------------------------------------
// Loading / Refresh
// ----------------------------------------------------------------
async function load(opts: { forceRefresh?: boolean } = {}) {
  isLoading.value = true
  errorReason.value = null
  errorMessage.value = ''
  try {
    if (opts.forceRefresh) {
      try {
        await openstackResourcesApi.refresh(props.osType)
      } catch (err) {
        console.warn('[OsPicker] refresh failed:', err)
      }
      invalidateDisplayCache(props.osType)
    }
    const res = await fetchByType()
    items.value = (res.data || []).map(adapt)
    // Prime the display cache for other pickers / summary view, but only for an
    // unfiltered load — a per-network subnet list must not pollute the global cache.
    if (!props.filterNetworkId) {
      primeDisplayCache(props.osType, res.data || [])
    }
  } catch (err: any) {
    const status = err?.response?.status
    const detail = err?.response?.data?.detail
    if (status === 412 && detail?.reason === 'openstack_credentials_missing') {
      errorReason.value = 'credentials_missing'
    } else if (status === 502 || detail?.reason === 'openstack_unavailable' ||
               detail?.reason === 'openstack_list_failed') {
      errorReason.value = 'unavailable'
      errorMessage.value = detail?.message || err?.message || t('openstackPicker.osError')
    } else {
      errorReason.value = 'unavailable'
      errorMessage.value = err?.message || 'Resource konnte nicht geladen werden.'
    }
    items.value = []
  } finally {
    isLoading.value = false
  }
}

async function handleRefresh() {
  // Snapshot the pre-refresh selection and its ``known`` flags so we can detect
  // entries that disappeared after the reload (e.g. a flavor deleted in the
  // project). We only warn for keys that were known before.
  const previouslyKnown = new Map<string, string>()
  for (const entry of selectedDisplay.value) {
    if (entry.known) previouslyKnown.set(entry.value, entry.displayName)
  }
  await load({ forceRefresh: true })
  if (errorReason.value === null) {
    const lost: string[] = []
    for (const [key, name] of previouslyKnown) {
      const stillThere = items.value.some((it) => valueOf(it) === key)
      if (!stillThere) lost.push(name || key)
    }
    if (lost.length > 0) {
      toast.warning(t('openstackPicker.toasts.removed', { label: lost.join(', ') }))
    } else {
      toast.success(t('openstackPicker.toasts.listRefreshed'))
    }
  }
}

// Credentials-missing bubble-up: the parent renders a single banner for all
// pickers, so we emit on every change and the parent de-duplicates.
watch(
  () => errorReason.value === 'credentials_missing',
  (missing) => emit('credentials-missing', missing),
)

// Reload when the subnet filter / AZ service / os type changes.
watch(
  () => [props.filterNetworkId, props.azService, props.osType],
  () => {
    if (!isFreeTextMode.value) load()
  },
)

onMounted(() => {
  // CSV-to-array migration: some persisted ``list(string)`` variables arrive
  // as a comma-separated string, so normalize once on mount (multi mode only)
  // so the parent can consistently work with an array.
  if (props.multi && typeof props.modelValue === 'string' && props.modelValue.trim()) {
    const parts = props.modelValue
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    emit('update:modelValue', parts)
  }
  load()
  // Feed the cache when this is a non-filtered picker, so other
  // components (summary view) can read the name immediately.
  if (!props.filterNetworkId) {
    ensureLoaded(props.osType)
  }
})

// ----------------------------------------------------------------
// Free-Text-Fallback
// ----------------------------------------------------------------
function enableFreeText() {
  isFreeTextMode.value = true
  freeTextValue.value = props.multi
    ? (Array.isArray(props.modelValue) ? props.modelValue.join(', ') : (props.modelValue || ''))
    : (typeof props.modelValue === 'string' ? props.modelValue : '')
  closeDropdown()
}

function disableFreeText() {
  isFreeTextMode.value = false
  load()
}

function onFreeTextInput(val: string) {
  freeTextValue.value = val
  if (props.multi) {
    // Multi-mode free-text: always emit an Array so the contract
    // matches ``toggle()`` / ``removeChip()``. Splits on comma so
    // the user can type "uuid-1, uuid-2" and have it land as
    // ``["uuid-1", "uuid-2"]`` instead of a raw CSV string.
    emit('update:modelValue', val.split(',').map((s) => s.trim()).filter(Boolean))
  } else {
    emit('update:modelValue', val.trim())
  }
}

// ----------------------------------------------------------------
// Display-Helpers
// ----------------------------------------------------------------
function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(0)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatRam(mb: number | undefined | null): string {
  if (!mb) return '0 MB'
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`
}

function osTypeLabel(): string {
  switch (props.osType) {
    case 'network': return 'Network'
    case 'subnet': return 'Subnet'
    case 'flavor': return 'Flavor'
    case 'image': return 'Image'
    case 'keypair': return 'Keypair'
    case 'security_group': return 'Security Group'
    case 'floating_ip_pool': return 'Floating-IP Pool'
    case 'volume': return 'Volume'
    case 'router': return 'Router'
    case 'availability_zone': return 'Availability Zone'
  }
}

const placeholderText = computed(() => {
  if (props.placeholder) return props.placeholder
  return props.multi
    ? t('openstackPicker.selectPlural', { type: osTypeLabel() })
    : t('openstackPicker.selectSingular', { type: osTypeLabel() })
})

// ----------------------------------------------------------------
// Floating Dropdown — Position + Lifecycle
// ----------------------------------------------------------------
/**
 * Positions the dropdown panel relative to the trigger rect using
 * ``position: fixed`` + ``top``/``left``/``width``, with the body as anchor
 * (matches ``Teleport to="body"``). Flips up when the panel doesn't fit below.
 */
function recalcPosition() {
  const trigger = triggerEl.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const viewportH = window.innerHeight
  // Close the dropdown if the trigger scrolled out of the viewport, otherwise
  // it would hang with no visible anchor.
  if (rect.bottom < 0 || rect.top > viewportH) {
    isOpen.value = false
    return
  }
  const PANEL_MAX_H = 384 // Tailwind max-h-96
  const GAP = 4
  const spaceBelow = viewportH - rect.bottom
  const spaceAbove = rect.top
  const flipUp = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow
  popupDir.value = flipUp ? 'up' : 'down'

  if (flipUp) {
    popupStyle.value = {
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      bottom: `${viewportH - rect.top + GAP}px`,
      maxHeight: `${Math.max(spaceAbove - GAP - 8, 200)}px`,
      zIndex: '60',
    }
  } else {
    popupStyle.value = {
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      top: `${rect.bottom + GAP}px`,
      maxHeight: `${Math.max(spaceBelow - GAP - 8, 200)}px`,
      zIndex: '60',
    }
  }
}

function openDropdown() {
  isOpen.value = true
  // nextTick: wait for the panel in the DOM, then position it and focus search.
  nextTick(() => {
    recalcPosition()
    searchInputEl.value?.focus()
  })
  // Register listeners while the dropdown is open. ``capture: true`` on scroll
  // so scrolling inside overflow containers (the wizard card) also reacts.
  window.addEventListener('scroll', recalcPosition, true)
  window.addEventListener('resize', recalcPosition)
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('keydown', onKeydown)
}

function closeDropdown() {
  if (!isOpen.value) return
  isOpen.value = false
  searchQuery.value = ''
  window.removeEventListener('scroll', recalcPosition, true)
  window.removeEventListener('resize', recalcPosition)
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onKeydown)
}

function toggleDropdown() {
  if (isOpen.value) closeDropdown()
  else openDropdown()
}

function onDocumentMouseDown(ev: MouseEvent) {
  const target = ev.target as Node | null
  if (!target) return
  if (triggerEl.value?.contains(target)) return
  if (dropdownEl.value?.contains(target)) return
  closeDropdown()
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') closeDropdown()
}

// Guarantee listener removal on unmount, otherwise the body teleport panel
// leaves a zombie listener if the user navigates away with the dropdown open.
onBeforeUnmount(() => {
  closeDropdown()
})
</script>

<template>
  <div class="space-y-2">
    <!-- ============================================================ -->
    <!-- Free-text mode (fallback when OpenStack is down, or chosen explicitly) -->
    <!-- ============================================================ -->
    <div v-if="isFreeTextMode" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs text-content-disabled flex items-center gap-1">
          <Pencil :size="12" />
          {{ t('openstackPicker.manualLabel', { mode: osMode === 'id' ? t('openstackPicker.modeUuid') : t('openstackPicker.modeName') }) }}
        </span>
        <button
          @click="disableFreeText"
          type="button"
          class="text-xs text-primary hover:text-primary/70 underline"
        >
          {{ t('openstackPicker.showList') }}
        </button>
      </div>
      <input
        :value="freeTextValue"
        @input="onFreeTextInput(($event.target as HTMLInputElement).value)"
        type="text"
        :placeholder="multi ? t('openstackPicker.multiPlaceholder') : t('openstackPicker.enterValue', { type: osTypeLabel(), mode: osMode === 'id' ? t('openstackPicker.modeUuid') : t('openstackPicker.modeName') })"
        class="w-full px-3 py-2 rounded-lg border-2 border-border bg-surface-card text-content-primary focus:border-primary outline-none font-mono text-sm"
      />
    </div>

    <!-- ============================================================ -->
    <!-- Credentials missing → compact inline hint. The full banner is rendered -->
    <!-- once by the parent above the variables grid; here only a subtle per-picker note. -->
    <!-- ============================================================ -->
    <div v-else-if="errorReason === 'credentials_missing'">
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-status-warning/40 bg-status-warningLight text-status-warning text-sm"
      >
        <AlertTriangle :size="14" class="flex-shrink-0" />
        <span>{{ t('openstackPicker.credentialsRequired') }}</span>
      </div>
      <button
        v-if="allowFreeText"
        @click="enableFreeText"
        type="button"
        class="mt-2 text-xs text-primary hover:text-primary/70 underline"
      >
        {{ t('openstackPicker.enterManuallyInstead', { mode: osMode === 'id' ? t('openstackPicker.modeUuid') : t('openstackPicker.modeName') }) }}
      </button>
    </div>

    <!-- ============================================================ -->
    <!-- Picker (single or multi) — trigger button + floating panel -->
    <!-- ============================================================ -->
    <div v-else class="space-y-2">
      <div class="flex items-start gap-2">
        <div class="flex-grow min-w-0">
          <button
            ref="triggerEl"
            @click="toggleDropdown"
            type="button"
            class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-2 border-border bg-surface-card hover:border-primary/50 transition focus:border-primary outline-none text-left"
          >
            <div class="flex flex-wrap items-center gap-1.5 flex-grow min-w-0">
              <!-- Single -->
              <template v-if="!multi">
                <template v-if="selectedDisplay.length === 0">
                  <span class="text-content-disabled text-sm">{{ placeholderText }}</span>
                </template>
                <template v-else>
                  <!-- Selection pill: same accent as the highlight row in the
                       dropdown, so it reads clearly as a selected value. -->
                  <span
                    class="inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded bg-status-successLight text-status-success border border-status-success/30"
                    :title="selectedDisplay[0]?.value"
                  >
                    <Check :size="12" class="text-status-success flex-shrink-0" />
                    <span class="font-medium text-sm truncate">
                      {{ selectedDisplay[0]?.displayName }}
                    </span>
                  </span>
                  <!-- Subtle hint when the value isn't in the currently loaded
                       list (e.g. a default UUID of a deleted resource or not-yet
                       -loaded items). Shown as a grey, tooltip-capable pill. -->
                  <span
                    v-if="!selectedDisplay[0]?.known"
                    class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-input text-content-disabled border border-card-border"
                    :title="t('openstackPicker.notInList')"
                  >
                    {{ t('openstackPicker.externalBadge') }}
                  </span>
                </template>
              </template>

              <!-- Multi: Chips -->
              <template v-else>
                <template v-if="selectedDisplay.length === 0">
                  <span class="text-content-disabled text-sm">{{ placeholderText }}</span>
                </template>
                <span
                  v-for="(entry, i) in selectedDisplay"
                  :key="i"
                  class="inline-flex items-center gap-1 bg-status-successLight text-status-success px-2 py-0.5 rounded text-xs font-medium border border-status-success/30"
                  :class="entry.known ? '' : 'border-status-warning/40 bg-status-warningLight text-status-warning'"
                  :title="entry.value"
                  @click.stop
                >
                  <span class="truncate max-w-[160px]">{{ entry.displayName }}</span>
                  <button
                    @click.stop="removeChip(entry.value)"
                    type="button"
                    class="hover:opacity-70"
                  >
                    <X :size="12" />
                  </button>
                </span>
              </template>
            </div>
            <component :is="isOpen ? ChevronUp : ChevronDown" :size="16" class="text-content-disabled flex-shrink-0" />
          </button>
        </div>

        <button
          @click="handleRefresh"
          type="button"
          :disabled="isLoading"
          class="flex-shrink-0 p-2 text-content-secondary hover:text-primary disabled:opacity-50 transition"
          :title="t('openstackPicker.refreshList')"
        >
          <RefreshCw :size="16" :class="isLoading ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- Floating dropdown — teleported to body level -->
    <Teleport to="body">
      <div
        v-if="isOpen && !isFreeTextMode && errorReason !== 'credentials_missing'"
        ref="dropdownEl"
        :style="popupStyle"
        class="border-2 border-border rounded-lg bg-surface-card shadow-2xl overflow-hidden flex flex-col"
        @mousedown.stop
      >
        <!-- Search -->
        <div class="relative border-b border-card-border p-2 flex-shrink-0">
          <Search :size="14" class="absolute left-4 top-1/2 -translate-y-1/2 text-content-disabled" />
          <input
            ref="searchInputEl"
            v-model="searchQuery"
            type="text"
            :placeholder="t('openstackPicker.searchPlaceholder', { type: osTypeLabel() })"
            class="w-full pl-7 pr-2 py-1.5 rounded text-sm bg-surface-card text-content-primary outline-none border border-transparent focus:border-primary"
          />
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="p-6 text-center text-content-disabled text-sm">
          <div class="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-primary mb-2"></div>
          <p>{{ t('openstackPicker.loading', { type: osTypeLabel() }) }}</p>
        </div>

        <!-- Error: OpenStack down -->
        <div v-else-if="errorReason === 'unavailable'" class="p-4">
          <div class="flex items-start gap-2 text-status-warning mb-2">
            <AlertTriangle :size="16" class="flex-shrink-0 mt-0.5" />
            <div class="text-sm">
              <p class="font-medium">{{ t('openstackPicker.unreachable') }}</p>
              <p class="text-xs text-status-warning/80 mt-1">{{ errorMessage }}</p>
            </div>
          </div>
          <div class="flex gap-2 mt-2">
            <button
              @click="handleRefresh"
              type="button"
              class="text-xs px-2 py-1 rounded bg-status-successLight text-status-success hover:bg-status-successLight/70"
            >
              {{ t('openstackPicker.retry') }}
            </button>
            <button
              v-if="allowFreeText"
              @click="enableFreeText"
              type="button"
              class="text-xs px-2 py-1 rounded bg-surface-input text-content-secondary hover:bg-surface-hover"
            >
              {{ t('openstackPicker.enterManually') }}
            </button>
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredItems.length === 0" class="p-6 text-center text-content-secondary text-sm">
          <p v-if="searchQuery">{{ t('openstackPicker.noHits', { query: searchQuery }) }}</p>
          <template v-else>
            <p class="mb-2">{{ t('openstackPicker.emptyProject', { type: osTypeLabel() }) }}</p>
            <button
              v-if="allowFreeText"
              @click="enableFreeText"
              type="button"
              class="text-xs text-primary hover:text-primary/70 underline inline-flex items-center gap-1"
            >
              <Pencil :size="12" /> {{ t('openstackPicker.enterManually') }}
            </button>
          </template>
        </div>

        <!-- Items — flex-grow + overflow-auto so max-height from popupStyle
             bounds the scrolling region -->
        <ul v-else class="flex-grow overflow-y-auto divide-y divide-card-border">
          <li
            v-for="item in filteredItems"
            :key="item.id || item.name"
            @click="toggle(item)"
            class="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover cursor-pointer transition"
            :class="isSelected(item) ? 'bg-surface-input' : ''"
          >
            <div
              class="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border"
              :class="
                isSelected(item)
                  ? 'bg-status-success border-status-success'
                  : 'bg-surface-card border-border'
              "
            >
              <Check v-if="isSelected(item)" :size="12" class="text-content-inverse" />
            </div>

            <div class="flex-grow min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-content-primary text-sm truncate">{{ item.name || t('openstackPicker.unnamed') }}</span>
                <span
                  v-if="item.tertiary"
                  class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-input text-content-secondary font-medium flex-shrink-0"
                >
                  {{ item.tertiary }}
                </span>
                <!-- The app author's default. Stays marked even after the user
                     picked something else, so the suggestion is findable. -->
                <span
                  v-if="isRecommended(item)"
                  data-testid="picker-recommended"
                  class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-status-successLight text-status-success border border-status-success/30 font-bold flex-shrink-0"
                >
                  {{ t('openstackPicker.recommended') }}
                </span>
              </div>
              <div v-if="item.secondary" class="text-xs text-content-secondary truncate">
                {{ item.secondary }}
              </div>
              <!-- Show the ID in id-mode as a secondary disambiguation hint;
                   the ``name`` remains the main label. -->
              <div v-if="osMode === 'id' && item.id" class="text-[10px] text-content-disabled font-mono truncate">
                {{ item.id }}
              </div>
            </div>
          </li>
        </ul>

        <!-- Footer with mode hint -->
        <div class="border-t border-card-border px-3 py-1.5 bg-surface-input flex items-center justify-between text-[11px] text-content-disabled flex-shrink-0">
          <span>
            <template v-if="osMode === 'id'">{{ t('openstackPicker.hints.storesUuid') }}</template>
            <template v-else>{{ t('openstackPicker.hints.storesName') }}</template>
            <template v-if="multi"> · {{ t('openstackPicker.hints.multiSelect') }}</template>
          </span>
          <button
            v-if="allowFreeText"
            @click="enableFreeText"
            type="button"
            class="text-primary hover:text-primary/70 inline-flex items-center gap-1"
          >
            <Pencil :size="10" /> {{ t('openstackPicker.enterManuallyShort') }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
