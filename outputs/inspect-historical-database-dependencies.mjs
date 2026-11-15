import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
const root = 'C:/Users/danbr/HeartWordData';
const baseline = 'C:/Users/danbr/HeartWordBackupStaging/20261007-first';
const manifest = JSON.parse(readFileSync(resolve(baseline, 'backup.json'), 'utf8'));
const result = [];
for (const file of manifest.files.filter(f => f.database)) {
  const db = new DatabaseSync(resolve(baseline, file.path), { readOnly: true });
  const outside = new Map();
  function inspect(value, context) {
    if (typeof value === 'string') {
      if (isAbsolute(value) && /\.(mp4|mov|mkv|webm|wav|mp3|flac|m4a|aac|ogg|png|jpe?g|webp|blend\d*|docx|json|py|ttf|otf|vdb|abc)$/i.test(value) && relative(root, resolve(value)).startsWith('..')) {
        const refs = outside.get(value) ?? new Set(); refs.add(context); outside.set(value, refs);
      } else if (value.trimStart().startsWith('{') || value.trimStart().startsWith('[')) try { inspect(JSON.parse(value), context); } catch {}
    } else if (Array.isArray(value)) value.forEach((v, i) => inspect(v, `${context}[${i}]`));
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) if (!/^(imported_from|sourceRoot|originalPath|sourceOriginal|url|uri)$/.test(key)) inspect(child, `${context}.${key}`);
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name } of tables) for (const row of db.prepare(`SELECT * FROM "${String(name).replaceAll('"', '""')}"`).all()) inspect(row, `${name}:${row.id ?? row.project_id ?? ''}`);
  db.close();
  result.push({ database: file.path, tables: tables.length, outsideData: [...outside].map(([path, refs]) => ({ path, present: existsSync(path) && statSync(path).isFile(), references: [...refs] })) });
}
writeFileSync('outputs/disaster-backup-all-database-dependencies.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.map(db => ({ database: db.database, tables: db.tables, outsidePaths: db.outsideData.length, presentOutsidePaths: db.outsideData.filter(p => p.present).length })), null, 2));
