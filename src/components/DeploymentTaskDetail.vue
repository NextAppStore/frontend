<script setup lang="ts">
/**
 * Task detail panel — shows logs, Terraform state and outputs for a
 * selected historical task.
 *
 * Rendered inside the Tasks & Logs section when the user clicks a row
 * in the task history list. Includes:
 *   - Task metadata grid (type, status, started/finished, IDs)
 *   - Logs block: failure headline + collapsible trace, or pretty-printed JSON
 *   - Terraform State block with syntax highlighting and copy button
 *
 * Utility functions prettyJson, highlightJson, copyToClipboard and
 * splitTaskLogs are candidates to live in utils/ once extracted.
 *
 * TODO: move template block from DeploymentDetailView.vue (~lines 2279–2446) here
 */
</script>

<template>
  <!-- TODO: move task-detail template here -->
  <div />
</template>
