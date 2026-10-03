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
import { useColorScheme } from '@/composables/useColorScheme'

import logo from '@/assets/ScholarStackLogo.png'
import logoDark from '@/assets/ScholarStackLogo-Hell.png'
import logoMark from '@/assets/ScholarStackLogo(S).png'

const { locale, t } = useI18n()
const authStore = useAuthStore()
const { logout } = useAuth()
const { isAdmin, isStaff } = useRole()
const route = useRoute()
const { scheme } = useColorScheme()

const userName = computed(() => authStore.user?.username || 'User')
const userInitial = computed(() => (authStore.user?.username ?? 'U').charAt(0).toUpperCase())

const isMeshBgActive = computed(() => route.name === 'dashboard' || route.path === '/')

const isDark = computed(() => {
  void scheme.value
  return document.documentElement.classList.contains('dark')
})

const sidebarStyle = computed(() => ({
  background: 'var(--color-surface-sidebar-grad)',
  borderRight: '1px solid var(--color-sidebar-border)',
}))

const headerStyle = computed(() => ({
  background: 'var(--color-surface-header)',
}))

const meshStyle = computed(() => {
  if (!isMeshBgActive.value) return {}
  if (isDark.value) {
    return {
      backgroundColor: 'var(--color-surface-page)',
      backgroundImage: [
        'radial-gradient(at top left, var(--color-mesh-spot-1) 0px, transparent 50%)',
        'radial-gradient(at top center, var(--color-mesh-spot-2) 0px, transparent 45%)',
        'radial-gradient(at bottom right, var(--color-mesh-spot-3) 0px, transparent 50%)',
        'radial-gradient(at center, var(--color-mesh-spot-4) 0px, transparent 65%)',
      ].join(', '),
    }
  }
  return {
    backgroundColor: 'var(--color-surface-page)',
    backgroundImage: [
      'radial-gradient(at top left, var(--color-mesh-spot-1) 0px, transparent 50%)',
      'radial-gradient(at bottom right, var(--color-mesh-spot-2) 0px, transparent 55%)',
      'radial-gradient(at top right, var(--color-mesh-spot-3) 0px, transparent 45%)',
      'radial-gradient(at bottom left, var(--color-mesh-spot-4) 0px, transparent 50%)',
    ].join(', '),
  }
})

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
  <div class="h-screen flex bg-surface-page overflow-x-visible">

    <!-- Sidebar -->
    <aside
      class="flex flex-col h-full flex-shrink-0 transition-colors duration-200"
      :class="sidebarCollapsed ? 'w-16' : 'w-60'"
      :style="sidebarStyle"
    >

      <!-- Logo area. Eingeklappt (64 px) passt der Schriftzug nicht — deshalb
           wird auf die freigestellte "S"-Variante umgeschaltet. -->
      <div class="flex items-center px-3" :class="sidebarCollapsed ? 'h-16' : 'h-24'" style="overflow: visible;">
        <RouterLink
          to="/"
          class="flex items-center justify-center"
          :style="{ height: sidebarCollapsed ? '40px' : '84px', width: '100%', overflow: 'visible' }"
        >
          <img
            :src="sidebarCollapsed ? logoMark : (isDark ? logoDark : logo)"
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
      <div v-if="sidebarCollapsed" class="px-2 py-2 border-b" style="border-color: var(--color-sidebar-border)">
        <button
          @click="sidebarCollapsed = false"
          class="sidebar-toggle-btn"
          :aria-label="$t('nav.openSidebar')"
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
          <component :is="item.icon" :size="21" class="flex-shrink-0 opacity-80 group-[.nav-link-active]:opacity-100" />
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
      <header class="h-16 flex items-center justify-between px-6 flex-shrink-0 relative header-border" :style="headerStyle">

        <!-- Left: toggle (title centered separately) -->
        <div class="flex items-center gap-3">
          <button
            v-if="!sidebarCollapsed"
            @click="sidebarCollapsed = true"
            class="nav-toggle-btn"
            :aria-label="$t('nav.closeSidebar')"
          >
            <PanelLeftClose :size="20" />
          </button>
        </div>

        <!-- Centered title (always horizontally centered in viewport) -->
        <div class="header-title">
          <span class="header-title-text text-sm font-semibold tracking-wide">{{ pageTitle }}</span>
        </div>

        <!-- Right controls -->
        <div class="flex items-center gap-2">

          <!-- Language toggle -->
          <div class="flex rounded-md overflow-hidden border border-nav-border text-xs">
            <button
              @click="changeLocale('de')"
              :class="locale === 'de' ? 'lang-active' : 'lang-inactive'"
              class="px-2.5 py-1 transition-colors"
            >DE</button>
            <button
              @click="changeLocale('en')"
              :class="locale === 'en' ? 'lang-active' : 'lang-inactive'"
              class="px-2.5 py-1 transition-colors border-l border-nav-border"
            >EN</button>
          </div>

          <!-- User menu -->
          <div class="relative user-menu-root">
            <button
              @click="userMenuOpen = !userMenuOpen"
              class="user-menu-btn flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <div class="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-content-inverse">
                {{ userInitial }}
              </div>
              <span class="text-sm max-w-24 truncate user-menu-name">{{ userName }}</span>
              <ChevronDown
                :size="14"
                class="user-menu-chevron transition-transform duration-150"
                :class="userMenuOpen ? 'rotate-180' : ''"
              />
            </button>

            <!-- Dropdown -->
            <Transition name="dropdown">
              <div
                v-if="userMenuOpen"
                class="absolute right-0 top-full mt-1.5 w-44 bg-surface-card rounded-xl shadow-lg border border-card-border py-1 z-50"
              >
                <RouterLink
                  to="/user"
                  @click="userMenuOpen = false"
                  class="flex items-center gap-2.5 px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover transition-colors"
                >
                  <User :size="15" class="text-content-disabled" />
                  {{ $t('nav.profile') }}
                </RouterLink>
                <div class="my-1 border-t border-card-border" />
                <button
                  @click="logout(); userMenuOpen = false"
                  class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-status-error hover:bg-status-errorLight transition-colors"
                >
                  <LogOut :size="15" />
                  {{ $t('nav.logout') }}
                </button>
              </div>
            </Transition>
          </div>

        </div>
      </header>

      <!-- Main content -->
      <main
        class="flex-1 overflow-y-auto px-8 pt-6 pb-8"
        :class="isMeshBgActive ? '' : 'bg-surface-page'"
        :style="isMeshBgActive ? meshStyle : {}"
      >
        <slot />
      </main>

    </div>
  </div>
</template>

<style scoped>
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
  color: var(--color-nav-text);
  transition: background-color 150ms, color 150ms;
  text-decoration: none;
}

.nav-link:hover {
  background-color: var(--color-nav-bg-hover);
  color: var(--color-nav-text-hover);
}

.nav-link-active {
  background-color: var(--color-nav-bg-active);
  color: var(--color-nav-text-active);
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
  width: 3px;
  height: 60%;
  background: var(--color-nav-indicator);
  border-radius: 0 2px 2px 0;
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
  background: var(--color-surface-sidebar);
  color: var(--color-content-inverse);
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

/* Sidebar toggle appearance */
.sidebar-toggle-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--color-nav-text);
  transition: background-color 150ms;
}
.sidebar-toggle-btn:hover {
  background: var(--color-nav-bg-hover);
}

/* Header toggle button */
.nav-toggle-btn {
  color: var(--color-nav-text);
  padding: 4px;
  border-radius: 6px;
  background: transparent;
  border: none;
  transition: color 150ms, background-color 150ms;
}
.nav-toggle-btn:hover {
  color: var(--color-nav-text-hover);
  background: var(--color-nav-bg-hover);
}

/* Header title text */
.header-title-text {
  color: var(--color-nav-text-hover);
}

/* Header bottom border (red gradient accent) */
.header-border::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--color-header-border);
}

/* Language toggle */
.border-nav-border {
  border-color: var(--color-sidebar-border);
}
.lang-active {
  background: var(--color-primary);
  color: var(--color-content-inverse);
}
.lang-inactive {
  color: var(--color-nav-text);
}
.lang-inactive:hover {
  color: var(--color-nav-text-hover);
  background: var(--color-nav-bg-hover);
}

/* User menu button */
.user-menu-btn {
  color: var(--color-nav-text-hover);
}
.user-menu-btn:hover {
  background: var(--color-nav-bg-hover);
}
.user-menu-name {
  color: var(--color-nav-text-hover);
}
.user-menu-chevron {
  color: var(--color-nav-text);
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
