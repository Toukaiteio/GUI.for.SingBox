<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { DomainStrategyOptions } from '@/constant/kernel'

import DnsRulesConfig from './DnsRulesConfig.vue'
import DnsServersConfig from './DnsServersConfig.vue'

interface Props {
  inboundOptions: { label: string; value: string }[]
  outboundOptions: { label: string; value: string }[]
  ruleSet: IRuleSet[]
}

defineProps<Props>()

const model = defineModel<IDNS>({ required: true })

const serversOptions = computed(() =>
  model.value.servers.map((v) => ({ label: v.tag, value: v.id })),
)

const activeKey = ref('common')
const rulesConfigRef = useTemplateRef('rulesConfigRef')
const serversConfigRef = useTemplateRef('serversConfigRef')
const tabs = [
  { key: 'common', tab: 'kernel.dns.tab.common' },
  { key: 'servers', tab: 'kernel.dns.tab.servers' },
  { key: 'rules', tab: 'kernel.dns.tab.rules' },
]

const { t } = useI18n()

const handleAdd = () => {
  const handlerMap: Record<string, (() => void) | undefined> = {
    common: () => {},
    rules: rulesConfigRef.value?.handleAdd,
    servers: serversConfigRef.value?.handleAdd,
  }
  handlerMap[activeKey.value]?.()
}

defineExpose({ handleAdd })
</script>

<template>
  <Tabs v-model:active-key="activeKey" :items="tabs" tab-position="top">
    <template #common>
      <div class="bento-grid">
        <!-- Card 1: DNS Cache Settings (span-6) -->
        <div class="bento-card span-6">
          <div class="bento-card-title">
            <Icon icon="overview" />
            DNS Cache Settings
          </div>
          <div class="bento-card-desc">
            Enable or disable caching behavior for domain name resolution queries
          </div>
          <div class="bento-card-content">
            <div class="form-item">
              {{ t('kernel.dns.disable_cache') }}
              <Switch v-model="model.disable_cache" />
            </div>
            <div class="form-item">
              {{ t('kernel.dns.disable_expire') }}
              <Switch v-model="model.disable_expire" />
            </div>
            <div class="form-item">
              {{ t('kernel.dns.independent_cache') }}
              <Switch v-model="model.independent_cache" />
            </div>
          </div>
        </div>

        <!-- Card 2: Strategy & Default Server (span-6) -->
        <div class="bento-card span-6">
          <div class="bento-card-title">
            <Icon icon="settings" />
            Strategy & Fallback
          </div>
          <div class="bento-card-desc">
            Domain strategy routing options and final fallback DNS server
          </div>
          <div class="bento-card-content">
            <div class="form-item vertical">
              <span class="form-item-label">{{ t('kernel.dns.final') }}</span>
              <Select v-model="model.final" :options="serversOptions" />
            </div>
            <div class="form-item vertical">
              <span class="form-item-label">{{ t('kernel.dns.strategy') }}</span>
              <Select v-model="model.strategy" :options="DomainStrategyOptions" />
            </div>
          </div>
        </div>

        <!-- Card 3: Client Subnet (span-12) -->
        <div class="bento-card span-12">
          <div class="bento-card-title">
            <Icon icon="link" />
            {{ t('kernel.dns.client_subnet') }}
          </div>
          <div class="bento-card-desc">
            EDNS client subnet to optimize server response routing geographically
          </div>
          <div class="bento-card-content mt-4">
            <Input v-model="model.client_subnet" editable :max-width="false" />
          </div>
        </div>
      </div>
    </template>
    <template #servers>
      <DnsServersConfig
        ref="serversConfigRef"
        v-model="model.servers"
        :outbound-options="outboundOptions"
        :servers-options="serversOptions"
      />
    </template>
    <template #rules>
      <DnsRulesConfig
        ref="rulesConfigRef"
        v-model="model.rules"
        :inbound-options="inboundOptions"
        :outbound-options="outboundOptions"
        :servers-options="serversOptions"
        :rule-set="ruleSet"
      />
    </template>
  </Tabs>
</template>
