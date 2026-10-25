<script setup lang="ts">
/**
 * Teilnehmerauswahl für den Schnell-Deploy.
 *
 * Der Schnell-Deploy nimmt dem Dozenten alle Entscheidungen ab, die sich aus
 * der App ergeben — Name, Version, Variablen. Eine Entscheidung bleibt übrig,
 * weil sie nicht ableitbar ist: wer die Umgebung bekommt. Ohne diese Abfrage
 * zieht der Dozent selbst ein, was nur für „App mal ausprobieren" passt, nicht
 * für „Kurs starten".
 *
 * Der Dialog lädt Kurse erst beim Öffnen und die Teilnehmer erst bei Auswahl
 * eines Kurses — beides kostet einen Request und wird nicht gebraucht, solange
 * niemand den Schnell-Deploy benutzt.
 *
 * Die geladenen Teilnehmer landen im ``studentCache`` des Stores. Die
 * Zusammenfassung löst Namen darüber auf und zeigt sonst rohe Keycloak-UUIDs.
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Users, User, Loader2 } from 'lucide-vue-next'

import Modal from '@/components/ui/Modal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { courseApi } from '@/api/course.api'
import { useDeploymentStore } from '@/stores/deployment.store'
import { useAuthStore } from '@/stores/auth.store'
// ``User`` ist hier schon das Lucide-Icon — der Typ kommt deshalb unter Alias.
import type { Course, User as AppUser } from '@/types'

const props = defineProps<{
  show: boolean
  appName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', memberIds: string[]): void
}>()

const { t } = useI18n()
const deploymentStore = useDeploymentStore()
const authStore = useAuthStore()

/** Sentinel für „kein Kurs, nur ich" — ein leerer Wert im ``<select>``. */
const SELF_ONLY = ''

const courses = ref<Course[]>([])
const coursesLoading = ref(false)
const coursesError = ref(false)

const selectedCourseId = ref<string>(SELF_ONLY)
const students = ref<SelectableStudent[]>([])
const studentsLoading = ref(false)
const selectedStudentIds = ref<string[]>([])

const isSelfOnly = computed(() => selectedCourseId.value === SELF_ONLY)

/** Ohne Teilnehmer gäbe es keine VM — der Knopf bleibt dann gesperrt. */
const canConfirm = computed(
  () => isSelfOnly.value || (!studentsLoading.value && selectedStudentIds.value.length > 0),
)

const loadCourses = async () => {
  if (courses.value.length > 0) return
  coursesLoading.value = true
  coursesError.value = false
  try {
    const { data } = await courseApi.list(0, 200)
    courses.value = data || []
  } catch {
    coursesError.value = true
  } finally {
    coursesLoading.value = false
  }
}

/** Ein Nutzer, dessen Keycloak-Subject feststeht — nur der kann Mitglied werden. */
type SelectableStudent = AppUser & { keycloak_id: string }

const hasKeycloakId = (s: AppUser): s is SelectableStudent =>
  typeof s.keycloak_id === 'string' && s.keycloak_id.trim() !== ''

const loadStudents = async (courseId: string) => {
  studentsLoading.value = true
  try {
    const { data } = await courseApi.getById(courseId)
    // Teilnehmer ohne Keycloak-Subject fliegen raus: Die Mitgliedschaft wird
    // über dieses Subject hergestellt (``DeploymentCreate.teams[].userIds``),
    // ohne es ließe sich der Eintrag gar nicht anlegen. Betrifft Konten, die
    // über LTI entstanden und noch nicht verknüpft sind.
    const members = (data.users || []).filter(hasKeycloakId)
    students.value = members
    // Alle vorausgewählt: Der häufige Fall ist „ganzer Kurs". Wer einzelne
    // abwählen will, kann das hier tun.
    selectedStudentIds.value = members.map((s) => s.keycloak_id)
    for (const s of members) {
      deploymentStore.studentCache.set(s.keycloak_id, s)
    }
  } catch {
    students.value = []
    selectedStudentIds.value = []
  } finally {
    studentsLoading.value = false
  }
}

watch(selectedCourseId, (courseId) => {
  if (!courseId) {
    students.value = []
    selectedStudentIds.value = []
    return
  }
  loadStudents(courseId)
})

// Beim Öffnen zurücksetzen: Der Dialog wird pro App neu benutzt, eine alte
// Kursauswahl wäre hier eine stille Falle.
watch(
  () => props.show,
  (open) => {
    if (!open) return
    selectedCourseId.value = SELF_ONLY
    students.value = []
    selectedStudentIds.value = []
    loadCourses()
  },
  { immediate: true },
)

const toggleStudent = (id: string) => {
  const idx = selectedStudentIds.value.indexOf(id)
  if (idx === -1) selectedStudentIds.value.push(id)
  else selectedStudentIds.value.splice(idx, 1)
}

/** Vor- und Nachname, sonst Benutzername, sonst E-Mail — alle drei können fehlen. */
const displayName = (s: AppUser | null | undefined): string =>
  [s?.firstName, s?.lastName].filter(Boolean).join(' ') || s?.username || s?.email || ''

/**
 * „Nur ich" mit dem eigenen Namen dahinter. Macht sichtbar, wer die Umgebung
 * bekommt — auf einem geteilten Rechner oder nach einem Rollenwechsel ist das
 * nicht selbstverständlich. Ohne auflösbaren Namen bleibt es beim schlichten
 * „Nur ich", statt eine leere Klammer zu zeigen.
 */
const selfOptionLabel = computed(() => {
  const name = displayName(authStore.user)
  return name
    ? t('deployment.quickDeploy.selfOnlyNamed', { name })
    : t('deployment.quickDeploy.selfOnly')
})

const handleConfirm = () => {
  if (!canConfirm.value) return
  emit('confirm', isSelfOnly.value ? [] : [...selectedStudentIds.value])
}
</script>

<template>
  <Modal :show="show" @close="emit('close')">
    <template #title>
      {{ t('deployment.quickDeploy.modalTitle', { name: appName }) }}
    </template>

    <template #body>
      <div class="space-y-5">
        <p class="text-sm text-content-secondary">
          {{ t('deployment.quickDeploy.modalHint') }}
        </p>

        <div>
          <label for="quick-deploy-course" class="block text-xs font-semibold uppercase tracking-wider text-content-disabled mb-2">
            {{ t('deployment.quickDeploy.courseLabel') }}
          </label>
          <select
            id="quick-deploy-course"
            v-model="selectedCourseId"
            data-testid="quick-deploy-course"
            :disabled="coursesLoading"
            class="w-full px-3 py-2 rounded-lg border-2 border-card-border bg-surface-card text-content-primary outline-none focus:border-primary transition-colors disabled:opacity-50"
          >
            <option :value="SELF_ONLY">{{ selfOptionLabel }}</option>
            <option v-for="c in courses" :key="c.courseId" :value="c.courseId">
              {{ c.name }}
            </option>
          </select>

          <p v-if="coursesLoading" class="mt-2 text-xs text-content-disabled flex items-center gap-1.5">
            <Loader2 :size="12" class="animate-spin" />
            {{ t('deployment.quickDeploy.loadingCourses') }}
          </p>
          <p v-else-if="coursesError" class="mt-2 text-xs text-status-error">
            {{ t('deployment.quickDeploy.coursesError') }}
          </p>
        </div>

        <!-- Nur ich -->
        <div v-if="isSelfOnly" class="flex items-start gap-2.5 rounded-lg border border-card-border bg-surface-input px-4 py-3">
          <User :size="16" class="text-content-disabled shrink-0 mt-0.5" />
          <p class="text-sm text-content-secondary">{{ t('deployment.quickDeploy.selfOnlyHint') }}</p>
        </div>

        <!-- Teilnehmer des gewählten Kurses -->
        <div v-else>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-content-disabled">
              {{ t('deployment.quickDeploy.participantsLabel') }}
            </span>
            <span v-if="!studentsLoading" class="text-xs text-content-disabled tabular-nums">
              {{ t('deployment.quickDeploy.selectedCount', { selected: selectedStudentIds.length, total: students.length }) }}
            </span>
          </div>

          <div v-if="studentsLoading" class="px-4 py-6 text-center text-xs text-content-disabled flex items-center justify-center gap-1.5">
            <Loader2 :size="12" class="animate-spin" />
            {{ t('deployment.quickDeploy.loadingParticipants') }}
          </div>

          <div v-else-if="students.length === 0" class="px-4 py-6 text-center">
            <Users :size="20" class="mx-auto mb-2 text-content-disabled" />
            <p class="text-sm text-content-secondary">{{ t('deployment.quickDeploy.noParticipants') }}</p>
          </div>

          <ul v-else class="max-h-52 overflow-y-auto rounded-lg border border-card-border divide-y divide-card-border">
            <li v-for="s in students" :key="s.keycloak_id">
              <label class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-hover transition-colors">
                <input
                  type="checkbox"
                  :checked="selectedStudentIds.includes(s.keycloak_id)"
                  @change="toggleStudent(s.keycloak_id)"
                  class="w-4 h-4 accent-primary"
                />
                <span class="text-sm text-content-primary">{{ displayName(s) }}</span>
              </label>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="emit('close')">
          {{ t('action.cancel') }}
        </BaseButton>
        <BaseButton
          variant="primary"
          data-testid="quick-deploy-confirm"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          {{ t('deployment.quickDeploy.confirm') }}
        </BaseButton>
      </div>
    </template>
  </Modal>
</template>
