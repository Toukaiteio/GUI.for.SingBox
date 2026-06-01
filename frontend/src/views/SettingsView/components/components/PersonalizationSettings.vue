<script lang="ts" setup>
import { BrowserOpenURL, MakeDir, OpenDir } from '@/bridge'
import { DefaultFontFamily, LocalesFilePath, ThemeOptions } from '@/constant/app'
import routes from '@/router/routes'
import { useAppSettingsStore, useAppStore } from '@/stores'
import { APP_LOCALES_URL } from '@/utils'

const pages = routes.flatMap((route) => {
  if (route.meta?.hidden !== undefined) return []
  return {
    label: route.meta!.name,
    value: route.name as string,
  }
})

const appStore = useAppStore()
const appSettings = useAppSettingsStore()

const resetFontFamily = () => {
  appSettings.app.fontFamily = DefaultFontFamily
}

const onThemeClick = (e: MouseEvent) => {
  document.documentElement.style.setProperty('--x', e.clientX + 'px')
  document.documentElement.style.setProperty('--y', e.clientY + 'px')
}

const handleOpenLocalesFolder = async () => {
  await MakeDir(LocalesFilePath)
  await OpenDir(LocalesFilePath)
}
</script>
<template>
  <div class="px-8 py-12 text-18 font-bold">{{ $t('settings.personalization') }}</div>

  <Card>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.theme.name') }}</div>
      <Radio v-model="appSettings.app.theme" :options="ThemeOptions" @click="onThemeClick" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="flex items-center text-16 font-bold">
        <div class="mr-4">{{ $t('settings.lang.name') }}</div>
        <Button type="text" icon="link" @click="BrowserOpenURL(APP_LOCALES_URL)" />
        <Button type="text" icon="folder" @click="handleOpenLocalesFolder" />
        <Button
          v-tips="'settings.lang.load'"
          :loading="appStore.localesLoading"
          type="text"
          icon="refresh"
          @click="appStore.loadLocales()"
        />
      </div>
      <Radio v-model="appSettings.app.lang" :options="appStore.locales" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.fontFamily') }}</div>
      <Input v-model="appSettings.app.fontFamily" editable class="text-14">
        <template #suffix>
          <Button
            v-tips="'settings.resetFont'"
            type="text"
            size="small"
            icon="reset"
            @click="resetFontFamily"
          />
        </template>
      </Input>
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.pages.name') }}</div>
      <CheckBox v-model="appSettings.app.pages" :options="pages" />
    </div>
  </Card>

  <Card>
    <div class="px-8 py-12 text-16 font-bold">{{ $t('settings.background.name') }}</div>
    <template v-for="mode in (['light', 'dark'] as const)" :key="mode">
      <Divider>{{ $t('settings.background.' + mode) }}</Divider>
      <div class="px-8 py-12 flex items-center justify-between">
        <div class="text-14 font-bold">{{ $t('settings.background.image') }}</div>
        <Input
          v-model="appSettings.app.background[mode].image"
          editable
          clearable
          :placeholder="$t('settings.background.imageTip')"
          class="text-14"
        />
      </div>
      <div class="px-8 py-12 flex items-center justify-between">
        <div class="text-14 font-bold">{{ $t('settings.background.blur') }}</div>
        <Input
          v-model="appSettings.app.background[mode].blur"
          :min="0"
          :max="50"
          editable
          type="number"
        >
          <template #suffix="{ showInput }"><span class="ml-4" @click="showInput">px</span></template>
        </Input>
      </div>
      <div class="px-8 py-12 flex items-center justify-between">
        <div class="text-14 font-bold">{{ $t('settings.background.opacity') }}</div>
        <Input
          v-model="appSettings.app.background[mode].opacity"
          :min="0"
          :max="100"
          editable
          type="number"
        >
          <template #suffix="{ showInput }"><span class="ml-4" @click="showInput">%</span></template>
        </Input>
      </div>
    </template>
  </Card>
</template>
