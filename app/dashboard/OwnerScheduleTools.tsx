
'use client';

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import { request } from '../../lib/api';

type Slot = {
  court_id: number;
  hour: number;
  price: number;
  status: 'available' | 'booked' | 'blocked' | 'closed';
};

type Mode = 'walkin' | 'block';

type Props = {
  venueId: number;
  courtId: number;
  onSaved?: () => void | Promise<void>;
};

function formatHour(hour: number) {
  const normalized = hour % 24;
  const period = normalized < 12 ? 'AM' : 'PM';
  const twelve = normalized % 12 || 12;

  return `${twelve}:00 ${period}`;
}

export default function OwnerScheduleTools({
  venueId,
  courtId,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<Mode>('walkin');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSlots = useCallback(async () => {
    if (!venueId || !courtId || !date) {
      setSlots([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await request<{ slots: Slot[] }>(
        `/availability?venue_id=${venueId}` +
        `&date=${encodeURIComponent(date)}`
      );

      setSlots(
        result.slots.filter(
          slot => Number(slot.court_id) === courtId
        )
      );
    } catch (err) {
      setSlots([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load availability'
      );
    } finally {
      setLoading(false);
    }
  }, [venueId, courtId, date]);

  useEffect(() => {
    setSelected([]);
    setSuccess('');
    void loadSlots();
  }, [loadSlots]);

  function toggleHour(hour: number) {
    setSelected(current =>
      current.includes(hour)
        ? current.filter(item => item !== hour)
        : [...current, hour].sort((a, b) => a - b)
    );

    setSuccess('');
  }

  const total = slots
    .filter(slot => selected.includes(slot.hour))
    .reduce((sum, slot) => sum + Number(slot.price), 0);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selected.length || saving) return;

    setError('');
    setSuccess('');
    setSaving(true);

    try {
      if (mode === 'block') {
        await request('/owner/blocked-slots/batch', {
          method: 'POST',
          body: JSON.stringify({
            court_id: courtId,
            booking_date: date,
            selected_hours: selected,
          }),
        });

        setSuccess('Selected hours blocked successfully.');
      } else {
        const result = await request<{
          booking_id: number;
          total_amount: number;
        }>('/owner/walkin-bookings', {
          method: 'POST',
          body: JSON.stringify({
            court_id: courtId,
            booking_date: date,
            selected_hours: selected,
            full_name: name.trim(),
            email: email.trim(),
            contact_number: phone.trim(),
          }),
        });

        setSuccess(
          `Walk-in booking #${result.booking_id} confirmed.`
        );

        setName('');
        setEmail('');
        setPhone('');
      }

      setSelected([]);
      await loadSlots();
      await onSaved?.();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save your changes'
      );

      // Refresh after a conflict to show newly taken slots.
      await loadSlots();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="owner-schedule">
      <div className="eyebrow">
        COURT AVAILABILITY
      </div>

      <h2>Manage court schedule</h2>

      <p>
        Block exact hours or enter confirmed walk-in
        reservations without requiring online payment.
      </p>

      <div className="schedule-mode">
        <button
          type="button"
          className={mode === 'walkin' ? 'active' : ''}
          onClick={() => {
            setMode('walkin');
            setSuccess('');
          }}
        >
          Walk-in Booking
        </button>

        <button
          type="button"
          className={mode === 'block' ? 'active' : ''}
          onClick={() => {
            setMode('block');
            setSuccess('');
          }}
        >
          Block Time
        </button>
      </div>

      <form onSubmit={save}>
        <label className="schedule-date-label">
          Booking date
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>

        {loading && <p>Loading available hours...</p>}

        {!loading && date && (
          <div className="schedule-grid">
            {slots.map(slot => {
              const available = slot.status === 'available';
              const isSelected = selected.includes(slot.hour);

              return (
                <button
                  key={slot.hour}
                  type="button"
                  disabled={!available || saving}
                  className={[
                    'schedule-slot',
                    isSelected ? 'selected' : '',
                    !available ? 'unavailable' : '',
                  ].join(' ')}
                  onClick={() => toggleHour(slot.hour)}
                >
                  <strong>
                    {formatHour(slot.hour)}
                    {' – '}
                    {formatHour(slot.hour + 1)}
                  </strong>

                  <span>
                    {isSelected
                      ? 'Selected'
                      : available
                        ? `₱${Number(slot.price).toFixed(2)}`
                        : slot.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div className="schedule-summary">
            <strong>
              {selected.length} hour(s) selected
            </strong>

            <span>
              {selected.map(formatHour).join(', ')}
            </span>

            {mode === 'walkin' && (
              <strong>
                Total: ₱{total.toFixed(2)}
              </strong>
            )}
          </div>
        )}

        {mode === 'walkin' && (
          <div className="schedule-customer">
            <h3>Walk-in customer</h3>

            <label>
              Full name
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Customer name"
                maxLength={150}
              />
            </label>

            <label>
              Contact number (optional)
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="09XXXXXXXXX"
                maxLength={32}
              />
            </label>

            <label>
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="customer@example.com"
                maxLength={190}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <p className="schedule-success" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={
            saving ||
            loading ||
            !date ||
            !selected.length
          }
          className="btn btn-dark wide"
        >
          {saving
            ? 'Saving...'
            : mode === 'walkin'
              ? 'Confirm Walk-in Booking'
              : 'Block Selected Hours'}
        </button>
      </form>
    </section>
  );
}
