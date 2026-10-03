const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../dist/main/main/database');
const fileManager = require('../dist/main/main/file-manager');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weavern-db-test-'));
const firstRoot = path.join(root, 'first');
const secondRoot = path.join(root, 'second');
fs.mkdirSync(firstRoot);
fs.mkdirSync(secondRoot);

function addItem(title) {
  const filePath = `${title.replace(/[<>:"/\\|?*%]/g, '_')}.txt`;
  fs.writeFileSync(db.getMediaPath(filePath), title);
  return db.createItem({ title, file_path: filePath, source_type: 'local', file_type: 'txt', size: title.length, preview_text: title, category_id: null });
}

(async () => {
  try {
    await db.initDatabase(firstRoot);
    db.setKnowledgeBaseRoot(firstRoot);
    db.ensureMediaDir();
    const first = addItem('first');
    const second = addItem('second');
    const tag = db.createTag('test');
    db.addTagToItem(first.id, tag.id);
    db.createAnnotation({ item_id: first.id, type: 'note', content: 'note', target_selector: '' });
    db.reorderItems([second.id, first.id]);
    assert.deepEqual(db.getItems().sort((a, b) => a.sort_order - b.sort_order).map(item => item.id), [second.id, first.id]);
    db.deleteItem(first.id);
    assert.equal(db.getTagsForItem(first.id).length, 0);
    assert.equal(db.getAnnotations(first.id).length, 0);

    await db.initDatabase(secondRoot);
    db.setKnowledgeBaseRoot(secondRoot);
    assert.equal(db.getItems().length, 0);
    db.ensureMediaDir();
    const special = addItem('100% <unsafe>');
    assert.deepEqual(db.searchItems('%').map(result => result.item.id), [special.id]);
    assert.ok(db.searchItems('<unsafe>')[0].snippet.includes('&lt;unsafe&gt;'));
    const docxFixture = require.resolve('mammoth/test/test-data/single-paragraph.docx');
    const docx = await fileManager.importFile(docxFixture);
    assert.ok(docx.preview_text.trim(), 'DOCX text should be indexed');
    const pdf = await fileManager.importFile(path.join(__dirname, 'fixtures', 'sample.pdf'));
    assert.ok(pdf.preview_text.includes('Weavern search'), 'PDF text should be indexed');
    await db.initDatabase(firstRoot);
    db.setKnowledgeBaseRoot(firstRoot);
    assert.deepEqual(db.getItems().map(item => item.id), [second.id]);
    db.closeDatabase();
    process.stdout.write('Database smoke test passed.\n');
  } finally {
    const resolved = path.resolve(root);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('weavern-db-test-')) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
