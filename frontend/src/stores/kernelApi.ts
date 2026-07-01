import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  getProxies,
  getConfigs,
  setConfigs,
  onLogs,
  onMemory,
  onConnections,
  onTraffic,
  initWebsocket,
  destroyWebsocket,
  probeApiAvailability,
} from '@/api/kernel'
import { ProcessInfo, KillProcess, ExecBackground, ReadFile, RemoveFile, FileExists } from '@/bridge'
import {
  CoreConfigFilePath,
  CoreLogFilePath,
  CorePidFilePath,
  CoreStopOutputKeyword,
  CoreWorkingDirectory,
} from '@/constant/kernel'
import { DefaultInboundHttp, DefaultInboundMixed, DefaultInboundSocks } from '@/constant/profile'
import { Branch } from '@/enums/app'
import { Inbound, RulesetType, TunStack } from '@/enums/kernel'
import i18n from '@/lang'
import {
  useAppSettingsStore,
  useProfilesStore,
  useLogsStore,
  useEnvStore,
  usePluginsStore,
  useSubscribesStore,
  useRulesetsStore,
} from '@/stores'
import {
  generateConfigFile,
  updateTrayAndMenus,
  getKernelFileName,
  normalizeProxyHost,
  restoreProfile,
  deepClone,
  message,
  getKernelRuntimeArgs,
  getKernelRuntimeEnv,
  eventBus,
  collectDiagnosticSnapshot,
  confirm,
  openDiagnosticDirectory,
  sleep,
} from '@/utils'

import type { CoreApiConfig, CoreApiProxy } from '@/types/kernel'

export type ProxyType = 'mixed' | 'http' | 'socks'
export type ProxyEndpoint = {
  schema: 'http' | 'socks5'
  host: string
  port: number
  username: string
  password: string
  proxyType: ProxyType
}

export const useKernelApiStore = defineStore('kernelApi', () => {
  const envStore = useEnvStore()
  const logsStore = useLogsStore()
  const pluginsStore = usePluginsStore()
  const profilesStore = useProfilesStore()
  const subscribesStore = useSubscribesStore()
  const rulesetsStore = useRulesetsStore()
  const appSettingsStore = useAppSettingsStore()

  /** RESTful API */
  const config = ref<CoreApiConfig>({
    port: 0,
    'mixed-port': 0,
    'socks-port': 0,
    'interface-name': '',
    'allow-lan': false,
    mode: '',
    tun: {
      enable: false,
      stack: '',
      device: '',
    },
  })

  let runtimeProfile: IProfile | undefined
  let shouldRestoreSystemProxyOnNextCoreStart: boolean | undefined

  const proxies = ref<Record<string, CoreApiProxy>>({})

  const refreshConfig = async () => {
    const _config = await getConfigs()

    config.value = {
      ..._config,
      tun: config.value.tun,
    }

    if (!runtimeProfile) {
      const txt = await ReadFile(CoreConfigFilePath)
      runtimeProfile = restoreProfile(JSON.parse(txt))
      const profile = profilesStore.currentProfile
      if (profile) {
        const _profile = deepClone(profile)
        _profile.inbounds.forEach((inbound) => {
          const runtimeInbound = runtimeProfile?.inbounds.find((v) => v.tag === inbound.tag)
          if (runtimeInbound) {
            runtimeInbound.id = inbound.id
          } else {
            inbound.enable = false
            runtimeProfile?.inbounds.push(inbound)
          }
        })
        runtimeProfile.id = _profile.id
        runtimeProfile.outbounds = _profile.outbounds
        runtimeProfile.experimental = _profile.experimental
        runtimeProfile.dns = _profile.dns
        runtimeProfile.route = _profile.route
        runtimeProfile.mixin = _profile.mixin
        runtimeProfile.script = _profile.script
      }
    }

    const mixed = runtimeProfile.inbounds.find((v) => v.enable && v.mixed)
    const http = runtimeProfile.inbounds.find((v) => v.enable && v.http)
    const socks = runtimeProfile.inbounds.find((v) => v.enable && v.socks)
    const tun = runtimeProfile.inbounds.find((v) => v.tun)
    config.value['mixed-port'] = mixed?.mixed?.listen.listen_port || 0
    config.value['port'] = http?.http?.listen.listen_port || 0
    config.value['socks-port'] = socks?.socks?.listen.listen_port || 0
    config.value['allow-lan'] = [
      mixed?.mixed?.listen.listen,
      http?.http?.listen.listen,
      socks?.socks?.listen.listen,
    ].some((address) => address === '0.0.0.0' || address === '::')

    config.value.tun.enable = !!tun?.enable
    config.value.tun.device = tun?.tun?.interface_name || ''
    config.value.tun.stack = tun?.tun?.stack || ''
    config.value['interface-name'] = runtimeProfile.route.default_interface
  }

  const resetConfig = () => {
    config.value.port = 0
    config.value['socks-port'] = 0
    config.value['mixed-port'] = 0
    config.value['interface-name'] = ''
    config.value['allow-lan'] = false
    config.value.mode = ''
    config.value.tun.enable = false
    config.value.tun.stack = ''
    config.value.tun.device = ''
  }

  const updateConfig = async (field: string, value: any) => {
    if (field === 'mode') {
      await setConfigs({ mode: value })
      await refreshConfig()
      return
    }

    const patchInbound = () => {
      if (!runtimeProfile) return
      const inbound = runtimeProfile.inbounds.find(
        (v) =>
          (v.type === Inbound.Mixed && v.mixed?.listen.listen_port) ||
          (v.type === Inbound.Http && v.http?.listen.listen_port) ||
          (v.type === Inbound.Socks && v.socks?.listen.listen_port),
      )
      if (!inbound) {
        throw 'home.overview.needPort'
      }
      inbound.enable = true
    }

    const patchInboundTun = (options: {
      enable: boolean
      stack: string
      device: string
      interface_name: string
    }) => {
      patchProfileTun(runtimeProfile, options)
    }

    const fieldHandlerMap: Recordable<() => void> = {
      inbound: () => patchInbound(),
      http: () => patchProfileInboundPort(runtimeProfile, Inbound.Http, Number(value)),
      socks: () => patchProfileInboundPort(runtimeProfile, Inbound.Socks, Number(value)),
      mixed: () => patchProfileInboundPort(runtimeProfile, Inbound.Mixed, Number(value)),
      'allow-lan': () => patchProfileInboundAddress(runtimeProfile, value),
      tun: () => patchInboundTun(value),
      'tun-stack': () => patchInboundTun(value),
      'tun-device': () => patchInboundTun(value),
      'interface-name': () => patchInboundTun(value),
    }

    fieldHandlerMap[field]?.()

    await persistRuntimeProfileChange(field, value)

    if (!running.value) return

    if (field === 'tun' && typeof value?.enable === 'boolean' && !value.enable && !envStore.systemProxy) {
      shouldRestoreSystemProxyOnNextCoreStart = undefined
      await stopCore()
      await envStore.updateSystemProxyStatus()
      return
    }

    if (field === 'tun' && typeof value?.enable === 'boolean') {
      shouldRestoreSystemProxyOnNextCoreStart = envStore.systemProxy
    }

    await restartCore(undefined, true)
    await envStore.updateSystemProxyStatus()
  }

  const refreshProviderProxies = async () => {
    const { proxies: b } = await getProxies()
    proxies.value = b
  }

  const patchProfileInboundPort = (profile: IProfile | undefined, type: ProxyType, port: number) => {
    if (!profile) return
    let inbound = profile.inbounds.find((v) => v.type === type)
    if (inbound) {
      inbound[type]!.listen.listen_port = port
    } else {
      const id = type + '-in'
      if (type === Inbound.Http) {
        inbound = { id, tag: id, type: Inbound.Http, enable: true, http: DefaultInboundHttp() }
      } else if (type === Inbound.Socks) {
        inbound = { id, tag: id, type: Inbound.Socks, enable: true, socks: DefaultInboundSocks() }
      } else {
        inbound = { id, tag: id, type: Inbound.Mixed, enable: true, mixed: DefaultInboundMixed() }
      }
      profile.inbounds.push(inbound)
    }
    inbound[type]!.listen.listen_port = port
    inbound.enable = port !== 0
  }

  const patchProfileInboundAddress = (profile: IProfile | undefined, allowLan: boolean) => {
    if (!profile) return
    profile.inbounds.forEach((inbound) => {
      if (inbound.type === Inbound.Tun) return
      inbound[inbound.type]!.listen.listen = allowLan ? '0.0.0.0' : '127.0.0.1'
    })
  }

  const patchProfileTun = (
    profile: IProfile | undefined,
    options: { enable: boolean; stack: string; device: string; interface_name: string },
  ) => {
    if (!profile) return
    const inbound = profile.inbounds.find((v) => v.type === Inbound.Tun)
    if (!inbound) throw 'home.overview.needTun'
    options = { ...config.value.tun, ...options }
    inbound.enable = options.enable
    inbound.tun!.stack = options.stack || TunStack.Mixed
    inbound.tun!.interface_name = options.device || ''
    if (options.interface_name) {
      profile.route.default_interface = options.interface_name
    }
    profile.route.auto_detect_interface = !options.interface_name
  }

  const persistRuntimeProfileChange = async (field: string, value: any) => {
    const currentProfile = profilesStore.currentProfile
    if (!currentProfile) return

    const idx = profilesStore.profiles.findIndex((profile) => profile.id === currentProfile.id)
    const backup = deepClone(currentProfile)

    try {
      const fieldHandlerMap: Recordable<() => void> = {
        http: () => patchProfileInboundPort(currentProfile, Inbound.Http, Number(value)),
        socks: () => patchProfileInboundPort(currentProfile, Inbound.Socks, Number(value)),
        mixed: () => patchProfileInboundPort(currentProfile, Inbound.Mixed, Number(value)),
        'allow-lan': () => patchProfileInboundAddress(currentProfile, value),
        tun: () => patchProfileTun(currentProfile, value),
        'tun-stack': () => patchProfileTun(currentProfile, value),
        'tun-device': () => patchProfileTun(currentProfile, value),
        'interface-name': () => patchProfileTun(currentProfile, value),
      }

      const handler = fieldHandlerMap[field]
      if (!handler) return

      handler()
      await profilesStore.saveProfiles()
    } catch (error) {
      if (idx !== -1) {
        profilesStore.profiles.splice(idx, 1, backup)
      }
      throw error
    }
  }

  /* Bridge API */
  const corePid = ref(-1)
  const running = ref(false)
  const starting = ref(false)
  const stopping = ref(false)
  const restarting = ref(false)
  const needRestart = ref(false)
  const coreStateLoading = ref(true)
  let isCoreStartedByThisInstance = false
  let startCorePromise: Promise<void> | null = null
  let expectedStop = false
  let unexpectedStopNotifying = false
  let { promise: coreStoppedPromise, resolve: coreStoppedResolver } = Promise.withResolvers()

  const initCoreState = async (options: { autoStart?: boolean } = {}) => {
    const { autoStart = true } = options
    coreStateLoading.value = true

    try {
      corePid.value = Number(await ReadFile(CorePidFilePath).catch(() => -1))
      const processName = corePid.value === -1 ? '' : await ProcessInfo(corePid.value).catch(() => '')
      running.value = processName.startsWith('sing-box')

      if (running.value) {
        initWebsocket()
        await Promise.all([refreshConfig(), refreshProviderProxies()])
        await envStore.updateSystemProxyStatus()
      } else if (autoStart && appSettingsStore.app.autoStartKernel) {
        const isAlpha = appSettingsStore.app.kernel.branch === Branch.Alpha
        const coreInstalled = await FileExists(
          `${CoreWorkingDirectory}/${getKernelFileName(isAlpha)}`,
        ).catch(() => false)
        if (!coreInstalled) return
        await startCore()
      }
    } finally {
      coreStateLoading.value = false
    }
  }

  const runCoreProcess = async (isAlpha: boolean) => {
    let output = ''
    let stopped = false
    let stopReason = ''

    const pid = await ExecBackground(
      CoreWorkingDirectory + '/' + getKernelFileName(isAlpha),
      getKernelRuntimeArgs(isAlpha),
      (out) => {
        output = out
        logsStore.recordKernelLog(out)
      },
      async (reason) => {
        stopped = true
        stopReason = reason || output
        await onCoreStopped({
          expected: expectedStop,
          reason: stopReason,
        })
      },
      {
        PidFile: CorePidFilePath,
        LogFile: CoreLogFilePath,
        StopOutputKeyword: CoreStopOutputKeyword,
        Env: getKernelRuntimeEnv(isAlpha),
      },
    )

    while (!stopped) {
      const ok = await probeApiAvailability().catch(() => false)
      if (ok) {
        return pid
      }
      await sleep(500)
    }

    throw stopReason || 'Startup failed. Check logs for details.'
  }

  const onCoreStarted = async (pid: number) => {
    corePid.value = pid
    running.value = true
    needRestart.value = false
    isCoreStartedByThisInstance = true
    expectedStop = false
    coreStoppedPromise = new Promise((r) => (coreStoppedResolver = r))

    initWebsocket()
    await Promise.all([refreshConfig(), refreshProviderProxies()])

    const shouldRestoreSystemProxy =
      shouldRestoreSystemProxyOnNextCoreStart ?? appSettingsStore.app.autoSetSystemProxy
    shouldRestoreSystemProxyOnNextCoreStart = undefined

    if (shouldRestoreSystemProxy) {
      await envStore.setSystemProxy().catch((err) => message.error(err))
    }
    await envStore.updateSystemProxyStatus()

    await pluginsStore.onCoreStartedTrigger()
  }

  const notifyUnexpectedStop = async (reason: string) => {
    if (unexpectedStopNotifying) return
    unexpectedStopNotifying = true

    try {
      const { t } = i18n.global
      const diagnosticsPath = await collectDiagnosticSnapshot('kernel', 'unexpected-stop', {
        reason,
        running: running.value,
        starting: starting.value,
        stopping: stopping.value,
        restarting: restarting.value,
      }).catch(() => '')

      const parts = [
        t('diagnostics.unexpectedKernelExit'),
        '',
        t('diagnostics.reason', { reason: reason || 'unknown' }),
      ]

      if (diagnosticsPath) {
        parts.push('', t('diagnostics.bundleReady', { path: diagnosticsPath }))
        parts.push(t('diagnostics.shareBundle'))
      }

      parts.push('', t('diagnostics.openBundle'))

      const confirmed = await confirm(
        'common.warning',
        parts.join('\n'),
      ).catch(() => 0)

      if (confirmed && diagnosticsPath) {
        await openDiagnosticDirectory(diagnosticsPath).catch((err) => message.error(err))
      }
    } finally {
      unexpectedStopNotifying = false
    }
  }

  const onCoreStopped = async (options: { expected?: boolean; reason?: string } = {}) => {
    const { expected = false, reason = '' } = options
    expectedStop = false

    if (!isCoreStartedByThisInstance) {
      await RemoveFile(CorePidFilePath)
    }

    corePid.value = -1
    running.value = false
    needRestart.value = false

    destroyWebsocket()

    await envStore.updateSystemProxyStatus()
    if (envStore.systemProxy) {
      await envStore.clearSystemProxy()
    }
    resetConfig()
    await pluginsStore.onCoreStoppedTrigger()

    coreStoppedResolver(null)

    const normalizedReason = String(reason || '').trim()
    if (!expected && isCoreStartedByThisInstance) {
      await notifyUnexpectedStop(normalizedReason)
    }

    isCoreStartedByThisInstance = false
  }

  const startCore = async (_profile?: IProfile) => {
    if (running.value) throw 'The core is already running'
    if (startCorePromise) return startCorePromise

    startCorePromise = (async () => {
      logsStore.clearKernelLog()

      const { profile: profileID, branch } = appSettingsStore.app.kernel
      const profile = _profile || profilesStore.getProfileById(profileID)
      if (!profile) throw 'Choose a profile first'

      if (!_profile) {
        runtimeProfile = undefined
      }

      starting.value = true
      try {
        await generateConfigFile(profile, (config) =>
          pluginsStore.onBeforeCoreStartTrigger(config, profile),
        )
        const isAlpha = branch === Branch.Alpha
        const pid = await runCoreProcess(isAlpha)
        pid && (await onCoreStarted(pid))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        const { t } = i18n.global
        const diagnosticsPath = await collectDiagnosticSnapshot('kernel', 'startup-failed', {
          reason,
          branch,
          profileId: profile.id,
          profileName: profile.name,
        }).catch(() => '')

        if (diagnosticsPath) {
          throw [
            reason,
            '',
            t('diagnostics.bundleReady', { path: diagnosticsPath }),
            t('diagnostics.shareBundle'),
          ].join('\n')
        }

        throw error
      } finally {
        starting.value = false
      }
    })()

    try {
      await startCorePromise
    } finally {
      startCorePromise = null
    }
  }

  const stopCore = async () => {
    if (!running.value) throw 'The core is not running'

    stopping.value = true
    expectedStop = true
    try {
      await pluginsStore.onBeforeCoreStopTrigger()
      await KillProcess(corePid.value)
      await (isCoreStartedByThisInstance ? coreStoppedPromise : onCoreStopped())
    } finally {
      stopping.value = false
      expectedStop = false
    }
  }

  const restartCore = async (cleanupTask?: () => Promise<any>, keepRuntimeProfile = false) => {
    restarting.value = true
    try {
      await stopCore()
      await cleanupTask?.()
      await startCore(keepRuntimeProfile ? runtimeProfile : undefined)
    } finally {
      needRestart.value = false
      restarting.value = false
    }
  }

  const getProxyProfileOptions = (proxyType: ProxyType) => {
    const inboundTypeMap = {
      mixed: Inbound.Mixed,
      http: Inbound.Http,
      socks: Inbound.Socks,
    } satisfies Record<ProxyType, Inbound>

    const inbound = runtimeProfile?.inbounds.find(
      (item) => item.enable && item.type === inboundTypeMap[proxyType],
    )

    const inboundOptions =
      proxyType === Inbound.Mixed
        ? inbound?.mixed
        : proxyType === Inbound.Http
          ? inbound?.http
          : inbound?.socks

    const listen = inboundOptions?.listen.listen || ''
    const auth = inboundOptions?.users[0]?.trim()
    const host = normalizeProxyHost((listen || '').trim())

    if (!auth) return { host, username: '', password: '' }

    const [username, ...passwordParts] = auth.split(':')

    return {
      host,
      username: username || '',
      password: passwordParts.join(':'),
    }
  }

  const getProxyEndpoint = (): ProxyEndpoint | undefined => {
    const { port, 'socks-port': socksPort, 'mixed-port': mixedPort } = config.value
    let targetPort = 0
    let proxyType: ProxyType | undefined

    if (mixedPort) {
      targetPort = mixedPort
      proxyType = 'mixed'
    } else if (port) {
      targetPort = port
      proxyType = 'http'
    } else if (socksPort) {
      targetPort = socksPort
      proxyType = 'socks'
    } else {
      return undefined
    }

    const { host, username, password } = getProxyProfileOptions(proxyType)
    const schema = proxyType === 'socks' ? 'socks5' : 'http'

    return {
      schema,
      host,
      port: targetPort,
      username,
      password,
      proxyType,
    }
  }

  eventBus.on('profileChange', ({ id }) => {
    if (running.value && id === appSettingsStore.app.kernel.profile) {
      needRestart.value = true
    }
  })

  eventBus.on('subscriptionChange', ({ id }) => {
    if (running.value && profilesStore.currentProfile) {
      const inUse = profilesStore.currentProfile.outbounds.some(({ outbounds }) =>
        outbounds.some((outbound) => outbound.type === 'Subscription' && outbound.id === id),
      )
      if (inUse) {
        needRestart.value = true
      }
    }
  })

  eventBus.on('subscriptionsChange', () => {
    if (running.value && profilesStore.currentProfile) {
      const enabledSubs = subscribesStore.subscribes.flatMap((v) => (v.disabled ? [] : v.id))
      const inUse = profilesStore.currentProfile.outbounds.some(({ outbounds }) =>
        outbounds.some(
          (outbound) => outbound.type === 'Subscription' && enabledSubs.includes(outbound.id),
        ),
      )
      if (inUse) {
        needRestart.value = true
      }
    }
  })

  const collectRulesetIDs = () => {
    if (!profilesStore.currentProfile) return []
    const l1 = profilesStore.currentProfile.route.rule_set.flatMap((ruleset) =>
      ruleset.type === RulesetType.Local ? ruleset.path : [],
    )
    return l1
  }

  eventBus.on('rulesetChange', ({ id }) => {
    if (running.value && profilesStore.currentProfile) {
      const inUse = profilesStore.currentProfile.route.rule_set.some(
        (ruleset) => ruleset.type === RulesetType.Local && ruleset.path === id,
      )
      if (inUse) {
        needRestart.value = true
      }
    }
  })

  eventBus.on('rulesetsChange', () => {
    if (running.value && profilesStore.currentProfile) {
      const enabledRulesets = rulesetsStore.rulesets.flatMap((v) => (v.disabled ? [] : v.id))
      const inUse = collectRulesetIDs().some((v) => enabledRulesets.includes(v))
      if (inUse) {
        needRestart.value = true
      }
    }
  })

  watch(needRestart, (v) => {
    if (v && appSettingsStore.app.autoRestartKernel) {
      restartCore()
    }
  })

  const watchSources = computed(() => {
    const source = [config.value.mode, config.value.tun.enable]
    if (!appSettingsStore.app.addGroupToMenu) return source.join('')

    const { unAvailable, sortByDelay } = appSettingsStore.app.kernel

    const proxySignature = Object.values(proxies.value)
      .map((group) => group.name + group.now)
      .sort()
      .join()

    return source.concat([proxySignature, unAvailable, sortByDelay]).join('')
  })

  watch([watchSources, running], updateTrayAndMenus)

  return {
    startCore,
    stopCore,
    restartCore,
    initCoreState,
    pid: corePid,
    running,
    starting,
    stopping,
    restarting,
    needRestart,
    coreStateLoading,
    config,
    proxies,
    refreshConfig,
    updateConfig,
    refreshProviderProxies,
    getProxyEndpoint,

    onLogs,
    onMemory,
    onTraffic,
    onConnections,
  }
})
