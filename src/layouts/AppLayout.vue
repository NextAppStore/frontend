<script setup lang="ts">
import {
  LayoutDashboard,
  BarChart3,
  Layers,
  GraduationCap,
  HelpCircle,
  User,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-vue-next'

import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.store'
import { useAuth } from '@/composables/useAuth'
import { useRole } from '@/composables/useRole'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'

import logo from '@/assets/ScholarStackLogo.png'
// Freigestelltes Markenzeichen ohne Schriftzug — für die eingeklappte Sidebar.
import logoMark from '@/assets/ScholarStackLogo(S).png'

const { locale, t } = useI18n()
const authStore = useAuthStore()
const { logout } = useAuth()
const { isAdmin, isStaff } = useRole()
const route = useRoute()

const userName = computed(() => authStore.user?.username || 'User')
const userInitial = computed(() => (authStore.user?.username ?? 'U').charAt(0).toUpperCase())

const isMeshBgActive = computed(() => route.name === 'dashboard' || route.path === '/')

const sidebarCollapsed = ref(false)
const userMenuOpen = ref(false)

const closeUserMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.user-menu-root')) userMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', closeUserMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeUserMenu))

const pageTitle = computed(() => {
  const name = route.name as string | undefined
  const path = route.path as string

  if (name === 'dashboard' || name === 'home' || path === '/') return t('nav.dashboard')
  if (name?.startsWith('deployments') || path.startsWith('/deployments')) return t('nav.deployments')
  if (name?.startsWith('apps') || path.startsWith('/apps')) return t('nav.apps')
  if (name === 'courses' || path === '/courses' || path.startsWith('/courses')) return t('nav.courses')
  if (name === 'help' || path === '/help') return t('nav.help')
  if (name === 'config') return t('nav.config')
  if (name === 'admin.apps') return t('nav.approvals')
  return ''
})

const changeLocale = (lang: string) => {
  locale.value = lang
  localStorage.setItem('locale', lang)
}

const navItems = computed(() => [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: { name: 'deployments.list' }, label: 'nav.deployments', icon: BarChart3 },
  { to: '/apps', label: 'nav.apps', icon: Layers },
  { to: '/courses', label: 'nav.courses', icon: GraduationCap, visible: isStaff.value },
  { to: '/admin/apps', label: 'nav.approvals', icon: ShieldCheck, visible: isAdmin.value },
  { to: '/help', label: 'nav.help', icon: HelpCircle },
].filter(item => item.visible !== false))
</script>

<template>
  <div class="h-screen flex bg-bgSoft overflow-x-visible">

    <!-- Sidebar -->
    <aside
      class="sidebar-bg flex flex-col h-full flex-shrink-0 transition-colors duration-200"
      :class="sidebarCollapsed ? 'w-16' : 'w-60'"
    >

      <!-- Logo area. Eingeklappt ist die Sidebar 64px breit — das Logo mit
           Schriftzug passt dort nicht hinein und lief vorher seitlich heraus.
           Deshalb wird dann auf die freigestellte "S"-Variante umgeschaltet,
           nicht nur verkleinert: Der Schriftzug wäre bei 40px ohnehin nicht
           mehr lesbar. -->
      <div class="flex items-center px-3" :class="sidebarCollapsed ? 'h-16' : 'h-24'" style="overflow: visible;">
        <RouterLink
          to="/"
          class="flex items-center justify-center"
          :style="{ height: sidebarCollapsed ? '40px' : '84px', width: '100%', overflow: 'visible' }"
        >
          <img
            :src="sidebarCollapsed ? logoMark : logo"
            alt="ScholarStack Click'n Deploy"
            :style="{
              position: 'relative',
              zIndex: 30,
              height: sidebarCollapsed ? '40px' : '84px',
              maxWidth: 'none',
            }"
          />
        </RouterLink>
      </div>

      <!-- Sidebar toggle inside navigation zone (shown only when collapsed) -->
      <div v-if="sidebarCollapsed" class="px-2 py-2 border-b border-black/5">
        <button
          @click="sidebarCollapsed = false"
          class="sidebar-toggle-btn"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen :size="18" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="nav-link group"
          :class="sidebarCollapsed ? 'nav-link-collapsed' : ''"
          active-class="nav-link-active"
        >
          <span class="nav-indicator" />
          <component :is="item.icon" :size="21" class="flex-shrink-0 opacity-70 group-[.nav-link-active]:opacity-100" />
          <span
            v-if="!sidebarCollapsed"
            class="transition-opacity duration-150 whitespace-nowrap"
          >{{ $t(item.label) }}</span>
          <!-- Tooltip when collapsed -->
          <span v-if="sidebarCollapsed" class="nav-tooltip">{{ $t(item.label) }}</span>
        </RouterLink>
      </nav>

    </aside>

    <!-- Main area -->
    <div class="flex-1 flex flex-col h-full min-w-0">

      <!-- Header -->
      <header class="h-16 header-bg flex items-center justify-between px-6 flex-shrink-0 relative">

        <!-- Left: toggle (title centered separately) -->
        <div class="flex items-center gap-3">
          <button
            v-if="!sidebarCollapsed"
            @click="sidebarCollapsed = true"
            class="text-gray-400 hover:text-gray-800 transition-colors p-1 rounded-md hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            <PanelLeftClose :size="20" />
          </button>
        </div>

        <!-- Centered title (always horizontally centered in viewport) -->
        <div class="header-title">
          <span class="text-gray-700 text-sm font-semibold tracking-wide">{{ pageTitle }}</span>
        </div>

        <!-- Right controls -->
        <div class="flex items-center gap-2">

          <!-- Language toggle -->
          <div class="flex rounded-md overflow-hidden border border-gray-200 text-xs">
            <button
              @click="changeLocale('de')"
              :class="locale === 'de' ? 'bg-brandRed text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'"
              class="px-2.5 py-1 transition-colors"
            >DE</button>
            <button
              @click="changeLocale('en')"
              :class="locale === 'en' ? 'bg-brandRed text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'"
              class="px-2.5 py-1 transition-colors border-l border-gray-200"
            >EN</button>
          </div>

          <!-- User menu -->
          <div class="relative user-menu-root">
            <button
              @click="userMenuOpen = !userMenuOpen"
              class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 transition-colors text-gray-700"
            >
              <div class="w-7 h-7 rounded-full bg-brandRed text-white flex items-center justify-center text-xs font-semibold">
                {{ userInitial }}
              </div>
              <span class="text-sm text-gray-700 max-w-24 truncate">{{ userName }}</span>
              <ChevronDown
                :size="14"
                class="text-gray-400 transition-transform duration-150"
                :class="userMenuOpen ? 'rotate-180' : ''"
              />
            </button>

            <!-- Dropdown -->
            <Transition name="dropdown">
              <div
                v-if="userMenuOpen"
                class="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50"
              >
                <RouterLink
                  to="/user"
                  @click="userMenuOpen = false"
                  class="flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User :size="15" class="text-slate-400" />
                  Profil
                </RouterLink>
                <div class="my-1 border-t border-slate-100" />
                <button
                  @click="logout(); userMenuOpen = false"
                  class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut :size="15" />
                  Abmelden
                </button>
              </div>
            </Transition>
          </div>

        </div>
      </header>

      <!-- Main content -->
      <main
        class="flex-1 overflow-y-auto px-8 pt-6 pb-8"
        :class="isMeshBgActive ? 'mesh-gradient-bg' : 'bg-bgSoft'"
      >
        <slot />
      </main>

    </div>
  </div>
</template>

<style scoped>
/* Helle Sidebar: Das ScholarStack-Logo ist rot auf dunkel gezeichnet — auf
   rotem Grund verschwinden Symbol und roter Teil des Schriftzugs. Oben bleibt
   deshalb reines Weiß, wo das Logo sitzt; nach unten läuft die Fläche in einen
   Rotschleier, damit die Sidebar nicht als leeres Blatt wirkt. */
.sidebar-bg {
  background: linear-gradient(180deg, #ffffff 0%, #fdf5f5 45%, #f9e7e8 100%);
  border-right: 1px solid #f2dcdd;
}

/* Die Chrome (Sidebar + Header) bleibt hell und ruhig. Rot ist dadurch ein
   Akzent mit Bedeutung — aktiver Menüpunkt, Hero, Aktionen — statt Tapete.
   Zwei großflächige Rottöne übereinander (Header + Hero) haben vorher um
   Aufmerksamkeit konkurriert und das Logo optisch abgeschnitten. */
.header-bg {
  background: linear-gradient(90deg, #ffffff 0%, #fffafa 50%, #fdeff0 100%);
}

/* Statt einer grauen Trennlinie eine rote Akzentkante, die nach rechts
   ausläuft — gibt der Kopfzeile eine Richtung und bindet sie an die Marke. */
.header-bg::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, #E10210 0%, rgba(225, 2, 16, 0.35) 38%, rgba(225, 2, 16, 0) 78%);
}

/* Nav link base */
.nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 12px 13px 18px;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 500;
  color: rgba(38, 30, 30, 0.7);
  transition: background-color 150ms, color 150ms;
  text-decoration: none;
}

.nav-link:hover {
  background: linear-gradient(90deg, rgba(225, 2, 16, 0.08) 0%, rgba(225, 2, 16, 0.02) 100%);
  color: rgba(38, 30, 30, 0.95);
}

/* Der aktive Eintrag verläuft nach rechts ins Nichts, statt als harter Block
   zu stehen — zusammen mit dem Balken links entsteht eine Leserichtung. */
.nav-link-active {
  background: linear-gradient(90deg, rgba(225, 2, 16, 0.16) 0%, rgba(225, 2, 16, 0.03) 100%);
  color: #B00410;
  font-weight: 600;
}

/* Collapsed: center icons */
.nav-link-collapsed {
  padding: 13px;
  justify-content: center;
}

/* Left indicator bar */
.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 4px;
  height: 62%;
  background: linear-gradient(180deg, #F01122 0%, #8A0109 100%);
  border-radius: 0 3px 3px 0;
  transition: transform 150ms ease;
}

.nav-link-active .nav-indicator {
  transform: translateY(-50%) scaleY(1);
}

/* Tooltip on collapsed state */
.nav-tooltip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background: #2b2222;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 6px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 100ms ease;
  z-index: 100;
}

.nav-link:hover .nav-tooltip {
  opacity: 1;
}

/* Mesh background */
.mesh-gradient-bg {
  background-color: #fdf9f9;
  background-image:
    radial-gradient(at 0% 0%, rgba(225, 2, 16, 0.10) 0px, transparent 45%),
    radial-gradient(at 100% 0%, rgba(228, 140, 42, 0.08) 0px, transparent 42%),
    radial-gradient(at 100% 100%, rgba(225, 2, 16, 0.13) 0px, transparent 52%),
    radial-gradient(at 18% 92%, rgba(107, 1, 6, 0.07) 0px, transparent 48%);
}

/* Logo text fade */
.fade-text-enter-active {
  transition: opacity 150ms ease 100ms, transform 150ms ease 100ms;
}
.fade-text-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
}

/* Logo sizes for expanded / collapsed sidebar */
.logo-full {
  height: 96px;
  margin-top: -24px;
  margin-left: -8px;
  max-width: none;
}

/* Sidebar toggle appearance. Sitzt nur in der eingeklappten Sidebar — die
   Schaltfläche im Header bringt ihre eigenen Klassen mit. */
.sidebar-toggle-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(38, 30, 30, 0.65);
  transition: background-color 150ms;
}
.sidebar-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Header title centered in viewport */
.header-title {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  height: 4rem; /* matches h-16 */
  display: flex;
  align-items: center;
  z-index: 70;
  pointer-events: none;
}
.header-title span {
  pointer-events: none;
}

/* When collapsed, center the toggle so it doesn't overlap the first nav icon */
.w-16 > .px-2 > .sidebar-toggle-btn,
.w-16 > .px-2 > .sidebar-toggle-btn > * {
  margin-left: auto;
  margin-right: auto;
  display: block;
}

/* Hide native scrollbar when sidebar is collapsed (class w-16 applied on aside) */
.sidebar-bg.w-16 nav {
  /* Firefox */
  scrollbar-width: none;
  /* IE 10+ */
  -ms-overflow-style: none;
}
.sidebar-bg.w-16 nav::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* Sidebar scroll controls placed at bottom when expanded */

.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
