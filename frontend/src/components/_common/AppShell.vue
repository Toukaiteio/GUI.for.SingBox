<script setup lang="ts">
import { NavigationBar, TitleBar } from '@/components'
</script>

<template>
  <div class="flex-1 flex flex-col hypr-panel overflow-hidden">
    <TitleBar />
    <div class="flex-1 flex overflow-hidden min-h-0 border-t border-white border-opacity-10">
      <NavigationBar />
      <div class="flex-1 flex flex-col overflow-y-auto p-16 min-h-0">
        <RouterView #="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>
  </div>
</template>
