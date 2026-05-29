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
const currentStep = ref(props.step)

const stepItems = [
  { title: 'profile.step.general' },
  { title: 'profile.step.inbounds' },
  { title: 'profile.step.outbounds' },
  { title: 'profile.step.route' },
  { title: 'profile.step.dns' },
  { title: 'profile.step.mixin-script' },
] as const

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
    return { log: profile.value.log, experimental: profile.value.experimental }
  },
  set({ log, experimental }) {
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
  <div class="flex gap-16 h-full overflow-hidden">
    <div class="shrink-0 flex flex-col gap-2 overflow-y-auto" style="width: 130px">
      <Button
        v-for="(item, index) in stepItems"
        :key="item.title"
        :type="currentStep === index ? 'link' : 'text'"
        :disabled="!profile.name && currentStep !== index"
        class="w-full"
        @click="currentStep = index"
      >
        {{ t(item.title) }}
      </Button>
    </div>
    <div class="flex-1 overflow-auto">
      <div v-if="currentStep === Step.General">
        <div class="form-item">
          {{ t('profile.name') }}
          <Input v-model="profile.name" autofocus :placeholder="t('profile.name')" />
        </div>
        <GeneralConfig v-model="generalConfig" :outbound-options="outboundOptions" />
      </div>
      <div v-if="currentStep === Step.Inbounds">
        <InboundsConfig ref="inboundsRef" v-model="profile.inbounds" />
      </div>
      <div v-if="currentStep === Step.Outbounds">
        <OutboundsConfig ref="outboundsRef" v-model="profile.outbounds" />
      </div>
      <div v-if="currentStep === Step.Route">
        <RouteConfig
          ref="routeRef"
          v-model="profile.route"
          :inbound-options="inboundOptions"
          :outbound-options="outboundOptions"
          :server-options="serverOptions"
        />
      </div>
      <div v-if="currentStep === Step.Dns">
        <DnsConfig
          ref="dnsRef"
          v-model="profile.dns"
          :inbound-options="inboundOptions"
          :outbound-options="outboundOptions"
          :rule-set="profile.route.rule_set"
        />
      </div>
      <div v-if="currentStep === Step.MixinScript">
        <MixinAndScript v-model="mixinAndScriptConfig" />
      </div>
    </div>
  </div>
</template>
