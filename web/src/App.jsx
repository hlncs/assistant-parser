import { useState } from 'react'
import { getForecast, geocode, suggestLocation } from './api'
import MapView from './MapView'
import InsightsPane from './InsightsPane'
import './App.css'

function formatTemp(celsius, units) {
  if (celsius == null) return '—'
  if (units === 'imperial') return `${(celsius * 9 / 5 + 32).toFixed(1)}°F`
  return `${celsius.toFixed(1)}°C`
}

// Split "City, Country" back into two fields.
function splitLocation(s) {
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return { city: parts[0] || '', country: '' }
  // First part = city; join the rest as "region, country" — the backend
  // geocoder is fine with either "City, Country" or "City, Region, Country".
  return { city: parts[0], country: parts.slice(1).join(', ') }
}

export default function App() {
  const [city, setCity] = useState('Sydney')
  const [country, setCountry] = useState('Australia')
  const [units, setUnits] = useState('metric')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [suggestion, setSuggestion] = useState(null)   // { text, confidence }
  const [forecast, setForecast] = useState(null)
  const [displayUnits, setDisplayUnits] = useState('metric')
  const [coords, setCoords] = useState(null)

  async function runForecast(nextCity, nextCountry) {
    setLoading(true)
    setError(null)
    setSuggestion(null)
    setForecast(null)
    setCoords(null)
    try {
      const [data, geo] = await Promise.all([
        getForecast({ city: nextCity, country: nextCountry, units }),
        geocode({ city: nextCity, country: nextCountry }).catch(() => null),
      ])
      setForecast(data)
      setDisplayUnits(units)
      setCoords(geo)
    } catch (err) {
      if (err.code === 'invalid_location') {
        const raw = nextCountry ? `${nextCity}, ${nextCountry}` : nextCity
        try {
          const s = await suggestLocation(raw)
          const list = (s.suggestions || [])
            .filter((x) => x && x.toLowerCase() !== raw.toLowerCase())
          if (list.length > 0) {
            setSuggestion({ options: list, confidence: s.confidence })
          } else {
            setError(
              `We couldn't find "${raw}". Try adding a state or region ` +
              `(e.g. "Stockton, California, USA").`
            )
          }
        } catch {
          setError(`We couldn't find "${raw}". Please check the spelling.`)
        }
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    runForecast(city.trim(), country.trim())
  }

  function applySuggestion(text) {
    const { city: c, country: co } = splitLocation(text)
    setCity(c)
    setCountry(co)
    setSuggestion(null)
    runForecast(c, co)
  }

  return (
    <div className="app">
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

          {suggestion && (
            <div className="suggest">
              <div>
                Did you mean…
                <span className={`confidence conf-${suggestion.confidence}`}>
                  {suggestion.confidence} confidence
                </span>
              </div>
              <ul className="suggest-list">
                {suggestion.options.map((opt) => (
                  <li key={opt}>
                    <button
                      type="button"
                      className="suggest-option"
                      onClick={() => applySuggestion(opt)}
                    >
                      {opt}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="suggest-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setSuggestion(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {forecast && (
            <div className="card">
              <h2>{forecast.location}</h2>
              <div className="temp">{formatTemp(forecast.temperature_c, displayUnits)}</div>
              <div className="condition">{forecast.condition}</div>
              <div className="meta">
                <span>As of {forecast.forecast_time_utc}</span>
                <span>Provider: {forecast.provider}</span>
              </div>
            </div>
          )}

          {coords && <MapView lat={coords.lat} lon={coords.lon} label={coords.label} />}
        </div>

        <InsightsPane location={forecast?.location ?? null} />
      </div>
    </div>
  )
}