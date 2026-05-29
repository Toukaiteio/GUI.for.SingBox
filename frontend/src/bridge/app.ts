import * as App from '@wails/go/bridge/App'

import { sampleID } from '@/utils'

import type { AppEnv } from '@/types/app'

interface NotificationOptions {
  id: string
  title: string
  body: string
  data?: Record<string, any>
}

const getRuntime = () => (window as any).runtime as Record<string, (...args: any[]) => any>

export const IsNotificationAvailable = (): Promise<boolean> => {
  return getRuntime().IsNotificationAvailable!()
}

export const RequestNotificationAuthorization = (): Promise<void> => {
  return getRuntime().RequestNotificationAuthorization!()
}

export const SendNotification = (options: NotificationOptions): Promise<void> => {
  return getRuntime().SendNotification!(options)
}

export const RestartApp = App.RestartApp

export const ExitApp = App.ExitApp

export const ShowMainWindow = App.ShowMainWindow

export const OpenDevTools = async () => {
  const { flag, data } = await (window as any).go.bridge.App.OpenDevTools()
  if (!flag) {
    throw data
  }
  return data
}

export const UpdateTray = App.UpdateTray

export const UpdateTrayMenus = App.UpdateTrayMenus

export const UpdateTrayAndMenus = App.UpdateTrayAndMenus

export const GetEnv = <T extends string | undefined = undefined>(
  key?: T,
): Promise<T extends string ? string : AppEnv> => {
  return App.GetEnv(key || '')
}

export const IsStartup = App.IsStartup

export const GetInterfaces = async () => {
  const { flag, data } = await App.GetInterfaces()
  if (!flag) {
    throw data
  }
  return data.split('|')
}

export const Notify = async (title: string, body: string) => {
  if (!(await IsNotificationAvailable())) {
    throw new Error('Notifications not available on this platform')
  }
  await RequestNotificationAuthorization()
  await SendNotification({ id: sampleID(), title, body })
}
