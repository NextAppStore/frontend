/**
 * Extracts and enriches deployment output data from task results.
 *
 * The backend stores Terraform outputs as a TEXT column — they can arrive as a
 * JSON string, an already-parsed object, or null. This composable owns the
 * unwrap chain so no other file needs to know about the ambiguous wire shape.
 *
 * Exports:
 *   useDeploymentOutputs — composable returning typedUserAccounts,
 *                          extractTeamVms, enrichedTeams
 */

import type { Ref } from 'vue'
import type { DeploymentWithRelations, Task } from '@/types'

// TODO: move UserAccount interface to src/types/index.ts
export interface UserAccount {
  username: string
  team: string
  ip: string
  port: number
  auth: string
  type?: 'password' | 'ssh_key' | 'oauth' | 'none' | string
  authtype?: 'ssh' | 'url' | string
  url?: string
}

export function useDeploymentOutputs(_params: {
  deployment: Ref<DeploymentWithRelations | null>
  activeDataTask: Ref<Task | null>
}) {
  // placeholder — replace with typedUserAccounts, extractTeamVms, enrichedTeams
  // from DeploymentDetailView.vue (~lines 90–271)

  const typedUserAccounts = { value: null as Record<string, UserAccount> | null }
  const enrichedTeams = { value: [] as unknown[] }

  function extractTeamVms(): Record<string, { url?: string; floating_ip?: string; fixed_ip?: string }> | null {
    return null
  }

  return { typedUserAccounts, enrichedTeams, extractTeamVms }
}
