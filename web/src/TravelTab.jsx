import { useEffect, useState } from 'react'
import { askTravel } from './api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const TRAVEL_PROMPTS = [
  { label: 'Packing list',   template: 'What should I pack for a 5-day trip to {loc} right now?' },
  { label: 'Best time to visit', template: 'What is the best time of year to visit {loc}, and why?' },
  { label: 'Top 3 attractions', template: 'What are the top 3 must-see attractions in {loc}?' },
  { label: 'Food to try',    template: 'What local dishes should I try in {loc}?' },
  { label: 'Getting around', template: 'What is the easiest way to get around {loc} as a tourist?' },
  { label: 'Safety & tips',  template: 'Any safety tips or local etiquette I should know for {loc}?' },
  { label: 'Weather-aware itinerary', template: 'Given the current weather in {loc}, suggest a one-day itinerary.' },
]

export default function TravelTab() {
  const [destination, setDestination] = useState('Tokyo, Japan')
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
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Tokyo, Japan"
              />
            </label>
          </div>

          <section className="prompt-section">
            <h3>Ask about your trip</h3>
            <div className="prompt-grid">
              {TRAVEL_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="prompt-chip"
                  disabled={!canAsk || loading}
                  onClick={() => ask(p.template)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="col-side">
          <h3>Assistant response</h3>
          {!activePrompt && !loading && (
            <p className="hint">Enter a destination and click a prompt to get travel advice.</p>
          )}
          {activePrompt && (
            <div className="active-prompt">
              <strong>Prompt:</strong> {activePrompt}
            </div>
          )}
          {loading && <div className="hint">Thinking…</div>}
          {error && <div className="error">⚠️ {error}</div>}
          {response && (
            <>
              <div className="assistant-reply markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {response.reply}
                </ReactMarkdown>
              </div>
              {response.tool_calls?.length > 0 && (
                <details className="tool-trace">
                  <summary>Tool calls ({response.tool_calls.length})</summary>
                  <pre>{JSON.stringify(response.tool_calls, null, 2)}</pre>
                </details>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  )
}