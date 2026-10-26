#!/usr/bin/env python3
"""Exercise real recognition with a user-supplied, consented single-face image.

Run from the repository root:
    .venv/bin/python scripts/validate_vision.py --image /path/to/consented-photo.jpg

No image is downloaded. Inference runs locally; a temporary database holds the
sample embedding and attendance, and is deleted on exit. The same source image
is deliberately reused to validate wiring, not identity accuracy or liveness.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.vision import extract_faces, models_available


def require(condition: bool, message: str):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--image', required=True, type=Path, help='Consented JPEG/PNG containing exactly one clear face')
    args = parser.parse_args()
    require(args.image.is_file(), 'The image file does not exist.')
    require(args.image.stat().st_size <= 10 * 1024 * 1024, 'Choose an image smaller than 10 MB.')
    require(models_available(), 'Models are missing or failed verification. Run python backend/download_models.py first.')
    data = args.image.read_bytes()
    faces = extract_faces(data)
    require(len(faces) == 1 and faces[0]['embedding'] is not None, 'The source must contain exactly one clear, sufficiently large face.')
    print('PASS: actual detector and embedder produced one valid face template')
    blank = cv2.imencode('.jpg', np.zeros((480, 640, 3), dtype=np.uint8))[1].tobytes()
    require(extract_faces(blank) == [], 'Blank image unexpectedly produced a face.')
    print('PASS: blank image produces zero faces')

    with TemporaryDirectory(prefix='classlens-vision-validation-') as root:
        with TestClient(create_app(root)) as client:
            login = client.post('/api/auth/login', json={'email': 'teacher@classlens.demo', 'password': 'ClassLens@2027'})
            require(login.status_code == 200, 'Temporary workspace sign-in failed.')
            headers = {'Authorization': 'Bearer ' + login.json()['token']}
            upload = {'image': ('sample.jpg', data, 'image/jpeg')}
            enrollment = client.post('/api/vision/enroll/1', headers=headers, files=upload)
            require(enrollment.status_code == 200, f'Enrollment failed: {enrollment.text}')
            print('PASS: actual enrollment API saves a template in the temporary database')
            session = client.post('/api/sessions', headers=headers, json={'subject_id': 1})
            require(session.status_code == 201, f'Photo session failed: {session.text}')
            sid = session.json()['id']
            capture = client.post(f'/api/sessions/{sid}/capture?mode=photo', headers=headers, files=upload)
            require(capture.status_code == 200 and capture.json()['newly_marked'] == [1], f'Photo recognition failed: {capture.text}')
            capture = client.post(f'/api/sessions/{sid}/capture?mode=photo', headers=headers, files=upload)
            require(capture.status_code == 200 and capture.json()['newly_marked'] == [], 'Repeat capture duplicated attendance.')
            rows = client.get('/api/attendance', headers=headers, params={'session_id': sid}).json()
            require(len(rows) == 1 and rows[0]['student_id'] == 1, 'Attendance uniqueness check failed.')
            print('PASS: photo recognition records attendance once across repeated captures')
            session = client.post('/api/sessions', headers=headers, json={'subject_id': 2})
            require(session.status_code == 201, f'Live session failed: {session.text}')
            sid = session.json()['id']
            for frame in range(1, 4):
                capture = client.post(f'/api/sessions/{sid}/capture?mode=live', headers=headers, files=upload)
                require(capture.status_code == 200, f'Live inference failed: {capture.text}')
                expected = [1] if frame == 3 else []
                require(capture.json()['newly_marked'] == expected, f'Unexpected attendance decision at live frame {frame}.')
            print('PASS: live capture requires three confirming frames')
            deletion = client.delete('/api/vision/enroll/1', headers=headers)
            require(deletion.status_code == 200, 'Enrollment deletion failed.')
            print('PASS: enrollment deletion')
    print('Temporary database deleted. This is a same-source functional smoke test, not a recognition accuracy or anti-spoofing evaluation.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        raise SystemExit(1)
