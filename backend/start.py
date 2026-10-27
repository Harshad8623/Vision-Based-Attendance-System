"""Start the deployed application without platform-dependent shell quoting.

Run from the repository root with ``python -m backend.start``. Verified cached
models can be read-only; missing models are downloaded with integrity checks.
"""
from __future__ import annotations

import os
import sys

from .download_models import MODEL_DIR, MODELS, main as download_models, verified


def main() -> None:
    port = os.environ.get("PORT", "8000")
    if not port.isascii() or not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise SystemExit("PORT must be an integer between 1 and 65535.")

    if all(verified(MODEL_DIR / model["filename"], model) for model in MODELS.values()):
        print("Face models verified; using the existing cache.", flush=True)
    else:
        download_models()

    # Replace this process so the server receives shutdown signals directly.
    os.execv(sys.executable, [
        sys.executable, "-m", "uvicorn", "backend.app:app",
        "--host", "0.0.0.0", "--port", port,
    ])


if __name__ == "__main__":
    main()
