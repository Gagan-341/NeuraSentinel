from __future__ import annotations

"""Prepare phone-based IMU dataset for NeuraSentinel.

This script is intentionally simple and transparent:
- It reads the raw Phyphox-style accelerometer + gyro CSVs you uploaded under
  `../data_sets/<Class>/`.
- It interpolates both signals to a common 100 Hz time grid (without changing
  relative values beyond interpolation).
- It detects swing peaks based on acceleration magnitude.
- Around each peak, it crops a window and resamples it to exactly 100 samples
  (100 x 6: acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z).
- It saves each detected swing as
  `../data_sets_phone/<Class>/<Class>_NNN.csv`.

No data augmentation, normalization, or label manipulation is performed here.
You can open any CSV to inspect the raw numbers.

Run this script from the backend folder:

    python prepare_phone_dataset.py

After it completes, `train_cnn.py` (configured to use `data_sets_phone`) can be
used to train the CNN on these phone-based swings.
"""

from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import numpy as np
import pandas as pd


CLASSES: List[str] = [
    "Forehand",
    "Backhand",
    "Smash",
    "Push",
    "Block",
    "Flick",
    "Serve",
    "Chop",
]

FS_TARGET: float = 100.0  # Hz
SEGMENT_SAMPLES: int = 100  # final length per swing
PRE_SEG_SEC: float = 0.5  # seconds before peak
POST_SEG_SEC: float = 0.5  # seconds after peak


ROOT = Path(__file__).resolve().parent.parent
RAW_ROOT = ROOT / "data_sets"  # where your uploaded accel/gyro CSVs live
OUT_ROOT = ROOT / "data_sets_phone"  # where we will write 100x6 swing CSVs


def load_sensor_file(path: Path) -> Tuple[np.ndarray, np.ndarray]:
    """Load a Phyphox CSV with columns like

    Time (s),Acceleration x (m/s^2),Acceleration y (m/s^2),Acceleration z (m/s^2)

    Returns:
        t: shape (N,) time in seconds
        xyz: shape (N, 3) for x, y, z
    """

    df = pd.read_csv(path)
    if df.shape[1] < 4:
        raise ValueError(f"Expected at least 4 columns in {path}, got {df.columns!r}")

    time_col = df.columns[0]
    x_col, y_col, z_col = df.columns[1:4]

    t = df[time_col].to_numpy(dtype=float)
    x = df[x_col].to_numpy(dtype=float)
    y = df[y_col].to_numpy(dtype=float)
    z = df[z_col].to_numpy(dtype=float)
    xyz = np.stack([x, y, z], axis=1)
    return t, xyz


def resample_to_grid(t: np.ndarray, xyz: np.ndarray, fs: float) -> Tuple[np.ndarray, np.ndarray]:
    """Resample a (t, xyz) signal to a regular grid at sampling rate fs (Hz).

    Uses simple linear interpolation per channel. This preserves the waveform
    shape while giving us uniform sampling for merging accel and gyro.
    """

    t = np.asarray(t, dtype=float)
    xyz = np.asarray(xyz, dtype=float)
    if t.ndim != 1 or xyz.ndim != 2 or xyz.shape[0] != t.shape[0]:
        raise ValueError("Inconsistent shapes for t and xyz")

    # Sort by time and drop duplicates
    order = np.argsort(t)
    t = t[order]
    xyz = xyz[order, :]

    mask = np.ones_like(t, dtype=bool)
    mask[1:] = t[1:] > t[:-1]
    t = t[mask]
    xyz = xyz[mask, :]

    dt = 1.0 / fs
    t_min, t_max = float(t[0]), float(t[-1])
    # include the last point with a small margin
    t_grid = np.arange(t_min, t_max + 0.5 * dt, dt)

    out = np.empty((t_grid.size, xyz.shape[1]), dtype=float)
    for i in range(xyz.shape[1]):
        out[:, i] = np.interp(t_grid, t, xyz[:, i])
    return t_grid, out


def build_common_six_axis(
    accel_path: Path,
    gyro_path: Path,
    fs: float,
) -> Tuple[np.ndarray, np.ndarray]:
    """Load and merge accelerometer + gyro into a (T, 6) array on a common grid.

    Returns:
        t_grid: (T,) time in seconds
        data6: (T, 6) [acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z]
    """

    t_acc, acc = load_sensor_file(accel_path)
    t_gyr, gyr = load_sensor_file(gyro_path)

    t_acc_g, acc_g = resample_to_grid(t_acc, acc, fs)
    t_gyr_g, gyr_g = resample_to_grid(t_gyr, gyr, fs)

    # Build a common time range where both signals overlap
    t_start = max(float(t_acc_g[0]), float(t_gyr_g[0]))
    t_end = min(float(t_acc_g[-1]), float(t_gyr_g[-1]))
    if t_end <= t_start:
        raise ValueError(f"No overlapping time range between {accel_path} and {gyro_path}")

    dt = 1.0 / fs
    t_grid = np.arange(t_start, t_end + 0.5 * dt, dt)

    acc_common = np.empty((t_grid.size, 3), dtype=float)
    gyr_common = np.empty((t_grid.size, 3), dtype=float)
    for i in range(3):
        acc_common[:, i] = np.interp(t_grid, t_acc_g, acc_g[:, i])
        gyr_common[:, i] = np.interp(t_grid, t_gyr_g, gyr_g[:, i])

    data6 = np.concatenate([acc_common, gyr_common], axis=1)
    return t_grid, data6


def smooth_and_detect_peaks(
    signal: np.ndarray,
    fs: float,
    thresh_factor: float = 1.0,
    min_distance_sec: float = 0.3,
) -> List[int]:
    """Basic peak detector for swing-like motions.

    - Smooths with a short moving average.
    - Uses a threshold = mean + thresh_factor * std.
    - Keeps local maxima above threshold and enforces a minimum spacing.

    This is intentionally simple and fully visible in code so that you and
    examiners can reason about it.
    """

    signal = np.asarray(signal, dtype=float)
    n = signal.size
    if n < 3:
        return []

    # Moving average smoothing (~50 ms window)
    window = max(3, int(0.05 * fs))
    if window > 1:
        kernel = np.ones(window, dtype=float) / float(window)
        smooth = np.convolve(signal, kernel, mode="same")
    else:
        smooth = signal

    mean = float(smooth.mean())
    std = float(smooth.std()) or 1.0
    thresh = mean + thresh_factor * std

    # Local maxima above threshold
    candidates: List[int] = []
    for i in range(1, n - 1):
        if smooth[i] > thresh and smooth[i] >= smooth[i - 1] and smooth[i] >= smooth[i + 1]:
            candidates.append(i)

    if not candidates:
        return []

    # Enforce minimum spacing between peaks
    min_dist = int(min_distance_sec * fs)
    peaks: List[int] = []
    last_idx = -min_dist
    for idx in candidates:
        if idx - last_idx >= min_dist:
            peaks.append(idx)
            last_idx = idx
        else:
            # If this candidate is stronger than the last kept one, replace it
            if smooth[idx] > smooth[last_idx]:
                peaks[-1] = idx
                last_idx = idx

    return peaks


def segment_around_peaks(
    data6: np.ndarray,
    peaks: Sequence[int],
    fs: float,
    pre_sec: float,
    post_sec: float,
) -> List[np.ndarray]:
    """Extract windows around each peak.

    The windows are variable-length here; we will resample each to exactly
    SEGMENT_SAMPLES afterwards.
    """

    data6 = np.asarray(data6, dtype=float)
    n, d = data6.shape
    assert d == 6, "Expected 6 channels in data6"

    pre = int(pre_sec * fs)
    post = int(post_sec * fs)

    segments: List[np.ndarray] = []
    for p in peaks:
        start = max(0, p - pre)
        end = min(n, p + post)
        if end <= start:
            continue
        seg = data6[start:end, :]
        segments.append(seg)
    return segments


def to_fixed_length(seg: np.ndarray, target_len: int) -> np.ndarray:
    """Resample a (T, D) segment to exactly target_len time steps.

    - If T == target_len, return as-is.
    - If T > target_len, downsample via interpolation.
    - If T < target_len, upsample via interpolation.
    """

    seg = np.asarray(seg, dtype=float)
    t, d = seg.shape
    if d != 6:
        raise ValueError(f"Expected 6 channels, got {d}")

    if t == target_len:
        return seg

    # Interpolate over a normalized time axis [0, 1]
    old_x = np.linspace(0.0, 1.0, num=t)
    new_x = np.linspace(0.0, 1.0, num=target_len)
    out = np.empty((target_len, d), dtype=float)
    for j in range(d):
        out[:, j] = np.interp(new_x, old_x, seg[:, j])
    return out


def process_class(class_name: str) -> int:
    """Process one stroke class.

    Returns the number of segments written.
    """

    src_dir = RAW_ROOT / class_name
    out_dir = OUT_ROOT / class_name
    out_dir.mkdir(parents=True, exist_ok=True)

    # Try to locate accelerometer and gyro CSV files by name pattern.
    accel_candidates = list(src_dir.glob("*accelerometer*.csv"))
    gyro_candidates = list(src_dir.glob("*gyro*.csv"))

    if not accel_candidates:
        print(f"[WARN] No accelerometer CSV found for class {class_name} in {src_dir}")
        return 0
    if not gyro_candidates:
        print(f"[WARN] No gyro CSV found for class {class_name} in {src_dir}")
        return 0

    accel_path = accel_candidates[0]
    gyro_path = gyro_candidates[0]

    print(f"[INFO] Processing {class_name}:\n  accel={accel_path.name}\n  gyro={gyro_path.name}")

    t_grid, data6 = build_common_six_axis(accel_path, gyro_path, FS_TARGET)

    # Use acceleration magnitude to detect swing peaks
    acc = data6[:, :3]
    mag = np.linalg.norm(acc, axis=1)

    peaks = smooth_and_detect_peaks(mag, FS_TARGET, thresh_factor=1.0, min_distance_sec=0.3)
    if not peaks:
        print(f"[WARN] No peaks detected for class {class_name}. No segments will be created.")
        return 0

    segments = segment_around_peaks(data6, peaks, FS_TARGET, PRE_SEG_SEC, POST_SEG_SEC)

    count = 0
    for idx, seg in enumerate(segments, start=1):
        fixed = to_fixed_length(seg, SEGMENT_SAMPLES)
        df_out = pd.DataFrame(
            fixed,
            columns=["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"],
        )
        out_path = out_dir / f"{class_name}_{idx:03d}.csv"
        df_out.to_csv(out_path, index=False)
        count += 1

    print(f"[INFO] {class_name}: wrote {count} segments to {out_dir}")
    return count


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    summary: Dict[str, int] = {}
    for class_name in CLASSES:
        try:
            n = process_class(class_name)
        except Exception as exc:  # pragma: no cover - defensive
            print(f"[ERROR] Failed to process class {class_name}: {exc}")
            n = 0
        summary[class_name] = n

    print("\n=== Summary (segments per class) ===")
    for cls, n in summary.items():
        print(f"{cls:9s}: {n:3d} segments")


if __name__ == "__main__":
    main()
