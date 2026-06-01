<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch, nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Menu } from '@/types/app'
import { type IconName } from '@/components/Icon/icons'

interface Props {
  position: { x: number; y: number }
  menuList: Menu[]
}

const model = defineModel<boolean>({ default: false })
const props = defineProps<Props>()

const secondaryMenu = ref<Menu[] | undefined>()
const activeTriggerEl = ref<HTMLElement | null>(null)

const menuRef = useTemplateRef('menuRef')
const secondaryMenuRef = useTemplateRef('secondaryMenuRef')

const menuPosition = ref({ left: '', top: '' })
const secondaryMenuPosition = ref({ left: '', top: '' })

const { t } = useI18n()

const hasIcons = (list?: Menu[]) => {
  return list ? list.some((item) => item.icon) : false
}

const handleClick = (fn: Menu) => {
  fn.handler?.()
  model.value = false
  secondaryMenu.value = undefined
  activeTriggerEl.value = null
}

const handleHover = (e: MouseEvent, menu: Menu) => {
  if (menu.children) {
    activeTriggerEl.value = e.currentTarget as HTMLElement
    secondaryMenu.value = menu.children
  } else {
    secondaryMenu.value = undefined
    activeTriggerEl.value = null
  }
}

const fixMenuPos = (x: number, y: number) => {
  let left = x
  let top = y

  const { offsetWidth: clientWidth, offsetHeight: clientHeight } = document.body
  const { offsetWidth: menuWidth, offsetHeight: menuHeight } = menuRef.value!

  if (x + menuWidth > clientWidth) left -= x + menuWidth - clientWidth + 8
  if (y + menuHeight > clientHeight) top -= y + menuHeight - clientHeight + 8

  menuPosition.value = { left: left + 'px', top: top + 'px' }
}

const fixSecondaryMenuPos = () => {
  if (!activeTriggerEl.value || !menuRef.value || !secondaryMenuRef.value) return

  const triggerEl = activeTriggerEl.value
  const parentEl = menuRef.value
  const sMenuEl = secondaryMenuRef.value

  const parentRect = parentEl.getBoundingClientRect()
  const sMenuWidth = sMenuEl.offsetWidth
  const sMenuHeight = sMenuEl.offsetHeight
  const clientWidth = document.body.offsetWidth
  const clientHeight = document.body.offsetHeight

  let left = parentRect.width
  let top = triggerEl.offsetTop

  // Check if there is enough space on the right side
  if (parentRect.left + parentRect.width + sMenuWidth > clientWidth) {
    // If not, place on the left of the parent menu
    left = -sMenuWidth
  }

  // Check if there is space below
  if (parentRect.top + top + sMenuHeight > clientHeight) {
    const overflow = (parentRect.top + top + sMenuHeight) - clientHeight
    top = Math.max(0, top - overflow - 8)
  }

  secondaryMenuPosition.value = { left: left + 'px', top: top + 'px' }
}

watch(
  () => props.position,
  ({ x, y }) => {
    nextTick(() => fixMenuPos(x, y))
    secondaryMenu.value = undefined
    activeTriggerEl.value = null
  },
)

watch([() => secondaryMenu.value, () => props.position], () => {
  nextTick(fixSecondaryMenuPos)
})

const onClick = () => {
  model.value = false
  secondaryMenu.value = undefined
  activeTriggerEl.value = null
}

onMounted(() => document.addEventListener('click', onClick))
onUnmounted(() => document.removeEventListener('click', onClick))
</script>

<template>
  <Transition name="menu">
    <div
      v-show="model"
      ref="menuRef"
      :style="menuPosition"
      class="gui-menu fixed z-9999 p-4 rounded-6 shadow flex flex-col gap-4 backdrop-blur-sm"
    >
      <template v-for="menu in menuList">
        <div v-if="menu.separator" :key="menu.label + '_divider'" class="menu-separator" />
        <Button
          v-else
          :key="menu.label"
          type="text"
          size="small"
          class="gui-menu-btn"
          :class="{ 'menu-item-danger': menu.role === 'danger' }"
          @click="handleClick(menu)"
          @mouseenter="handleHover($event, menu)"
        >
          <div class="menu-item-content flex items-center justify-between w-full text-left">
            <div class="flex items-center gap-10">
              <Icon v-if="menu.icon" :icon="(menu.icon as IconName)" :size="16" class="menu-item-icon" />
              <span v-else-if="hasIcons(menuList)" class="w-16 shrink-0"></span>
              <span class="menu-item-text">{{ t(menu.label) }}</span>
            </div>
            <Icon v-if="menu.children" icon="arrowRight" class="ml-12" :size="12" />
          </div>
        </Button>
      </template>
      <Transition name="menu">
        <div
          v-show="secondaryMenu"
          ref="secondaryMenuRef"
          :style="secondaryMenuPosition"
          class="gui-menu fixed z-99999 p-4 rounded-6 shadow flex flex-col gap-4 backdrop-blur-sm"
        >
          <template v-for="m in secondaryMenu">
            <div v-if="m.separator" :key="m.label + '_divider'" class="menu-separator" />
            <Button
              v-else
              :key="m.label"
              type="text"
              size="small"
              class="gui-menu-btn"
              :class="{ 'menu-item-danger': m.role === 'danger' }"
              @click.stop="handleClick(m)"
            >
              <div class="menu-item-content flex items-center justify-between w-full text-left">
                <div class="flex items-center gap-10">
                  <Icon v-if="m.icon" :icon="(m.icon as IconName)" :size="16" class="menu-item-icon" />
                  <span v-else-if="hasIcons(secondaryMenu)" class="w-16 shrink-0"></span>
                  <span class="menu-item-text">{{ t(m.label) }}</span>
                </div>
              </div>
            </Button>
          </template>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style lang="less" scoped>
.menu-enter-active,
.menu-leave-active {
  transition:
    transform 0.18s cubic-bezier(0.25, 0.8, 0.25, 1),
    opacity 0.18s ease-in-out;
  transform-origin: top;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scaleY(0.95);
}
</style>
