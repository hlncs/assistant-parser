import { useState } from 'react'
import { getForecast, geocode, suggestLocation } from './api'
import MapView from './MapView'
import InsightsPane from './InsightsPane'

function formatTemp(celsius, units) {
  if (celsius == null) return '—'
  if (units === 'imperial') return `${(celsius * 9 / 5 + 32).toFixed(1)}°F`
  return `${celsius.toFixed(1)}°C`
}

function splitLocation(s) {
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return { city: parts[0] || '', country: '' }
  return { city: parts[0], country: parts.slice(1).join(', ') }
}

function formatForecastTime(utcIso, tz) {
  if (!utcIso) return ''
  const d = new Date(utcIso)
  if (Number.isNaN(d.getTime())) return utcIso
  const local = tz
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(d)
    : d.toLocaleString()
  return `${local} (${utcIso})`
}

export default function WeatherTab() {
  const [city, setCity] = useState('Sydney')
  const [country, setCountry] = useState('Australia')
  const [units, setUnits] = useState('metric')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [displayUnits, setDisplayUnits] = useState('metric')
  const [coords, setCoords] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [suggestLoading, setSuggestLoading] = useState(false)

  async function fetchFor(cityArg, countryArg, unitsArg) {
    setLoading(true)
    setError(null)
    setForecast(null)
    setCoords(null)
    setSuggestions([])
    try {
      const [data, geo] = await Promise.all([
        getForecast({ city: cityArg, country: countryArg, units: unitsArg }),
        geocode({ city: cityArg, country: countryArg }).catch(() => null),
      ])
      setForecast(data)
      setDisplayUnits(unitsArg)
      setCoords(geo)
    } catch (err) {
      setError(err.message)
      // If the location wasn't recognised, ask the LLM to suggest alternatives.
      if (/invalid_location|no geocoding match/i.test(err.message)) {
        const raw = [cityArg, countryArg].filter(Boolean).join(', ')
        setSuggestLoading(true)
        try {
          const s = await suggestLocation(raw)
          setSuggestions(s?.suggestions ?? [])
        } catch {
          /* ignore suggest failure */
        } finally {
          setSuggestLoading(false)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    await fetchFor(city.trim(), country.trim(), units)
  }

  function applySuggestion(text) {
    const { city: c, country: co } = splitLocation(text)
    setCity(c)
    setCountry(co)
    setSuggestions([])
    fetchFor(c, co, units)
  }

  return (
    <>
      <h1>Weather Forecast</h1>
      <div className="layout">
        <div className="col-main">
          <form onSubmit={onSubmit} className="form">
            <label>
              City
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Sydney"
              />
            </label>

            <label>
              Country
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Australia"
              />
            </label>

            <label>
              Units
              <select value={units} onChange={(e) => setUnits(e.target.value)}>
                <option value="metric">Metric (°C)</option>
                <option value="imperial">Imperial (°F)</option>
              </select>
            </label>

            <button type="submit" disabled={loading || !city.trim()}>
              {loading ? 'Fetching…' : 'Get Forecast'}
            </button>
          </form>

          {error && <div className="error">⚠️ {error}</div>}

          {(suggestLoading || suggestions.length > 0) && (
            <div className="suggest">
              <strong>Did you mean…?</strong>
              {suggestLoading && <div className="hint">Looking up alternatives…</div>}
              {suggestions.length > 0 && (
                <ul className="suggest-list">
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className="suggest-option"
                        onClick={() => applySuggestion(s)}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {forecast && (
            <div className="card">
              <h2>{forecast.location}</h2>
              <div className="temp">{formatTemp(forecast.temperature_c, displayUnits)}</div>
              <div className="condition">{forecast.condition}</div>
              <div className="meta">
                <span>As of {formatForecastTime(forecast.forecast_time_utc, forecast.timezone)}</span>
                <span>Provider: {forecast.provider}</span>
              </div>
            </div>
          )}

          {coords && <MapView lat={coords.lat} lon={coords.lon} label={coords.label} />}
        </div>

        {/* RIGHT column: canned prompts + LLM response */}
        <InsightsPane location={forecast?.location ?? null} />
      </div>
    </>
  )
}