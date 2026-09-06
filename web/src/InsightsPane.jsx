import { useEffect, useState } from 'react'
import { askChat } from './api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const PROMPT_TEMPLATES = [
  'How does today\'s temperature in {loc} compare to the temperature on the same date 5, 10, 25, and 50 years ago?',
  'What clothing would you recommend for the current weather in {loc}?',
  'Is today\'s weather in {loc} typical for this time of year? Explain briefly.',
  'Summarise the current forecast in {loc} in one friendly sentence.',
  'What outdoor activities are suitable in {loc} right now?',
  'Any weather-related health or safety tips for {loc} today?',
  'How does the current weather in {loc} compare to nearby major cities?',
  'Should I carry an umbrella or sunscreen in {loc} today?',
  'What\'s a good indoor plan if the weather in {loc} turns bad?',
]

const PROMPT_LABELS = {
  'How does today\'s temperature in {loc} compare to the temperature on the same date 5, 10, 25, and 50 years ago?': 'Compare to history',
  'What clothing would you recommend for the current weather in {loc}?': 'What to wear',
  'Is today\'s weather in {loc} typical for this time of year? Explain briefly.': 'Typical for this season?',
  'Summarise the current forecast in {loc} in one friendly sentence.': 'One-line summary',
  'What outdoor activities are suitable in {loc} right now?': 'Outdoor activities',
  'Any weather-related health or safety tips for {loc} today?': 'Health & safety',
  'How does the current weather in {loc} compare to nearby major cities?': 'Compare to nearby',
  'Should I carry an umbrella or sunscreen in {loc} today?': 'Umbrella or sunscreen?',
  'What\'s a good indoor plan if the weather in {loc} turns bad?': 'Indoor backup plan',
}

function shortLabel(t) { return PROMPT_LABELS[t] ?? t }

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
        <h3>Ask the Assistant</h3>
        {!canAsk && (
          <p className="hint">Get a forecast first to enable these prompts.</p>
        )}
        <div className="prompt-grid">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              className="prompt-chip"
              disabled={!canAsk || loading}
              onClick={() => ask(t)}
              title={t.replace('{loc}', location ?? '')}
            >
              {shortLabel(t)}   {/* e.g. "Compare to history", "What to wear" */}
            </button>
          ))}
        </div>
      </section>

      <section className="insights-section">
        <h3>Assistant Response</h3>
        {loading && <div className="hint">Thinking…</div>}
        {error && <div className="error">⚠️ {error}</div>}
        {!loading && !error && !response && (
          <div className="hint">Click a prompt above to get an analysis.</div>
        )}
        {response && (
          <div className="reply">
            {activePrompt && <div className="prompt-echo">{activePrompt}</div>}
            <div className="assistant-reply markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.reply}</ReactMarkdown>
            </div>
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