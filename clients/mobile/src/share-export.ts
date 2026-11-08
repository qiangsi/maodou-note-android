/**
 * 分享长图导出工具（Capacitor WebView 环境）。
 *
 * 内核 generateShareSvg() 产出矢量 SVG 长图；本文件负责把它栅格化为 PNG 写入
 * 应用数据目录（Directory.Data），并通过 @capacitor/share 拉起系统分享面板把图发出去。
 *
 * ⚠️ 为什么用 Directory.Data 而不是 Directory.Documents：
 * Documents 是公共存储，Android 需运行时权限而 App 未申请 → writeFile 被拒。
 * 与 maodou.ts 持久化数据库保持同一策略（见 AGENT_PROTOCOL.md 不得回滚清单）。
 *
 * 用法（卡片详情的"分享"按钮里）：
 *   const filename = `maodou-${noteId}.png`;
 *   await saveSharePng(svg, filename); // 栅格化 + 写入 Data 目录
 *   await sharePng(filename);          // 拉起系统分享面板
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** 把 SVG 字符串栅格化为 PNG dataURL（默认为 2 倍清晰度）。 */
export function svgToPngDataUrl(svg: string, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const root = doc.documentElement;
      const w = Number(root.getAttribute('width')) || img.naturalWidth;
      const h = Number(root.getAttribute('height')) || img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err as Error);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e instanceof Error ? e : new Error('svg load failed'));
    };
    img.src = url;
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** 栅格化并写入应用数据目录（Directory.Data），返回文件名。 */
export async function saveSharePng(svg: string, filename: string): Promise<string> {
  const dataUrl = await svgToPngDataUrl(svg, 2);
  await Filesystem.writeFile({
    path: filename,
    directory: Directory.Data,
    data: dataUrlToBase64(dataUrl),
    recursive: true,
  });
  return filename;
}

/** 拉起系统分享面板，把已保存的 PNG 发给任意 App（微信/朋友圈等）。 */
export async function sharePng(filename: string): Promise<void> {
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Data });
  await Share.share({ files: [uri] });
}
