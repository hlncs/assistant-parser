import { test, expect } from '@playwright/test'
import { mockBackend } from './mocks.js'

test('copies location between tabs', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')

  await page.getByLabel(/City/i).fill('Paris')
  await page.getByLabel(/Country/i).fill('France')

  await page.getByRole('tab', { name: /Travel Assistant/i }).click()

  const copyBtn = page.locator('button.copy-loc-btn', { hasText: 'Use Weather location' })
  await expect(copyBtn).toBeEnabled()
  await copyBtn.click()

  await expect(page.getByLabel(/Destination/i)).toHaveValue('Paris, France')
})