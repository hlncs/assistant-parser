import { useState } from 'react'
import WeatherTab from './WeatherTab'
import TravelTab from './TravelTab'
import ThemeToggle from './ThemeToggle'
import './App.css'

const TABS = [
  { id: 'weather', label: '☀️ Weather Forecast' },
  { id: 'travel',  label: '✈️ Travel Assistant' },
]

export default function App() {
  const [tab, setTab] = useState('weather')
  const [weatherLoc, setWeatherLoc] = useState({ city: 'Sydney', country: 'Australia' })
  const [travelLoc, setTravelLoc] = useState('Tokyo, Japan')

  return (
    <div className="app">
      <ThemeToggle />
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

      <div hidden={tab !== 'weather'}>
        <WeatherTab
          city={weatherLoc.city}
          country={weatherLoc.country}
          onLocationChange={(city, country) => setWeatherLoc({ city, country })}
          otherLocation={travelLoc}
        />
      </div>
      <div hidden={tab !== 'travel'}>
        <TravelTab
          destination={travelLoc}
          onDestinationChange={setTravelLoc}
          otherLocation={
            weatherLoc.city
              ? [weatherLoc.city, weatherLoc.country].filter(Boolean).join(', ')
              : ''
          }
        />
      </div>
    </div>
  )
}