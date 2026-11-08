import './style.css';
import * as maodou from './maodou';
import { saveSharePng, sharePng } from './share-export';

interface Card {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  status: 'synced' | 'pending' | 'conflict';
  version: number;
}

interface Settings {
  serverBaseUrl: string;
  username: string;
  password: string;
}

function parseTags(content: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  const regex = /#([^\s#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const t = m[1];
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(t);
    }
  }
  return tags;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toast(msg: string): void {
  let el = document.querySelector<HTMLDivElement>('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  window.setTimeout(() => el?.classList.remove('show'), 1800);
}

let tagFilter: string | null = null;

/** 渲染列表时缓存完整 Card 对象，详情弹层直接按 id 取用，避免重复请求。 */
let cardsById = new Map<string, Card>();

/** 分享长图模板列表，启动时预加载，详情弹层内复用。 */
let shareTemplates: { id: string; name: string; description: string }[] = [];

function renderCard(card: Card): string {
  const tags = card.tags
    .map((t) => `<span class="tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`)
    .join('');
  const badge = card.status === 'conflict' ? '<span class="tag">⚠ 冲突</span>' : '';
  return `
    <div class="card ${card.status === 'conflict' ? 'conflict' : ''}" data-card="${card.id}">
      <div class="body">${escapeHtml(card.content)}</div>
      <div class="tags">${tags}${badge}</div>
      <div class="meta">
        <span>${fmtTime(card.createdAt)}</span>
        <button class="ghost" data-del="${card.id}">删除</button>
      </div>
    </div>`;
}

async function renderHome(): Promise<void> {
  const pane = document.querySelector<HTMLElement>('#tab-home')!;
  const cards = tagFilter
    ? await maodou.search(null, [tagFilter])
    : await maodou.listCards();
  // 缓存完整 Card 对象，详情弹层按 id 取用。显式标注类型，确保上游类型退化时仍可通过严格检查。
  cardsById = new Map<string, Card>(
    cards.map((c: Card) => [c.id, c] as [string, Card]),
  );
  const list = cards.length
    ? cards.map(renderCard).join('')
    : '<div class="empty">还没有卡片，点右下角 ＋ 写一条吧</div>';
  pane.innerHTML = tagFilter
    ? `<div style="margin-bottom:10px;color:var(--muted);font-size:13px;">筛选：#${escapeHtml(tagFilter)} <button class="ghost" id="clear-filter">清除</button></div>${list}`
    : list;

  pane.querySelectorAll<HTMLElement>('[data-tag]').forEach((el) => {
    el.addEventListener('click', () => {
      tagFilter = el.getAttribute('data-tag');
      switchTab('home');
    });
  });
  const clear = pane.querySelector<HTMLButtonElement>('#clear-filter');
  if (clear) {
    clear.addEventListener('click', () => {
      tagFilter = null;
      switchTab('home');
    });
  }
  pane.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await maodou.deleteCard(btn.getAttribute('data-del')!);
      await renderHome();
      toast('已删除（同步后其他端也会隐藏）');
    });
  });

  // 点击卡片正文/区域打开详情弹层（删除按钮已 stopPropagation，不会触发）。
  pane.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-card')!;
      const card = cardsById.get(id);
      if (card) openDetail(card);
    });
  });
}

async function renderTags(): Promise<void> {
  const pane = document.querySelector<HTMLElement>('#tab-tags')!;
  const tags = maodou.listTags();
  const list = tags.length
    ? tags
        .map(
          (t) =>
            `<div class="tag-item" data-tag="${escapeHtml(t.tag)}"><span>#${escapeHtml(t.tag)}</span><span class="count">${t.count}</span></div>`,
        )
        .join('')
    : '<div class="empty">还没有标签</div>';
  pane.innerHTML = `<h3 style="margin:4px 0 12px;">标签</h3>${list}`;
  pane.querySelectorAll<HTMLElement>('.tag-item').forEach((el) => {
    el.addEventListener('click', () => {
      tagFilter = el.getAttribute('data-tag');
      switchTab('home');
    });
  });
}

async function renderSettings(): Promise<void> {
  const pane = document.querySelector<HTMLElement>('#tab-settings')!;
  const s = loadSettings();
  pane.innerHTML = `
    <h3 style="margin:4px 0 12px;">WebDAV 同步</h3>
    <div class="form">
      <label>服务器地址</label>
      <input id="s-url" value="${escapeHtml(s.serverBaseUrl)}" placeholder="https://dav.example.com" />
      <label>用户名</label>
      <input id="s-user" value="${escapeHtml(s.username)}" placeholder="可选" />
      <label>密码</label>
      <input id="s-pass" type="password" value="${escapeHtml(s.password)}" placeholder="可选" />
      <div class="row" style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
        <button class="ghost" id="s-save">保存</button>
        <button class="primary" id="s-sync">立即同步</button>
      </div>
      <div class="sync-status" id="s-status">配置保存在本机</div>
    </div>`;
  pane.querySelector<HTMLButtonElement>('#s-save')!.addEventListener('click', () => {
    const ns: Settings = {
      serverBaseUrl: pane.querySelector<HTMLInputElement>('#s-url')!.value,
      username: pane.querySelector<HTMLInputElement>('#s-user')!.value,
      password: pane.querySelector<HTMLInputElement>('#s-pass')!.value,
    };
    saveSettings(ns);
    toast('已保存');
  });
  pane.querySelector<HTMLButtonElement>('#s-sync')!.addEventListener('click', async () => {
    const status = pane.querySelector<HTMLDivElement>('#s-status')!;
    const cfg = loadSettings();
    if (!cfg.serverBaseUrl) {
      status.textContent = '请先填写 WebDAV 服务器地址';
      return;
    }
    status.textContent = '同步中…';
    try {
      const r = await maodou.runSync(cfg);
      status.textContent = `完成：上传 ${r.pushed} / 拉取 ${r.pulled} / 冲突 ${r.conflicts}`;
      toast('同步成功');
    } catch (e) {
      status.textContent = `失败：${(e as Error).message}`;
    }
  });
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('maodou-settings');
    if (raw) return JSON.parse(raw) as Settings;
  } catch {
    /* ignore */
  }
  return { serverBaseUrl: '', username: '', password: '' };
}

function saveSettings(s: Settings): void {
  localStorage.setItem('maodou-settings', JSON.stringify(s));
}

/** 预加载分享模板列表（移动端为同步方法，失败则降级为空）。 */
function loadShareTemplates(): void {
  try {
    shareTemplates = maodou.listShareTemplates();
  } catch {
    shareTemplates = [];
  }
}

/**
 * 打开卡片详情弹层（从底部弹出的 sheet）：展示正文（只读）、#标签、创建时间，
 * 以及"分享长图"区（模板切换、长图预览、导出 PNG）。
 */
function openDetail(card: Card): void {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.innerHTML = `
    <div class="sheet sheet--scroll">
      <div class="sheet-head">
        <button class="ghost" id="detail-close">关闭</button>
      </div>
      <div class="detail-body">${escapeHtml(card.content)}</div>
      <div class="detail-tags">${
        card.tags.length
          ? card.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')
          : '<span class="detail-empty">无标签</span>'
      }</div>
      <div class="detail-time">创建于 ${fmtTime(card.createdAt)}</div>
      <div class="share">
        <div class="share-title">分享长图</div>
        <div class="share-templates" id="share-templates"></div>
        <div class="share-preview" id="share-preview"></div>
        <button class="primary" id="share-export">导出 PNG</button>
      </div>
    </div>`;
  document.body.appendChild(mask);

  const close = () => mask.remove();
  mask.querySelector<HTMLButtonElement>('#detail-close')!.addEventListener('click', close);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });

  const templatesBox = mask.querySelector<HTMLDivElement>('#share-templates')!;
  const preview = mask.querySelector<HTMLDivElement>('#share-preview')!;
  const exportBtn = mask.querySelector<HTMLButtonElement>('#share-export')!;

  // 默认选中第一个模板（通常为 paper）。
  let currentTemplate = shareTemplates.length ? shareTemplates[0].id : 'paper';
  let currentSvg = '';

  // 渲染模板选择按钮并高亮当前选中项。
  const renderTemplates = (): void => {
    templatesBox.innerHTML = shareTemplates
      .map(
        (t) =>
          `<button class="tpl-btn ${t.id === currentTemplate ? 'active' : ''}" data-tpl="${escapeHtml(
            t.id,
          )}" title="${escapeHtml(t.description)}">${escapeHtml(t.name)}</button>`,
      )
      .join('');
    templatesBox.querySelectorAll<HTMLButtonElement>('[data-tpl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTemplate = btn.getAttribute('data-tpl')!;
        renderTemplates();
        generatePreview();
      });
    });
  };

  // 生成当前模板的长图 SVG，缓存到 currentSvg 并刷新预览（移动端为同步方法）。
  const generatePreview = (): void => {
    currentSvg = maodou.generateShareImage(card.id, currentTemplate);
    preview.innerHTML = currentSvg;
  };

  exportBtn.addEventListener('click', async () => {
    if (!currentSvg) return;
    try {
      const filename = `maodou-${card.id}.png`;
      await saveSharePng(currentSvg, filename);
      // 分享面板被用户取消不算失败；PNG 已保存在应用数据目录。
      try {
        await sharePng(filename);
        toast('已拉起分享面板');
      } catch {
        toast('长图已保存（未分享）');
      }
    } catch (err) {
      toast(`导出失败：${(err as Error).message}`);
    }
  });

  renderTemplates();
  generatePreview();
}

function switchTab(name: 'home' | 'tags' | 'settings'): void {
  document
    .querySelectorAll('.tab-btn')
    .forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === name));
  document
    .querySelectorAll('.tab-pane')
    .forEach((p) => p.classList.add('hidden'));
  document.querySelector(`#tab-${name}`)!.classList.remove('hidden');
  if (name === 'home') void renderHome();
  else if (name === 'tags') void renderTags();
  else void renderSettings();
}

function openComposer(): void {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.innerHTML = `
    <div class="sheet">
      <textarea id="composer-input" placeholder="此刻的想法…用 #标签 来组织"></textarea>
      <div class="row">
        <button class="ghost" id="composer-cancel">取消</button>
        <button class="primary" id="composer-save">保存</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const input = mask.querySelector<HTMLTextAreaElement>('#composer-input')!;
  input.focus();
  const close = () => mask.remove();
  mask.querySelector<HTMLButtonElement>('#composer-cancel')!.addEventListener('click', close);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  mask.querySelector<HTMLButtonElement>('#composer-save')!.addEventListener('click', async () => {
    const content = input.value.trim();
    if (!content) {
      close();
      return;
    }
    await maodou.createCard(content, parseTags(content));
    close();
    await renderHome();
    toast('已保存（离线）');
  });
}

function bindShell(): void {
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () =>
      switchTab(btn.getAttribute('data-tab') as 'home' | 'tags' | 'settings'),
    );
  });
  document.querySelector<HTMLButtonElement>('#fab')!.addEventListener('click', openComposer);
}

window.addEventListener('DOMContentLoaded', async () => {
  bindShell();
  await maodou.initCore();
  loadShareTemplates();
  await renderHome();
});
