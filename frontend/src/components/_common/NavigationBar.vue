<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import rawRoutes from '@/router/routes'
import { useAppSettingsStore } from '@/stores'

const { t } = useI18n()
const appSettings = useAppSettingsStore()

const routes = computed(() =>
  rawRoutes.filter(
    (r) =>
      r.meta?.hidden === false ||
      (!r.meta?.hidden && appSettings.app.pages.includes(r.name! as string)),
  ),
)
</script>

<template>
  <div class="hypr-dock flex flex-col items-center gap-8 py-16 px-8 border-r border-white border-opacity-10 overflow-y-auto">
    <RouterLink
      v-for="r in routes"
      :key="r.path"
      v-slot="{ navigate, isActive }"
      :to="r.path"
      custom
    >
      <Button
        v-tips.fast="(r.meta && t(r.meta.name)) || (r.name as string)"
        :type="isActive ? 'primary' : 'text'"
        :icon="r.meta && r.meta.icon"
        :icon-size="20"
        :class="['hypr-dock-item', { 'hypr-dock-active': isActive }]"
        @click="navigate"
      />
    </RouterLink>
  </div>
</template>
