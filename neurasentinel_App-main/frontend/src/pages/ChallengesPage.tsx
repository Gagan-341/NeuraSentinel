import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchChallenges, Challenge } from '../services/api';
import { toShotSlug } from '../data/shotGuides';

const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'practice_session';

function statusLabel(status: Challenge['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Not started';
}

export function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Challenge['status']>('all');
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchChallenges(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
        setChallenges(data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load challenges.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filteredChallenges = useMemo(() => {
    if (statusFilter === 'all') return challenges;
    return challenges.filter((c) => c.status === statusFilter);
  }, [challenges, statusFilter]);

  const dailyMissions = useMemo(() => {
    return challenges.slice(0, 3).map((mission) => ({
      id: mission.id,
      title: mission.title,
      summary: `${(mission.current_accuracy ?? 0) * 100 >= mission.target_accuracy * 100 ? 'Maintain' : 'Reach'} ${(mission.target_accuracy * 100).toFixed(0)}% on ${mission.target_shot}.`,
      progress: mission.progress,
      status: mission.status,
    }));
  }, [challenges]);

  const completedCount = useMemo(
    () => challenges.filter((c) => c.status === 'completed').length,
    [challenges],
  );

  const inProgressCount = useMemo(
    () => challenges.filter((c) => c.status === 'in_progress').length,
    [challenges],
  );

  const notStartedCount = useMemo(
    () => challenges.filter((c) => c.status === 'not_started').length,
    [challenges],
  );

  const suggestedChallenge = useMemo(() => {
    if (!challenges.length) return null;
    const candidates = challenges.filter((c) => c.status !== 'completed');
    if (!candidates.length) return null;

    let weakest: Challenge | null = null;
    for (const ch of candidates) {
      const acc = ch.current_accuracy ?? 0;
      if (!weakest || acc < (weakest.current_accuracy ?? 0)) {
        weakest = ch;
      }
    }
    return weakest;
  }, [challenges]);

  return (
    <section className="challenges">
      <h2 className="page-title">Challenges</h2>
      <p className="section-subtitle" style={{ marginBottom: '0.75rem' }}>
        Turn your practice into a game. Complete missions, follow AI-suggested goals, and track your
        progress across all eight core shots.
      </p>
      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {dailyMissions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Daily missions</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.4rem' }}>
            Complete these quick goals today to keep your momentum going.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {dailyMissions.map((mission) => {
              const completed = mission.status === 'completed';
              const progressPct = Math.max(0, Math.min(1, mission.progress)) * 100;
              return (
                <div
                  key={mission.id}
                  style={{
                    flex: '1 1 220px',
                    borderRadius: '0.75rem',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.75rem',
                    background: 'var(--surface)',
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{mission.title}</p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-soft)', marginBottom: '0.4rem' }}>
                    {mission.summary}
                  </p>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '999px',
                      background: 'hsl(0 0% 92%)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${progressPct}%`,
                        height: '100%',
                        background: completed ? '#22c55e' : '#f97316',
                        transition: 'width 0.2s ease-out',
                      }}
                    />
                  </div>
                  <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>
                    {completed ? '✓ Completed' : `${progressPct.toFixed(0)}% towards goal`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {challenges.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Challenge summary</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.4rem' }}>
            A quick overview of your challenge progress.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <p>
              <strong>Completed:</strong> {completedCount}
            </p>
            <p>
              <strong>In progress:</strong> {inProgressCount}
            </p>
            <p>
              <strong>Not started:</strong> {notStartedCount}
            </p>
          </div>
        </div>
      )}

      {suggestedChallenge && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>AI-suggested challenge</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.4rem' }}>
            Based on your current stats, this is the best challenge to focus on next.
          </p>
          <p style={{ marginBottom: '0.25rem' }}>
            <strong>{suggestedChallenge.title}</strong>
          </p>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Weakest shot: {suggestedChallenge.target_shot} · Current accuracy:{' '}
            {suggestedChallenge.current_accuracy != null
              ? `${(suggestedChallenge.current_accuracy * 100).toFixed(1)}%`
              : 'not recorded yet'}
          </p>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Goal: reach {(suggestedChallenge.target_accuracy * 100).toFixed(0)}% accuracy on{' '}
            {suggestedChallenge.target_shot} with confident, repeatable swings.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            onClick={() => navigate(`/practice/${toShotSlug(suggestedChallenge.target_shot)}`)}
          >
            Start focused practice
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <h3 style={{ margin: 0 }}>Challenge board</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Filter:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'rgba(15,23,42,0.9)',
              color: '#e5e7eb',
            }}
          >
            <option value="all">All</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="challenges-grid">
        {filteredChallenges.map((c) => {
          const progressPct = Math.max(0, Math.min(1, c.progress)) * 100;
          const statusEmoji =
            c.status === 'completed' ? '🟢' : c.status === 'in_progress' ? '🟡' : '🔴';
          return (
            <article key={c.id} className="challenge-card">
              <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{c.title}</span>
                <span style={{ fontSize: '0.85rem' }}>{statusEmoji}</span>
              </h3>
              <p style={{ marginBottom: '0.25rem' }}>
                <strong>Target shot:</strong> {c.target_shot}
              </p>
              <p style={{ marginBottom: '0.25rem' }}>
                <strong>Target accuracy:</strong> {(c.target_accuracy * 100).toFixed(0)}%
              </p>
              {typeof c.current_accuracy === 'number' && (
                <p style={{ marginBottom: '0.25rem', fontSize: '0.9rem', color: '#6b7280' }}>
                  Current: {(c.current_accuracy * 100).toFixed(1)}% ({c.current_swings ?? 0} swings)
                </p>
              )}
              <p style={{ marginBottom: '0.35rem', fontSize: '0.9rem' }}>{c.description}</p>
              <div
                style={{
                  marginTop: '0.15rem',
                  width: '100%',
                  height: '6px',
                  borderRadius: '999px',
                  background: 'hsl(0 0% 92%)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: c.status === 'completed' ? '#22c55e' : '#f97316',
                    transition: 'width 0.2s ease-out',
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '0.6rem', padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => navigate(`/practice/${toShotSlug(c.target_shot)}`)}
              >
                Practice this shot
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
