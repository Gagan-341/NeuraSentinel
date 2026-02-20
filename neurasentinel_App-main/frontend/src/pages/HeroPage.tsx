import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fetchSessionStats } from '../services/api';
import { shotGuides, toShotSlug } from '../data/shotGuides';

const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'practice_session';

interface FocusShot {
  shot: string;
  accuracy: number;
  swings: number;
  steps: string[];
  message: string;
}

function buildFocusMessage(accuracy: number, shot: string): string {
  const pct = accuracy * 100;
  if (pct >= 90) {
    return `${shot} is elite. Keep it sharp with short, high-intensity reps and vary placement.`;
  }
  if (pct >= 75) {
    return `Great base. Push ${shot} accuracy toward 85% by running 3 sets of 15 consistent swings.`;
  }
  return `Focus on clean contact. Slow down the ${shot}, keep balance, and gradually add power once timing feels solid.`;
}

export function HeroPage() {
  const [focus, setFocus] = useState<FocusShot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadFocus() {
      try {
        const stats = await fetchSessionStats(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
        if (!mounted) return;
        if (!stats.shots.length) {
          setFocus(null);
          setLoading(false);
          return;
        }
        const weakest = stats.shots.reduce((min, shot) => {
          if (!min) return shot;
          return shot.average_confidence < min.average_confidence ? shot : min;
        });
        const guide = shotGuides[weakest.shot_type] ?? {
          steps: ['Stay balanced and focus on clean contact.', 'Keep the swing compact.', 'Recover quickly for the next ball.'],
        };
        setFocus({
          shot: weakest.shot_type,
          accuracy: weakest.average_confidence,
          swings: weakest.count,
          steps: guide.steps.slice(0, 3),
          message: buildFocusMessage(weakest.average_confidence, weakest.shot_type),
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load training focus.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void loadFocus();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="hero">
      <motion.div
        className="hero-content"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <h1 className="page-title">NeuraSentinel</h1>
        <p className="section-subtitle">
          AI-Powered Table Tennis Training. Transform every swing into instant feedback and build consistent,
          powerful strokes.
        </p>
        <div className="hero-actions">
          <Link to="/dashboard" className="btn btn-primary">
            Start Practicing
          </Link>
          <Link to="/analytics" className="btn btn-secondary">
            View AI Analytics
          </Link>
          <Link to="/device" className="btn btn-secondary">
            Connect Device
          </Link>
        </div>
      </motion.div>

      <motion.div
        className="result-card"
        style={{ marginTop: '2rem', width: '100%', maxWidth: '640px' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 }}
      >
        <h3>Today’s Training Focus</h3>
        {loading && <p style={{ color: '#9ca3af' }}>Crunching your latest swings...</p>}
        {!loading && error && <p className="error-text">{error}</p>}
        {!loading && !error && !focus && (
          <p style={{ color: '#9ca3af' }}>
            Stream a few swings from your phone to unlock personalised practice goals.
          </p>
        )}
        {focus && (
          <>
            <p style={{ marginBottom: '0.25rem' }}>
              <strong>{focus.shot}</strong> — {(focus.accuracy * 100).toFixed(1)}% accuracy across {focus.swings}{' '}
              swings
            </p>
            <p style={{ marginBottom: '0.75rem', color: '#d1d5db' }}>{focus.message}</p>
            <h4 style={{ marginBottom: '0.5rem' }}>3-step tune-up</h4>
            <ol style={{ paddingLeft: '1.25rem', marginBottom: '1rem', lineHeight: 1.6 }}>
              {focus.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to={`/tutorial/${toShotSlug(focus.shot)}`} className="btn btn-primary">
                View drills
              </Link>
              <Link to="/device" className="btn btn-secondary">
                Start phone streaming
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </section>
  );
}
