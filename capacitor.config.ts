import type { CapacitorConfig } from '@capacitor/cli'

// iPhoneアプリ版（Capacitor）。`npm run build:ios` で dist を作り、ios/ に写す。
// Web版（Vercel）のビルドとは別のモード（native）で、Service Workerなどを外している。
const config: CapacitorConfig = {
  appId: 'com.koheimukogawa.glog',
  appName: 'Glog',
  webDir: 'dist',
  backgroundColor: '#0A0A0B',
  ios: {
    contentInset: 'never',
  },
}

export default config
