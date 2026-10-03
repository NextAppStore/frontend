<script setup lang="ts">
import { Server, Network, Shield, AlertCircle, RefreshCw } from 'lucide-vue-next'
import InfrastructureVmCard from '@/components/InfrastructureVmCard.vue'
import type { DeploymentResource } from '@/types'

defineProps<{
  vmResources: DeploymentResource[]
  networkResources: DeploymentResource[]
  securityResources: DeploymentResource[]
  resourcesLoading: boolean
  resourcesError: string | null
  redeployInFlight: Set<string>
  openDrawerAddress: string | null
  loadResources: () => Promise<void>
  openVmDrawer: (address: string) => void
  redeployVm: (address: string) => void
}>()
</script>

<template>
    <!-- Infrastructure section — per-VM cards + read-only listings.
         Owner-only (the backend gates it the same way); members
         skip the section entirely so they don't see an empty/
         permission-error panel. Visually mirrors the other
         page sections (Teams, Tasks, Outputs): same
         ``bg-white rounded-xl border ... p-6 shadow-sm`` shell,
         same icon-tile header, same sub-section spacing. -->
    <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm mb-8">
        <div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-surface-input rounded-lg">
                    <Server :size="20" class="text-content-secondary" />
                </div>
                <span class="text-lg font-semibold text-content-primary">Infrastruktur</span>
            </div>
            <button
                @click="loadResources()"
                :disabled="resourcesLoading"
                class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-surface-input disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors"
                title="Live-Status neu abfragen"
            >
                <RefreshCw :size="13" :class="resourcesLoading ? 'animate-spin' : ''" />
                Aktualisieren
            </button>
        </div>

        <div
            v-if="resourcesError"
            class="text-sm p-3 rounded-lg border bg-status-errorLight text-status-error border-status-error/30 mb-4 flex items-start gap-2"
        >
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <p>{{ resourcesError }}</p>
        </div>

        <!-- VMs — primary section, cards inherit their own visual
             styling from ``InfrastructureVmCard``. -->
        <section class="mb-6">
            <div class="flex items-center gap-2 mb-3">
                <Server :size="14" class="text-content-disabled" />
                <h3 class="text-sm font-bold uppercase tracking-wider text-content-secondary">
                    Virtuelle Maschinen
                </h3>
                <span
                    v-if="vmResources.length > 0"
                    class="px-2 py-0.5 bg-surface-input text-content-secondary text-xs font-bold rounded"
                >
                    {{ vmResources.length }}
                </span>
            </div>
            <div
                v-if="resourcesLoading && vmResources.length === 0"
                class="text-sm text-content-secondary italic px-4 py-6 bg-surface-input rounded-lg border border-card-border text-center"
            >
                Lade VMs…
            </div>
            <div
                v-else-if="vmResources.length === 0"
                class="text-sm text-content-secondary italic px-4 py-6 bg-surface-input rounded-lg border border-card-border text-center"
            >
                Keine VMs im aktuellen Terraform-State.
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfrastructureVmCard
                    v-for="vm in vmResources"
                    :key="vm.address"
                    :resource="vm"
                    :redeploying="redeployInFlight.has(vm.address)"
                    :is-expanded="openDrawerAddress === vm.address"
                    @open-details="openVmDrawer"
                    @redeploy="redeployVm"
                />
            </div>
        </section>

        <!-- Networks / Subnets / Floating IPs (read-only) -->
        <section v-if="networkResources.length > 0" class="mb-6">
            <div class="flex items-center gap-2 mb-3">
                <Network :size="14" class="text-content-disabled" />
                <h3 class="text-sm font-bold uppercase tracking-wider text-content-secondary">
                    Netzwerk
                </h3>
                <span class="px-2 py-0.5 bg-surface-input text-content-secondary text-xs font-bold rounded">
                    {{ networkResources.length }}
                </span>
            </div>
            <ul class="space-y-1.5 text-xs">
                <li
                    v-for="res in networkResources"
                    :key="res.address"
                    class="px-3 py-2 bg-surface-input rounded-lg border border-card-border flex items-center justify-between"
                >
                    <div class="min-w-0">
                        <p class="font-semibold text-content-primary truncate">
                            {{ res.display_name }}
                        </p>
                        <p class="text-content-secondary font-mono truncate" :title="res.address">
                            {{ res.address }}
                        </p>
                    </div>
                    <span class="text-[10px] uppercase tracking-wider bg-surface-card px-2 py-0.5 rounded border border-border text-content-secondary ml-2 shrink-0">
                        {{ res.category }}
                    </span>
                </li>
            </ul>
        </section>

        <!-- Security Groups (read-only) -->
        <section v-if="securityResources.length > 0">
            <div class="flex items-center gap-2 mb-3">
                <Shield :size="14" class="text-content-disabled" />
                <h3 class="text-sm font-bold uppercase tracking-wider text-content-secondary">
                    Sicherheit
                </h3>
                <span class="px-2 py-0.5 bg-surface-input text-content-secondary text-xs font-bold rounded">
                    {{ securityResources.length }}
                </span>
            </div>
            <ul class="space-y-1.5 text-xs">
                <li
                    v-for="res in securityResources"
                    :key="res.address"
                    class="px-3 py-2 bg-surface-input rounded-lg border border-card-border"
                >
                    <p class="font-semibold text-content-primary">{{ res.display_name }}</p>
                    <p class="text-content-secondary font-mono">{{ res.address }}</p>
                </li>
            </ul>
        </section>
    </div>
</template>
