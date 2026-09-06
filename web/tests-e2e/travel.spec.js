import { test, expect } from '@playwright/test'
import { mockBackend } from './mocks.js'

test('travel: prompt chip triggers request and renders Markdown reply', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')
  await page.getByRole('tab', { name: /Travel Assistant/i }).click()

  await page.getByLabel(/Destination/i).fill('Tokyo, Japan')
  await page.getByRole('button', { name: /Top 3 attractions/i }).click()

  // Markdown renders as <h2> and <ol>
  await expect(page.getByRole('heading', { name: /Top attractions/i })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Tokyo Skytree' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Meiji Shrine' })).toBeVisible()
})