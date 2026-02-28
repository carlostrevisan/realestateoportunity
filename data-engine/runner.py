"""
runner.py — Flask HTTP job runner for the data-worker service.

Exposes an internal HTTP API (port 5000, Docker network only) that the
Express backend proxies to. Each job runs as a subprocess so there is no
shared Python state between runs.

Routes:
  POST /run/scrape    { market, type, start?, end? }
  POST /run/train     {}
  POST /run/score     {}
  POST /jobs/:id/stop stop a running job
  GET  /jobs/:id      returns { status, logs, started_at, completed_at }
  GET  /jobs          returns list of recent jobs
  GET  /health        liveness check
"""

import os
import sys
import threading
import uuid
import subprocess
import signal
from datetime import datetime, timezone
from collections import OrderedDict

from flask import Flask, jsonify, request

app = Flask(__name__)

# In-memory job store — keeps the last 50 jobs
_lock = threading.Lock()
_jobs: OrderedDict = OrderedDict()
_processes = {} # job_id -> subprocess.Popen
MAX_JOBS = 50
MAX_LOG_LINES = 1000


def _make_job(job_type: str, meta: dict = None) -> str:
    job_id = uuid.uuid4().hex[:10]
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "type": job_type,
            "meta": meta or {},
            "status": "pending",
            "logs": [],
            "started_at": None,
            "completed_at": None,
            "returncode": None,
        }
        # Evict oldest if over limit
        while len(_jobs) > MAX_JOBS:
            _jobs.popitem(last=False)
    return job_id


def _run_subprocess(job_id: str, cmd: list[str]):
    """Run cmd as a subprocess, streaming output into the job log."""
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}

    with _lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["started_at"] = _now()

    try:
        # Use start_new_session to create a process group for easy termination
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd="/app",
            env=env,
            start_new_session=True 
        )
        
        _processes[job_id] = process

        for line in iter(process.stdout.readline, ""):
            line = line.rstrip()
            if line:
                with _lock:
                    _jobs[job_id]["logs"].append(line)
                    if len(_jobs[job_id]["logs"]) > MAX_LOG_LINES:
                        _jobs[job_id]["logs"] = _jobs[job_id]["logs"][-MAX_LOG_LINES:]

        process.wait()
        rc = process.returncode

        with _lock:
            # If we manually killed it, status might already be set
            if _jobs[job_id]["status"] == "running":
                _jobs[job_id]["returncode"] = rc
                _jobs[job_id]["status"] = "completed" if rc == 0 else "failed"

    except Exception as exc:
        with _lock:
            if _jobs[job_id]["status"] == "running":
                _jobs[job_id]["logs"].append(f"[runner] Exception: {exc}")
                _jobs[job_id]["status"] = "failed"
    finally:
        _processes.pop(job_id, None)
        with _lock:
            _jobs[job_id]["completed_at"] = _now()


def _spawn(job_id: str, cmd: list[str]):
    """Spawn a daemon thread to run the subprocess."""
    t = threading.Thread(target=_run_subprocess, args=(job_id, cmd), daemon=True)
    t.start()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_snapshot(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return None
        return dict(job)  # shallow copy is fine for primitive values + list ref


# ── Routes ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return jsonify({"status": "ok", "jobs": len(_jobs)})


@app.get("/jobs")
def list_jobs():
    with _lock:
        jobs = [dict(j) for j in reversed(list(_jobs.values()))]
    # Omit log body in list view for efficiency
    for j in jobs:
        j["log_lines"] = len(j.pop("logs", []))
    return jsonify(jobs)


@app.get("/jobs/<job_id>")
def get_job(job_id):
    job = _job_snapshot(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.post("/jobs/<job_id>/stop")
def stop_job(job_id):
    process = _processes.get(job_id)
    if not process:
        return jsonify({"error": "Job not running or already finished"}), 404
    
    try:
        # Kill the entire process group
        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        with _lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["logs"].append("[runner] Job stopped by user.")
        return jsonify({"status": "stopping"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/run/scrape")
def run_scrape():
    data = request.get_json(force=True) or {}
    scrape_type = data.get("type", "for_sale")   # "for_sale" | "sold"
    market = data.get("market")
    zip_code = data.get("zip")
    start = data.get("start")
    end = data.get("end")
    throttle = data.get("throttle")
    force_renew = data.get("force_renew", False)
    all_zips = data.get("all_zips", False)

    if scrape_type not in ("for_sale", "sold"):
        return jsonify({"error": "type must be for_sale or sold"}), 400

    if not market and not zip_code:
        return jsonify({"error": "Provide market or zip"}), 400

    if scrape_type == "sold" and not (start and end):
        return jsonify({"error": "sold type requires start and end (YYYY-MM)"}), 400

    # Build CLI command
    target = f"--zip {zip_code}" if zip_code else f"--market {market}"
    cmd = [sys.executable, "scraper.py", *target.split(), "--type", scrape_type]
    if scrape_type == "sold":
        cmd += ["--start", start, "--end", end]
    if throttle:
        cmd += ["--throttle", str(throttle)]
    if force_renew:
        cmd += ["--force-renew"]
    if all_zips:
        cmd += ["--all-zips"]

    job_id = _make_job("scrape", {"scrape_type": scrape_type, "market": market, "zip": zip_code, "start": start, "end": end, "throttle": throttle, "force_renew": force_renew, "all_zips": all_zips})
    _spawn(job_id, cmd)

    return jsonify({"job_id": job_id, "status": "started", "cmd": " ".join(cmd)})


@app.post("/run/train")
def run_train():
    body = request.get_json(silent=True) or {}
    cmd = [sys.executable, "ml_model.py", "--train"]
    if "n_estimators" in body:   cmd += ["--n-estimators",   str(body["n_estimators"])]
    if "max_depth" in body:      cmd += ["--max-depth",      str(body["max_depth"])]
    if "lr" in body:             cmd += ["--lr",             str(body["lr"])]
    if "min_year_built" in body: cmd += ["--min-year-built", str(body["min_year_built"])]
    if "test_split" in body:     cmd += ["--test-split",     str(body["test_split"])]
    job_id = _make_job("train")
    _spawn(job_id, cmd)
    return jsonify({"job_id": job_id, "status": "started"})


@app.post("/run/score")
def run_score():
    job_id = _make_job("score")
    _spawn(job_id, [sys.executable, "ml_model.py", "--score"])
    return jsonify({"job_id": job_id, "status": "started"})


@app.post("/run/census")
def run_census():
    job_id = _make_job("census")
    _spawn(job_id, [sys.executable, "census_fetcher.py", "--all"])
    return jsonify({"job_id": job_id, "status": "started"})


@app.post("/reset")
def reset_data():
    """Deletes the persistent CSV file."""
    csv_path = "data/scraped_listings.csv"
    try:
        if os.path.exists(csv_path):
            os.remove(csv_path)
            return jsonify({"status": "ok", "message": "CSV deleted"})
        return jsonify({"status": "ok", "message": "No CSV found to delete"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("WORKER_PORT", 5000))
    print(f"[runner] Starting on port {port}", flush=True)
    app.run(host="0.0.0.0", port=port, threaded=True)
