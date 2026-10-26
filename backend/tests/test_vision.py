"""Vision decision unit tests; actual model inference requires downloaded models."""
import struct
from unittest.mock import patch

import pytest

from backend import vision


def face(embedding):
    return {'box':[0,0,100,100],'quality':'good','quality_reason':None,'embedding':embedding}


def test_invalid_image_and_predecode_size_limits():
    with pytest.raises(ValueError,match='valid JPEG or PNG'):
        vision.extract_faces(b'not an image')
    huge_png=b'\x89PNG\r\n\x1a\n'+b'\x00\x00\x00\x0dIHDR'+struct.pack('>II',20000,20000)
    with pytest.raises(ValueError,match='too large'):
        vision.extract_faces(huge_png)


def test_matching_rejects_ambiguity_and_preserves_unknown():
    templates=[{'student_id':1,'name':'One','embedding':[1,0]},{'student_id':2,'name':'Two','embedding':[0.999,0.01]}]
    with patch.object(vision,'extract_faces',return_value=[face([1,0])]):
        result=vision.match_faces(b'image',templates)
        assert result['faces'][0]['status']=='review'
        assert result['faces'][0]['student_id'] is None
        assert 'embedding' not in result['faces'][0]
        result=vision.match_faces(b'image',templates[:1])
        assert result['faces'][0]['status']=='matched'
        assert result['faces'][0]['student_id']==1
        assert vision.match_faces(b'image',[])['faces'][0]['status']=='unknown'
    with patch.object(vision,'extract_faces',return_value=[face([0,1])]):
        assert vision.match_faces(b'image',templates[:1])['faces'][0]['status']=='unknown'


def test_quality_review_never_assigns_identity():
    with patch.object(vision,'extract_faces',return_value=[face(None)]):
        result=vision.match_faces(b'image',[{'student_id':1,'name':'One','embedding':[1,0]}])
        assert result['faces'][0]['status']=='review'
        assert result['matched']==0
