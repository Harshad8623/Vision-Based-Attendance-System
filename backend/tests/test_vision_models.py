"""Real local model smoke checks; no image download or biometric fixture.

These checks skip when the separately downloaded, checksum-verified model assets
are absent. They validate model loading and empty-input behaviour, not accuracy.
Use scripts/validate_vision.py with a consented image for the enrollment flow.
"""
import cv2
import numpy as np
import pytest

from backend.vision import extract_faces, models_available


@pytest.mark.skipif(not models_available(), reason='Optional verified OpenCV model binaries are not installed')
@pytest.mark.parametrize('extension', ['.jpg', '.png'])
def test_real_models_return_no_faces_for_blank_image(extension):
    encoded, buffer = cv2.imencode(extension, np.zeros((480, 640, 3), dtype=np.uint8))
    assert encoded
    assert extract_faces(buffer.tobytes()) == []
