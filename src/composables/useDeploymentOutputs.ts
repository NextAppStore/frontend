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

import { computed } from 'vue'
import type { Ref } from 'vue'
import type { DeploymentWithRelations, Task } from '@/types'

// Structure of a single account.
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

export function useDeploymentOutputs(params: {
    deployment: Ref<DeploymentWithRelations | null>
    selectedTask: Ref<Task | null>
    latestTaskOutputs: Ref<Task | null>
    myAccounts: Ref<Record<string, UserAccount> | null>
    myTeamVms: Ref<Record<string, { url?: string; floating_ip?: string; fixed_ip?: string }> | null>
}) {
    const { deployment, selectedTask, latestTaskOutputs, myAccounts, myTeamVms } = params

    const typedUserAccounts = computed<Record<string, UserAccount> | null>(() => {
        const currentTarget = selectedTask.value || latestTaskOutputs.value
        const rawOutputs = currentTarget?.outputs
        // Member fallback: non-owners have no task outputs (the owner-only
        // task endpoint 403s / is skipped), so use the per-user credentials
        // fetched from ``/my-access``. Already in the ``user_accounts.value``
        // shape, so it feeds the matching pipeline below directly.
        if (!rawOutputs) return myAccounts.value

        let outputsObj: any = rawOutputs

        // Case 1: outputs arrive as a JSON string from the DB text column.
        if (typeof rawOutputs === 'string') {
            try {
                const trimmed = rawOutputs.trim()
                if (trimmed.startsWith('{')) {
                    outputsObj = JSON.parse(trimmed)
                }
            } catch (e) {
                console.error('Failed to parse raw outputs data:', e)
                return myAccounts.value
            }
        }

        // Case 2: it is already an object (or was parsed successfully above).
        if (outputsObj && typeof outputsObj === 'object' && 'user_accounts' in outputsObj) {
            const userAccountsContainer = outputsObj.user_accounts

            // Reach through to the Terraform ``.value`` object.
            if (userAccountsContainer && userAccountsContainer.value) {
                return userAccountsContainer.value as Record<string, UserAccount>
            }
        }

        return myAccounts.value
    })

    /**
     * Pull the ``team_vms`` object out of the active task's outputs. Same
     * unwrap chain as ``typedUserAccounts`` — the outputs may arrive as a
     * raw JSON string from the DB or as an already-parsed object, and the
     * actual map sits under ``.value`` because Terraform stamps the output
     * shape on the wrapper. Returns ``null`` if anything along the way
     * isn't there.
     */
    function extractTeamVms(): Record<string, { url?: string; floating_ip?: string; fixed_ip?: string }> | null {
        const currentTarget = selectedTask.value || latestTaskOutputs.value
        const rawOutputs = currentTarget?.outputs
        // Member fallback: use the team VM block from ``/my-access`` so a
        // non-owner still gets the Web-URL pill (SSH/PW render even without it).
        if (!rawOutputs) return myTeamVms.value

        let outputsObj: any = rawOutputs
        if (typeof rawOutputs === 'string') {
            try {
                const trimmed = rawOutputs.trim()
                if (trimmed.startsWith('{')) outputsObj = JSON.parse(trimmed)
            } catch {
                return myTeamVms.value
            }
        }
        const vms = outputsObj?.team_vms?.value
        return vms && typeof vms === 'object' ? vms : myTeamVms.value
    }

    const enrichedTeams = computed(() => {
        const currentDeployment = deployment && 'value' in deployment
            ? deployment.value
            : deployment;

        if (!currentDeployment?.teams) return [];

        const accounts = typedUserAccounts && 'value' in typedUserAccounts
            ? typedUserAccounts.value
            : typedUserAccounts;

        // Team-level VM metadata from terraform's ``team_vms`` output. Apps
        // that serve a Web-UI publish ``url`` here; SSH-only apps don't.
        // We surface that as ``team.vm`` so the template can decide between
        // a URL pill and an SSH-command pill per team.
        const teamVms = extractTeamVms()

        // Resolve member ↔ account.
        //
        // The canonical contract is the ``user_accounts`` MAP KEY, which every app
        // template constructs the same way:
        //
        //     key = "<team>-" + email.split("@")[0].replace(".", "-")
        //
        // Since the member's email and team are known here, that key can be
        // reproduced deterministically. The value's ``username`` field is not a
        // reliable identifier (some templates write the email local-part, others a
        // shared team-wide pseudo-email), so we index by key and look up the derived
        // key per member. Three fallbacks cover templates not matched by the key.
        const accountByEmail = new Map<string, { key: string; data: UserAccount }>()
        const accountByUsername = new Map<string, { key: string; data: UserAccount }>()
        const accountByKey = new Map<string, { key: string; data: UserAccount }>()
        if (accounts) {
            for (const [key, acc] of Object.entries(accounts)) {
                const candidate = acc?.username?.trim().toLowerCase()
                if (candidate && candidate.includes('@')) {
                    accountByEmail.set(candidate, { key, data: acc })
                } else if (candidate) {
                    accountByUsername.set(candidate, { key, data: acc })
                }
                accountByKey.set(key.trim().toLowerCase(), { key, data: acc })
            }
        }

        // Mirror the terraform key sanitisation: lowercase the local-part
        // and replace dots with dashes. Only dots — terraform's
        // ``replace(local_part, ".", "-")`` does not touch other characters.
        const deriveExpectedKey = (teamName: string, email: string | undefined): string | null => {
            if (!email) return null
            const localPart = email.split('@')[0]
            if (!localPart) return null
            const sanitised = localPart.replace(/\./g, '-').toLowerCase()
            return `${teamName.trim().toLowerCase()}-${sanitised}`
        }

        return currentDeployment.teams.map(team => {
            const vm = teamVms?.[team.name] ?? null
            const teamNameLower = team.name.trim().toLowerCase()
            return {
                ...team,
                vm,
                members: team.members.map(member => {
                    const memberEmail = member?.email?.trim().toLowerCase()
                    const memberName = member?.username?.trim().toLowerCase()

                    // Strategy 0 (canonical): derive the terraform key from
                    // member.email + team.name and look it up directly.
                    let hit: { key: string; data: UserAccount } | undefined
                    const expectedKey = deriveExpectedKey(team.name, memberEmail)
                    if (expectedKey) hit = accountByKey.get(expectedKey)

                    // Strategy 1: email-based (templates that write the
                    // member's full email into ``account.username``).
                    if (!hit && memberEmail) hit = accountByEmail.get(memberEmail)

                    // Strategy 2: username substring against account.username
                    if (!hit && memberName) {
                        for (const [accUser, entry] of accountByUsername) {
                            if (accUser.includes(memberName) || memberName.includes(accUser)) {
                                hit = entry
                                break
                            }
                        }
                    }

                    // Strategy 3: username substring against the account key
                    // (``Team #1-leon-priemer`` etc.). Last-resort fallback
                    // for templates where ``account.username`` is missing
                    // and the keycloak username happens to match the slug.
                    if (!hit && memberName) {
                        for (const [accKey, entry] of accountByKey) {
                            if (accKey.includes(memberName)) {
                                hit = entry
                                break
                            }
                        }
                    }

                    // Team scope guard so an account from team A can't be
                    // attached to a member of team B.
                    const accountTeam = hit?.data.team?.trim().toLowerCase()
                    const keyLower = hit?.key.trim().toLowerCase()
                    const teamMatches = hit && (
                        accountTeam === teamNameLower ||
                        (keyLower?.startsWith(`${teamNameLower}-`) ?? false) ||
                        (keyLower?.includes(teamNameLower) ?? false)
                    )
                    return {
                        ...member,
                        account: teamMatches ? hit : null
                    };
                })
            };
        });
    })

    return { typedUserAccounts, enrichedTeams, extractTeamVms }
}
