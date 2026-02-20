from dataclasses import dataclass
from typing import List, Optional

import json
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ml_model import get_classifier
from coaching import get_coaching, extract_motion_features_from_array


app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SwingSample(BaseModel):
    ax: float
    ay: float
    az: float
    gx: float
    gy: float
    gz: float
    t: float


class SwingRequest(BaseModel):
    player_id: str
    session_id: Optional[str] = None
    sampling_rate_hz: float
    samples: List[SwingSample]
    source: Optional[str] = None
    # Optional: which shot the player is intending to practice (e.g. "Forehand")
    target_shot: Optional[str] = None


class ClassificationResult(BaseModel):
    shot_type: str
    confidence: float
    speed_mps: float
    accuracy_score: float
    technique_score: int
    coaching_message: Optional[str] = None


class SwingResponse(BaseModel):
    player_id: str
    session_id: Optional[str] = None
    result: ClassificationResult
    source: Optional[str] = None


class LeaderboardEntry(BaseModel):
    player_id: str
    score: float
    rank: int


class Challenge(BaseModel):
    id: str
    title: str
    description: str
    target_shot: str
    target_accuracy: float
    status: str = "not_started"
    progress: float = 0.0
    current_accuracy: Optional[float] = None
    current_swings: Optional[int] = None


class ShotStats(BaseModel):
    shot_type: str
    count: int
    average_confidence: float
    average_speed_mps: float


class SessionStatsResponse(BaseModel):
    player_id: str
    session_id: Optional[str] = None
    shots: List[ShotStats]


class SessionSummary(BaseModel):
    session_id: Optional[str] = None
    shots: List[ShotStats]


class PlayerHistoryResponse(BaseModel):
    player_id: str
    sessions: List[SessionSummary]


class CoachingFlag(BaseModel):
    shot_type: str
    issue: str
    label: str
    severity: str = "info"


class CoachingResponse(BaseModel):
    primary_tip: str
    secondary_tip: Optional[str] = None
    flags: List[CoachingFlag]


@dataclass
class _ShotAccumulator:
    count: int = 0
    sum_confidence: float = 0.0
    sum_speed_mps: float = 0.0


_SESSION_STATS: dict = {}

_STATS_FILE = Path(__file__).resolve().parent / "data" / "session_stats.json"

_LAST_SWING_RESULT: dict = {}


def _load_session_stats() -> None:
    global _SESSION_STATS
    if not _STATS_FILE.exists():
        return
    data = json.loads(_STATS_FILE.read_text(encoding="utf-8"))
    restored: dict = {}
    for key_str, per_shot in data.items():
        player_id, session_id_raw = key_str.split("|", 1)
        session_id_val = session_id_raw or None
        inner: dict = {}
        for shot_type, acc_dict in per_shot.items():
            inner[shot_type] = _ShotAccumulator(
                count=int(acc_dict.get("count", 0)),
                sum_confidence=float(acc_dict.get("sum_confidence", 0.0)),
                sum_speed_mps=float(acc_dict.get("sum_speed_mps", 0.0)),
            )
        restored[(player_id, session_id_val)] = inner
    _SESSION_STATS = restored


def _save_session_stats() -> None:
    _STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    serializable: dict = {}
    for (player_id, session_id), per_shot in _SESSION_STATS.items():
        key = f"{player_id}|{session_id or ''}"
        serializable[key] = {}
        for shot_type, acc in per_shot.items():
            serializable[key][shot_type] = {
                "count": acc.count,
                "sum_confidence": acc.sum_confidence,
                "sum_speed_mps": acc.sum_speed_mps,
            }
    _STATS_FILE.write_text(json.dumps(serializable), encoding="utf-8")


_load_session_stats()


def _update_session_stats(
    player_id: str,
    session_id: Optional[str],
    shot_type: str,
    confidence: float,
    speed_mps: float,
) -> None:
    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key)
    if per_shot is None:
        per_shot = {}
        _SESSION_STATS[key] = per_shot
    acc = per_shot.get(shot_type)
    if acc is None:
        acc = _ShotAccumulator()
        per_shot[shot_type] = acc
    acc.count += 1
    acc.sum_confidence += float(confidence)
    acc.sum_speed_mps += float(speed_mps)

@app.get("/")
async def read_root():
    return {"status": "ok", "message": "NeuraSentinel backend running"}

from fastapi.responses import RedirectResponse

@app.get("/")
async def root_docs():
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/swing/classify", response_model=SwingResponse)
async def classify_swing(payload: SwingRequest) -> SwingResponse:
    sensor_array = np.array(
        [[s.ax, s.ay, s.az, s.gx, s.gy, s.gz] for s in payload.samples],
        dtype=float,
    )
    accel_norm = 0.0
    if sensor_array.size > 0:
        accel = sensor_array[:, :3]
        accel_norm = float(np.linalg.norm(accel, axis=1).max())

    classifier = get_classifier()

    # Default stub prediction in case model is not ready or prediction fails
    shot_type = "Forehand"
    confidence = 0.75

    if classifier.is_ready and sensor_array.size > 0:
        try:
            shot_type, confidence = classifier.predict(sensor_array)
        except Exception:
            # Fall back to stub values if anything goes wrong
            pass

    accuracy_score = float(confidence)

    # Extract simple motion features for advanced biomechanics feedback
    motion_features = (
        extract_motion_features_from_array(sensor_array)
        if sensor_array.size > 0
        else None
    )

    # Compute per-swing coaching metadata based on intended shot (if provided)
    coaching = get_coaching(
        selected_shot=payload.target_shot,
        predicted_shot=shot_type,
        confidence=float(confidence),
        speed=float(accel_norm),
        motion_features=motion_features,
    )

    result = ClassificationResult(
        shot_type=shot_type,
        confidence=float(confidence),
        speed_mps=float(accel_norm),
        accuracy_score=float(accuracy_score),
        technique_score=int(coaching.get("technique_score", int(accuracy_score * 100))),
        coaching_message=coaching.get("message"),
    )

    _update_session_stats(
        player_id=payload.player_id,
        session_id=payload.session_id,
        shot_type=shot_type,
        confidence=confidence,
        speed_mps=accel_norm,
    )
    _save_session_stats()

    # Remember the most recent result for this (player, session)
    _LAST_SWING_RESULT[(payload.player_id, payload.session_id)] = result

    return SwingResponse(
        player_id=payload.player_id,
        session_id=payload.session_id,
        result=result,
        source=payload.source,
    )


@app.get("/api/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard() -> List[LeaderboardEntry]:
    entries = [
        LeaderboardEntry(player_id="player_1", score=98.5, rank=1),
        LeaderboardEntry(player_id="player_2", score=92.0, rank=2),
        LeaderboardEntry(player_id="player_3", score=88.0, rank=3),
    ]
    return entries


@app.get("/api/session-stats", response_model=SessionStatsResponse)
async def get_session_stats(player_id: str, session_id: Optional[str] = None) -> SessionStatsResponse:
    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key, {})

    shots: List[ShotStats] = []
    for shot_type, acc in per_shot.items():
        if acc.count <= 0:
            continue
        shots.append(
            ShotStats(
                shot_type=shot_type,
                count=acc.count,
                average_confidence=acc.sum_confidence / acc.count,
                average_speed_mps=acc.sum_speed_mps / acc.count,
            )
        )

    shots.sort(key=lambda s: s.shot_type)

    return SessionStatsResponse(player_id=player_id, session_id=session_id, shots=shots)


@app.get("/api/last-swing", response_model=SwingResponse)
async def get_last_swing(player_id: str, session_id: Optional[str] = None) -> SwingResponse:
    key = (player_id, session_id)
    result = _LAST_SWING_RESULT.get(key)
    if result is None:
        raise HTTPException(status_code=404, detail="No swings yet for this session.")

    return SwingResponse(player_id=player_id, session_id=session_id, result=result)


@app.get("/api/challenges", response_model=List[Challenge])
async def get_challenges(player_id: str = "practice_player", session_id: Optional[str] = "practice_session") -> List[Challenge]:
    base_challenges = [
        Challenge(
            id="c1",
            title="Forehand Accuracy",
            description="Hit 20 consistent forehands above 80% accuracy.",
            target_shot="Forehand",
            target_accuracy=0.8,
        ),
        Challenge(
            id="c2",
            title="Backhand Power",
            description="Perform 10 strong backhands with high racket speed.",
            target_shot="Backhand",
            target_accuracy=0.75,
        ),
    ]

    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key, {})

    challenges: List[Challenge] = []
    for ch in base_challenges:
        stats = per_shot.get(ch.target_shot)
        if stats is None or stats.count <= 0:
            ch.status = "not_started"
            ch.progress = 0.0
            ch.current_accuracy = None
            ch.current_swings = 0
        else:
            current_acc = stats.sum_confidence / stats.count
            ch.current_accuracy = float(current_acc)
            ch.current_swings = int(stats.count)
            if current_acc >= ch.target_accuracy:
                ch.status = "completed"
                ch.progress = 1.0
            else:
                ch.status = "in_progress"
                ch.progress = float(max(0.0, min(1.0, current_acc / ch.target_accuracy)))
        challenges.append(ch)

    return challenges


@app.get("/api/player-history", response_model=PlayerHistoryResponse)
async def get_player_history(player_id: str) -> PlayerHistoryResponse:
    sessions: List[SessionSummary] = []

    for (pid, sid), per_shot in _SESSION_STATS.items():
        if pid != player_id:
            continue
        shots: List[ShotStats] = []
        for shot_type, acc in per_shot.items():
            if acc.count <= 0:
                continue
            shots.append(
                ShotStats(
                    shot_type=shot_type,
                    count=acc.count,
                    average_confidence=acc.sum_confidence / acc.count,
                    average_speed_mps=acc.sum_speed_mps / acc.count,
                )
            )
        shots.sort(key=lambda s: s.shot_type)
        sessions.append(SessionSummary(session_id=sid, shots=shots))

    # Sort sessions by session_id (None last)
    sessions.sort(key=lambda s: (s.session_id is None, s.session_id or ""))

    return PlayerHistoryResponse(player_id=player_id, sessions=sessions)


@app.get("/api/coaching-insights", response_model=CoachingResponse)
async def get_coaching_insights(
    player_id: str = "practice_player",
    session_id: Optional[str] = "practice_session",
) -> CoachingResponse:
    key = (player_id, session_id)
    per_shot = _SESSION_STATS.get(key, {})
    if not per_shot:
        return CoachingResponse(
            primary_tip="No swings logged yet for this session. Hit a few balls to unlock coaching insights.",
            secondary_tip=None,
            flags=[],
        )

    flags: List[CoachingFlag] = []
    worst_shot: Optional[tuple[str, float, float]] = None
    worst_accuracy = 1.0

    for shot_type, acc in per_shot.items():
        if acc.count <= 0:
            continue
        accuracy = acc.sum_confidence / acc.count
        avg_speed = acc.sum_speed_mps / acc.count

        if accuracy < worst_accuracy:
            worst_accuracy = accuracy
            worst_shot = (shot_type, accuracy, avg_speed)

        if accuracy < 0.6 and avg_speed > 20.0:
            flags.append(
                CoachingFlag(
                    shot_type=shot_type,
                    issue="rushed_swing",
                    label="Rushed swing – pace is high but control drops.",
                    severity="warning",
                )
            )
        elif accuracy < 0.6 and avg_speed < 10.0:
            flags.append(
                CoachingFlag(
                    shot_type=shot_type,
                    issue="weak_pace",
                    label="Weak pace – add more acceleration through the ball.",
                    severity="info",
                )
            )
        elif 0.6 <= accuracy < 0.75:
            flags.append(
                CoachingFlag(
                    shot_type=shot_type,
                    issue="inconsistent_contact",
                    label="Inconsistent contact – base is good, needs more repetition.",
                    severity="info",
                )
            )

    if worst_shot is None:
        return CoachingResponse(
            primary_tip="Session data is too sparse for detailed coaching. Keep rallying a bit longer.",
            secondary_tip=None,
            flags=flags,
        )

    shot_type, accuracy, avg_speed = worst_shot
    acc_pct = float(accuracy * 100.0)

    if accuracy < 0.6 and avg_speed > 20.0:
        primary_tip = (
            f"Your {shot_type} is powerful but wild ({acc_pct:.1f}% accuracy). "
            "Slow the first half of the swing and focus on clean contact, then re-add speed."
        )
        secondary_tip = (
            "Try 10 medium-pace swings first, then 10 at match pace while keeping the same contact point."
        )
    elif accuracy < 0.6:
        primary_tip = (
            f"Your {shot_type} needs more stability ({acc_pct:.1f}% accuracy). "
            "Stay lower on the legs and exaggerate a smooth follow-through."
        )
        secondary_tip = (
            "Aim for 3 sets of 10 relaxed swings where the ball lands safely before adding more pace."
        )
    elif accuracy < 0.75:
        primary_tip = (
            f"Solid base on the {shot_type} ({acc_pct:.1f}% accuracy). "
            "Lock in your rhythm, then start experimenting with placement."
        )
        secondary_tip = "Use cross-court then down-the-line patterns while keeping the same swing tempo."
    else:
        primary_tip = (
            f"Your {shot_type} is a clear strength ({acc_pct:.1f}% accuracy). "
            "Start using it as your go-to finishing shot in points."
        )
        secondary_tip = "Mix in deeper, faster versions of this shot to pressure opponents once you are comfortable."

    return CoachingResponse(primary_tip=primary_tip, secondary_tip=secondary_tip, flags=flags)


@app.get("/api/model-metrics")
async def get_model_metrics() -> dict:
    metrics_path = Path(__file__).resolve().parent / "models" / "neurasentinel_metrics.json"
    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="Model metrics not found. Train the model first.")
    try:
        data = json.loads(metrics_path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Failed to read metrics: {exc}")
    return data
