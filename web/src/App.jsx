import { useState } from 'react'
import { getForecast, geocode } from './api'
import MapView from './MapView'
import './App.css'

export default function App() {
  const [city, setCity] = useState('Sydney')
  const [country, setCountry] = useState('Australia')
  const [units, setUnits] = useState('metric')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [displayUnits, setDisplayUnits] = useState('metric')
  const [coords, setCoords] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setForecast(null)
    setCoords(null)
    try {
      const [data, geo] = await Promise.all([
        getForecast({ city: city.trim(), country: country.trim(), units }),
        geocode({ city: city.trim(), country: country.trim() }).catch(() => null),
      ])
      setForecast(data)
      setDisplayUnits(units)          // freeze the unit that produced this result
      setCoords(geo)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function formatTemp(celsius, units) {
    if (celsius == null) return '—'
    if (units === 'imperial') {
      const f = celsius * 9 / 5 + 32
      return `${f.toFixed(1)}°F`
    }
    return `${celsius.toFixed(1)}°C`
  }

  return (
    <div className="app">
      <h1>Weather Forecast</h1>

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

      {coords && (
        <MapView lat={coords.lat} lon={coords.lon} label={coords.label} />
      )}
    </div>
  )
}