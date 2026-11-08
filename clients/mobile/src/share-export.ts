/**
 * 分享长图导出工具（Capacitor WebView 环境）。
 *
 * 内核 generateShareSvg() 产出矢量 SVG 长图；本文件负责把它栅格化为 PNG 并写入设备文档目录
 * （Android 上即 Documents/maodou，可在文件管理器或相册导入中访问）。
 *
 * 用法（例如在卡片详情的"分享"按钮里）：
 *   import { generateShareImage } from './maodou';
 *   const svg = generateShareImage(noteId, 'paper');
 *   await saveSharePng(svg, `maodou-${noteId}.png`);
 */

import { Filesystem, Directory } from '@capacitor/filesystem';

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

/** 栅格化并写入设备文档目录，返回保存路径。 */
export async function saveSharePng(svg: string, filename: string): Promise<string> {
  const dataUrl = await svgToPngDataUrl(svg, 2);
  await Filesystem.writeFile({
    path: filename,
    directory: Directory.Documents,
    data: dataUrlToBase64(dataUrl),
    recursive: true,
  });
  return filename;
}
