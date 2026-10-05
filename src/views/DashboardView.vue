<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BarChart3, Layers, GraduationCap, ArrowRight,
  XCircle, Loader2, AlertCircle, Rocket, BookOpen
} from 'lucide-vue-next'
// Rein dekoratives Markenzeichen im Hero — die freigestellte Variante ohne
// Schriftzug, damit die Grafik in jeder Größe lesbar bleibt.
import logoMark from '@/assets/ScholarStackLogo.png'
import logoMarkDark from '@/assets/ScholarStackLogo-Hell.png'
import { useDashboard } from '@/composables/useDashboard'
import { useQuotas } from '@/composables/useQuotas'
import { useOpenStackCredentialsStore } from '@/stores/openstack-credentials.store'
import { useAuthStore } from '@/stores/auth.store'
import { useDeploymentStore } from '@/stores/deployment.store'
import { useRole } from '@/composables/useRole'
import { formatDateTime } from '@/utils/format'
import { useColorScheme } from '@/composables/useColorScheme'
import CredentialMissingBanner from '@/components/CredentialMissingBanner.vue'

const { stats, fetchStats } = useDashboard()
const { formattedQuotas, loading: quotasLoading, needsCredentials, hasCachedQuotas, fetchQuotas, getColorClass } = useQuotas()
const credStore = useOpenStackCredentialsStore()
const authStore = useAuthStore()
const deploymentStore = useDeploymentStore()
const { t } = useI18n()
const { isStaff } = useRole()
const { scheme } = useColorScheme()

const isDark = computed(() => {
  void scheme.value
  return document.documentElement.classList.contains('dark')
})

const activeLogo = computed(() => isDark.value ? logoMarkDark : logoMark)

/** Die fünf jüngsten Deployments, absteigend nach Anlagedatum. */
const recentDeployments = computed(() =>
  [...deploymentStore.deployments]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5),
)

/**
 * Punktfarbe je Status. Abgeglichen mit ``getStatusColor`` in
 * ``DeploymentsListView`` — dort liegt die verbindliche Statuspalette. Hier
 * steht nur die Volltonvariante derselben Farbtöne, weil ein 8px-Punkt keine
 * Hintergrund-/Rahmen-Kombination tragen kann.
 */
const statusDot = (status: string): string => {
  const dots: Record<string, string> = {
    success: 'bg-green-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500',
    pending: 'bg-yellow-500',
    cancelled: 'bg-gray-400',
    destroyed: 'bg-orange-500',
    destroying: 'bg-orange-400',
    pausing: 'bg-amber-500',
    paused: 'bg-slate-400',
    resuming: 'bg-emerald-500',
    pause_failed: 'bg-amber-600',
    resume_failed: 'bg-amber-600',
  }
  return dots[status] || 'bg-gray-400'
}

/** Kurzform ohne Sekunden — in einer schmalen Spalte zählt jede Stelle. */
const shortDateTime = (value: string): string =>
  formatDateTime(value, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const firstName = computed(() => {
  const name = authStore.user?.username || ''
  return name.charAt(0).toUpperCase() + name.slice(1)
})

const timeGreeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return t('DashboardView.timeGreetings.morning')
  if (h < 18) return t('DashboardView.timeGreetings.afternoon')
  return t('DashboardView.timeGreetings.evening')
})

onMounted(() => {
  fetchStats()
  fetchQuotas()
  deploymentStore.fetchDeployments()
  if (!credStore.status) credStore.fetch()
})
</script>

<template>
  <div class="space-y-6">

    <!-- Banners -->
    <CredentialMissingBanner
      v-if="credStore.isResolved && !credStore.hasCredential"
      variant="warning"
      :title="t('banners.credentialsMissing.title')"
      :message="t('banners.credentialsMissing.message')"
      :cta="t('banners.credentialsMissing.cta')"
      ctaTo="/user/openstack"
    />
    <CredentialMissingBanner
      v-else-if="credStore.isResolved && credStore.lastError"
      variant="error"
      :title="t('banners.credentialsInvalid.title')"
      :message="credStore.lastError"
      :cta="t('banners.credentialsInvalid.cta')"
      ctaTo="/user/openstack"
    />

    <!-- Hero banner -->
    <div class="hero-banner">
      <div class="hero-content">
        <p class="hero-greeting">{{ timeGreeting }}</p>
        <h1 class="hero-name">{{ firstName }}</h1>
        <p class="hero-sub">{{ $t('DashboardView.subtitle') }}</p>

        <div class="hero-actions">
          <RouterLink :to="{ name: 'apps' }" class="hero-cta group">
            <Rocket :size="16" class="group-hover:translate-x-0.5 transition-transform" />
            {{ $t('DashboardView.deploymentNew') }}
          </RouterLink>
          <RouterLink to="/help" class="hero-cta-ghost">
            <BookOpen :size="16" />
            {{ $t('nav.help') }}
          </RouterLink>
        </div>
      </div>

      <!-- Markenzeichen als Grafik, aria-hidden weil rein dekorativ: der Name
           steht bereits als Text in der Sidebar. -->
      <div class="hero-mark" aria-hidden="true">
        <span class="mark-halo" />
        <span class="mark-ring" />
        <span class="mark-orbit" />
        <span class="mark-plate mark-plate--top" />
        <span class="mark-plate mark-plate--bottom" />
        <img :src="activeLogo" alt="" />
      </div>
    </div>

    <!-- KPI row -->
    <div class="kpi-row">
      <RouterLink :to="{ name: 'deployments.list' }" class="kpi-item kpi-item--red group">
        <div class="kpi-icon-wrap">
          <BarChart3 :size="17" />
        </div>
        <div class="kpi-body">
          <p class="kpi-lbl">{{ $t('DashboardView.deployments') }}</p>
          <p class="kpi-num">{{ stats.deployments }}</p>
        </div>
        <ArrowRight :size="15" class="kpi-arrow" />
      </RouterLink>

      <RouterLink to="/apps" class="kpi-item kpi-item--stone group">
        <div class="kpi-icon-wrap">
          <Layers :size="17" />
        </div>
        <div class="kpi-body">
          <p class="kpi-lbl">{{ $t('DashboardView.apps') }}</p>
          <p class="kpi-num">{{ stats.apps }}</p>
        </div>
        <ArrowRight :size="15" class="kpi-arrow" />
      </RouterLink>

      <!-- Courses tile: students have no courses access (staff-only route),
           so hide the tile via RoleGate instead of 404 on click. -->
      <RouterLink v-if="isStaff" to="/courses" class="kpi-item kpi-item--amber group">
        <div class="kpi-icon-wrap">
          <GraduationCap :size="17" />
        </div>
        <div class="kpi-body">
          <p class="kpi-lbl">{{ $t('DashboardView.courses') }}</p>
          <p class="kpi-num">{{ stats.courses }}</p>
        </div>
        <ArrowRight :size="15" class="kpi-arrow" />
      </RouterLink>
    </div>

    <!-- Untere Reihe: Quotas tragen mehr Inhalt und bekommen daher zwei
         Drittel, die Deployment-Liste ein Drittel. Unter xl stapeln beide. -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">

    <!-- Available resources — two-column quotas list -->
    <div class="panel xl:col-span-2">
      <div class="panel-head flex items-center justify-between px-6 py-4">
        <h2 class="text-sm font-semibold panel-head-title">{{ $t('DashboardView.availableResources') }}</h2>
        <span v-if="quotasLoading && hasCachedQuotas" class="flex items-center gap-1.5 text-xs text-content-disabled">
          <Loader2 :size="12" class="animate-spin" />
        </span>
      </div>

      <!-- Skeleton (initial load) -->
      <div v-if="quotasLoading && !hasCachedQuotas" class="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        <div v-for="i in 6" :key="i" class="animate-pulse space-y-2">
          <div class="flex justify-between">
            <div class="h-3 bg-surface-hover rounded w-20" />
            <div class="h-3 bg-surface-hover rounded w-10" />
          </div>
          <div class="h-1.5 bg-surface-hover rounded-full" />
        </div>
      </div>

      <!-- Quotas: two columns on >= md -->
      <div v-else-if="formattedQuotas.length > 0" class="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-8">
        <div v-for="quota in formattedQuotas" :key="quota.label" class="quota-row">
          <span class="quota-icon">
            <component :is="quota.icon" :size="14" />
          </span>

          <span class="quota-label">{{ quota.label }}</span>

          <span class="quota-track">
            <span
              :class="getColorClass(quota.percentage)"
              class="quota-fill"
              :style="{ width: `${quota.percentage}%` }"
            />
          </span>

          <span
            class="quota-pct"
            :class="quota.percentage >= 80 ? 'text-status-error' : quota.percentage >= 60 ? 'text-status-warning' : 'text-content-secondary'"
          >
            {{ quota.percentage }}%
            <!-- Der volle Satz bleibt für Screenreader erhalten; sichtbar
                 reicht die Zahl, sonst wird die Zeile zu lang. -->
            <span class="sr-only">{{ t('DashboardView.quotaUsed', { percentage: quota.percentage }) }}</span>
          </span>

          <span class="quota-val">
            {{ quota.used }}/{{ quota.limit }}{{ quota.unit }}
            <AlertCircle v-if="quota.percentage >= 80" :size="12" class="text-status-error shrink-0" />
          </span>
        </div>
      </div>
      <!-- No credentials -->
      <div v-else-if="needsCredentials" class="px-6 py-12 text-center">
        <div class="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center mx-auto mb-3">
          <XCircle :size="22" class="text-content-disabled" />
        </div>
        <p class="text-sm font-medium text-content-primary">{{ t('DashboardView.noCredentialsTitle') }}</p>
        <p class="text-xs text-content-secondary mt-1 mb-4">{{ t('DashboardView.noCredentialsHint') }}</p>
        <RouterLink
          to="/user/openstack"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-content-inverse text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors"
        >
          {{ t('DashboardView.setUpNow') }} <ArrowRight :size="12" />
        </RouterLink>
      </div>

      <!-- Error / no data -->
      <div v-else class="px-6 py-12 text-center">
        <p class="text-sm text-content-secondary">{{ t('DashboardView.quotaLoadError') }}</p>
      </div>
    </div>

    <!-- Letzte Deployments. Bewusst NICHT "Aktivitäten": es gibt kein
         entitätsübergreifendes Audit-Log im Backend, nur Deployments haben
         einen Verlauf. Ein breiterer Name würde mehr versprechen, als die
         Liste halten kann. -->
    <div class="panel flex flex-col">
      <div class="panel-head flex items-center justify-between px-6 py-4">
        <h2 class="text-sm font-semibold panel-head-title">{{ $t('DashboardView.recentDeployments') }}</h2>
        <Loader2
          v-if="deploymentStore.isLoading && recentDeployments.length > 0"
          :size="12"
          class="animate-spin text-content-disabled"
        />
      </div>

      <!-- Skeleton (Erstladung) -->
      <div v-if="deploymentStore.isLoading && recentDeployments.length === 0" class="px-6 py-5 space-y-4">
        <div v-for="i in 4" :key="i" class="animate-pulse flex items-center gap-3">
          <div class="h-2 w-2 rounded-full bg-surface-hover shrink-0" />
          <div class="h-3 bg-surface-hover rounded flex-1" />
          <div class="h-3 bg-surface-hover rounded w-14 shrink-0" />
        </div>
      </div>

      <!-- Fehler -->
      <div v-else-if="deploymentStore.error" class="px-6 py-12 text-center">
        <p class="text-sm text-content-secondary">{{ deploymentStore.error }}</p>
      </div>

      <!-- Leer -->
      <div v-else-if="recentDeployments.length === 0" class="px-6 py-12 text-center">
        <div class="activity-empty-icon">
          <Rocket :size="20" />
        </div>
        <p class="text-sm font-medium text-content-primary">{{ $t('DashboardView.noDeploymentsTitle') }}</p>
        <!-- Bewusst ohne eigenen Button: "Neues Deployment" steht bereits als
             Primäraktion im Hero. Zwei gleiche Aufrufe auf einer Seite
             schwächen beide. -->
        <p class="text-xs text-content-secondary mt-1">{{ $t('DashboardView.noDeploymentsHint') }}</p>
      </div>

      <!-- Liste -->
      <template v-else>
        <div class="px-4 py-2 flex-1">
          <RouterLink
            v-for="d in recentDeployments"
            :key="d.deploymentId"
            :to="{ name: 'deployments.detail', params: { id: d.deploymentId } }"
            class="activity-row group"
          >
            <span class="activity-dot" :class="statusDot(d.status)" />
            <span class="activity-name">{{ d.name }}</span>
            <span class="activity-time">{{ shortDateTime(d.created_at) }}</span>
            <ArrowRight :size="13" class="activity-arrow" />
          </RouterLink>
        </div>

        <RouterLink :to="{ name: 'deployments.list' }" class="activity-all">
          {{ $t('DashboardView.allDeployments') }}
          <ArrowRight :size="13" />
        </RouterLink>
      </template>
    </div>

    </div>

  </div>
</template>

<style scoped>
/* Hero
   Helle Fläche statt Vollrot: Auf einem roten Block müsste jedes Element
   weiß sein, was Hierarchie unmöglich macht — alles hätte dasselbe Gewicht.
   Hell erlaubt echte Abstufung (rote Anrede, dunkler Name, graue Zeile) und
   lässt das Markenzeichen rechts überhaupt erst wirken. */
.hero-banner {
  background:
    radial-gradient(at 88% 28%, var(--color-dash-hero-overlay) 0px, transparent 55%),
    var(--color-dash-hero-bg);
  border: 1px solid var(--color-dash-hero-border);
  box-shadow: 0 12px 34px -20px var(--color-dash-hero-shadow);
  border-radius: 20px;
  padding: 36px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  position: relative;
  overflow: hidden;
}

/* Zwei gekippte Flächen als Tiefenebene hinter dem Markenzeichen — greift die
   kantige Geometrie des Logos auf, statt beliebige Kreise zu setzen. */
.hero-banner::before {
  content: '';
  position: absolute;
  top: -70px;
  right: 4%;
  width: 290px;
  height: 290px;
  background: var(--color-dash-hero-shape);
  border-radius: 52px;
  transform: rotate(18deg);
}

.hero-banner::after {
  content: '';
  position: absolute;
  bottom: -100px;
  right: 20%;
  width: 230px;
  height: 230px;
  background: var(--color-dash-hero-shape);
  border-radius: 44px;
  transform: rotate(-12deg);
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-greeting {
  color: var(--color-dash-hero-greeting);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.hero-name {
  color: var(--color-dash-hero-name);
  font-size: 2.25rem;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 8px;
}

.hero-sub {
  color: var(--color-dash-hero-sub);
  font-size: 0.9375rem;
  max-width: 32rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}

/* Primäraktion: gefülltes Markenrot mit farbigem Schatten. */
.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  border: 1px solid transparent;
  color: var(--color-content-inverse);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 12px;
  text-decoration: none;
  box-shadow: 0 12px 24px -14px var(--color-dash-hero-cta-shadow);
  transition: transform 150ms ease, box-shadow 150ms ease;
  white-space: nowrap;
}

.hero-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px -14px var(--color-dash-hero-cta-shadow-hover);
}

/* Sekundäraktion: klar untergeordnet, aber nicht zaghaft. */
.hero-cta-ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  background: var(--color-dash-cta-ghost-bg);
  border: 1px solid var(--color-dash-cta-ghost-border);
  color: var(--color-dash-cta-ghost-text);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 12px;
  text-decoration: none;
  transition: background 150ms ease, border-color 150ms ease;
  white-space: nowrap;
}

.hero-cta-ghost:hover {
  background: var(--color-surface-card);
  border-color: var(--color-dash-cta-ghost-border-hover);
}

/* Bühne für das Markenzeichen. Die Ebenen greifen das Stapel-Motiv des Logos
   auf — "Stack" ist Teil des Namens, also darf die Dekoration davon erzählen,
   statt beliebige Formen zu setzen. */
.hero-mark {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 224px;
  height: 224px;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.hero-mark img {
  position: relative;
  z-index: 3;
  display: block;
  width: 72%;
  height: auto;
  filter: drop-shadow(0 18px 30px var(--color-dash-mark-drop-shadow));
  animation: mark-float 7s ease-in-out infinite;
}

/* Lichthof: lässt das Zeichen leuchten statt nur aufzuliegen. */
.mark-halo {
  position: absolute;
  inset: -14%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    var(--color-dash-mark-halo-inner) 0%,
    var(--color-dash-mark-halo-outer) 42%,
    transparent 68%
  );
}

.mark-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--color-dash-mark-ring);
}

/* Gestrichelter Ring, der sehr langsam kreist — Leben ohne Unruhe. */
.mark-orbit {
  position: absolute;
  inset: 11%;
  border-radius: 50%;
  border: 1px dashed var(--color-dash-mark-orbit);
  animation: mark-spin 48s linear infinite;
}

/* Zwei versetzte Platten hinter dem Zeichen, in derselben Schräglage wie die
   Ebenen im Logo. */
.mark-plate {
  position: absolute;
  z-index: 2;
  width: 54%;
  height: 30%;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--color-dash-mark-plate) 0%, var(--color-dash-mark-plate-outer) 100%);
  transform: rotate(-22deg) skewX(-14deg);
}

.mark-plate--top {
  top: 6%;
  left: 0;
}

.mark-plate--bottom {
  bottom: 6%;
  right: 0;
}

@keyframes mark-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-9px);
  }
}

@keyframes mark-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Bewegung ist Zierde, kein Inhalt — wer sie abbestellt hat, bekommt sie nicht. */
@media (prefers-reduced-motion: reduce) {
  .hero-mark img,
  .mark-orbit {
    animation: none;
  }
}

/* Schmale Fenster: das Markenzeichen weicht, der Text behält den Platz. */
@media (max-width: 880px) {
  .hero-mark {
    display: none;
  }
}

/* KPI-Kacheln
   Vorher eine durchgehende Leiste mit Trennstrichen — die drei Zahlen lasen
   sich dadurch als eine Einheit, obwohl es drei getrennte Ziele sind. Jetzt
   drei eigenständige Karten: jede ist erkennbar ein eigener Klickbereich,
   und die Akzentkante oben gibt jeder Kachel eine eigene Identität.
   ``auto-fit`` fängt ab, dass Studierende die Kurs-Kachel nicht sehen. */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}

.kpi-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 22px;
  border-radius: 16px;
  text-decoration: none;
  background: var(--color-dash-kpi-bg);
  border: 1px solid var(--color-dash-kpi-border);
  box-shadow: 0 3px 14px -8px var(--color-dash-kpi-shadow);
  overflow: hidden;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.kpi-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px -16px var(--color-dash-kpi-shadow);
  border-color: var(--color-dash-kpi-border-hover);
}

/* Akzentkante oben — der einzige Ort, an dem die Kacheln sich farblich
   unterscheiden. Die Fläche bleibt bei allen gleich, sonst wird es bunt. */
.kpi-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--kpi-accent);
}

/* Farbschleier unten rechts, der beim Hover aufgeht. */
.kpi-item::after {
  content: '';
  position: absolute;
  right: -40px;
  bottom: -55px;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: var(--kpi-glow);
  opacity: 0.55;
  transition: opacity 160ms ease, transform 160ms ease;
}

.kpi-item:hover::after {
  opacity: 1;
  transform: scale(1.12);
}

.kpi-item--red {
  --kpi-accent: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  --kpi-glow: radial-gradient(circle, var(--color-dash-kpi-red-glow) 0%, transparent 70%);
}

.kpi-item--stone {
  --kpi-accent: linear-gradient(90deg, var(--color-dash-kpi-stone-from) 0%, var(--color-dash-kpi-stone-to) 100%);
  --kpi-glow: radial-gradient(circle, var(--color-dash-kpi-stone-glow) 0%, transparent 70%);
}

.kpi-item--amber {
  --kpi-accent: linear-gradient(90deg, var(--color-dash-kpi-amber-from) 0%, var(--color-dash-kpi-amber-to) 100%);
  --kpi-glow: radial-gradient(circle, var(--color-dash-kpi-amber-glow) 0%, transparent 70%);
}

.kpi-body {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.kpi-arrow {
  position: relative;
  z-index: 1;
  margin-left: auto;
  flex-shrink: 0;
  color: var(--color-dash-kpi-arrow);
  transition: color 160ms ease, transform 160ms ease;
}

.kpi-item:hover .kpi-arrow {
  color: var(--color-dash-kpi-arrow-hover);
  transform: translateX(3px);
}

/* Gemeinsame Flächenkarte: warmer Verlauf statt reinem Weiß, damit die
   Panels nicht auf dem hellen Hintergrund verschwinden. */
.panel {
  background: var(--color-dash-panel-bg);
  border: 1px solid var(--color-dash-panel-border);
  border-radius: 16px;
  box-shadow: 0 3px 14px -8px var(--color-dash-panel-shadow);
  overflow: hidden;
}

.panel-head {
  background: var(--color-dash-panel-head-bg);
  border-bottom: 1px solid var(--color-dash-panel-border);
}

.panel-head h2 {
  color: var(--color-dash-panel-head-title);
}

/* Quota-Zeilen
   Vorher drei Zeilen pro Wert (Label, Balken, "x% ausgelastet") — bei sechs
   Werten wurde das eine lange Liste, in der nichts heraussticht. Jetzt eine
   Zeile pro Wert mit festem Raster, sodass Balken, Prozent und Absolutwert
   untereinander fluchten und sich vergleichen lassen. */
.quota-row {
  display: grid;
  grid-template-columns: 26px minmax(96px, auto) 1fr 40px auto;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--color-dash-quota-border);
}

.quota-row:last-child,
.quota-row:nth-last-child(2):nth-child(odd) {
  border-bottom: none;
}

.quota-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--color-dash-quota-icon-bg);
  color: var(--color-dash-quota-icon-text);
}

.quota-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-dash-quota-label);
  white-space: nowrap;
}

/* Warme statt neutralgraue Schiene — reines Grau wirkte in der roten
   Umgebung schmutzig. */
.quota-track {
  position: relative;
  display: block;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-dash-quota-track-bg);
  box-shadow: inset 0 1px 2px var(--color-dash-quota-track-shadow);
}

.quota-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 700ms ease;
}

.quota-pct {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.quota-val {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-dash-quota-val);
  white-space: nowrap;
}

.kpi-icon-wrap {
  position: relative;
  z-index: 1;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--color-dash-kpi-icon-wrap-bg);
  border: 1px solid var(--color-dash-kpi-icon-border);
  color: var(--color-dash-kpi-icon-red);
}

.kpi-item--stone .kpi-icon-wrap {
  color: var(--color-dash-kpi-icon-stone);
}

.kpi-item--amber .kpi-icon-wrap {
  color: var(--color-dash-kpi-icon-amber);
}

.kpi-num {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-dash-kpi-num);
  line-height: 1;
}

/* Letzte Deployments */
.activity-row {
  display: grid;
  grid-template-columns: 8px 1fr auto 14px;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  text-decoration: none;
  transition: background 150ms ease;
}

.activity-row:hover {
  background: var(--color-dash-activity-row-hover);
}

/* Der Punkt trägt den Status. Ein Ring in derselben Farbe gibt ihm Gewicht,
   ohne dass er zur Ampel aufgeblasen werden muss. */
.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.04);
}

.activity-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-dash-activity-name);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-time {
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-dash-activity-time);
  white-space: nowrap;
}

.activity-arrow {
  color: transparent;
  transition: color 150ms ease, transform 150ms ease;
}

.activity-row:hover .activity-arrow {
  color: var(--color-dash-activity-arrow-hover);
  transform: translateX(2px);
}

.activity-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: auto;
  padding: 13px;
  border-top: 1px solid var(--color-dash-activity-all-border);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-dash-activity-all-text);
  text-decoration: none;
  transition: background 150ms ease;
}

.activity-all:hover {
  background: var(--color-dash-activity-all-hover);
}

.activity-empty-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  background: var(--color-dash-empty-icon-bg);
  color: var(--color-dash-empty-icon-text);
}

/* Label steht jetzt ÜBER der Zahl: beim Überfliegen liest man zuerst, worum
   es geht, und dann den Wert — umgekehrt muss man raten, wofür die Zahl steht. */
.kpi-lbl {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-dash-kpi-lbl);
  margin-bottom: 6px;
}
</style>
