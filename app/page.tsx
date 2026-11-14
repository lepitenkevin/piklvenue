
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Search,
  ShieldCheck,
  Clock3,
  ChevronRight,
} from 'lucide-react';
import { request, Venue, money } from '../lib/api';

export default function HomePage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    request<{ venues: Venue[] }>('/venues')
      .then(data => {
        if (active) setVenues(data.venues || []);
      })
      .catch(err => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load venues.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return venues.filter(v =>
      `${v.name} ${v.city} ${v.address}`
        .toLowerCase()
        .includes(query)
    );
  }, [venues, search]);

  const availableVenues = filtered;
  return (
    <main className="pv-home">

      {/* HERO */}
      <section className="pv-hero">
        <div className="shell pv-hero-inner">
          <div className="pv-hero-copy">
            <span className="pv-eyebrow">
              THE HOME OF PICKLEBALL BOOKINGS
            </span>

            <h1>
              Find your court.
              <br />
              <span>Play your game.</span>
            </h1>

            <p>
              Find pickleball courts near you,
              compare venues, and reserve your
              favorite playing hours in just
              a few clicks.
            </p>

            <div className="pv-search">
              <Search size={21} />

              <input
                aria-label="Search venues or locations"
                placeholder="Search venues or locations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <a href="#available-courts">
                Find Courts
                <ArrowRight size={17} />
              </a>
            </div>

            <div className="pv-hero-features">
              <span>
                <ShieldCheck size={16} />
                No player login required
              </span>
              <span>
                <Clock3 size={16} />
                Choose your own time
              </span>
            </div>
          </div>

          <div className="pv-hero-art">
            <div className="pv-court-graphic">
              <div className="pv-court-net" />
              <div className="pv-court-midline" />
              <div className="pv-court-kitchen pv-top" />
              <div className="pv-court-kitchen pv-bottom" />
              <div className="pv-court-ball" />
            </div>

            <div className="pv-floating-card">
              <CalendarDays size={20} />
              <div>
                <strong>Ready to rally?</strong>
                <span>Book a court today</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VENUE LISTINGS */}
      <section
        className="shell pv-venues"
        id="available-courts"
      >
        <div className="pv-section-heading">
          <div>
            <span className="pv-eyebrow dark">
              EXPLORE PIKLVENUE
            </span>
            <h2>Find your next court.</h2>
            <p>
              Discover pickleball venues and
              reserve your preferred playing
              time without creating an account.
            </p>
          </div>

          <Link href="/venues" className="pv-view-all">
            View all venues
            <ArrowRight size={17} />
          </Link>
        </div>

        {loading && (
          <div className="pv-empty">
            Loading available venues...
          </div>
        )}

        {error && (
          <div className="pv-empty" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="pv-book-btn"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <p className="pv-results">
              {availableVenues.length}{' '}
              {availableVenues.length === 1
                ? 'venue'
                : 'venues'}{' '}
              found
            </p>

            <div className="pv-venue-grid">
              {availableVenues.map(v => (
                <article
                  className="pv-venue-card"
                  key={v.id}
                >
                  <Link
                    href={`/venues/${v.id}`}
                    className="pv-venue-image"
                  >
                    {v.image_url ? (
                      <img
                        src={v.image_url}
                        alt={v.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="pv-image-fallback">
                        <div className="pv-mini-court" />
                        <span>PiklVenue</span>
                      </div>
                    )}

                    <span className="pv-courts-badge">
                      {v.court_count}{' '}
                      {Number(v.court_count) === 1
                        ? 'Court'
                        : 'Courts'}
                    </span>
                  </Link>

                  <div className="pv-venue-content">
                    <div className="pv-location">
                      <MapPin size={15} />
                      {v.city}
                    </div>

                    <h3>{v.name}</h3>
                    <p>{v.address}</p>

                    <div className="pv-venue-footer">
                      <div>
                        <small>Rates from</small>
                        <strong>
                          {money(Number(v.price_from))}
                          <span>/hr</span>
                        </strong>
                      </div>

                      
{Number(v.court_count) > 0 ? (
  <Link
    href={`/venues/${v.id}`}
    className="pv-book-btn"
  >
    Book Now
    <ChevronRight size={17} />
  </Link>
) : (
  <span className="pv-book-btn pv-unavailable">
    Coming Soon
  </span>
)}

                    </div>
                  </div>
                </article>
              ))}
            </div>

            {availableVenues.length === 0 && (
              <div className="pv-empty">
                <h3>No courts found</h3>
                <p>
                  Try another location or venue
                  name. New courts will appear
                  here when owners add them.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section className="pv-how">
        <div className="shell">
          <div className="pv-section-heading">
            <div>
              <span className="pv-eyebrow dark">
                SIMPLE COURT BOOKING
              </span>
              <h2>Book in three easy steps.</h2>
            </div>
          </div>

          <div className="pv-steps">
            <div className="pv-step">
              <span>01</span>
              <Search size={27} />
              <h3>Find a venue</h3>
              <p>
                Browse pickleball courts and
                compare available venues.
              </p>
            </div>

            <div className="pv-step">
              <span>02</span>
              <CalendarDays size={27} />
              <h3>Choose your time</h3>
              <p>
                Select your date and one or
                more available hourly slots.
              </p>
            </div>

            <div className="pv-step">
              <span>03</span>
              <ShieldCheck size={27} />
              <h3>Complete payment</h3>
              <p>
                Pay the venue through GCash,
                upload proof, and await
                owner confirmation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* OWNER CTA */}
      <section className="shell pv-owner-cta">
        <div>
          <span className="pv-eyebrow">
            FOR COURT OWNERS
          </span>
          <h2>Own a pickleball court?</h2>
          <p>
            List your venue, manage court
            schedules, set rates, and review
            reservations in one place.
          </p>
        </div>

        <Link
          href="/register"
          className="pv-owner-button"
        >
          List your venue
          <ArrowRight size={19} />
        </Link>
      </section>
    </main>
  );
}
