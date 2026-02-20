import { useEffect, useState } from 'react';
import { fetchPlayerHistory, PlayerHistoryResponse, ShotStats } from '../services/api';

function summarizeShots(shots: ShotStats[]): { avgAccuracy: number; avgSpeed: number } {
  if (shots.length === 0) return { avgAccuracy: 0, avgSpeed: 0 };
  let totalCount = 0;
  let sumAccuracy = 0;
  let sumSpeed = 0;
  for (const s of shots) {
    totalCount += s.count;
    sumAccuracy += s.average_confidence * s.count;
    sumSpeed += s.average_speed_mps * s.count;
  }
  return {
    avgAccuracy: totalCount ? sumAccuracy / totalCount : 0,
    avgSpeed: totalCount ? sumSpeed / totalCount : 0,
  };
}

function computePerformanceScore(
  accuracy: number,
  avgSpeed: number,
  totalSwings: number,
): {
  totalScore: number;
  label: string;
  accuracyScore: number;
  speedScore: number;
  volumeScore: number;
} {
  const accuracyScore = accuracy * 100;
  const speedScore = Math.min(avgSpeed / 35, 1) * 100;
  const volumeScore = Math.min(totalSwings / 80, 1) * 100;
  const totalScore = Math.round(accuracyScore * 0.6 + speedScore * 0.25 + volumeScore * 0.15);

  let label: string;
  if (totalScore >= 85) label = 'Elite';
  else if (totalScore >= 70) label = 'Advanced';
  else if (totalScore >= 50) label = 'Intermediate';
  else label = 'Foundation';

  return { totalScore, label, accuracyScore, speedScore, volumeScore };
}

function getShotStatus(accuracy: number): { label: string; color: string } {
  const pct = accuracy * 100;
  if (pct >= 85) {
    return { label: 'Strong', color: '#34d399' };
  }
  if (pct >= 70) {
    return { label: 'Stable', color: '#fbbf24' };
  }
  return { label: 'Needs work', color: '#f87171' };
}

export function AnalyticsPage() {
  const [playerId, setPlayerId] = useState('practice_player');
  const [history, setHistory] = useState<PlayerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPlayerHistory(playerId);
        setHistory(data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [playerId]);

  const sessions = history?.sessions ?? [];
  const latest = sessions[sessions.length - 1];
  const previous = sessions.length > 1 ? sessions[sessions.length - 2] : undefined;

  const latestSummary = latest ? summarizeShots(latest.shots) : { avgAccuracy: 0, avgSpeed: 0 };
  const prevSummary = previous ? summarizeShots(previous.shots) : { avgAccuracy: 0, avgSpeed: 0 };

  const accuracyDelta = latestSummary.avgAccuracy - prevSummary.avgAccuracy;
  const speedDelta = latestSummary.avgSpeed - prevSummary.avgSpeed;

  // Aggregate overall stats across all sessions
  let overallCount = 0;
  let overallAccSum = 0;
  for (const session of sessions) {
    for (const shot of session.shots) {
      overallCount += shot.count;
      overallAccSum += shot.average_confidence * shot.count;
    }
  }
  const overallAccuracy = overallCount ? overallAccSum / overallCount : 0;

  // Swings per session for performance score
  const latestSwings = latest ? latest.shots.reduce((sum, s) => sum + s.count, 0) : 0;
  const latestPerformance = latest
    ? computePerformanceScore(latestSummary.avgAccuracy, latestSummary.avgSpeed, latestSwings)
    : null;

  function renderDeltaLabel(delta: number, unit: string): string {
    if (!previous) return 'no previous data';
    const pct = delta * 100;
    if (Math.abs(pct) < 1e-3) return `no change in ${unit}`;
    if (delta > 0) return `${pct.toFixed(1)}% increase in ${unit}`;
    return `${(-pct).toFixed(1)}% decrease in ${unit}`;
  }

  const accuracyTimeline = sessions.map((session, idx) => {
    const summary = summarizeShots(session.shots);
    return {
      idx,
      label: session.session_id || `Session ${idx + 1}`,
      accuracy: summary.avgAccuracy * 100,
    };
  });

  const hasTimeline = accuracyTimeline.length > 0;
  const minAccuracy = hasTimeline
    ? accuracyTimeline.reduce((min, point) => Math.min(min, point.accuracy), Number.POSITIVE_INFINITY)
    : 0;
  const maxAccuracy = hasTimeline
    ? accuracyTimeline.reduce((max, point) => Math.max(max, point.accuracy), 0)
    : 0;
  const baseAccuracy = isFinite(minAccuracy) ? minAccuracy : 0;
  const accuracyRange = hasTimeline ? Math.max(5, maxAccuracy - baseAccuracy) : 5;

  const speedTimeline = sessions.map((session, idx) => {
    const summary = summarizeShots(session.shots);
    return {
      idx,
      label: session.session_id || `Session ${idx + 1}`,
      speed: summary.avgSpeed,
    };
  });

  const hasSpeedTimeline = speedTimeline.length > 0;
  const minSpeed = hasSpeedTimeline
    ? speedTimeline.reduce((min, point) => Math.min(min, point.speed), Number.POSITIVE_INFINITY)
    : 0;
  const maxSpeed = hasSpeedTimeline
    ? speedTimeline.reduce((max, point) => Math.max(max, point.speed), 0)
    : 0;
  const baseSpeed = isFinite(minSpeed) ? minSpeed : 0;
  const speedRange = hasSpeedTimeline ? Math.max(1, maxSpeed - baseSpeed) : 1;

  const perShotTimeline: Record<string, number[]> = {};
  const perShotSwings: Record<string, number> = {};
  for (const session of sessions) {
    for (const shot of session.shots) {
      if (!perShotTimeline[shot.shot_type]) {
        perShotTimeline[shot.shot_type] = [];
        perShotSwings[shot.shot_type] = 0;
      }
      perShotTimeline[shot.shot_type].push(shot.average_confidence);
      perShotSwings[shot.shot_type] += shot.count;
    }
  }

  const shotEvolution = Object.entries(perShotTimeline)
    .map(([shotType, accuracies]) => {
      const firstAcc = accuracies[0] ?? 0;
      const lastAcc = accuracies[accuracies.length - 1] ?? 0;
      const delta = lastAcc - firstAcc;
      const n = accuracies.length;
      let consistencyScore = 0;
      if (n <= 1) {
        // Limited data, but we still give a neutral consistency score.
        consistencyScore = 70;
      } else {
        const mean = accuracies.reduce((sum, a) => sum + a, 0) / n;
        const variance = accuracies.reduce((sum, a) => sum + (a - mean) * (a - mean), 0) / n;
        const stdDev = Math.sqrt(variance);
        // Lower variance → higher consistency. Clamp so values stay in a reasonable 0–100 range.
        consistencyScore = Math.max(0, 100 - Math.min(stdDev * 100, 40));
      }
      return {
        shotType,
        firstAcc,
        lastAcc,
        delta,
        consistencyScore,
        swings: perShotSwings[shotType] ?? 0,
      };
    })
    .sort((a, b) => b.swings - a.swings);

  function renderAIFeedback(): string {
    if (!latest || latest.shots.length === 0) {
      return 'No swings recorded yet. Start a relaxed practice session on the dashboard and focus on smooth, consistent motion first.';
    }

    const primaryShot = [...latest.shots].sort((a, b) => b.count - a.count)[0];
    const accPct = latestSummary.avgAccuracy * 100;

    if (!previous) {
      if (accPct >= 90) {
        return `Amazing start! Your overall accuracy is ${accPct.toFixed(
          1,
        )}%. Keep reinforcing your ${primaryShot.shot_type} and slowly add more advanced variations when you feel comfortable.`;
      }
      if (accPct >= 75) {
        return `Great foundation. You already have solid accuracy—keep polishing your ${primaryShot.shot_type} by focusing on smooth swings and a relaxed grip.`;
      }
      return `You are at the beginning of a strong journey. Start with controlled ${primaryShot.shot_type} swings at lower speed and celebrate small improvements as your form gets more stable.`;
    }

    if (accuracyDelta > 0.02) {
      return `Nice improvement! Your average accuracy improved by ${(
        accuracyDelta * 100
      ).toFixed(1)}% compared to your last session. Whatever you changed is working—keep that routine and add a few fun challenges to push your stronger shots even further.`;
    }

    if (accuracyDelta < -0.02) {
      return `Today was a slightly tougher session: accuracy was ${(-accuracyDelta * 100).toFixed(
        1,
      )}% lower than last time, which is totally normal. Try a slower pace next time and focus on clean, repeatable ${primaryShot.shot_type} swings—your consistency will come back quickly.`;
    }

    return `Your accuracy is stable compared to your last session—a good sign of consistency. For your next session, set a small goal: pick one shot (e.g. ${primaryShot.shot_type}) and aim for a 5–10% accuracy boost while keeping your swing relaxed.`;
  }

  return (
    <section className="profile">
      <h2 className="page-title">AI Analytics</h2>
      <p className="section-subtitle" style={{ marginBottom: '1rem' }}>
        Deep dive into your performance trends. Compare sessions and get encouraging AI feedback on how
        your game is evolving.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          alignItems: 'center',
        }}
      >
        <label style={{ fontSize: '0.9rem' }}>
          <span style={{ marginRight: '0.4rem' }}>Player name:</span>
          <input
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value.trim() || 'practice_player')}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid rgba(148, 163, 184, 0.7)',
              background: 'rgba(15, 23, 42, 0.9)',
              color: '#e5e7eb',
            }}
          />
        </label>
      </div>

      {loading && <p>Loading analytics...</p>}
      {error && <p className="error-text">{error}</p>}

      {history && history.sessions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Overall Trends</h3>
          <p>
            <strong>Total sessions:</strong> {history.sessions.length}
          </p>
          <p>
            <strong>Total swings (all sessions):</strong> {overallCount}
          </p>
          <p>
            <strong>Overall accuracy:</strong> {(overallAccuracy * 100).toFixed(1)}%
          </p>
        </div>
      )}

      {latest && latestPerformance && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Latest Performance Score</h3>
          <p style={{ marginBottom: '0.5rem' }}>
            Session: <strong>{latest.session_id || '(current practice session)'}</strong>
          </p>
          <p>
            <strong>Performance score:</strong> {latestPerformance.totalScore} ({latestPerformance.label})
          </p>
          <p style={{ marginTop: '0.4rem', fontSize: '0.9rem', color: '#6b7280' }}>
            Accuracy {latestPerformance.accuracyScore.toFixed(0)} · Power {latestPerformance.speedScore.toFixed(0)} ·
            Volume {latestPerformance.volumeScore.toFixed(0)}
          </p>
        </div>
      )}

      {history && history.sessions.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>AI Feedback</h3>
          <p>{renderAIFeedback()}</p>
          {previous && (
            <>
              <p style={{ marginTop: '0.5rem', color: '#9ca3af' }}>
                Overall accuracy: {(latestSummary.avgAccuracy * 100).toFixed(1)}% (last session:{' '}
                {(prevSummary.avgAccuracy * 100).toFixed(1)}%)
              </p>
              <p style={{ marginTop: '0.25rem', color: '#9ca3af' }}>
                Accuracy trend: {renderDeltaLabel(accuracyDelta, 'accuracy')}
              </p>
              <p style={{ marginTop: '0.25rem', color: '#9ca3af' }}>
                Speed trend: {renderDeltaLabel(speedDelta, 'speed')}
              </p>
            </>
          )}
        </div>
      )}

      {history && history.sessions.length > 1 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Accuracy Trend</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.75rem' }}>
            Session-by-session accuracy. Bars grow as your swing quality improves.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', minHeight: 140 }}>
            {accuracyTimeline.map((point) => {
              const base = isFinite(minAccuracy) ? minAccuracy : 0;
              const relative = accuracyRange ? (point.accuracy - base) / accuracyRange : 0;
              const height = 40 + Math.max(0, relative) * 90;
              const isLatest = latest && point.idx === sessions.length - 1;
              return (
                <div key={point.idx} style={{ textAlign: 'center', minWidth: 48 }}>
                  <div
                    style={{
                      height,
                      borderRadius: '0.5rem 0.5rem 0 0',
                      background: isLatest ? '#6366f1' : '#1f2937',
                      border: isLatest ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(55,65,81,0.6)',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <p style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>{point.accuracy.toFixed(1)}%</p>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{point.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history && history.sessions.length > 1 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Speed Trend</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.75rem' }}>
            Average swing speed per session. Aim for smooth increases without losing control.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', minHeight: 140 }}>
            {speedTimeline.map((point) => {
              const base = isFinite(minSpeed) ? minSpeed : 0;
              const relative = speedRange ? (point.speed - base) / speedRange : 0;
              const height = 40 + Math.max(0, relative) * 90;
              const isLatest = latest && point.idx === sessions.length - 1;
              return (
                <div key={point.idx} style={{ textAlign: 'center', minWidth: 48 }}>
                  <div
                    style={{
                      height,
                      borderRadius: '0.5rem 0.5rem 0 0',
                      background: isLatest ? '#f97316' : '#e5e7eb',
                      border: isLatest ? '1px solid rgba(248,113,113,0.7)' : '1px solid rgba(209,213,219,0.9)',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <p style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>{point.speed.toFixed(2)} m/s</p>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{point.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history && history.sessions.length > 0 && shotEvolution.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Shot Evolution & Consistency</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>
            See how each stroke is evolving across sessions and how stable your accuracy is.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {shotEvolution.map((entry) => (
              <div
                key={entry.shotType}
                style={{
                  flex: '1 1 220px',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  background: 'rgba(249,250,251,0.9)',
                }}
              >
                <p style={{ marginBottom: '0.25rem' }}>
                  <strong>{entry.shotType}</strong>
                </p>
                <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.25rem' }}>
                  First session: {(entry.firstAcc * 100).toFixed(1)}% · Latest: {(entry.lastAcc * 100).toFixed(1)}%
                </p>
                <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.25rem' }}>
                  Change: {entry.delta >= 0 ? '+' : ''}{(entry.delta * 100).toFixed(1)}%
                </p>
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>Swings tracked: {entry.swings}</p>
                <div style={{ marginTop: '0.4rem' }}>
                  <p style={{ fontSize: '0.8rem', marginBottom: '0.15rem', color: '#6b7280' }}>Consistency score</p>
                  <div
                    style={{
                      width: '100%',
                      height: 6,
                      borderRadius: 999,
                      background: '#e5e7eb',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, entry.consistencyScore)).toFixed(0)}%`,
                        height: '100%',
                        background:
                          entry.consistencyScore >= 80
                            ? '#22c55e'
                            : entry.consistencyScore >= 60
                            ? '#fbbf24'
                            : '#f97316',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history && history.sessions.length > 0 && latest && latest.shots.length > 0 && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Shot Breakdown (latest session)</h3>
          <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>
            Identify which strokes are strongest and which ones to polish next.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {[...latest.shots]
              .sort((a, b) => b.average_confidence - a.average_confidence)
              .map((shot) => {
                const status = getShotStatus(shot.average_confidence);
                return (
                  <div
                    key={shot.shot_type}
                    style={{
                      flex: '1 1 220px',
                      border: '1px solid rgba(148,163,184,0.3)',
                      borderRadius: '0.75rem',
                      padding: '0.75rem',
                      background: 'rgba(15,23,42,0.6)',
                    }}
                  >
                    <p style={{ marginBottom: '0.35rem' }}>
                      <strong>{shot.shot_type}</strong>
                    </p>
                    <p style={{ fontSize: '0.9rem' }}>
                      Accuracy: {(shot.average_confidence * 100).toFixed(1)}%
                    </p>
                    <p style={{ fontSize: '0.9rem' }}>Avg speed: {shot.average_speed_mps.toFixed(2)} m/s</p>
                    <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Swings: {shot.count}</p>
                    <span
                      style={{
                        marginTop: '0.5rem',
                        display: 'inline-block',
                        padding: '0.15rem 0.6rem',
                        borderRadius: 999,
                        background: status.color,
                        color: status.label === 'Needs work' ? '#111827' : '#0f172a',
                        fontSize: '0.75rem',
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {history && history.sessions.length > 0 && (
        <div className="result-card">
          <h3>Session History</h3>
          {history.sessions.map((session, idx) => (
            <div key={idx} style={{ marginBottom: '0.75rem' }}>
              <p>
                <strong>Session:</strong> {session.session_id || '(no id)'}
              </p>
              <table className="leaderboard-table" style={{ marginTop: '0.25rem' }}>
                <thead>
                  <tr>
                    <th>Shot</th>
                    <th>Swings</th>
                    <th>Accuracy</th>
                    <th>Avg speed</th>
                  </tr>
                </thead>
                <tbody>
                  {session.shots.map((shot) => (
                    <tr key={shot.shot_type}>
                      <td>{shot.shot_type}</td>
                      <td>{shot.count}</td>
                      <td>{(shot.average_confidence * 100).toFixed(1)}%</td>
                      <td>{shot.average_speed_mps.toFixed(2)} m/s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {history && history.sessions.length === 0 && !loading && !error && (
        <p style={{ color: '#9ca3af' }}>
          No sessions found for this player yet. Record some swings on the dashboard first.
        </p>
      )}
    </section>
  );
}
