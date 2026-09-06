import { useEffect, useState } from 'react'
import { askTravel } from './api'
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
  const [activePrompt, setActivePrompt] = useState(null)

  useEffect(() => {
    setResponse(null)
    setError(null)
    setActivePrompt(null)
  }, [destination])

  const canAsk = Boolean(destination.trim())
  const canCopy = Boolean(otherLocation) && otherLocation !== destination

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
              <input
                value={destination}
                onChange={(e) => onDestinationChange(e.target.value)}
                placeholder="Tokyo, Japan"
              />
            </label>
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