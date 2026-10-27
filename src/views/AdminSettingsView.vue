<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/ui/PageHeader.vue'
import AccentColorSettings from '@/components/AccentColorSettings.vue'

const { t } = useI18n()
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <PageHeader :title="t('AdminSettingsView.title')" :subtitle="t('AdminSettingsView.subtitle')" />

    <AccentColorSettings class="mt-6" />
  </div>
</template>
