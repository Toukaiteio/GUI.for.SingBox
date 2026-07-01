import { CaptureDiagnosticSnapshot, OpenDir, WriteFile } from '@/bridge'
import { CoreLogFilePath, CorePidFilePath } from '@/constant/kernel'
import { useAppSettingsStore, useEnvStore, useKernelApiStore, useLogsStore } from '@/stores'
import { APP_TITLE, APP_VERSION, normalizeErrorMessage } from '@/utils'

const FrontendCrashLogPath = 'data/.cache/frontend-crash.log'

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const appendMetadata = (target: Record<string, string>, key: string, value: unknown) => {
  if (value === undefined || value === null) return
  const text = typeof value === 'string' ? value : safeStringify(value)
  if (!text) return
  target[key] = text
}

export const collectDiagnosticSnapshot = async (
  category: string,
  label: string,
  extras: Record<string, unknown> = {},
) => {
  const envStore = useEnvStore()
  const appSettingsStore = useAppSettingsStore()
  const kernelApiStore = useKernelApiStore()
  const logsStore = useLogsStore()

  const formattedExtras = Object.entries(extras)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : safeStringify(value)}`)

  const frontendLog = [
    `[${new Date().toISOString()}] ${category}/${label}`,
    '',
    ...formattedExtras,
    formattedExtras.length ? '' : undefined,
    ...logsStore.kernelLogs.slice(0, 300).reverse(),
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n')

  await WriteFile(FrontendCrashLogPath, frontendLog).catch(() => {})

  const metadata: Record<string, string> = {
    appTitle: APP_TITLE,
    appVersion: APP_VERSION,
    basePath: envStore.env.basePath,
    appPath: envStore.env.appPath,
    os: envStore.env.os,
    arch: envStore.env.arch,
    isPrivileged: String(envStore.env.isPrivileged),
    kernelRunning: String(kernelApiStore.running),
    kernelPid: String(kernelApiStore.pid),
    kernelBranch: appSettingsStore.app.kernel.branch,
    kernelProfile: appSettingsStore.app.kernel.profile,
    autoStartKernel: String(appSettingsStore.app.autoStartKernel),
    autoRestartKernel: String(appSettingsStore.app.autoRestartKernel),
    autoSetSystemProxy: String(appSettingsStore.app.autoSetSystemProxy),
    closeKernelOnExit: String(appSettingsStore.app.closeKernelOnExit),
    systemProxyActive: String(envStore.systemProxy),
    kernelLogBufferedLines: String(logsStore.kernelLogs.length),
  }

  Object.entries(extras).forEach(([key, value]) => appendMetadata(metadata, key, value))

  return await CaptureDiagnosticSnapshot({
    Category: category,
    Label: label,
    Metadata: metadata,
    LogFiles: [CoreLogFilePath, FrontendCrashLogPath, CorePidFilePath],
  })
}

export const openDiagnosticDirectory = async (path: string) => {
  await OpenDir(path)
}

export const getDiagnosticErrorMessage = (error: unknown) => normalizeErrorMessage(error)
