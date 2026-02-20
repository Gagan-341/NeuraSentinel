import { Link, useNavigate, useParams } from 'react-router-dom';
import { resolveShotName, shotGuideEntries, shotGuides, toShotSlug } from '../data/shotGuides';

function toExternalVideoUrl(embedUrl: string): string {
  const match = embedUrl.match(/\/embed\/([^?&]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }
  return embedUrl;
}

function getYoutubeThumbnail(embedUrl: string): string | null {
  const match = embedUrl.match(/\/embed\/([^?&]+)/);
  if (match && match[1]) {
    return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  return null;
}

export function TutorialPage() {
  const { shotName } = useParams<{ shotName: string }>();
  const canonicalShot = resolveShotName(shotName);
  const navigate = useNavigate();

  if (!canonicalShot) {
    return (
      <section className="dashboard">
        <h2>Shot tutorial</h2>
        <p>We couldn’t find that shot. Please return to the dashboard and pick a valid stroke.</p>
        <Link className="btn btn-primary" to="/dashboard">
          Back to dashboard
        </Link>
      </section>
    );
  }

  const guide = shotGuides[canonicalShot];
  const slug = toShotSlug(canonicalShot);
  const externalVideoUrl = toExternalVideoUrl(guide.videoUrl);
  const thumbnailUrl = getYoutubeThumbnail(guide.videoUrl);

  return (
    <section className="dashboard">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ color: '#FF8C32', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Shot tutorial</p>
          <h2 style={{ marginBottom: 8 }}>{canonicalShot}</h2>
          <p style={{ color: '#a9acb2', maxWidth: 520 }}>Master the mechanics, then jump straight into a focused session just for this shot.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
          <button className="btn btn-primary" onClick={() => navigate(`/practice/${slug}`)}>
            Start focused session
          </button>
        </div>
      </div>

      <div className="result-card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>{guide.title}</h3>
        <a
          href={externalVideoUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'block',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: '#000',
          }}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={`${canonicalShot} tutorial video`}
              style={{ width: '100%', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e5e7eb',
              }}
            >
              Open tutorial on YouTube
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '999px',
                backgroundColor: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: '18px solid white',
                  marginLeft: 4,
                }}
              />
            </div>
          </div>
        </a>
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
          Tap the card to open the full tutorial on YouTube.
        </p>
      </div>

      <div className="result-card" style={{ marginTop: '1.25rem' }}>
        <h3>Technique checklist</h3>
        <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.6 }}>
          {guide.steps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="result-card" style={{ marginTop: '1.25rem' }}>
        <h3>Drills to run</h3>
        <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
          {guide.drills.map((drill, idx) => (
            <li key={idx}>{drill}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '0.75rem' }}
          onClick={() => navigate(`/practice/${slug}`)}
        >
          Start practice for this shot
        </button>
      </div>

      <div className="result-card" style={{ marginTop: '1.25rem' }}>
        <h3>Common mistakes to avoid</h3>
        <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
          {guide.mistakes.map((issue, idx) => (
            <li key={idx}>{issue}</li>
          ))}
        </ul>
      </div>

      <div className="result-card" style={{ marginTop: '1.25rem' }}>
        <h3>More tutorials</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {shotGuideEntries
            .filter((entry) => entry.name !== canonicalShot)
            .map(({ name, slug: otherSlug, guide: otherGuide }) => (
              <button
                key={name}
                className="shot-card"
                style={{ textAlign: 'left', borderLeft: '3px solid transparent' }}
                onClick={() => navigate(`/tutorial/${otherSlug}`)}
              >
                <p style={{ color: '#FF8C32', fontSize: '0.75rem', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{name}</p>
                <strong>{otherGuide.title}</strong>
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
