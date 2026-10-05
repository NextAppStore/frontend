import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast.store'
import { deploymentApi } from '@/api/deployment.api'
import type { ComputedRef, Ref } from 'vue'
import type { Task, DeploymentWithRelations } from '@/types'

// Structure of a single terraform user_accounts entry.
export interface UserAccount {
  username: string
  team: string
  ip: string
  // IPv6 counterpart to ``ip``, worker-side addition — optional since
  // only RDP-style apps (Windows) currently publish it.
  ip_v6?: string
  port: number
  auth: string
  type?: 'password' | 'ssh_key' | 'oauth' | 'none' | string
  authtype?: 'ssh' | 'rdp' | 'url' | string
  url?: string
}

export function useDeploymentCredentials(
  deploymentId: string,
  deployment: ComputedRef<DeploymentWithRelations | null | undefined>,
  selectedTask: Ref<Task | null>,
  latestTaskOutputs: Ref<Task | null>,
) {
  const { t } = useI18n()
  const toastStore = useToastStore()

  // Member self-access: a non-owner (student) can't read the owner-only
  // task outputs, so we fetch just their own credentials from the
  // dedicated ``/my-access`` endpoint into this map. It mirrors the raw
  // ``user_accounts.value`` shape so ``typedUserAccounts`` can fall back
  // to it and the existing account-matching pipeline works unchanged.
  const myAccounts = ref<Record<string, UserAccount> | null>(null)
  const myTeamVms = ref<Record<string, { url?: string; floating_ip?: string; fixed_ip?: string; fixed_ip_v6?: string }> | null>(null)

  const visiblePasswords = ref<Record<string | number, boolean>>({})

  const togglePasswordVisibility = (key: string | number) => {
    visiblePasswords.value[key] = !visiblePasswords.value[key]
  }

  // Build a copy-paste SSH command from an account. Skips ``-p`` for the
  // default port 22 so the line stays short for the common case.
  const sshCommandFor = (data: { username?: string; ip?: string; port?: number }): string => {
    if (!data.username || !data.ip) return ''
    const portFlag = data.port && data.port !== 22 ? `-p ${data.port} ` : ''
    return `ssh ${portFlag}${data.username}@${data.ip}`
  }

  // Build a per-user URL from user_accounts (ip + port), preserving any path
  // suffix the team VM url carries (e.g. "/pgadmin4").
  const userUrlFor = (data: { ip?: string; port?: number }, teamVmUrl?: string): string | null => {
    if (!data.ip || !data.port) return null
    let path = ''
    if (teamVmUrl) {
      try {
        path = new URL(teamVmUrl).pathname.replace(/\/$/, '')
      } catch { /* ignore malformed url */ }
    }
    return `http://${data.ip}:${data.port}${path}`
  }

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
  function extractTeamVms(): Record<string, { url?: string; floating_ip?: string; fixed_ip?: string; fixed_ip_v6?: string }> | null {
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
  });

  // Whether any member across any team has an RDP account — the IPv4/IPv6
  // toggle only makes sense (and only renders) when there's an RDP pill
  // anywhere to apply it to.
  const hasAnyRdpAccount = computed(() =>
    enrichedTeams.value.some((team) =>
      team.members.some((member) => member.account?.data.authtype === 'rdp'),
    ),
  )

  const copiedKey = ref<string | null>(null)
  let copyResetTimer: number | null = null

  const copyToClipboard = async (text: string, key: string) => {
    if (!text) return
    try {
      // Modern ``navigator.clipboard`` requires a secure context
      // (https or localhost). Falls back to the legacy
      // ``execCommand('copy')`` so the button still works behind
      // plain http on the dev box.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      copiedKey.value = key
      if (copyResetTimer !== null) window.clearTimeout(copyResetTimer)
      copyResetTimer = window.setTimeout(() => {
        copiedKey.value = null
        copyResetTimer = null
      }, 1500)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const resendState = ref<Record<string, 'sending' | 'sent' | 'error'>>({})

  const resendAccess = async (teamId: string, userId: string) => {
    resendState.value = { ...resendState.value, [userId]: 'sending' }
    try {
      await deploymentApi.resendAccess(deploymentId, teamId, userId)
      resendState.value = { ...resendState.value, [userId]: 'sent' }
      toastStore.addToast({
        type: 'success',
        message: t('DeploymentDetailView.resendAccessSuccess'),
      })
      window.setTimeout(() => {
        const next = { ...resendState.value }
        delete next[userId]
        resendState.value = next
      }, 2000)
    } catch (err: any) {
      resendState.value = { ...resendState.value, [userId]: 'error' }
      // Backend returns ``{detail: {reason: '...'}}``; surface the
      // reason verbatim — the UI doesn't need to localise every
      // possible code, the toast is for the operator.
      //
      // Two reasons get a dedicated toast string so the user
      // understands WHY mail didn't go out:
      //   * smtp_disabled (503): platform-wide kill-switch; needs
      //     an admin to flip ``SMTP_ENABLED`` in the backend env.
      //     A generic "Failed to send" toast would mislead them
      //     into thinking the SMTP server is down.
      //   * everything else: stays in the existing failure path
      //     so SMTP-rejected-the-recipient, transient errors, and
      //     unknown reasons all get the verbose toast.
      const reason = err?.response?.data?.detail?.reason || err?.message || 'unknown'
      const isSmtpDisabled = err?.response?.status === 503 && reason === 'smtp_disabled'
      const isDeploymentBusyErr = err?.response?.status === 409 && reason === 'deployment_busy'
      toastStore.addToast({
        type: (isSmtpDisabled || isDeploymentBusyErr) ? 'warning' : 'error',
        message: isSmtpDisabled
          ? t('DeploymentDetailView.resendAccessSmtpDisabled')
          : isDeploymentBusyErr
            ? t('DeploymentDetailView.resendAccessDeploymentBusy')
            : `${t('DeploymentDetailView.resendAccessError')}: ${reason}`,
      })
      window.setTimeout(() => {
        const next = { ...resendState.value }
        delete next[userId]
        resendState.value = next
      }, 3000)
    }
  }

  return {
    myAccounts,
    myTeamVms,
    visiblePasswords,
    togglePasswordVisibility,
    sshCommandFor,
    userUrlFor,
    typedUserAccounts,
    extractTeamVms,
    enrichedTeams,
    hasAnyRdpAccount,
    copiedKey,
    copyToClipboard,
    resendState,
    resendAccess,
  }
}
