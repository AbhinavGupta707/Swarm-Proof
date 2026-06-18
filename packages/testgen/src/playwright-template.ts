export function buildPlaywrightTest(input: { name: string; targetUrl: string; goal: string }) {
  return `import { test, expect } from '@playwright/test';

test('${input.name}', async ({ page }) => {
  await page.goto('${input.targetUrl}');
  await page.getByRole('link', { name: /get started|sign up/i }).click();
  await page.getByLabel(/email/i).fill('demo@example.com');
  await page.getByLabel(/password/i).fill('TestPassword123!');
  await page.getByRole('link', { name: /create account/i }).click();
  await page.getByLabel(/project name/i).fill('Launch review');
  await page.getByRole('link', { name: /create project/i }).first().click();
  await expect(page.getByText(/people/i)).toBeVisible();
});
`;
}
