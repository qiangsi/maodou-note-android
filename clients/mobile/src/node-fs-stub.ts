/**
 * 浏览器环境 node 内置模块空实现。
 * 移动端 WebView 不调用文件型仓储；此桩仅用于让打包器解析内核中对 node:fs / node:path 的静态引用。
 * 任何被调用都会抛出，以便尽早暴露误用。
 */

function notSupported(name: string): never {
  throw new Error(`${name} is not supported in the browser/webview build`);
}

export const existsSync = (): boolean => false;
export const readFileSync = (): never => notSupported('node:fs.readFileSync');
export const writeFileSync = (): never => notSupported('node:fs.writeFileSync');
export const mkdirSync = (): void => undefined;
export const readdirSync = (): never => notSupported('node:fs.readdirSync');
export const statSync = (): never => notSupported('node:fs.statSync');
export const unlinkSync = (): never => notSupported('node:fs.unlinkSync');
export const dirname = (): string => notSupported('node:path.dirname');
export const join = (...parts: string[]): string => parts.join('/');
