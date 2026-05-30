<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, onActivated, useTemplateRef } from 'vue'

import { formatBytes } from '@/utils'

interface Props {
  height?: number
  padding?: number
  legend?: string[]
  series: number[][]
}

const props = withDefaults(defineProps<Props>(), {
  height: 150,
  padding: 50,
  legend: () => ['upload', 'download'],
})

const MAX_HISTORY = 60
const svgRef = useTemplateRef<SVGAElement>('svgRef')
const width = ref(200)
const points = ref<string[]>([])
const fillPaths = ref<string[]>([])
const showLines = ref([true, true])
const fillColors = ['url(#hypr-grad-up)', 'url(#hypr-grad-down)']

const strokeColors = computed(() => {
  const upload = showLines.value[0] ? 'var(--primary-color)' : 'var(--color)'
  const download = showLines.value[1] ? 'color-mix(in srgb, var(--primary-color), #a855f7 70%)' : 'var(--color)'
  return [upload, download]
})

const maxValue = computed(() => {
  const maxUpload = Math.max(...props.series[0]!, props.height)
  const maxDownload = Math.max(...props.series[1]!, props.height)
  if (showLines.value[0] && showLines.value[1]) return Math.max(maxUpload, maxDownload)
  if (showLines.value[0]) return maxUpload
  if (showLines.value[1]) return maxDownload
  return props.height
})

const updateSvgWidth = () => {
  if (svgRef.value) {
    width.value = svgRef.value.clientWidth
    updateChart()
  }
}

const updateChart = () => {
  const { padding } = props
  let { height } = props
  const paddingY = height / 8
  height -= paddingY
  
  points.value = []
  fillPaths.value = []
  
  props.series.forEach((s, index) => {
    if (!showLines.value[index]) {
      points.value.push('')
      fillPaths.value.push('')
      return
    }
    const newS = [...s]
    if (newS.length < MAX_HISTORY) {
      newS.unshift(...Array.from({ length: MAX_HISTORY - s.length }, () => 0))
    }
    const spacing = (width.value - padding) / (newS.length - 1 || 1)
    const pts = newS.map((c, i) => {
      const x = Math.floor(i * spacing) + padding
      const y = Math.floor(height - (c / maxValue.value) * height) + paddingY - 6
      return [x, y] as [number, number]
    })
    
    if (pts.length === 0) {
      points.value.push('')
      fillPaths.value.push('')
      return
    }
    
    // 1. Compute Stroke Path (M ... C ...)
    let strokeD = `M ${pts[0]![0]},${pts[0]![1]} `
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]!
      const p1 = pts[i + 1]!
      const cp1x = p0[0] + (p1[0] - p0[0]) * 0.5
      const cp1y = p0[1]
      const cp2x = p1[0] - (p1[0] - p0[0]) * 0.5
      const cp2y = p1[1]
      strokeD += `C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1[0]},${p1[1]} `
    }
    points.value.push(strokeD)
    
    // 2. Compute Fill Path (M strokeD L bottom-right L bottom-left Z)
    const endX = pts[pts.length - 1]![0]
    const bottomY = props.height - 6
    let fillD = strokeD + ` L ${endX},${bottomY} L ${padding},${bottomY} Z`
    fillPaths.value.push(fillD)
  })
}

const toggleUpload = () => {
  showLines.value[0] = !showLines.value[0]
  updateChart()
}

const toggleDownload = () => {
  showLines.value[1] = !showLines.value[1]
  updateChart()
}

onMounted(() => {
  updateSvgWidth()
  window.addEventListener('resize', updateSvgWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSvgWidth)
})

onActivated(updateSvgWidth)

watch(() => props.series, updateChart, { deep: true })
</script>

<template>
  <div class="gui-traffic-chart rounded-8">
    <svg ref="svgRef" :height="height + 'px'" width="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hypr-grad-up" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--primary-color)" stop-opacity="0.25" />
          <stop offset="100%" stop-color="var(--primary-color)" stop-opacity="0.01" />
        </linearGradient>
        <linearGradient id="hypr-grad-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="color-mix(in srgb, var(--primary-color), #a855f7 70%)" stop-opacity="0.25" />
          <stop offset="100%" stop-color="color-mix(in srgb, var(--primary-color), #a855f7 70%)" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      <text
        v-for="i in 4"
        :key="i"
        :y="i * (height / 4) - 4"
        style="font-size: 8px; opacity: 0.4"
        x="4"
        fill="var(--color)"
      >
        {{ formatBytes(maxValue - (i - 1) * (maxValue / 3)) }}
      </text>

      <line
        v-for="i in 4"
        :key="i"
        :y1="i * (height / 4) - 7"
        :x2="width - 2"
        :y2="i * (height / 4) - 7"
        :x1="padding"
        stroke-dasharray="1 4"
        stroke="color-mix(in srgb, var(--primary-color) 8%, transparent)"
      />

      <template v-for="(point, index) in points">
        <!-- Area Fill -->
        <path
          v-if="showLines[index] && fillPaths[index]"
          :key="'fill-' + index"
          :d="fillPaths[index]"
          fill-rule="evenodd"
          :fill="fillColors[index]"
          stroke="none"
        />
        <!-- Line Stroke (Clean, no glow) -->
        <path
          v-if="showLines[index] && point"
          :key="'stroke-' + index"
          :d="point"
          :stroke="strokeColors[index]"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </template>

      <circle
        :cx="width / 2 - 40"
        :fill="strokeColors[0]"
        r="3"
        cy="10"
        class="text-10 cursor-pointer"
        @click="toggleUpload"
      />
      <circle
        :cx="width / 2 + 20"
        :fill="strokeColors[1]"
        r="3"
        cy="10"
        class="text-10 cursor-pointer"
        @click="toggleDownload"
      />
      <text
        :x="width / 2 - 34"
        :fill="strokeColors[0]"
        y="14"
        class="text-10 cursor-pointer"
        @click="toggleUpload"
      >
        {{ legend[0] }}
      </text>
      <text
        :x="width / 2 + 28"
        :fill="strokeColors[1]"
        y="14"
        class="text-10 cursor-pointer"
        @click="toggleDownload"
      >
        {{ legend[1] }}
      </text>
    </svg>
  </div>
</template>

<style lang="less" scoped>
.gui-traffic-chart {
  background: transparent;
}
</style>
