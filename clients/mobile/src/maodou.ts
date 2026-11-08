// 移动端内核桥：在 WebView 中以"内存库 + Capacitor 文件系统"方式持久化，
// 复用与桌面完全相同的共享内核（SqlJsNoteRepository / SyncEngine / TagService 等）。
import {
  SqlJsNoteRepository,
  SqlJsSyncStateStore,
  SyncEngine,
  HttpWebDavClient,
  ConflictResolver,
  SystemClock,
  generateShareSvg,
  listTemplates,
} from 'maodou-notes';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DB_FILE = 'maodou.db';
const clock = new SystemClock();

let repository: SqlJsNoteRepository;
let stateStore: SqlJsSyncStateStore;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 启动时尝试从文件系统载入已有数据库，不存在则新建内存库。 */
export async function initCore(): Promise<void> {
  try {
    const { data } = await Filesystem.readFile({
      path: DB_FILE,
      directory: Directory.Documents,
    });
    const bytes = base64ToBytes(data);
    repository = await SqlJsNoteRepository.importBytes(bytes, clock);
  } catch {
    repository = await SqlJsNoteRepository.createInMemory(clock);
  }
  stateStore = new SqlJsSyncStateStore(repository.database);
}

/** 将内存库导出为字节并写入文件系统，确保离线数据持久化。 */
export async function persist(): Promise<void> {
  const bytes = repository.exportBytes();
  await Filesystem.writeFile({
    path: DB_FILE,
    directory: Directory.Documents,
    data: bytesToBase64(bytes),
    recursive: true,
  });
}

export async function listCards() {
  return repository.getAll();
}

export async function createCard(content: string, tags: string[]) {
  const card = repository.create(content, tags);
  await persist();
  return card;
}

export async function deleteCard(id: string): Promise<void> {
  repository.softDelete(id);
  await persist();
}

export async function search(query: string | null, tags: string[] | null) {
  return repository.query(query, tags);
}

export function listTags(): { tag: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const card of repository.getAll(true)) {
    if (card.deleted) continue;
    for (const tag of card.tags) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function runSync(settings: {
  serverBaseUrl: string;
  username: string;
  password: string;
}): Promise<{
  pushed: number;
  pulled: number;
  conflicts: number;
  conflictsDetail: unknown[];
  durationMs: number;
}> {
  const webDav = new HttpWebDavClient(
    settings.serverBaseUrl,
    settings.username,
    settings.password,
  );
  const engine = new SyncEngine(
    repository,
    stateStore,
    webDav,
    new ConflictResolver(),
    clock,
  );
  const result = await engine.sync();
  await persist();
  return result;
}

export function listShareTemplates(): { id: string; name: string; description: string }[] {
  return listTemplates();
}

/** 把单条笔记渲染为分享长图（SVG 字符串）。 */
export function generateShareImage(
  noteId: string,
  templateId: string,
): string {
  const note = repository.get(noteId);
  if (!note) {
    throw new Error(`note not found: ${noteId}`);
  }
  return generateShareSvg(note, { templateId });
}
