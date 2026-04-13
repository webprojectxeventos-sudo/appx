/**
 * Capacitor native bridge — initializes native plugins when running inside
 * a Capacitor app (iOS/Android). No-ops gracefully on web.
 */

import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'

export async function initNativePlugins() {
  if (!isNative) return

  try {
    // Status bar — dark content on dark background
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0A0A0A' })
    }
  } catch {}

  try {
    // Hide splash screen after app is ready
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide({ fadeOutDuration: 300 })
  } catch {}

  try {
    // Keyboard — adjust scroll when keyboard appears
    const { Keyboard } = await import('@capacitor/keyboard')
    await Keyboard.setScroll({ isDisabled: false })
  } catch {}

  try {
    // Handle back button on Android
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        App.exitApp()
      }
    })
  } catch {}
}

/**
 * Trigger haptic feedback (light tap) for interactive elements
 */
export async function hapticTap() {
  if (!isNative) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {}
}
