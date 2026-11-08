import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Mobile（Capacitor）构建配置。
 * 关键：将 node:fs 别名到浏览器空实现。移动端 WebView 中不使用文件型仓储
 * （createFromFile/saveToFile），而是用 SqlJsNoteRepository 的内存库 + exportBytes/importBytes
 * 配合 @capacitor/filesystem 做持久化，因此 node:fs 永远不会在运行时被调用。
 */
export default defineConfig({
  resolve: {
    alias: {
      'node:fs': fileURLToPath(new URL('./src/node-fs-stub.ts', import.meta.url)),
    },
    conditions: ['node', 'import', 'module', 'browser', 'default'],
  },
});
