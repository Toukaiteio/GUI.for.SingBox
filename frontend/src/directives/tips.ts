import { type Directive, type DirectiveBinding } from 'vue'

import { useAppStore } from '@/stores'
import { debounce } from '@/utils'

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const appStore = useAppStore()

    const delay = binding.modifiers.fast ? 200 : 500

    const show = debounce((x: number, y: number) => {
      if (el.dataset.showTips === 'true') {
        appStore.tipsPosition = { x, y }
        appStore.tipsMessage = binding.value
        appStore.tipsShow = true
      }
    }, delay)

    const hide = debounce(() => {
      appStore.tipsShow = false
      el.dataset.showTips = 'false'
    }, 150)

    el.onmouseenter = (e: MouseEvent) => {
      if (binding.value) {
        hide.cancel()
        el.dataset.showTips = 'true'
        show(e.clientX, e.clientY)
      }
    }

    el.onmouseleave = () => {
      show.cancel()
      hide()
    }
  },
  beforeUnmount(el: HTMLElement) {
    const appStore = useAppStore()
    appStore.tipsShow = false
    el.dataset.showTips = 'false'
  },
} as Directive
