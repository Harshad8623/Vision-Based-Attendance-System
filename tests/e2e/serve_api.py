"""Disposable seeded database for browser tests; never touches developer records."""
import os
import tempfile
import uvicorn

with tempfile.TemporaryDirectory(prefix='classlens-browser-') as directory:
    os.environ['CLASSLENS_DATA_DIR'] = directory
    uvicorn.run('backend.app:app', host='127.0.0.1', port=8002)
