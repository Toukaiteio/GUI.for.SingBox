<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import * as Stores from '@/stores'
import { message } from '@/utils'
import { AboutView, CommandView } from '@/components'

interface Props {
  loading: boolean
}

defineProps<Props>()

const appStore = Stores.useAppStore()
const kernelApiStore = Stores.useKernelApiStore()
const { t } = useI18n()

const guide = computed(() => appStore.subscriptionAttachGuide)
const guideMessage = computed(() => {
  if (!guide.value.active) return ''
  if (guide.value.step === 2) {
    return t('subscribes.attachGuide.step2Message', {
      outbound: guide.value.outboundTag,
    })
  }
  if (guide.value.step === 3) {
    return t('subscribes.attachGuide.step3Message', {
      subscription: guide.value.subscriptionName,
    })
  }
  if (guide.value.step === 4) {
    return kernelApiStore.needRestart || kernelApiStore.restarting
      ? t('subscribes.attachGuide.step4Message')
      : t('subscribes.attachGuide.step4PendingMessage')
  }
  return ''
})

const handleRestartCore = async () => {
  try {
    await kernelApiStore.restartCore()
    appStore.stopSubscriptionAttachGuide()
  } catch (error: unknown) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}
</script>

<template>
  <Modal
    v-model:open="appStore.showAbout"
    :cancel="false"
    :submit="false"
    mask-closable
    min-width="50"
  >
    <AboutView />
  </Modal>

  <Menu
    v-model="appStore.menuShow"
    :position="appStore.menuPosition"
    :menu-list="appStore.menuList"
  />

  <Tips
    v-model="appStore.tipsShow"
    :position="appStore.tipsPosition"
    :message="appStore.tipsMessage"
  />

  <CommandView v-if="!loading" />

  <div
    v-if="guideMessage"
    class="subscription-guide-card fixed top-24 right-24 px-12 py-10 rounded-8 shadow"
  >
    {{ guideMessage }}
  </div>

  <div
    v-if="kernelApiStore.needRestart || kernelApiStore.restarting"
    class="fixed right-32 bottom-32"
  >
    <Button
      v-tips="'home.overview.restart'"
      :loading="kernelApiStore.restarting"
      icon="restart"
      :class="{ 'guide-highlight': guide.active && guide.step === 4 }"
      class="rounded-full w-42 h-42 shadow"
      @click="handleRestartCore"
    />
  </div>
</template>

<style lang="less" scoped>
.subscription-guide-card {
  z-index: 1000001;
  max-width: 320px;
  color: var(--card-color);
  background: color-mix(in srgb, var(--card-bg) 92%, var(--primary-color) 8%);
  border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
}
</style>
