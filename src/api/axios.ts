import axios, { type AxiosError } from 'axios'
import { useKeycloak } from '@/composables/useKeycloak'
import { useLtiSession, getActiveAccessToken } from '@/composables/useLtiSession'
import { currentLocale } from '@/i18n/locale'
import { env } from '@/env'

const api = axios.create({
  baseURL: env.API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token from the active session (LTI first, then Keycloak) automatically added to requests.
//
// Hier hängt außerdem die im UI gewählte Sprache als ``Accept-Language`` dran,
// damit das Backend weiß, in welcher Sprache es antworten soll — Fehlertexte
// und alles andere, was dort erzeugt wird. Der Browser schickt den Header von
// sich aus bereits mit (in seiner langen Form, z.B. ``de-DE,de;q=0.9,…``); die
// explizite Zuweisung überschreibt ihn bewusst, weil die Auswahl im Umschalter
// Vorrang vor der Browser-Einstellung hat.
//
// Der SSE-Stream in ``composables/useDeploymentStream.ts`` läuft über ``fetch``
// statt über diese Instanz — der Header muss dort separat gesetzt werden.
api.interceptors.request.use(
  async (config) => {
    const token = await getActiveAccessToken()

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    config.headers['Accept-Language'] = currentLocale()
    return config
  },
  (error) => Promise.reject(error)
)

// Global error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // 401: Not authenticated -> Try to refresh, then redirect to login
    if (error.response?.status === 401) {
      const ltiSession = useLtiSession()

      if (ltiSession.isAuthenticated.value) {
        // LTI sessions have no refresh path — a 401 means the token
        // expired or was rejected, and the only way back in is a
        // fresh launch from Moodle. Redirecting to Keycloak here
        // would be wrong (this user has no Keycloak account
        // expectation), so just drop the stale session.
        ltiSession.logout()
        localStorage.removeItem('user')
      } else {
        const keycloak = useKeycloak()

        // Try to ensure valid token (silent refresh)
        const hasValidToken = await keycloak.ensureValidToken()

        if (!hasValidToken) {
          // Clear any stored data
          localStorage.removeItem('user')

          // Redirect to login if not already there
          if (window.location.pathname !== '/login') {
            const returnUrl = window.location.pathname
            await keycloak.login(returnUrl)
          }
        }
      }
    }
    
    // 403: Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data)
    }
    
    return Promise.reject(error)
  }
)

export default api
