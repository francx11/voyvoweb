// Copia data/ y la galería a backups/<fecha-hora>/ — ejecutar con: pnpm backup
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const dest = join(ROOT, 'backups', stamp);

mkdirSync(dest, { recursive: true });
cpSync(join(ROOT, 'data'), join(dest, 'data'), { recursive: true });

const gallery = join(ROOT, 'public', 'assets', 'gallery');
if (existsSync(gallery)) {
  cpSync(gallery, join(dest, 'gallery'), { recursive: true });
}

console.log(`Backup creado en backups/${stamp}/`);
