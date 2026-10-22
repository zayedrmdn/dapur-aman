"""Read-only production check: health, logins, role guards and response fields.

Run from backend/:  uv run python scripts/prod_check.py [BASE_URL]
BASE_URL defaults to http://127.0.0.1:8000; pass the tunnel URL to check through Cloudflare.
Reads BACKEND_SHARED_SECRET and SEED_*_PASSWORD from backend/.env and never prints them.
Sends only GET requests and login POSTs; never changes data.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

STAFF_USERNAME = "staff1"
SUPERVISOR_USERNAME = "supervisor1"
results = []


def opener_for(base_url):
    host = urlparse(base_url).hostname
    if host in ("127.0.0.1", "localhost"):
        return urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener()


def call(opener, base_url, method, path, body=None, actor=None, with_secret=True):
    headers = {"Content-Type": "application/json", "User-Agent": "dapur-aman-prod-check"}
    if with_secret:
        headers["X-Shared-Secret"] = os.getenv("BACKEND_SHARED_SECRET", "")
    if actor:
        headers["X-Actor-Id"] = actor
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base_url + path, data=data, headers=headers, method=method)
    try:
        with opener.open(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        return error.code, None
    except Exception as error:
        return f"{type(error).__name__}", None


def check(name, passed, reason=""):
    results.append(passed)
    print(f"{'PASS' if passed else 'FAIL'}  {name}" + ("" if passed else f"  ({reason})"))


def missing_keys(item, keys):
    return [key for key in keys if key not in (item or {})]


def main():
    base_url = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
    opener = opener_for(base_url)
    if not os.getenv("BACKEND_SHARED_SECRET"):
        print("FAIL  BACKEND_SHARED_SECRET is not set in backend/.env")
        return 1

    status, body = call(opener, base_url, "GET", "/health", with_secret=False)
    check("health", status == 200 and (body or {}).get("status") == "ok", f"status {status}")

    status, _ = call(opener, base_url, "GET", "/api/overview", with_secret=False)
    check("data route without secret is 401", status == 401, f"status {status}")

    actors = {}
    for username, password_name, role in (
        (STAFF_USERNAME, "SEED_STAFF_PASSWORD", "kitchen_staff"),
        (SUPERVISOR_USERNAME, "SEED_SUPERVISOR_PASSWORD", "supervisor"),
    ):
        password = os.getenv(password_name, "")
        if not password:
            check(f"login {username}", False, f"{password_name} not set in backend/.env")
            continue
        status, body = call(opener, base_url, "POST", "/api/auth/login", {"username": username, "password": password})
        actors[role] = (body or {}).get("actor_id")
        check(f"login {username}", status == 200 and (body or {}).get("role") == role, f"status {status}, role {(body or {}).get('role')}")

    status, _ = call(opener, base_url, "POST", "/api/auth/login", {"username": STAFF_USERNAME, "password": "wrong-password-check"})
    check("wrong password is 401", status == 401, f"status {status}")

    staff, supervisor = actors.get("kitchen_staff"), actors.get("supervisor")
    if not (staff and supervisor):
        check("role checks", False, "skipped: both logins are needed")
        return 1

    status, _ = call(opener, base_url, "GET", "/api/supervisor/dashboard", actor=staff)
    check("staff on supervisor dashboard is 403", status == 403, f"status {status}")

    status, dashboard = call(opener, base_url, "GET", "/api/supervisor/dashboard", actor=supervisor)
    batches = (dashboard or {}).get("batches") or []
    gaps = missing_keys(dashboard, ["batches", "safety_feed", "schools"]) + missing_keys(batches[0] if batches else {}, ["status", "hold_reason"])
    check("supervisor dashboard fields", status == 200 and not gaps, f"status {status}, missing {gaps}")

    status, overview = call(opener, base_url, "GET", "/api/overview", actor=staff)
    rows = (overview or {}).get("packing_photos") or []
    gaps = missing_keys(rows[0] if rows else {}, ["status", "hold_reason"])
    check("staff overview fields", status == 200 and not gaps, f"status {status}, missing {gaps}")

    if batches:
        batch_id = batches[0].get("batch_id") or batches[0].get("id")
        status, detail = call(opener, base_url, "GET", f"/api/batches/{batch_id}", actor=staff)
        gaps = missing_keys(detail, ["status", "hold_reason", "runs", "findings", "actions"])
        check("batch detail fields", status == 200 and not gaps, f"status {status}, missing {gaps}")

    failed = results.count(False)
    print(f"{len(results) - failed}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
