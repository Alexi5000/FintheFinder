import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContractArtifacts } from './contract-artifacts';

const root = process.cwd();
const schemaPath = join(root, 'contracts', 'schema.json');
const hashPath = join(root, 'contracts', 'schema.sha256');

if (!existsSync(schemaPath) || !existsSync(hashPath)) {
  throw new Error('Contract artifacts are missing. Run npm run contracts:sync.');
}

const schema = readFileSync(schemaPath, 'utf8');
const expected = readFileSync(hashPath, 'utf8').split(/\s+/)[0];
const actual = createHash('sha256').update(schema).digest('hex');
const generated = buildContractArtifacts();

if (actual !== expected) {
  throw new Error(`Contract drift detected. Expected ${expected}, got ${actual}. Run npm run contracts:sync.`);
}
if (schema !== generated.serialized || actual !== generated.hash) {
  throw new Error('Committed contract artifacts do not match source schemas. Run npm run contracts:sync.');
}

console.log(JSON.stringify({ status: 'ok', checked: ['contracts/schema.json', 'contracts/schema.sha256'], hash: actual }, null, 2));
