<script setup lang="ts">
/**
 * Teams & Members card for the deployment detail page.
 *
 * Renders the enriched team list produced by useDeploymentOutputs:
 * each member row shows matched credentials (SSH command, URL pill,
 * password with visibility toggle) and a "Resend access" button.
 *
 * The resend-state machine (sending / sent / error with auto-clear)
 * lives here rather than in the parent view, since it is strictly
 * scoped to this card's rows.
 *
 * TODO: move template block from DeploymentDetailView.vue (~lines 1902–2071) here
 *       and resend logic (~lines 1435–1483)
 */
</script>

<template>
  <!-- TODO: move teams-card template here -->
  <div />
</template>
