import { nextTick, ref } from 'vue'

import { FileExists, IsStartup } from '@/bridge'
import CoreInstallPrompt from '@/components/_common/CoreInstallPrompt.vue'
import { CoreWorkingDirectory } from '@/constant/kernel'
import * as Stores from '@/stores'
import { collectDiagnosticSnapshot, getKernelFileName, message, modal, sleep } from '@/utils'

const MIN_SPLASH_DURATION = 1000

export const useAppBootstrap = () => {
  const loading = ref(true)
  const percent = ref(0)
  const hasError = ref(false)

  const envStore = Stores.useEnvStore()
  const appStore = Stores.useAppStore()
  const appSettings = Stores.useAppSettingsStore()
  const profilesStore = Stores.useProfilesStore()
  const subscribesStore = Stores.useSubscribesStore()
  const rulesetsStore = Stores.useRulesetsStore()
  const pluginsStore = Stores.usePluginsStore()
  const scheduledTasksStore = Stores.useScheduledTasksStore()
  const kernelApiStore = Stores.useKernelApiStore()
  let hourlyUpdateTimeout: ReturnType<typeof setTimeout> | null = null
  let hourlyUpdateInterval: ReturnType<typeof setInterval> | null = null

  const showError = (error: unknown) => {
    hasError.value = true
    collectDiagnosticSnapshot('bootstrap', 'initialize-failed', {
      reason: error instanceof Error ? error.message : String(error),
    }).catch(() => {})
    message.error(error)
  }

  const checkUpdatesSilently = () => {
    appStore.checkForUpdates(false, true).catch(() => {})
  }

  const scheduleHourlyUpdateChecks = () => {
    if (hourlyUpdateTimeout) clearTimeout(hourlyUpdateTimeout)
    if (hourlyUpdateInterval) clearInterval(hourlyUpdateInterval)

    const now = new Date()
    const nextHour = new Date(now)
    nextHour.setHours(now.getHours() + 1, 0, 0, 0)
    const msUntilNextHour = Math.max(1000, nextHour.getTime() - now.getTime())

    hourlyUpdateTimeout = setTimeout(() => {
      checkUpdatesSilently()
      hourlyUpdateInterval = setInterval(checkUpdatesSilently, 60 * 60 * 1000)
    }, msUntilNextHour)
  }

  const hasInstalledCore = async () => {
    const [stableInstalled, alphaInstalled] = await Promise.all([
      FileExists(`${CoreWorkingDirectory}/${getKernelFileName(false)}`).catch(() => false),
      FileExists(`${CoreWorkingDirectory}/${getKernelFileName(true)}`).catch(() => false),
    ])
    return stableInstalled || alphaInstalled
  }

  const showCoreInstallPrompt = async () => {
    if (await hasInstalledCore()) return true

    await nextTick()
    const prompt = modal({
      title: 'settings.kernel.installPrompt.title',
      cancelText: 'settings.kernel.installPrompt.skip',
      submit: false,
      maskClosable: false,
      width: '58',
    })
    prompt.setContent(CoreInstallPrompt, { onClose: () => prompt.destroy() }).open()

    return false
  }

  const initialize = async () => {
    await envStore.setupEnv()

    await Promise.all([
      appSettings.setupAppSettings(),
      profilesStore.setupProfiles(),
      subscribesStore.setupSubscribes(),
      rulesetsStore.setupRulesets(),
      pluginsStore.setupPlugins(),
      scheduledTasksStore.setupScheduledTasks(),
    ])

    // Self-heal stale app-owned system proxy entries left by unexpected exits.
    await envStore.healStaleSystemProxyOnStartup().catch(() => {})

    const startTime = performance.now()
    percent.value = 20

    // Check for updates once on startup and once every hour on the hour.
    checkUpdatesSilently()
    scheduleHourlyUpdateChecks()

    if (await IsStartup()) {
      await pluginsStore.onStartupTrigger().catch(showError)
    }

    percent.value = 40
    await pluginsStore.onReadyTrigger().catch(showError)

    const duration = performance.now() - startTime
    percent.value = duration < 500 ? 80 : 100

    await sleep(Math.max(0, MIN_SPLASH_DURATION - duration))

    loading.value = false
    const coreInstalled = await showCoreInstallPrompt()
    await kernelApiStore.initCoreState({ autoStart: coreInstalled })
  }

  initialize().catch(showError)

  return {
    loading,
    percent,
    hasError,
  }
}
