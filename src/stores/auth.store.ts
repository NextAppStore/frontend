import { defineStore } from 'pinia'
import { AuthService } from '@/services/auth.service'
import { useKeycloak } from '@/composables/useKeycloak'
import { useLtiSession } from '@/composables/useLtiSession'
import { useOpenStackCredentialsStore } from '@/stores/openstack-credentials.store'
import { invalidateAll as invalidateOpenStackCache } from '@/composables/useOpenStackResourceCache'
import type { User, UserRole } from '@/types'

const keycloak = useKeycloak()
const ltiSession = useLtiSession()

// In-flight promises to dedupe concurrent calls. The router guard,
// App mount, and view mounts can all trigger initialize/fetchMe at the
// same time on a cold load — without this, each call hits the backend
// (token validation, /users/me, credential fetch) once per trigger.
let initializePromise: Promise<void> | null = null
let fetchMePromise: Promise<void> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    isAuthenticated: () => ltiSession.isAuthenticated.value || keycloak.isAuthenticated.value,
    
    userRole: (state): UserRole | null => state.user?.role || null,
    
    isStudent: (state) => state.user?.role === 'student',
    isTeacher: (state) => state.user?.role === 'teacher',
    isAdmin: (state) => state.user?.role === 'admin',
    
    isTeacherOrAdmin: (state) => 
      state.user?.role === 'teacher' || state.user?.role === 'admin',
    
    userId: (state) => state.user?.userId || null,
  },

  actions: {
    async initialize() {
      if (initializePromise) return initializePromise
      initializePromise = (async () => {
        this.isLoading = true
        try {
          // An LTI session (restored from sessionStorage on module
          // load, see useLtiSession.ts) never needs Keycloak's
          // getUser()/signinSilent() flow — skip it entirely so a
          // reload inside Moodle's iframe doesn't try to talk to
          // Keycloak for a user who has no account there.
          if (!ltiSession.isAuthenticated.value) {
            await keycloak.initialize()
          }

          if (ltiSession.isAuthenticated.value || keycloak.isAuthenticated.value) {
            const storedUser = AuthService.getStoredUser()
            if (storedUser) {
              this.user = storedUser
            }

            this.fetchMe().catch(() => {})
          }
        } catch (error) {
          console.error('Auth initialization failed:', error)
        } finally {
          this.isLoading = false
        }
      })()
      return initializePromise
    },

    async login(returnUrl?: string) {
      this.error = null
      try {
        await keycloak.login(returnUrl)
      } catch (err: any) {
        this.error = err.message || 'Login failed'
        throw err
      }
    },

    async handleCallback() {
      /**
       * Finalize the Authorization Code + PKCE flow.
       * Resolves return URL from Keycloak, then loads the current user from backend.
       */
      this.isLoading = true
      this.error = null
      
      try {
        const returnUrl = await keycloak.handleCallback()
        
        await this.fetchMe()
        
        return returnUrl
      } catch (err: any) {
        this.error = err.message || 'Callback handling failed'
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async fetchMe() {
      if (fetchMePromise) return fetchMePromise
      fetchMePromise = (async () => {
        try {
          this.user = await AuthService.fetchMe()
          useOpenStackCredentialsStore().fetch().catch(() => {})
        } catch (error) {
          console.error('Failed to fetch user:', error)
          this.user = null
          throw error
        } finally {
          fetchMePromise = null
        }
      })()
      return fetchMePromise
    },

    async logout() {
      AuthService.clearStoredUser()
      this.user = null
      this.error = null
      initializePromise = null
      fetchMePromise = null
      useOpenStackCredentialsStore().reset()
      // Clear the OpenStack resource display cache — the next user has their own
      // credentials and a different project, so old resource lists must not persist.
      invalidateOpenStackCache()

      // An LTI session has no Keycloak account to sign out of —
      // redirecting to Keycloak's logout page would be wrong. Just
      // drop the local token; the router guard sends them to /login.
      if (ltiSession.isAuthenticated.value) {
        ltiSession.logout()
        return
      }

      try {
        await keycloak.logout()
      } catch (error) {
        console.error('Logout failed:', error)
      }
    },

    hasRole(role: UserRole): boolean {
      return this.user?.role === role
    },

    hasAnyRole(...roles: UserRole[]): boolean {
      if (!this.user?.role) return false
      return roles.includes(this.user.role as UserRole)
    },
  },
})
