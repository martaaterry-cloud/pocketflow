export const APP_VERSION = '0.18.0'
export const APP_BUILD = '2026.09.17-4'
export const APP_NAME = 'PocketFlow'

export function getAppVersionString(): string {
  return `${APP_NAME} v${APP_VERSION}`
}

export function getAppBuildString(): string {
  return `Build ${APP_BUILD}`
}

export function getAppFullVersionLabel(): string {
  return `${APP_NAME} v${APP_VERSION} · Build ${APP_BUILD}`
}
