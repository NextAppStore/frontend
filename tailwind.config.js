import typography from '@tailwindcss/typography'

// Tokens hold plain hex values, so Tailwind cannot derive opacity variants
// (``bg-primary/10``) from a bare ``var()`` and silently drops those classes.
// ``color-mix`` with ``<alpha-value>`` restores them; without a modifier the
// alpha is 1 and the colour is unchanged.
const token = (name) =>
  `color-mix(in srgb, var(--color-${name}) calc(<alpha-value> * 100%), transparent)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,ts,tsx,js,jsx}"
  ],
  // 'class' strategy: adding class="dark" to <html> enables dark mode
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand colors ───────────────────────────────────────────
        primary: {
          DEFAULT: token('primary'),
          light:   token('primary-light'),
          dark:    token('primary-dark'),
        },
        secondary: {
          DEFAULT: token('secondary'),
          light:   token('secondary-light'),
          dark:    token('secondary-dark'),
        },
        highlight: {
          DEFAULT: token('highlight'),
          light:   token('highlight-light'),
          dark:    token('highlight-dark'),
        },

        // ── Surfaces ───────────────────────────────────────────────
        surface: {
          page:    token('surface-page'),
          card:    token('surface-card'),
          sidebar: token('surface-sidebar'),
          input:   token('surface-input'),
          overlay: token('surface-overlay'),
          hover:   token('surface-hover'),
        },

        // ── Text ───────────────────────────────────────────────────
        content: {
          primary:   token('content-primary'),
          secondary: token('content-secondary'),
          disabled:  token('content-disabled'),
          inverse:   token('content-inverse'),
          onColor:   token('content-on-color'),
          link:      token('content-link'),
        },

        // ── Buttons ────────────────────────────────────────────────
        btn: {
          primary:         token('btn-primary'),
          primaryHover:    token('btn-primary-hover'),
          primaryText:     token('btn-primary-text'),
          secondary:       token('btn-secondary'),
          secondaryHover:  token('btn-secondary-hover'),
          secondaryText:   token('btn-secondary-text'),
          ghost:           token('btn-ghost'),
          ghostHover:      token('btn-ghost-hover'),
          ghostText:       token('btn-ghost-text'),
        },

        // ── Cards / Tiles ──────────────────────────────────────────
        card: {
          bg:      token('card-bg'),
          tinted:  token('card-bg-tinted'),
          border:  token('card-border'),
        },

        // ── Status / Feedback ──────────────────────────────────────
        status: {
          success:      token('status-success'),
          successLight: token('status-success-light'),
          error:        token('status-error'),
          errorLight:   token('status-error-light'),
          warning:      token('status-warning'),
          warningLight: token('status-warning-light'),
          info:         token('status-info'),
          infoLight:    token('status-info-light'),
        },

        // ── Resource progress bars ─────────────────────────────────
        resource: {
          low:    token('resource-low'),
          medium: token('resource-medium'),
          high:   token('resource-high'),
        },

        // ── Borders ────────────────────────────────────────────────
        border: {
          DEFAULT: token('border'),
          strong:  token('border-strong'),
          focus:   token('border-focus'),
        },

        // ── Tag / badge palette ────────────────────────────────────
        tag: {
          info:          token('tag-info'),
          infoLight:     token('tag-info-light'),
          infoBorder:    token('tag-info-border'),
          warning:       token('tag-warning'),
          warningLight:  token('tag-warning-light'),
          warningBorder: token('tag-warning-border'),
          destroy:       token('tag-destroy'),
          destroyLight:  token('tag-destroy-light'),
          destroyBorder: token('tag-destroy-border'),
          neutral:       token('tag-neutral'),
          neutralLight:  token('tag-neutral-light'),
          neutralBorder: token('tag-neutral-border'),
          accent:        token('tag-accent'),
          accentLight:   token('tag-accent-light'),
          accentBorder:  token('tag-accent-border'),
        },
      },

      // Map the typography plugin's palette onto our tokens so rendered
      // Markdown (tables, bold, lists, quotes …) follows light/dark mode
      // instead of the plugin's fixed light-mode greys.
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body':         'var(--color-content-secondary)',
            '--tw-prose-headings':     'var(--color-content-primary)',
            '--tw-prose-lead':         'var(--color-content-secondary)',
            '--tw-prose-links':        'var(--color-content-link)',
            '--tw-prose-bold':         'var(--color-content-primary)',
            '--tw-prose-counters':     'var(--color-content-secondary)',
            '--tw-prose-bullets':      'var(--color-border-strong)',
            '--tw-prose-hr':           'var(--color-border)',
            '--tw-prose-quotes':       'var(--color-content-primary)',
            '--tw-prose-quote-borders': 'var(--color-border-strong)',
            '--tw-prose-captions':     'var(--color-content-secondary)',
            '--tw-prose-kbd':          'var(--color-content-primary)',
            '--tw-prose-code':         'var(--color-content-primary)',
            '--tw-prose-pre-code':     'var(--color-content-primary)',
            '--tw-prose-pre-bg':       'var(--color-surface-card)',
            '--tw-prose-th-borders':   'var(--color-border-strong)',
            '--tw-prose-td-borders':   'var(--color-border)',
          },
        },
      },
    },
  },
  plugins: [typography],
}
