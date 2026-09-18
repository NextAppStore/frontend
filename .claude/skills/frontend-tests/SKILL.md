---
name: frontend-tests
description: Tests für das Click-n-Deploy-Frontend schreiben, ergänzen und aktuell halten. Nutzen, wenn eine View/Komponente/Store/Composable neu ist oder geändert wurde, wenn Tests nach einem UI- oder i18n-Refactor gebrochen sind, wenn abgeschaltete describe.skip-Suites reaktiviert werden sollen, oder wenn Coverage-Lücken geschlossen werden. Kennt beide Testformen des Repos, das Mocking-Playbook, die Selektor-Regeln und den aktuellen Testbestand.
argument-hint: "[write <Datei> | extend <Spec> | revive <Spec> | check]"
---

# Frontend-Tests

Vitest + `@vue/test-utils` + `happy-dom`. Ziel dieses Skills: Tests, die eine Änderung am UI
**überleben** — denn genau daran sind hier schon drei Suites gestorben.

```
/frontend-tests write src/composables/useDeploymentStream.ts   # neuer Test
/frontend-tests extend tests/unit/views/AppsView.spec.ts        # bestehenden ergänzen
/frontend-tests revive DashboardView                            # geskippte Suite reaktivieren
/frontend-tests check                                           # Bestand + Lücken melden
```

---

## 1. Stand (Referenz — beim Ändern mitpflegen)

```
18 Dateien · 104 bestanden · 26 geskippt (130)
Statements/Lines 63,43 %   Branches 58,68 %   Functions 31,98 % (119/372)
```

Untergrenzen in `vitest.config.ts`: lines/statements 60, branches 55, functions 30 —
`npm run test:coverage` scheitert, wenn die Abdeckung darunter fällt.

| Schicht | Dateien | getestet |
|---|---|---|
| Views | 20 | 15 Specs — davon 3 ganz + 1 halb abgeschaltet |
| Stores | 6 | 1 (`app.store`) |
| Composables | 9 | 0 |
| Components | 20 | 0 direkt |
| API-Module | 10 | 0 (richtig so — werden gemockt) |
| Utils | 3 | 1 (`http-error`) |

Ohne Spec: `AdminAppsView` (echte Lücke, 21 KB Admin-Workflow), `LoginView`, `CallbackView`,
`ForbiddenView`, `DeploymentsView` (Router-Outlet-Hülle, braucht keinen).

Abgeschaltet per `describe.skip`: `DashboardView` (5), `DeploymentsListView` (7),
`SettingsOpenStackView` (9), erster Block in `DeploymentDetailView` (5).

---

## 2. Zwei Testformen — wähle bewusst

### A) Reiner Unit-Test — bevorzugt, wo immer möglich

Für Composables, Stores, Utils, Router-Guards. **Kein `mount()`, kein DOM, keine Selektoren.**
Diese Tests brechen bei keinem UI-Refactor.

Ort: `src/<bereich>/__tests__/<name>.test.ts`. Testnamen **englisch**
(Muster: `utils/__tests__/http-error.test.ts`, `stores/__tests__/app.store.test.ts`).

```ts
import { describe, it, expect } from 'vitest'
import { extractErrorMessage } from '@/utils/http-error'

describe('extractErrorMessage', () => {
  it('returns a string detail verbatim', () => {
    expect(extractErrorMessage({ response: { data: { detail: 'Boom' } } })).toBe('Boom')
  })

  it('prefers reason over message when both present', () => {
    const err = { response: { data: { detail: { reason: 'r', message: 'm' } } } }
    expect(extractErrorMessage(err)).toBe('r')
  })
})
```

Store-Variante mit echtem Pinia, nur die API gemockt:

```ts
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/app.api', () => ({ appApi: { list: vi.fn(() => Promise.resolve({ data: [] })) } }))

beforeEach(() => { setActivePinia(createPinia()) })

it('fetchApps handles errors', async () => {
  const { appApi } = await import('@/api/app.api')
  vi.mocked(appApi.list).mockRejectedValueOnce({ response: { data: { detail: 'Server error' } } })

  const store = useAppStore()
  await store.fetchApps()

  expect(store.error).toBe('Server error')
  expect(store.isLoading).toBe(false)
})
```

### B) View-Test mit `mount()` — nur für UI-Verhalten

Ort: `tests/unit/views/<Name>View.spec.ts`. Testnamen **deutsch** (so ist der Bestand).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import CoursesView from '@/views/CoursesView.vue'

// --- 1. Mocks & Setup ---
const mockPush = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockPush }) }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, v?: any) => v ? `${k} ${JSON.stringify(v)}` : k })
}))

const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess })
}))

// ``ref``, nicht ``{ value: … }`` — sonst greift das Template-Auto-Unwrap nicht
// und der Wert ist im Template immer truthy.
const mockIsStaff = ref(true)
vi.mock('@/composables/useRole', () => ({ useRole: () => ({ isStaff: mockIsStaff }) }))

// Store über Getter, damit der Testfall den Wert VOR dem Mount setzen kann.
let mockCourses: any[] = []
const mockFetchCourses = vi.fn()
vi.mock('@/stores/course.store', () => ({
  useCourseStore: () => ({
    get courses() { return mockCourses },
    fetchCourses: mockFetchCourses,
  })
}))

// --- 2. Tests ---
describe('CoursesView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCourses = []
    mockIsStaff.value = true
    mockFetchCourses.mockResolvedValue(undefined)
  })

  const mountComponent = () => mount(CoursesView, {
    global: {
      mocks: { $t: (k: string, v?: any) => v ? `${k} ${JSON.stringify(v)}` : k },
      stubs: {
        BaseButton: { template: '<button><slot /></button>' },
        Card: { template: '<div><slot /></div>' },
      }
    }
  })

  it('zeigt den Empty-State, wenn keine Kurse existieren', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('CoursesView.noCourses')
  })
})
```

---

### Was diese Tests NICHT abdecken

Beide Formen laufen gegen `happy-dom` mit gemockten Stores — kein echter Browser, kein echtes
Backend. Sie können grün sein, während die App im Betrieb kaputt ist. Bei **großen**
UI-Änderungen gehört deshalb eine Sichtprüfung mit Playwright dazu (AGENTS.md, Schritt 6b).

Das ist eine Ergänzung, kein Ersatz: Eine bestandene Sichtprüfung erspart dir keinen einzigen
`.spec.ts`. Umgekehrt findet sie Dinge, die kein Unit-Test sehen kann — fehlende Mounts,
kaputte Routen, Konsolenfehler, einen Ablauf, der in Schritt drei hängen bleibt.

## 3. Selektoren — der wichtigste Abschnitt

Hieran sind die drei abgeschalteten Suites gestorben. Halte dich streng an die Rangfolge:

| Rang | Selektor | Beispiel |
|---|---|---|
| 1 | `data-testid` | `wrapper.find('[data-testid="btn-next"]')` |
| 2 | Zugängliches Attribut | `wrapper.find('button[title="CoursesView.deleteTitle"]')`, `[aria-label=…]` |
| 3 | Komponente | `wrapper.findComponent(Shield)` |
| 4 | Textinhalt | `wrapper.findAll('button').find(b => b.text().includes('…'))` |

**Verboten:** Position. Kein `findAll('input')[1]`, kein `buttons[buttons.length - 1]`,
kein `wrapper.vm as any`. In `AddAppsView.spec.ts` stehen dazu bereits zwei Korrektur-
kommentare der Sorte *„Repo-URL ist nun Index 1, da Textarea die Description hält"* —
das ist die Fragilität, live beobachtet.

### `data-testid` ergänzen ist erlaubt und erwünscht

`NewDeploymentConfigView.vue` macht es vor — die einzige View mit stabilen Test-Hooks:

```html
data-testid="deployment-name"
data-testid="btn-next"   data-testid="btn-back"
data-testid="student-search"
:data-testid="`student-${student.keycloak_id}`"
:data-testid="`remove-${student.keycloak_id}`"
```

Konvention: `data-testid` (nicht `data-test`), kebab-case, semantisch. Buttons mit Präfix
`btn-`, Listeneinträge mit Entitäts-ID im Namen. Wenn du für einen Test einen stabilen Anker
brauchst, **füge ihn der View hinzu** statt über Position zu selektieren. Das ist die eine
Code-Änderung, die dieser Skill ausdrücklich vornehmen darf.

---

## 4. Was geprüft wird

Assertions laufen gegen **i18n-Keys**, nie gegen deutsche Texte:

```ts
expect(wrapper.text()).toContain('CoursesView.noCourses')        // ✅
expect(mockToastError).toHaveBeenCalledWith('CoursesView.toasts.loadError')  // ✅
expect(wrapper.text()).toContain('Keine Kurse vorhanden')        // ❌ bricht bei jeder Textänderung
```

Pflichtabdeckung je View:

1. Ladezustand
2. Leerzustand
3. Daten rendern
4. Navigation (`expect(mockPush).toHaveBeenCalledWith(…)`)
5. Rollen-Sichtbarkeit (Button sichtbar/unsichtbar je `useRole`-Mock)
6. Je Aktion: Erfolgspfad **und** Fehlerpfad, jeweils mit erwartetem Toast

Bei Store-Aktionen zusätzlich: `isLoading` zurück auf `false`, `error` gesetzt bzw. `null`.
Bei API-Aufrufen: `toHaveBeenCalledWith(<vollständiges Payload-Objekt>)` — nicht nur
`toHaveBeenCalled()`. Das Payload ist der Vertrag zum Backend.

---

## 5. Ergänzen vor Neuanlegen

Existiert schon eine Spec für die Datei, **kommt der neue Fall dort hinein** — keine zweite
Datei. Vorgehen:

1. Spec ganz lesen, Mock-Block am Kopf verstehen.
2. Prüfen, ob die benötigten Mocks schon da sind. Fehlt einer, oben ergänzen — nicht lokal im
   Test neu mocken.
3. Neuen Zustand in `beforeEach` zurücksetzen, sonst leckt er in Nachbartests.
4. Test in den passenden nummerierten Abschnitt einsortieren (`// --- 3. Rechteverwaltung ---`).
   Die Gliederung ist Bestand, halte sie.
5. Danach **die ganze Datei** laufen lassen, nicht nur den neuen Test:
   `npm run test -- tests/unit/views/AppsView.spec.ts`

---

## 6. Modus `revive` — geskippte Suite reaktivieren

Die drei abgeschalteten Suites sind der beste Aufwand-Nutzen im Repo: 21 Tests sind
geschrieben, sie brauchen nur neue Anker. Vorgehen:

1. **TODO lesen.** Jede Suite hat einen begründenden Kommentar, was den Bruch verursacht hat
   (z.B. *„main hat die Liste auf PageHeader + EntityListState + Card umgebaut"*).
2. **Mocks gegen die Realität prüfen.** Zeigen sie auf Dateien, die es noch gibt?
   Bekannte Leichen: `@/composables/usePermissions` (→ `useRole`) in `CoursesView.spec.ts`,
   Stub `BackCard` (→ `Card`) in `DeploymentsListView.spec.ts`.
3. **`describe.skip` → `describe`**, laufen lassen, Fehler einzeln abarbeiten.
4. **Beim Reparieren auf Rang-1-Selektoren umstellen** — `data-testid` in der View ergänzen.
   Sonst stirbt die Suite beim nächsten Refactor erneut. Das ist der eigentliche Fix.
5. TODO-Kommentar entfernen.
6. Coverage- und Bestandszahlen in §1 und in `frontend-dev` aktualisieren.

Wenn eine Suite inhaltlich veraltet ist (die View kann das gar nicht mehr): Test löschen statt
skippen, und im PR begründen. Ein dauerhaft geskippter Test ist schlechter als keiner — er
täuscht Abdeckung vor.

---

## 7. Coverage richtig lesen

```bash
npm run test:coverage
start coverage/index.html
```

| Zeile | Lesart |
|---|---|
| `src/types` 0 % | **Ignorieren.** Typen verschwinden beim Kompilieren. |
| `src/i18n/locales` 100 % | **Ignorieren.** Reine Datenobjekte, gelten als abgedeckt, sobald importiert. |
| `src/api` 0 % Funktionen | **Erwartet.** API-Module werden gemockt; das sind dünne Wrapper ohne Logik. |
| `src/components` 97 % | **Trügerisch.** Nebenprodukt der View-Tests, es gibt keine Komponententests. |
| `Functions 31,98 %` | **Die ehrlichste Zahl.** Statements sind durch Template-Markup und Locales aufgebläht. |

Ziel ist nicht die Prozentzahl, sondern: *Welche Verzweigung könnte still brechen?*
Statements ohne Branches sind billige Punkte ohne Sicherheit.

---

## 8. Lohnendste Lücken (Stand §1)

In dieser Reihenfolge, weil es Logik **ohne UI** ist — Tests, die kein Refactor bricht:

1. `composables/useDeploymentStream.ts` — `parseFrame()` (SSE-Frames → Events) und
   `handleEvent()` sind reine Funktionen: String rein, Objekt raus. Dazu der Reconnect-Backoff
   (`1s → 2s → 4s`, Deckel `30s`) und die Regel „bei 4xx kein Reconnect".
2. `router/index.ts` → `requireWizardStep()` — reine Funktion, gibt `true` oder ein
   Redirect-Ziel zurück. Ein Test je Feld (`appId` fehlt → `/apps`, `name` leer →
   `deployment.config`, `studentIds` leer → `deployment.config`).
3. `stores/deployment.store.ts` → `submitDraft()` — Multi-Image-Packer-Erkennung, das
   Verwerfen leerer Werte (damit der HCL-Default gewinnt), die Team-Fallback-Aufteilung.
   Hier macht ein stiller Fehler ein Deployment kaputt.
4. `composables/useOpenStackResourceCache.ts` — Cache-Treffer, Modus-Mismatch, Invalidierung.
5. `AdminAppsView` — die einzige größere View ganz ohne Spec.

---

## 9. Anti-Muster mit Fundstelle

| Anti-Muster | Wo | Stattdessen |
|---|---|---|
| Selektion über Index | `AddAppsView.spec.ts` (4×) | `data-testid` |
| `wrapper.vm as any` zum Auslösen von Logik | `CoursesView.spec.ts` | über das DOM auslösen |
| Mock auf nicht mehr existierendes Modul | `usePermissions` in `CoursesView.spec.ts` | `useRole` |
| Stub für gelöschte Komponente | `BackCard` in `DeploymentsListView.spec.ts` | `Card` |
| `{ value: … }` statt `ref()` bei Template-Werten | — (im Bestand kommentiert) | `ref()` |
| Assertion gegen deutschen Text | verstreut | i18n-Key |
| Verwaiste Snapshot-Datei | `src/__snapshots__/HelpView.spec.ts.snap` | löschen, gehört zu `tests/unit/views/` |
| `describe.skip` als Dauerzustand | 4 Blöcke | reparieren oder löschen |

---

## 10. Befehle

```bash
npm run test                                          # alle, einmal
npm run test:watch                                    # beim Entwickeln
npm run test:coverage                                 # + coverage/index.html, prüft die Schwellen
npm run test -- tests/unit/views/AppsView.spec.ts     # eine Datei
npm run test -- -t "Empty-State"                      # nach it()-Name filtern
npm run type-check                                    # vue-tsc -b --noEmit
npm run verify                                        # type-check && test
```

Es gibt **kein** `npm run test:unit` und **kein** `npm run lint` — die README behauptet das
fälschlich. Im Container: `make shell-frontend` aus `deployment/`.

**Ein neues `.skip` oder `.only` fängt keine Automatik ab.** Ein übersehenes `.only` schaltet
still alle übrigen Tests der Datei aus und die Suite bleibt trotzdem grün — prüfe vor dem
Commit selbst, dass keines übrig geblieben ist.

---

## 11. Fertig, wenn

- [ ] `npm run test` grün, **kein neues `describe.skip`/`it.skip`**
- [ ] kein positionsbasierter Selektor, kein `wrapper.vm`-Zugriff auf Logik
- [ ] Assertions gegen i18n-Keys, nicht gegen Texte
- [ ] je Aktion Erfolgs- **und** Fehlerpfad, inklusive erwartetem Toast
- [ ] neuer Zustand in `beforeEach` zurückgesetzt
- [ ] neue `data-testid` semantisch benannt und in der View ergänzt
- [ ] Zahlen in §1 nachgezogen, wenn sich der Bestand geändert hat
- [ ] Commit als `test: …` bzw. `test(<bereich>): …`
