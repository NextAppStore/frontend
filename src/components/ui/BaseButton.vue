<script setup lang="ts">
/**
 * App-wide primary button.
 *
 * Variants — kept small so all views share the same visual vocabulary:
 *   * ``primary`` / ``yellow`` (default) — main action / create / submit. Logo
 *                                          orange (``accentYellow``); ``primary``
 *                                          is a semantic alias so code needn't
 *                                          pin the colour as part of the contract.
 *   * ``green``                          — confirming secondary action (resume,
 *                                          save in a non-destructive context).
 *   * ``red``                            — destructive action (delete, reject, reset).
 *   * ``ghost``                          — very subtle action (cancel in modals).
 *
 * Disabled: all variants drop the hover effect and switch to
 * ``opacity-50 + cursor-not-allowed``, set centrally here.
 *
 * Sizes — ``md`` is the page-level default; ``sm`` is for confined spaces
 * such as a modal footer, where the full-size button dominates the dialog.
 */
withDefaults(defineProps<{
  variant?: 'primary' | 'yellow' | 'green' | 'red' | 'ghost'
  size?: 'sm' | 'md'
}>(), {
  variant: 'primary',
  size: 'md',
})
</script>

<template>
  <button
    :class="[
      'inline-flex items-center justify-center gap-2',
      'rounded-xl font-medium transition duration-150 shadow-sm',
      size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-5 py-2.5 text-sm',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
      // ``primary`` and ``yellow`` share the same style; ``yellow`` is kept as an alias.
      // ``disabled:hover:!…`` repeats each variant's resting colours, so hovering
      // a disabled button changes nothing (a generic ``bg-current`` would paint
      // the background in the text colour and hide the label).
      (variant === 'primary' || variant === 'yellow')
        ? 'bg-btn-primary text-btn-primaryText hover:bg-btn-primaryHover focus:ring-primary/60 disabled:hover:!bg-btn-primary'
        : variant === 'green'
        ? 'bg-btn-secondary text-btn-secondaryText hover:bg-btn-secondaryHover focus:ring-primary/60 border border-border-strong disabled:hover:!bg-btn-secondary'
        : variant === 'red'
        ? 'bg-status-errorLight text-status-error hover:bg-status-error hover:text-content-onColor focus:ring-status-error/60 disabled:hover:!bg-status-errorLight disabled:hover:!text-status-error'
        : variant === 'ghost'
        ? 'bg-btn-ghost text-btn-ghostText hover:bg-btn-ghostHover border border-border focus:ring-primary/60 shadow-none disabled:hover:!bg-btn-ghost'
        : ''
    ]"
  >
    <slot />
  </button>
</template>


