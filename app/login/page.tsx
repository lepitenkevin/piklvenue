
'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Mail, ArrowRight } from 'lucide-react';
import { request, User } from '../../lib/api';

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setBusy(true);
    setError('');

    try {
      const data = await request<{
        token: string;
        user: User;
      }>('/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      });

      // Only court owners are allowed.
      if (data.user.role !== 'owner') {
        setError(
          'Player login is temporarily disabled. You can book courts without an account.'
        );
        return;
      }

      localStorage.setItem('pv_token', data.token);
      localStorage.setItem(
        'pv_user',
        JSON.stringify(data.user)
      );

      window.dispatchEvent(new Event('pv_auth'));

      router.replace('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to log in. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="eyebrow">
          COURT OWNER ACCESS
        </div>

        <h1>
          Welcome back, <em>court owner.</em>
        </h1>

        <p>
          Log in to manage your venues, courts,
          schedules, and booking requests.
        </p>

        <form onSubmit={submit}>
          <label>
            Email address
            <div className="login-input-wrap">
              <Mail size={18} />
              <input
                type="email"
                value={email}
                onChange={e =>
                  setEmail(e.target.value)
                }
                required
                autoComplete="email"
                placeholder="owner@example.com"
              />
            </div>
          </label>

          <label>
            Password
            <div className="login-input-wrap">
              <LockKeyhole size={18} />
              <input
                type="password"
                value={password}
                onChange={e =>
                  setPassword(e.target.value)
                }
                required
                minLength={8}
                autoComplete="current-password"
                placeholder="Enter your password"
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
              'Logging in...'
            ) : (
              <>
                Log in to dashboard
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        <p className="switch-auth">
          Own a pickleball court?{' '}
          <Link href="/register">
            Register your venue
          </Link>
        </p>

        <div className="login-guest-section">
          <p>
            Looking to play? No account needed.
          </p>

          <Link
            href="/venues"
            className="btn btn-outline wide"
          >
            Browse & Book Courts
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </main>
  );
}
