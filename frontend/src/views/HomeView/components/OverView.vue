<script setup lang="ts">
import { ref, onUnmounted, nextTick, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { ProcessMemory } from '@/bridge'
import { ModeOptions } from '@/constant/kernel'
import { useEnvStore, useAppStore, useKernelApiStore, useAppSettingsStore } from '@/stores'
import { formatBytes, handleChangeMode, message } from '@/utils'

import { useModal } from '@/components/Modal'

import CommonController from './CommonController.vue'
import ConnectionsController from './ConnectionsController.vue'
import LogsController from './LogsController.vue'

const trafficHistory = ref<[number[], number[]]>([[], []])
const statistics = ref({
  upload: 0,
  download: 0,
  downloadTotal: 0,
  uploadTotal: 0,
  connections: [] as any[],
  inuse: 0,
  memUsage: 0,
})

const { t } = useI18n()
const [Modal, modalApi] = useModal({})
const appStore = useAppStore()
const envStore = useEnvStore()
const appSettings = useAppSettingsStore()
const kernelApiStore = useKernelApiStore()

// Sliding background logic for Mode Selector
const modeRefs = ref<any[]>([])
const activeBgStyle = ref({
  transform: 'translateY(0)',
  height: '0px',
  opacity: 0,
})

const updateActiveBg = () => {
  const activeIndex = ModeOptions.findIndex(m => m.value === kernelApiStore.config.mode)
  if (activeIndex === -1) {
    activeBgStyle.value.opacity = 0
    return
  }
  const el = modeRefs.value[activeIndex]
  if (el) {
    const domEl = el.$el || el
    activeBgStyle.value = {
      transform: `translateY(${domEl.offsetTop}px)`,
      height: `${domEl.offsetHeight}px`,
      opacity: 1,
    }
  }
}

watch(() => kernelApiStore.config.mode, () => {
  nextTick(updateActiveBg)
})

onMounted(() => {
  setTimeout(updateActiveBg, 150) // Small delay to ensure layout has computed
  window.addEventListener('resize', updateActiveBg)
})

const modeIcon = (v: string) =>
  (({ global: 'overview', rule: 'rulesets', direct: 'forward' }) as any)[v] || 'sparkle'
const modeNeon = (v: string) =>
  (({ global: 'neon-cyan', rule: 'neon-purple', direct: 'neon-blue' }) as any)[v] || 'neon-cyan'

const handleRestartKernel = async () => {
  try {
    await kernelApiStore.restartCore()
  } catch (error: any) {
    console.error(error)
    message.error(error)
  }
}

const handleStopKernel = async () => {
  try {
    await kernelApiStore.stopCore()
  } catch (error: any) {
    console.error(error)
    message.error(error)
  }
}

const handleShowApiLogs = () => {
  modalApi.setProps({
    title: 'Logs',
    cancelText: 'common.close',
    width: '90',
    height: '90',
    submit: false,
    maskClosable: true,
  })
  modalApi.setContent(LogsController).open()
}

const handleShowApiConnections = () => {
  modalApi.setProps({
    title: 'home.overview.connections',
    cancelText: 'common.close',
    width: '90',
    height: '90',
    submit: false,
    maskClosable: true,
  })
  modalApi.setContent(ConnectionsController).open()
}

const handleToggleRealMemoryUsage = () => {
  appSettings.app.kernel.realMemoryUsage = !appSettings.app.kernel.realMemoryUsage
}

const handleShowSettings = () => {
  modalApi.setProps({
    title: 'home.overview.settings',
    cancelText: 'common.close',
    width: '90',
    submit: false,
    maskClosable: true,
  })
  modalApi.setContent(CommonController).open()
}

const onTunSwitchChange = async (enable: boolean) => {
  try {
    await kernelApiStore.updateConfig('tun', { enable })
  } catch (error: any) {
    kernelApiStore.config.tun.enable = !kernelApiStore.config.tun.enable
    console.error(error)
    message.error(error)
  }
}

const onSystemProxySwitchChange = async (enable: boolean) => {
  try {
    await envStore.switchSystemProxy(enable)
  } catch (error: any) {
    console.error(error)
    message.error(error)
    envStore.systemProxy = !envStore.systemProxy
  }
}

let latestCoreMemoryUsageTime: number
const getCoreMemoryUsage = async (fallback: number) => {
  if (latestCoreMemoryUsageTime && Date.now() - latestCoreMemoryUsageTime < 30_000) {
    return fallback
  }
  const useage = await ProcessMemory(kernelApiStore.pid).catch(() => fallback)
  latestCoreMemoryUsageTime = Date.now()
  return useage
}

const unregisterMemoryHandler = kernelApiStore.onMemory(async (data) => {
  statistics.value.inuse = data.inuse
  if (appSettings.app.kernel.realMemoryUsage) {
    getCoreMemoryUsage(statistics.value.memUsage || data.inuse).then((usage) => {
      statistics.value.memUsage = usage
    })
  }
})

const unregisterTrafficHandler = kernelApiStore.onTraffic((data) => {
  const { up, down } = data
  statistics.value.upload = up
  statistics.value.download = down

  trafficHistory.value[0].push(up)
  trafficHistory.value[1].push(down)

  if (trafficHistory.value[0].length > 60) {
    trafficHistory.value[0].shift()
    trafficHistory.value[1].shift()
  }
})

const unregisterConnectionsHandler = kernelApiStore.onConnections((data) => {
  statistics.value.downloadTotal = data.downloadTotal
  statistics.value.uploadTotal = data.uploadTotal
  statistics.value.connections = data.connections || []
})

onUnmounted(() => {
  unregisterMemoryHandler()
  unregisterTrafficHandler()
  unregisterConnectionsHandler()
  window.removeEventListener('resize', updateActiveBg)
})
</script>

<template>
  <div>
    <div class="flex items-center px-4 py-8 border-b border-white border-opacity-10 mb-16 hypr-stat-item" style="--i:0">
      <Button
        :type="envStore.systemProxy ? 'primary' : 'text'"
        size="small"
        class="px-12 py-6 rounded-6 font-bold"
        @click="onSystemProxySwitchChange(!envStore.systemProxy)"
      >
        {{ t('home.overview.systemProxy') }}
      </Button>
      <Button
        :type="kernelApiStore.config.tun.enable ? 'primary' : 'text'"
        size="small"
        class="ml-8 px-12 py-6 rounded-6 font-bold"
        @click="onTunSwitchChange(!kernelApiStore.config.tun.enable)"
      >
        {{ t('home.overview.tunMode') }}
      </Button>
      <CustomAction :actions="appStore.customActions.core_state" class="ml-4" />
      <Button
        v-tips="'home.overview.viewlog'"
        type="text"
        size="small"
        icon="log"
        class="ml-auto"
        @click="handleShowApiLogs"
      />
      <Button
        v-tips="'home.overview.restart'"
        :loading="kernelApiStore.restarting"
        type="text"
        size="small"
        icon="restart"
        class="ml-4"
        @click="handleRestartKernel"
      />
    </div>
    
    <div class="flex gap-16 mt-16 items-start">
      <!-- Left Column: Chart on Top, Stats Grid on Bottom -->
      <div class="flex flex-col gap-16" style="flex: 1.7 1 0%; min-width: 0">
        
        <!-- Traffic History Chart (置顶) -->
        <div class="p-8 hypr-stat-item" style="--i:1">
          <TrafficChart
            :series="trafficHistory"
            :legend="[t('home.overview.transmit'), t('home.overview.receive')]"
          />
        </div>

        <div class="h-1 bg-white opacity-10 mx-8"></div>

        <!-- Stats Grid (Symmetric 2x3 Grid below Chart, borderless) -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-16 p-8">
          <!-- Upload Speed -->
          <div class="flex items-center gap-12 hypr-stat-item" style="--i:0">
            <div class="stat-badge">
              <Icon icon="arrowDown" class="rotate-180" :size="20" color="var(--primary-color)" />
            </div>
            <div>
              <div class="stat-label">{{ t('home.overview.transmit') }}</div>
              <div class="stat-value text-22">{{ formatBytes(statistics.upload) }}/s</div>
            </div>
          </div>

          <!-- Download Speed -->
          <div class="flex items-center gap-12 hypr-stat-item" style="--i:1">
            <div class="stat-badge">
              <Icon icon="arrowDown" :size="20" color="var(--primary-color)" />
            </div>
            <div>
              <div class="stat-label">{{ t('home.overview.receive') }}</div>
              <div class="stat-value text-22">{{ formatBytes(statistics.download) }}/s</div>
            </div>
          </div>

          <!-- Total Traffic -->
          <div class="flex items-center gap-12 hypr-stat-item" style="--i:2">
            <div class="stat-badge">
              <Icon icon="subscriptions" :size="20" color="var(--primary-color)" />
            </div>
            <div>
              <div class="stat-label">{{ t('home.overview.totalTraffic') }}</div>
              <div class="stat-value text-22">
                {{ formatBytes(statistics.uploadTotal + statistics.downloadTotal) }}
              </div>
              <div class="text-12 mt-2" style="opacity: 0.5">
                ↑ {{ formatBytes(statistics.uploadTotal) }} ↓ {{ formatBytes(statistics.downloadTotal) }}
              </div>
            </div>
          </div>

          <!-- Connections -->
          <div class="flex items-center gap-12 cursor-pointer hover:opacity-80 transition hypr-stat-item" style="--i:3" @click="handleShowApiConnections">
            <div class="stat-badge">
              <Icon icon="link" :size="20" color="var(--primary-color)" />
            </div>
            <div>
              <div class="stat-label">{{ t('home.overview.connections') }}</div>
              <div class="stat-value text-22">{{ statistics.connections.length }}</div>
            </div>
          </div>

          <!-- Memory -->
          <div class="flex items-center gap-12 cursor-pointer hover:opacity-80 transition hypr-stat-item" style="--i:4" @click="handleToggleRealMemoryUsage">
            <div class="stat-badge">
              <Icon icon="plugins" :size="20" color="var(--primary-color)" />
            </div>
            <div>
              <div class="stat-label">{{ t('home.overview.memory') }}</div>
              <div class="stat-value text-22">
                {{ formatBytes(statistics.inuse) }}
              </div>
              <div v-if="appSettings.app.kernel.realMemoryUsage" class="text-12 mt-2" style="opacity: 0.5">
                / {{ formatBytes(statistics.memUsage) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Mode Menu (Flat) -->
      <div class="flex flex-col gap-12 relative" style="flex: 1 1 0%; min-width: 0">
        <div class="font-bold px-4 py-4" style="color: var(--card-color)">
          {{ t('kernel.mode') }}
        </div>
        <!-- Sliding active background indicator -->
        <div
          class="absolute left-0 w-full pointer-events-none"
          :style="{
            transform: activeBgStyle.transform,
            height: activeBgStyle.height,
            opacity: activeBgStyle.opacity,
            borderLeft: '3px solid var(--primary-color)',
            backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)',
            transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.3s, opacity 0.3s'
          }"
        ></div>
        <Card
          v-for="(mode, index) in ModeOptions"
          :key="mode.value"
          :ref="el => { if (el) modeRefs[index] = el }"
          :selected="kernelApiStore.config.mode === mode.value"
          :style="{ '--i': index + 2 }"
          :title="t(mode.label)"
          :class="[
            'mode-card cursor-pointer',
            { 'mode-active': kernelApiStore.config.mode === mode.value },
          ]"
          @click="handleChangeMode(mode.value as any)"
        >
          <template #title-prefix>
            <div class="stat-badge mr-8">
              <Icon :icon="modeIcon(mode.value)" :size="18" color="var(--primary-color)" />
            </div>
          </template>
          <div class="text-12 py-2" style="opacity: 0.65">{{ t(mode.desc) }}</div>
        </Card>
      </div>
    </div>
  </div>

  <Modal />
</template>
