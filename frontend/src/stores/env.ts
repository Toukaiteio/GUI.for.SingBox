import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { GetEnv } from '@/bridge'
import { OS } from '@/enums/app'
import { useAppSettingsStore, useKernelApiStore, useProfilesStore } from '@/stores'
import { formatProxyHost, updateTrayAndMenus, SetSystemProxy, GetSystemProxy } from '@/utils'

import type { AppEnv } from '@/types/app'

export const useEnvStore = defineStore('env', () => {
  const appSettings = useAppSettingsStore()
  const kernelApiStore = useKernelApiStore()

  const env = ref<AppEnv>({
    appName: '',
    appVersion: '',
    basePath: '',
    appPath: '',
    os: '' as OS,
    arch: '',
    isPrivileged: false,
  })

  const systemProxy = ref(false)

  const setupEnv = async () => {
    const _env = await GetEnv()
    let appPath = `${_env.basePath}/${_env.appName}`
    if (_env.os === OS.Windows) {
      appPath = appPath.replaceAll('/', '\\')
    } else if (_env.os === OS.Darwin) {
      appPath = appPath.replace(`/Contents/MacOS/${_env.appName}`, '')
    }
    env.value = { ..._env, appPath }
  }

  const updateSystemProxyStatus = async () => {
    const kernelApiStore = useKernelApiStore()
    const proxyServer = await GetSystemProxy()

    if (!proxyServer) {
      systemProxy.value = false
    } else {
      const kernelProxy = kernelApiStore.getProxyEndpoint()
      if (!kernelProxy) {
        systemProxy.value = false
        return systemProxy.value
      }

      const { host, port, proxyType } = kernelProxy
      const server = `${formatProxyHost(host)}:${port}`
      const proxyServerList = [`http://${server}`, `socks5://${server}`, `socks=${server}`]
      if (proxyType === 'mixed') {
        proxyServerList.push(
          `http://127.0.0.1:${port}`,
          `socks5://127.0.0.1:${port}`,
          `socks=127.0.0.1:${port}`,
        )
      }
      systemProxy.value = proxyServerList.includes(proxyServer)
    }

    return systemProxy.value
  }

  const setSystemProxy = async () => {
    const proxyBypassList = appSettings.app.proxyBypassList
    let proxyEndpoint = kernelApiStore.getProxyEndpoint()
    if (!proxyEndpoint) {
      await kernelApiStore.updateConfig('inbound', undefined)
    }
    proxyEndpoint = kernelApiStore.getProxyEndpoint()
    if (!proxyEndpoint) throw 'home.overview.needPort'
    const server = `${formatProxyHost(proxyEndpoint.host)}:${proxyEndpoint.port}`
    await SetSystemProxy(true, server, proxyEndpoint.proxyType, proxyBypassList)
    systemProxy.value = true
  }

  const clearSystemProxy = async () => {
    const proxyBypassList = appSettings.app.proxyBypassList
    await SetSystemProxy(false, '', undefined, proxyBypassList)
    systemProxy.value = false
  }

  const switchSystemProxy = async (enable: boolean) => {
    if (enable) await setSystemProxy()
    else await clearSystemProxy()
  }

  const healStaleSystemProxyOnStartup = async () => {
    const currentProxy = await GetSystemProxy()
    if (!currentProxy || kernelApiStore.running) return false

    const match = currentProxy.match(/^[a-z0-9+.-]+:\/\/(\[[^\]]+\]|[^:/]+):(\d+)$/i)
    if (!match) return false

    const host = (match[1] || '').replace(/^\[|\]$/g, '').toLowerCase()
    const port = Number(match[2])
    if (!Number.isFinite(port)) return false

    const localHosts = new Set(['127.0.0.1', 'localhost', '::1'])
    if (!localHosts.has(host)) return false

    const profilesStore = useProfilesStore()
    const expectedPorts = new Set<number>([20120, 20121, 20122])

    profilesStore.profiles.forEach((profile) => {
      profile.inbounds.forEach((inbound) => {
        const listenPort =
          inbound.type === 'mixed'
            ? inbound.mixed?.listen.listen_port
            : inbound.type === 'http'
              ? inbound.http?.listen.listen_port
              : inbound.type === 'socks'
                ? inbound.socks?.listen.listen_port
                : undefined
        if (listenPort) expectedPorts.add(listenPort)
      })
    })

    if (!expectedPorts.has(port)) return false

    await clearSystemProxy()
    return true
  }

  watch(systemProxy, updateTrayAndMenus)

  return {
    env,
    setupEnv,
    systemProxy,
    setSystemProxy,
    clearSystemProxy,
    switchSystemProxy,
    updateSystemProxyStatus,
    healStaleSystemProxyOnStartup,
  }
})
