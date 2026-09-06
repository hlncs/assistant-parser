export const API = 'http://localhost:8000'

export async function mockBackend(page, overrides = {}) {
  const routes = {
    forecast: {
      location: 'Tokyo, Japan',
      temperature_c: 20.1,
      condition: 'Slight Rain',
      forecast_time_utc: '2026-09-06T04:30Z',
      timezone: 'Asia/Tokyo',
      provider: 'open-meteo',
    },
    suggest_location: { suggestions: ['Brisbane, Australia'], confidence: 'high' },
    travel_chat: {
      reply: '## Top attractions\n\n1. **Tokyo Skytree**\n2. **Meiji Shrine**\n3. **Shibuya Crossing**',
      tool_calls: [],
    },
    ...overrides,
  }

  await page.route('**/tools/get_forecast', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routes.forecast) }),
  )
  await page.route('**/suggest_location', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routes.suggest_location) }),
  )
  await page.route('**/travel_chat', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routes.travel_chat) }),
  )
}

export async function mockInvalidLocation(page) {
  await page.route('**/tools/get_forecast', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'invalid_location', message: "No geocoding match for 'Brissy, Australia'" },
      }),
    }),
  )
}