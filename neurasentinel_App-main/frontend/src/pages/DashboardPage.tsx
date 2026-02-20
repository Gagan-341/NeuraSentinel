 import { useEffect, useRef, useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { motion } from 'framer-motion';
 import {
  fetchCoachingInsights,
  fetchLastSwing,
  fetchPlayerHistory,
  fetchSessionStats,
  SessionSummary,
  ShotStats,
  CoachingFlag,
} from '../services/api';
 import { shotGuides, toShotSlug } from '../data/shotGuides';

const SHOTS = ['Forehand', 'Backhand', 'Smash', 'Push', 'Block', 'Flick', 'Serve', 'Chop'];
const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'practice_session';
const TARGET_SWINGS = 10;
const TARGET_ACCURACY = 85;

interface DashboardResult {
  shot_type: string;
  confidence: number;
  speed_mps: number;
  accuracy_score: number;
  technique_score?: number;
  coaching_message?: string | null;
  source?: string;
}

interface PracticeStats {
  swings: number;
  correct: number;
  totalSpeed: number;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderPracticeHint(shot: string, stats: ShotStats | undefined): string {
  if (!stats || stats.count === 0) {
    return `No swings recorded for ${shot} yet. Start with 10 controlled swings focusing on clean contact and relaxed form.`;
  }

  const accPct = stats.average_confidence * 100;
  if (accPct >= 90) {
    return `Your ${shot} is a true strength (${accPct.toFixed(1)}% accuracy). Keep it sharp with short, high-intensity sets, then practice placement variations.`;
  }
  if (accPct >= 75) {
    return `Solid ${shot} foundation (${accPct.toFixed(1)}% accuracy). Try 3 sets of 15 swings, keeping rhythm consistent before adding speed.`;
  }
  return `Your ${shot} needs more consistency (${accPct.toFixed(1)}% accuracy). Slow down for 20 relaxed swings prioritising balance and full follow-through, then add pace once the motion is repeatable.`;
}

function computePerformanceScore(
  overallAccuracy: number,
  overallAvgSpeed: number,
  totalSwings: number,
): {
  totalScore: number;
  label: string;
  accuracyScore: number;
  speedScore: number;
  volumeScore: number;
} {
  const accuracyScore = overallAccuracy * 100;
  const speedScore = Math.min(overallAvgSpeed / 35, 1) * 100;
  const volumeScore = Math.min(totalSwings / 80, 1) * 100;
  const totalScore = Math.round(accuracyScore * 0.6 + speedScore * 0.25 + volumeScore * 0.15);

  let label: string;
  if (totalScore >= 85) label = 'Elite';
  else if (totalScore >= 70) label = 'Advanced';
  else if (totalScore >= 50) label = 'Intermediate';
  else label = 'Foundation';

  return { totalScore, label, accuracyScore, speedScore, volumeScore };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [lastResult, setLastResult] = useState<DashboardResult | null>(null);
  const [shotStatsByType, setShotStatsByType] = useState<Record<string, ShotStats>>({});
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [practiceFocusShot, setPracticeFocusShot] = useState<string | null>(null);
  const [practiceStats, setPracticeStats] = useState<PracticeStats>({ swings: 0, correct: 0, totalSpeed: 0 });
  const [practiceStartTime, setPracticeStartTime] = useState<number | null>(null);
  const [practiceElapsedSeconds, setPracticeElapsedSeconds] = useState(0);
  const [tutorialShot, setTutorialShot] = useState<string | null>(null);
  const [previousSessionMetrics, setPreviousSessionMetrics] = useState<{
    swings: number;
    accuracy: number;
    avgSpeed: number;
  } | null>(null);
  const [coachingTip, setCoachingTip] = useState<string | null>(null);
  const [coachingSecondary, setCoachingSecondary] = useState<string | null>(null);
  const [coachingFlags, setCoachingFlags] = useState<CoachingFlag[]>([]);

  const lastSwingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void refreshSessionStats();
    void refreshLastSwing();

    const id = window.setInterval(() => {
      void refreshSessionStats();
      void refreshLastSwing();
    }, 2000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShot, practiceFocusShot]);

  useEffect(() => {
    if (!practiceStartTime) {
      setPracticeElapsedSeconds(0);
      return undefined;
    }
    const timerId = window.setInterval(() => {
      setPracticeElapsedSeconds(Math.floor((Date.now() - practiceStartTime) / 1000));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [practiceStartTime]);

  useEffect(() => {
    void refreshPlayerHistory();
    void refreshCoachingInsights();
  }, []);

  const shotStatsList = Object.values(shotStatsByType);
  let totalSwings = 0;
  let accWeightedSum = 0;
  let speedWeightedSum = 0;
  let primaryShot: ShotStats | null = null;
  for (const stat of shotStatsList) {
    totalSwings += stat.count;
    accWeightedSum += stat.average_confidence * stat.count;
    speedWeightedSum += stat.average_speed_mps * stat.count;
    if (!primaryShot || stat.count > primaryShot.count) {
      primaryShot = stat;
    }
  }

  const overallAccuracy = totalSwings ? accWeightedSum / totalSwings : 0;
  const overallAvgSpeed = totalSwings ? speedWeightedSum / totalSwings : 0;
  const selectedShotStats = selectedShot ? shotStatsByType[selectedShot] : undefined;

  const practiceAccuracy = practiceStats.swings > 0 ? (practiceStats.correct / practiceStats.swings) * 100 : 0;
  const practiceAvgSpeed = practiceStats.swings > 0 ? practiceStats.totalSpeed / practiceStats.swings : 0;
  const {
    totalScore: performanceScore,
    label: performanceLabel,
    accuracyScore,
    speedScore,
    volumeScore,
  } = computePerformanceScore(overallAccuracy, overallAvgSpeed, totalSwings);
  const swingTargetProgress = Math.min(1, practiceStats.swings / TARGET_SWINGS);
  const accuracyTargetProgress = Math.min(
    1,
    practiceStats.swings > 0 ? practiceAccuracy / TARGET_ACCURACY : 0,
  );

  const shotStrengths = SHOTS.map((shot) => {
    const stats = shotStatsByType[shot];
    const accuracyPct = stats ? stats.average_confidence * 100 : 0;
    let tone: 'strong' | 'ok' | 'weak';
    if (accuracyPct >= 85) tone = 'strong';
    else if (accuracyPct >= 70) tone = 'ok';
    else tone = 'weak';

    const colorMap: Record<typeof tone, { fill: string; text: string }> = {
      strong: { fill: '#34d399', text: '#051b11' },
      ok: { fill: '#fbbf24', text: '#1e1b04' },
      weak: { fill: '#fb7185', text: '#fef2f2' },
    };

    return { shot, accuracyPct, color: colorMap[tone].fill, textColor: colorMap[tone].text };
  });

  const radarPolygonPoints = shotStrengths.length
    ? shotStrengths
        .map((entry, index) => {
          const angle = (2 * Math.PI * index) / shotStrengths.length - Math.PI / 2;
          const radius = Math.max(0, Math.min(entry.accuracyPct / 100, 1)) * 40;
          const x = 50 + radius * Math.cos(angle);
          const y = 50 + radius * Math.sin(angle);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ')
    : '';

  const comparison = previousSessionMetrics;
  const accDelta = comparison ? overallAccuracy - comparison.accuracy : 0;
  const speedDelta = comparison ? overallAvgSpeed - comparison.avgSpeed : 0;
  const swingsDelta = comparison ? totalSwings - comparison.swings : 0;

  async function refreshSessionStats() {
    try {
      const stats = await fetchSessionStats(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
      const map: Record<string, ShotStats> = {};
      for (const shot of stats.shots) {
        map[shot.shot_type] = shot;
      }
      setShotStatsByType(map);
    } catch (err) {
      // Session stats are optional; log and continue.
      console.error('Failed to load session stats', err);
    }
  }

  async function refreshPlayerHistory() {
    try {
      const history = await fetchPlayerHistory(DEFAULT_PLAYER_ID);
      const sessionsExcludingCurrent = history.sessions.filter(
        (session) => session.session_id !== DEFAULT_SESSION_ID,
      );
      if (sessionsExcludingCurrent.length === 0) {
        setPreviousSessionMetrics(null);
        return;
      }

      const previous = sessionsExcludingCurrent[sessionsExcludingCurrent.length - 1];

      const aggregateSession = (session: SessionSummary) => {
        let swings = 0;
        let accSum = 0;
        let speedSum = 0;
        for (const shot of session.shots) {
          swings += shot.count;
          accSum += shot.average_confidence * shot.count;
          speedSum += shot.average_speed_mps * shot.count;
        }
        const accuracy = swings ? accSum / swings : 0;
        const avgSpeed = swings ? speedSum / swings : 0;
        return { swings, accuracy, avgSpeed };
      };

      const previousAgg = aggregateSession(previous);
      setPreviousSessionMetrics(previousAgg);
    } catch (err) {
      console.error('Failed to load player history', err);
    }
  }

  async function refreshCoachingInsights() {
    try {
      const insights = await fetchCoachingInsights(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
      setCoachingTip(insights.primary_tip);
      setCoachingSecondary(insights.secondary_tip ?? null);
      setCoachingFlags(insights.flags ?? []);
    } catch (err) {
      console.error('Failed to load coaching insights', err);
    }
  }

  async function refreshLastSwing() {
    try {
      const resp = await fetchLastSwing(DEFAULT_PLAYER_ID, DEFAULT_SESSION_ID);
      const key = JSON.stringify(resp.result);
      const resultWithSource: DashboardResult = {
        ...resp.result,
        source: resp.source ?? undefined,
      };
      if (lastSwingKeyRef.current !== key) {
        lastSwingKeyRef.current = key;
        setLastResult(resultWithSource);
        updatePracticeFromResult(resultWithSource);
      } else {
        setLastResult(resultWithSource);
      }
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.startsWith('API error 404')) {
        return;
      }
      console.error('Failed to load last swing', err);
    }
  }

  function updatePracticeFromResult(result: DashboardResult) {
    if (!practiceFocusShot) {
      return;
    }
    const matched =
      result.shot_type.trim().toLowerCase() === practiceFocusShot.trim().toLowerCase();
    setPracticeStats((prev) => ({
      swings: prev.swings + 1,
      correct: prev.correct + (matched ? 1 : 0),
      totalSpeed: prev.totalSpeed + result.speed_mps,
    }));
  }

  return (
    <section className="dashboard">
      <h2 className="page-title">Practice Dashboard</h2>
      <p className="section-subtitle">
        Track your eight core shots in real time as data streams from your device or focused practice sessions.
      </p>

      {totalSwings > 0 && (
        <motion.div
          className="result-card"
          style={{ marginBottom: '1rem' }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          >
          <h3>Session Summary</h3>
          <p>
            <strong>Total swings:</strong> {totalSwings}
          </p>
          <p>
            <strong>Average accuracy:</strong> {(overallAccuracy * 100).toFixed(1)}%
          </p>
          {primaryShot && (
            <p>
              <strong>Primary shot this session:</strong> {primaryShot.shot_type} ({(primaryShot.average_confidence * 100).toFixed(1)}% accuracy)
            </p>
          )}
          <div
            style={{
              marginTop: '0.75rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
            }}
          >
            <div>
              <p style={{ marginBottom: 4 }}>Performance score</p>
              <strong style={{ fontSize: '1.4rem' }}>{performanceScore}</strong>
              <span style={{ marginLeft: 8, fontSize: '0.9rem', color: '#a9acb2' }}>{performanceLabel}</span>
              <p style={{ marginTop: 4, fontSize: '0.75rem', color: '#6b7280' }}>
                Acc {accuracyScore.toFixed(0)} · Power {speedScore.toFixed(0)} · Volume {volumeScore.toFixed(0)}
              </p>
            </div>
            <div>
              <p style={{ marginBottom: 4 }}>Practice focus</p>
              <strong>{practiceFocusShot ?? 'None'}</strong>
            </div>
            <div>
              <p style={{ marginBottom: 4 }}>Practice timer</p>
              <strong>{practiceFocusShot ? formatDuration(practiceElapsedSeconds) : '--:--'}</strong>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ marginBottom: 6 }}>Shot strengths</p>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {shotStrengths.map(({ shot, color, textColor, accuracyPct }) => (
                <span
                  key={shot}
                  style={{
                    backgroundColor: color,
                    color: textColor,
                    borderRadius: 999,
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.75rem',
                    letterSpacing: 0.2,
                    textTransform: 'uppercase',
                  }}
                >
                  {shot}: {accuracyPct.toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ width: 220, height: 220 }}>
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#24262b" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="26" fill="none" stroke="#24262b" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="13" fill="none" stroke="#24262b" strokeWidth="0.5" />
                {shotStrengths.map((entry, index) => {
                  const angle = (2 * Math.PI * index) / shotStrengths.length - Math.PI / 2;
                  const x = 50 + 40 * Math.cos(angle);
                  const y = 50 + 40 * Math.sin(angle);
                  return (
                    <line
                      // eslint-disable-next-line react/no-array-index-key
                      key={`axis-${index}`}
                      x1={50}
                      y1={50}
                      x2={x}
                      y2={y}
                      stroke="#24262b"
                      strokeWidth="0.5"
                    />
                  );
                })}
                {radarPolygonPoints && (
                  <polygon
                    points={radarPolygonPoints}
                    fill="rgba(255,140,50,0.16)"
                    stroke="#ff8c32"
                    strokeWidth="0.8"
                  />
                )}
              </svg>
            </div>
            <div style={{ minWidth: 180 }}>
              <p style={{ marginBottom: 6 }}>Shot strength profile</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: '#a9acb2' }}>
                {shotStrengths.map(({ shot, accuracyPct }) => (
                  <li key={shot} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>{shot}</span>
                    <span>{accuracyPct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {(coachingTip || coachingFlags.length > 0) && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>AI micro coaching</h3>
          {coachingTip && (
            <p style={{ marginBottom: coachingSecondary ? '0.5rem' : '0.75rem' }}>{coachingTip}</p>
          )}
          {coachingSecondary && (
            <p style={{ marginBottom: '0.75rem', color: '#a9acb2' }}>{coachingSecondary}</p>
          )}
          {coachingFlags.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ marginBottom: 4 }}>Detected patterns</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                {coachingFlags.map((flag, idx) => (
                  <li
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${flag.shot_type}-${flag.issue}-${idx}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.35rem 0',
                      borderTop: '1px solid #24262b',
                    }}
                  >
                    <span>
                      <span style={{ color: '#ff8c32', marginRight: 6 }}>{flag.shot_type}</span>
                      <span style={{ color: '#a9acb2' }}>{flag.label}</span>
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: flag.severity === 'warning' ? '#fb7185' : '#fbbf24',
                      }}
                    >
                      {flag.severity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {comparison && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Today vs last session</h3>
          <p style={{ color: '#a9acb2', marginBottom: '0.75rem' }}>
            Comparing your current practice session to your previous recorded session.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
            <div>
              <p style={{ marginBottom: 4 }}>Accuracy</p>
              <strong>{(overallAccuracy * 100).toFixed(1)}%</strong>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '0.85rem',
                  color: accDelta >= 0 ? '#34d399' : '#fb7185',
                }}
              >
                {accDelta >= 0 ? '+' : ''}
                {(accDelta * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <p style={{ marginBottom: 4 }}>Avg speed</p>
              <strong>{overallAvgSpeed.toFixed(2)} m/s</strong>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '0.85rem',
                  color: speedDelta >= 0 ? '#34d399' : '#fb7185',
                }}
              >
                {speedDelta >= 0 ? '+' : ''}
                {speedDelta.toFixed(2)} m/s
              </span>
            </div>
            <div>
              <p style={{ marginBottom: 4 }}>Total swings</p>
              <strong>{totalSwings}</strong>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '0.85rem',
                  color: swingsDelta >= 0 ? '#34d399' : '#fb7185',
                }}
              >
                {swingsDelta >= 0 ? '+' : ''}
                {swingsDelta}
              </span>
            </div>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Last Swing Result</h3>
          <p>
            <strong>Shot type:</strong> {lastResult.shot_type}
          </p>
          <p>
            <strong>Confidence:</strong> {(lastResult.confidence * 100).toFixed(1)}%
          </p>
          <p>
            <strong>Speed:</strong> {lastResult.speed_mps.toFixed(2)} m/s
          </p>
          <p>
            <strong>Accuracy score:</strong> {(lastResult.accuracy_score * 100).toFixed(1)}%
          </p>
          {typeof lastResult.technique_score === 'number' && (
            <p>
              <strong>Technique score:</strong>{' '}
              <span
                style={{
                  color:
                    lastResult.technique_score >= 85
                      ? '#16a34a'
                      : lastResult.technique_score >= 60
                      ? '#facc15'
                      : '#dc2626',
                }}
              >
                {lastResult.technique_score}%
              </span>{' '}
              <span style={{ color: '#6b7280', marginLeft: 4 }}>
                {lastResult.technique_score >= 85
                  ? 'Correct'
                  : lastResult.technique_score >= 60
                  ? 'Needs improvement'
                  : 'Incorrect'}
              </span>
            </p>
          )}
          {lastResult.coaching_message && (
            <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>{lastResult.coaching_message}</p>
          )}
          {lastResult.source && (
            <p>
              <strong>Source:</strong>{' '}
              {lastResult.source === 'ble-device'
                ? 'BLE bat'
                : lastResult.source === 'phone-device'
                ? 'Phone (Device page)'
                : lastResult.source === 'phone-practice'
                ? 'Phone (Practice session)'
                : lastResult.source}
            </p>
          )}
        </div>
      )}

      <div className="shots-grid">
        {SHOTS.map((shot) => {
          const stats = shotStatsByType[shot];
          const isSelected = selectedShot === shot;
          return (
            <div
              key={shot}
              className={`shot-card ${isSelected ? 'active' : ''}`}
              onClick={() => {
                setSelectedShot(shot);
                if (shotGuides[shot]) {
                  setTutorialShot(shot);
                }
              }}
              style={isSelected ? { borderLeftColor: '#ff8c32' } : undefined}
            >
              <h4>{shot}</h4>
              {stats ? (
                <>
                  <p>
                    <strong>Swings:</strong> {stats.count}
                  </p>
                  <p>
                    <strong>Accuracy:</strong> {(stats.average_confidence * 100).toFixed(1)}%
                  </p>
                  <p>
                    <strong>Avg speed:</strong> {stats.average_speed_mps.toFixed(2)} m/s
                  </p>
                  {practiceFocusShot === shot && practiceStats.swings > 0 && (
                    <p style={{ marginTop: '0.25rem', color: '#a9acb2', fontSize: '0.85rem' }}>
                      Practice block: {practiceStats.swings} swings · {practiceAccuracy.toFixed(1)}% acc · {practiceAvgSpeed.toFixed(2)} m/s
                    </p>
                  )}
                </>
              ) : (
                <p>No swings recorded yet.</p>
              )}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                  marginTop: '0.6rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/tutorial/${toShotSlug(shot)}`);
                  }}
                >
                  Tutorial
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/practice/${toShotSlug(shot)}`);
                  }}
                >
                  Focused session
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="result-card" style={{ marginTop: '1.5rem' }}>
        <h3>Shot Practice Focus</h3>
        {!selectedShot && (
          <p style={{ color: '#a9acb2' }}>
            Tap any shot card to focus your training. The assistant will serve targeted feedback and a quick drill.
          </p>
        )}
        {selectedShot && (
          <>
            <p>
              <strong>Selected shot:</strong> {selectedShot}
            </p>
            {selectedShotStats ? (
              <>
                <p>
                  <strong>Swings this session:</strong> {selectedShotStats.count}
                </p>
                <p>
                  <strong>Accuracy:</strong> {(selectedShotStats.average_confidence * 100).toFixed(1)}%
                </p>
                <p>
                  <strong>Avg speed:</strong> {selectedShotStats.average_speed_mps.toFixed(2)} m/s
                </p>
                {practiceFocusShot === selectedShot && practiceStats.swings > 0 && (
                  <>
                    <p>
                      <strong>Practice swings:</strong> {practiceStats.swings}
                    </p>
                    <p>
                      <strong>Practice accuracy:</strong> {practiceAccuracy.toFixed(1)}%
                    </p>
                    <p>
                      <strong>Practice avg speed:</strong> {practiceAvgSpeed.toFixed(2)} m/s
                    </p>
                    <div style={{ marginTop: '0.75rem' }}>
                      <p style={{ marginBottom: 4 }}>Goal: {TARGET_SWINGS} accurate swings</p>
                      <div style={{ background: '#1f2937', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${swingTargetProgress * 100}%`, height: '100%', background: '#34d399' }} />
                      </div>
                      <p style={{ marginTop: '0.5rem', marginBottom: 4 }}>Goal: {TARGET_ACCURACY}% practice accuracy</p>
                      <div style={{ background: '#1f2937', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${accuracyTargetProgress * 100}%`, height: '100%', background: '#fbbf24' }} />
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p>No swings recorded yet for this shot in the current session.</p>
            )}
            <p style={{ marginTop: '0.75rem' }}>{renderPracticeHint(selectedShot, selectedShotStats)}</p>
          </>
        )}
      </div>

      {tutorialShot && shotGuides[tutorialShot] && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setTutorialShot(null)}
        >
          <div
            style={{
              background: '#111827',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              width: 'min(640px, 90vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{shotGuides[tutorialShot].title}</h3>
              <button className="btn btn-secondary" onClick={() => setTutorialShot(null)}>
                Close
              </button>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe
                  title={`${tutorialShot} tutorial`}
                  src={shotGuides[tutorialShot].videoUrl}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                    borderRadius: '0.5rem',
                  }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <h4>Key steps</h4>
              <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                {shotGuides[tutorialShot].steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => {
                setSelectedShot(tutorialShot);
                setPracticeFocusShot(tutorialShot);
                setPracticeStats({ swings: 0, correct: 0, totalSpeed: 0 });
                setPracticeStartTime(Date.now());
                setPracticeElapsedSeconds(0);
                setTutorialShot(null);
              }}
            >
              Start practice for {tutorialShot}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
