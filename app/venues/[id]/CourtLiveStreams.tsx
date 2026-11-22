import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { isCourtLive, type Court } from '../../../lib/api';

const facebookHosts = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'];

function facebookUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && facebookHosts.includes(url.hostname) &&
        !url.username && !url.password && !url.port) return url;
  } catch {
    return null;
  }
  return null;
}

export default function CourtLiveStreams({ courts }: { courts: Court[] }) {
  const [playingCourt, setPlayingCourt] = useState<number | null>(null);
  const streams = courts.flatMap(court => {
    const url = facebookUrl(court.facebook_live_url);
    return url ? [{ court, url }] : [];
  });

  if (!streams.length) return null;

  return (
    <section className="court-streams" aria-labelledby="court-streams-heading">
      <h2 id="court-streams-heading">Court streams</h2>
      <ul>
        {streams.map(({ court, url }) => {
          const canEmbed = url.hostname !== 'fb.watch' && !url.pathname.startsWith('/share/');
          const isPlaying = canEmbed && playingCourt === court.id;
          const playerId = `court-stream-${court.id}`;
          const videoUrl = new URL(url);
          videoUrl.hostname = 'www.facebook.com';
          const playerParams = new URLSearchParams({ href: videoUrl.href, show_text: 'false' });
          return (
            <li key={court.id} id={`court-stream-row-${court.id}`}>
              <div className="court-stream-row">
                <h3 className="court-stream-title">
                  {court.name}
                  {isCourtLive(court) && <span className="court-live-badge">Live now</span>}
                </h3>
                <div className="court-stream-actions">
                  {canEmbed && (
                    <button
                      type="button"
                      className="btn btn-dark small"
                      aria-expanded={isPlaying}
                      aria-controls={playerId}
                      onClick={() => setPlayingCourt(isPlaying ? null : court.id)}
                    >
                      {!isPlaying && <Play size={14} aria-hidden="true" />}
                      {isPlaying ? 'Close player' : 'Watch here'}
                    </button>
                  )}
                  <a className="btn btn-outline small" href={url.href} target="_blank" rel="noopener noreferrer">
                    Watch on Facebook <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
              {canEmbed && (
                <div id={playerId} hidden={!isPlaying}>
                  {isPlaying && (
                    <iframe
                      className="court-stream-player"
                      src={`https://www.facebook.com/plugins/video.php?${playerParams}`}
                      title={`Facebook Live video for ${court.name}`}
                      allow="encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
