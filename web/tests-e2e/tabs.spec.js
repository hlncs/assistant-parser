import { test, expect } from '@playwright/test'
import { mockBackend } from './mocks.js'

test('renders both tabs and switches between them', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')

  await expect(page.getByRole('tab', { name: /Weather Forecast/i })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Travel Assistant/i })).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Weather Forecast' })).toBeVisible()

  await page.getByRole('tab', { name: /Travel Assistant/i }).click()
  await expect(page.getByRole('heading', { name: 'Travel Assistant' })).toBeVisible()
})