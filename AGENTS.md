# AGENTS.md — Click-n-Deploy Frontend

Betriebsanleitung für autonome Coding-Agents in diesem Repository. Ziel: Eine Aufgabe geht rein,
ein grüner, review-fertiger Pull Request kommt raus — ohne Zwischenfragen.

**Lies zuerst Abschnitt 11 (Entscheidungsbefugnis).** Dort steht, was du allein entscheidest und
die wenigen Fälle, in denen du abbrichst statt zu raten.

---

## 1. Was dieses Projekt ist

Ein AppStore, mit dem Dozierende und Studierende vorgefertigte Lehrumgebungen auf OpenStack
deployen — ohne Cloud-Wissen. Eine „App" ist kein Programm, sondern ein **Deployment-Blueprint**:
ein Git-Repo mit `terraform/` und optional `packer/`, versioniert über Git-Tags.

Studienprojekt der DHBW, 5. Semester. Organisation: **`github.com/NextAppStore`** — dort liegen
alle 14 Repos: sechs für die Plattform, acht für die deploybaren Apps. Die frühere Organisation
hieß `six7-click-n-deploy`; Links darauf in der Doku sind tot.

```
Vue SPA ──Bearer-JWT──> FastAPI ──AMQP──> RabbitMQ ──> Celery-Worker ──> OpenStack
   │                       │                                │
   └─ Keycloak (OIDC)      ├─ PostgreSQL                    ├─ PostgreSQL (tfstate, isoliert)
                           ├─ Redis                          └─ Packer / Terraform / Git
                           └─ SSE zurück ans Frontend
```

### Plattform-Repos

| Repo | Rolle | Stack |
|---|---|---|
| `frontend` | **dieses Repo** — SPA | Vue 3, TypeScript, Vite, Pinia, Tailwind |
| `backend` | REST-API | FastAPI, SQLAlchemy, Alembic, Celery-Producer |
| `worker` | führt Packer/Terraform gegen OpenStack aus | Celery, Python, Terraform, Packer |
| `deployment` | Compose-Stacks, Makefile, Keycloak-Realm, Seed | Docker/Podman, Terraform, Ansible |
| `agentic-harness` | Sandbox für isolierte Verifikation | Python, **nur Docker** |
| `.github` | projektübergreifende Doku (C4, ER, Guides, QS-Beleg) | Markdown |

### App-Repos — die „Apps" des Stores

Jedes ist ein eigenständiges Repo mit `terraform/` und meist `packer/`, das über einen
Git-Tag deployt wird: `template-app` (Vorlage für neue Apps), `Jupyter-Notebook`,
`Online-IDE`, `pgAdmin`, `Ubuntu-App`, `Web-LaTeX`, `Windows-App` (ohne Packer,
cloudbase-init). `DevMoodle` fällt aus dem Muster — ein lokales Moodle-Setup mit
LTI-Mock-Server, kein Deployment-Blueprint.

Du änderst diese Repos nie aus dem Frontend heraus. Sie sind aber die **Referenz dafür, was
das Frontend rendert**: Die `@openstack:`-Marker in ihren `variables.tf` steuern, welches
Widget der Wizard anzeigt. Wenn du am Variablen-Rendering arbeitest, schau dort nach echten
Beispielen — `template-app/terraform/variables.tf` ist die kompakteste Referenz.

**Harte Grenze:** Das Frontend spricht ausschließlich mit dem Backend. Niemals direkt mit
OpenStack, RabbitMQ oder der Keycloak-Admin-API.

---

## 2. Team und Verantwortlichkeiten

| Bereich | Wer |
|---|---|
| **Frontend** (dieses Repo) | Sebastian, Jessie, Wanisa |
| **Backend** (`backend`, `worker`) | Jannis, Michelle, Adrian, Till |
| **App-Template** (`template-app` + App-Repos) | Erik, Fabi |

Was das für dich heißt:

- **Review für einen Frontend-PR** kommt aus dem Frontend-Team — also von einem der drei
  oben, der nicht selbst am PR gearbeitet hat.
- **Fehlt ein Backend-Endpoint** oder verhält er sich anders als erwartet (Abschnitt 11,
  Fall 1): Das ist eine Aufgabe fürs Backend-Team, kein Workaround im Store. Benenne sie im
  PR-Text, statt sie zu umgehen.
- **Marker-Fragen** (`@openstack:`-Syntax, neue Ressourcentypen, was eine App deklarieren
  muss) gehen ans App-Template-Team — dort entsteht der Vertrag, den der Wizard rendert.

<!-- AUSFÜLLEN: GitHub-Handles der Reviewer und der Kanal für Blocker fehlen noch. -->

Aus dem Repo belegt und verbindlich:

- Jeder PR nach `main` braucht **mindestens ein Approval** eines anderen Teammitglieds.
  Erzwungen per Ruleset („protect main"): PR-Pflicht, kein Force-Push, kein Löschen von `main`.
- Direktes Pushen auf `main` ist unterbunden.
- Die QS-Maßnahmen sind **Prüfungsleistung** (`.github/docs/QS-Massnahmen-Beleg.md`). Zahlen zu
  Tests, Coverage und Pipeline können dort zitiert werden — halte sie ehrlich, beschönige nichts.

---

## 3. Umgebung

**Projekt-Konvention ist der Container.** Das Makefile erkennt die Runtime selbst
(`DOCKER := $(shell command -v docker || command -v podman)`) — **Docker und Podman
funktionieren beide.** „Docker läuft nicht" ist also kein Grund aufzugeben, bevor du nicht
auch Podman geprüft hast. Alle Befehle aus dem Nachbarverzeichnis `deployment/`:

```bash
make dev-up                 # ganzer Stack (11 Container; erster Start 1–3 min)
make shell-frontend         # Shell im Frontend-Container
make dev-logs-frontend      # Logs
make urls                   # alle Dev-URLs
make health                 # Smoke-Test über drei Endpoints
```

**Fallback ganz ohne Container** — für reine Frontend-Arbeit ausreichend und deutlich schneller:

```bash
npm ci                      # einmalig
npm run test
```

Tests, Type-Check und Build laufen vollständig ohne Backend. Nur die App im Browser braucht
den Stack.

**Dritte Option — die Sandbox.** Das Repo `agentic-harness` bietet einen isolierten
Docker-Container für Verifikationsläufe, mit `--ephemeral` gegen eine Kopie statt gegen den
Host. Gedacht für Agent-Loops, bei denen ein fehlgeschlagener Befehl nichts hinterlassen soll:

```bash
python3 agentic-harness/sandbox.py --ephemeral --fast
```

> Drei Einschränkungen, Stand jetzt: `verify.sh` deckt dort **nur das Backend** ab
> (ruff + pytest), nicht das Frontend — dafür bleibt `npm run verify` der Weg. `sandbox.py`
> ruft `docker` fest verdrahtet auf, **Podman funktioniert hier nicht** (anders als beim
> Makefile). Und der Runner erwartet den Ordner unter dem Namen `harness/` — solange er
> `agentic-harness` heißt, schlagen `--fast` und `--full` fehl.

### Node-Versionen sind uneinheitlich — wissen, worauf du läufst

| Wo | Version |
|---|---|
| CI (`typecheck`, `test`, `security`) | **Node 22** |
| `Dockerfile` / `Dockerfile.dev` | **node:20-alpine** |

Verbindlich ist, was die CI tut: **Node 22**. Wenn ein Build lokal im Container grün ist und in
der CI rot (oder umgekehrt), ist die Version der erste Verdacht. Ändere die Versionen nicht
eigenmächtig — das ist ein Fall für Abschnitt 11.

Test-Logins (Passwort für alle: `1234`): `tobias.admin@dhbw.de` (admin),
`michael.eichberg@dhbw.de` (teacher), `luca.baeck@dhbw.de` (student).

---

## 4. Aufgabe aufnehmen

### Herkunft klären

Aufgaben kommen meist aus GitHub-Issues. Wenn eine Issue-Nummer genannt ist:

```bash
gh issue view <nr>                 # falls gh vorhanden
```

Sonst: Beschreibung der Aufgabe wörtlich nehmen. Die Issue-Nummer gehört später in den PR-Text
(`Closes #<nr>` — steht so im PR-Template).

### Zuschnitt prüfen — bevor du anfängst

Ein PR braucht ein menschliches Review. Halte ihn reviewbar:

- **Eine Sache pro PR.** Feature *oder* Refactor *oder* Doku — nicht gemischt.
- Wird es voraussichtlich größer als ~400 geänderte Zeilen Produktivcode, **teile auf** und
  liefere den ersten Teil. Schreib in den PR-Text, was in den Folge-PR gehört.
- Aufräumarbeiten an Altlasten nur in dem Abschnitt, den du ohnehin anfasst. Kein
  Refactor-PR nebenher.

---

## 5. Der Zyklus

Sieben Schritte, keiner optional — auch nicht bei Einzeilern. Dazu zwei Zusätze: **6b** greift
nur bei großen UI-Änderungen, **6c** ist ein Debugging-Werkzeug und nie verpflichtend.

### 1 — Verstehen
Welche Schicht ist betroffen? Welche Views/Stores/Composables? Bei Unsicherheit über einen
Endpoint: **im `backend`-Repo nachsehen** (`backend/app/routers/`), nicht raten.

### 2 — Konventionen laden
Skill `frontend-dev` laden, **bevor** Code entsteht. Enthält die Schichtung
(View → Store → API → axios), das `runRequest`-Muster, die UI-Bausteine und die Altlasten,
die nicht kopiert werden dürfen.

### 3 — Implementieren
Kurzfassung: `<script setup lang="ts">`, kein `any`, Tailwind-Tokens statt Hex, jeder Text über
`t()` in **beiden** Locale-Dateien, kein direkter `axios`/`fetch`-Aufruf aus einer View.

### 4 — Testen
Skill `frontend-tests` laden. Neue Logik bekommt Tests, geänderte Views ihre Spec nachgezogen.
Selektiere über `data-testid`, nie über Position. Assertions gegen i18n-Keys, nicht gegen Texte.

### 5 — Dokumentieren
Skill `frontend-docs` laden. Block-Kommentar in der geänderten Datei zuerst, dann prüfen, ob
README-Abschnitte betroffen sind.

### 6 — Verifizieren
Ein Befehl deckt Type-Check, Konventionen und Tests ab:

```bash
npm run verify              # = type-check && check && test
npm run build               # zusätzlich, wenn du am Build-Pfad warst
```

Einzeln, wenn du eingrenzen willst:

```bash
npm run type-check          # vue-tsc -b --noEmit
npm run check               # Konventions-Gate (siehe unten)
npm run test                # kein neues .skip
npm run test:coverage       # wenn Tests geändert wurden — prüft auch die Schwellen
```

`npm run check` setzt die Regeln durch, die weder TypeScript noch Vitest sehen: hartkodierte
Farben, `<style>`-Blöcke, explizites `any`, HTTP-Aufrufe aus Views, abgeschaltete Tests,
committete `.env`. Es arbeitet **baseline-basiert** (`scripts/conventions-baseline.json`):
Die 148 bekannten Altlasten sind eingefroren und blockieren nicht — nur **neue** Verstöße
lassen es scheitern. Räumst du eine Altlast auf, meldet das Skript den Fortschritt; dann:

```bash
npm run check -- --update   # Baseline schrumpfen und mitcommitten
```

Es gibt **kein** `npm run lint` und **kein** `npm run test:unit` — die README behauptet das
fälschlich. Einen JS-Linter (ESLint) gibt es im Frontend nicht.

### 6b — Im Browser prüfen (nur bei großen UI-Änderungen)

`npm run verify` sagt nichts darüber, ob die Oberfläche tatsächlich funktioniert: Alle Tests
laufen gegen `happy-dom` mit gemockten Stores. Bei **großen** UI-Änderungen klickst du deshalb
mit Playwright durch — bei allem anderen **nicht**.

**Nur bei diesen Auslösern:**

- eine neue View, oder eine bestehende in Layout/Struktur umgebaut
- ein Schritt des Deployment-Wizards oder dessen Navigationsfluss
- eine `ui/`-Komponente, die an mehreren Stellen eingebunden ist
  (`BaseButton`, `Modal`, `EntityListState`, `PageHeader`, `Card`)
- eine Route, ein Router-Guard oder ein Layout
- etwas, das erst im Betrieb sichtbar wird: Live-Log-Stream, Datei-Upload, Rollen-Sichtbarkeit

**Ausdrücklich nicht bei:** Store-, Composable- oder Util-Logik · reinem Text-/i18n-Tausch ·
Tailwind-Feinheiten · Kommentaren und Doku · Tests · Typen. Dafür genügt `npm run verify`.
Im Zweifel: nicht klicken.

**Voraussetzung.** Playwright braucht die laufende App. Prüfe erst, ob `http://localhost:5173`
antwortet. Tut es das nicht, **fahre den Stack nicht extra hoch** — überspringe den Schritt
und schreib eine Zeile in den PR-Text: „visuell nicht geprüft, App lief nicht". Ehrlich
übersprungen ist besser als fünfzehn Minuten Container-Start für eine Sichtprüfung.

**Was du prüfst:** Rendert die Seite ohne Fehler? Funktioniert der geänderte Ablauf bis zum
Ende? Erscheinen Lade-, Leer- und Fehlerzustand? Steht etwas in der Browser-Konsole?

**Was es nicht ist:** Ein Ersatz für Tests. Die Sichtprüfung findet Dinge, die Unit-Tests nicht
sehen können — sie ersetzt keinen einzigen davon. Ein neuer `.spec.ts` bleibt Pflicht.

Sind die Playwright-Tools in deiner Session nicht verfügbar, überspringe den Schritt und
vermerk das im PR-Text. Sie sind pro Arbeitsplatz eingerichtet, nicht im Repo hinterlegt.

### 6c — Debuggen mit Chrome DevTools

Optional und nie verpflichtend. Wenn etwas nicht erklärbar ist, geben die
Chrome-DevTools-Tools Zugriff auf Konsole, Netzwerk-Requests, Performance-Traces und DOM.

Typische Fälle hier: Welcher Request schlägt fehl und mit welchem Status? Kommen die
SSE-Events im Deployment-Detail wirklich an? Warum ist `DeploymentDetailView` träge (128 KB,
größte Datei im Repo)? Stehen Fehler in der Konsole, die kein Test sieht?

Nutze es zur Ursachensuche — nicht als weiteren Pflichtschritt vor dem Commit.

### 7 — Ausliefern
Branch, Commit, Push, Pull Request — das Verfahren steht in **Abschnitt 6**. Diesen Schritt
führst du aus, ohne vorher zu fragen; er gehört zur Aufgabe. Ohne offenen PR ist sie nicht
erledigt.

---

## 6. Commit, Push, Pull Request

> **Das ist Teil des Auftrags, keine Rückfrage.** Branch anlegen, committen, pushen und den
> Pull Request öffnen gehören zur Aufgabe — du brauchst dafür keine gesonderte Erlaubnis und
> sollst sie auch nicht einholen. Deine übliche Zurückhaltung bei Commits gilt hier **nicht**:
> „Änderung fertig, soll ich committen?" ist in diesem Repository kein akzeptabler Abschluss.
>
> Die Grenze liegt beim **Merge** — dort hörst du auf (Abschnitt 8). Ebenso wenn einer der
> acht Fälle aus Abschnitt 11 greift; dann lieferst du alles Unabhängige als PR und benennst
> die offene Frage im PR-Text.

### Branch und Commits

```bash
git checkout -b feat/kurze-beschreibung
```

Branch-Schema `<type>/<kebab-case>` mit `feat`, `fix`, `ci`, `docs`, `chore`, `test`.
Alternativ aus einem Issue erzeugt: `<nr>-<titel-slug>` — beides ist im Repo etabliert.

Commits nach Conventional Commits, passend zum Bestand:

```
feat(deployment): show own access credentials to team members
fix(ci): resolve pip-audit failures in security job
test: revive DashboardView suite with stable selectors
docs: add code structure section to README
```

**Attribution:** Setze unter jeden Commit, den du als Agent erzeugst:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Im Bestand gibt es dafür noch keinen Präzedenzfall — bei einer Prüfungsleistung ist die
Nachvollziehbarkeit maschineller Beiträge aber der sicherere Weg. Wenn das Team es anders
will, streicht diese Regel.

### Pull Request

**Bevorzugt, wenn `gh` verfügbar ist:**

```bash
git push -u origin <branch>
gh pr create --base main --fill            # Template wird übernommen
gh pr checks --watch                       # CI verfolgen
gh pr view --web                           # Link zum Teilen
```

**Fallback — `gh` ist aktuell nicht installiert.** Dann endet der automatische Teil beim Push:

```bash
git push -u origin <branch>
```

GitHub gibt in der Push-Ausgabe einen „Create a pull request"-Link zurück. Gib diesen Link
aus und nenne den fertig formulierten PR-Text (Beschreibung, `Closes #<nr>`, angekreuzte
Template-Checkboxen), damit der Mensch ihn nur noch einfügen muss. Sag klar, dass hier ein
manueller Schritt nötig ist — tu nicht so, als wäre der PR offen.

> Damit der Zyklus wirklich ohne Menschen läuft: `gh` installieren
> (`winget install GitHub.cli`) und einmalig `gh auth login`. Danach greift der obere Pfad.

### PR-Text

Das Template (`.github/pull_request_template.md`) füllst du vollständig aus:
Beschreibung, `Closes #<nr>`, Art der Änderung ankreuzen, Testnachweis, Checkliste —
**inklusive der i18n-Checkbox**, wenn Texte betroffen waren.

---

## 7. CI: Gates und Fehler-Triage

```
typecheck ───┐
conventions ─┤
test ────────┼──→ build ──→ image-scan ──→ push ──→ trigger-staging
security ────┘                                (nur main)      (deployment-Repo)
   └─ test ──→ coverage (GitHub Pages + Badge)

secret-scan (Gitleaks)   — eigener Workflow, läuft parallel auf jedem PR
```

| Job | Gate | Lokal vorwegnehmen |
|---|---|---|
| 📐 Type Check | blockierend | `npm run type-check` |
| 📏 Conventions | blockierend | `npm run check` |
| 🧪 Test | blockierend | `npm run test:coverage` (inkl. Coverage-Schwellen) |
| 🔒 Security | blockierend | `npm audit --audit-level=high --omit=dev` |
| 🔒 Gitleaks | blockierend | — (scannt die ganze Historie) |
| 🐳 Build | blockierend | `npm run build`, `docker build -f Dockerfile .` |
| 🔒 Image Scan | **nicht blockierend** (`continue-on-error`, ausdrücklich temporär) | — |
| 📦 Push / 🚀 Staging | nur auf `main` nach Merge | — |

Die Coverage-Schwellen stehen in `vitest.config.ts` (lines/statements 60, branches 55,
functions 30). Sie liegen knapp unter dem Ist-Stand und sind eine Sperre gegen Erosion,
kein Ziel. Wer aufräumt, zieht sie mit hoch.

### Ist der rote Job deiner?

Prüfe in dieser Reihenfolge, bevor du etwas reparierst:

1. **Reproduziert es lokal?** Wenn ja: deiner. Reparieren.
2. **Betrifft es Dateien, die du nicht angefasst hast?** Dann vermutlich vorbestehend —
   auf `main` gegenprüfen (`gh run list --branch main`), bevor du etwas änderst.
3. **Bekannte Altlasten, die nicht du verursacht hast:**
   - Der Image-Scan steht bewusst auf `continue-on-error` (Commit „make Trivy image-scan gate
     non-blocking (temporary)"). Rot ist dort erwartbar und blockiert nicht.
   - Nach dem Wechsel der Organisation zu `NextAppStore` können Coverage-Badge,
     GitHub-Pages-URL und der Staging-Trigger auf die alte Org zeigen.
4. **Ein Security-Finding ohne verfügbaren Fix** ist kein Fall für einen Workaround, sondern
   für Abschnitt 11.

**Niemals** ein Gate abschwächen, einen Test skippen oder `continue-on-error` setzen, um grün
zu werden.

---

## 8. Wo der Zyklus endet

Ein Agent bringt die Änderung bis zum **grünen, offenen PR** — eigenständig, ohne vorher um
Erlaubnis zum Committen zu bitten. Der Merge ist der menschliche Schritt: nicht aus
technischer Not, sondern weil das Zwei-Augen-Prinzip Teil der dokumentierten QS-Maßnahmen und
damit Prüfungsgegenstand ist.

- ✅ Branch, Implementierung, Tests, Doku, Commit, Push, PR, eigene rote CI-Jobs reparieren
- ❌ Nicht mergen, `main` nicht direkt beschreiben, kein Force-Push
- ❌ Keine Branch-Protection und keine CI-Gates anfassen

---

## 9. Logs, Traces, Metriken

**Es gibt kein APM.** Kein OpenTelemetry, kein Sentry, keine Prometheus-Metriken. Erfinde keine.

### Logs

```bash
make dev-logs-frontend      # nginx / vite
make dev-logs-backend       # FastAPI + Celery-Event-Listener
make dev-logs-worker        # Packer-/Terraform-Ausgabe
make dev-logs-keycloak
```

Im Browser: DevTools-Konsole. Das Frontend loggt Auth-Fehler über `console.error`
(`api/axios.ts`, `stores/auth.store.ts`).

### Traces

Kein verteiltes Tracing. Der einzige durchgehende Ablauf ist die **Deployment-Kette**, und die
ist über IDs korrelierbar:

```
deploymentId → Task.taskId → Task.celeryTaskId → Celery-Events → SSE-Stream → UI
```

- Live: `GET /deployments/{id}/stream` — Events `snapshot`, `progress`, `log`, `succeeded`,
  `failed`, `overflow`. Im Frontend: `composables/useDeploymentStream.ts`.
- Nachträglich: Spalten `Task.logs`, `Task.tf_state`, `Task.outputs` in der Backend-DB.
- Queue: RabbitMQ-UI auf Port 15672. DB: pgAdmin auf Port 5050.

Die Phasennamen im `progress`-Event kommen aus `worker/app/tasks.py` und sind dort als
Konstanten definiert — `STARTING`, `OPENSTACK_SETUP`, `GIT_CLONE`, `CREDS_MATERIALISE`,
`PACKER_INIT/VALIDATE/BUILD`, `TERRAFORM_INIT/PLAN/APPLY`, `OUTPUTS_AND_CLEANUP`, dazu
`TERRAFORM_DESTROY`, `SERVER_STOP`, `SERVER_START`, `CLEANUP`. Die Sequenz ist **dynamisch**:
Der Worker stellt sie je nach Task-Typ und Anzahl der Packer-Templates zusammen und schickt
sie als `phase_names` mit. Deshalb darf die UI keine feste Phasenliste annehmen — sie nimmt
`phase_names`, wenn vorhanden.

Bei einem Deployment-Problem ist die `taskId` der Schlüssel — damit findest du Worker-Logs,
DB-Row und SSE-Verlauf.

### Metriken

| Metrik | Wo |
|---|---|
| Test-Coverage | `npm run test:coverage` → `coverage/index.html`; in CI Badge + GitHub Pages |
| Testbestand | Ausgabezeile von `npm run test` |
| Pipeline-Historie | Actions-Tab, oder `gh run list` |
| Security-Findings | GitHub Security Tab (Trivy SARIF: `fs` und `image`) |
| OpenStack-Quota | `GET /quotas/overview`, im UI unter Settings |

**Coverage richtig lesen:** `src/types` (0 %) und `src/i18n/locales` (100 %) sind bedeutungslos
— Typen verschwinden beim Kompilieren, Locales sind reine Daten. `src/api` bei 0 % Funktionen
ist korrekt, weil API-Module gemockt werden. Aussagekräftig ist **Functions**, nicht Statements.

---

## 10. Secrets

Zwei Netze fangen hier: Gitleaks scannt bei jedem PR die **gesamte Historie**
(`.github/workflows/secret-scan.yml`, blockierend), und `npm run check` schlägt Alarm, sobald
eine `.env` verfolgt wird. Beide greifen aber erst, wenn der Fehler schon passiert ist — und
ein Secret, das einmal in der Historie steht, muss rotiert werden, nicht nur gelöscht. Die
eigentliche Kontrolle bist du.

- `.env` und `.env.*` sind gitignored. **Halte es so** — niemals entfernen, niemals eine
  `.env` committen.
- Niemals Tokens, Passwörter, `clouds.yaml`-Inhalte oder OpenStack-Credentials in Commit-Texte,
  PR-Beschreibungen, Testdaten oder Logausgaben schreiben.
- Keine URLs oder Schlüssel hartkodieren — Laufzeitwerte kommen über `src/env.ts`
  (`window.__ENV__`, per `envsubst` aus `public/env-config.js` befüllt).
- Die Seed-Logins (`1234`) sind bewusst öffentliche Dev-Daten und dürfen in Tests stehen.
  Alles andere nicht.
- Fällt dir ein bereits committetes Secret auf: **nicht stillschweigend entfernen** — melden.
  Ein Secret in der Historie muss rotiert werden, nicht nur gelöscht.

---

## 11. Entscheidungsbefugnis

### Entscheide allein

- Benennung, Dateiaufteilung, Komponentenzuschnitt innerhalb der Konventionen
- Welche Tests nötig sind und wie sie geschnitten werden
- `data-testid` in eine View einfügen, um einen stabilen Test-Anker zu bekommen
- i18n-Keys anlegen (immer `de.ts` **und** `en.ts`)
- Kommentare und README-Abschnitte nachziehen, die deine Änderung falsch gemacht hat
- Eine Altlast in dem Abschnitt aufräumen, den du ohnehin anfasst
- Dependency-Patch-Updates, die einen Security-Job grün machen

### Halte an und frag

1. **Ein Backend-Endpoint fehlt oder verhält sich anders als erwartet.** Das Frontend erfindet
   keine API und baut keinen Workaround im Store.
2. **Die Änderung berührt ein anderes Repo** (siehe Abschnitt 12).
3. **Sicherheits- oder Auth-Verhalten ändert sich** (Token-Handling, Rollen-Guards,
   Credential-Anzeige). `useRole()` ist rein kosmetisch — die echte Prüfung macht das Backend.
4. **Ein CI-Gate oder eine Node-Version müsste geändert werden**, um grün zu werden.
5. **Ein Security-Finding hat keinen Fix** und bräuchte eine dokumentierte Ausnahme.
6. **Ein bestehender Test soll gelöscht oder geskippt werden.**
7. **Migrationen, Keycloak-Realm, Infrastruktur** — gehört nicht ins Frontend-Repo.
8. **Ein Secret liegt in der Historie.**

Bei allen acht: Arbeite alles ab, was **nicht** davon abhängt, liefere das als PR, und benenne
die offene Frage präzise im PR-Text. Nicht blockieren, wo du weiterarbeiten kannst.

---

## 12. Wenn die Änderung ein anderes Repo berührt

Zwei Repos heißt: zwei Branches, zwei PRs, zwei Reviews — und eine Reihenfolge. **Backend
zuerst mergen, dann Frontend**, sonst zeigt die SPA auf einen Endpoint, den es noch nicht gibt.
Ist auch der Worker beteiligt, gilt: **Worker → Backend → Frontend.**

### Der häufigste Fall: die Vier-Stellen-Regel

Die Liste der unterstützten OpenStack-Ressourcentypen muss an vier Stellen identisch sein:

```
frontend/src/types/index.ts                  → AppVariableOsType
frontend/src/api/openstack-resources.api.ts  → OsResourceType
frontend/src/components/OpenStackResourcePicker.vue
backend/app/routers/apps.py                  → _OS_TYPES
```

Änderst du eine, änderst du alle vier. Im Code steht der Hinweis an jeder Stelle.

### Arbeiten im `backend`-Repo

Alle Befehle aus `deployment/` — dort liegt das Makefile:

```bash
make test-backend                              # pytest im Container
make lint-backend                              # ruff check
make format-backend                            # ruff format
make shell-backend
make migrate-dev                               # Schema auf head
make migration-create MSG="add foo column"     # Autogenerate
```

Backend-CI-Kette: `lint → test-unit → test-integration → coverage`, dazu `security`
(pip-audit `--strict` + Trivy), dann `build → image-scan → push`. Python 3.11, Poetry, Ruff.
Schichtung dort: `routers/` → `crud/` → `models.py`, Fachlogik in `services/`.

### Arbeiten im `worker`-Repo

Der Worker ist das einzige Stück Code, das **echte OpenStack-Ressourcen anfasst** — ein Fehler
dort kostet reale VMs, Volumes und Quota, nicht nur einen roten Test. Änderungen sind deshalb
immer abzustimmen, auch wenn sie klein aussehen.

Für das Frontend ist er trotzdem oft die Antwortquelle: Was am Ende in der UI erscheint,
entsteht in `worker/app/tasks.py`.

| Frage aus dem Frontend | Wo im Worker |
|---|---|
| Welche Phasen zeigt der Stepper? | `_PHASES_*`-Konstanten und `_PhaseTracker` in `tasks.py` |
| Wie sieht ein `progress`/`log`-Event aus? | `utils/logger.py` |
| Wie werden Wizard-Variablen an Terraform übergeben? | `encode_terraform_vars` / `encode_packer_vars` |
| Warum fehlen File-Variablen beim Destroy? | `_strip_file_vars` — Terraform validiert alle Variablen bei jedem Kommando |
| Woher kommen `user_accounts` / `team_vms`? | `collect_terraform_outputs_helper` |

Befehle aus `deployment/`: `make test-worker` gibt es nicht — nutze `make shell-worker` und
dort `poetry run pytest` / `poetry run ruff check`. CI-Kette wie im Backend:
`lint → test-unit → test-integration → coverage`, dazu `security`, dann
`build → image-scan → push`. Der Lint-Job ist dort strenger als im Backend: zusätzlich
`black --check`, `isort --check-only` und `mypy`.

### Die übrigen Repos

- **`deployment`** — Compose, Makefile, Keycloak-Realm, Seed, Staging-Pipeline.
  Infrastruktur, nicht dein Scope.
- **`agentic-harness`** — Sandbox-Runner (siehe Abschnitt 3). Eigenständiges Repo, arbeitet
  auf seinen Geschwistern.
- **`.github`** — projektübergreifende Doku (C4, ER, CI/CD, Appentwickler-Guide, QS-Beleg).
  Fällt dir dort etwas Veraltetes auf: im PR-Text erwähnen, nicht ändern.
- **App-Repos** (`template-app`, `Jupyter-Notebook`, `Online-IDE`, `pgAdmin`, `Ubuntu-App`,
  `Web-LaTeX`, `Windows-App`, `DevMoodle`) — Lesequelle für Marker-Beispiele, nie
  Änderungsziel aus dem Frontend heraus.

---

## 13. Fallen, die schon jemanden gekostet haben

- **Tests, die über Position selektieren, brechen bei jedem UI-Refactor.** Genau daran sind
  drei Suites gestorben (`DashboardView`, `DeploymentsListView`, `SettingsOpenStackView` —
  21 Tests per `describe.skip` abgeschaltet; mit dem halbierten Block in
  `DeploymentDetailView` sind es 26 stillgelegte Tests). Nutze `data-testid`.
- **Assertions gegen deutsche Texte** brechen bei jeder i18n-Änderung. Gegen Keys prüfen.
- **`EntityListState` braucht `isLoading && length === 0`**, sonst blinkt der Spinner beim
  Nachladen.
- **`extractErrorMessage(err)` statt `err.response.data.detail`** — das Backend liefert `detail`
  mal als String, mal als Objekt. Direkte Interpolation ergibt `[object Object]`.
- **`env.ts` statt `import.meta.env`** — das Prod-Image wird einmal gebaut und pro Umgebung
  konfiguriert. Hartkodierte URLs brechen das.
- **Im Test `ref()` statt `{ value: … }`** für Werte, die im Template landen — sonst greift das
  Auto-Unwrap nicht und der Wert ist immer truthy.
- **Diese Doku-Angaben sind aktuell falsch**, nimm sie nicht als Wahrheit: die README nennt
  `npm run lint` und `npm run test:unit` — beide gibt es nicht; das Coverage-Badge zeigt auf
  die alte Organisation `six7-click-n-deploy`; und die Wizard-Reihenfolge im README ist
  vertauscht (echt: `config → teams → variables → summary`).

---

## 14. Skills in diesem Repo

| Skill | Wann |
|---|---|
| `frontend-dev` | vor **jeder** Code-Änderung unter `src/` |
| `frontend-tests` | Tests schreiben, ergänzen, reparieren, geskippte Suiten reaktivieren |
| `frontend-docs` | Doku nachziehen, nach Merges, bei veralteten Angaben |

Sie liegen unter `.claude/skills/` und sind die ausführliche Fassung dessen, was hier
zusammengefasst steht — **bei Widerspruch gewinnt der Skill.**

---

## 15. Definition of Done

- [ ] `npm run verify` grün (Type-Check + Konventionen + Tests)
- [ ] `npm run build` läuft durch
- [ ] bei großer UI-Änderung: im Browser durchgeklickt — oder im PR-Text vermerkt, warum nicht
- [ ] kein neues `describe.skip` / `it.skip`
- [ ] i18n-Keys in `de.ts` **und** `en.ts` — der Paritätstest prüft das
- [ ] kein `any`, kein `#hex`, kein neuer `<style>`-Block, kein direkter `axios`/`fetch`-Aufruf
- [ ] Lade-, Leer- und Fehlerzustand abgedeckt
- [ ] Doku nachgezogen, wo die Änderung sie falsch gemacht hat
- [ ] kein Secret in Code, Commit-Text oder PR-Beschreibung
- [ ] Conventional-Commit mit `Co-Authored-By`, Branch nach Schema
- [ ] PR-Template vollständig, `Closes #<nr>` gesetzt
- [ ] PR offen und grün — **nicht** gemergt
