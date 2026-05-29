<script lang="ts" setup>
import { OS } from '@/enums/app'
import { useAppSettingsStore } from '@/stores'
import { message } from '@/utils'
import { openDeveloperTools } from '@/utils/devTools'

const appSettings = useAppSettingsStore()

const handleOpenDeveloperTools = () => {
  openDeveloperTools().catch((error) => message.error(error.message || error))
}
</script>

<template>
  <div class="px-8 py-12 text-18 font-bold">{{ $t('settings.features') }}</div>

  <Card>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.developerMode.name') }}
        <span class="font-normal text-12">
          ({{ $t('settings.developerMode.tips') }} / {{ $t('settings.needRestart') }})
        </span>
      </div>
      <div class="flex items-center gap-8">
        <Button
          v-if="appSettings.app.developerMode"
          type="primary"
          size="small"
          @click="handleOpenDeveloperTools"
        >
          {{ $t('common.open') }}
        </Button>
        <Switch v-model="appSettings.app.developerMode" />
      </div>
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.debugOutline') }}</div>
      <Switch v-model="appSettings.app.debugOutline" />
    </div>
    <div v-platform="[OS.Linux]" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.debugBorder') }}</div>
      <Switch v-model="appSettings.app.debugBorder" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.debugNoAnimation') }}</div>
      <Switch v-model="appSettings.app.debugNoAnimation" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.debugNoRounded') }}</div>
      <Switch v-model="appSettings.app.debugNoRounded" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.debugUsePointer') }}</div>
      <Switch v-model="appSettings.app.debugUsePointer" />
    </div>
  </Card>
</template>
