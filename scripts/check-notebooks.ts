import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const notebooksDir = join(process.cwd(), 'notebooks');

if (!existsSync(notebooksDir)) {
  console.log(JSON.stringify({ status: 'ok', notebooks: 0 }, null, 2));
  process.exit(0);
}

const notebooks = readdirSync(notebooksDir).filter((file) => file.endsWith('.ipynb')).sort();
for (const notebook of notebooks) {
  const parsed = JSON.parse(readFileSync(join(notebooksDir, notebook), 'utf8'));
  if (!Array.isArray(parsed.cells)) throw new Error(`${notebook} does not contain a cells array.`);
  if (parsed.metadata?.finRuntime === true) throw new Error(`${notebook} is marked as runtime. Notebooks are authoring artifacts only.`);
}

console.log(JSON.stringify({ status: 'ok', notebooks: notebooks.length }, null, 2));
