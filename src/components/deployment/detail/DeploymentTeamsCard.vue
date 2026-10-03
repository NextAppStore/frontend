<script setup lang="ts">
import { Users, User, Loader2, AlertCircle, Send, Check, Copy } from 'lucide-vue-next'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { UserAccount } from '@/composables/deployment/useDeploymentCredentials'

interface TeamVm {
  url?: string
  floating_ip?: string
  fixed_ip?: string
}

interface MemberAccount {
  key: string
  data: UserAccount
}

interface EnrichedMember {
  userId: string
  email: string
  username: string
  account: MemberAccount | null | undefined
}

interface EnrichedTeam {
  teamId: string
  name: string
  vm: TeamVm | null
  members: EnrichedMember[]
}

defineProps<{
  enrichedTeams: EnrichedTeam[]
  teamsCount: number
  visiblePasswords: Record<string | number, boolean>
  copiedKey: string | null
  resendState: Record<string, 'sending' | 'sent' | 'error'>
  isOwnerView: boolean
  isDeploymentBusy: boolean
  currentUserId: string | null
  togglePasswordVisibility: (key: string | number) => void
  copyToClipboard: (text: string, key: string) => Promise<void>
  sshCommandFor: (data: { username?: string; ip?: string; port?: number }) => string
  userUrlFor: (data: { ip?: string; port?: number }, teamVmUrl?: string) => string | null
  resendAccess: (teamId: string, userId: string) => Promise<void>
}>()
</script>

<template>
    <!-- Teams & Members section — appears above Infrastructure so
         the human-readable view (who has access to what) precedes
         the technical resource listing. -->
    <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm mb-8">
        <div class="flex items-center gap-3 mb-5">
            <div class="p-2 bg-surface-input rounded-lg">
                <Users :size="20" class="text-content-secondary" />
            </div>
            <span class="text-lg font-semibold text-content-primary">
                {{ $t('DeploymentDetailView.teamsAndMembers') }}
            </span>
            <span class="px-2 py-0.5 bg-surface-input text-content-secondary text-xs font-bold rounded">
                {{ teamsCount }}
            </span>
        </div>

        <div class="space-y-4">
            <div v-for="team in enrichedTeams" :key="team.teamId"
                class="border border-card-border rounded-lg overflow-hidden">
                <div class="bg-surface-input px-4 py-3 flex items-center justify-between border-b border-card-border">
                    <div class="flex items-center gap-2">
                        <span class="font-semibold text-content-primary">{{ team.name }}</span>
                        <span class="text-xs text-content-secondary">·</span>
                        <span class="text-xs text-content-secondary">
                            {{ team.members.length }}
                            {{ team.members.length === 1 ? 'member' : 'members' }}
                        </span>
                    </div>
                </div>

                <div v-if="team.members.length === 0" class="px-4 py-6 text-center text-sm text-content-secondary">
                    No members assigned to this team.
                </div>

                <div v-else>
                    <div v-for="member in team.members" :key="member.userId"
                        class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 py-4 border-b border-card-border last:border-b-0 hover:bg-surface-input/50 transition-colors">

                        <div class="flex items-center gap-3 min-w-0 flex-1">
                            <div
                                class="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                <User :size="16" />
                            </div>
                            <div class="min-w-0 pr-2">
                                <div class="font-medium text-content-primary truncate">{{ member.username }}</div>
                                <div class="text-xs text-content-secondary truncate">{{ member.email }}</div>
                            </div>
                        </div>

                        <div v-if="member.account"
                            class="flex flex-wrap items-center gap-4 text-xs font-mono text-content-secondary lg:justify-end">

                            <!-- Web-app URL from ``team_vms.<team>.url``,
                                 shared by every team member. When set, the
                                 SSH pill is dropped and the username shows next to it. -->
                            <div v-if="team.vm?.url"
                                class="flex items-center gap-1.5 bg-surface-input px-2 py-1 rounded border border-card-border">
                                <span class="text-content-disabled font-sans text-[10px] uppercase tracking-wider flex-shrink-0">User:</span>
                                <span>{{ member.account.data.username }}</span>
                                <button
                                    @click="copyToClipboard(member.account.data.username, 'user-' + member.account.key)"
                                    class="text-content-disabled hover:text-status-warning p-0.5 rounded hover:bg-surface-input transition-colors flex-shrink-0"
                                    :title="copiedKey === 'user-' + member.account.key ? 'Kopiert!' : 'Username kopieren'">
                                    <component :is="copiedKey === 'user-' + member.account.key ? Check : Copy" :size="12" />
                                </button>
                            </div>

                            <div v-if="member.account.data.ip && member.account.data.port && member.account.data.type !== 'ssh_key' && member.account.data.authtype !== 'ssh' && member.account.data.port !== 22"
                                class="flex items-center gap-1.5 bg-surface-input px-2 py-1 rounded border border-card-border max-w-[280px]">
                                <span class="text-content-disabled font-sans text-[10px] uppercase tracking-wider flex-shrink-0">URL:</span>
                                <a :href="userUrlFor(member.account.data, team.vm?.url) ?? ''" target="_blank" rel="noopener noreferrer"
                                    class="text-tag-info hover:underline truncate">{{ userUrlFor(member.account.data, team.vm?.url)?.replace(/^https?:\/\//, '') }}</a>
                                <button
                                    @click="copyToClipboard(userUrlFor(member.account.data, team.vm?.url) ?? '', 'vmurl-' + member.account.key)"
                                    class="text-content-disabled hover:text-status-warning p-0.5 rounded hover:bg-surface-input transition-colors flex-shrink-0"
                                    :title="copiedKey === 'vmurl-' + member.account.key ? 'Kopiert!' : 'URL kopieren'">
                                    <component :is="copiedKey === 'vmurl-' + member.account.key ? Check : Copy" :size="12" />
                                </button>
                            </div>
                            <div v-else-if="team.vm?.url"
                                class="flex items-center gap-1.5 bg-surface-input px-2 py-1 rounded border border-card-border max-w-[280px]">
                                <span class="text-content-disabled font-sans text-[10px] uppercase tracking-wider flex-shrink-0">URL:</span>
                                <a :href="team.vm.url" target="_blank" rel="noopener noreferrer"
                                    class="text-tag-info hover:underline truncate">{{ team.vm.url.replace(/^https?:\/\//, '') }}</a>
                                <button
                                    @click="copyToClipboard(team.vm.url, 'vmurl-' + member.account.key)"
                                    class="text-content-disabled hover:text-status-warning p-0.5 rounded hover:bg-surface-input transition-colors flex-shrink-0"
                                    :title="copiedKey === 'vmurl-' + member.account.key ? 'Kopiert!' : 'URL kopieren'">
                                    <component :is="copiedKey === 'vmurl-' + member.account.key ? Check : Copy" :size="12" />
                                </button>
                            </div>

                            <!-- Ready-to-use SSH command line — already
                                 includes username, IP and (for non-22) the port. -->
                            <div v-if="!team.vm?.url && member.account.data.ip && member.account.data.username && (!member.account.data.authtype || member.account.data.authtype === 'ssh')"
                                class="flex items-center gap-1.5 bg-surface-input px-2 py-1 rounded border border-card-border max-w-full">
                                <span class="text-content-disabled font-sans text-[10px] uppercase tracking-wider flex-shrink-0">SSH:</span>
                                <span class="truncate">{{ sshCommandFor(member.account.data) }}</span>
                                <button
                                    @click="copyToClipboard(sshCommandFor(member.account.data), 'ssh-' + member.account.key)"
                                    class="text-content-disabled hover:text-status-warning p-0.5 rounded hover:bg-surface-input transition-colors flex-shrink-0"
                                    :title="copiedKey === 'ssh-' + member.account.key ? 'Kopiert!' : 'SSH-Befehl kopieren'">
                                    <component :is="copiedKey === 'ssh-' + member.account.key ? Check : Copy" :size="12" />
                                </button>
                            </div>

                            <div v-if="member.account.data.auth"
                                class="flex items-center gap-1.5 bg-surface-input px-2 py-1 rounded border border-card-border min-w-[150px] justify-between">
                                <div class="truncate mr-1">
                                    <span
                                        class="text-content-disabled font-sans text-[10px] uppercase tracking-wider mr-1">PW:</span>
                                    <template v-if="visiblePasswords[member.account.key]">{{
                                        member.account.data.auth }}</template>
                                    <span v-else class="tracking-widest text-content-disabled select-none">••••••••</span>
                                </div>

                                <div class="flex items-center gap-0.5 flex-shrink-0">
                                    <button @click="togglePasswordVisibility(member.account.key)"
                                        class="text-content-disabled hover:text-content-secondary p-0.5 rounded hover:bg-surface-input transition-colors">
                                        <component :is="visiblePasswords[member.account.key] ? EyeOff : Eye"
                                            :size="12" />
                                    </button>
                                    <button
                                        @click="copyToClipboard(member.account.data.auth, 'auth-' + member.account.key)"
                                        class="text-content-disabled hover:text-status-warning p-0.5 rounded hover:bg-surface-input transition-colors"
                                        :title="copiedKey === 'auth-' + member.account.key ? 'Kopiert!' : 'Passwort kopieren'">
                                        <component :is="copiedKey === 'auth-' + member.account.key ? Check : Copy"
                                            :size="12" />
                                    </button>
                                </div>
                            </div>

                        </div>

                        <div class="flex-shrink-0 flex lg:justify-end">
                            <button v-if="isOwnerView || String(member.userId) === String(currentUserId)"
                                @click="resendAccess(team.teamId, member.userId)"
                                :disabled="resendState[member.userId] === 'sending' || isDeploymentBusy"
                                :title="isDeploymentBusy
                                    ? $t('DeploymentDetailView.resendAccessBusyTooltip')
                                    : $t('DeploymentDetailView.resendAccessTooltip')"
                                class="w-full lg:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
                                :class="resendState[member.userId] === 'sent'
                                    ? 'bg-status-success text-white border-status-success'
                                    : resendState[member.userId] === 'error'
                                        ? 'bg-status-errorLight text-status-error border-status-error/30'
                                        : 'bg-surface-card text-content-secondary border-border hover:bg-surface-input disabled:opacity-50'">
                                <Loader2 v-if="resendState[member.userId] === 'sending'" :size="14"
                                    class="animate-spin" />
                                <Check v-else-if="resendState[member.userId] === 'sent'" :size="14" />
                                <AlertCircle v-else-if="resendState[member.userId] === 'error'" :size="14" />
                                <Send v-else :size="14" />
                                <span>
                                    {{ resendState[member.userId] === 'sending'
                                        ? $t('DeploymentDetailView.resendAccessSending')
                                        : resendState[member.userId] === 'sent'
                                            ? $t('DeploymentDetailView.resendAccessSent')
                                            : resendState[member.userId] === 'error'
                                                ? $t('DeploymentDetailView.resendAccessRetry')
                                                : $t('DeploymentDetailView.resendAccessButton') }}
                                </span>
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
