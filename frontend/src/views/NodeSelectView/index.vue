<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import logo from '@/assets/logo'
import { useKernelApiStore, useProfilesStore } from '@/stores'
import { message } from '@/utils'

import GroupsController from '@/views/HomeView/components/GroupsController.vue'

const { t } = useI18n()
const kernelApiStore = useKernelApiStore()
const profilesStore = useProfilesStore()

const handleStartKernel = async () => {
  try {
    await kernelApiStore.startCore()
  } catch (error: any) {
    console.error(error)
    message.error(error.message || error)
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <GroupsController v-if="kernelApiStore.running" />
    <div v-else class="h-[90%] flex flex-col items-center justify-center">
      <img :src="logo" draggable="false" class="w-128 mb-16" />
      <p class="mb-12">{{ t('home.controller.needCore') }}</p>
      <Button
        v-if="profilesStore.profiles.length > 0"
        :loading="kernelApiStore.starting"
        type="primary"
        @click="handleStartKernel"
      >
        {{ t('home.overview.start') }}
      </Button>
    </div>
  </div>
</template>
