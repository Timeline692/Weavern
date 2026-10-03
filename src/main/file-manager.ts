/**
 * 文件管理模块
 * 负责文件导入、复制到 _media、内容解析
 */
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import type { FileType, CreateItemInput } from '../shared/types';
import { ensureMediaDir, getMediaPath, getKnowledgeBaseRoot } from './database';

// ========== 文件类型判断 ==========

const EXT_MAP: Record<string, FileType> = {
  '.txt': 'txt', '.md': 'md', '.markdown': 'md',
  '.html': 'html', '.htm': 'html',
  '.docx': 'docx',
  '.pdf': 'pdf',
  '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png',
  '.gif': 'gif', '.webp': 'webp', '.bmp': 'bmp', '.svg': 'svg',
  '.mp4': 'mp4', '.mov': 'mov', '.mkv': 'mkv',
  '.webm': 'webm',
};

/** 根据扩展名判断文件类型 */
export function getFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MAP[ext] || 'other';
}

/** 判断是否为可文本化的类型 */
export function isTextType(ft: FileType): boolean {
  return ['txt', 'md', 'html', 'docx', 'pdf'].includes(ft);
}

/** 生成文件标题 */
export function generateTitle(filePath: string): string {
  const basename = path.basename(filePath);
  // 去除扩展名，将下划线/连字符替换为空格
  return basename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim() || basename;
}

// ========== 文件导入 ==========

export async function importFile(sourcePath: string, categoryId?: string | null): Promise<CreateItemInput> {
  ensureMediaDir();

  const fileType = getFileType(sourcePath);
  const stats = fs.statSync(sourcePath);
  const title = generateTitle(sourcePath);

  // 复制到 _media，保留原始扩展名，加 UUID 防重名
  const ext = path.extname(sourcePath);
  const storedName = `${uuid()}${ext}`;
  const destPath = getMediaPath(storedName);
  fs.copyFileSync(sourcePath, destPath);

  // 提取预览文本
  let previewText = '';
  if (isTextType(fileType)) {
    previewText = await extractText(destPath, fileType);
  }

  return {
    title,
    file_path: storedName,
    original_url: '',
    source_type: 'local',
    file_type: fileType,
    size: stats.size,
    preview_text: previewText,
    category_id: categoryId || null,
  };
}

/** 从剪贴板文本创建条目 */
export function importFromClipboardText(text: string, categoryId?: string | null): CreateItemInput {
  ensureMediaDir();

  const storedName = `${uuid()}.txt`;
  const destPath = getMediaPath(storedName);
  fs.writeFileSync(destPath, text, 'utf-8');

  // 用首行作为标题（最多80字）
  const firstLine = text.split('\n')[0].trim().substring(0, 80);
  const title = firstLine || '剪贴板条目';

  return {
    title,
    file_path: storedName,
    original_url: '',
    source_type: 'clipboard',
    file_type: 'txt',
    size: Buffer.byteLength(text, 'utf-8'),
    preview_text: text,
    category_id: categoryId || null,
  };
}

/** 从剪贴板图片创建条目（base64） */
export function importFromClipboardImage(base64: string, categoryId?: string | null): CreateItemInput {
  ensureMediaDir();

  const matches = base64.match(/^data:image\/(\w+);base64,/);
  const mimeExt = matches?.[1] || 'png';
  const ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt;
  const storedName = `${uuid()}.${ext}`;
  const destPath = getMediaPath(storedName);

  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(destPath, Buffer.from(data, 'base64'));

  const stats = fs.statSync(destPath);

  return {
    title: `截图 ${new Date().toLocaleString('zh-CN')}`,
    file_path: storedName,
    original_url: '',
    source_type: 'clipboard',
    file_type: (ext as FileType),
    size: stats.size,
    preview_text: '',
    category_id: categoryId || null,
  };
}

// ========== 文本提取 ==========

/** 提取文本内容（同步，各解析器按需加载） */
async function extractText(filePath: string, fileType: FileType): Promise<string> {
  try {
    switch (fileType) {
      case 'txt':
      case 'md':
        return fs.readFileSync(filePath, 'utf-8').substring(0, 50000);
      case 'html':
        return extractHtmlText(filePath);
      case 'docx':
        return (await import('mammoth')).extractRawText({ path: filePath }).then(result => result.value.substring(0, 50000));
      case 'pdf': {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(filePath)) });
        try {
          const result = await parser.getText();
          return result.text.substring(0, 50000);
        } finally {
          await parser.destroy();
        }
      }
      default:
        return '';
    }
  } catch (err) {
    console.error(`Text extraction failed for ${filePath}:`, err);
    return '';
  }
}

function extractHtmlText(filePath: string): string {
  const html = fs.readFileSync(filePath, 'utf-8');
  // 简易 HTML 标签剥离，去掉 script/style
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.substring(0, 50000); // 截断，避免超大文件
}

// ========== HTML 图片本地化 ==========

/**
 * 解析 HTML 中的图片引用，下载并替换为本地路径
 * 防止原始网页图片链接失效
 */
export async function localizeHtmlImages(htmlPath: string, baseUrl: string): Promise<void> {
  const cheerio = require('cheerio');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);
  const imgDir = path.join(path.dirname(htmlPath), '_images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const promises: Promise<void>[] = [];

  $('img').each((_i: number, el: any) => {
    const src = $(el).attr('src');
    if (!src) return;

    try {
      const absoluteUrl = new URL(src, baseUrl).href;
      if (!absoluteUrl.startsWith('http')) return;

      const imgName = `${uuid()}${path.extname(new URL(absoluteUrl).pathname) || '.jpg'}`;
      const imgPath = path.join(imgDir, imgName);

      promises.push(
        fetch(absoluteUrl)
          .then(res => res.arrayBuffer())
          .then(buf => {
            fs.writeFileSync(imgPath, Buffer.from(buf));
            $(el).attr('src', `_images/${imgName}`);
          })
          .catch(() => { /* 下载失败静默忽略 */ })
      );
    } catch { /* URL 解析失败忽略 */ }
  });

  await Promise.all(promises);
  fs.writeFileSync(htmlPath, $.html());
}

// ========== URL 导入 ==========

function parsePageUrl(value: string): URL {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 http 和 https 网页链接');
  return url;
}

async function fetchPage(value: string): Promise<{ url: string; html: string }> {
  const url = parsePageUrl(value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`网页请求失败（HTTP ${response.status}）`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('链接不是 HTML 网页');
  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize > 5_000_000) throw new Error('网页超过 5 MB，无法导入');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('网页内容为空');
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 5_000_000) { await reader.cancel(); throw new Error('网页超过 5 MB，无法导入'); }
    chunks.push(Buffer.from(value));
  }
  const html = Buffer.concat(chunks).toString('utf-8');
  return { url: response.url, html };
}

function pageTitle(html: string, fallback: string): string {
  const cheerio = require('cheerio');
  return cheerio.load(html)('title').first().text().trim().slice(0, 200) || fallback;
}

/** 检测 URL 的页面标题（不保存文件） */
export async function detectUrlTitle(url: string): Promise<{ title: string; url: string }> {
  const page = await fetchPage(url);
  return { title: pageTitle(page.html, page.url), url: page.url };
}

/** 导入 URL：抓取页面 HTML 并保存到 _media */
export async function importUrl(url: string, customTitle?: string): Promise<CreateItemInput> {
  ensureMediaDir();

  const page = await fetchPage(url);
  const { html } = page;
  const title = customTitle?.trim() || pageTitle(html, page.url);

  const storedName = `${uuid()}.html`;
  const destPath = getMediaPath(storedName);
  fs.writeFileSync(destPath, html, 'utf-8');

  const previewText = extractHtmlText(destPath);

  return {
    title,
    file_path: storedName,
    original_url: page.url,
    source_type: 'url',
    file_type: 'html',
    size: Buffer.byteLength(html, 'utf-8'),
    preview_text: previewText,
    category_id: null,
  };
}

// ========== 批量导入 ==========

/** 批量导入文件/文件夹 */
export async function importFiles(filePaths: string[], categoryId?: string | null): Promise<CreateItemInput[]> {
  const results: CreateItemInput[] = [];

  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) continue;

    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      // 递归扫描文件夹
      const files = scanDirectory(fp);
      for (const f of files) {
        results.push(await importFile(f, categoryId));
      }
    } else {
      results.push(await importFile(fp, categoryId));
    }
  }

  return results;
}

/** 递归扫描目录获取所有文件 */
function scanDirectory(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const kbRoot = path.resolve(getKnowledgeBaseRoot());
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (path.resolve(dirPath) === kbRoot && ['_media', 'knowledge.db', '.kbconfig'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
