/**
 * Name suggestion for a deployment started via quick deploy.
 *
 * The suggestion used to be ``"<App> <date>"``. That read poorly, collided
 * whenever the same app was deployed twice on one day, and — since dates
 * follow the UI language — produced a different name per locale. It is now a
 * slug plus a short random suffix, keeping the lowercase-and-hyphens shape
 * the project uses elsewhere for identifiers.
 *
 * The suffix only keeps two suggestions apart; it is not an id and nothing
 * reads it back. The user can replace the whole name.
 */

/** Without ``l``, ``o``, ``0`` and ``1`` — too easy to confuse when read out. */
const SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

const SUFFIX_LENGTH = 4

function randomSuffix(): string {
  let out = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)]
  }
  return out
}

/**
 * Lowercase, umlauts folded to ASCII, every run of other characters collapsed
 * into a single hyphen.
 */
export function slugifyAppName(appName: string): string {
  return appName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** ``"Jupyter Notebook"`` → ``"jupyter-notebook-k3f7"``. */
export function suggestDeploymentName(appName: string): string {
  const slug = slugifyAppName(appName) || 'deployment'
  return `${slug}-${randomSuffix()}`
}
