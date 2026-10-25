import typography from '@tailwindcss/typography'

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
          info:          'var(--color-tag-info)',
          infoLight:     'var(--color-tag-info-light)',
          infoBorder:    'var(--color-tag-info-border)',
          warning:       'var(--color-tag-warning)',
          warningLight:  'var(--color-tag-warning-light)',
          warningBorder: 'var(--color-tag-warning-border)',
          destroy:       'var(--color-tag-destroy)',
          destroyLight:  'var(--color-tag-destroy-light)',
          destroyBorder: 'var(--color-tag-destroy-border)',
          neutral:       'var(--color-tag-neutral)',
          neutralLight:  'var(--color-tag-neutral-light)',
          neutralBorder: 'var(--color-tag-neutral-border)',
          accent:        'var(--color-tag-accent)',
          accentLight:   'var(--color-tag-accent-light)',
          accentBorder:  'var(--color-tag-accent-border)',
        },
      },
    },
  },
  plugins: [typography],
}
