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

// ========== 初始化 ==========

export async function initDatabase(rootPath: string): Promise<void> {
  SQL = await initSqlJs();
  dbPath = path.join(rootPath, 'knowledge.db');
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  createTables();
  save();
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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))`);
  try { db.run('ALTER TABLE items ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0'); } catch { /* ok */ }
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
  return categoryId
    ? queryAll('SELECT * FROM items WHERE category_id = ? ORDER BY updated_at DESC', [categoryId])
    : queryAll('SELECT * FROM items ORDER BY updated_at DESC');
}

export function getItem(id: string): Item | null { return queryOne('SELECT * FROM items WHERE id = ?', [id]); }

export function createItem(data: CreateItemInput): Item {
  const id = uuid();
  execute(`INSERT INTO items (id, title, file_path, original_url, source_type, file_type, size, preview_text, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title, data.file_path, data.original_url || '', data.source_type, data.file_type, data.size, data.preview_text, data.category_id || null]);
  return queryOne<Item>('SELECT * FROM items WHERE id = ?', [id])!;
}

export function updateItem(id: string, data: Partial<Item>): void {
  const fields: string[] = []; const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) { if (key === 'id') continue; fields.push(`${key} = ?`); values.push(value); }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now', 'localtime')"); values.push(id);
  execute(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`, values);
}

export function deleteItem(id: string): void {
  const item = getItem(id);
  if (item) { const p = getMediaPath(item.file_path); if (fs.existsSync(p)) fs.unlinkSync(p); }
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

export function batchDeleteItems(ids: string[]): void { ids.forEach(id => deleteItem(id)); }
export function batchCategorize(ids: string[], categoryId: string | null): void {
  ids.forEach(id => execute("UPDATE items SET category_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [categoryId, id]));
}
export function batchTag(ids: string[], tagId: string): void {
  ids.forEach(id => execute('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', [id, tagId]));
}

// ========== 标签 CRUD ==========

export function getTags(): Tag[] { return queryAll('SELECT * FROM tags ORDER BY name'); }

export function createTag(name: string): Tag {
  const id = uuid(); execute('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)', [id, name]);
  return queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [name]) || { id, name };
}

export function deleteTag(id: string): void { execute('DELETE FROM tags WHERE id = ?', [id]); }
export function addTagToItem(iid: string, tid: string): void { execute('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', [iid, tid]); }
export function removeTagFromItem(iid: string, tid: string): void { execute('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?', [iid, tid]); }
export function getTagsForItem(iid: string): Tag[] { return queryAll('SELECT t.* FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ? ORDER BY t.name', [iid]); }

// ========== 搜索 ==========

export function searchItems(query: string, filters?: SearchFilters): SearchResult[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const likeClauses = terms.map(() => '(title LIKE ? OR preview_text LIKE ?)');
  let sql = `SELECT * FROM items WHERE ${likeClauses.join(' AND ')}`;
  const params: unknown[] = [];
  terms.forEach(t => { params.push(`%${t}%`, `%${t}%`); });
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
  let r = text;
  terms.forEach(t => { r = r.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); });
  return r;
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
export function getMediaPath(relativePath: string): string { return path.join(knowledgeBaseRoot, '_media', relativePath); }
export function ensureMediaDir(): void {
  const dir = path.join(knowledgeBaseRoot, '_media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
