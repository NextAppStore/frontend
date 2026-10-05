<script setup lang="ts">
/**
 * Compact scope indicator for the deployment-wizard variable cards.
 *
 * Wraps ``Badge`` with scope-specific copy:
 *   * ``team`` → purple badge ``scopeBadge.perTeam`` + ``Users`` icon
 *   * ``user`` → purple badge ``scopeBadge.perUser`` + ``User`` icon
 *   * ``all``/undefined → nothing rendered (the calm default)
 *
 * Purple matches the wizard's "Terraform" / scope hue. Accepts ``undefined`` so
 * callers can pass ``v.varScope`` without a guard (the backend omits it when "all").
 */
import { Users, User } from 'lucide-vue-next'
import Badge from './Badge.vue'

defineProps<{
  scope?: 'all' | 'team' | 'user'
}>()
</script>

<template>
  <Badge v-if="scope === 'team'" variant="purple">
    <Users :size="12" class="mr-1" aria-hidden="true" />
    <span>{{ $t('scopeBadge.perTeam') }}</span>
  </Badge>
  <Badge v-else-if="scope === 'user'" variant="purple">
    <User :size="12" class="mr-1" aria-hidden="true" />
    <span>{{ $t('scopeBadge.perUser') }}</span>
  </Badge>
  <!-- scope === 'all' or undefined: render nothing (the default needs no marker). -->
</template>
