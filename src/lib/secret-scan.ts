export type SecretFinding = {
  path: string;
  reason: string;
  preview?: string;
};

type SecretScanOptions = {
  maxJsonBytes?: number;
  maxStringLength?: number;
  rootPath?: string;
};

const secretKeyPattern = /(^|_)(api_key|authorization|bearer|client_secret|password|passwd|private_key|refresh_token|secret|token)(_|$)/;
const secretValuePatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /sk-[A-Za-z0-9_-]{16,}/, reason: 'OpenAI-style API key' },
  { pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, reason: 'JWT-like token' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'private key block' },
  { pattern: /bearer\s+[A-Za-z0-9._~+/=-]{20,}/i, reason: 'bearer token' },
  { pattern: /(api[_-]?key|authorization|client[_-]?secret|password|private[_-]?key|refresh[_-]?token|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{16,}/i, reason: 'inline credential assignment' },
];

export function scanForSecretLikeContent(value: unknown, options: SecretScanOptions = {}): SecretFinding[] {
  const rootPath = options.rootPath ?? '$';
  const findings: SecretFinding[] = [];
  const seen = new WeakSet<object>();
  const maxJsonBytes = options.maxJsonBytes ?? null;
  const maxStringLength = options.maxStringLength ?? null;

  if (maxJsonBytes !== null) {
    const serialized = safeStringify(value);
    if (serialized.length > maxJsonBytes) {
      findings.push({ path: rootPath, reason: `JSON payload exceeds ${maxJsonBytes} bytes` });
    }
  }

  visit(value, rootPath);
  return findings;

  function visit(candidate: unknown, path: string) {
    if (typeof candidate === 'string') {
      if (maxStringLength !== null && candidate.length > maxStringLength) {
        findings.push({ path, reason: `string exceeds ${maxStringLength} characters`, preview: preview(candidate) });
      }
      for (const { pattern, reason } of secretValuePatterns) {
        if (pattern.test(candidate)) findings.push({ path, reason, preview: preview(candidate) });
      }
      return;
    }

    if (!candidate || typeof candidate !== 'object') return;
    if (seen.has(candidate)) return;
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    for (const [key, nested] of Object.entries(candidate as Record<string, unknown>)) {
      const nestedPath = `${path}.${key}`;
      if (isSecretLikeKey(key) && hasNonEmptyValue(nested)) {
        findings.push({ path: nestedPath, reason: `secret-like key "${key}" is not allowed` });
      }
      visit(nested, nestedPath);
    }
  }
}

export function formatSecretFindings(findings: SecretFinding[]) {
  return findings.map((finding) => `${finding.path}: ${finding.reason}`).join('; ');
}

function hasNonEmptyValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isSecretLikeKey(key: string) {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return secretKeyPattern.test(normalized);
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function preview(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
}
