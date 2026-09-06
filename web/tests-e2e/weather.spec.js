import { test, expect } from '@playwright/test'
import { mockBackend, mockInvalidLocation } from './mocks.js'

test('weather: fetches forecast and shows local time + UTC', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')

  await page.getByLabel(/City/i).fill('Tokyo')
  await page.getByLabel(/Country/i).fill('Japan')
  await page.getByRole('button', { name: /Get forecast/i }).click()

  await expect(page.getByRole('heading', { name: 'Tokyo, Japan' })).toBeVisible()
  await expect(page.getByText(/20\.1°C/)).toBeVisible()
  await expect(page.getByText(/Slight Rain/)).toBeVisible()
  await expect(page.getByText(/\(2026-09-06T04:30Z\)/)).toBeVisible()
})

test('weather: shows "Did you mean…?" chip on invalid_location', async ({ page }) => {
  // first: forecast returns 400 invalid_location
  await mockInvalidLocation(page)
  // suggest_location returns Brisbane
  await page.route('**/suggest_location', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ suggestions: ['Brisbane, Australia'], confidence: 'high' }),
    }),
  )

  await page.goto('/')
  await page.getByLabel(/City/i).fill('Brissy')
  await page.getByLabel(/Country/i).fill('Australia')
  await page.getByRole('button', { name: /Get forecast/i }).click()

  await expect(page.getByText(/Did you mean/i)).toBeVisible()
  const chip = page.getByRole('button', { name: 'Brisbane, Australia' })
  await expect(chip).toBeVisible()

  // Clicking the chip re-fetches — swap the forecast mock to succeed.
  await page.unroute('**/tools/get_forecast')
  await mockBackend(page, {
    forecast: {
      location: 'Brisbane, Australia',
      temperature_c: 24.0,
      condition: 'Clear',
      forecast_time_utc: '2026-09-06T04:30Z',
      timezone: 'Australia/Brisbane',
      provider: 'open-meteo',
    },
  })
  await chip.click()
  await expect(page.getByRole('heading', { name: 'Brisbane, Australia' })).toBeVisible()
  await expect(page.getByText(/24\.0°C/)).toBeVisible()
})