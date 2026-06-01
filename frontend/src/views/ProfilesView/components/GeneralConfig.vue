<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import { ModeOptions, LogLevelOptions } from '@/constant/kernel'
import { useBool } from '@/hooks'
import { generateSecureKey } from '@/utils'

interface Props {
  outboundOptions: { label: string; value: string }[]
}

defineProps<Props>()

const model = defineModel<{ name: string; log: IProfile['log']; experimental: IProfile['experimental'] }>({
  required: true,
})

const { t } = useI18n()
const [showMore, toggleMore] = useBool(false)
</script>

<template>
  <div class="bento-grid">
    <!-- Card 1: Profile Name (span-6) -->
    <div class="bento-card span-6">
      <div class="bento-card-title">
        <Icon icon="profiles" />
        {{ t('profile.name') }}
      </div>
      <div class="bento-card-desc">
        Configuration profile identifier name
      </div>
      <div class="bento-card-content">
        <Input v-model="model.name" autofocus :placeholder="t('profile.name')" :max-width="false" />
      </div>
    </div>

    <!-- Card 2: Clash API Default Mode (span-6) -->
    <div class="bento-card span-6">
      <div class="bento-card-title">
        <Icon icon="overview" />
        {{ t('kernel.clash_api.default_mode') }}
      </div>
      <div class="bento-card-desc">
        Clash API traffic routing mode default setting
      </div>
      <div class="bento-card-content">
        <Radio v-model="model.experimental.clash_api.default_mode" :options="ModeOptions" />
      </div>
    </div>

    <!-- Card 3: Log Configurations (span-6) -->
    <div class="bento-card span-6">
      <div class="bento-card-title">
        <Icon icon="log" />
        Log Settings
      </div>
      <div class="bento-card-desc">
        Kernel log output path, verbosity level, and timestamp
      </div>
      <div class="bento-card-content">
        <div class="form-item">
          {{ t('kernel.log.disabled') }}
          <Switch v-model="model.log.disabled" />
        </div>
        <template v-if="!model.log.disabled">
          <div class="form-item vertical">
            <span class="form-item-label">{{ t('kernel.log.level') }}</span>
            <Select v-model="model.log.level" :options="LogLevelOptions" />
          </div>
          <div class="form-item vertical">
            <span class="form-item-label">{{ t('kernel.log.output') }}</span>
            <Input v-model="model.log.output" editable :max-width="false" />
          </div>
          <div class="form-item">
            {{ t('kernel.log.timestamp') }}
            <Switch v-model="model.log.timestamp" />
          </div>
        </template>
      </div>
    </div>

    <!-- Card 4: External Controller & Security (span-6) -->
    <div class="bento-card span-6">
      <div class="bento-card-title">
        <Icon icon="grant" />
        Controller & Security
      </div>
      <div class="bento-card-desc">
        External dashboard API controller address and authorization secret
      </div>
      <div class="bento-card-content">
        <div class="form-item vertical">
          <span class="form-item-label">{{ t('kernel.clash_api.external_controller') }}</span>
          <Input v-model="model.experimental.clash_api.external_controller" editable :max-width="false" />
        </div>
        <div class="form-item vertical">
          <span class="form-item-label">{{ t('kernel.clash_api.secret') }}</span>
          <Input v-model="model.experimental.clash_api.secret" editable :max-width="false">
            <template #suffix>
              <Button
                type="text"
                size="small"
                icon="refresh"
                @click="() => (model.experimental.clash_api.secret = generateSecureKey())"
              />
            </template>
          </Input>
        </div>
      </div>
    </div>

    <!-- Toggle button for More configurations (span-12) -->
    <div class="span-12 bento-divider-toggle py-4">
      <div class="bento-divider-line left"></div>
      <Button type="text" size="small" @click="toggleMore" class="bento-divider-btn">
        {{ showMore ? t('common.collapse') : t('common.more') }}
      </Button>
      <div class="bento-divider-line right"></div>
    </div>

    <div class="bento-expand-wrapper" :class="{ expanded: showMore }">
      <div class="bento-expand-inner">
        <!-- Card 5: External UI Configurations (span-6) -->
        <div class="bento-card span-6">
          <div class="bento-card-title">
            <Icon icon="settings" />
            External UI
          </div>
          <div class="bento-card-desc">
            Dashboard path, download URL, proxy detour, and private network access
          </div>
          <div class="bento-card-content">
            <div class="form-item vertical">
              <span class="form-item-label">{{ t('kernel.clash_api.external_ui') }}</span>
              <Input v-model="model.experimental.clash_api.external_ui" editable :max-width="false" />
            </div>
            <div class="form-item vertical">
              <span class="form-item-label">{{ t('kernel.clash_api.external_ui_download_url') }}</span>
              <Input v-model="model.experimental.clash_api.external_ui_download_url" editable :max-width="false" />
            </div>
            <div class="form-item vertical">
              <span class="form-item-label">{{ t('kernel.clash_api.external_ui_download_detour') }}</span>
              <Select
                v-model="model.experimental.clash_api.external_ui_download_detour"
                :options="outboundOptions"
                clearable
              />
            </div>
            <div class="form-item">
              {{ t('kernel.clash_api.access_control_allow_private_network') }}
              <Switch v-model="model.experimental.clash_api.access_control_allow_private_network" />
            </div>
          </div>
        </div>

        <!-- Card 6: Cache File Settings (span-6) -->
        <div class="bento-card span-6">
          <div class="bento-card-title">
            <Icon icon="subscriptions" />
            Cache File
          </div>
          <div class="bento-card-desc">
            Cache resolution logs to a file to speed up domain lookups
          </div>
          <div class="bento-card-content">
            <div class="form-item">
              {{ t('kernel.cache_file.enabled') }}
              <Switch v-model="model.experimental.cache_file.enabled" />
            </div>
            <template v-if="model.experimental.cache_file.enabled">
              <div class="form-item vertical">
                <span class="form-item-label">{{ t('kernel.cache_file.path') }}</span>
                <Input v-model="model.experimental.cache_file.path" editable :max-width="false" />
              </div>
              <div class="form-item vertical">
                <span class="form-item-label">{{ t('kernel.cache_file.cache_id') }}</span>
                <Input v-model="model.experimental.cache_file.cache_id" editable :max-width="false" />
              </div>
              <div class="form-item">
                {{ t('kernel.cache_file.store_fakeip') }}
                <Switch v-model="model.experimental.cache_file.store_fakeip" />
              </div>
              <div class="form-item">
                {{ t('kernel.cache_file.store_rdrc') }}
                <Switch v-model="model.experimental.cache_file.store_rdrc" />
              </div>
            </template>
          </div>
        </div>

        <!-- Card 7: Access Control Allowed Origin (span-12) -->
        <div class="bento-card span-12">
          <div class="bento-card-title">
            <Icon icon="link" />
            {{ t('kernel.clash_api.access_control_allow_origin') }}
          </div>
          <div class="bento-card-desc">
            CORS configurations for external controller client requests
          </div>
          <div class="bento-card-content mt-8">
            <InputList v-model="model.experimental.clash_api.access_control_allow_origin" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
