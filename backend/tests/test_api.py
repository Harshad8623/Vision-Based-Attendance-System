"""API tests exercise real temporary SQLite databases and signed authentication."""
from datetime import date, timedelta
from copy import deepcopy
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        yield client


def auth(client, role='teacher'):
    response=client.post('/api/auth/login',json={'email':role+'@classlens.demo','password':'ClassLens@2027'})
    assert response.status_code==200,response.text
    return {'Authorization':'Bearer '+response.json()['token']}


def start(client,headers,subject=1):
    response=client.post('/api/sessions',headers=headers,json={'subject_id':subject})
    assert response.status_code==201,response.text
    return response.json()['id']


def test_login_and_permission_boundaries(client):
    assert client.get('/api/students').status_code==401
    assert client.post('/api/auth/login',json={'email':'teacher@classlens.demo','password':'wrong'}).status_code==401
    student=auth(client,'student')
    teacher=auth(client)
    assert client.post('/api/sessions',headers=student,json={'subject_id':1}).status_code==403
    assert client.get('/api/teachers',headers=teacher).status_code==403
    assert len(client.get('/api/students',headers=student).json())==1
    records=client.get('/api/attendance',headers=student).json()
    assert records and all(r['student_id']==1 for r in records)
    assert client.get('/api/auth/me',headers={'Authorization':'Bearer tampered'}).status_code==401


def test_attendance_unique_audit_and_lock(client):
    headers=auth(client)
    sid=start(client,headers)
    assert client.post('/api/sessions',headers=headers,json={'subject_id':1}).status_code==409
    for status in ['present','late']:
        response=client.post(f'/api/sessions/{sid}/attendance',headers=headers,json={'student_id':1,'status':status,'reason':'Verified student in classroom'})
        assert response.status_code==201,response.text
    rows=client.get('/api/attendance',headers=headers,params={'session_id':sid}).json()
    assert len(rows)==1 and rows[0]['status']=='late'
    activity=client.get('/api/activity',headers=headers).json()
    assert any('present → late' in event['detail'] for event in activity)
    response=client.post(f'/api/sessions/{sid}/finish',headers=headers)
    assert response.status_code==200
    rows=client.get('/api/attendance',headers=headers,params={'session_id':sid}).json()
    assert len(rows)==24 and sum(row['status']=='absent' for row in rows)==23
    assert client.patch(f"/api/attendance/{rows[0]['id']}",headers=headers,json={'status':'present','reason':'Verified correction'}).status_code==409
    assert client.post(f'/api/sessions/{sid}/reopen',headers=headers).status_code==403
    admin=auth(client,'admin')
    assert client.post(f'/api/sessions/{sid}/reopen',headers=admin).status_code==200
    assert client.patch(f"/api/attendance/{rows[0]['id']}",headers=headers,json={'status':'present','reason':'Verified correction'}).status_code==200


def test_leave_flow_and_class_teacher_scope(client):
    student=auth(client,'student');teacher=auth(client);admin=auth(client,'admin')
    start_date=date.today()+timedelta(days=20)
    payload={'start_date':str(start_date),'end_date':str(start_date+timedelta(days=1)),'category':'Academic','reason':'Participating in a university robotics exhibition.'}
    response=client.post('/api/leaves',headers=student,json=payload)
    assert response.status_code==201,response.text
    lid=response.json()['id']
    assert client.post('/api/leaves',headers=student,json=payload).status_code==409
    assert client.patch(f'/api/leaves/{lid}',headers=student,json={'status':'approved'}).status_code==403
    other=client.post('/api/auth/login',json={'email':'rohan@classlens.demo','password':'ClassLens@2027'}).json()
    other_headers={'Authorization':'Bearer '+other['token']}
    assert client.patch(f'/api/leaves/{lid}',headers=other_headers,json={'status':'approved'}).status_code==403
    assert client.patch('/api/classes/1/teacher',headers=admin,json={'teacher_id':4}).status_code==200
    assert client.patch(f'/api/leaves/{lid}',headers=teacher,json={'status':'approved'}).status_code==403
    assert client.patch(f'/api/leaves/{lid}',headers=other_headers,json={'status':'approved','comment':'Approved for exhibition.'}).status_code==200
    assert client.patch(f'/api/leaves/{lid}',headers=other_headers,json={'status':'rejected','comment':'Changed my mind.'}).status_code==409


def test_subject_permissions_and_csv(client):
    headers=auth(client)
    data=client.get('/api/reports/attendance.csv',headers=headers)
    assert data.status_code==200 and data.headers['content-type'].startswith('text/csv')
    assert 'Roll number,Student,Subject,Lecture date,Status,Source' in data.text
    assert len(data.text.splitlines())>100
    student_csv=client.get('/api/reports/attendance.csv',headers=auth(client,'student')).text
    assert 'Aarav Sharma' in student_csv and 'Aditi Desai' not in student_csv
    assert client.patch('/api/subjects/1/teacher',headers=headers,json={'teacher_id':4}).status_code==403


def test_recognition_duplicate_and_live_confirmation(client):
    headers=auth(client)
    sid=start(client,headers)
    faces={'faces':[{'student_id':1,'name':'Aarav Sharma','status':'matched','box':[0,0,100,100],'score':.9} for _ in range(2)]}
    with patch('backend.vision.match_faces',side_effect=lambda *args:deepcopy(faces)):
        first=client.post(f'/api/sessions/{sid}/capture?mode=live',headers=headers,files={'image':('image.jpg',b'valid-by-mock','image/jpeg')})
        assert first.status_code==200,first.text
        assert not first.json()['newly_marked']
        second=client.post(f'/api/sessions/{sid}/capture?mode=live',headers=headers,files={'image':('image.jpg',b'valid-by-mock','image/jpeg')})
        assert not second.json()['newly_marked']
        third=client.post(f'/api/sessions/{sid}/capture?mode=live',headers=headers,files={'image':('image.jpg',b'valid-by-mock','image/jpeg')})
        assert third.json()['newly_marked']==[1]
        fourth=client.post(f'/api/sessions/{sid}/capture?mode=live',headers=headers,files={'image':('image.jpg',b'valid-by-mock','image/jpeg')})
        assert not fourth.json()['newly_marked']
    rows=client.get('/api/attendance',headers=headers,params={'session_id':sid}).json()
    assert len(rows)==1


def test_enrollment_rejects_low_quality_and_student_access(client):
    headers=auth(client)
    with patch('backend.vision.extract_faces',return_value=[{'embedding':None,'quality':'review'}]):
        response=client.post('/api/vision/enroll/1',headers=headers,files={'image':('image.jpg',b'image','image/jpeg')})
        assert response.status_code==422
    response=client.post('/api/vision/enroll/1',headers=auth(client,'student'),files={'image':('image.jpg',b'image','image/jpeg')})
    assert response.status_code==403


def test_restart_preserves_saved_records(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        h=auth(client);sid=start(client,h)
        client.post(f'/api/sessions/{sid}/attendance',headers=h,json={'student_id':2,'status':'present','reason':'Verified in class'})
        token=h
    with TestClient(create_app(tmp_path)) as client:
        records=client.get('/api/attendance',headers=token,params={'session_id':sid}).json()
        assert len(records)==1 and records[0]['student_id']==2


def test_admin_registration_creates_real_accounts(client):
    teacher=auth(client);admin=auth(client,'admin')
    student={'name':'New Student','email':'new.student@example.com','password':'StrongPassword2027','roll_number':'ECE9999','class_id':1}
    assert client.post('/api/students',headers=teacher,json=student).status_code==403
    response=client.post('/api/students',headers=admin,json=student)
    assert response.status_code==201,response.text
    assert client.post('/api/students',headers=admin,json=student).status_code==409
    login=client.post('/api/auth/login',json={'email':student['email'],'password':student['password']})
    assert login.status_code==200 and login.json()['user']['role']=='student'
    assert login.json()['user']['student_id']==response.json()['id']
    teacher_data={'name':'New Teacher','email':'new.teacher@example.com','password':'StrongPassword2027'}
    response=client.post('/api/teachers',headers=admin,json=teacher_data)
    assert response.status_code==201
    assert client.patch('/api/classes/1/teacher',headers=admin,json={'teacher_id':response.json()['id']}).status_code==200


def test_approved_leave_is_excused_not_present(client):
    teacher=auth(client);student=auth(client,'student')
    today=str(date.today())
    leave=client.post('/api/leaves',headers=student,json={'start_date':today,'end_date':today,'category':'Medical','reason':'Medical appointment during classes.'})
    assert leave.status_code==201,leave.text
    assert client.patch('/api/leaves/'+str(leave.json()['id']),headers=teacher,json={'status':'approved'}).status_code==200
    sid=start(client,teacher)
    assert client.post(f'/api/sessions/{sid}/finish',headers=teacher).status_code==200
    rows=client.get('/api/attendance',headers=teacher,params={'session_id':sid}).json()
    assert next(r for r in rows if r['student_id']==1)['status']=='excused'
