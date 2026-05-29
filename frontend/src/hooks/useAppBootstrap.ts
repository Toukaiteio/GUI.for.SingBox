import { nextTick, ref } from 'vue'

import { FileExists, IsStartup } from '@/bridge'
import CoreInstallPrompt from '@/components/_common/CoreInstallPrompt.vue'
import { CoreWorkingDirectory } from '@/constant/kernel'
import * as Stores from '@/stores'
import { openDeveloperTools } from '@/utils/devTools'
import { getKernelFileName, message, modal, sleep } from '@/utils'

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

  const showError = (error: unknown) => {
    hasError.value = true
    message.error(error)
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

    const startTime = performance.now()
    percent.value = 20

    // Check for updates once on startup (non-blocking, silent on failure)
    appStore.checkForUpdates(false, true)

    if (await IsStartup()) {
      await pluginsStore.onStartupTrigger().catch(showError)
    }

    percent.value = 40
    await pluginsStore.onReadyTrigger().catch(showError)

    const duration = performance.now() - startTime
    percent.value = duration < 500 ? 80 : 100

    await sleep(Math.max(0, MIN_SPLASH_DURATION - duration))

    loading.value = false
    if (appSettings.app.developerMode) {
      setTimeout(() => {
        openDeveloperTools().catch((error) => {
          console.warn('Failed to open developer tools:', error)
          message.warn('Failed to open DevTools automatically. Press Ctrl+Shift+F12 in the app.')
        })
      }, 1000)
    }
    const coreInstalled = await showCoreInstallPrompt()
    kernelApiStore.initCoreState({ autoStart: coreInstalled })
  }

  initialize().catch(showError)

  return {
    loading,
    percent,
    hasError,
  }
}
