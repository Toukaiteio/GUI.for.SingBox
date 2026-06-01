<script setup lang="ts">
import { ref, inject, computed, useTemplateRef, type Ref, h } from 'vue'
import { useI18n } from 'vue-i18n'

import { useProfilesStore } from '@/stores'
import { deepClone, generateConfig, message, alert } from '@/utils'

import Button from '@/components/Button/index.vue'

interface Props {
  id?: string
  step?: number
}

enum Step {
  General = 0,
  Inbounds = 1,
  Outbounds = 2,
  Route = 3,
  Dns = 4,
  MixinScript = 5,
}

const props = withDefaults(defineProps<Props>(), {
  id: '',
  isUpdate: false,
  step: Step.General,
})

import DnsConfig from './DnsConfig.vue'
import GeneralConfig from './GeneralConfig.vue'
import InboundsConfig from './InboundsConfig.vue'
import MixinAndScript from './MixinAndScriptConfig.vue'
import OutboundsConfig from './OutboundsConfig.vue'
import RouteConfig from './RouteConfig.vue'

const { t } = useI18n()
const inboundsRef = useTemplateRef('inboundsRef')
const outboundsRef = useTemplateRef('outboundsRef')
const routeRef = useTemplateRef('routeRef')
const dnsRef = useTemplateRef('dnsRef')
const profilesStore = useProfilesStore()

const loading = ref(false)

const stepItems = [
  { title: 'profile.step.general' },
  { title: 'profile.step.inbounds' },
  { title: 'profile.step.outbounds' },
  { title: 'profile.step.route' },
  { title: 'profile.step.dns' },
  { title: 'profile.step.mixin-script' },
] as const

const tabItems = computed(() => [
  { key: 'general', tab: 'profile.step.general', disabled: !profile.value.name && activeKey.value !== 'general' },
  { key: 'inbounds', tab: 'profile.step.inbounds', disabled: !profile.value.name && activeKey.value !== 'inbounds' },
  { key: 'outbounds', tab: 'profile.step.outbounds', disabled: !profile.value.name && activeKey.value !== 'outbounds' },
  { key: 'route', tab: 'profile.step.route', disabled: !profile.value.name && activeKey.value !== 'route' },
  { key: 'dns', tab: 'profile.step.dns', disabled: !profile.value.name && activeKey.value !== 'dns' },
  { key: 'mixin-script', tab: 'profile.step.mixin-script', disabled: !profile.value.name && activeKey.value !== 'mixin-script' },
])

const activeKey = ref('general')

const currentStep = computed(() => {
  const map: Record<string, number> = {
    general: Step.General,
    inbounds: Step.Inbounds,
    outbounds: Step.Outbounds,
    route: Step.Route,
    dns: Step.Dns,
    'mixin-script': Step.MixinScript,
  }
  return map[activeKey.value] ?? Step.General
})

const keyList = ['general', 'inbounds', 'outbounds', 'route', 'dns', 'mixin-script']
if (props.step !== undefined && keyList[props.step]) {
  activeKey.value = keyList[props.step] || 'general'
}

const profile = ref<IProfile>(profilesStore.getProfileTemplate())

const inboundOptions = computed(() =>
  profile.value.inbounds.map((v) => ({ label: v.tag, value: v.id })),
)

const outboundOptions = computed(() =>
  profile.value.outbounds.map((v) => ({ label: v.tag, value: v.id })),
)

const serverOptions = computed(() =>
  profile.value.dns.servers.map((v) => ({ label: v.tag, value: v.id })),
)

const generalConfig = computed({
  get() {
    return { name: profile.value.name, log: profile.value.log, experimental: profile.value.experimental }
  },
  set({ name, log, experimental }) {
    profile.value.name = name
    profile.value.log = log
    profile.value.experimental = experimental
  },
})

const mixinAndScriptConfig = computed({
  get() {
    return { mixin: profile.value.mixin, script: profile.value.script }
  },
  set({ mixin, script }) {
    profile.value.mixin = mixin
    profile.value.script = script
  },
})

const handleCancel = inject('cancel') as any
const handleSubmit = inject('submit') as any

const handleSave = async () => {
  loading.value = true
  try {
    if (props.id) {
      await profilesStore.editProfile(props.id, profile.value)
    } else {
      await profilesStore.addProfile(profile.value)
    }
    await handleSubmit()
  } catch (error: any) {
    console.error('handleSave: ', error)
    message.error(error)
  }
  loading.value = false
}

const handleAdd = () => {
  const map: Record<number, Ref> = {
    [Step.Inbounds]: inboundsRef,
    [Step.Outbounds]: outboundsRef,
    [Step.Route]: routeRef,
    [Step.Dns]: dnsRef,
  }
  map[currentStep.value]!.value.handleAdd()
}

const handlePreview = async () => {
  try {
    const config = await generateConfig(profile.value)
    alert(profile.value.name, JSON.stringify(config, null, 2))
  } catch (error: any) {
    message.error(error.message || error)
  }
}

if (props.id) {
  const p = profilesStore.getProfileById(props.id)
  if (p) {
    profile.value = deepClone(p)
  }
}

const modalSlots = {
  title: () => h('div', { class: 'font-bold' }, t(stepItems[currentStep.value]!.title)),

  toolbar: () => [
    h(Button, {
      type: 'text',
      icon: 'file',
      onClick: handlePreview,
    }),
    h(Button, {
      type: 'text',
      icon: 'add',
      style: {
        display: [Step.Inbounds, Step.Outbounds, Step.Route, Step.Dns].includes(currentStep.value)
          ? ''
          : 'none',
      },
      onClick: handleAdd,
    }),
  ],
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
        disabled: !profile.value.name,
        onClick: handleSave,
      },
      () => t('common.save'),
    ),
}

defineExpose({ modalSlots })
</script>

<template>
  <div class="profile-form-container h-full">
    <Tabs
      v-model:active-key="activeKey"
      :items="tabItems"
      tab-width="130px"
      content-width="calc(100% - 130px)"
      class="h-full"
    >
      <template #general>
        <GeneralConfig v-model="generalConfig" :outbound-options="outboundOptions" />
      </template>
      <template #inbounds>
        <div class="pr-8">
          <InboundsConfig ref="inboundsRef" v-model="profile.inbounds" />
        </div>
      </template>
      <template #outbounds>
        <div class="pr-8">
          <OutboundsConfig ref="outboundsRef" v-model="profile.outbounds" />
        </div>
      </template>
      <template #route>
        <div class="pr-8">
          <RouteConfig
            ref="routeRef"
            v-model="profile.route"
            :inbound-options="inboundOptions"
            :outbound-options="outboundOptions"
            :server-options="serverOptions"
          />
        </div>
      </template>
      <template #dns>
        <div class="pr-8">
          <DnsConfig
            ref="dnsRef"
            v-model="profile.dns"
            :inbound-options="inboundOptions"
            :outbound-options="outboundOptions"
            :rule-set="profile.route.rule_set"
          />
        </div>
      </template>
      <template #mixin-script>
        <div class="pr-8">
          <MixinAndScript v-model="mixinAndScriptConfig" />
        </div>
      </template>
    </Tabs>
  </div>
</template>
