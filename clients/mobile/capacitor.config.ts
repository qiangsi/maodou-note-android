import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maodou.notes',
  appName: '毛豆笔记',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
