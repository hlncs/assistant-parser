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
      <h1>Travel Assistant</h1>
      <div className="layout">
        <div className="col-main">
          <div className="form">
            <label>
              Destination
              <div className="input-with-action">
                <input
                  value={destination}
                  onChange={(e) => onDestinationChange(e.target.value)}
                  placeholder="Tokyo, Japan"
                />
                <button
                  type="button"
                  className="copy-loc-btn"
                  disabled={!canCopy}
                  onClick={() => onDestinationChange(otherLocation)}
                  title={canCopy ? `Use “${otherLocation}” from Weather tab` : 'No location on Weather tab yet'}
                  aria-label="Copy location from Weather tab"
                >
                  ↔ Use Weather location
                </button>
              </div>
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
                Thinking…
              </div>
            )}

            {!loading && error && <p className="error">{error}</p>}

            {!loading && !error && response && (
              <>
                {activePrompt && <div className="prompt-echo">{activePrompt}</div>}
                <div className="assistant-reply markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.reply}</ReactMarkdown>
                </div>
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