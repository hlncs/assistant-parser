import { useState } from 'react'
import WeatherTab from './WeatherTab'
import TravelTab from './TravelTab'
import './App.css'

const TABS = [
  { id: 'weather', label: '☀️ Weather Forecast' },
  { id: 'travel',  label: '✈️ Travel Assistant' },
]

export default function App() {
  const [tab, setTab] = useState('weather')
  return (
    <div className="app">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'weather' ? <WeatherTab /> : <TravelTab />}
    </div>
  )
}