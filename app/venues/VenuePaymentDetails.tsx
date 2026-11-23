import type { Venue } from '../../lib/api';

export default function VenuePaymentDetails({ venue }: {
  venue: Pick<Venue, 'gcash_number'>;
}) {
  const number = venue.gcash_number?.trim();

  if (!number) return null;

  return (
    <div className="venue-payment-preview">
      <strong>GCash number</strong>
      <span>{number}</span>
    </div>
  );
}
