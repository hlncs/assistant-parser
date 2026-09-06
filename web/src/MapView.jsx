export default function MapView({ lat, lon, label }) {
  const d = 0.08 // ~8-10km half-window
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(',')
  const embedSrc =
    `https://www.openstreetmap.org/export/embed.html` +
    `?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`
  const externalHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`

  return (
    <div className="map">
      <iframe
        title={`Map of ${label}`}
        src={embedSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <a className="map-link" href={externalHref} target="_blank" rel="noreferrer">
        View larger map ↗
      </a>
    </div>
  )
}