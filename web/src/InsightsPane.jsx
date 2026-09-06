import { useEffect, useState } from 'react'
import { askChat } from './api'

const PROMPT_TEMPLATES = [
  'How does today\'s temperature in {loc} compare to the temperature on the same date 5, 10, 25, and 50 years ago?',
  'What clothing would you recommend for the current weather in {loc}?',
  'Is today\'s weather in {loc} typical for this time of year? Explain briefly.',
  'Summarise the current forecast in {loc} in one friendly sentence.',
]

export default function InsightsPane({ location }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [response, setResponse] = useState(null)
  const [activePrompt, setActivePrompt] = useState(null)

  // Reset when the user fetches a new location.
  useEffect(() => {
    setLoading(false)
    setError(null)
    setResponse(null)
    setActivePrompt(null)
  }, [location])

  const canAsk = Boolean(location)

  async function ask(template) {
    if (!canAsk) return
    const message = template.replaceAll('{loc}', location)
    setLoading(true)
    setError(null)
    setResponse(null)
    setActivePrompt(message)
    try {
      const body = await askChat(message)
      setResponse(body)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className="insights">
      <section className="insights-section">
        <h3>Ask the assistant</h3>
        {!canAsk && (
          <p className="hint">Get a forecast first to enable these prompts.</p>
        )}
        <ul className="prompt-list">
          {PROMPT_TEMPLATES.map((t) => {
            const preview = t.replaceAll('{loc}', location || 'your location')
            return (
              <li key={t}>
                <button
                  type="button"
                  className="prompt-btn"
                  disabled={!canAsk || loading}
                  onClick={() => ask(t)}
                  title={preview}
                >
                  {preview}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="insights-section">
        <h3>Assistant response</h3>
        {loading && <div className="hint">Thinking…</div>}
        {error && <div className="error">⚠️ {error}</div>}
        {!loading && !error && !response && (
          <div className="hint">Click a prompt above to get an analysis.</div>
        )}
        {response && (
          <div className="reply">
            {activePrompt && (
              <div className="prompt-echo">
                <strong>You asked:</strong> {activePrompt}
              </div>
            )}
            <p className="reply-text">{response.reply}</p>
            {response.tool_calls?.length > 0 && (
              <details className="tool-trace">
                <summary>Tool calls ({response.tool_calls.length})</summary>
                <pre>{JSON.stringify(response.tool_calls, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </section>
    </aside>
  )
}