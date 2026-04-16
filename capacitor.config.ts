import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tugraduacion.projectx',
  appName: 'Project X',
  webDir: 'www',

  // In production, the app loads from the deployed server
  // This keeps API routes working and simplifies deployment
  server: {
    url: 'https://app.projectxeventos.es',
    cleartext: false,
    // Allow navigation to Supabase auth and external links
    allowNavigation: [
      'cotqzlxyvtjybxujkitm.supabase.co',
      '*.supabase.co',
    ],
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0A0A0A',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },

  ios: {
    scheme: 'ProjectX',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0A0A0A',
  },

  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
}

export default config
