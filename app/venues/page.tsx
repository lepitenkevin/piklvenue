
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Search } from 'lucide-react';
import { request, Venue, money } from '../../lib/api';

export default function AllVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ venues: Venue[] }>('/venues')
      .then(data => setVenues(data.venues))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = venues.filter(v =>
    `${v.name} ${v.city} ${v.address}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <main className="shell listing-section">
      <div className="section-heading">
        <div>
          <span className="overline">PIKLVENUE</span>
          <h1>Find your next court.</h1>
          <p>Browse venues and reserve without logging in.</p>
        </div>
      </div>

      <div className="searchbar">
        <Search size={20} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by venue or location"
        />
      </div>

      {loading && <p>Loading venues...</p>}
      {error && <p className="notice">{error}</p>}

      <div className="venue-grid">
        {filtered.map((v, i) => (
          <Link
            href={`/venues/${v.id}`}
            className="venue-card"
            key={v.id}
          >
            <div
              className={`venue-photo photo-${i % 3}`}
              style={v.image_url ? {
                backgroundImage: `url("${v.image_url}")`
              } : undefined}
            >
              {Number(v.has_live_court) === 1 && (
                <span className="court-live-badge venue-live-badge">Live now</span>
              )}
            </div>

            <div className="venue-info">
              <div className="venue-location">
                <MapPin size={14} />
                {v.city}
              </div>

              <h3>{v.name}</h3>
              <p>{v.address}</p>

              <div className="venue-bottom">
                <span>{v.court_count} courts</span>
                <span>
                  From <strong>{money(v.price_from)}</strong>/hr
                </span>
              </div>

              <span className="btn btn-dark">
                Book a Court
              </span>
            </div>
          </Link>
        ))}
      </div>

      {!loading && !error && filtered.length === 0 && (
        <p>No venues found.</p>
      )}
    </main>
  );
}
