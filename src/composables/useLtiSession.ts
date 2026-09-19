import { ref, computed, readonly } from 'vue'
import { useKeycloak } from '@/composables/useKeycloak'

// ----------------------------------------------------------------
// LTI SESSION
// ----------------------------------------------------------------
// Parallel, much simpler counterpart to useKeycloak.ts for users who
// arrive via a Moodle LTI 1.3 launch. The backend mints a short-lived
// bearer JWT after verifying the launch (see app/routers/auth_lti.py)
// and redirects here with it in a URL fragment — there is no OIDC
// flow, no SSO cookie, and no silent-renew: once the token expires,
// the only way back in is a fresh launch from Moodle.
//
// Kept in sessionStorage (not localStorage) so a reload inside
// Moodle's iframe doesn't immediately drop the session, while still
// clearing on tab close — matching the "don't persist tokens longer
// than necessary" rationale in useKeycloak.ts, just with a session
// that has no refresh path to fall back on.
const STORAGE_KEY = 'lti_session_token'

const token = ref<string | null>(null)
const expiresAt = ref<number | null>(null)

function decodeExpiry(jwt: string): number | null {
  try {
    const encodedPayload = jwt.split('.')[1]
    if (!encodedPayload) return null
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function isExpired(): boolean {
  return !token.value || !expiresAt.value || Date.now() >= expiresAt.value
}

function setToken(jwt: string) {
  token.value = jwt
  expiresAt.value = decodeExpiry(jwt)
  sessionStorage.setItem(STORAGE_KEY, jwt)
}

function clear() {
  token.value = null
  expiresAt.value = null
  sessionStorage.removeItem(STORAGE_KEY)
}

// Restore on module load (e.g. after an in-tab reload inside the
// Moodle iframe) so navigating within the app doesn't require a
// fresh launch every time.
const stored = sessionStorage.getItem(STORAGE_KEY)
if (stored) {
  setToken(stored)
  if (isExpired()) clear()
}

const isAuthenticated = computed(() => !isExpired())

export function useLtiSession() {
  /**
   * Read a `token=` value out of the current URL fragment (set by the
   * backend's /lti/launch redirect), store it, and strip it from the
   * URL so it doesn't linger in browser history.
   */
  function consumeTokenFromUrlFragment(): boolean {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    const params = new URLSearchParams(hash)
    const jwt = params.get('token')
    if (!jwt) return false

    setToken(jwt)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return !isExpired()
  }

  async function getAccessToken(): Promise<string | null> {
    return isExpired() ? null : token.value
  }

  function logout() {
    clear()
  }

  return {
    isAuthenticated: readonly(isAuthenticated),
    consumeTokenFromUrlFragment,
    getAccessToken,
    logout,
  }
}

/**
 * Resolve the bearer token for the currently active session, LTI first.
 * A user who launched via Moodle never has a Keycloak session, and a
 * Keycloak user never has an LTI one, so checking LTI first is safe —
 * there's no case where both are simultaneously valid for the same tab.
 */
export async function getActiveAccessToken(): Promise<string | null> {
  if (isAuthenticated.value) return useLtiSession().getAccessToken()
  return useKeycloak().getAccessToken()
}
