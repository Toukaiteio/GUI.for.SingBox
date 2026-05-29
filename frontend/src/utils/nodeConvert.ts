import { stringify } from 'yaml'

import { Download, FileExists, HttpGet, MakeDir, ReadFile, WriteFile } from '@/bridge'
import i18n from '@/lang'
import { confirm } from '@/utils/interaction'
import { getGitHubApiAuthorization } from '@/utils/others'

import type { Subscription } from '@/types/app'

const NodeConvertDirectory = 'data/third/node-convert'
const ProxyUtilsFile = `${NodeConvertDirectory}/proxy-utils.esm.mjs`
const ProxyUtilsReleaseApi = 'https://api.github.com/repos/sub-store-org/Sub-Store/releases/latest'

type ProxyUtilsModule = {
  parse: (content: string) => Recordable[]
  produce: (proxies: Recordable[], platform: 'singbox', type: 'internal') => Recordable[]
}

type GitHubRelease = {
  assets?: {
    name?: string
    browser_download_url?: string
    uploader?: {
      login?: string
    }
  }[]
}

let proxyUtilsModule: ProxyUtilsModule | undefined

const shouldConvert = (proxies: Recordable[]) => {
  return Boolean(proxies[0]?.base64) || proxies.some((proxy) => proxy.name && !proxy.tag)
}

const loadProxyUtilsModule = async (): Promise<ProxyUtilsModule> => {
  const source = await ReadFile(ProxyUtilsFile)
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const module = (await import(/* @vite-ignore */ url)) as ProxyUtilsModule
    return module
  } finally {
    URL.revokeObjectURL(url)
  }
}

const downloadProxyUtilsModule = async () => {
  const { body } = await HttpGet<GitHubRelease>(ProxyUtilsReleaseApi, {
    Authorization: getGitHubApiAuthorization(),
  })
  const url = body.assets?.find(
    (asset) =>
      asset.uploader?.login === 'github-actions[bot]' && asset.name === 'proxy-utils.esm.mjs',
  )?.browser_download_url

  if (!url) {
    throw new Error('Failed to find node convert dependency: proxy-utils.esm.mjs')
  }

  await MakeDir(NodeConvertDirectory)
  await Download(
    url,
    ProxyUtilsFile,
    {
      Authorization: getGitHubApiAuthorization(),
    },
    undefined,
    { Timeout: 60 },
  )
}

const ensureProxyUtilsModule = async () => {
  if (proxyUtilsModule) return proxyUtilsModule

  if (!(await FileExists(ProxyUtilsFile))) {
    await downloadProxyUtilsModule()
  }

  try {
    proxyUtilsModule = await loadProxyUtilsModule()
  } catch {
    await downloadProxyUtilsModule()
    proxyUtilsModule = await loadProxyUtilsModule()
  }

  return proxyUtilsModule
}

const ensureProxyUtilsModuleWithPrompt = async () => {
  while (true) {
    try {
      return await ensureProxyUtilsModule()
    } catch (error) {
      const { t } = i18n.global
      const reason = error instanceof Error ? error.message : String(error)
      const shouldRetry = await confirm(
        'nodeConvert.dependencyFailed.title',
        t('nodeConvert.dependencyFailed.message', { reason }),
        {
          type: 'markdown',
          okText: 'common.retry',
          cancelText: 'common.cancel',
        },
      ).catch(() => false)

      if (!shouldRetry) {
        throw error
      }
    }
  }
}

export const isUnconvertedSubscriptionProxies = (proxies: Recordable[]) => {
  return proxies.some((proxy) => proxy.name && !proxy.tag) || Boolean(proxies[0]?.base64)
}

export const normalizeSubscriptionProxies = async (
  proxies: Recordable[],
  subscription: Subscription,
) => {
  if (!shouldConvert(proxies)) {
    proxies.forEach((proxy) => {
      delete proxy.domain_resolver
    })
    return proxies
  }

  const { parse, produce } = await ensureProxyUtilsModuleWithPrompt()

  if (proxies.length === 1 && proxies[0]?.base64) {
    proxies = parse(proxies[0].base64)
  }

  const isClashProxies = proxies.some((proxy) => proxy.name && !proxy.tag)

  if (isClashProxies) {
    await WriteFile(`data/.cache/tmp_subscription_${subscription.id}`, stringify({ proxies }))
    proxies = produce(proxies, 'singbox', 'internal')
  }

  proxies.forEach((proxy) => {
    delete proxy.domain_resolver
  })

  return proxies
}
