import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Mail, MapPin } from 'lucide-react';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Contact | PiklVenue',
  description: 'Get help with a reservation, find your venue, or contact the PiklVenue developer.',
};

export default function ContactPage() {
  const contactEmail = process.env.CONTACT_EMAIL?.trim();

  return (
    <main className={styles.page}>
      <div className="shell">
        <header className={styles.intro}>
          <h1>Contact PiklVenue</h1>
          <p>Get help with a booking, find your venue’s contact details, or report a technical issue to the developer.</p>
        </header>

        <div className={styles.cards}>
          <section className={styles.card}>
            <CalendarDays className={styles.icon} aria-hidden="true" />
            <h2>Booking help</h2>
            <p>Check your reservation status or find your booking reference in My bookings.</p>
            <Link className="btn btn-outline" href="/dashboard">View my bookings</Link>
          </section>

          <section className={styles.card}>
            <MapPin className={styles.icon} aria-hidden="true" />
            <h2>Contact a venue</h2>
            <p>For payment confirmation, court rules, or directions, open your venue’s listing for its contact details when available.</p>
            <Link className="btn btn-outline" href="/venues">Find your venue</Link>
          </section>

          <section className={styles.card}>
            <Mail className={styles.icon} aria-hidden="true" />
            <h2>Contact the developer</h2>
            <p>Reach Kevin Victor Lepiten for website issues or feedback about PiklVenue.</p>
            <div className={styles.actions}>
              <a className="btn btn-outline" href="https://kevinlepiten.com/#contact">Contact Kevin</a>
              {contactEmail && <a className={styles.email} href={`mailto:${contactEmail}`}>Email Kevin</a>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
