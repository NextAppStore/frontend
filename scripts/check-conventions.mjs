#!/usr/bin/env node
/**
 * Konventions-Gate für das Frontend.
 *
 * Prüft die Regeln aus ``AGENTS.md`` / ``.claude/skills/frontend-dev``, die
 * weder TypeScript noch Vitest abfangen. Ohne dieses Skript sind sie reine
 * Prosa — mit ihm sind sie ein CI-Gate.
 *
 * Baseline-Prinzip
 * ----------------
 * Der Bestand hat Altlasten (hartkodierte Farben, ``<style>``-Blöcke,
 * abgeschaltete Suiten). Die sofort zu verbieten würde die Pipeline rot
 * färben und niemandem helfen. Stattdessen liegt der Ist-Stand pro Datei in
 * ``scripts/conventions-baseline.json``:
 *
 *   * eine NEUE Datei mit Verstoß  → Fehler
 *   * eine bekannte Datei mit MEHR Verstößen als zuvor → Fehler
 *   * weniger Verstöße als zuvor → Hinweis, Baseline schrumpfen lassen
 *
 * Damit kann der Zähler nur fallen, nie steigen.
 *
 * Nutzung
 * -------
 *   npm run check              prüfen (Exit 1 bei Verstoß)
 *   npm run check -- --update  Baseline auf den aktuellen Stand setzen
 *
 * Beim Aufräumen einer Altlast: aufräumen, dann ``--update`` laufen lassen
 * und die geänderte Baseline mitcommitten.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BASELINE_PATH = join(ROOT, 'scripts', 'conventions-baseline.json')
const UPDATE = process.argv.includes('--update')

// Nur für den Fallback-Walk relevant (siehe ``collect``). Im Normalfall
// liefert Git die Dateiliste und respektiert die .gitignore ohnehin.
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git'])

// Die Prüfungen sind textuell, nicht AST-basiert: ein Treffer in einem
// Kommentar oder String zählt mit. Das ist der bewusste Preis dafür, dass
// das Skript ohne Dependencies auskommt — Fehlalarme landen in der Baseline.

// ----------------------------------------------------------------
// REGELN
// ----------------------------------------------------------------
// ``baseline: false`` = niemals tolerierbar, auch nicht im Bestand.
const RULES = [
  {
    id: 'no-hardcoded-color',
    title: 'Hartkodierte Farbe — nutze die Tokens aus tailwind.config.js',
    files: (p) => p.endsWith('.vue'),
    pattern: /#[0-9a-fA-F]{6}\b|\[#[0-9a-fA-F]{3,8}\]/g,
    baseline: true,
  },
  {
    id: 'no-style-block',
    title: '<style>-Block — nutze Tailwind-Utilities',
    files: (p) => p.endsWith('.vue'),
    pattern: /<style[\s>]/g,
    baseline: true,
  },
  {
    id: 'no-explicit-any',
    title: 'Explizites any — verboten laut copilot-instructions',
    files: (p) => (p.endsWith('.ts') || p.endsWith('.vue')) && !isTestFile(p),
    pattern: /:\s*any\b|\bas\s+any\b/g,
    baseline: true,
  },
  {
    id: 'no-http-in-ui',
    title: 'Direkter HTTP-Aufruf in einer View/Komponente — geht über einen Store',
    // Nur die Präsentationsschicht. ``src/composables/`` ist bewusst NICHT
    // dabei: ``useDeploymentStream`` braucht ``fetch`` für SSE (EventSource
    // kann keinen Bearer-Header setzen), und ``useQuotas`` importiert
    // ``axios`` ausschließlich für den Typ-Guard ``axios.isAxiosError`` —
    // der Request selbst läuft dort über ``quotasApi``. Beides wäre hier
    // ein Fehlalarm.
    files: (p) =>
      p.startsWith('src/views/') ||
      p.startsWith('src/components/') ||
      p.startsWith('src/layouts/'),
    // ``axios``-Import oder globales ``fetch(`` — ``store.fetch()`` bleibt erlaubt,
    // weil dem Aufruf ein ``.`` vorausgeht.
    pattern: /from\s+['"]axios['"]|from\s+['"]@\/api\/axios['"]|(?<![.\w])fetch\s*\(/g,
    baseline: true,
  },
  {
    id: 'no-skipped-tests',
    title: 'Abgeschalteter Test (.skip) — reparieren oder löschen',
    files: isTestFile,
    pattern: /\b(describe|it|test)\.skip\b/g,
    baseline: true,
  },
  {
    id: 'no-focused-tests',
    title: '.only lässt alle übrigen Tests still ausfallen',
    files: isTestFile,
    pattern: /\b(describe|it|test)\.only\b/g,
    baseline: false,
  },
  {
    id: 'no-committed-env',
    title: '.env-Datei im Repo — Secrets gehören nie in Git',
    files: (p) => /(^|\/)\.env(\.|$)/.test(p) && !p.endsWith('.example'),
    pattern: /[\s\S]/,
    baseline: false,
  },
]

function isTestFile(p) {
  return /\.(spec|test)\.ts$/.test(p)
}

// ----------------------------------------------------------------
// DATEIEN EINSAMMELN
// ----------------------------------------------------------------
/**
 * Bevorzugt Git: geprüft wird genau das, was im Repository landet oder landen
 * würde.
 *
 * ``--cached`` liefert die verfolgten Dateien, ``--others
 * --exclude-standard`` zusätzlich die neuen, noch nicht committeten — ohne
 * die von ``.gitignore`` ausgeschlossenen.
 *
 * Beide Hälften sind nötig:
 *   * nur ``--cached`` → eine brandneue Datei mit Verstoß rutscht lokal
 *     durch und fällt erst in der CI auf;
 *   * ohne ``--exclude-standard`` → eine korrekt ignorierte lokale ``.env``
 *     färbt den Check rot, obwohl alles in Ordnung ist.
 *
 * Fallback auf einen Verzeichnis-Walk, falls kein Git verfügbar ist (etwa in
 * einer ephemeren Sandbox-Kopie ohne ``.git``).
 */
function collectFromGit() {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  // ``--cached`` und ``--others`` können dieselbe Datei nicht doppelt
  // liefern, ein Set kostet aber nichts und macht die Zusage explizit.
  return [...new Set(out.split('\0').filter(Boolean))]
}

function collectFromDisk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) collectFromDisk(abs, acc)
    else acc.push(relative(ROOT, abs).split(sep).join('/'))
  }
  return acc
}

function collect() {
  try {
    return collectFromGit()
  } catch {
    console.warn('! git ls-files nicht verfügbar — prüfe stattdessen das Dateisystem.')
    return collectFromDisk(ROOT)
  }
}

// ----------------------------------------------------------------
// PRÜFEN
// ----------------------------------------------------------------
const files = collect()
const counts = {} // ruleId -> { file: n }

for (const rule of RULES) {
  counts[rule.id] = {}
  for (const file of files.filter(rule.files)) {
    let content
    try {
      content = readFileSync(join(ROOT, file), 'utf8')
    } catch {
      continue // Binärdatei o.ä.
    }
    const hits = content.match(rule.pattern)
    if (hits?.length) counts[rule.id][file] = hits.length
  }
}

if (UPDATE) {
  const next = {}
  for (const rule of RULES) {
    if (rule.baseline) next[rule.id] = counts[rule.id]
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
  const total = Object.values(next).reduce(
    (s, m) => s + Object.values(m).reduce((a, b) => a + b, 0),
    0,
  )
  console.log(`Baseline geschrieben: ${BASELINE_PATH}`)
  console.log(`${total} bekannte Verstöße in ${Object.keys(next).length} Regeln eingefroren.`)
  process.exit(0)
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : {}

const improvements = []
let failed = false

for (const rule of RULES) {
  const current = counts[rule.id]
  const allowed = rule.baseline ? (baseline[rule.id] ?? {}) : {}

  // Regressionen: neue Datei mit Verstoß, oder mehr Treffer als erlaubt.
  const regressions = Object.entries(current)
    .filter(([file, n]) => n > (allowed[file] ?? 0))
    .map(([file, n]) => {
      const was = allowed[file] ?? 0
      return was === 0 ? `    ${file} — ${n}×` : `    ${file} — ${n}× (Baseline: ${was})`
    })

  if (regressions.length) {
    failed = true
    console.error(`\n✖ ${rule.id}: ${rule.title}`)
    regressions.forEach((line) => console.error(line))
  }

  // Verbesserungen: weniger Treffer als die Baseline erlaubt.
  for (const [file, was] of Object.entries(allowed)) {
    const now = current[file] ?? 0
    if (now < was) improvements.push(`  ${rule.id}: ${file} ${was} → ${now}`)
  }
}

if (improvements.length) {
  console.log('\n✓ Aufgeräumt gegenüber der Baseline:')
  improvements.forEach((l) => console.log(l))
  console.log('  → npm run check -- --update  (und die Baseline mitcommitten)')
}

if (failed) {
  console.error(
    '\nKonventions-Check fehlgeschlagen.' +
      '\nRegeln siehe AGENTS.md und .claude/skills/frontend-dev/SKILL.md.' +
      '\nAltlasten dürfen bleiben — neue Verstöße nicht.\n',
  )
  process.exit(1)
}

console.log('✓ Konventions-Check bestanden — keine neuen Verstöße.')
