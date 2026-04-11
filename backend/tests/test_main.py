from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from main import app


client = TestClient(app)


def test_root_exposes_service_metadata():
    response = client.get("/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "Loomaxis Studio API"
    assert payload["capabilities"]["deploy_bpmn"] is True


def test_health_check_returns_timestamp():
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["timestamp"]


def test_connection_validation_rejects_missing_port():
    response = client.post(
        "/test-connection",
        data={
            "zeebe_address": "localhost",
            "auth_data": "{}",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["success"] is False
    assert "host:port" in payload["message"]


def test_deploy_rejects_non_bpmn_file():
    response = client.post(
        "/deploy",
        data={
            "zeebe_address": "localhost",
            "auth_data": "{}",
        },
        files={"files": ("notes.txt", b"not-a-bpmn", "text/plain")},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["results"][0]["type"] == "validation"
