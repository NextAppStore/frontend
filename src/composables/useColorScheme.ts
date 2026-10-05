import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export type ColorScheme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'color-scheme'

const scheme = ref<ColorScheme>(
  (typeof localStorage !== 'undefined'
    ? (localStorage.getItem(STORAGE_KEY) as ColorScheme | null)
    : null) ?? 'auto'
)

function applyScheme(value: ColorScheme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const useDark = value === 'dark' || (value === 'auto' && prefersDark)
  document.documentElement.classList.toggle('dark', useDark)
}

// Apply once on module load so the class is set before Vue mounts.
applyScheme(scheme.value)

export function useColorScheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const onMediaChange = () => {
    if (scheme.value === 'auto') applyScheme('auto')
  }

  onMounted(() => mediaQuery.addEventListener('change', onMediaChange))
  onBeforeUnmount(() => mediaQuery.removeEventListener('change', onMediaChange))

  watch(scheme, (value) => {
    localStorage.setItem(STORAGE_KEY, value)
    applyScheme(value)
  })

  function setScheme(value: ColorScheme) {
    scheme.value = value
  }

  return { scheme, setScheme }
}
