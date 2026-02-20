@echo off
echo ============================================
echo   Testing NeuraSentinel Backend Endpoints
echo ============================================
echo.

REM ---- 1. Health Check ----
echo [1] /health
curl -i http://127.0.0.1:8000/health
echo.
echo --------------------------------------------
echo.

REM ---- 2. Classify Swing ----
echo [2] /api/swing/classify
curl -i -X POST http://127.0.0.1:8000/api/swing/classify ^
 -H "Content-Type: application/json" ^
 -d "{ \"player_id\":\"test_player\", \"sampling_rate_hz\":50, \"samples\":[ {\"ax\":0,\"ay\":0,\"az\":0,\"gx\":0,\"gy\":0,\"gz\":0,\"t\":0} ] }"
echo.
echo --------------------------------------------
echo.

REM ---- 3. Leaderboard ----
echo [3] /api/leaderboard
curl -i http://127.0.0.1:8000/api/leaderboard
echo.
echo --------------------------------------------
echo.

REM ---- 4. Session Stats ----
echo [4] /api/session-stats
curl -i "http://127.0.0.1:8000/api/session-stats?player_id=test_player"
echo.
echo --------------------------------------------
echo.

REM ---- 5. Last Swing ----
echo [5] /api/last-swing
curl -i "http://127.0.0.1:8000/api/last-swing?player_id=test_player"
echo.
echo --------------------------------------------
echo.

REM ---- 6. Challenges ----
echo [6] /api/challenges
curl -i http://127.0.0.1:8000/api/challenges
echo.
echo --------------------------------------------
echo.

REM ---- 7. Player History ----
echo [7] /api/player-history
curl -i "http://127.0.0.1:8000/api/player-history?player_id=test_player"
echo.
echo --------------------------------------------
echo.

REM ---- 8. Coaching Insights ----
echo [8] /api/coaching-insights
curl -i http://127.0.0.1:8000/api/coaching-insights
echo.
echo --------------------------------------------
echo.

REM ---- 9. Model Metrics ----
echo [9] /api/model-metrics
curl -i http://127.0.0.1:8000/api/model-metrics
echo.
echo --------------------------------------------

echo.
echo ====== All Tests Completed ======
pause
