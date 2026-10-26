"""CPU face detection and recognition using OpenCV YuNet and SFace.

These conservative similarity thresholds are development defaults, not an
accuracy guarantee or calibrated probabilities. Evaluate on consented classroom
data before using attendance decisions in practice. No liveness claim is made.
Raw images are processed in memory and are not retained by this module.
"""
from __future__ import annotations

from functools import lru_cache
from threading import Lock

import struct

import cv2
import numpy as np

try:
    from .download_models import MODEL_DIR, MODELS, verified
except ImportError:
    from download_models import MODEL_DIR, MODELS, verified

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MIN_FACE_PIXELS = 48
MATCH_THRESHOLD = 0.55
MATCH_MARGIN = 0.08
_lock = Lock()


def models_available() -> bool:
    return all(verified(MODEL_DIR / info["filename"], info) for info in MODELS.values())


@lru_cache(maxsize=1)
def _models():
    if not models_available():
        raise RuntimeError("Face models are unavailable or failed integrity verification. Run python backend/download_models.py before enrollment or recognition.")
    detector = cv2.FaceDetectorYN.create(
        str(MODEL_DIR / MODELS["detector"]["filename"]), "", (320, 320),
        score_threshold=0.85, nms_threshold=0.3, top_k=5000,
    )
    recognizer = cv2.FaceRecognizerSF.create(str(MODEL_DIR / MODELS["recognizer"]["filename"]), "")
    return detector, recognizer


def _image_dimensions(data: bytes) -> tuple[int, int]:
    """Inspect JPEG/PNG dimensions before decoding to bound pixel allocation."""
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24 and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 255:
                break
            while offset < len(data) and data[offset] == 255:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                continue
            if offset + 2 > len(data):
                break
            length = int.from_bytes(data[offset:offset + 2], "big")
            if length < 2 or offset + length > len(data):
                break
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF) and length >= 7:
                height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
                return width, height
            if marker == 0xDA:
                break
            offset += length
    raise ValueError("Image could not be decoded. Upload a valid JPEG or PNG.")


def extract_faces(data: bytes) -> list[dict]:
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("Provide a JPEG or PNG image smaller than 12 MB.")
    width, height = _image_dimensions(data)
    if width < 1 or height < 1 or width > 8192 or height > 8192 or width * height > 24_000_000:
        raise ValueError("Image is too large. Use an image below 24 megapixels and 8192 pixels per side.")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image could not be decoded. Upload a valid JPEG or PNG.")
    height, width = image.shape[:2]
    if width > 8192 or height > 8192 or width * height > 24_000_000:
        raise ValueError("Image is too large. Use an image below 24 megapixels and 8192 pixels per side.")
    scale = min(1.0, 1920 / max(width, height))
    if scale < 1.0:
        image = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    detector, recognizer = _models()
    results = []
    with _lock:
        detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = detector.detect(image)
        for face in ([] if faces is None else faces[:100]):
            x, y, w, h = [float(v) for v in face[:4]]
            box = [round(x / scale), round(y / scale), round(w / scale), round(h / scale)]
            crop = image[max(0, int(y)):min(image.shape[0], int(y + h)), max(0, int(x)):min(image.shape[1], int(x + w))]
            blur = float(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()) if crop.size else 0.0
            issue = "Face too small; move closer" if min(w, h) < MIN_FACE_PIXELS else ("Face is blurred; hold camera steady" if blur < 25 else None)
            item = {"box": box, "quality": "review" if issue else "good", "quality_reason": issue, "embedding": None}
            if not issue:
                aligned = recognizer.alignCrop(image, face)
                embedding = recognizer.feature(aligned).reshape(-1).astype(np.float64)
                norm = float(np.linalg.norm(embedding))
                if norm > 0:
                    item["embedding"] = (embedding / norm).tolist()
            results.append(item)
    return results


def match_faces(data: bytes, templates: list[dict]) -> dict:
    detections = extract_faces(data)
    results = []
    for face in detections:
        result = {key: value for key, value in face.items() if key != "embedding"}
        result.update(status="unknown", student_id=None, name=None, score=None)
        if face["embedding"] is None:
            result.update(status="review", reason=face["quality_reason"])
            results.append(result)
            continue
        embedding = np.asarray(face["embedding"], dtype=np.float64)
        scores = {}
        for candidate in templates:
            template = np.asarray(candidate["embedding"], dtype=np.float64)
            norm = float(np.linalg.norm(template))
            if template.shape != embedding.shape or not np.isfinite(template).all() or norm == 0:
                continue
            score = float(np.dot(embedding, template / norm))
            identity = candidate["student_id"]
            if identity not in scores or score > scores[identity][0]:
                scores[identity] = (score, candidate)
        ranked = sorted(scores.values(), key=lambda value: value[0], reverse=True)
        if ranked:
            score, candidate = ranked[0]
            margin = score - ranked[1][0] if len(ranked) > 1 else 1.0
            result["score"] = round(score, 4)
            if score >= MATCH_THRESHOLD and margin >= MATCH_MARGIN:
                result.update(status="matched", student_id=candidate["student_id"], name=candidate["name"])
            elif score >= MATCH_THRESHOLD - 0.1:
                result.update(status="review", reason="Identity is ambiguous; recapture or verify manually")
        results.append(result)
    return {"faces": results, "total_faces": len(results), "matched": sum(face["status"] == "matched" for face in results)}
