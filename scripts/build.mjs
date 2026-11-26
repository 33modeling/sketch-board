// dist/ 에 정적 파일을 모은다(번들러 없음). 모듈 import 가 모두 있는지도 확인한다.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'src'), { recursive: true });
cpSync(join(root, 'index.html'), join(dist, 'index.html'));
let files = 0;
for (const f of readdirSync(join(root, 'src'))) {
  const src = readFileSync(join(root, 'src', f), 'utf8');
  for (const m of src.matchAll(/from '(\.\/[^']+)'/g)) {
    if (!existsSync(join(root, 'src', m[1]))) throw new Error(`${f}: ${m[1]} 없음`);
  }
  cpSync(join(root, 'src', f), join(dist, 'src', f));
  files++;
}
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) if (!existsSync(join(root, m[1]))) throw new Error(`index.html: ${m[1]} 없음`);
console.log(`dist/ 완료: index.html + src ${files}개`);
