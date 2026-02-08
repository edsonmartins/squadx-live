import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SquadX Live',
  slug: 'squadx-live',
  scheme: 'squadx-live',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0f172a',
  },
  ios: {
    bundleIdentifier: 'live.squadx.mobile',
    supportsTablet: true,
    infoPlist: {
      UIBackgroundModes: ['voip'],
      NSMicrophoneUsageDescription:
        'SquadX Live needs microphone access for voice chat during sessions.',
    },
  },
  android: {
    package: 'live.squadx.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    permissions: [
      'INTERNET',
      'RECORD_AUDIO',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MEDIA_PROJECTION',
    ],
  },
  plugins: ['expo-router', 'expo-secure-store'],
  extra: {
    SQUADX_API_URL: process.env.SQUADX_API_URL,
    eas: {
      projectId: 'squadx-live-mobile',
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
