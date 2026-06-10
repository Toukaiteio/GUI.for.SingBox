import * as Vue from 'vue'
import { stringify, parse } from 'yaml'

import * as Bridge from '@/bridge'
import * as Stores from '@/stores'
import * as Utils from '@/utils'

type GlobalWindow = Window &
  typeof globalThis & {
    $Plugins?: Recordable
    Plugins?: Recordable
    Vue?: typeof Vue
    AsyncFunction?: Function
  }

const globalWindow = window as GlobalWindow

const normalizePluginCacheValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value == null) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const createFallbackSubStoreCache = () => {
  const prefix = '__sub_store_cache__:'

  return {
    get(key: string) {
      try {
        const value = window.localStorage.getItem(prefix + key)
        return value === null ? undefined : value
      } catch {
        return undefined
      }
    },
    set(key: string, value: unknown) {
      const normalized = normalizePluginCacheValue(value) ?? ''
      try {
        window.localStorage.setItem(prefix + key, normalized)
      } catch {
        // ignore localStorage quota / availability failures for compatibility cache
      }
      return normalized
    },
    remove(key: string) {
      try {
        window.localStorage.removeItem(prefix + key)
      } catch {
        // ignore localStorage availability failures for compatibility cache
      }
    },
  }
}

const fallbackSubStoreCache = createFallbackSubStoreCache()
const rawDollarPlugins = globalWindow.$Plugins || {}
const rawSubStoreCache = rawDollarPlugins.SubStoreCache as
  | {
      get?: (key: string) => unknown
      set?: (key: string, value: unknown) => unknown
      remove?: (key: string) => unknown
    }
  | undefined

/**
 * Expose methods to be used by the plugin system
 */
globalWindow.Plugins = {
  ...Bridge,
  ...Utils,
  ...Stores,
  YAML: {
    parse,
    stringify,
  },
}

globalWindow.$Plugins = {
  ...rawDollarPlugins,
  Requests: rawDollarPlugins.Requests || globalWindow.Plugins?.Requests,
  SubStoreCache: {
    get(key: string) {
      try {
        const value = rawSubStoreCache?.get?.(key)
        const normalized = normalizePluginCacheValue(value)
        if (normalized !== undefined) {
          fallbackSubStoreCache.set(key, normalized)
          return normalized
        }
      } catch (error) {
        console.warn('[proxy-utils] Failed to read $Plugins.SubStoreCache, falling back.', error)
      }
      return fallbackSubStoreCache.get(key)
    },
    set(key: string, value: unknown) {
      const normalized = normalizePluginCacheValue(value) ?? ''
      fallbackSubStoreCache.set(key, normalized)
      try {
        rawSubStoreCache?.set?.(key, normalized)
      } catch (error) {
        console.warn('[proxy-utils] Failed to write $Plugins.SubStoreCache, using fallback.', error)
      }
      return normalized
    },
    remove(key: string) {
      fallbackSubStoreCache.remove(key)
      try {
        rawSubStoreCache?.remove?.(key)
      } catch (error) {
        console.warn('[proxy-utils] Failed to remove $Plugins.SubStoreCache key, using fallback.', error)
      }
    },
  },
}

globalWindow.Vue = Vue

globalWindow.AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
