<script setup lang="ts">
import { ref, inject, computed, h } from 'vue'
import { useI18n } from 'vue-i18n'

import { HttpGet, RemoveFile } from '@/bridge'
import {
  DefaultTestTimeout,
  DefaultTestURL,
  RequestMethodOptions,
  RequestProxyModeOptions,
} from '@/constant/app'
import { RequestProxyMode } from '@/enums/app'
import { Outbound } from '@/enums/kernel'
import { useBool } from '@/hooks'
import {
  useAppSettingsStore,
  useAppStore,
  useKernelApiStore,
  useProfilesStore,
  useSubscribesStore,
} from '@/stores'
import { alert, confirm, deepClone, GetRequestProxy, ignoredError, message, modal } from '@/utils'

import Button from '@/components/Button/index.vue'
import ProfileForm from '@/views/ProfilesView/components/ProfileForm.vue'

import type { Subscription } from '@/types/app'

interface Props {
  id?: string
}

const props = defineProps<Props>()

const { t } = useI18n()
const [showMore, toggleShowMore] = useBool(false)
const appSettingsStore = useAppSettingsStore()
const appStore = useAppStore()
const kernelApiStore = useKernelApiStore()
const profilesStore = useProfilesStore()
const subscribeStore = useSubscribesStore()

const loading = ref(false)
const proxyTesting = ref(false)
const sub = ref<Subscription>(subscribeStore.getSubscribeTemplate())
const profileOutboundsStep = 2

const isManual = computed(() => sub.value.type === 'Manual')
const isRemote = computed(() => sub.value.type === 'Http')
const isCustomProxy = computed(() => sub.value.requestProxyMode === RequestProxyMode.Custom)
const showProxyTest = computed(() => sub.value.requestProxyMode !== RequestProxyMode.None)

const handleCancel = inject('cancel') as any
const handleSubmit = inject('submit') as any

const showAttachGuide = async () => {
  if (props.id || appSettingsStore.app.subscriptionNodeListGuideShown) return

  appSettingsStore.app.subscriptionNodeListGuideShown = true

  const currentProfile = profilesStore.currentProfile
  if (!currentProfile) {
    await alert(
      'subscribes.attachGuide.title',
      t('subscribes.attachGuide.noProfileMessage', {
        subscription: sub.value.name,
      }),
      { type: 'markdown' },
    )
    return
  }

  try {
    await confirm(
      'subscribes.attachGuide.title',
      t('subscribes.attachGuide.currentProfileMessage', {
        subscription: sub.value.name,
        profile: currentProfile.name,
      }),
      {
        type: 'markdown',
        cancelText: 'subscribes.attachGuide.later',
        okText: 'subscribes.attachGuide.openCurrentProfile',
      },
    )
  } catch {
    return
  }

  let profileModal: ReturnType<typeof modal> | undefined
  const targetOutbound = currentProfile.outbounds.find((outbound) =>
    [Outbound.Selector, Outbound.Urltest].includes(outbound.type as any),
  )
  if (!targetOutbound) {
    await alert(
      'subscribes.attachGuide.title',
      t('subscribes.attachGuide.noOutboundMessage', {
        subscription: sub.value.name,
        profile: currentProfile.name,
      }),
      { type: 'markdown' },
    )
    return
  }

  appStore.startSubscriptionAttachGuide({
    subscriptionId: sub.value.id,
    subscriptionName: sub.value.name,
    profileId: currentProfile.id,
    profileName: currentProfile.name,
    outboundId: targetOutbound.id,
    outboundTag: targetOutbound.tag,
  })

  profileModal = modal({
    width: '90',
    height: '90',
    afterClose: () => {
      if (appStore.subscriptionAttachGuide.active && !kernelApiStore.needRestart) {
        appStore.stopSubscriptionAttachGuide()
      }
      profileModal?.destroy()
    },
  })
  profileModal.setContent(ProfileForm, {
    id: currentProfile.id,
    step: profileOutboundsStep,
  })
  profileModal.open()
}

const handleSave = async () => {
  loading.value = true

  try {
    let shouldShowAttachGuide = false
    if (props.id) {
      await subscribeStore.editSubscribe(props.id, sub.value)
    } else {
      await subscribeStore.addSubscribe(sub.value)
      if (sub.value.type !== 'Manual') {
        await subscribeStore.updateSubscribe(sub.value.id)
        shouldShowAttachGuide = true
      }
    }
    await handleSubmit()
    if (shouldShowAttachGuide) {
      await showAttachGuide()
    }
  } catch (error: any) {
    if (!props.id) {
      await ignoredError(RemoveFile, sub.value.path)
      await subscribeStore.deleteSubscribe(sub.value.id)
    }
    console.error(error)
    message.error(error)
  }

  loading.value = false
}

const handleTestProxy = async () => {
  const proxy = await GetRequestProxy(sub.value.requestProxyMode, sub.value.customProxy)
  if (!proxy) {
    message.error('settings.requestProxy.empty')
    return
  }

  proxyTesting.value = true
  try {
    await HttpGet(DefaultTestURL, {}, { Proxy: proxy, Timeout: DefaultTestTimeout })
    message.success('settings.requestProxy.testSuccess')
  } catch (error) {
    message.error(error)
  } finally {
    proxyTesting.value = false
  }
}

if (props.id) {
  const s = subscribeStore.getSubscribeById(props.id)
  if (s) {
    sub.value = deepClone(s)
  }
}

const modalSlots = {
  cancel: () =>
    h(
      Button,
      {
        disabled: loading.value,
        onClick: handleCancel,
      },
      () => t('common.cancel'),
    ),
  submit: () =>
    h(
      Button,
      {
        type: 'primary',
        loading: loading.value,
        disabled: !sub.value.name || !sub.value.path || (!sub.value.url && !isManual.value),
        onClick: handleSave,
      },
      () => t('common.save'),
    ),
}

defineExpose({ modalSlots })
</script>

<template>
  <div>
    <div class="form-item">
      {{ t('subscribes.subtype') }}
      <Radio
        v-model="sub.type"
        :options="[
          { label: 'common.http', value: 'Http' },
          { label: 'common.file', value: 'File' },
          { label: 'subscribe.manual', value: 'Manual' },
        ]"
      />
    </div>
    <div class="form-item">
      {{ t('subscribe.name') }} *
      <div class="min-w-[75%]">
        <Input v-model="sub.name" autofocus class="w-full" />
      </div>
    </div>
    <div v-if="!isManual" class="form-item">
      {{ t(sub.type === 'Http' ? 'subscribe.url' : 'subscribe.localPath') }} *
      <div class="min-w-[75%]">
        <Input
          v-model="sub.url"
          :placeholder="sub.type === 'Http' ? 'http(s)://' : 'data/local/{filename}.json'"
          allow-paste
          class="w-full"
        />
      </div>
    </div>
    <div class="form-item">
      {{ t('subscribe.path') }} *
      <div class="min-w-[75%]">
        <Input v-model="sub.path" placeholder="data/subscribes/{filename}.json" class="w-full" />
      </div>
    </div>
    <Divider v-if="!isManual">
      <Button type="text" size="small" @click="toggleShowMore">
        {{ t('common.more') }}
      </Button>
    </Divider>
    <div v-if="showMore && !isManual">
      <div class="form-item">
        {{ t('subscribe.include') }}
        <div class="min-w-[75%]">
          <Input v-model="sub.include" placeholder="keyword1|keyword2" class="w-full" />
        </div>
      </div>
      <div class="form-item">
        {{ t('subscribe.exclude') }}
        <div class="min-w-[75%]">
          <Input v-model="sub.exclude" placeholder="keyword1|keyword2" class="w-full" />
        </div>
      </div>
      <div class="form-item">
        {{ t('subscribe.includeProtocol') }}
        <div class="min-w-[75%]">
          <Input
            v-model="sub.includeProtocol"
            placeholder="direct|mixed|socks|http..."
            class="w-full"
          />
        </div>
      </div>
      <div class="form-item">
        {{ t('subscribe.excludeProtocol') }}
        <div class="min-w-[75%]">
          <Input
            v-model="sub.excludeProtocol"
            placeholder="direct|mixed|socks|http..."
            class="w-full"
          />
        </div>
      </div>
      <div class="form-item">
        {{ t('subscribe.proxyPrefix') }}
        <div class="min-w-[75%]">
          <Input v-model="sub.proxyPrefix" class="w-full" />
        </div>
      </div>
      <template v-if="isRemote">
        <div class="form-item">
          {{ t('subscribe.website') }}
          <div class="min-w-[75%]">
            <Input v-model="sub.website" placeholder="http(s)://" class="w-full" />
          </div>
        </div>
        <div class="form-item">
          {{ t('subscribe.inSecure') }}
          <Switch v-model="sub.inSecure" />
        </div>
        <div class="form-item">
          {{ t('subscribe.requestTimeout') }}
          <Input v-model="sub.requestTimeout" type="number" :min="3" :max="180" />
        </div>
        <div class="form-item">
          {{ t('subscribe.requestMethod') }}
          <Radio v-model="sub.requestMethod" :options="RequestMethodOptions" />
        </div>
        <div class="form-item">
          {{ t('settings.requestProxy.name') }}
          <div class="flex items-center gap-4">
            <Button
              v-if="showProxyTest"
              :loading="proxyTesting"
              type="primary"
              size="small"
              @click="handleTestProxy"
            >
              {{ t('settings.requestProxy.test') }}
            </Button>
            <Radio v-model="sub.requestProxyMode" :options="RequestProxyModeOptions" />
          </div>
        </div>
        <div v-if="isCustomProxy" class="form-item">
          {{ t('settings.requestProxy.custom') }}
          <div class="min-w-[75%]">
            <Input
              v-model="sub.customProxy"
              placeholder="scheme://username:password@host:port"
              clearable
              class="w-full"
            />
          </div>
        </div>
        <div
          :class="{ 'items-start': Object.keys(sub.header.request).length !== 0 }"
          class="form-item"
        >
          {{ t('subscribe.header.request') }}
          <KeyValueEditor v-model="sub.header.request" />
        </div>
        <div
          :class="{ 'items-start': Object.keys(sub.header.response).length !== 0 }"
          class="form-item"
        >
          {{ t('subscribe.header.response') }}
          <KeyValueEditor v-model="sub.header.response" />
        </div>
      </template>
    </div>
  </div>
</template>
