/**
 * SQLite 数据库管理模块
 */
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import type {
  Category, Item, Tag, ItemTag, Annotation,
  CreateItemInput, SearchResult, SearchFilters,
} from '../shared/types';

let db: SqlJsDatabase;
let SQL: SqlJsStatic;
let dbPath: string;
let initialization: Promise<void> = Promise.resolve();

// ========== 初始化 ==========

export function initDatabase(rootPath: string): Promise<void> {
  const nextPath = path.join(rootPath, 'knowledge.db');
  initialization = initialization.catch(() => {}).then(async () => {
    if (db && dbPath === nextPath) return;
    const sql = SQL || await initSqlJs();
    const nextDb = fs.existsSync(nextPath)
      ? new sql.Database(fs.readFileSync(nextPath)) : new sql.Database();
    if (db) closeDatabase();
    SQL = sql;
    db = nextDb;
    dbPath = nextPath;
    db.run('PRAGMA foreign_keys = ON');
    createTables();
    save();
  });
  return initialization;
}

function save(): void {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function closeDatabase(): void {
  if (db) { save(); db.close(); }
}

// ========== 查询辅助 ==========

function queryOne<T>(sql: string, params: any[] = []): T | null {
  try {
    const stmt = db.prepare(sql); stmt.bind(params);
    if (stmt.step()) {
      const cols = stmt.getColumnNames(); const vals = stmt.get(); stmt.free();
      const obj: any = {}; cols.forEach((c: string, i: number) => { obj[c] = vals[i]; });
      return obj as T;
    }
    stmt.free(); return null;
  } catch (err) { console.error('queryOne error:', err); return null; }
}

function queryAll<T>(sql: string, params: any[] = []): T[] {
  try {
    const stmt = db.prepare(sql); stmt.bind(params);
    const cols = stmt.getColumnNames(); const results: T[] = [];
    while (stmt.step()) {
      const vals = stmt.get(); const obj: any = {};
      cols.forEach((c: string, i: number) => { obj[c] = vals[i]; });
      results.push(obj as T);
    }
    stmt.free(); return results;
  } catch (err) { console.error('queryAll error:', err); return []; }
}

function execute(sql: string, params: any[] = []): void {
  try { db.run(sql, params); save(); }
  catch (err) { console.error('execute error:', err); throw err; }
}

// ========== 建表 ==========

function createTables(): void {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))`);
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, file_path TEXT NOT NULL,
    original_url TEXT DEFAULT '', source_type TEXT NOT NULL DEFAULT 'local',
    file_type TEXT NOT NULL DEFAULT 'other', size INTEGER NOT NULL DEFAULT 0,
    preview_text TEXT DEFAULT '', category_id TEXT,
    is_starred INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))`);
  try { db.run('ALTER TABLE items ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0'); } catch { /* ok */ }
  try {
    db.run('ALTER TABLE items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    db.run('UPDATE items SET sort_order = (SELECT COUNT(*) FROM items older WHERE older.rowid <= items.rowid)');
  } catch { /* 已迁移 */ }
  db.run('CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
  db.run('CREATE TABLE IF NOT EXISTS item_tags (item_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (item_id, tag_id))');
  db.run(`CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('highlight','note','timestamp')),
    content TEXT NOT NULL DEFAULT '', target_selector TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))`);
}

// ========== 分类 CRUD ==========

export function getCategories(): Category[] { return queryAll('SELECT * FROM categories ORDER BY sort_order, created_at'); }

export function createCategory(name: string, parentId: string | null): Category {
  const id = uuid();
  const row = queryOne<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM categories WHERE parent_id IS ?', [parentId]);
  execute('INSERT INTO categories (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)', [id, name, parentId, row?.next ?? 0]);
  return queryOne<Category>('SELECT * FROM categories WHERE id = ?', [id])!;
}

export function renameCategory(id: string, name: string): void { execute('UPDATE categories SET name = ? WHERE id = ?', [name, id]); }

export function deleteCategory(id: string): void {
  execute('UPDATE categories SET parent_id = (SELECT parent_id FROM categories WHERE id = ?) WHERE parent_id = ?', [id, id]);
  execute('UPDATE items SET category_id = NULL WHERE category_id = ?', [id]);
  execute('DELETE FROM categories WHERE id = ?', [id]);
}

export function moveCategory(id: string, parentId: string | null, order: number): void {
  execute('UPDATE categories SET parent_id = ?, sort_order = ? WHERE id = ?', [parentId, order, id]);
}

// ========== 条目 CRUD ==========

export function getItems(categoryId?: string): Item[] {
  const columns = 'id, title, file_path, original_url, source_type, file_type, size, SUBSTR(preview_text, 1, 500) AS preview_text, category_id, is_starred, sort_order, created_at, updated_at';
  return categoryId
    ? queryAll(`SELECT ${columns} FROM items WHERE category_id = ? ORDER BY updated_at DESC`, [categoryId])
    : queryAll(`SELECT ${columns} FROM items ORDER BY updated_at DESC`);
}

export function getItem(id: string): Item | null { return queryOne('SELECT * FROM items WHERE id = ?', [id]); }

export function createItem(data: CreateItemInput): Item {
  const id = uuid();
  const next = queryOne<{ value: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM items')?.value ?? 0;
  execute(`INSERT INTO items (id, title, file_path, original_url, source_type, file_type, size, preview_text, category_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title, data.file_path, data.original_url || '', data.source_type, data.file_type, data.size, data.preview_text, data.category_id || null, next]);
  return queryOne<Item>('SELECT * FROM items WHERE id = ?', [id])!;
}

export function updateItem(id: string, data: Partial<Item>): void {
  const fields: string[] = []; const values: unknown[] = [];
  const allowed = new Set(['title', 'category_id', 'is_starred', 'preview_text', 'size', 'file_path']);
  for (const [key, value] of Object.entries(data)) { if (!allowed.has(key)) continue; fields.push(`${key} = ?`); values.push(value); }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now', 'localtime')"); values.push(id);
  execute(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`, values);
}

export function deleteItem(id: string): void {
  const item = getItem(id);
  if (item) { const p = getMediaPath(item.file_path); if (fs.existsSync(p)) fs.unlinkSync(p); }
  db.run('DELETE FROM item_tags WHERE item_id = ?', [id]);
  db.run('DELETE FROM annotations WHERE item_id = ?', [id]);
  execute('DELETE FROM items WHERE id = ?', [id]);
}

// ========== 星标 ==========

export function toggleStar(id: string): boolean {
  const item = queryOne<{ is_starred: number }>('SELECT is_starred FROM items WHERE id = ?', [id]);
  if (!item) return false;
  const newVal = item.is_starred ? 0 : 1;
  execute('UPDATE items SET is_starred = ? WHERE id = ?', [newVal, id]);
  return newVal === 1;
}

export function getStarredItems(): Item[] { return queryAll('SELECT * FROM items WHERE is_starred = 1 ORDER BY updated_at DESC'); }

// ========== 批量操作 ==========

export function batchDeleteItems(ids: string[]): void {
  const unique = [...new Set(ids)];
  const paths = unique.map(id => getItem(id)).filter((item): item is Item => !!item).map(item => getMediaPath(item.file_path));
  db.run('BEGIN');
  try {
    unique.forEach(id => {
      db.run('DELETE FROM item_tags WHERE item_id = ?', [id]);
      db.run('DELETE FROM annotations WHERE item_id = ?', [id]);
      db.run('DELETE FROM items WHERE id = ?', [id]);
    });
    db.run('COMMIT');
    save();
  } catch (error) { db.run('ROLLBACK'); throw error; }
  paths.forEach(filePath => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (error) { console.error('Failed to remove media:', error); } });
}
export function batchCategorize(ids: string[], categoryId: string | null): void {
  db.run('BEGIN');
  try {
    ids.forEach(id => db.run("UPDATE items SET category_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [categoryId, id]));
    db.run('COMMIT'); save();
  } catch (error) { db.run('ROLLBACK'); throw error; }
}
export function batchTag(ids: string[], tagId: string): void {
  db.run('BEGIN');
  try {
    ids.forEach(id => db.run('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', [id, tagId]));
    db.run('COMMIT'); save();
  } catch (error) { db.run('ROLLBACK'); throw error; }
}

export function reorderItems(orderedIds: string[]): void {
  const unique = [...new Set(orderedIds)];
  const all = queryAll<{ id: string }>('SELECT id FROM items ORDER BY sort_order, rowid').map(row => row.id);
  const selected = new Set(unique);
  if (unique.some(id => !all.includes(id))) throw new Error('条目列表已变化，请刷新后重试');
  let cursor = 0;
  const merged = all.map(id => selected.has(id) ? unique[cursor++] : id);
  db.run('BEGIN');
  try {
    merged.forEach((id, order) => db.run('UPDATE items SET sort_order = ? WHERE id = ?', [order, id]));
    db.run('COMMIT');
    save();
  } catch (error) { db.run('ROLLBACK'); throw error; }
}

// ========== 标签 CRUD ==========

export function getTags(): Tag[] { return queryAll('SELECT * FROM tags ORDER BY name'); }

export function createTag(name: string): Tag {
  const id = uuid(); execute('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)', [id, name]);
  return queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [name]) || { id, name };
}

export function deleteTag(id: string): void { db.run('DELETE FROM item_tags WHERE tag_id = ?', [id]); execute('DELETE FROM tags WHERE id = ?', [id]); }
export function addTagToItem(iid: string, tid: string): void { execute('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', [iid, tid]); }
export function removeTagFromItem(iid: string, tid: string): void { execute('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?', [iid, tid]); }
export function getTagsForItem(iid: string): Tag[] { return queryAll('SELECT t.* FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ? ORDER BY t.name', [iid]); }

// ========== 搜索 ==========

export function searchItems(query: string, filters?: SearchFilters): SearchResult[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const likeClauses = terms.map(() => "(title LIKE ? ESCAPE '\\' OR preview_text LIKE ? ESCAPE '\\')");
  let sql = `SELECT * FROM items WHERE ${likeClauses.join(' AND ')}`;
  const params: unknown[] = [];
  terms.forEach(t => { const escaped = t.replace(/[\\%_]/g, '\\$&'); params.push(`%${escaped}%`, `%${escaped}%`); });
  if (filters?.categoryId) { sql += ' AND category_id = ?'; params.push(filters.categoryId); }
  if (filters?.fileTypes?.length) { sql += ` AND file_type IN (${filters.fileTypes.map(() => '?').join(',')})`; params.push(...filters.fileTypes); }
  sql += ' ORDER BY updated_at DESC LIMIT 50';
  const items = queryAll<Item>(sql, params);
  return items.map(item => {
    const idx = item.preview_text.toLowerCase().indexOf(terms[0].toLowerCase());
    const start = Math.max(0, idx - 30);
    const snippet = idx >= 0 ? '...' + item.preview_text.substring(start, start + 120) + '...' : item.title;
    return { item, snippet: highlightTerms(snippet, terms), score: 0 };
  });
}

function highlightTerms(text: string, terms: string[]): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const matcher = new RegExp(sorted.map(term => term.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return escaped.replace(matcher, match => `<mark>${match}</mark>`);
}

export function searchByTag(tagId: string): Item[] {
  return queryAll('SELECT i.* FROM items i JOIN item_tags it ON i.id = it.item_id WHERE it.tag_id = ? ORDER BY i.updated_at DESC', [tagId]);
}

// ========== 标注 CRUD ==========

export function getAnnotations(itemId: string): Annotation[] {
  return queryAll('SELECT * FROM annotations WHERE item_id = ? ORDER BY created_at', [itemId]);
}
export function createAnnotation(data: Omit<Annotation, 'id' | 'created_at'>): Annotation {
  const id = uuid();
  execute('INSERT INTO annotations (id, item_id, type, content, target_selector) VALUES (?, ?, ?, ?, ?)',
    [id, data.item_id, data.type, data.content, data.target_selector]);
  return queryOne<Annotation>('SELECT * FROM annotations WHERE id = ?', [id])!;
}
export function deleteAnnotation(id: string): void { execute('DELETE FROM annotations WHERE id = ?', [id]); }

// ========== 路径工具 ==========

let knowledgeBaseRoot: string = '';

export function setKnowledgeBaseRoot(root: string): void { knowledgeBaseRoot = root; }
export function getKnowledgeBaseRoot(): string { return knowledgeBaseRoot; }
export function getMediaPath(relativePath: string): string {
  const mediaRoot = path.resolve(knowledgeBaseRoot, '_media');
  const resolved = path.resolve(mediaRoot, relativePath);
  if (!knowledgeBaseRoot || !resolved.startsWith(mediaRoot + path.sep)) throw new Error('无效的媒体文件路径');
  return resolved;
}
export function ensureMediaDir(): void {
  const dir = path.join(knowledgeBaseRoot, '_media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
