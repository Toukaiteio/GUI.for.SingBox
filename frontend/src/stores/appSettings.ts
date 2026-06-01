import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { parse, stringify } from 'yaml'

import {
  ReadFile,
  WriteFile,
  WindowSetSystemDefaultTheme,
  WindowIsMaximised,
  WindowIsMinimised,
} from '@/bridge'
import {
  DefaultCardColumns,
  DefaultConcurrencyLimit,
  DefaultControllerSensitivity,
  DefaultFontFamily,
  DefaultPluginHubSources,
  DefaultTestTimeout,
  DefaultTestURL,
  UserFilePath,
} from '@/constant/app'
import { DefaultConnections, DefaultCoreConfig } from '@/constant/kernel'
import {
  Theme,
  WindowStartState,
  Lang,
  View,
  Color,
  WebviewGpuPolicy,
  ControllerCloseMode,
  Branch,
  RequestProxyMode,
  UpdateSource,
} from '@/enums/app'
import i18n, { loadLocale } from '@/lang'
import { useAppStore, useEnvStore } from '@/stores'
import {
  debounce,
  updateTrayAndMenus,
  ignoredError,
  GetSystemProxyBypass,
  deepClone,
} from '@/utils'

import type { AppSettings } from '@/types/app'

export const useAppSettingsStore = defineStore('app-settings', () => {
  const appStore = useAppStore()
  const envStore = useEnvStore()

  let latestUserSettings: string

  const app = ref<AppSettings>({
    lang: Lang.EN,
    theme: Theme.Auto,
    color: Color.Default,
    primaryColor: '#000',
    secondaryColor: '#545454',
    fontFamily: DefaultFontFamily,
    background: {
      light: { image: '', blur: 0, opacity: 100 },
      dark: { image: '', blur: 0, opacity: 100 },
    },
    profilesView: View.Grid,
    subscribesView: View.Grid,
    rulesetsView: View.Grid,
    pluginsView: View.Grid,
    scheduledtasksView: View.Grid,
    windowStartState: WindowStartState.Normal,
    webviewGpuPolicy: WebviewGpuPolicy.OnDemand,
    contentProtection: false,
    width: 0,
    height: 0,
    exitOnClose: true,
    closeKernelOnExit: true,
    autoSetSystemProxy: true,
    requestProxyMode: RequestProxyMode.System,
    customProxy: '',
    proxyBypassList: '',
    autoStartKernel: false,
    autoRestartKernel: false,
    userAgent: '',
    startupDelay: 30,
    connections: DefaultConnections(),
    kernel: {
      realMemoryUsage: false,
      branch: Branch.Main,
      profile: '',
      autoClose: true,
      unAvailable: true,
      cardMode: true,
      cardColumns: DefaultCardColumns,
      sortByDelay: false,
      testUrl: DefaultTestURL,
      testTimeout: DefaultTestTimeout,
      concurrencyLimit: DefaultConcurrencyLimit,
      controllerCloseMode: ControllerCloseMode.All,
      controllerSensitivity: DefaultControllerSensitivity,
      main: undefined as any,
      alpha: undefined as any,
    },
    plugins: {
      sources: DefaultPluginHubSources(),
    },
    pluginSettings: {},
    githubApiToken: '',
    updateSource: UpdateSource.Github,
    multipleInstance: false,
    addPluginToMenu: false,
    addGroupToMenu: false,
    rollingRelease: true,
    developerMode: false,
    debugOutline: false,
    debugNoAnimation: false,
    debugNoRounded: false,
    debugBorder: false,
    debugUsePointer: false,
    pages: ['Overview', 'NodeSelect', 'Profiles', 'Subscriptions', 'Plugins'],
  })

  const saveAppSettings = debounce((config: string) => {
    WriteFile(UserFilePath, config)
  }, 500)

  const setupAppSettings = async () => {
    const data = await ignoredError(ReadFile, UserFilePath)
    let settings: AppSettings
    if (data) {
      settings = parse(data)
    } else {
      settings = deepClone(app.value)
    }

    await appStore.loadLocales(false, false)

    if (!settings.kernel.main) {
      settings.kernel.main = DefaultCoreConfig()
      settings.kernel.alpha = DefaultCoreConfig()
    }
    if (!settings.proxyBypassList) {
      settings.proxyBypassList = await GetSystemProxyBypass()
    }
    if (!settings.requestProxyMode) {
      settings.requestProxyMode = RequestProxyMode.System
    }
    if (settings.customProxy === undefined) {
      settings.customProxy = ''
    }
    if (!settings.plugins) {
      settings.plugins = {
        sources: DefaultPluginHubSources(),
      }
    }
    if (!settings.background) {
      settings.background = {
        light: { image: '', blur: 0, opacity: 100 },
        dark: { image: '', blur: 0, opacity: 100 },
      }
    }
    if (settings.debugUsePointer === undefined) {
      settings.debugUsePointer = false
    }
    if (settings.developerMode === undefined) {
      settings.developerMode = false
    }
    if (!settings.updateSource) {
      settings.updateSource = UpdateSource.Github
    }
    if (!settings.pages) {
      settings.pages = ['Overview', 'NodeSelect', 'Profiles', 'Subscriptions', 'Plugins']
    } else if (!settings.pages.includes('NodeSelect')) {
      const overviewIndex = settings.pages.indexOf('Overview')
      settings.pages.splice(overviewIndex === -1 ? 0 : overviewIndex + 1, 0, 'NodeSelect')
    }

    app.value = settings
    latestUserSettings = stringify(app.value)

    setTimeout(() => {
      isFirstThemeLoad = false
    }, 200)
  }

  const bgImageCache: Recordable<string> = {}
  const applyAppSettings = {
    async background(background: AppSettings['background']) {
      const conf = background[themeMode.value === Theme.Dark ? 'dark' : 'light']
      const style = document.body.style
      style.setProperty('--app-bg-blur', conf.blur + 'px')
      style.setProperty('--app-bg-opacity', String(conf.opacity / 100))
      if (!conf.image) {
        style.removeProperty('--app-bg-image')
        return
      }
      let src = conf.image
      if (!/^(https?:|data:)/.test(src)) {
        const cached = bgImageCache[src]
        if (cached) {
          src = cached
        } else {
          const b64 = await ignoredError(ReadFile, conf.image, { Mode: 'Binary' })
          if (!b64) {
            style.removeProperty('--app-bg-image')
            return
          }
          const ext = conf.image.split('.').pop()?.toLowerCase()
          const mime =
            ext === 'jpg' || ext === 'jpeg'
              ? 'jpeg'
              : ext === 'webp'
                ? 'webp'
                : ext === 'gif'
                  ? 'gif'
                  : ext === 'svg'
                    ? 'svg+xml'
                    : 'png'
          src = bgImageCache[conf.image] = `data:image/${mime};base64,${b64}`
        }
      }
      style.setProperty('--app-bg-image', `url("${src}")`)
    },
    theme(theme: Theme) {
      const isAuto = theme === Theme.Auto
      if (isAuto) {
        themeMode.value = mediaQueryList.matches ? Theme.Dark : Theme.Light
      } else {
        themeMode.value = theme
      }
    },
    lang(lang: string) {
      i18n.global.locale.value = lang
      if (!i18n.global.availableLocales.includes(lang)) {
        loadLocale(lang)
      }
    },

    feature(
      outline: boolean,
      noAnimation: boolean,
      noRounded: boolean,
      border: boolean,
      usePointer: boolean,
    ) {
      document.body.setAttribute('feature-outline', String(outline))
      document.body.setAttribute('feature-no-animation', String(noAnimation))
      document.body.setAttribute('feature-no-rounded', String(noRounded))
      document.body.setAttribute('feature-border', String(border))
      document.body.setAttribute('feature-use-pointer', String(usePointer))
    },
    fontFamily(fontFamily: string) {
      document.body.style.fontFamily = fontFamily
    },
    windowSize(width: number, height: number) {
      app.value.width = width
      app.value.height = height
    },
    systemProxyBypass() {
      if (envStore.systemProxy) {
        envStore.setSystemProxy()
      }
    },
  }

  /* Apply AppSettings */
  const onAppSettingsChange = (settings: AppSettings) => {
    applyAppSettings.theme(settings.theme)
    applyAppSettings.background(settings.background)
    applyAppSettings.lang(settings.lang)
    applyAppSettings.fontFamily(settings.fontFamily)
    applyAppSettings.feature(
      settings.debugOutline,
      settings.debugNoAnimation,
      settings.debugNoRounded,
      settings.debugBorder,
      settings.debugUsePointer,
    )
    const lastModifiedSettings = stringify(settings)
    if (latestUserSettings !== lastModifiedSettings) {
      saveAppSettings(lastModifiedSettings).then(() => {
        latestUserSettings = lastModifiedSettings
      })
    } else {
      saveAppSettings.cancel()
    }
  }
  watch(app, onAppSettingsChange, { deep: true })

  /* Apply AppTheme */
  const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
  const getInitialTheme = (): Theme.Light | Theme.Dark => {
    try {
      const stored = localStorage.getItem('theme-mode')
      if (stored === Theme.Dark || stored === Theme.Light) {
        return stored as Theme.Light | Theme.Dark
      }
    } catch {}
    return mediaQueryList.matches ? Theme.Dark : Theme.Light
  }
  const themeMode = ref<Theme.Light | Theme.Dark>(getInitialTheme())
  mediaQueryList.addEventListener('change', ({ matches }) => {
    if (app.value.theme === Theme.Auto) {
      themeMode.value = matches ? Theme.Dark : Theme.Light
    }
  })
  let isFirstThemeLoad = true
  const setAppTheme = (theme: Theme.Dark | Theme.Light) => {
    try {
      localStorage.setItem('theme-mode', theme)
    } catch {}
    if (document.startViewTransition && !isFirstThemeLoad) {
      const transition = document.startViewTransition(() => {
        document.body.setAttribute('theme-mode', theme)
      })
      transition.ready.catch(() => {})
      transition.finished.catch(() => {})
    } else {
      document.body.setAttribute('theme-mode', theme)
    }
    WindowSetSystemDefaultTheme()
  }
  watch(themeMode, setAppTheme, { immediate: true })
  watch(themeMode, () => applyAppSettings.background(app.value.background))

  /* Apply WindowSize */
  const onWindowSizeChange = debounce(async () => {
    const [isMinimised, isMaximised] = await Promise.all([WindowIsMinimised(), WindowIsMaximised()])
    if (!isMinimised && !isMaximised) {
      const w = document.documentElement.clientWidth
      const h = document.documentElement.clientHeight
      applyAppSettings.windowSize(w, h)
    }
  }, 1000)
  window.addEventListener('resize', onWindowSizeChange)

  /* Apply TrayAndMenus */
  watch(
    [
      themeMode,
      appStore.locales,
      () => app.value.lang,
      () => app.value.addPluginToMenu,
    ],
    updateTrayAndMenus,
  )

  /* Apply SystemProxyBypass */
  const setSystemProxyBypass = debounce(() => {
    applyAppSettings.systemProxyBypass()
  }, 3000)
  watch(() => app.value.proxyBypassList, setSystemProxyBypass)

  return { setupAppSettings, app, themeMode }
})
