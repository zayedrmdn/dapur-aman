# Isolated staff journey check

Run from separate terminals. These credentials belong only to this in-memory test server. No Vertex, Neon, or S3 calls are made. The three ADK agents and rule tools run with scripted model replies; the UI labels those results as tests. Stopping the server discards its data.

From `backend/`:

```powershell
uv run --with pytest python tests/local_mvp_server.py
```

From `frontend/`, test session security and the real server handlers against that test backend:

```powershell
node --test --test-isolation=none tests/session.test.mjs tests/staff-api.test.cjs
```

For the browser journey, in a separate `frontend/` terminal:

```powershell
$env:BACKEND_URL='http://127.0.0.1:8765'
$env:BACKEND_SHARED_SECRET='synthetic-local-secret'
$env:SESSION_SECRET='synthetic-local-session-signing-key-32-characters'
bun run dev --hostname 127.0.0.1 --port 3123
```

Open `http://127.0.0.1:3123`, sign in as `local_staff` with `local-test-password` (or `local_supervisor`, same password, for the supervisor feed and holds), and upload a JPEG/PNG/WebP with a table name and menu. Verify markers, rule references, uncertainty and saved AI activity; record a correction, refresh, then retake. Enter `FAIL` in the menu to exercise an intentionally failing scripted run. Check that its latest status never becomes clean. These environment overrides apply only to the current terminal; do not save them in real environment files.

The automated handler test does not exercise browser hydration, canvas resizing, or visual layout. Those remain a browser check. On the restricted Windows agent environment, normal Next builds and browser spawns may fail with `EPERM`; TypeScript and an in-memory worker-thread build can run without changing project configuration.

For actual backend operation use the existing real configuration and separately approve paid calls and live data writes. Backend shared secrets remain server-only. Sessions require a `SESSION_SECRET` of at least 32 characters. Mutation routes reject cross-origin requests; actor identity comes from the signed cookie. The local demo uses process-local rate/concurrency limits, not a distributed production limiter.
