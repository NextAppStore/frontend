---
name: frontend-dev
description: Verbindliche Konventionen für die Click-n-Deploy Vue-3-SPA. IMMER laden, bevor Code unter frontend/src/ geschrieben oder geändert wird — also bei neuen Views, Komponenten, Stores, API-Clients, Composables, Router-Einträgen, i18n-Texten oder Tests. Enthält die Schichtung (View → Store → API → axios), das Store-Muster mit runRequest, die Pflicht zu de.ts + en.ts, die UI-Bausteine, das Test-Setup mit Vitest sowie die bekannten Altlasten, die nicht kopiert werden dürfen.
---

# Frontend-Entwicklung — Click-n-Deploy

Konventionen für `frontend/` (Vue 3 SPA, AppStore für OpenStack-Lehrumgebungen).
Ziel dieses Skills: neuer Code sieht aus wie der beste bestehende Code — nicht wie der
durchschnittliche.

## Kontext in drei Sätzen

Dozierende und Studierende deployen über diese Oberfläche vorgefertigte Lehrumgebungen
(„Apps" = Git-Repos mit Terraform/Packer) auf OpenStack. Das Frontend spricht
**ausschließlich** mit dem FastAPI-Backend — nie direkt mit OpenStack, RabbitMQ oder der
Keycloak-Admin-API. Authentifiziert wird über Keycloak OIDC (Authorization Code + PKCE);
das Backend validiert die Tokens.

---

## 1. Schichtung — die wichtigste Regel

```
View (.vue)  →  Store (Pinia)  →  API (*.api.ts)  →  api/axios.ts  →  Backend
```

| Schicht | Darf | Darf nicht |
|---|---|---|
| `views/` | Stores lesen, Composables nutzen, UI-Komponenten zusammensetzen | `axios` direkt importieren, `fetch` aufrufen, URLs bauen |
| `stores/` | API-Module aufrufen, Daten halten, Fehler in `error` ablegen | Komponenten importieren, `router.push` aufrufen |
| `api/` | Genau einen HTTP-Call pro Funktion, typisiert | Daten transformieren, Fehler behandeln, Zustand halten |
| `api/axios.ts` | Token anhängen, 401 abfangen | Fachlogik |

Der einzige erlaubte `fetch`-Aufruf im Projekt ist der SSE-Stream in
`composables/useDeploymentStream.ts` — dort, weil `EventSource` keinen
`Authorization`-Header setzen kann. Lege keinen zweiten an.

**Niemals** einen Endpoint erfinden. Existiert er nicht in `backend/app/routers/`, ist das
eine Rückfrage, keine Annahme.

---

## 2. API-Modul — `src/api/<ressource>.api.ts`

Ein exportiertes Objekt, ein Call pro Methode, Rückgabe ist die **rohe axios-Response**
(nicht `.data` — das Auspacken macht der Store).

```ts
import api from './axios'
import type { App, AppCreate, AppQueryParams } from '@/types'

export const appApi = {
  list:    (params?: AppQueryParams) => api.get<App[]>('/apps/', { params }),
  getById: (appId: string)           => api.get<App>(`/apps/${appId}`),
  create:  (data: AppCreate)         => api.post<App>('/apps/', data),
  delete:  (appId: string)           => api.delete(`/apps/${appId}`),
}
```

- Pfadsegmente, die aus Benutzerdaten stammen (Git-Tags!), durch `encodeURIComponent()`.
  Vorbild: `appApi.submitVersion`.
- Admin-Endpoints als verschachteltes `admin: { … }`-Objekt gruppieren (siehe `app.api.ts`).
- Generic am Verb setzen: `api.get<App[]>` — nie `as App[]` hinterher.

---

## 3. Store — `src/stores/<ressource>.store.ts`

Options-API-Stil (`state` / `getters` / `actions`), Name kleingeschrieben als erstes Argument.
Jede Action, die das Netz anfasst, läuft über `runRequest` aus `stores/_request.ts`.

```ts
import { defineStore } from 'pinia'
import { appApi } from '@/api/app.api'
import { runRequest } from './_request'
import type { App, AppCreate } from '@/types'

export const useAppStore = defineStore('app', {
  state: () => ({
    apps: [] as App[],
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchApps() {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError:   (e: string | null) => { this.error = e },
      }
      await runRequest(ctx, async () => {
        const { data } = await appApi.list()
        this.apps = data
      }, 'Failed to fetch apps', { rethrow: false })
    },
  },
})
```

`runRequest` übernimmt: Loading an → Fehler leeren → ausführen →
`err.response?.data?.detail || fallbackMsg` in `error` → Loading aus im `finally`.

**Wann `rethrow`?**

| Fall | Einstellung |
|---|---|
| Laden für die Anzeige (`fetch*`) | `{ rethrow: false }` — die View zeigt `store.error` |
| Schreibende Aktion, bei der die View reagieren muss (Toast, Navigation, Modal schließen) | Default (rethrow), View fängt im `try/catch` |

Jeder Store hat `isLoading` und `error`. Beide Felder heißen genau so — Views verlassen sich darauf.

---

## 4. View — `src/views/<Name>View.vue`

Kanonisches Gerüst (gekürzt aus `DeploymentsListView.vue`, dem besten Vorbild im Repo):

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { Plus, Inbox } from 'lucide-vue-next'

import BaseButton from '@/components/ui/BaseButton.vue'
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EntityListState from '@/components/ui/EntityListState.vue'
import { useDeploymentStore } from '@/stores/deployment.store'
import { formatDateTime } from '@/utils/format'

const store = useDeploymentStore()
onMounted(() => { store.fetchDeployments() })

const sorted = computed(() => [...store.deployments].sort(/* … */))
</script>

<template>
  <div class="p-6">
    <PageHeader :title="$t('DeploymentsView.title')" :subtitle="$t('DeploymentsView.subtitle')">
      <template #actions>
        <BaseButton>{{ $t('DeploymentsView.newDeployment') }}</BaseButton>
      </template>
    </PageHeader>

    <EntityListState
      :is-loading="store.isLoading && store.deployments.length === 0"
      :is-empty="!store.isLoading && store.deployments.length === 0"
      :icon="Inbox"
      :empty-message="$t('DeploymentsView.deploymentsMissingMessage')"
    >
      <template #empty-action>
        <BaseButton>{{ $t('DeploymentsView.newDeployment') }}</BaseButton>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Inhalt -->
      </div>
    </EntityListState>
  </div>
</template>
```

Feste Bestandteile:

- `<script setup lang="ts">`, Composition API. **Keine** Options API, **kein** `any`.
- Äußeres Padding `p-6`, Titel über `PageHeader` (setzt `mb-8` selbst).
- Listenseiten **immer** über `EntityListState` — nie eigene Loading-/Empty-Blöcke.
  Beachte die `isLoading && length === 0`-Bedingung: sonst blinkt beim Nachladen der Spinner.
- UI-Komponenten explizit importieren (keine globale Registrierung).
- Icons ausschließlich `lucide-vue-next`, dekorative mit `aria-hidden="true"`.
- Datumsformatierung über `utils/format.ts` (`formatDate`, `formatDateTime`, `formatBytes`) —
  kein `toLocaleString` von Hand.

---

## 5. Komponenten

| Ort | Regel |
|---|---|
| `components/ui/` | Generisch, **kein** Store-Import, **kein** Typ aus der Domäne. |
| `components/` | Fachlich, darf Stores und `@/types` kennen. |

Bestand `ui/`: `BaseButton` (`primary`\|`yellow`\|`green`\|`red`\|`ghost`), `BaseInput`,
`Card`, `Modal` (Slots `header`/`title`, `body`, `footer`), `PageHeader`, `EntityListState`,
`Badge` (6 Farben), `ScopeBadge`, `AppVersionStatusBadge`, `Toast`.

Fachlich: `CredentialMissingBanner`, `DeploymentProgressBar`, `FileDropZone`,
`InfrastructureVmCard`, `InfrastructureVmDrawer`, `MarkdownEditor`, `MarkdownRenderer`,
`OpenStackResourcePicker`, `RoleGate`, `VariableInput`.

Neue `ui/`-Komponente nur, wenn das Muster **mindestens dreimal** im Code steht, keine
bestehende es mit einer Prop abdeckt und sie ohne Store auskommt. Sonst: bestehende erweitern.

Dokumentation gehört als Block-Kommentar **in** die Komponente und erklärt das *Warum*.
Vorbilder: `EntityListState.vue`, `PageHeader.vue`.

---

## 6. Styling

Farb-Tokens aus `tailwind.config.js` — die einzige Quelle für Markenfarben:

| Token | Wert | Rolle |
|---|---|---|
| `primary` / `primaryDark` / `primaryLight` | `#317153` / `#336A4A` / `#4e7d67` | Marke, Grün |
| `lightGreen` / `ultraLightGreen` | `#b9d4c0ff` / `#dbe5de` | ruhige Flächen |
| `accentYellow` / `lightYellow` | `#E48C2A` / `#fbe6cf` | Primäraktion |
| `accentRed` / `lightRed` | `#e73501` / `#f8d6ccff` | destruktiv |
| `bgSoft` | `#F4F7F5` | Seitenhintergrund |

- Tailwind-Utilities. **Kein** `#hex` im Template, **kein** `bg-[#2E5C46]`, **kein**
  `style="…"`, **kein neuer** `<style>`-Block.
- Spacing, Typo, Radius, Shadow: Tailwind-Defaults. Es gibt dafür bewusst keine eigenen Tokens.
- Statusfarben (`success`/`failed`/`paused`/…) kommen aus der Tailwind-Standardpalette —
  siehe `getStatusColor` in `DeploymentsListView.vue`. Diese Map ist die Referenz; neue
  Statusfarben dort abgleichen, nicht frei erfinden.

---

## 7. i18n — keine Ausnahmen

Jeder sichtbare Text läuft über `t()`. Ein Key muss in **beiden** Dateien stehen:
`src/i18n/locales/de.ts` **und** `src/i18n/locales/en.ts`. Das ist im PR-Template eine Checkbox.

- Im Template: `$t('AppsView.title')`. Im Script: `const { t } = useI18n()`.
- Keys sind nach Komponente benannt: `CoursesView.*`, `DeploymentDetailView.*`,
  `AppVersionStatusBadge.*`.
- Querschnitts-Namespaces, die du wiederverwenden sollst statt zu duplizieren:
  `auth`, `nav`, `action`, `deployment`, `roleLabels`, `router`, `banners`, `vm`,
  `openstackPicker`, `fileDropZone`, `variableInput`, `markdownEditor`, `markdownRenderer`.
- Default-Sprache ist `de`, Fallback `en`, Auswahl liegt in `localStorage` unter `locale`.
- Beide Dateien parallel editieren, in derselben Reihenfolge. Sie sind ~1000 Zeilen lang;
  der Diff bleibt nur lesbar, wenn die Struktur deckungsgleich bleibt.

---

## 8. Auth, Rollen, Router

- Login/Logout ausschließlich über `composables/useKeycloak.ts`. **Nie** ein Passwortformular
  bauen — Keycloak übernimmt das.
- Rollen im UI über `composables/useRole.ts` (`isAdmin`, `isStaff`, `canEditApp(app)`, …).
  Diese Helfer spiegeln `backend/app/utils/capabilities.py` und sind **rein kosmetisch** —
  sie blenden Buttons aus, sie schützen keine Daten. Die echte Prüfung macht das Backend.
- Im Template `<RoleGate admin>`, `<RoleGate staff>` oder `<RoleGate :can="canEditApp(app)">`.
- Route-Meta: `{ layout: 'app' | 'auth' | 'user', requiresAuth, requiresGuest, requiresRole }`.
  Der globale Guard in `router/index.ts` wertet das aus; bei fehlender Rolle Toast + `/forbidden`.
- Die Wizard-Schritte (`/deployment/new/*`) hängen an `requireWizardStep([...])` und prüfen den
  Draft im Store. Neue Schritte dort eintragen, sonst sind sie per Deep-Link erreichbar.

---

## 9. Fehler und Rückmeldung an den Nutzer

- Toasts über `composables/useToast.ts` (`success`/`error`/`warning`/`info`), nicht über den
  Store direkt. Auto-Dismiss nach 5 s.
- Fehlertext aus einer axios-Exception über `utils/http-error.ts` → `extractErrorMessage(err)`.
  Das Backend liefert `detail` mal als String, mal als Objekt (`{ reason, message }`) —
  direkte Interpolation erzeugt sonst `[object Object]`.
- Bei strukturierten 403-Antworten (`{ code, required }`) den `code` für die i18n-Auswahl
  nutzen, nicht den Text matchen.
- Jede asynchrone Aktion hat sichtbar: Loading, Fehler, und einen Weg zurück.

---

## 10. Typen

`src/types/index.ts` spiegelt die Pydantic-Schemas des Backends. Ändert sich dort etwas, wird
hier nachgezogen — die Datei ist die Vertragskopie, kein freier Typraum.

- Feldnamen exakt wie das Backend: `deploymentId`, `userId`, `releaseTag`, `created_at`
  (gemischte Konvention ist gewollt, weil sie das Backend spiegelt).
- `any` ist verboten. Wo eine Backend-Antwort wirklich offen ist, `unknown` + Narrowing.
- Eine Sonderregel: Die Liste `AppVariableOsType` muss synchron bleiben mit
  `backend/app/routers/apps.py` (`_OS_TYPES`), `backend/app/routers/openstack_resources.py`,
  `api/openstack-resources.api.ts` und `components/OpenStackResourcePicker.vue`.
  Vier Stellen. Änderst du eine, änderst du alle.

---

## 11. Konfiguration

Laufzeitwerte kommen über `src/env.ts` — **nie** `import.meta.env` direkt im Code.

Grund: Das Produktions-Image wird einmal gebaut und pro Umgebung konfiguriert.
`docker-entrypoint.sh` rendert `public/env-config.js` per `envsubst` zu `window.__ENV__`;
`env.ts` liest das und fällt auf `import.meta.env` plus Default zurück. Hardcodierte URLs
brechen genau dieses Verfahren.

---

## 12. Tests — Vitest

Ort: `tests/unit/views/<Name>View.spec.ts`. Umgebung `happy-dom`, Alias `@` → `src`.

Etabliertes Muster (siehe `CoursesView.spec.ts`):

```ts
// i18n so mocken, dass der Key zurückkommt — Assertions prüfen dann Keys, keine Texte
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, v?: any) => v ? `${k} ${JSON.stringify(v)}` : k })
}))

// Store mit Gettern mocken, damit der Testfall den Wert vor dem Mount setzen kann
vi.mock('@/stores/course.store', () => ({
  useCourseStore: () => ({
    get courses() { return mockCourses },
    fetchCourses: mockFetchCourses,
  })
}))

// UI-Komponenten stubben — der Test prüft die View, nicht BaseButton
const wrapper = mount(CoursesView, {
  global: {
    mocks: { $t: (k: string) => k },
    stubs: { Card: { /* … */ }, BaseButton: { template: '<button><slot /></button>' } },
  }
})
```

Was getestet wird: Lade- und Leerzustand, Rendern der Daten, Navigation, Rollen-Sichtbarkeit,
Erfolgs- und Fehlerpfad je Aktion (inkl. erwarteter Toast). Assertions gegen **i18n-Keys**,
nicht gegen deutsche Strings — sonst bricht der Test bei jeder Textänderung.

Werte, die pro Fall variieren, als `ref` mocken, nicht als `{ value: … }` — sonst greift das
Template-Auto-Unwrap nicht und der Wert ist immer truthy.

---

## 13. Altlasten — nicht als Vorbild nehmen

Diese Stellen existieren, sind aber **kein** Muster für neuen Code:

| Stelle | Problem | Stattdessen |
|---|---|---|
| ~104 rohe `<button class="…">` gegen 42 `<BaseButton>` | u.a. `DeploymentDetailView`, `MarkdownEditor`, `OpenStackResourcePicker` | `BaseButton` |
| 33 hartkodierte Hex-Werte in 5 Dateien | `Toast` (11), `DashboardView` (8), `AppLayout` (7), `AppsDetailView` (4), `AddAppsView` (3) | Tokens |
| 5 `<style scoped>`-Blöcke | `AppLayout`, `DashboardView`, `Toast`, `Modal`, `DeploymentProgressBar` | Tailwind-Utilities |
| `deployment.store.ts` mit manuellem `try/catch` | älter als `runRequest` | `runRequest` wie in `app.store.ts` |
| `import { useAuthStore }` am **Dateiende** von `app.store.ts` | Workaround gegen Zirkelimport | Imports oben; Zirkel anders auflösen |
| `BaseInput` mit `focus:ring-blue-500` | Blau ist nicht in der Palette | `primary` |
| `ScopeBadge` mit „Pro Team"/„Pro User" im Template | kein `t()` | i18n-Key |
| `CoursesView.spec.ts` mockt `@/composables/usePermissions` | existiert nicht mehr, ersetzt durch `useRole` | `useRole` mocken |
| `Modal` akzeptiert `#header` **und** `#title` | historisch doppelt | in neuem Code `#title` |

Wenn du eine dieser Dateien ohnehin anfasst: den betroffenen Abschnitt mit aufräumen.
Kein eigener Refactor-PR, ohne dass das Team es will.

> Die Zahlen sind ein Stand von September 2026 und werden von nichts automatisch geprüft.
> Nimm sie als Größenordnung, nicht als Wahrheit — im Zweifel selbst nachzählen.

---

## 14. Fertig ist eine Änderung erst, wenn

- [ ] `npm run verify` grün — Type-Check und Tests in einem Lauf
- [ ] `npm run build` läuft durch
- [ ] geänderte View hat ihre Spec aktualisiert
- [ ] i18n-Key in `de.ts` **und** `en.ts` — `tests/unit/i18n-parity.spec.ts` prüft das
- [ ] kein `any`, kein `#hex`, kein neuer `<style>`-Block, kein direkter `axios`/`fetch`-Aufruf
      — **das prüft keine Automatik**, du bist selbst dafür verantwortlich
- [ ] Loading-, Leer- und Fehlerzustand sind abgedeckt
- [ ] Kommentar erklärt das *Warum*, wo die Lösung nicht offensichtlich ist

Alle Befehle laufen im Container. Aus `deployment/`:

```bash
make shell-frontend        # Shell im Container, dort npm run …
make dev-logs-frontend     # Logs
make dev-restart-frontend  # Neustart
```

Commits folgen Conventional Commits (`feat(deployment): …`, `fix(ci): …`, `docs: …`),
Branches `<type>/<kebab-case>`. PRs gehen immer nach `main`, brauchen ein Approval.
