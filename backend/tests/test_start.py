"""Deployment startup behaviour, independent of Render command parsing."""
from unittest.mock import patch

import pytest

from backend import start


def test_verified_read_only_cache_starts_server_on_render_port():
    with patch.dict(start.os.environ, {"PORT": "10000"}), \
         patch.object(start, "verified", return_value=True), \
         patch.object(start, "download_models") as download, \
         patch.object(start.os, "execv") as execute:
        start.main()
    download.assert_not_called()
    execute.assert_called_once_with(start.sys.executable, [
        start.sys.executable, "-m", "uvicorn", "backend.app:app",
        "--host", "0.0.0.0", "--port", "10000",
    ])


def test_missing_models_must_download_before_server_starts():
    with patch.object(start, "verified", return_value=False), \
         patch.object(start, "download_models", side_effect=RuntimeError("download failed")), \
         patch.object(start.os, "execv") as execute:
        with pytest.raises(RuntimeError, match="download failed"):
            start.main()
    execute.assert_not_called()


@pytest.mark.parametrize("port", ["0", "65536", "oops", "8000;echo bad"])
def test_invalid_port_does_not_start_or_download(port):
    with patch.dict(start.os.environ, {"PORT": port}), \
         patch.object(start, "download_models") as download, \
         patch.object(start.os, "execv") as execute:
        with pytest.raises(SystemExit, match="PORT must be"):
            start.main()
    download.assert_not_called()
    execute.assert_not_called()
