<script setup lang="ts">
import { computed, useSlots, ref, onMounted, onUnmounted, watch, nextTick, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

type TabItemType = {
  key: string
  tab: string
  disabled?: boolean
  component?: Component
}

interface Props {
  activeKey: string
  items: readonly TabItemType[]
  tabPosition?: 'left' | 'top'
  tabWidth?: string
  contentWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  tabPosition: 'left',
  tabWidth: '20%',
  contentWidth: '80%',
})

const emits = defineEmits(['update:activeKey'])

const { t } = useI18n()
const slots = useSlots()

const isTop = computed(() => props.tabPosition === 'top')

const handleChange = (key: string) => emits('update:activeKey', key)

const isActive = ({ key }: TabItemType) => key === props.activeKey

const currentComponent = computed(() => {
  const comp = props.items.find((i) => i.key === props.activeKey)?.component
  return comp ?? slots[props.activeKey]
})

// Sliding active background indicator logic
const tabRefs = ref<any[]>([])
const activeBgStyle = ref({
  transform: 'translateY(0)',
  height: '0px',
  width: '0px',
  opacity: 0,
})
let rafId: number | null = null

const scheduleUpdateActiveBg = () => {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    updateActiveBg()
  })
}

const updateActiveBg = () => {
  if (isTop.value) return
  const activeIndex = props.items.findIndex(item => item.key === props.activeKey)
  if (activeIndex === -1) {
    activeBgStyle.value.opacity = 0
    return
  }
  const el = tabRefs.value[activeIndex]
  if (el) {
    const domEl = el.$el || el
    const nextStyle = {
      transform: `translateY(${domEl.offsetTop}px)`,
      height: `${domEl.offsetHeight}px`,
      width: `${domEl.offsetWidth}px`,
      opacity: 1,
    }
    if (
      activeBgStyle.value.transform !== nextStyle.transform
      || activeBgStyle.value.height !== nextStyle.height
      || activeBgStyle.value.width !== nextStyle.width
      || activeBgStyle.value.opacity !== nextStyle.opacity
    ) {
      activeBgStyle.value = nextStyle
    }
  }
}

watch(() => props.activeKey, () => {
  nextTick(scheduleUpdateActiveBg)
})

onMounted(() => {
  setTimeout(scheduleUpdateActiveBg, 150)
  window.addEventListener('resize', scheduleUpdateActiveBg, { passive: true })
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  window.removeEventListener('resize', scheduleUpdateActiveBg)
})
</script>

<template>
  <div :class="{ 'flex-col': isTop }" class="gui-tabs flex">
    <div
      :class="{ 'justify-center mb-8': isTop, 'flex-col gui-tabs-sidebar relative': !isTop }"
      :style="{ width: isTop ? 'auto' : tabWidth }"
      class="gui-tabs-tab flex"
    >
      <!-- Sliding active background indicator -->
      <div
        v-if="!isTop"
        class="absolute left-0 pointer-events-none"
        :style="{
          transform: activeBgStyle.transform,
          height: activeBgStyle.height,
          width: activeBgStyle.width,
          opacity: activeBgStyle.opacity,
          borderLeft: '3px solid var(--primary-color)',
          backgroundColor: 'var(--btn-text-hover-bg)',
          borderRadius: '0px',
          transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.3s, width 0.3s, opacity 0.3s'
        }"
      ></div>

      <Button
        v-for="(tab, i) in items"
        :key="tab.key"
        :ref="el => { if (el) tabRefs[i] = el }"
        :type="isActive(tab) ? 'link' : 'text'"
        :disabled="tab.disabled"
        :style="!isTop ? { '--tab-i': i } : {}"
        @click="handleChange(tab.key)"
      >
        {{ t(tab.tab) }}
      </Button>
      <div :style="!isTop ? { '--tab-i': items.length } : {}" class="contents">
        <slot name="extra"></slot>
      </div>
    </div>

    <div class="flex flex-col overflow-y-auto" :style="{ width: isTop ? 'auto' : contentWidth }">
      <KeepAlive>
        <component :is="currentComponent" />
      </KeepAlive>
    </div>
  </div>
</template>

<style lang="less" scoped>
.gui-tabs-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 16px;

  :deep(.gui-button) {
    justify-content: center;
    align-items: center;
    width: 100%;
    font-size: 15px;
    font-weight: 500;
    padding: 8px 16px !important;
    border-radius: 0 !important;
    transition: all 0.2s ease-in-out;
    background-color: transparent;
    color: var(--color);
    opacity: 0.75;
    animation: hypr-in 0.45s cubic-bezier(0.22, 1.45, 0.36, 1) calc(var(--tab-i, 0) * 0.07s) both;

    &:hover {
      opacity: 1;
      background-color: rgba(128, 128, 128, 0.06);
    }
  }

  :deep(.gui-button.link) {
    opacity: 1;
    color: var(--primary-color) !important;
    background-color: transparent !important;
    font-weight: 600;
  }
}
</style>
