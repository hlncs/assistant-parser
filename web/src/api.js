const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export async function getForecast({ city, country, units = 'metric' }) {
  const location = country ? `${city}, ${country}` : city
  const res = await fetch(`${BASE}/tools/get_forecast`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ location, units }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`)
    err.code = body?.error?.code
    err.status = res.status
    throw err
  }
  return body
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
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error?.message || `HTTP ${res.status}`)
  }
  return body // { reply, tool_calls: [...] }
}

export async function suggestLocation(input) {
  const res = await fetch(`${BASE}/suggest_location`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`)
  return body // { suggestions: string[], confidence: 'high'|'medium'|'low' }
}

export async function askTravel(message) {
  const res = await fetch(`${BASE}/travel_chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`)
  return body // { reply, tool_calls }
}