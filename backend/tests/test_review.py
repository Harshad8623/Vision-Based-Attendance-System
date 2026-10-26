"""Regression checks for permission boundaries, review responses, and late writes."""
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app, db_for
from backend.tests.test_api import auth, start


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as instance:
        yield instance


def test_subject_teacher_statistics_and_leave_audit_are_scoped(client):
    teacher=auth(client)
    with db_for(client.app) as db:
        db.execute('UPDATE classes SET class_teacher_id=4 WHERE id=1')
        db.execute('UPDATE subjects SET teacher_id=4 WHERE id!=1')
        db.execute("UPDATE attendance SET status='absent' WHERE student_id=1")
        db.execute("UPDATE attendance SET status='present' WHERE student_id=1 AND session_id IN (SELECT id FROM sessions WHERE subject_id=1)")
    student=next(s for s in client.get('/api/students',headers=teacher).json() if s['id']==1)
    assert student['attendance']==100
    assert student['streak']==10
    student_auth=auth(client,'student')
    day=str(date.today()+timedelta(days=20))
    response=client.post('/api/leaves',headers=student_auth,json={'start_date':day,'end_date':day,'category':'Medical','reason':'Sensitive medical leave information.'})
    assert response.status_code==201,response.text
    rohan=client.post('/api/auth/login',json={'email':'rohan@classlens.demo','password':'ClassLens@2027'}).json()
    rohan_headers={'Authorization':'Bearer '+rohan['token']}
    response=client.patch(f"/api/leaves/{response.json()['id']}",headers=rohan_headers,json={'status':'needs_information','comment':'Sensitive supporting explanation requested.'})
    assert response.status_code==200,response.text
    assert all(event['kind']!='leave' for event in client.get('/api/activity',headers=teacher).json())
    assert any(event['kind']=='leave' for event in client.get('/api/activity',headers=rohan_headers).json())


def test_in_progress_partial_records_do_not_change_analytics(client):
    teacher=auth(client)
    before_subject=client.get('/api/subjects',headers=teacher).json()[0]
    before_student=client.get('/api/students',headers=teacher).json()[0]
    before_dashboard=client.get('/api/dashboard',headers=teacher).json()
    sid=start(client,teacher)
    response=client.post(f'/api/sessions/{sid}/attendance',headers=teacher,json={'student_id':1,'status':'absent','reason':'Verified pending class review'})
    assert response.status_code==201,response.text
    after_subject=client.get('/api/subjects',headers=teacher).json()[0]
    after_student=client.get('/api/students',headers=teacher).json()[0]
    after_dashboard=client.get('/api/dashboard',headers=teacher).json()
    assert after_subject['attendance']==before_subject['attendance']
    assert after_subject['total_sessions']==before_subject['total_sessions']
    assert after_student['attendance']==before_student['attendance']
    assert after_dashboard['attendance_rate']==before_dashboard['attendance_rate']
    assert after_dashboard['total_sessions']==before_dashboard['total_sessions']
    assert after_dashboard['active_sessions']==1


def test_student_can_answer_information_request_without_approving_leave(client):
    student=auth(client,'student')
    teacher=auth(client)
    day=str(date.today()+timedelta(days=22))
    response=client.post('/api/leaves',headers=student,json={'start_date':day,'end_date':day,'category':'Academic','reason':'Participating in an engineering competition.'})
    lid=response.json()['id']
    assert client.patch(f'/api/leaves/{lid}',headers=teacher,json={'status':'needs_information','comment':'Please explain the event venue and timing.'}).status_code==200
    assert client.patch(f'/api/leaves/{lid}/response',headers=teacher,json={'reason':'A teacher must not impersonate the student.'}).status_code==403
    assert client.patch('/api/leaves/9999/response',headers=student,json={'reason':'More information about the venue.'}).status_code==404
    assert client.patch(f'/api/leaves/{lid}/response',headers=student,json={'reason':'              '}).status_code==422
    response=client.patch(f'/api/leaves/{lid}/response',headers=student,json={'reason':'The university robotics exhibition is at the main auditorium.'})
    assert response.status_code==200,response.text
    leave=next(l for l in client.get('/api/leaves',headers=teacher).json() if l['id']==lid)
    assert leave['status']=='pending' and 'auditorium' in leave['reason']
    assert client.patch(f'/api/leaves/{lid}/response',headers=student,json={'reason':'An unsolicited second replacement reason.'}).status_code==409
    assert client.patch(f'/api/leaves/{lid}',headers=teacher,json={'status':'approved'}).status_code==200


def test_capture_cannot_write_after_session_finalized_during_inference(client):
    teacher=auth(client)
    sid=start(client,teacher)
    def model_returns_after_finalization(*args):
        with db_for(client.app) as db:
            db.execute("UPDATE sessions SET status='completed' WHERE id=?",(sid,))
        return {'faces':[{'student_id':1,'name':'Aarav Sharma','status':'matched','box':[0,0,100,100]}]}
    with patch('backend.vision.match_faces',side_effect=model_returns_after_finalization):
        response=client.post(f'/api/sessions/{sid}/capture',headers=teacher,files={'image':('capture.jpg',b'mocked inference input','image/jpeg')})
    assert response.status_code==409,response.text
    assert client.get('/api/attendance',headers=teacher,params={'session_id':sid}).json()==[]


def test_whitespace_is_not_an_audit_reason_or_student_identifier(client):
    teacher=auth(client)
    sid=start(client,teacher)
    assert client.post(f'/api/sessions/{sid}/attendance',headers=teacher,json={'student_id':1,'status':'present','reason':'     '}).status_code==422
    admin=auth(client,'admin')
    response=client.post('/api/students',headers=admin,json={'name':'New Student','email':'someone@example.com','password':'StrongPassword2027','roll_number':'  ','class_id':1})
    assert response.status_code==422,response.text


def test_built_frontend_does_not_mask_unknown_api_routes(client):
    response=client.get('/api/this-does-not-exist')
    assert response.status_code==404
    assert response.headers['content-type'].startswith('application/json')


def test_camera_does_not_claim_confirmation_over_manual_absence(client):
    teacher=auth(client)
    sid=start(client,teacher)
    response=client.post(f'/api/sessions/{sid}/attendance',headers=teacher,json={'student_id':1,'status':'absent','reason':'Teacher has verified the absence.'})
    assert response.status_code==201
    faces={'faces':[{'student_id':1,'name':'Aarav Sharma','status':'matched','box':[0,0,100,100]}]}
    with patch('backend.vision.match_faces',return_value=faces):
        response=client.post(f'/api/sessions/{sid}/capture',headers=teacher,files={'image':('capture.jpg',b'mocked inference input','image/jpeg')})
    assert response.status_code==200,response.text
    assert response.json()['newly_marked']==[]
    assert response.json()['faces'][0]['status']=='review'
    assert 'preserved' in response.json()['faces'][0]['reason']
    assert client.get('/api/attendance',headers=teacher,params={'session_id':sid}).json()[0]['status']=='absent'
