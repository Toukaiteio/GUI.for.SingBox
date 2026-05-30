<script lang="ts" setup>
import { ref, watch, nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  position: { x: number; y: number }
  message?: string
}

const props = withDefaults(defineProps<Props>(), {
  message: '',
})

const model = defineModel<boolean>()

const domRef = useTemplateRef('domRef')
const fixedPosition = ref({ x: 0, y: 0 })

const { t } = useI18n()

watch(
  () => props.position,
  ({ x, y }) => {
    nextTick(() => {
      if (domRef.value) {
        const w = domRef.value.offsetWidth
        const h = domRef.value.offsetHeight
        // place above cursor, centered horizontally, clamped to viewport
        const px = Math.min(Math.max(x - w / 2, 4), window.innerWidth - w - 4)
        const py = y - h - 8
        fixedPosition.value = { x: px, y: py }
      }
    })
  },
)
</script>

<template>
  <div
    v-show="model"
    ref="domRef"
    :style="{ left: fixedPosition.x + 'px', top: fixedPosition.y + 'px' }"
    class="gui-tips fixed z-9999 duration-100 pointer-events-none shadow whitespace-pre-wrap text-center text-12 p-4 rounded-8 min-w-64 backdrop-blur-sm"
  >
    {{ t(message) }}
  </div>
</template>

<style lang="less" scoped>
.gui-tips {
  background: var(--menu-bg);
}
</style>
