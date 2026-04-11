from __future__ import annotations

import json
import os
import socket
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pyzeebe import ZeebeClient, create_insecure_channel
from pyzeebe.errors import ZeebeGatewayUnavailableError

APP_NAME = "Loomaxis Studio API"
APP_VERSION = "2.0.0"
ALLOWED_EXTENSIONS = {".bpmn"}
MAX_FILES_PER_REQUEST = int(os.getenv("MAX_FILES_PER_REQUEST", "50"))
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_FILE_SIZE_BYTES", str(5 * 1024 * 1024)))
SOCKET_TIMEOUT_SECONDS = int(os.getenv("SOCKET_TIMEOUT_SECONDS", "5"))
SUPPORTED_AUTH_TYPES = {"none", "basic", "oauth"}
IMPLEMENTED_AUTH_TYPES = {"none"}

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
    if origin.strip()
]
allow_all_origins = "*" in cors_origins

app = FastAPI(title=APP_NAME, version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_zeebe_address(address: str) -> tuple[bool, str]:
    if not address:
        return False, "Zeebe address cannot be empty."

    if ":" not in address:
        return False, "Use host:port format, for example localhost:26500."

    try:
        host, port = address.split(":", 1)
    except ValueError:
        return False, "Invalid address format. Use host:port."

    if not host:
        return False, "Host cannot be empty."

    if not port.isdigit():
        return False, "Port must be numeric."

    port_number = int(port)
    if not 1 <= port_number <= 65535:
        return False, "Port must be between 1 and 65535."

    return True, "Address format looks valid."


def check_tcp_connection(address: str) -> tuple[bool, str]:
    host, port = address.split(":", 1)

    try:
        with socket.create_connection((host, int(port)), timeout=SOCKET_TIMEOUT_SECONDS):
            return True, "TCP connection to the Zeebe gateway succeeded."
    except socket.timeout:
        return False, f"Connection timed out while reaching {address}."
    except socket.gaierror:
        return False, f"DNS resolution failed for {host}."
    except ConnectionRefusedError:
        return False, f"{address} refused the connection."
    except OSError as error:
        return False, f"Connection to {address} failed: {error}."


def parse_auth_data(raw_auth_data: str) -> dict[str, Any]:
    try:
        auth_info = json.loads(raw_auth_data or "{}")
        if not isinstance(auth_info, dict):
            return {"auth_type": "none"}
    except json.JSONDecodeError:
        return {"auth_type": "none"}

    auth_type = auth_info.get("auth_type", "none")
    if auth_type not in SUPPORTED_AUTH_TYPES:
        auth_type = "none"

    auth_info["auth_type"] = auth_type
    return auth_info


def auth_warnings(auth_info: dict[str, Any]) -> list[str]:
    auth_type = auth_info.get("auth_type", "none")

    if auth_type in IMPLEMENTED_AUTH_TYPES:
        return []

    return [
        f"The {auth_type} profile is captured by the UI, but credential passthrough is not fully implemented in this backend yet.",
    ]


def summarize_results(
    *,
    results: list[dict[str, Any]],
    zeebe_address: str,
    auth_type: str,
    requested_files: int,
) -> dict[str, Any]:
    successful = sum(1 for result in results if result.get("success"))
    failed = len(results) - successful

    return {
        "requested_files": requested_files,
        "reported_results": len(results),
        "successful": successful,
        "failed": failed,
        "timestamp": utc_now(),
        "zeebe_address": zeebe_address,
        "auth_type": auth_type,
    }


def create_zeebe_channel(address: str):
    return create_insecure_channel(address)


def topology_snapshot(topology: Any) -> dict[str, Any]:
    brokers = getattr(topology, "brokers", []) or []
    partition_count = sum(len(getattr(broker, "partitions", []) or []) for broker in brokers)

    return {
        "brokers_count": len(brokers),
        "cluster_size": getattr(topology, "cluster_size", None),
        "partition_count": partition_count,
    }


async def stage_uploads(files: list[UploadFile]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    staged_files: list[dict[str, Any]] = []
    validation_results: list[dict[str, Any]] = []

    if len(files) > MAX_FILES_PER_REQUEST:
        validation_results.append(
            {
                "file": "Upload package",
                "success": False,
                "message": f"Too many files. The API accepts up to {MAX_FILES_PER_REQUEST} BPMN files per request.",
                "type": "validation",
            }
        )
        return staged_files, validation_results

    for upload in files:
        filename = upload.filename or "unnamed-workflow.bpmn"
        extension = Path(filename).suffix.lower()
        payload = await upload.read()
        await upload.close()

        if extension not in ALLOWED_EXTENSIONS:
            validation_results.append(
                {
                    "file": filename,
                    "success": False,
                    "message": "Only .bpmn files are accepted by this deployment endpoint.",
                    "type": "validation",
                }
            )
            continue

        if not payload:
            validation_results.append(
                {
                    "file": filename,
                    "success": False,
                    "message": "The file is empty and cannot be deployed.",
                    "type": "validation",
                }
            )
            continue

        if len(payload) > MAX_FILE_SIZE_BYTES:
            validation_results.append(
                {
                    "file": filename,
                    "success": False,
                    "message": f"The file exceeds the {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB upload limit.",
                    "type": "validation",
                }
            )
            continue

        with tempfile.NamedTemporaryFile(delete=False, suffix=".bpmn") as temp_file:
            temp_file.write(payload)
            staged_files.append(
                {
                    "filename": filename,
                    "path": temp_file.name,
                    "size_bytes": len(payload),
                }
            )

    return staged_files, validation_results


def cleanup_staged_files(staged_files: list[dict[str, Any]]) -> None:
    for staged_file in staged_files:
        path = staged_file.get("path")
        if path and os.path.exists(path):
            os.unlink(path)


@app.post("/deploy")
async def deploy_bpmn(
    zeebe_address: str = Form(...),
    auth_data: str = Form("{}"),
    files: list[UploadFile] = File(...),
):
    auth_info = parse_auth_data(auth_data)
    warnings = auth_warnings(auth_info)

    is_valid, validation_message = validate_zeebe_address(zeebe_address)
    if not is_valid:
        results = [
            {
                "file": "Gateway target",
                "success": False,
                "message": validation_message,
                "type": "validation",
            }
        ]
        return JSONResponse(
            status_code=400,
            content={
                "results": results,
                "summary": summarize_results(
                    results=results,
                    zeebe_address=zeebe_address,
                    auth_type=auth_info["auth_type"],
                    requested_files=len(files),
                ),
                "warnings": warnings,
            },
        )

    can_connect, connection_message = check_tcp_connection(zeebe_address)
    if not can_connect:
        results = [
            {
                "file": "Gateway target",
                "success": False,
                "message": connection_message,
                "type": "error",
            }
        ]
        return JSONResponse(
            status_code=502,
            content={
                "results": results,
                "summary": summarize_results(
                    results=results,
                    zeebe_address=zeebe_address,
                    auth_type=auth_info["auth_type"],
                    requested_files=len(files),
                ),
                "warnings": warnings,
            },
        )

    staged_files, validation_results = await stage_uploads(files)
    if not staged_files:
        return JSONResponse(
            status_code=400,
            content={
                "results": validation_results,
                "summary": summarize_results(
                    results=validation_results,
                    zeebe_address=zeebe_address,
                    auth_type=auth_info["auth_type"],
                    requested_files=len(files),
                ),
                "warnings": warnings,
            },
        )

    results = [*validation_results]
    channel = None

    try:
        channel = create_zeebe_channel(zeebe_address)
        client = ZeebeClient(channel)

        for staged_file in staged_files:
            try:
                await client.deploy_resource(staged_file["path"])
                results.append(
                    {
                        "file": staged_file["filename"],
                        "success": True,
                        "message": "Workflow deployed successfully.",
                        "size_bytes": staged_file["size_bytes"],
                    }
                )
            except Exception as error:  # pragma: no cover - gateway behavior varies.
                results.append(
                    {
                        "file": staged_file["filename"],
                        "success": False,
                        "message": str(error),
                        "type": "error",
                        "size_bytes": staged_file["size_bytes"],
                    }
                )

        return {
            "results": results,
            "summary": summarize_results(
                results=results,
                zeebe_address=zeebe_address,
                auth_type=auth_info["auth_type"],
                requested_files=len(files),
            ),
            "warnings": warnings,
        }
    except ZeebeGatewayUnavailableError:
        gateway_results = [
            *results,
            {
                "file": "Gateway target",
                "success": False,
                "message": "Zeebe gateway is unavailable. Confirm the address and broker status.",
                "type": "error",
            },
        ]
        return JSONResponse(
            status_code=503,
            content={
                "results": gateway_results,
                "summary": summarize_results(
                    results=gateway_results,
                    zeebe_address=zeebe_address,
                    auth_type=auth_info["auth_type"],
                    requested_files=len(files),
                ),
                "warnings": warnings,
            },
        )
    except Exception as error:  # pragma: no cover - depends on external gateway.
        gateway_results = [
            *results,
            {
                "file": "Gateway target",
                "success": False,
                "message": f"Deployment session failed: {error}",
                "type": "error",
            },
        ]
        return JSONResponse(
            status_code=500,
            content={
                "results": gateway_results,
                "summary": summarize_results(
                    results=gateway_results,
                    zeebe_address=zeebe_address,
                    auth_type=auth_info["auth_type"],
                    requested_files=len(files),
                ),
                "warnings": warnings,
            },
        )
    finally:
        cleanup_staged_files(staged_files)
        if channel is not None:
            await channel.close()


@app.post("/test-connection")
async def test_connection(
    zeebe_address: str = Form(...),
    auth_data: str = Form("{}"),
):
    auth_info = parse_auth_data(auth_data)
    warnings = auth_warnings(auth_info)

    is_valid, validation_message = validate_zeebe_address(zeebe_address)
    if not is_valid:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": validation_message,
                "warnings": warnings,
                "timestamp": utc_now(),
            },
        )

    can_connect, connection_message = check_tcp_connection(zeebe_address)
    if not can_connect:
        return JSONResponse(
            status_code=502,
            content={
                "success": False,
                "message": connection_message,
                "warnings": warnings,
                "timestamp": utc_now(),
            },
        )

    channel = None
    try:
        channel = create_zeebe_channel(zeebe_address)
        client = ZeebeClient(channel)
        topology = await client.topology()

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Gateway handshake completed successfully.",
                "topology": topology_snapshot(topology),
                "warnings": warnings,
                "timestamp": utc_now(),
                "auth_profile": {
                    "type": auth_info["auth_type"],
                    "implemented": auth_info["auth_type"] in IMPLEMENTED_AUTH_TYPES,
                },
            },
        )
    except ZeebeGatewayUnavailableError:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Zeebe gateway is unavailable. Confirm the broker is reachable and healthy.",
                "warnings": warnings,
                "timestamp": utc_now(),
            },
        )
    except Exception as error:  # pragma: no cover - depends on external gateway.
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Gateway handshake failed: {error}",
                "warnings": warnings,
                "timestamp": utc_now(),
            },
        )
    finally:
        if channel is not None:
            await channel.close()


@app.get("/")
async def root():
    return {
        "service": APP_NAME,
        "status": "running",
        "version": APP_VERSION,
        "capabilities": {
            "test_connection": True,
            "deploy_bpmn": True,
            "auth_profiles": sorted(SUPPORTED_AUTH_TYPES),
            "implemented_auth_profiles": sorted(IMPLEMENTED_AUTH_TYPES),
        },
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": APP_NAME,
        "version": APP_VERSION,
        "timestamp": utc_now(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
