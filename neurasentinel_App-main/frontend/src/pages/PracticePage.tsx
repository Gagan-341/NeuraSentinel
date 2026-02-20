import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { classifySwing, ClassificationResult, SwingSamplePayload } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { speak } from '../utils/voice';
import { resolveShotName, shotGuides, toShotSlug } from '../data/shotGuides';

const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'practice_session';
const STREAM_WINDOW = 120;
const MOTION_THRESHOLD = 12;

interface SessionStats {
  swings: number;
  correct: number;
  totalSpeed: number;
  lastSpeed?: number;
  history: {
    id: number;
    shot: string;
    correct: boolean;
    confidence: number;
    speed: number;
    techniqueScore?: number;
  }[];
}

function buildCoachingFeedback(targetShot: string, result: ClassificationResult): string {
  const target = targetShot.trim();
  const predicted = result.shot_type.trim();
  const lcTarget = target.toLowerCase();
  const lcPred = predicted.toLowerCase();
  const conf = result.confidence;
  const confPct = conf * 100;
  const speed = result.speed_mps;

  const isMatch = lcTarget === lcPred;

  // Helper to describe speed band
  let speedNote = '';
  if (speed < 10) {
    speedNote = 'Swing speed is low – drive more from legs and hips.';
  } else if (speed < 18) {
    speedNote = 'Speed is moderate – focus on clean contact before adding more power.';
  } else {
    speedNote = 'Good racket speed – keep the swing under control.';
  }

  if (isMatch && conf >= 0.85) {
    return `${target} detected with strong confidence (${confPct.toFixed(1)}%). ${speedNote}`;
  }

  if (isMatch && conf >= 0.6) {
    return `${target} detected but technique is a bit inconsistent (${confPct.toFixed(1)}%). Relax the wrist, use your legs, and exaggerate a full follow-through.`;
  }

  // Mismatch: predicted a different shot than the one the player is practicing
  if (lcTarget === 'forehand') {
    if (lcPred === 'push') {
      return `Motion looks more like a Push than a Forehand (${predicted}, ${confPct.toFixed(1)}%). Open the racket slightly, swing forward and upward, and use body rotation instead of just the arm.`;
    }
    if (lcPred === 'chop') {
      return `Swing path is too downward – model sees a ${predicted}. For a Forehand, brush forward and slightly up through the ball instead of chopping down.`;
    }
    if (lcPred === 'block') {
      return `Stroke is too short and stiff like a Block. Let the arm travel forward, keep the wrist relaxed, and finish across your body for a full Forehand.`;
    }
  }

  if (lcTarget === 'backhand') {
    if (lcPred === 'push') {
      return `This looks closer to a Push than a Backhand drive. Stay closer to the table, keep the elbow in front, and guide the ball forward with a compact forearm swing.`;
    }
    if (lcPred === 'chop') {
      return `Downward motion suggests a Chop. For a Backhand drive, keep the bat higher and swing forward with a stable wrist instead of cutting under the ball.`;
    }
  }

  // Generic fallback coaching
  if (!isMatch) {
    return `Model detected ${predicted} (${confPct.toFixed(1)}%) while you are training ${target}. Slow down, focus on the correct racket angle and swing path, then rebuild speed once the motion feels repeatable.`;
  }

  return `${target} swing logged (${confPct.toFixed(1)}% confidence). ${speedNote}`;
}

function hasSignificantMotion(samples: SwingSamplePayload[]): boolean {
  let maxNorm = 0;
  for (const s of samples) {
    const norm = Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
    if (norm > maxNorm) maxNorm = norm;
  }
  return maxNorm > MOTION_THRESHOLD;
}

function toFixedLengthSamples(
  samples: SwingSamplePayload[],
  targetLen: number,
): SwingSamplePayload[] {
  const n = samples.length;
  if (n === 0) return [];
  if (targetLen <= 0) return [];
  if (n === targetLen) return samples.slice();
  if (targetLen === 1) {
    return [samples[Math.floor(n / 2)]];
  }

  const out: SwingSamplePayload[] = [];
  for (let i = 0; i < targetLen; i += 1) {
    const t = ((n - 1) * i) / (targetLen - 1);
    const idx = Math.round(t);
    const clamped = Math.max(0, Math.min(n - 1, idx));
    out.push(samples[clamped]);
  }
  return out;
}

export function PracticePage() {
  const { shotName } = useParams<{ shotName: string }>();
  const canonicalShot = resolveShotName(shotName);
  const navigate = useNavigate();

  const { showToast } = useToast();

  const [phoneSupported, setPhoneSupported] = useState<boolean | null>(null);
  const [phoneStreaming, setPhoneStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('Start streaming to log swings.');
  const [stats, setStats] = useState<SessionStats>({ swings: 0, correct: 0, totalSpeed: 0, history: [] });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [datasetMode, setDatasetMode] = useState(false);
  const [datasetSwings, setDatasetSwings] = useState<SwingSamplePayload[][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const lastVoiceTextRef = useRef<string>('');
  const lastVoiceSwingIdRef = useRef<number>(0);

  const samplesRef = useRef<SwingSamplePayload[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const streamTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setPhoneSupported(false);
      return;
    }
    const hasDeviceMotion = 'DeviceMotionEvent' in window || 'ondevicemotion' in window;
    setPhoneSupported(hasDeviceMotion);
    return () => {
      cleanupStreaming();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guide = canonicalShot ? shotGuides[canonicalShot] : null;
  const accuracy = stats.swings > 0 ? (stats.correct / stats.swings) * 100 : 0;
  const avgSpeed = stats.swings > 0 ? stats.totalSpeed / stats.swings : 0;
  const timeline = useMemo(() => stats.history.slice(-12).reverse(), [stats.history]);
  const lastEntry = stats.history.length > 0 ? stats.history[stats.history.length - 1] : null;
  const lastTechniqueScore = lastEntry
    ? lastEntry.techniqueScore ?? Math.round(lastEntry.confidence * 100)
    : null;
  const techniqueTrend = useMemo(() => {
    if (stats.history.length < 4) return null;
    const scores = stats.history.map((entry) =>
      entry.techniqueScore ?? Math.round(entry.confidence * 100),
    );
    const mid = Math.floor(scores.length / 2);
    const firstAvg =
      mid > 0
        ? scores.slice(0, mid).reduce((sum, v) => sum + v, 0) / mid
        : scores[0];
    const lastLen = scores.length - mid;
    const lastAvg =
      lastLen > 0
        ? scores.slice(mid).reduce((sum, v) => sum + v, 0) / lastLen
        : scores[scores.length - 1];
    const delta = lastAvg - firstAvg;
    return { firstAvg, lastAvg, delta };
  }, [stats.history]);

  if (!canonicalShot || !guide) {
    return (
      <section className="dashboard">
        <h2>Practice session</h2>
        <p>Unknown shot. Please select a valid tutorial first.</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </section>
    );
  }

  const shotLabel = canonicalShot;
  const guideData = guide;
  const shotSlug = toShotSlug(shotLabel);

  function maybeSpeakCoaching(text: string | null) {
    if (!voiceEnabled) return;
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const lastHistoryEntry = stats.history[stats.history.length - 1];
    const swingId = lastHistoryEntry?.id ?? 0;
    const lastSpokenId = lastVoiceSwingIdRef.current;

    const lastText = lastVoiceTextRef.current;
    const tooSoon = swingId > 0 && swingId - lastSpokenId < 3; // wait at least 3 swings
    const unchanged = lastText && trimmed === lastText;
    if (tooSoon && unchanged) {
      return;
    }

    speak(trimmed);
    lastVoiceTextRef.current = trimmed;
    lastVoiceSwingIdRef.current = swingId;
  }

  function addSampleFromMotion(event: DeviceMotionEvent) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    const rot = event.rotationRate;
    if (!acc && !rot) {
      return;
    }
    const ax = acc?.x ?? 0;
    const ay = acc?.y ?? 0;
    const az = acc?.z ?? 0;
    const gx = rot?.alpha ?? 0;
    const gy = rot?.beta ?? 0;
    const gz = rot?.gamma ?? 0;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (startTimeRef.current == null) {
      startTimeRef.current = now;
      samplesRef.current = [];
    }
    const t = (now - startTimeRef.current) / 1000;
    const sample: SwingSamplePayload = { ax, ay, az, gx, gy, gz, t };
    samplesRef.current.push(sample);
    if (samplesRef.current.length > 400) {
      samplesRef.current = samplesRef.current.slice(-400);
    }
  }

  async function classifyLatestWindow() {
    if (samplesRef.current.length < STREAM_WINDOW) {
      return;
    }
    const samples = samplesRef.current.slice(-STREAM_WINDOW);
    if (!hasSignificantMotion(samples)) {
      setFeedback('No significant motion detected. Make a clear swing to record a shot.');
      return;
    }
    setSending(true);
    try {
      const response = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 100,
        samples,
        source: 'phone-practice',
        target_shot: shotLabel,
      });
      const result = response.result;
      const datasetSamples = datasetMode ? toFixedLengthSamples(samples, 100) : null;
      const isCorrect = result.shot_type.trim().toLowerCase() === shotLabel.toLowerCase();
      setStats((prev) => {
        const updatedHistory = [
          ...prev.history,
          {
            id: prev.history.length + 1,
            shot: result.shot_type,
            correct: isCorrect,
            confidence: result.confidence,
            speed: result.speed_mps,
            techniqueScore:
              typeof result.technique_score === 'number'
                ? result.technique_score
                : Math.round(result.confidence * 100),
          },
        ];
        const swings = prev.swings + 1;
        const totalSpeed = prev.totalSpeed + result.speed_mps;
        if (isCorrect) {
          return {
            swings,
            correct: prev.correct + 1,
            totalSpeed,
            lastSpeed: result.speed_mps,
            history: updatedHistory,
          };
        }
        return {
          swings,
          correct: prev.correct,
          totalSpeed,
          lastSpeed: result.speed_mps,
          history: updatedHistory,
        };
      });
      if (datasetSamples) {
        setDatasetSwings((prev) => [...prev, datasetSamples]);
      }
      const backendMsg = result.coaching_message;
      const coachingText = backendMsg ?? buildCoachingFeedback(shotLabel, result);
      setFeedback(coachingText);
      if (backendMsg) {
        maybeSpeakCoaching(backendMsg);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to classify swing.');
      setFeedback('Error classifying swing. Check console for details.');
      showToast('Failed to classify swing. Please check your connection and try again.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleStartPhoneStream() {
    if (phoneStreaming) return;
    if (phoneSupported === false) {
      setError('Device motion sensors are not available in this browser.');
      return;
    }
    setError(null);
    samplesRef.current = [];
    startTimeRef.current = null;

    try {
      const DeviceMotionEventAny = (window as any).DeviceMotionEvent;
      if (DeviceMotionEventAny && typeof DeviceMotionEventAny.requestPermission === 'function') {
        const permission = await DeviceMotionEventAny.requestPermission();
        if (permission !== 'granted') {
          setError('Motion permission was not granted.');
          return;
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to request motion permissions.');
      return;
    }

    const listener = (event: DeviceMotionEvent) => addSampleFromMotion(event);
    motionListenerRef.current = listener;
    window.addEventListener('devicemotion', listener);
    setPhoneStreaming(true);

    // Voice cue that focused practice has started
    if (voiceEnabled) {
      speak(`${shotLabel} practice mode activated. Swing when ready.`);
    }

    if (streamTimerRef.current != null) {
      window.clearInterval(streamTimerRef.current);
    }
    streamTimerRef.current = window.setInterval(classifyLatestWindow, 1000);
  }

  function cleanupStreaming() {
    const listener = motionListenerRef.current;
    if (listener) {
      window.removeEventListener('devicemotion', listener);
      motionListenerRef.current = null;
    }
    if (streamTimerRef.current != null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setPhoneStreaming(false);
  }

  function handleStopPhoneStream() {
    cleanupStreaming();
  }

  function handleOpenSummary() {
    // Stop any ongoing streaming and show a post-session summary for this focused block.
    cleanupStreaming();
    if (stats.swings > 0) {
      setShowSummary(true);
    }
  }

  function handleToggleDatasetMode() {
    setDatasetMode((prev) => !prev);
  }

  function handleDownloadDatasetCsv() {
    if (datasetSwings.length === 0) {
      return;
    }
    if (typeof window === 'undefined') return;

    const header =
      'swing_index,sample_index,shot_label,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z';
    const lines: string[] = [header];
    datasetSwings.forEach((swingSamples, swingIndex) => {
      swingSamples.forEach((sample, sampleIndex) => {
        lines.push(
          `${swingIndex + 1},${sampleIndex},${shotLabel},${sample.ax},${sample.ay},${sample.az},${sample.gx},${sample.gy},${sample.gz}`,
        );
      });
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeShot = shotLabel.toLowerCase().replace(/\s+/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `${safeShot}_dataset_${ts}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function handleClassifyCsv() {
    if (!selectedFile) {
      setError('Please select a CSV file first.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const text = await selectedFile.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length < 2) {
        throw new Error('CSV file has no data rows.');
      }

      const header = lines[0].split(',').map((h) => h.trim());
      const required = ['acc_x', 'acc_y', 'acc_z', 'gyro_x', 'gyro_y', 'gyro_z'];
      const idx: Record<string, number> = {};
      for (const col of required) {
        const pos = header.indexOf(col);
        if (pos === -1) {
          throw new Error(`CSV missing column: ${col}`);
        }
        idx[col] = pos;
      }

      const samples = lines.slice(1).map((line, i) => {
        const parts = line.split(',');
        return {
          ax: parseFloat(parts[idx['acc_x']]),
          ay: parseFloat(parts[idx['acc_y']]),
          az: parseFloat(parts[idx['acc_z']]),
          gx: parseFloat(parts[idx['gyro_x']]),
          gy: parseFloat(parts[idx['gyro_y']]),
          gz: parseFloat(parts[idx['gyro_z']]),
          t: i * (1 / 200),
        };
      });

      if (!samples.length) {
        throw new Error('No valid samples parsed from CSV.');
      }

      const response = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 200,
        samples,
        source: 'csv-practice',
        target_shot: shotLabel,
      });
      const result = response.result;
      const datasetSamples = datasetMode ? toFixedLengthSamples(samples, 100) : null;
      const isCorrect = result.shot_type.trim().toLowerCase() === shotLabel.toLowerCase();
      setStats((prev) => {
        const updatedHistory = [
          ...prev.history,
          {
            id: prev.history.length + 1,
            shot: result.shot_type,
            correct: isCorrect,
            confidence: result.confidence,
            speed: result.speed_mps,
            techniqueScore:
              typeof result.technique_score === 'number'
                ? result.technique_score
                : Math.round(result.confidence * 100),
          },
        ];
        const swings = prev.swings + 1;
        const totalSpeed = prev.totalSpeed + result.speed_mps;
        if (isCorrect) {
          return {
            swings,
            correct: prev.correct + 1,
            totalSpeed,
            lastSpeed: result.speed_mps,
            history: updatedHistory,
          };
        }
        return {
          swings,
          correct: prev.correct,
          totalSpeed,
          lastSpeed: result.speed_mps,
          history: updatedHistory,
        };
      });
      const backendMsg = result.coaching_message;
      const coachingText = backendMsg ?? buildCoachingFeedback(shotLabel, result);
      setFeedback(coachingText);
      if (backendMsg) {
        maybeSpeakCoaching(backendMsg);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to classify CSV swing.');
      showToast('Failed to classify CSV swing. Please verify the file format.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="dashboard">
      <div className="page-header-row">
        <div>
          <p style={{ color: '#FF8C32', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Focused training</p>
          <h2 className="page-title" style={{ marginBottom: 8 }}>
            {shotLabel} session
          </h2>
          <p className="section-subtitle" style={{ maxWidth: 540 }}>
            Only {shotLabel} swings are counted here. Stream live IMU data from your phone to practice with instant feedback.
          </p>
          {phoneStreaming && (
            <div className="live-pill" style={{ marginTop: '0.25rem' }}>
              <span className="live-dot" />
              <span>Live from phone</span>
            </div>
          )}
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setVoiceEnabled((prev) => !prev)}
          >
            {voiceEnabled ? 'Mute voice coach' : 'Unmute voice coach'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/tutorial/${shotSlug}`)}>
            View tutorial
          </button>
          <button className="btn btn-primary" onClick={handleStartPhoneStream} disabled={phoneStreaming || sending}>
            {phoneStreaming ? 'Streaming…' : 'Start streaming'}
          </button>
          <button className="btn btn-secondary" onClick={handleStopPhoneStream} disabled={!phoneStreaming}>
            Stop streaming
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={handleOpenSummary}
            disabled={stats.swings === 0}
          >
            End & view summary
          </button>
        </div>
      </div>
      <div className="page-actions" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <label
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
        >
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
          {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose practice CSV'}
        </label>
        <button className="btn btn-primary" onClick={handleClassifyCsv} disabled={sending}>
          {sending ? 'Analyzing…' : 'Classify CSV'}
        </button>
      </div>
      <div className="result-card" style={{ marginBottom: '1rem' }}>
        <h3>Offline dataset mode</h3>
        <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
          Record each new {shotLabel} swing window as raw IMU samples for building your training
          dataset.
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleToggleDatasetMode}
          >
            {datasetMode ? 'Recording swings…' : 'Enable dataset recording'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadDatasetCsv}
            disabled={datasetSwings.length === 0}
          >
            Download dataset CSV ({datasetSwings.length} swings)
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.4rem' }}>
          Each swing is exported as 100 time steps × 6 channels (acc + gyro). You can plug this file
          into your Python training scripts as labelled data.
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3>Stats</h3>
          <p>Swings: {stats.swings}</p>
          <p>Correct: {stats.correct}</p>
          <p>Accuracy: {accuracy.toFixed(2)}%</p>
          <p>Average speed: {avgSpeed.toFixed(2)} m/s</p>
        </div>
        <div>
          <h3>Timeline</h3>
          <ul>
            {timeline.map((entry, index) => (
              <li key={index}>
                <p>
                  {entry.shot} ({entry.correct ? 'Correct' : 'Incorrect'}) - Confidence: {entry.confidence.toFixed(2)}% - Speed: {entry.speed.toFixed(2)} m/s
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="result-card" style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3>Live Stats</h3>
            {lastEntry ? (
              <>
                <p>
                  <strong>Detected shot:</strong> {lastEntry.shot}
                </p>
                <p>
                  <strong>Confidence:</strong> {(lastEntry.confidence * 100).toFixed(1)}%
                </p>
                <p>
                  <strong>Speed:</strong> {lastEntry.speed.toFixed(2)} m/s
                </p>
              </>
            ) : (
              <p style={{ color: '#6b7280' }}>Make a swing to see live stats.</p>
            )}
          </div>
          <div className="tech-ring">
            <div className="tech-ring-outer">
              <div
                className="tech-ring-inner"
                style={
                  lastTechniqueScore != null
                    ? {
                        borderColor:
                          lastTechniqueScore >= 85
                            ? '#16a34a'
                            : lastTechniqueScore >= 60
                            ? '#facc15'
                            : '#dc2626',
                      }
                    : undefined
                }
              >
                <span className="tech-ring-score">
                  {lastTechniqueScore != null ? `${lastTechniqueScore}%` : '--'}
                </span>
              </div>
            </div>
            <div className="tech-ring-label">Technique</div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ marginBottom: '0.35rem' }}>Recent swings</p>
          <div className="swings-strip">
            {timeline.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>No swings yet</span>
            )}
            {timeline.slice(0, 8).map((entry, index) => {
              const score = entry.techniqueScore ?? Math.round(entry.confidence * 100);
              const ok = entry.correct;
              return (
                <div
                  key={index}
                  className={`swing-pill ${ok ? 'swing-pill-ok' : 'swing-pill-bad'}`}
                >
                  <span className="swing-pill-shot">{entry.shot}</span>
                  <span className="swing-pill-score">{score}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {error && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          <p>Error: {error}</p>
        </div>
      )}
      {feedback && (
        <div className="result-card" style={{ marginTop: '1rem' }}>
          <h3>AI Coaching</h3>
          <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>{feedback}</p>
        </div>
      )}
      {lastEntry && !lastEntry.correct && (
        <div className="result-card" style={{ marginTop: '0.75rem' }}>
          <h3>Shot should be like this ({shotLabel})</h3>
          <p style={{ color: '#a9acb2', marginBottom: '0.75rem' }}>
            The last swing was classified as {lastEntry.shot}. Review the key mechanics for a clean {shotLabel}.
          </p>
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: '0.75rem', overflow: 'hidden' }}>
            <iframe
              title={`${shotLabel} reference tutorial`}
              src={guideData.videoUrl}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
      {showSummary && stats.swings > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
          onClick={() => setShowSummary(false)}
        >
          <div
            style={{
              background: '#f9fafb',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              width: 'min(520px, 90vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 30px rgba(15,23,42,0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Session summary – {shotLabel}</h3>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              Focused block using your phone sensors. Use this snapshot to plan your next set.
            </p>
            <p>
              <strong>Total swings:</strong> {stats.swings}
            </p>
            <p>
              <strong>Correct swings:</strong> {stats.correct} ({accuracy.toFixed(1)}%)
            </p>
            <p>
              <strong>Average speed:</strong> {avgSpeed.toFixed(2)} m/s
            </p>
            {lastTechniqueScore != null && (
              <p>
                <strong>Last technique score:</strong> {lastTechniqueScore}%
              </p>
            )}
            {techniqueTrend && (
              <p style={{ fontSize: '0.9rem', color: '#4b5563', marginTop: '0.5rem' }}>
                Technique trend: {techniqueTrend.delta >= 0 ? '↑ improved by ' : '↓ changed by '}
                {Math.abs(techniqueTrend.delta).toFixed(1)} pts (from{' '}
                {techniqueTrend.firstAvg.toFixed(1)}% to {techniqueTrend.lastAvg.toFixed(1)}%).
              </p>
            )}
            <p style={{ marginTop: '0.85rem', fontSize: '0.9rem', color: '#6b7280' }}>
              {accuracy >= 90
                ? `Fantastic consistency. Next session, add a few faster ${shotLabel} swings and vary placement while keeping technique above 90%.`
                : accuracy >= 75
                ? `Solid base. Next session, push ${shotLabel} accuracy towards 85% with a relaxed rhythm and full follow-through on every swing.`
                : `Treat your next session as a reset: slow the ${shotLabel} down, focus on balance and clean contact, then add speed once the motion feels repeatable.`}
            </p>
            <div
              style={{
                marginTop: '1rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSummary(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
