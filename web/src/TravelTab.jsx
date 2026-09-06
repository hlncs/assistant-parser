import { useEffect, useState } from 'react'
import { askTravel, suggestLocation } from './api'
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

  useEffect(() => {
    setResponse(null)
    setError(null)
    setActivePrompt(null)
  }, [destination])

  const canAsk = Boolean(destination?.trim())
  const canCopy = Boolean(otherLocation?.trim())

  async function checkDestination() {
    if (!canAsk) return
    setChecking(true)
    setSuggestions([])
    setSuggestConfidence(null)
    try {
      const body = await suggestLocation(destination.trim())
      const list = Array.isArray(body?.suggestions) ? body.suggestions : []
      // Show chips only if not high-confidence exact match
      if (body?.confidence !== 'high' && list.length > 0) {
        setSuggestions(list)
        setSuggestConfidence(body.confidence)
      } else if (list.length === 1 && list[0] !== destination.trim()) {
        // High confidence but corrected spelling — still offer the fix
        setSuggestions(list)
        setSuggestConfidence('high')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  function applySuggestion(s) {
    onDestinationChange(s)
    setSuggestions([])
    setSuggestConfidence(null)
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
      setResponse(body)
    } catch (err) {
      setError(err.message)
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