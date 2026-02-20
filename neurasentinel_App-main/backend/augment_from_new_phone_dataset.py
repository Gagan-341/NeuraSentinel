from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from prepare_phone_dataset import (
    FS_TARGET,
    PRE_SEG_SEC,
    POST_SEG_SEC,
    SEGMENT_SAMPLES,
    build_common_six_axis,
    smooth_and_detect_peaks,
    segment_around_peaks,
    to_fixed_length,
)


ROOT = Path(__file__).resolve().parent.parent
NEW_ROOT = ROOT / "new_phone_dataset"
OUT_ROOT = ROOT / "data_sets_phone"

# Map folder names in new_phone_dataset to canonical class labels
CLASS_MAP = {
    "forehand1": "Forehand",
    "backhand1": "Backhand",
}


def find_accel_and_gyro_files(folder: Path):
    """Return (accelerometer_csv, gyro_csv) for a given folder, if present."""
    accel_candidates = sorted(folder.glob("*accelerometer*.csv"))
    gyro_candidates = sorted(folder.glob("*gyro*.csv"))

    if not accel_candidates or not gyro_candidates:
        print(f"[WARN] Skipping {folder}: missing accelerometer or gyro CSV")
        return None, None

    return accel_candidates[0], gyro_candidates[0]


def next_index_for_class(class_name: str) -> int:
    """Find the next available index for class_name_XXX.csv in OUT_ROOT/class_name."""
    class_dir = OUT_ROOT / class_name
    class_dir.mkdir(parents=True, exist_ok=True)

    max_idx = 0
    for csv_path in class_dir.glob(f"{class_name}_*.csv"):
        stem = csv_path.stem
        parts = stem.split("_")
        if len(parts) != 2:
            continue
        try:
            idx = int(parts[1])
        except ValueError:
            continue
        if idx > max_idx:
            max_idx = idx

    return max_idx + 1


def process_new_folder(folder: Path, label: str) -> int:
    accel_path, gyro_path = find_accel_and_gyro_files(folder)
    if accel_path is None or gyro_path is None:
        return 0

    print(f"[INFO] Processing new {label} data from {folder.name}")

    t_grid, data6 = build_common_six_axis(accel_path, gyro_path, FS_TARGET)

    # Use acceleration magnitude to detect swing peaks
    acc = data6[:, :3]
    mag = np.linalg.norm(acc, axis=1)

    peaks = smooth_and_detect_peaks(mag, FS_TARGET, thresh_factor=1.0, min_distance_sec=0.3)
    if not peaks:
        print(f"[WARN] No peaks detected in {folder}")
        return 0

    segments = segment_around_peaks(data6, peaks, FS_TARGET, PRE_SEG_SEC, POST_SEG_SEC)

    class_dir = OUT_ROOT / label
    class_dir.mkdir(parents=True, exist_ok=True)

    next_idx = next_index_for_class(label)
    count = 0
    for seg in segments:
        fixed = to_fixed_length(seg, SEGMENT_SAMPLES)
        df_out = pd.DataFrame(
            fixed,
            columns=["acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z"],
        )
        out_path = class_dir / f"{label}_{next_idx:03d}.csv"
        df_out.to_csv(out_path, index=False)
        next_idx += 1
        count += 1

    print(f"[INFO] Wrote {count} new segments for {label} to {class_dir}")
    return count


def main() -> None:
    if not NEW_ROOT.exists():
        print(f"[ERROR] {NEW_ROOT} does not exist")
        return

    total = 0
    for subdir in sorted(NEW_ROOT.iterdir()):
        if not subdir.is_dir():
            continue
        key = subdir.name.lower()
        label = CLASS_MAP.get(key)
        if label is None:
            print(f"[WARN] Ignoring folder {subdir.name} (no class mapping)")
            continue
        total += process_new_folder(subdir, label)

    print(f"Total new segments added: {total}")


if __name__ == "__main__":
    main()
