<script setup lang="ts">
import { Package, GitBranch, Calendar, User } from 'lucide-vue-next'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import type { DeploymentWithRelations } from '@/types'

defineProps<{
  deployment: DeploymentWithRelations
  deploymentTimestamp: string
}>()
</script>

<template>
    <!-- Main info grid with 3 cards -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Deployment info card -->
        <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                <Package :size="20" class="text-primary" />
                Deployment Info
            </h2>
            <div class="space-y-4">
                <div>
                    <div class="text-xs text-content-disabled uppercase tracking-wide mb-1">
                        {{ $t('DeploymentsView.deploymentName') }}
                    </div>
                    <div class="text-sm font-medium text-content-primary">{{ deployment.name }}</div>
                </div>
                <div>
                    <div class="text-xs text-content-disabled uppercase tracking-wide mb-1">Release Tag</div>
                    <div class="text-sm">
                        <span
                            class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-tag-neutralLight text-tag-neutral border border-tag-neutralBorder">
                            <GitBranch :size="12" class="mr-1" />
                            {{ deployment.releaseTag }}
                        </span>
                    </div>
                </div>
                <div>
                    <div class="text-xs text-content-disabled uppercase tracking-wide mb-1">
                        {{ $t('DeploymentDetailView.deploymentCreated') }}
                    </div>
                    <div class="text-sm font-medium text-content-secondary flex items-center gap-1">
                        <Calendar :size="14" />
                        {{ deploymentTimestamp }}
                    </div>
                </div>
            </div>
        </div>

        <!-- App info card -->
        <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                <Package :size="20" class="text-status-success" />
                {{ $t('DeploymentsView.deploymentApp') }}
            </h2>
            <div class="space-y-4" v-if="deployment.app">
                <div>
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">App Name</div>
                    <div class="text-sm font-medium text-content-primary">{{ deployment.app.name }}</div>
                </div>
                <div>
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">{{
                        $t('DeploymentDetailView.deploymentDescription') }}</div>
                    <MarkdownRenderer
                        v-if="deployment.app.description && deployment.app.description.trim()"
                        :source="deployment.app.description"
                        variant="compact"
                        :clamp="3"
                        :expandable="true"
                        class="text-sm"
                    />
                    <div v-else class="text-sm text-content-secondary italic">No description</div>
                </div>
                <div>
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Git Repository</div>
                    <a :href="deployment.app.git_link ?? undefined" target="_blank"
                        class="text-sm text-tag-info hover:opacity-80 underline break-all">
                        {{ deployment.app.git_link }}
                    </a>
                </div>
            </div>
            <div v-else class="text-sm text-content-secondary">No app information available</div>
        </div>

        <!-- User info card -->
        <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                <User :size="20" class="text-tag-info" />
                {{ $t('DeploymentDetailView.deploymentOwner') }}
            </h2>
            <div class="space-y-4" v-if="deployment.user">
                <div>
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">{{
                        $t('DeploymentDetailView.deploymentUserName') }}</div>
                    <div class="text-sm font-medium text-content-primary flex items-center gap-2">
                        <div
                            class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary font-bold">
                            {{ deployment.user.username.substring(0, 2).toUpperCase() }}
                        </div>
                        {{ deployment.user.username }}
                    </div>
                </div>
                <div>
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">Email</div>
                    <div class="text-sm text-content-secondary">{{ deployment.user.email }}</div>
                </div>
                <div>
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1">{{
                        $t('DeploymentDetailView.deploymentUserRole') }}</div>
                    <div class="text-sm">
                        <span
                            class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-tag-accentLight text-tag-accent border border-tag-accentBorder capitalize">
                            {{ deployment.user.role }}
                        </span>
                    </div>
                </div>
            </div>
            <div v-else class="text-sm text-content-secondary">No user information available</div>
        </div>
    </div>
</template>