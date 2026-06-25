import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('workspace renders the professional product shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ask Fin a question worth answering well.' })).toBeVisible();
  await expect(page.getByText('Production Readiness')).toBeVisible();
  await expect(page.getByRole('button', { name: /Start research/i })).toBeDisabled();
});

test('settings exposes provider and model status', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Provider and model status' })).toBeVisible();
  await expect(page.getByText('gpt-5.5')).toBeVisible();
  await expect(page.getByText('gpt-5.4-mini')).toBeVisible();
});

test('about page exposes product architecture and proof status', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Deep research that leaves an evidence trail.' })).toBeVisible();
  await expect(page.getByLabel('Product status')).toContainText(new RegExp(`Version\\s*${escapedVersion}`));
  await expect(page.getByLabel('Product status')).toContainText(/Proof Tier\s*Offline-gated/);
  await expect(page.getByLabel('Product status')).toContainText(/Live Proof\s*Pending configured credentials/);
  await expect(page.getByLabel('Research Workflow')).toContainText('Claim Audit');
  await expect(page.getByRole('heading', { name: 'Evidence model' })).toBeVisible();
  const proofSurfaces = page.getByRole('article', { name: 'Proof surfaces' });
  await expect(proofSurfaces.getByRole('heading', { name: 'Proof surfaces' })).toBeVisible();
  await expect(proofSurfaces).toContainText('CI verified');
  await expect(proofSurfaces).toContainText('Unit verified');
  await expect(proofSurfaces).toContainText('Migration verified');
  await expect(proofSurfaces).toContainText('CI/Docker configured');
  await expect(page.getByText('Pending configured credentials').first()).toBeVisible();
  await expect(page.getByText(/Configured-live benchmark rows and recorded demo evidence are intentionally pending real provider credentials/)).toBeVisible();
});

test('about page avoids horizontal overflow on narrow desktop', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Deep research that leaves an evidence trail.' })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('session history renders authenticated loader state', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page.getByText(/Supabase Not Configured|Sign In Required/)).toBeVisible();
});

test('report reader renders authenticated loader state', async ({ page }) => {
  await page.goto('/reports/demo-session');
  await expect(page.getByText(/Supabase Not Configured|Sign In Required/)).toBeVisible();
});
