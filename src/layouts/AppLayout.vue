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

import logo from '@/assets/Six7-white-withoutBackground.png'

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

const sidebarStyle = computed(() => isDark.value
  ? { background: 'linear-gradient(180deg, #0D1520 0%, #0A1018 60%, #080E16 100%)' }
  : { background: 'linear-gradient(180deg, var(--color-primary) 0%, var(--color-secondary-dark) 100%)' }
)

const headerStyle = computed(() => isDark.value
  ? { background: 'linear-gradient(90deg, #0D1520 0%, #0A1018 60%, #080E16 100%)' }
  : { background: 'var(--color-primary)' }
)

const meshStyle = computed(() => {
  if (!isMeshBgActive.value) return {}
  if (isDark.value) {
    return {
      backgroundColor: 'var(--color-surface-page)',
      backgroundImage: [
        'radial-gradient(at top left, rgba(232, 25, 44, 0.35) 0px, transparent 50%)',
        'radial-gradient(at top center, rgba(200, 16, 32, 0.20) 0px, transparent 45%)',
        'radial-gradient(at bottom right, rgba(30, 18, 20, 0) 0px, transparent 50%)',
        'radial-gradient(at center, rgba(232, 25, 44, 0.08) 0px, transparent 65%)',
      ].join(', '),
    }
  }
  return {
    backgroundColor: 'var(--color-surface-page)',
    backgroundImage: [
      'radial-gradient(at top left, rgba(217, 43, 58, 0.10) 0px, transparent 50%)',
      'radial-gradient(at bottom right, rgba(217, 43, 58, 0.12) 0px, transparent 55%)',
      'radial-gradient(at top right, rgba(255, 240, 240, 0.8) 0px, transparent 45%)',
      'radial-gradient(at bottom left, rgba(255, 77, 94, 0.06) 0px, transparent 50%)',
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

      <!-- Logo area -->
      <div class="h-16 flex items-center border-b border-white/10 px-3" style="overflow: visible;">
        <RouterLink to="/" class="block" style="height: 48px; width: 100%; overflow: visible;">
          <img :src="logo" alt="SIX7 Click'n Deploy" style="position: relative; z-index: 30; height: 96px; margin-top: -24px; margin-left: -8px; max-width: none;" />
        </RouterLink>
      </div>

      <!-- Sidebar toggle inside navigation zone (shown only when collapsed) -->
      <div v-if="sidebarCollapsed" class="px-2 py-2 border-b border-white/5">
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
      <header class="h-16 flex items-center justify-between px-6 flex-shrink-0 border-b border-white/10 relative" :style="headerStyle">

        <!-- Left: toggle (title centered separately) -->
        <div class="flex items-center gap-3">
          <button
            v-if="!sidebarCollapsed"
            @click="sidebarCollapsed = true"
            class="text-white/60 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
            aria-label="Close sidebar"
          >
            <PanelLeftClose :size="20" />
          </button>
        </div>

        <!-- Centered title (always horizontally centered in viewport) -->
        <div class="header-title">
          <span class="text-white/90 text-sm font-medium tracking-wide">{{ pageTitle }}</span>
        </div>

        <!-- Right controls -->
        <div class="flex items-center gap-2">

          <!-- Language toggle -->
          <div class="flex rounded-md overflow-hidden border border-white/20 text-xs">
            <button
              @click="changeLocale('de')"
              :class="locale === 'de' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'"
              class="px-2.5 py-1 transition-colors"
            >DE</button>
            <button
              @click="changeLocale('en')"
              :class="locale === 'en' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'"
              class="px-2.5 py-1 transition-colors border-l border-white/20"
            >EN</button>
          </div>

          <!-- User menu -->
          <div class="relative user-menu-root">
            <button
              @click="userMenuOpen = !userMenuOpen"
              class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors text-white"
            >
              <div class="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
                {{ userInitial }}
              </div>
              <span class="text-sm text-white/90 max-w-24 truncate">{{ userName }}</span>
              <ChevronDown
                :size="14"
                class="text-white/50 transition-transform duration-150"
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
                  Profil
                </RouterLink>
                <div class="my-1 border-t border-card-border" />
                <button
                  @click="logout(); userMenuOpen = false"
                  class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-status-error hover:bg-status-errorLight transition-colors"
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
  color: rgba(255, 255, 255, 0.82);
  transition: background-color 150ms, color 150ms;
  text-decoration: none;
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 1);
}

.nav-link-active {
  background-color: rgba(232, 25, 44, 0.25);
  color: #FFFFFF;
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
  background: var(--color-highlight);
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
  color: rgba(255, 255, 255, 0.65);
  transition: background-color 150ms;
}
.sidebar-toggle-btn:hover {
  background: rgba(255,255,255,0.04);
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
