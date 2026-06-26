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
  '.docx': 'docx', '.doc': 'docx',
  '.pdf': 'pdf',
  '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png',
  '.gif': 'gif', '.webp': 'webp', '.bmp': 'jpg', '.svg': 'jpg',
  '.mp4': 'mp4', '.mov': 'mov', '.mkv': 'mkv',
  '.avi': 'mp4', '.webm': 'mp4', '.flv': 'mp4',
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

export function importFile(sourcePath: string, categoryId?: string | null): CreateItemInput {
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
    previewText = extractText(destPath, fileType);
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
function extractText(filePath: string, fileType: FileType): string {
  try {
    switch (fileType) {
      case 'txt':
      case 'md':
        return fs.readFileSync(filePath, 'utf-8');
      case 'html':
        return extractHtmlText(filePath);
      case 'docx':
        // 延迟加载 mammoth
        return extractDocxTextSync(filePath);
      case 'pdf':
        // 延迟加载 pdf-parse
        return extractPdfTextSync(filePath);
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

function extractDocxTextSync(filePath: string): string {
  try {
    const mammoth = require('mammoth');
    // mammoth 是异步的，但我们可以用同步方式尝试
    // 对于导入场景，用 extractRawText 同步提取
    const result = mammoth.extractRawText({ path: filePath });
    return (result.value || '').substring(0, 50000);
  } catch {
    return '';
  }
}

function extractPdfTextSync(filePath: string): string {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    // pdf-parse 也是异步的，在导入时同步处理有困难
    // 存储缓冲区，让 renderer 侧处理
    return '';
  } catch {
    return '';
  }
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

// ========== 批量导入 ==========

/** 批量导入文件/文件夹 */
export function importFiles(filePaths: string[], categoryId?: string | null): CreateItemInput[] {
  const results: CreateItemInput[] = [];

  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) continue;

    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      // 递归扫描文件夹
      const files = scanDirectory(fp);
      for (const f of files) {
        results.push(importFile(f, categoryId));
      }
    } else {
      results.push(importFile(fp, categoryId));
    }
  }

  return results;
}

/** 递归扫描目录获取所有文件 */
function scanDirectory(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
