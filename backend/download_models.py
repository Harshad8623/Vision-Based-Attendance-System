"""Download pinned OpenCV Zoo models with SHA-256 verification.

The digests are the SHA-256 OIDs published by OpenCV Zoo's Git LFS pointers.
Network access to media.githubusercontent.com is required. TLS is verified.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request

MODEL_DIR = Path(os.environ.get("CLASSLENS_MODEL_DIR", str(Path(__file__).resolve().parents[1] / ".local" / "models")))
MODELS = {
    "detector": {
        "filename": "face_detection_yunet_2023mar.onnx",
        "folder": "face_detection_yunet",
        "sha256": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
        "size": 232589,
    },
    "recognizer": {
        "filename": "face_recognition_sface_2021dec.onnx",
        "folder": "face_recognition_sface",
        "sha256": "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
        "size": 38696353,
    },
}


def verified(path: Path, expected: dict) -> bool:
    if not path.is_file() or path.stat().st_size != expected["size"]:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest() == expected["sha256"]


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for info in MODELS.values():
        target = MODEL_DIR / info["filename"]
        if verified(target, info):
            target.chmod(0o644)
            print(f"Verified {target.name}")
            continue
        url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/{info['folder']}/{info['filename']}"
        temporary = None
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ClassLens-model-setup/1.0"})
            with urllib.request.urlopen(request, timeout=120) as response, tempfile.NamedTemporaryFile(dir=MODEL_DIR, delete=False) as output:
                temporary = Path(output.name)
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > info["size"]:
                        raise RuntimeError(f"Unexpected model size for {target.name}")
                    output.write(chunk)
            if not verified(temporary, info):
                raise RuntimeError(f"SHA-256 or size verification failed for {target.name}; artifact rejected")
            temporary.chmod(0o644)
            temporary.replace(target)
            print(f"Downloaded and verified {target.name}")
        except (urllib.error.URLError, OSError) as error:
            raise SystemExit("Model download failed. Allow HTTPS access to media.githubusercontent.com in environment network settings, then rerun python backend/download_models.py. TLS and checksum verification remain enabled. " + str(error)) from error
        finally:
            if temporary and temporary.exists():
                temporary.unlink()


if __name__ == "__main__":
    main()
