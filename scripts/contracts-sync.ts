import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildContractArtifacts } from './contract-artifacts';

const { serialized, hash } = buildContractArtifacts();
const root = process.cwd();
const schemaPath = join(root, 'contracts', 'schema.json');
const hashPath = join(root, 'contracts', 'schema.sha256');

mkdirSync(dirname(schemaPath), { recursive: true });
writeFileSync(schemaPath, serialized);
writeFileSync(hashPath, `${hash}  schema.json\n`);
console.log(JSON.stringify({ status: 'ok', schemaPath, hash }, null, 2));
