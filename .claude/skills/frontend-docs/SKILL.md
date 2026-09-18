---
name: frontend-docs
description: Dokumentation des Click-n-Deploy-Frontends schreiben, fortführen und nachziehen. Nutzen, wenn Doku veraltet ist, nach einem Merge oder mehreren Commits die README/Kommentare nachgezogen werden sollen, eine neue Komponente/Store/Composable dokumentiert werden muss, oder wenn geprüft werden soll, ob die Doku noch zum Code passt. Kennt die Doku-Flächen des Repos, den etablierten Kommentarstil und die Zuordnung "geänderte Datei → betroffene Doku".
argument-hint: "[sync <ref> | check | write <Datei>]"
---

# Frontend-Dokumentation

Hält die Doku des `frontend`-Repos aktuell und im etablierten Stil. Die Doku ist hier
**nicht** ein eigener Ordner — sie lebt an fünf Stellen, und jede hat ihre eigene Regel.

```
/frontend-docs sync main..HEAD    # Doku an die Änderungen seit <ref> anpassen
/frontend-docs sync -8            # … an die letzten 8 Commits
/frontend-docs check              # nur prüfen und melden, nichts ändern
/frontend-docs write src/…        # eine einzelne Datei dokumentieren
```

---

## 1. Die fünf Doku-Flächen

| Fläche | Inhalt | Sprache |
|---|---|---|
| `README.md` | Setup-Verweis, Tech-Stack, Code-Struktur, zentrale Mechanismen | **Deutsch** |
| Block-Kommentare im Code | Zweck und *Warum* je Komponente/Store/Composable | **Englisch** |
| Prop- und Inline-Kommentare | Einzelne Props, nicht offensichtliche Template-Stellen | **Englisch** |
| `.github/copilot-instructions.md` | Architektur-Leitplanken für KI-Assistenten | Englisch |
| `.claude/skills/frontend-dev/SKILL.md` | Konventionen inkl. Inventar und Altlast-Zahlen | Deutsch |

Die Sprachtrennung ist Bestand, nicht Zufall: nutzerorientierte Doku deutsch, Code-Kommentare
englisch. Vereinzelt sind deutsche Zeilen in den Code gerutscht — die sind kein Vorbild, aber
auch kein Anlass für einen Aufräum-PR.

---

## 2. Hausstil der Code-Kommentare

Der Stil ist im Repo klar etabliert. Halte ihn, erfinde keinen zweiten.

**Doppelte Backticks für Code-Bezüge.** 391 Vorkommen in 37 Dateien — das ist die
auffälligste Konvention des Projekts:

```ts
/**
 * Bounded ring buffer — older entries fall off the head.
 * ``isLoading`` wins over ``isEmpty`` — see component docs.
 * Callers usually express this as ``!store.isLoading && store.items.length === 0``.
 */
```

**Der Kommentar erklärt das *Warum*, nicht das Was.** Das ist die eigentliche Qualität dieses
Codebestands. Vorbilder, an denen du dich ausrichtest:

- `components/ui/EntityListState.vue` — warum überhaupt eine Komponente („jede Seite hatte
  ihre eigene Variante"), und warum Loading vor Empty gewinnt (sonst blitzt die Empty-CTA auf)
- `components/ui/PageHeader.vue` — warum Slot statt Prop für die Actions
- `composables/useDeploymentStream.ts` — warum `fetch` statt `EventSource` (kein
  `Authorization`-Header möglich)
- `stores/_request.ts` — welche Semantik bewusst beim Aufrufer bleibt

Ein Kommentar wie `// set loading to true` ist schlechter als keiner. Ein Kommentar, der eine
Entscheidung, einen Sonderfall oder eine Reihenfolge-Abhängigkeit festhält, ist Gold.

**Struktur eines Datei-Kopfkommentars:**

```ts
/**
 * <Ein Satz: was das ist.>
 *
 * <Absatz: das Problem, das es löst — oder was es ersetzt.>
 *
 * <Falls nicht offensichtlich: Reihenfolge, Vorrang, Fallstricke.>
 */
```

**Props einzeln kommentieren**, wenn der Name nicht reicht (Muster aus `EntityListState.vue`):

```ts
defineProps<{
  /** Whether the page is currently fetching its first batch of data.
   *  Wins over ``isEmpty`` — see component docs. */
  isLoading?: boolean
}>()
```

**Abschnittstrenner** in längeren `.ts`-Dateien (Muster aus `api/app.api.ts`, `types/index.ts`):

```ts
// ----------------------------------------------------------------
// VERSION APPROVALS (Admin-Seite)
// ----------------------------------------------------------------
```

**Template-Kommentare** nur dort, wo das Markup eine Entscheidung verbirgt — nicht als
Beschriftung offensichtlicher Blöcke.

---

## 3. Was dokumentiert wird — und was nicht

| Dokumentieren | Nicht dokumentieren |
|---|---|
| Warum eine Komponente existiert / was sie ersetzt | Was eine Zeile offensichtlich tut |
| Vorrang- und Reihenfolge-Regeln (`isLoading` vor `isEmpty`) | Getter/Setter ohne Eigenheit |
| Verträge zum Backend (Feldnamen, Statuswerte) | Tailwind-Klassen |
| Absichtliche Abweichungen und ihre Begründung | Typen, die der Typ schon sagt |
| Fallstricke, die jemanden schon Zeit gekostet haben | Auto-generierte Dateien |
| Stellen, die mit anderen synchron bleiben müssen | |

Faustregel: Würde ein neues Teammitglied hier eine falsche Annahme treffen? Dann kommentieren.

---

## 4. Modus `sync` — Doku den Commits nachziehen

Das ist der Hauptzweck. Ablauf in vier Schritten, keiner davon optional.

### Schritt 1 — Umfang bestimmen

```bash
git log --oneline <ref>..HEAD
git diff --stat <ref>...HEAD -- src/
git diff <ref>...HEAD -- src/
```

Ohne Argument: `main..HEAD`, sonst der angegebene Ref oder `-N` für die letzten N Commits.
Merge-Commits überspringen, ihre Inhalte stecken in den Einzelcommits.

### Schritt 2 — Von geänderter Datei auf betroffene Doku schließen

| Geändert wurde | Zu prüfen |
|---|---|
| Datei in `src/views/` neu, gelöscht oder umbenannt | README-Abschnitt `views/`, README-Baum |
| Route in `src/router/index.ts` | README `views/` (Wizard-Reihenfolge!), `frontend-dev` §8 |
| Neue Datei in `src/components/ui/` | README-Baum, `frontend-dev` §5 Inventar |
| `src/api/*.api.ts` oder `src/stores/*.store.ts` neu | README `api/ ↔ stores/`, Kopfkommentar der Datei |
| Neues Composable | README-Tabelle „Zentrale Mechanismen", falls querschnittlich |
| `tailwind.config.js` | `frontend-dev` §6 Token-Tabelle |
| `package.json` (Dependency) | README `Technologie-Stack` |
| `src/types/index.ts` → `AppVariableOsType` | die drei Gegenstellen (siehe `frontend-dev` §10) |
| `src/env.ts`, `docker-entrypoint.sh`, `public/env-config.js` | `frontend-dev` §11 |
| Geänderte Komponentensemantik (Props, Varianten, Vorrang) | Block-Kommentar **in** der Datei zuerst |
| Aufgeräumte Altlast (Button ersetzt, Hex entfernt, `<style>` weg) | Zahlen in `frontend-dev` §13 |

### Schritt 3 — Ändern

- Zuerst den Kommentar **in** der Datei, dann die README. Der Code ist die Wahrheit.
- Nur anfassen, was durch die Commits tatsächlich falsch geworden ist. Kein Umformulieren
  korrekter Absätze — das bläht den Diff und verdeckt die echte Änderung.
- README-Absätze bleiben **einzeilig** (kein manueller Umbruch bei 80 Zeichen). Das ist eine
  bewusste Entscheidung aus Commit `bcc9e5e docs: reflow paragraphs to single line`.
- Neue Begriffe im README in einfacher Sprache erklären — siehe `8662506` und `863cee4
  docs: explain frontend terms in plain language`. Die README richtet sich auch an Leser,
  die Vue nicht kennen: „Store — ein zentraler Datenspeicher, den sich mehrere Seiten teilen".
- Zahlen, Dateilisten und Inventare **nachzählen**, nicht schätzen.

### Schritt 4 — Belegen

Gib am Ende aus:

```markdown
## Doku-Sync — <ref>..HEAD

### Geprüfte Commits
<hash> <subject>   → betraf: <Doku-Fläche oder "keine">

### Geändert
| Datei | Was | Weil (Commit) |
|---|---|---|

### Unverändert, aber geprüft
<Flächen, die betroffen sein könnten, es aber nicht waren>

### Offen / Rückfrage
<Wo der Commit die Absicht nicht erkennen lässt>
```

---

## 5. Modus `check` — nur melden

Gleiche Analyse, aber ohne Schreibzugriff. Zusätzlich diese Dauerprüfungen:

```bash
# Nennt die README Dateien, die es nicht mehr gibt?
rg -o '`[A-Za-z]+(View|Store|Api)?\.(vue|ts)`' README.md

# Stimmt die Wizard-Reihenfolge im README mit dem Router?
rg -n "path: '/deployment/new/|component: NewDeployment" src/router/index.ts

# Stimmen die Altlast-Zahlen im frontend-dev-Skill noch?
rg -c '<button' src --glob '*.vue'
rg -c '<BaseButton' src --glob '*.vue'
rg -n '#[0-9a-fA-F]{6}\b|\[#[0-9a-fA-F]{3,8}\]' src --glob '*.vue'
rg -l '<style' src --glob '*.vue'

# Deckt sich das ui/-Inventar mit dem Verzeichnis?
ls src/components/ui/
```

### Bekannter offener Befund

Die README beschreibt den Deployment-Wizard als
`NewDeploymentConfigView → …VariableView → …GroupsAssignmentView → …SummaryView`.
Der Router in `src/router/index.ts` definiert aber
`config → teams (GroupsAssignmentView) → variables → summary`.
**Variablen und Gruppen sind vertauscht.** Beim nächsten `sync` korrigieren.

---

## 6. Modus `write` — eine Datei dokumentieren

1. Datei ganz lesen, inklusive ihrer Aufrufer (`rg "ComponentName" src`).
2. Prüfen, was der Code *nicht* selbst sagt: Vorrangregeln, Sonderfälle, Backend-Verträge,
   warum die naheliegende Alternative verworfen wurde.
3. Kopfkommentar im Muster aus §2 schreiben, Props einzeln kommentieren, wo nötig.
4. Wenn die Datei querschnittlich ist (Composable, `ui/`-Komponente, neuer Store): prüfen, ob
   die README-Tabelle „Zentrale Mechanismen" oder der Code-Struktur-Baum sie erwähnen sollte.

Nicht raten. Wenn unklar ist, warum etwas so gebaut wurde, frag — ein erfundenes „Warum" ist
schlimmer als eine Lücke, weil es später als Begründung zitiert wird.

---

## 7. Grenzen

- **Keine neue Doku-Fläche anlegen.** Kein `docs/`-Ordner, keine Komponenten-Markdown-Dateien
  neben den `.vue`. Die Doku bleibt in der README und im Code.
- **Kein Sprachwechsel** in bestehenden Dokumenten.
- **Kein Code ändern** im `sync`- und `check`-Modus. Fällt dabei ein Bug auf: melden, nicht
  nebenbei beheben — das gehört in einen eigenen Commit.
- **Cross-Repo-Doku nicht anfassen.** Architektur, C4-Diagramme, ER, CI/CD-Beschreibung und
  der Appentwickler-Guide liegen im `.github`-Repo. Fällt dort etwas Veraltetes auf: im
  Ergebnisbericht erwähnen, nicht ändern.
- **Keine Coverage-Zahlen in die README schreiben.** Das Badge oben zieht den Wert
  automatisch aus GitHub Pages.

---

## 8. Fertig, wenn

- [ ] jede Doku-Änderung lässt sich auf einen konkreten Commit zurückführen
- [ ] alle genannten Dateinamen, Pfade und Reihenfolgen gegen den Code geprüft
- [ ] Zahlen und Inventare nachgezählt, nicht geschätzt
- [ ] README-Absätze einzeilig, Sprache je Fläche beibehalten
- [ ] `npm run build` läuft (Kommentaränderungen in `.vue` können Syntaxfehler enthalten)
- [ ] Commit als `docs: …` bzw. `docs(<bereich>): …`, passend zu `8662506`, `bcc9e5e`, `924329b`
