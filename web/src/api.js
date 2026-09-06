const BASE = import.meta.env.VITE_API_BASE ?? '/api'

// Reads the body once and either returns the parsed JSON (on 2xx)
// or throws a friendly Error (on non-2xx).
async function handleResponse(res) {
  let body
  try { body = await res.json() } catch { /* non-JSON body */ }

  if (res.ok) return body

  const detail = body?.detail
  if (res.status === 400) throw new Error(detail || "We couldn't find that location. Try a nearby town or check spelling.")
  if (res.status === 429) throw new Error(detail || 'The assistant is busy right now. Please try again shortly.')
  if (res.status === 503) throw new Error(detail || 'The assistant is temporarily unavailable. Please try again in a moment.')
  if (res.status >= 500)  throw new Error(detail || 'Something went wrong on our side. Please try again.')
  throw new Error(detail || `Request failed (${res.status}).`)
}

async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options)
    return await handleResponse(res)   // returns parsed JSON on success
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Cannot reach the server. Please check your connection and try again.')
    }
    throw err
  }
}

export async function getForecast({ city, country, units = 'metric' }) {
  const location = country ? `${city}, ${country}` : city
  return safeFetch(`${BASE}/tools/get_forecast`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ location, units }),
  })
}

// Direct call to Open-Meteo geocoding (no API key). Used only for the map.
export async function geocode({ city, country }) {
  const name = country ? `${city}, ${country}` : city
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', name)
  url.searchParams.set('count', '1')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`)
  const body = await res.json()
  const hit = body?.results?.[0]
  if (!hit) return null
  return { lat: hit.latitude, lon: hit.longitude, label: `${hit.name}, ${hit.country}` }
}

export async function askChat(message) {
  return safeFetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

export async function suggestLocation(input) {
  return safeFetch(`${BASE}/suggest_location`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  })
}

export async function askTravel(message) {
  return safeFetch(`${BASE}/travel_chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}