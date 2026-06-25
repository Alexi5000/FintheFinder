import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatSecretFindings, scanForSecretLikeContent } from '../src/lib/secret-scan';

const notebooksDir = join(process.cwd(), 'notebooks');

export function validateNotebookDocument(notebook: string, parsed: unknown) {
  if (!parsed || typeof parsed !== 'object') throw new Error(`${notebook} is not a JSON object.`);
  const document = parsed as { cells?: unknown; metadata?: { finRuntime?: unknown } };
  if (!Array.isArray(document.cells)) throw new Error(`${notebook} does not contain a cells array.`);
  if (document.metadata?.finRuntime === true) throw new Error(`${notebook} is marked as runtime. Notebooks are authoring artifacts only.`);

  const findings = scanForSecretLikeContent(parsed, { rootPath: notebook, maxStringLength: 20000 });
  if (findings.length > 0) {
    throw new Error(`${notebook} contains disallowed secret-like content: ${formatSecretFindings(findings)}.`);
  }
}

export function checkNotebookDirectory(directory = notebooksDir) {
  if (!existsSync(directory)) return { status: 'ok' as const, notebooks: 0 };

  const notebooks = readdirSync(directory).filter((file) => file.endsWith('.ipynb')).sort();
  for (const notebook of notebooks) {
    validateNotebookDocument(notebook, JSON.parse(readFileSync(join(directory, notebook), 'utf8')));
  }
  return { status: 'ok' as const, notebooks: notebooks.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(checkNotebookDirectory(), null, 2));
}
