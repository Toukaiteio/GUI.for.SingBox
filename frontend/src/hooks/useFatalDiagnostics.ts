import type { App } from 'vue'

import i18n from '@/lang'
import { message } from '@/utils'
import { collectDiagnosticSnapshot, getDiagnosticErrorMessage } from '@/utils'

const MAX_REPORTS_PER_SESSION = 3

export const installFatalDiagnostics = (app: App) => {
  let reportCount = 0
  let handling = false

  const reportFatalError = async (
    label: string,
    error: unknown,
    extras: Record<string, unknown> = {},
  ) => {
    if (handling || reportCount >= MAX_REPORTS_PER_SESSION) return

    handling = true
    reportCount += 1

    try {
      const reason = getDiagnosticErrorMessage(error)
      const diagnosticsPath = await collectDiagnosticSnapshot('frontend', label, {
        reason,
        ...extras,
      }).catch(() => '')

      const { t } = i18n.global
      const parts = [t('diagnostics.fatalError'), '', t('diagnostics.reason', { reason })]
      if (diagnosticsPath) {
        parts.push('', t('diagnostics.bundleReady', { path: diagnosticsPath }))
        parts.push(t('diagnostics.shareBundle'))
      }
      message.error(parts.join('\n'), 12_000)
    } finally {
      handling = false
    }
  }

  window.addEventListener('error', (event) => {
    reportFatalError('window-error', event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportFatalError('unhandled-rejection', event.reason, {
      eventType: event.type,
    })
  })

  app.config.errorHandler = (error, instance, info) => {
    const componentName =
      (instance?.$options as { name?: string } | undefined)?.name ||
      (instance?.$options as { __name?: string } | undefined)?.__name ||
      ''

    reportFatalError('vue-error', error, {
      info,
      component: componentName,
    })
  }
}
