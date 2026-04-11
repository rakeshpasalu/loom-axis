# Loomaxis Studio Backend

The backend is a FastAPI service that validates Zeebe targets, stages BPMN uploads, and returns rollout summaries that the frontend can render cleanly.

## Run

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn main:app --reload
```

## Test

```bash
pytest
```

## Endpoints

- `POST /test-connection`: Validates a gateway target and probes topology.
- `POST /deploy`: Validates uploads and deploys BPMN resources to Zeebe.
- `GET /`: Service metadata and capability summary.
- `GET /health`: Liveness-style health payload.

## Notes

- The service validates address format, file count, file size, and BPMN extensions before deployment.
- `basic` and `oauth` auth profiles are accepted as payload metadata, but secure credential passthrough is not fully implemented yet.
