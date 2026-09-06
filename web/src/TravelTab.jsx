import { useEffect, useState } from 'react'
import { askTravel, suggestLocation, geocode } from './api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const TRAVEL_PROMPTS = [
  { label: 'Packing list',            template: 'Give me a packing list for a 5-day trip to {loc}.' },
  { label: 'Best time to visit',      template: 'When is the best time of year to visit {loc}?' },
  { label: 'Top 3 attractions',       template: 'What are the top 3 must-see attractions in {loc}?' },
  { label: 'Food to try',             template: 'What local dishes should I try in {loc}?' },
  { label: 'Getting around',          template: 'What\'s the best way to get around {loc} as a visitor?' },
  { label: 'Safety & tips',           template: 'What safety tips and cultural etiquette should I know for {loc}?' },
  { label: 'Weather-aware itinerary', template: 'Plan a 1-day itinerary for {loc} that adapts to the current weather.' },

  // ── new ──
  { label: 'Budget breakdown',        template: 'Estimate a daily budget (low / mid / high) for a traveller in {loc}.' },
  { label: 'Day trips nearby',        template: 'What are the best day trips within 2 hours of {loc}?' },
  { label: 'Family friendly',         template: 'Suggest family-friendly activities in {loc} for kids aged 6–12.' },
  { label: 'Nightlife & evenings',    template: 'What are popular things to do in {loc} in the evening?' },
  { label: 'Hidden gems',             template: 'Share 3 lesser-known hidden gems in {loc} that most tourists miss.' },
  { label: 'Three best fishing spots',template: 'Share 3 of the best fishing spots in {loc} if the weather allows.' },
  { label: 'Local events',            template: 'What local events or festivals are happening in {loc} during my visit?' },
  { label: 'Travel restrictions',     template: 'Are there any travel restrictions or requirements for visiting {loc}?' },
  { label: 'Visa & docs',             template: 'What visa or documentation do I need to visit {loc}?' },
  { label: 'Public transport',        template: 'How does public transport work in {loc}? Include costs and tips.' },
  { label: 'Best beaches',            template: 'What are the best beaches in or near {loc}?' },
  { label: 'Local markets',           template: 'What local markets or shopping areas are worth visiting in {loc}?' },
  { label: 'Hiking & nature',         template: 'What are the best hiking trails or nature spots in {loc}?' },
  { label: 'Cultural experiences',    template: 'What cultural experiences or workshops can I participate in while in {loc}?' },
  { label: 'Photography spots',       template: 'Where are the best photography spots in {loc} for capturing iconic views?' },
  { label: 'Local music scene',       template: 'What is the local music scene like in {loc}? Any venues or events to check out?' },
  { label: 'Day-to-night itinerary',  template: 'Plan a day-to-night itinerary for {loc}, including meals, activities, and accommodations.' },
  { label: "Parks",                    template: "What are the best parks or green spaces to visit, within a walking distance in {loc}? Show me a list including distances." },
]

export default function TravelTab({ destination, onDestinationChange, otherLocation }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [response, setResponse] = useState(null)
  const [activePrompt, setActivePrompt] = useState('')

  // ── NEW: suggestion state ──
  const [suggestions, setSuggestions] = useState([])
  const [suggestConfidence, setSuggestConfidence] = useState(null)
  const [checking, setChecking] = useState(false)
  const [coords, setCoords] = useState(null)   // { lat, lon, label }

  useEffect(() => {
    console.log('destination changed → clearing response', destination)
    setResponse(null)
    setError(null)
    setActivePrompt(null)
  }, [destination])

  const canAsk = Boolean(destination?.trim())
  const canCopy = Boolean(otherLocation?.trim())

  // ── helper: geocode a resolved place and store coords ──
  async function locateAndShow(place) {
    try {
      const [city, ...rest] = place.split(',').map((s) => s.trim())
      const country = rest.length ? rest[rest.length - 1] : ''
      const geo = await geocode({ city, country })
      if (geo && geo.lat != null && geo.lon != null) {
        setCoords({ lat: geo.lat, lon: geo.lon, label: geo.display_name || place })
      } else {
        setCoords(null)
      }
    } catch {
      setCoords(null)
    }
  }

  async function checkDestination() {
    if (!canAsk) return
    setChecking(true)
    setError(null)
    setSuggestions([])
    setSuggestConfidence(null)
    setCoords(null)

    const raw = destination.trim()
    const [city, ...rest] = raw.split(',').map((s) => s.trim())
    const country = rest.length ? rest[rest.length - 1] : ''

    try {
      // 1) Authoritative lookup via Open-Meteo geocoder
      const geo = await geocode({ city, country })
      if (geo && geo.lat != null && geo.lon != null) {
        setCoords({ lat: geo.lat, lon: geo.lon, label: geo.display_name || raw })
        return
      }
    } catch { /* fall through to LLM suggestions */ }

    // 2) Fallback: ask the LLM for spelling corrections
    try {
      const body = await suggestLocation(raw)
      const list = Array.isArray(body?.suggestions) ? body.suggestions : []
      if (list.length > 0) {
        setSuggestions(list)
        setSuggestConfidence(body?.confidence ?? null)
      } else {
        setError(`⚠️ We couldn't find "${raw}". Please check the spelling or try a nearby town.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  async function applySuggestion(s) {
    onDestinationChange(s)
    setSuggestions([])
    setSuggestConfidence(null)
    await locateAndShow(s)
  }

  async function ask(template) {
    if (!canAsk) return
    const message = template.replaceAll('{loc}', destination.trim())
    setLoading(true)
    setError(null)
    setResponse(null)
    setActivePrompt(message)
    try {
      const body = await askTravel(message)
      console.log('travel_chat response:', body)
      if (!body || typeof body.reply !== 'string') {
        setError('The assistant returned an empty response. Please try again.')
        return
      }
      setResponse(body)
    } catch (err) {
      setError(err.message || 'Request failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Travel Assistant</h1>
        <button
          type="button"
          className="copy-loc-btn"
          disabled={!canCopy}
          onClick={() => onDestinationChange(otherLocation)}
          title={canCopy ? `Use "${otherLocation}" from Weather tab` : 'No location on Weather tab yet'}
          aria-label="Use Weather location"
        >
          ↔ Use Weather location
        </button>
      </div>

      <div className="layout layout-single">
        <div className="col-main">
          <div className="form">
            <label>
              Destination
              <div className="input-with-action">
                <input
                  value={destination}
                  onChange={(e) => {
                    onDestinationChange(e.target.value)
                    setSuggestions([])
                    setSuggestConfidence(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      checkDestination()
                    }
                  }}
                  placeholder="Tokyo, Japan"
                />
                <button
                  type="button"
                  className="search-loc-btn"
                  disabled={!canAsk || checking}
                  onClick={checkDestination}
                  title="Check / correct this destination"
                  aria-label="Check location"
                >
                  🔍 {checking ? 'Checking…' : 'Search'}
                </button>
              </div>
            </label>

            {suggestions.length > 0 && (
              <>
                <p className="error">⚠️ No geocoding match for '{destination.trim()}'</p>
                <div className="suggest-row" role="group" aria-label="Did you mean">
                  <span className="suggest-label">Did you mean…?</span>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="suggest-chip"
                      onClick={() => applySuggestion(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {coords && (
            <section className="map">
              <iframe
                title="Destination map"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon - 0.15},${coords.lat - 0.1},${coords.lon + 0.15},${coords.lat + 0.1}&layer=mapnik&marker=${coords.lat},${coords.lon}`}
                loading="lazy"
              />
              <a
                className="map-link"
                href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=11/${coords.lat}/${coords.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Open larger map ↗
              </a>
            </section>
          )}

          <section className="insights-section">
            <h3>Ask the Assistant</h3>
            <div className="prompt-grid">
              {TRAVEL_PROMPTS.map((p) => (
                <button
                  key={p.template}
                  type="button"
                  className="prompt-chip"
                  disabled={!canAsk || loading}
                  onClick={() => ask(p.template)}
                  title={p.template.replace('{loc}', destination || '')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section className="insights-section">
            <h3>Assistant Response</h3>

            {loading && (
              <div className="thinking" role="status" aria-live="polite">
                <span className="thinking-dots" aria-hidden="true">
                  <span></span><span></span><span></span>
                </span>
                Thinking
              </div>
            )}

            {!loading && error && <p className="error">{error}</p>}

            {!loading && !error && response && (
              <>
                {activePrompt && <div className="prompt-echo">{activePrompt}</div>}
                <div className="assistant-reply markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.reply}</ReactMarkdown>
                </div>

                {Array.isArray(response.tool_calls) && response.tool_calls.length > 0 && (
                  <details className="tool-trace" open>
                    <summary>Tool calls ({response.tool_calls.length})</summary>
                    <ul className="trace-list">
                      {response.tool_calls.map((tc) => (
                        <li key={tc.id} className="trace-item">
                          <div className="trace-header">
                            <code>{tc.name}</code>
                            <span className={`trace-status ${tc.error ? 'err' : 'ok'}`}>
                              {tc.error ? 'error' : 'ok'}
                            </span>
                          </div>
                          <div className="trace-row">
                            <span className="trace-label">args</span>
                            <code>{JSON.stringify(tc.arguments)}</code>
                          </div>
                          {tc.result && (
                            <div className="trace-row">
                              <span className="trace-label">result</span>
                              <code>{JSON.stringify(tc.result)}</code>
                            </div>
                          )}
                          {tc.error && (
                            <div className="trace-row error-row">
                              <span className="trace-label">error</span>
                              <code>{tc.error}</code>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}

            {!loading && !error && !response && (
              <p className="hint">Enter a destination and pick a prompt.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}