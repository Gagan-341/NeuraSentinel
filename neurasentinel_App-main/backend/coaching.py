from __future__ import annotations

"""Per-swing coaching logic for NeuraSentinel.

This module provides lightweight, rule-based coaching feedback based on:
- selected shot (what the player is practicing)
- predicted shot from the CNN model
- prediction confidence
- approximate swing speed (m/s)

It is intentionally simple and transparent so examiners can audit the
behaviour without needing to inspect the ML internals.
"""

from typing import Dict, Any

import numpy as np


SHOT_CORRECTIONS: Dict[str, Dict[str, str]] = {
    "Forehand": {
        "Push": "Your racket angle is too vertical. A forehand should brush forward and slightly upward.",
        "Chop": "Your swing is too downward. Lift your stroke and swing forward instead of only cutting down.",
        "Block": "Your motion is too short and stiff. Extend your arm and follow through across your body.",
        "Smash": "You are swinging too vertically. Flatten your contact point for a proper forehand topspin.",
    },
    "Backhand": {
        "Push": "Your stroke resembles a push. Stay closer to the table, keep the elbow in front, and guide the ball forward.",
        "Chop": "You are cutting downward. For a backhand drive, keep the bat higher and swing forward with a stable wrist.",
        "Block": "Motion is very short like a block. Add a bit more forearm rotation for a full backhand swing.",
        "Smash": "You are over-hitting. A backhand drive is compact and horizontal, not a full smash arc.",
    },
    "Flick": {
        "Push": "Lift your wrist more. A flick needs a quick upward acceleration, not a flat push.",
        "Chop": "Avoid downward cutting. A flick uses an upward wrist snap over the ball.",
        "Block": "Use more wrist acceleration and a sharper contact to turn this into a true flick.",
        "Serve": "This motion looks like a serve. For a flick, use a short, sharp upward motion off the bounce.",
    },
    "Smash": {
        "Forehand": "Power is too low for a smash. Load more with legs and shoulder, then accelerate through the ball.",
        "Chop": "Avoid slicing downward. A smash is a direct, explosive stroke through the ball.",
        "Push": "Motion is too soft. A smash requires high acceleration and a committed hit.",
    },
    "Push": {
        "Forehand": "Push is a soft, forward motion. Reduce power and keep the racket angle more open.",
        "Backhand": "Reduce wrist rotation and keep the contact short and forward for a proper push.",
    },
    "Block": {
        "Forehand": "You are swinging too much. A block should be short and firm, using the opponent's pace.",
        "Backhand": "Minimise wrist movement. Keep the bat stable and guide the ball back with a compact stroke.",
    },
    "Serve": {
        "Forehand": "Too much rally-style motion. Serve requires a distinct toss and sharp wrist action.",
        "Backhand": "Wrist angle does not match serve mechanics. Focus on a consistent toss and contact point.",
    },
    "Chop": {
        "Forehand": "Swing is too forward. A chop should move more downward with a slicing motion.",
        "Backhand": "Use more downward slicing with a relaxed wrist to generate heavy backspin.",
    },
}


def extract_motion_features_from_array(sensor_array: np.ndarray) -> Dict[str, float]:
    """Extract simple biomechanical features from a (T, 6) IMU window.

    Expects columns [ax, ay, az, gx, gy, gz]. This is intentionally light-weight
    and transparent so the behaviour is easy to reason about in a viva.
    """

    if sensor_array.size == 0:
        return {}

    arr = np.asarray(sensor_array, dtype=float)
    if arr.ndim != 2 or arr.shape[1] < 6:
        return {}

    acc = arr[:, :3]
    gyro = arr[:, 3:6]

    mag = np.linalg.norm(acc, axis=1)
    speed = float(np.max(mag))

    avg_acc = np.mean(acc, axis=0)
    avg_gyro = np.mean(gyro, axis=0)

    horizontal_power = float(abs(avg_acc[0]))  # approx forward component
    vertical_power = float(avg_acc[2])
    upward_power = float(max(0.0, vertical_power))
    downward_power = float(max(0.0, -vertical_power))

    wrist_rotation = float(abs(avg_gyro[2]))  # z-axis rotation as wrist proxy

    # Follow-through: average magnitude over last ~30% of samples
    if mag.size >= 10:
        start_idx = int(0.6 * mag.size)
        follow_through = float(np.mean(mag[start_idx:]))
    else:
        follow_through = 0.0

    return {
        "speed": speed,
        "horizontal_power": horizontal_power,
        "upward_power": upward_power,
        "downward_power": downward_power,
        "wrist_rotation": wrist_rotation,
        "follow_through": follow_through,
    }


def advanced_coaching(selected_shot: str, motion: Dict[str, float]) -> str:
    """Generate biomechanics-oriented feedback based on motion features."""

    msg: list[str] = []

    # --- SPEED FEEDBACK ---
    if motion["speed"] < 12.0:
        msg.append("Swing too weak. Use more body rotation and weight transfer.")
    elif motion["speed"] > 20.0:
        msg.append("Good power – strong acceleration through the stroke.")

    # --- SWING PLANE ---
    if selected_shot in ["Forehand", "Backhand"]:
        if motion["downward_power"] > motion["upward_power"]:
            msg.append("Your stroke is too downward. Lift your swing slightly upward.")
        if motion["horizontal_power"] < 6.0:
            msg.append("Insufficient forward motion – extend your arm more forward.")

    # --- WRIST ROTATION ---
    if selected_shot in ["Forehand", "Flick", "Backhand"]:
        if motion["wrist_rotation"] < 8.0:
            msg.append("Increase your wrist rotation for better spin and control.")

    # --- FOLLOW THROUGH ---
    if motion["follow_through"] < 5.0:
        msg.append("Your follow-through is too short. Continue the swing after impact.")

    return " ".join(msg) if msg else "Great technique – motion matches expected biomechanics."


def get_coaching(
    selected_shot: str | None,
    predicted_shot: str,
    confidence: float,
    speed: float,
    motion_features: Dict[str, float] | None = None,
) -> dict:
    """Generate AI coaching feedback based on correctness and motion quality.

    Args:
        selected_shot: The shot the player is intending to practice (may be None).
        predicted_shot: The shot type predicted by the CNN.
        confidence: Model confidence for the predicted class (0-1).
        speed: Approximate swing speed in m/s based on IMU magnitude.

    Returns:
        dict with keys:
        - technique_score: int 0-100
        - message: short coaching string
    """

    # Normalise labels
    predicted = (predicted_shot or "").strip()
    selected = (selected_shot or predicted).strip()

    # Base score from confidence
    technique_score = int(round(max(0.0, min(confidence, 1.0)) * 100))

    # High-level correctness / mapping message
    if predicted == selected and confidence >= 0.85:
        message = "Excellent! Your technique is strong for this shot."
    elif predicted == selected and 0.60 <= confidence < 0.85:
        message = (
            "Good attempt – technique is recognisable but a bit inconsistent. "
            "Focus on clean contact and full follow-through."
        )
    else:
        wrong_map = SHOT_CORRECTIONS.get(selected, {})
        wrong_msg = wrong_map.get(
            predicted,
            "Your motion does not fully match the selected shot. Review the tutorial and focus on racket angle and swing path.",
        )

        # Pace hint for wrong shots
        if speed < 8.0:
            pace_hint = " Swing speed is quite low – drive more from legs and hips."
        elif speed > 22.0:
            pace_hint = " Pace is high – make sure you stay balanced and in control."
        else:
            pace_hint = ""

        message = wrong_msg + pace_hint

    # Append advanced biomechanical feedback if available
    if motion_features:
        advanced_msg = advanced_coaching(selected, motion_features)
        if advanced_msg:
            message = f"{message} {advanced_msg}"

    return {
        "technique_score": technique_score,
        "message": message,
    }
