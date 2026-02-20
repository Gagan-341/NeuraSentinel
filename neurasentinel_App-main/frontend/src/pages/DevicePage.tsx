import { useEffect, useRef, useState } from 'react';
import {
  classifySwing,
  ClassificationResult,
  SwingSamplePayload,
} from '../services/api';
import { useToast } from '../components/ToastProvider';

const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'practice_session';
const STREAM_WINDOW = 100;
const MOTION_THRESHOLD = 12;

// Swing detection parameters for phone motion (approx. 100 Hz sampling)
const SWING_THRESHOLD = 12; // accel magnitude threshold for a clear swing
const PEAK_WINDOW_PRE = 50; // samples before peak
const PEAK_WINDOW_POST = 50; // samples after peak
const SWING_COOLDOWN_MS = 500; // minimum time between swings

function getIntensityMeta(speed: number) {
  const clamped = Math.max(0, Math.min(speed, 40));
  const percent = Math.min((clamped / 35) * 100, 100);
  if (speed >= 30) {
    return {
      label: 'Max Power',
      note: 'Explosive match finisher swing',
      color: '#fb923c',
      percent,
    };
  }
  if (speed >= 15) {
    return {
      label: 'Match Pace',
      note: 'Great training tempo – keep it consistent',
      color: '#34d399',
      percent,
    };
  }
  return {
    label: 'Warm-up',
    note: 'Add more acceleration and snap the wrist',
    color: '#60a5fa',
    percent,
  };
}

// NeuraBat IMU service/characteristic UUIDs (match Arduino firmware)
const IMU_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const IMU_CHARACTERISTIC_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

function hasSignificantMotion(samples: SwingSamplePayload[]): boolean {
  let maxNorm = 0;
  for (const s of samples) {
    const norm = Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
    if (norm > maxNorm) maxNorm = norm;
  }
  return maxNorm > MOTION_THRESHOLD;
}

export function DevicePage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phoneSupported, setPhoneSupported] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastSample, setLastSample] = useState<SwingSamplePayload | null>(null);
  const [lastResult, setLastResult] = useState<ClassificationResult | null>(null);
  const [phoneStreaming, setPhoneStreaming] = useState(false);

  const { showToast } = useToast();

  const samplesRef = useRef<SwingSamplePayload[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const deviceRef = useRef<any | null>(null);
  const phoneMotionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const phoneTimerRef = useRef<number | null>(null);
  const lastSwingTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    setSupported(hasBluetooth);
    if (typeof window !== 'undefined') {
      const hasDeviceMotion = 'DeviceMotionEvent' in window || 'ondevicemotion' in window;
      setPhoneSupported(hasDeviceMotion);
    } else {
      setPhoneSupported(false);
    }
  }, []);

  function addSampleFromNotification(value: DataView) {
    // Firmware sends 6 float32 values [ax, ay, az, gx, gy, gz] at 100 Hz
    // in little-endian order.
    if (value.byteLength < 24) return;
    const ax = value.getFloat32(0, true);
    const ay = value.getFloat32(4, true);
    const az = value.getFloat32(8, true);
    const gx = value.getFloat32(12, true);
    const gy = value.getFloat32(16, true);
    const gz = value.getFloat32(20, true);

    const now = performance.now();
    if (startTimeRef.current == null) {
      startTimeRef.current = now;
      samplesRef.current = [];
    }
    const t = (now - startTimeRef.current) / 1000.0;

    const sample: SwingSamplePayload = { ax, ay, az, gx, gy, gz, t };
    samplesRef.current.push(sample);
    setLastSample(sample);

    // Keep only the most recent 2 seconds (~200 samples if 100 Hz)
    if (samplesRef.current.length > 400) {
      samplesRef.current = samplesRef.current.slice(-400);
    }
  }

  async function classifySwingWindow(windowSamples: SwingSamplePayload[], source: string) {
    if (!windowSamples.length) return;
    setSending(true);
    setError(null);
    try {
      const res = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 100,
        samples: windowSamples,
        source,
      });
      const r = res?.result;
      setLastResult(r);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to classify swing from phone motion data.');
      showToast('Failed to classify swing from phone motion data.', 'error');
    } finally {
      setSending(false);
    }
  }

  function maybeTriggerSwingFromPhone(nowMs: number) {
    const buffer = samplesRef.current;
    if (buffer.length < 20) return;

    const lastSwingAt = lastSwingTimeRef.current;
    if (lastSwingAt != null && nowMs - lastSwingAt < SWING_COOLDOWN_MS) {
      return;
    }

    const peakIndex = buffer.length - 1;
    const s = buffer[peakIndex];
    const norm = Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
    if (norm < SWING_THRESHOLD) {
      return;
    }

    const start = Math.max(0, peakIndex - PEAK_WINDOW_PRE);
    const end = Math.min(buffer.length, peakIndex + PEAK_WINDOW_POST);
    const windowSamples = buffer.slice(start, end);

    lastSwingTimeRef.current = nowMs;
    void classifySwingWindow(windowSamples, 'phone-device');
  }

  function handleDeviceMotion(event: DeviceMotionEvent) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    const rot = event.rotationRate;

    // Accept events if at least one of accel or gyro is present; default missing values to 0.
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
    const t = (now - startTimeRef.current) / 1000.0;

    const sample: SwingSamplePayload = { ax, ay, az, gx, gy, gz, t };
    samplesRef.current.push(sample);
    setLastSample(sample);

    if (samplesRef.current.length > 400) {
      samplesRef.current = samplesRef.current.slice(-400);
    }

    // Attempt real-time swing detection on the latest sample
    maybeTriggerSwingFromPhone(now);
  }

  async function handleConnect() {
    if (!supported) return;
    setError(null);
    setConnecting(true);
    setLastResult(null);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'Neura' }],
        optionalServices: [IMU_SERVICE_UUID],
      });
      deviceRef.current = device;
      setDeviceName(device.name ?? 'Unknown device');

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }
      const service = await server.getPrimaryService(IMU_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(IMU_CHARACTERISTIC_UUID);

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        const target = event.target as any;
        const value = (target && target.value) as DataView | null;
        if (!value) return;
        addSampleFromNotification(value);
      });

      setConnected(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to connect to device.');
      setConnected(false);
      deviceRef.current = null;
      showToast('Failed to connect to BLE device. Please try again and ensure Bluetooth is enabled.', 'error');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      const device = deviceRef.current;
      if (device && device.gatt?.connected) {
        await device.gatt.disconnect();
      }
    } catch (err) {
      console.error(err);
    } finally {
      deviceRef.current = null;
      setConnected(false);
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
        const response = await DeviceMotionEventAny.requestPermission();
        if (response !== 'granted') {
          setError('Motion permission was not granted. Please allow motion access in your browser.');
          return;
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to request motion permissions.');
      return;
    }

    const listener = (event: DeviceMotionEvent) => {
      handleDeviceMotion(event);
    };
    phoneMotionListenerRef.current = listener;
    window.addEventListener('devicemotion', listener);
    setPhoneStreaming(true);

    if (phoneTimerRef.current != null) {
      window.clearInterval(phoneTimerRef.current);
      phoneTimerRef.current = null;
    }
  }

  function handleStopPhoneStream() {
    const listener = phoneMotionListenerRef.current;
    if (listener) {
      window.removeEventListener('devicemotion', listener);
      phoneMotionListenerRef.current = null;
    }
    if (phoneTimerRef.current != null) {
      window.clearInterval(phoneTimerRef.current);
      phoneTimerRef.current = null;
    }
    setPhoneStreaming(false);
  }

  useEffect(() => {
    return () => {
      const listener = phoneMotionListenerRef.current;
      if (listener) {
        window.removeEventListener('devicemotion', listener);
      }
      if (phoneTimerRef.current != null) {
        window.clearInterval(phoneTimerRef.current);
      }
    };
  }, []);

  async function handleSendSwing() {
    if (!samplesRef.current.length) {
      setError('No samples captured yet from the device. Move the bat to generate data.');
      return;
    }
    setError(null);
    setSending(true);
    setLastResult(null);
    try {
      // Use the last 100 samples (~1 second at 100 Hz) as one swing window
      const samples = samplesRef.current.slice(-100);
      const response = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 100,
        samples,
        source: 'ble-device',
      });
      setLastResult(response.result);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to classify swing from device data.');
      showToast('Failed to classify swing from device data.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="dashboard">
      <h2 className="page-title">Train with your phone sensors</h2>
      <p className="section-subtitle" style={{ marginBottom: '1rem' }}>
        Use your phone’s accelerometer and gyroscope to stream swings to NeuraSentinel in real time.
      </p>

      {error && <p className="error-text">{error}</p>}

      <div className="result-card" style={{ marginBottom: '1rem' }}>
        <h3>Phone status</h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.4rem',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '999px',
              backgroundColor: phoneStreaming ? '#16a34a' : '#dc2626',
            }}
          />
          <span>
            {phoneStreaming
              ? 'Connected · receiving motion data from your phone.'
              : 'Not streaming yet. Open this page on your phone and start streaming to begin.'}
          </span>
        </div>
        {phoneSupported === false && (
          <p className="error-text" style={{ marginTop: '0.75rem' }}>
            This device does not expose motion sensors to the browser. Try using a modern mobile browser.
          </p>
        )}
      </div>

      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button
          className="btn btn-primary"
          onClick={handleStartPhoneStream}
          disabled={phoneStreaming || phoneSupported === false}
        >
          {phoneStreaming ? 'Streaming from phone…' : 'Start phone streaming'}
        </button>
        {phoneStreaming && (
          <button className="btn btn-secondary" onClick={handleStopPhoneStream}>
            Stop phone streaming
          </button>
        )}
      </div>

      {lastResult && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>
          <h3>Last swing</h3>
          <p>
            <strong>Shot:</strong> {lastResult.shot_type}
          </p>
          <p>
            <strong>Confidence:</strong> {(lastResult.confidence * 100).toFixed(1)}%
          </p>
          <p>
            <strong>Speed:</strong> {lastResult.speed_mps.toFixed(2)} m/s
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
              </span>
            </p>
          )}
          {lastResult.coaching_message && (
            <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>{lastResult.coaching_message}</p>
          )}
        </div>
      )}

      <div className="result-card" style={{ marginBottom: '1rem' }}>
        <h3>Safety & setup</h3>
        <p style={{ color: '#6b7280' }}>
          Keep your phone secure in an arm strap or deep pocket before swinging. Make sure your phone and
          PC are on the same Wi-Fi network so you can watch the live dashboard comfortably while you play.
        </p>
      </div>

      <div className="result-card">
        <h3>Optional: NeuraBat prototype bat</h3>
        <p className="section-subtitle" style={{ marginBottom: '0.75rem' }}>
          If you have the NeuraBat bat, you can connect it via Bluetooth Low Energy and send a captured
          swing window to the AI model.
        </p>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={handleConnect}
            disabled={connecting || !supported}
          >
            {connecting ? 'Connecting…' : connected ? 'Reconnect bat' : 'Connect bat'}
          </button>
          {connected && (
            <>
              <button className="btn btn-secondary" onClick={handleDisconnect}>
                Disconnect
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSendSwing}
                disabled={sending}
              >
                {sending ? 'Sending…' : 'Send last swing to AI'}
              </button>
            </>
          )}
        </div>
        {connected && deviceName && (
          <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>Connected to: {deviceName}</p>
        )}
        {supported === false && (
          <p className="error-text" style={{ marginTop: '0.75rem' }}>
            This browser does not support Bluetooth connections to the prototype bat.
          </p>
        )}
      </div>
    </section>
  );
}
