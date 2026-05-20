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
