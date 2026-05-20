export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function titleFromQuery(query: string) {
  const compact = query.replace(/\s+/g, ' ').trim();
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
}

export function nowIso() {
  return new Date().toISOString();
}
