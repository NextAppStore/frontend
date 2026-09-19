<script setup lang="ts">
/**
 * Live progress card for a running deployment task.
 *
 * Shown while isStreamRelevant is true. Renders:
 *   - Header strip with live indicator, task type and SSE connection badge
 *   - Phase stepper (dots + labels) driven by the SSE stream
 *   - Progress bar with current phase name and percentage
 *   - Live log tail (ring-buffered, last 100 lines)
 *
 * Props receive the reactive stream values destructured in DeploymentDetailView
 * so this component stays free of direct composable calls and is fully testable
 * with plain prop stubs.
 *
 * TODO: move template block from DeploymentDetailView.vue (~lines 1777–1900) here
 */
</script>

<template>
  <!-- TODO: move active-task card template here -->
  <div />
</template>
