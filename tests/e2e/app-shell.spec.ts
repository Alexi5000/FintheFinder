import { expect, test } from '@playwright/test';

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
  await expect(page.getByLabel('Product status')).toContainText(/Version\s*\d+\.\d+\.\d+/);
  await expect(page.getByLabel('Research workflow')).toContainText('Claim Audit');
  await expect(page.getByRole('heading', { name: 'Evidence model' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Proof surfaces' })).toBeVisible();
  await expect(page.getByText('Live benchmark rows and recorded demo evidence are still pending configured credentials')).toBeVisible();
});

test('session history renders authenticated loader state', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page.getByText(/Supabase Not Configured|Sign In Required/)).toBeVisible();
});

test('report reader renders authenticated loader state', async ({ page }) => {
  await page.goto('/reports/demo-session');
  await expect(page.getByText(/Supabase Not Configured|Sign In Required/)).toBeVisible();
});
