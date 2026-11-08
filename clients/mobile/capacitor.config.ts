import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maodou.notes',
  appName: '毛豆笔记',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // WebView 内 fetch 改走原生网络栈：坚果云等 WebDAV 服务不返回 CORS 头，
    // 浏览器栈下跨域一律被拦（表现为 "Failed to fetch"）。原生栈无 CORS 概念。
    // ⚠️ 不得关闭：关闭后 WebDAV 同步立即失效（见 AGENT_PROTOCOL.md 不得回滚清单）。
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
