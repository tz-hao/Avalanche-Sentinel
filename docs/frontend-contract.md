# Gemini Frontend Contract

Gemini only consumes the typed client in `src/lib/sentinel-api.ts` and types in `src/contracts`. It must not replace a failed request with mock or browser-persisted data.

All routes require the HttpOnly admin session returned by `POST /api/v1/admin/session`. A `401` means redirect the user to `/login`; `503 AUTH_NOT_CONFIGURED` means show an explicit setup error.

| Route | Method | Response |
| --- | --- | --- |
| `/api/v1/overview` | GET | `OverviewRecord` |
| `/api/v1/chains` | GET | configured chains |
| `/api/v1/monitors` | GET, POST | `MonitorRecord` collection or created record |
| `/api/v1/monitors/:id` | PATCH | updated monitor |
| `/api/v1/incidents` | GET | filtered incidents |
| `/api/v1/incidents/:id` | GET | incident with Evidence and Timeline |
| `/api/v1/incidents/:id/ack` | POST | acknowledged incident |

Native and token thresholds are strings in smallest units. Do not turn them into JavaScript floating-point values. `RECOVERED` incidents have no UI action to manually reopen or recover them.
