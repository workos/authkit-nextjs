// Create a package.json file in the dist/esm directory with "type": "module" field
import fs from 'fs';
import path from 'path';

const dir = 'dist/esm';

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(
  path.join(dir, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
  'utf-8'
);
