import './style.css';
import * as maodou from './maodou';

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

function renderCard(card: Card): string {
  const tags = card.tags
    .map((t) => `<span class="tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`)
    .join('');
  const badge = card.status === 'conflict' ? '<span class="tag">⚠ 冲突</span>' : '';
  return `
    <div class="card ${card.status === 'conflict' ? 'conflict' : ''}">
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
    btn.addEventListener('click', async () => {
      await maodou.deleteCard(btn.getAttribute('data-del')!);
      await renderHome();
      toast('已删除（同步后其他端也会隐藏）');
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
  try {
    await maodou.initCore();
    await renderHome();
  } catch (e) {
    const pane = document.querySelector<HTMLElement>('#tab-home')!;
    pane.innerHTML = `<div class="empty">初始化失败：${escapeHtml((e as Error)?.message ?? String(e))}</div>`;
    console.error('initCore failed', e);
  }
});
