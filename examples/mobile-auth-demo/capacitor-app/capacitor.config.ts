import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workos.authdemo',
  appName: 'WorkOS Auth Demo',
  webDir: 'dist',
  server: {
    // For local development, you can set this to your machine's IP
    // This allows the app to communicate with your backend during development
    // url: 'http://192.168.1.100:3001',
    // cleartext: true
  },
  ios: {
    // Custom URL scheme for iOS
    scheme: 'workosauthdemo'
  },
  android: {
    // Custom URL scheme for Android
    scheme: 'workosauthdemo'
  }
};

export default config;
