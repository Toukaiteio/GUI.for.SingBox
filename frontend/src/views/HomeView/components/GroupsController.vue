<script setup lang="ts">
import { ref, computed, onActivated, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { getProxyDelay } from '@/api/kernel'
import {
  DefaultCardColumns,
  DefaultConcurrencyLimit,
  DefaultTestTimeout,
  DefaultTestURL,
} from '@/constant/app'
import { useBool } from '@/hooks'
import { useAppSettingsStore, useKernelApiStore, useProfilesStore } from '@/stores'
import {
  ignoredError,
  sleep,
  handleUseProxy,
  message,
  createAsyncPool,
  buildSmartRegExp,
} from '@/utils'

const expandedSet = ref<Set<string>>(new Set())
const loadingSet = ref<Set<string>>(new Set())
const filterKeywordsMap = ref<Record<string, string>>({})
const hasEntered = ref(false)

const loading = ref(false)

const { t } = useI18n()
const [showMoreSettings, toggleMoreSettings] = useBool(false)
const appSettings = useAppSettingsStore()
const kernelApiStore = useKernelApiStore()
const profilesStore = useProfilesStore()

const groups = computed(() => {
  const { proxies } = kernelApiStore
  const iconMapping = (profilesStore.currentProfile?.outbounds || []).reduce((p, c) => {
    p[c.tag] = c.icon
    return p
  }, {} as Recordable<string>)
  const hiddenList = (profilesStore.currentProfile?.outbounds || []).flatMap((v) =>
    v.hidden ? v.tag : [],
  )
  return Object.values(proxies)
    .filter(
      (v) =>
        ['Selector', 'URLTest'].includes(v.type) &&
        v.name !== 'GLOBAL' &&
        !hiddenList.includes(v.name),
    )
    .concat(proxies.GLOBAL || [])
    .map((group) => {
      const all = (group.all || [])
        .filter((proxy) => {
          const history = proxies[proxy]?.history || []
          const alive = (history[history.length - 1]?.delay ?? 0) > 0
          const condition1 =
            appSettings.app.kernel.unAvailable ||
            ['direct', 'block'].includes(proxy) ||
            proxies[proxy]?.all ||
            alive
          const keywords = filterKeywordsMap.value[group.name]
          const condition2 = keywords ? buildSmartRegExp(keywords, 'i').test(proxy) : true
          return condition1 && condition2
        })
        .map((proxy) => {
          const history = proxies[proxy]?.history || []
          const delay = history[history.length - 1]?.delay || 0
          return { ...proxies[proxy]!, delay }
        })
        .sort((a, b) => {
          if (!appSettings.app.kernel.sortByDelay || a.delay === b.delay) return 0
          if (!a.delay) return 1
          if (!b.delay) return -1
          return a.delay - b.delay
        })

      const chains = [group.now]
      let tmp = proxies[group.now]
      while (tmp) {
        tmp.now && chains.push(tmp.now)
        tmp = proxies[tmp.now]
      }
      return { ...group, all, chains, icon: iconMapping[group.name] }
    })
})

const useProxyWithCatchError = (group: any, proxy: any) => {
  handleUseProxy(group, proxy).catch((err: any) => message.error(err.message || err))
}

const toggleExpanded = (group: string) => {
  if (expandedSet.value.has(group)) {
    expandedSet.value.delete(group)
  } else {
    expandedSet.value.add(group)
  }
}

const expandAll = () => groups.value.forEach(({ name }) => expandedSet.value.add(name))

const collapseAll = () => expandedSet.value.clear()

const isExpanded = (group: string) => expandedSet.value.has(group)

const isLoading = (group: string) => loadingSet.value.has(group)

const isFiltered = (group: string) => filterKeywordsMap.value[group]

const handleGroupDelay = async (group: string) => {
  const _group = kernelApiStore.proxies[group]
  if (_group) {
    let index = 0
    let success = 0
    let failure = 0

    const delayTest = async (proxy: string) => {
      index += 1
      update(`Testing... ${index} / ${_group.all.length}, success: ${success} failure: ${failure}`)
      const _proxy = kernelApiStore.proxies[proxy]
      try {
        loadingSet.value.add(proxy)
        const { delay = 0 } = await getProxyDelay(
          encodeURIComponent(proxy),
          appSettings.app.kernel.testUrl || DefaultTestURL,
          appSettings.app.kernel.testTimeout || DefaultTestTimeout,
        )
        success += 1
        _proxy && _proxy.history.push({ delay })
      } catch {
        failure += 1
        _proxy && _proxy.history.push({ delay: 0 })
      }
      update(`Testing... ${index} / ${_group.all.length}, success: ${success} failure: ${failure}`)
      loadingSet.value.delete(proxy)
    }

    loadingSet.value.add(group)
    const { run, controller } = createAsyncPool(
      appSettings.app.kernel.concurrencyLimit || DefaultConcurrencyLimit,
      _group.all,
      delayTest,
    )
    const {
      update,
      destroy,
      success: msgSuccess,
    } = message.info('Testing...', 99999, () => {
      controller.cancel()
      message.warn('common.canceled')
    })
    await run()
    loadingSet.value.delete(group)
    msgSuccess(
      `Completed. ${index} / ${_group.all.length}, success: ${success} failure: ${failure}`,
    )
    await sleep(3000)
    destroy()
  }
}

const handleProxyDelay = async (proxy: string) => {
  loadingSet.value.add(proxy)
  try {
    const { delay = 0 } = await getProxyDelay(
      encodeURIComponent(proxy),
      appSettings.app.kernel.testUrl || DefaultTestURL,
      appSettings.app.kernel.testTimeout || DefaultTestTimeout,
    )
    const _proxy = kernelApiStore.proxies[proxy]
    _proxy && _proxy.history.push({ delay })
  } catch (error: any) {
    const _proxy = kernelApiStore.proxies[proxy]
    _proxy && _proxy.history.push({ delay: 0 })
    message.error(error + ': ' + proxy)
  }
  loadingSet.value.delete(proxy)
}

const delayLevelClass = (delay = 0) => {
  if (delay === 0) return 'level-0'
  if (delay < 500) return 'level-1'
  if (delay < 1000) return 'level-2'
  if (delay < 1500) return 'level-3'
  return 'level-4'
}

const formatDelay = (delay = 0) => {
  if (delay === 0) return 'N/A'
  return `${delay}ms`
}

const handleRefresh = async () => {
  loading.value = true
  await ignoredError(kernelApiStore.refreshConfig)
  await ignoredError(kernelApiStore.refreshProviderProxies)
  await sleep(100)
  loading.value = false
}

const locateGroup = (group: any, chain: string) => {
  collapseAll()
  if (kernelApiStore.proxies[chain]?.all) {
    toggleExpanded(kernelApiStore.proxies[chain].name)
  } else {
    toggleExpanded(group.name)
  }
}

const delayColor = (delay = 0) => {
  if (delay === 0) return 'var(--level-0-color)'
  if (delay < 500) return 'var(--level-1-color)'
  if (delay < 1000) return 'var(--level-2-color)'
  if (delay < 1500) return 'var(--level-3-color)'
  return 'var(--level-4-color)'
}

const handleResetMoreSettings = () => {
  appSettings.app.kernel.testUrl = DefaultTestURL
  appSettings.app.kernel.testTimeout = DefaultTestTimeout
  appSettings.app.kernel.concurrencyLimit = DefaultConcurrencyLimit
  appSettings.app.kernel.cardColumns = DefaultCardColumns
  message.success('common.success')
}

let enterTimer: ReturnType<typeof setTimeout>
const playHeaderEnter = () => {
  hasEntered.value = false
  clearTimeout(enterTimer)
  enterTimer = setTimeout(() => {
    hasEntered.value = true
  }, 800)
}

onMounted(playHeaderEnter)

onActivated(() => {
  playHeaderEnter()
  kernelApiStore.refreshProviderProxies()
})
</script>

<template>
  <div class="m-8 mt-0 sticky top-0 z-3">
    <div
      class="sticky flex gap-8 items-center p-8 rounded-8 backdrop-blur-sm"
      style="background-color: var(--card-bg)"
    >
      <Switch v-model="appSettings.app.kernel.unAvailable" label="home.controller.unAvailable" />
      <Switch v-model="appSettings.app.kernel.cardMode" label="home.controller.cardMode" />
      <Switch v-model="appSettings.app.kernel.sortByDelay" label="home.controller.sortBy" />
      <Button type="primary" size="small" @click="toggleMoreSettings"> ... </Button>
      <div class="ml-auto flex items-center">
        <Button v-tips="'home.overview.expandAll'" type="text" icon="expand" @click="expandAll" />
        <Button
          v-tips="'home.overview.collapseAll'"
          type="text"
          icon="collapse"
          @click="collapseAll"
        />
        <Button
          v-tips="'home.overview.refresh'"
          :loading="loading"
          icon="refresh"
          type="text"
          @click="handleRefresh"
        />
      </div>
    </div>
  </div>
  <div v-for="(group, i) in groups" :key="group.name" class="m-8">
    <div
      :class="{ 'group-header-enter': !hasEntered }"
      :style="!hasEntered ? { '--i': i } : {}"
      class="sticky z-2 flex gap-8 items-center p-8 rounded-8 backdrop-blur-sm"
      style="top: 52px; background-color: var(--card-bg)"
      @click="toggleExpanded(group.name)"
    >
      <div class="text-14 flex items-center gap-2 text-nowrap overflow-hidden">
        <img v-if="group.icon" :src="group.icon" class="w-24 h-24 mr-4" draggable="false" />
        <span class="font-bold text-18">{{ group.name }}</span>
        <span class="mx-8">
          {{ group.type }}
        </span>
        <span> :: </span>
        <template v-for="(chain, index) in group.chains" :key="chain">
          <span v-if="index !== 0" style="color: gray"> / </span>
          <Button type="text" size="small" @click.stop="locateGroup(group, chain)">
            {{ chain }}
          </Button>
        </template>
      </div>
      <div class="ml-auto flex items-center" @click.stop>
        <Input
          v-model="filterKeywordsMap[group.name]"
          :placeholder="t('common.keywords')"
          editable
          clearable
        >
          <template #editable>
            <Button
              type="text"
              icon="filter"
              :icon-color="isFiltered(group.name) ? 'var(--primary-color)' : ''"
            />
          </template>
        </Input>
        <Button
          v-tips="'home.overview.delayTest'"
          :loading="isLoading(group.name)"
          icon="speedTest"
          type="text"
          @click="handleGroupDelay(group.name)"
        />
        <Button type="text" @click="toggleExpanded(group.name)">
          <Icon
            :class="{ 'action-expand-expanded': isExpanded(group.name) }"
            class="action-expand origin-center duration-200"
            icon="arrowDown"
          />
        </Button>
      </div>
    </div>
    <Transition name="expand">
      <div v-if="isExpanded(group.name)" class="expand-wrapper">
        <div class="py-8 px-4">
          <Empty v-if="group.all.length === 0" />
          <div
            v-else-if="appSettings.app.kernel.cardMode"
            class="proxy-grid"
            :style="{ '--card-cols': appSettings.app.kernel.cardColumns }"
          >
          <Card
            v-for="(proxy, pi) in group.all"
            :key="proxy.name"
            :title="proxy.name"
            :selected="proxy.name === group.now"
            :style="{ '--i': pi }"
            class="cursor-pointer"
            :class="{ 'card-selected': proxy.name === group.now }"
            @click="useProxyWithCatchError(group, proxy)"
          >
            <template #extra>
              <div
                v-tips="t('home.overview.delayTest')"
                class="latency-pill"
                :class="[
                  delayLevelClass(proxy.delay),
                  isLoading(proxy.name) ? 'is-loading' : ''
                ]"
                @click.stop="handleProxyDelay(proxy.name)"
              >
                <Icon v-if="isLoading(proxy.name)" icon="loading" :size="10" class="rotation" />
                <Icon v-else icon="speedTest" :size="10" class="pill-hover-icon transition-all duration-300" />
                <span>{{ formatDelay(proxy.delay) }}</span>
              </div>
            </template>
            <div class="proxy-info text-12 my-2">
              <span class="proxy-type">{{ proxy.type }}</span>
              <span v-if="proxy.udp" class="proxy-tag udp">UDP</span>
            </div>
          </Card>
        </div>
        <div v-else class="grid grid-cols-32 gap-8">
          <div
            v-for="proxy in group.all"
            :key="proxy.name"
            v-tips.fast="proxy.name"
            :style="{ background: delayColor(proxy.delay) }"
            :class="proxy.name === group.now ? 'rounded-full shadow' : ''"
            class="w-12 h-12 rounded-4 flex items-center justify-center"
            @click="useProxyWithCatchError(group, proxy)"
          >
            <Icon v-if="isLoading(proxy.name)" icon="loading" :size="12" class="rotation" />
          </div>
        </div>
        </div>
      </div>
    </Transition>
  </div>

  <Modal
    v-model:open="showMoreSettings"
    :submit="false"
    mask-closable
    cancel-text="common.close"
    title="common.more"
  >
    <template #action>
      <Button type="text" class="mr-auto" @click="handleResetMoreSettings">
        {{ t('common.reset') }}
      </Button>
    </template>

    <div class="form-item">
      {{ t('home.controller.delay') }}
      <Input
        v-model="appSettings.app.kernel.testUrl"
        :placeholder="DefaultTestURL"
        editable
        clearable
      />
    </div>

    <div class="form-item">
      {{ t('home.controller.timeout') }}
      <Input
        v-model="appSettings.app.kernel.testTimeout"
        :placeholder="String(DefaultTestTimeout)"
        type="number"
        editable
        clearable
      />
    </div>

    <div class="form-item">
      {{ t('home.controller.concurrencyLimit') }}
      <Input
        v-model="appSettings.app.kernel.concurrencyLimit"
        :min="1"
        :max="50"
        type="number"
        editable
        clearable
      />
    </div>

    <div class="form-item">
      {{ t('home.controller.cardColumns') }}
      <Radio
        v-model="appSettings.app.kernel.cardColumns"
        :options="Array.from({ length: 5 }, (_, i) => ({ label: String(i + 1), value: i + 1 }))"
      />
    </div>
  </Modal>
</template>

<style lang="less" scoped>
@keyframes group-slide-in {
  from {
    opacity: 0;
    transform: translateX(32px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.group-header-enter {
  animation: group-slide-in 0.5s cubic-bezier(0.22, 1.45, 0.36, 1) calc(var(--i, 0) * 0.06s) both;
}

.expand-enter-active,
.expand-leave-active {
  transition: opacity 0.25s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
}

.action-expand {
  transform: rotate(-90deg);
  &-expanded {
    transform: rotate(0deg);
  }
}

.latency-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-family: monospace;
  font-size: 11px;
  font-weight: bold;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  user-select: none;
  white-space: nowrap;
  flex-shrink: 0;

  .pill-hover-icon {
    width: 0;
    opacity: 0;
    margin-right: -4px;
  }

  &:hover {
    background-color: var(--card-hover-bg);
    border-color: var(--primary-color) !important;
    color: var(--primary-color) !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

    .pill-hover-icon {
      width: 10px;
      opacity: 1;
      margin-right: 0;
    }
  }

  &.level-0 {
    color: var(--level-0-color);
    background-color: rgba(128, 128, 128, 0.06);
    border-color: rgba(128, 128, 128, 0.12);
  }
  &.level-1 {
    color: var(--level-1-color);
    background-color: rgba(41, 178, 128, 0.06);
    border-color: rgba(41, 178, 128, 0.12);
  }
  &.level-2 {
    color: var(--level-2-color);
    background-color: rgba(182, 139, 31, 0.06);
    border-color: rgba(182, 139, 31, 0.12);
  }
  &.level-3 {
    color: var(--level-3-color);
    background-color: rgba(234, 96, 96, 0.06);
    border-color: rgba(234, 96, 96, 0.12);
  }
  &.level-4 {
    color: var(--level-4-color);
    background-color: rgba(240, 14, 14, 0.06);
    border-color: rgba(240, 14, 14, 0.12);
  }
}

.proxy-info {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: padding 0.2s ease-in-out;
  
  .proxy-type {
    text-transform: uppercase;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background-color: rgba(128, 128, 128, 0.1);
    color: var(--color);
    opacity: 0.8;
  }
  
  .proxy-tag {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    
    &.udp {
      background-color: rgba(41, 178, 128, 0.1);
      color: var(--level-1-color);
    }
  }
}

.proxy-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(var(--card-cols, 3), minmax(0, 1fr));
  
  @media (max-width: 1200px) {
    grid-template-columns: repeat(min(4, var(--card-cols, 3)), minmax(0, 1fr));
  }
  @media (max-width: 992px) {
    grid-template-columns: repeat(min(3, var(--card-cols, 3)), minmax(0, 1fr));
  }
  @media (max-width: 768px) {
    grid-template-columns: repeat(min(2, var(--card-cols, 3)), minmax(0, 1fr));
  }
  @media (max-width: 576px) {
    grid-template-columns: repeat(min(1, var(--card-cols, 3)), minmax(0, 1fr));
  }
}
</style>
