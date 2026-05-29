<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { Branch } from '@/enums/app'
import { useCoreBranch } from '@/hooks/useCoreBranch'
import { useAppSettingsStore, useKernelApiStore } from '@/stores'

const emit = defineEmits(['close'])

const { t } = useI18n()
const appSettings = useAppSettingsStore()
const kernelApiStore = useKernelApiStore()

const {
  remoteVersion: stableRemoteVersion,
  remoteVersionLoading: stableRemoteVersionLoading,
  downloading: stableDownloading,
  downloadCompleted: stableDownloadCompleted,
  downloadProgress: stableDownloadProgress,
  cancelDownload: cancelStableDownload,
  downloadCore: downloadStableCore,
} = useCoreBranch(false)

const {
  remoteVersion: alphaRemoteVersion,
  remoteVersionLoading: alphaRemoteVersionLoading,
  downloading: alphaDownloading,
  downloadCompleted: alphaDownloadCompleted,
  downloadProgress: alphaDownloadProgress,
  cancelDownload: cancelAlphaDownload,
  downloadCore: downloadAlphaCore,
} = useCoreBranch(true)

const installCore = async (branch: Branch, downloadCore: () => Promise<void>) => {
  appSettings.app.kernel.branch = branch
  await downloadCore()

  const completed = branch === Branch.Alpha ? alphaDownloadCompleted : stableDownloadCompleted
  if (completed.value) {
    await kernelApiStore.initCoreState()
    emit('close')
  }
}
</script>

<template>
  <div class="flex flex-col gap-12">
    <div class="text-14">{{ t('settings.kernel.installPrompt.description') }}</div>
    <div class="grid grid-cols-2 gap-8">
      <Card title="sing-box">
        <div class="text-12 py-4">{{ t('settings.kernel.stable') }}</div>
        <Tag class="mb-8">
          {{ t('settings.kernel.remote') }}:
          {{ stableRemoteVersionLoading ? 'Loading' : stableRemoteVersion || t('common.none') }}
        </Tag>
        <div class="flex items-center gap-4">
          <Button
            :loading="stableDownloading"
            type="primary"
            icon="sparkle"
            @click="installCore(Branch.Main, downloadStableCore)"
          >
            {{
              stableDownloading
                ? stableDownloadProgress
                : t('settings.kernel.installPrompt.installStable')
            }}
          </Button>
          <Button
            v-if="stableDownloading && cancelStableDownload"
            type="text"
            icon="close"
            @click="cancelStableDownload"
          />
        </div>
      </Card>
      <Card title="Alpha">
        <div class="text-12 py-4">{{ t('settings.kernel.alpha') }}</div>
        <Tag class="mb-8">
          {{ t('settings.kernel.remote') }}:
          {{ alphaRemoteVersionLoading ? 'Loading' : alphaRemoteVersion || t('common.none') }}
        </Tag>
        <div class="flex items-center gap-4">
          <Button
            :loading="alphaDownloading"
            type="primary"
            icon="sparkle"
            @click="installCore(Branch.Alpha, downloadAlphaCore)"
          >
            {{
              alphaDownloading
                ? alphaDownloadProgress
                : t('settings.kernel.installPrompt.installAlpha')
            }}
          </Button>
          <Button
            v-if="alphaDownloading && cancelAlphaDownload"
            type="text"
            icon="close"
            @click="cancelAlphaDownload"
          />
        </div>
      </Card>
    </div>
  </div>
</template>
