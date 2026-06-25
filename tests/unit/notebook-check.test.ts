import { describe, expect, it } from 'vitest';
import { validateNotebookDocument } from '../../scripts/check-notebooks';

describe('notebook checker', () => {
  it('accepts authoring-only notebooks without secret-like content', () => {
    expect(() =>
      validateNotebookDocument('safe.ipynb', {
        metadata: { finRuntime: false },
        cells: [{ cell_type: 'markdown', source: ['Offline rubric notes only.'] }],
      }),
    ).not.toThrow();
  });

  it('rejects runtime notebooks and secret-like content', () => {
    expect(() => validateNotebookDocument('runtime.ipynb', { metadata: { finRuntime: true }, cells: [] })).toThrow('marked as runtime');

    expect(() =>
      validateNotebookDocument('secret.ipynb', {
        metadata: {},
        cells: [{ cell_type: 'code', source: ['OPENAI_API_KEY = "sk-test_1234567890abcdef1234567890"'] }],
      }),
    ).toThrow(/secret-like content/);
  });
});
