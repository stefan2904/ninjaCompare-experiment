{
  "id": "f1abfa39",
  "title": "Make basket comparison UI wide enough to fit 4 stores if the screen is wide enough",
  "tags": [],
  "status": "done",
  "created_at": "2026-02-22T19:25:29.376Z"
}

Increased `.comparison-content` max-width from 900px to 1280px in `dashboard/styles.css`.

The store grid already uses `repeat(auto-fit, minmax(280px, 1fr))`, so it will automatically show 4 columns when the container is wide enough (~1168px for 4 × 280px + gaps), and gracefully falls back to fewer columns on narrower screens. The mobile breakpoint at 600px still forces a single-column layout.
