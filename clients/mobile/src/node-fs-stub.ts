/**
 * 浏览器环境 node:fs 空实现。
 * 移动端 WebView 不调用文件型仓储；此桩仅用于让打包器解析内核中对 node:fs 的静态引用。
 * 任何被调用都会抛出，以便尽早暴露误用。
 */

function notSupported(name: string): never {
  throw new Error(`node:fs.${name} is not supported in the browser/webview build`);
}

export const existsSync = (): boolean => false;
export const readFileSync = (): never => notSupported('readFileSync');
export const writeFileSync = (): never => notSupported('writeFileSync');
export const mkdirSync = (): void => undefined;
