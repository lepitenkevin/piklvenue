
'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UserRound,
  Mail,
  Phone,
  LockKeyhole,
  ArrowRight,
  Building2,
} from 'lucide-react';

import { request, User } from '../../lib/api';

export default function Register() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (busy) return;

    setBusy(true);
    setError('');

    try {
      const data = await request<{
        token: string;
        user: User;
      }>('/register', {
        method: 'POST',
        body: JSON.stringify({
          role: 'owner',
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
        }),
      });

      if (data.user.role !== 'owner') {
        throw new Error('Invalid account type returned by server.');
      }

      localStorage.setItem('pv_token', data.token);
      localStorage.setItem('pv_user', JSON.stringify(data.user));

      window.dispatchEvent(new Event('pv_auth'));

      router.replace('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create your account.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="eyebrow">
          PIKLVENUE FOR COURT OWNERS
        </div>

        <h1>
          List your court.
          <br />
          <em>Grow your bookings.</em>
        </h1>

        <p>
          Create a court-owner account to manage your venues,
          schedules, rates, and reservations.
        </p>

        <div className="owner-register-banner">
          <Building2 size={24} />
          <div>
            <strong>Court Owner Registration</strong>
            <span>
              Manage multiple venues and courts from one dashboard.
            </span>
          </div>
        </div>

        <form onSubmit={submit}>
          <label>
            Full name
            <div className="register-input-wrap">
              <UserRound size={18} />
              <input
                type="text"
                required
                maxLength={150}
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
          </label>

          <label>
            Email address
            <div className="register-input-wrap">
              <Mail size={18} />
              <input
                type="email"
                required
                maxLength={190}
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="owner@example.com"
              />
            </div>
          </label>

          <label>
            Contact number
            <div className="register-input-wrap">
              <Phone size={18} />
              <input
                type="tel"
                required
                maxLength={32}
                autoComplete="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="09XXXXXXXXX"
              />
            </div>
          </label>

          <label>
            Password
            <div className="register-input-wrap">
              <LockKeyhole size={18} />
              <input
                type="password"
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          </label>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn btn-dark wide"
          >
            {busy ? (
              'Creating account...'
            ) : (
              <>
                Create Court Owner Account
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        <p className="switch-auth">
          Already have an account?{' '}
          <Link href="/login">Log in</Link>
        </p>

        <div className="register-guest-section">
          <p>
            Looking to play pickleball? No account needed.
          </p>

          <Link
            href="/venues"
            className="btn btn-outline wide"
          >
            Browse Available Courts
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </main>
  );
}
