"""ClassLens API. Fictional demo records are seeded only into a new database."""
from __future__ import annotations
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import threading
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

HERE = Path(__file__).parent
bearer = HTTPBearer(auto_error=False)


def now():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 310_000)
    return salt + ':' + base64.b64encode(digest).decode()


def check_password(password, stored):
    return hmac.compare_digest(hash_password(password, stored.split(':')[0]), stored)


@contextmanager
def db_for(app):
    conn = sqlite3.connect(app.state.db_path, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize(app):
    with db_for(app) as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,student_id INTEGER);
        CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY,name TEXT NOT NULL,class_teacher_id INTEGER REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY,name TEXT NOT NULL,roll_number TEXT UNIQUE NOT NULL,email TEXT NOT NULL,class_id INTEGER REFERENCES classes(id));
        CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL,teacher_id INTEGER REFERENCES users(id),class_id INTEGER REFERENCES classes(id),room TEXT,schedule TEXT,color TEXT);
        CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,subject_id INTEGER NOT NULL REFERENCES subjects(id),teacher_id INTEGER REFERENCES users(id),title TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,status TEXT NOT NULL DEFAULT 'active');
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(subject_id) WHERE status='active';
        CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY,session_id INTEGER NOT NULL REFERENCES sessions(id),student_id INTEGER NOT NULL REFERENCES students(id),status TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'manual',updated_at TEXT NOT NULL,UNIQUE(session_id,student_id));
        CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),start_date TEXT NOT NULL,end_date TEXT NOT NULL,category TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',comment TEXT DEFAULT '',created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id),title TEXT NOT NULL,detail TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,class_id INTEGER REFERENCES classes(id),student_id INTEGER REFERENCES students(id));
        CREATE TABLE IF NOT EXISTS face_templates(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),embedding TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS recognition_hits(session_id INTEGER REFERENCES sessions(id),student_id INTEGER REFERENCES students(id),hits INTEGER NOT NULL DEFAULT 0,last_seen TEXT NOT NULL,PRIMARY KEY(session_id,student_id));
        ''')
        if db.execute('SELECT COUNT(*) FROM users').fetchone()[0]:
            return
        password = hash_password('ClassLens@2027')
        db.executemany('INSERT INTO users VALUES(?,?,?,?,?,?)', [
            (1,'Prof. Ananya Deshmukh','teacher@classlens.demo',password,'teacher',None),
            (2,'Harshad Dhuppe','admin@classlens.demo',password,'admin',None),
            (3,'Aarav Sharma','student@classlens.demo',password,'student',1),
            (4,'Prof. Rohan Patil','rohan@classlens.demo',password,'teacher',None),
        ])
        db.execute("INSERT INTO classes VALUES(1,'ECE · Final Year · Section A',1)")
        names = ['Aarav Sharma','Aditi Desai','Arjun Kulkarni','Ananya Joshi','Atharva Pawar','Diya Shah','Ishaan Mehta','Isha Patil','Kabir Nair','Kavya More','Krish Shah','Meera Kulkarni','Neel Deshmukh','Nisha Rao','Omkar Jadhav','Pranav Kale','Riya Patil','Rohan Shinde','Saanvi Joshi','Sahil Desai','Sara Khan','Shreya Nair','Siddharth More','Tanvi Pawar']
        for i,n in enumerate(names,1):
            db.execute('INSERT INTO students VALUES(?,?,?,?,1)',(i,n,f'ECE{2300+i}',n.lower().replace(' ','.')+'@students.example'))
        db.executemany('INSERT INTO subjects VALUES(?,?,?,?,?,?,?,?)',[
            (1,'Computer Vision','EC401',1,1,'Lab 302','09:00 – 10:00','#d8eadf'),
            (2,'Embedded Systems','EC402',1,1,'Room 204','11:00 – 12:00','#e9e2f4'),
            (3,'Computer Networks','EC403',1,1,'Room 201','14:00 – 15:00','#fae7d2'),
            (4,'Machine Learning','EC404',1,1,'Lab 301','15:00 – 16:00','#dbe9f5'),
        ])
        today = date.today()
        for offset in range(14,0,-1):
            day = today - timedelta(days=offset)
            if day.weekday() >= 5:
                continue
            for subject in range(1,5):
                started = datetime.combine(day, datetime.min.time(),timezone.utc).replace(hour=9+subject).isoformat()
                session_id = db.execute("INSERT INTO sessions(subject_id,teacher_id,title,started_at,ended_at,status) VALUES(?,1,?,?,?,'completed')",(subject,'Lecture '+day.strftime('%d %b'),started,started)).lastrowid
                for student in range(1,25):
                    status = 'absent' if (student*3+offset+subject)%11==0 or (student in (7,14,21) and offset%3!=0) else ('late' if (student+offset)%19==0 else 'present')
                    db.execute('INSERT INTO attendance(session_id,student_id,status,source,updated_at) VALUES(?,?,?,?,?)',(session_id,student,status,'demo',started))
        for sid,start,end,category,reason,status in [
            (1,1,2,'Medical','Medical appointment and recovery.','pending'),
            (7,3,3,'Personal','Family commitment.','pending'),
            (12,5,6,'Academic','University project exhibition.','pending'),
            (5,-4,-3,'Medical','Rest advised by physician.','approved'),
        ]:
            db.execute('INSERT INTO leaves(student_id,start_date,end_date,category,reason,status,created_at) VALUES(?,?,?,?,?,?,?)',(sid,str(today+timedelta(days=start)),str(today+timedelta(days=end)),category,reason,status,now()))
        audit(db,1,'Welcome to ClassLens','Fictional demo workspace is ready. No real student biometric data is included.','system',1)


def audit(db, actor, title, detail, kind, class_id=None, student_id=None):
    db.execute('INSERT INTO audit(actor_id,title,detail,kind,created_at,class_id,student_id) VALUES(?,?,?,?,?,?,?)',(actor,title,detail,kind,now(),class_id,student_id))


def user_public(row):
    return {k:row[k] for k in ('id','name','email','role')} | {'initials': ''.join(p[0] for p in row['name'].split()[-2:]),'student_id':row['student_id']}


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(401,'Please sign in to continue.')
    try:
        uid = request.app.state.signer.loads(credentials.credentials,max_age=43200)['uid']
    except (BadSignature,SignatureExpired,KeyError):
        raise HTTPException(401,'Your session has expired. Please sign in again.')
    with db_for(request.app) as db:
        user = db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    if not user:
        raise HTTPException(401,'Account unavailable.')
    return dict(user)


def staff(user):
    if user['role'] not in ('admin','teacher'):
        raise HTTPException(403,'Teacher or administrator access required.')


def admin(user):
    if user['role']!='admin':
        raise HTTPException(403,'Administrator access required.')


def scope(db,user):
    if user['role']=='admin':
        return [r[0] for r in db.execute('SELECT id FROM subjects')]
    if user['role']=='teacher':
        return [r[0] for r in db.execute('SELECT s.id FROM subjects s JOIN classes c ON c.id=s.class_id WHERE s.teacher_id=? OR c.class_teacher_id=?',(user['id'],user['id']))]
    return [r[0] for r in db.execute('SELECT id FROM subjects WHERE class_id=(SELECT class_id FROM students WHERE id=?)',(user['student_id'],))]


def subject_access(db,user,sid):
    if sid not in scope(db,user):
        raise HTTPException(403,'This subject is outside your assigned classes.')
    row = db.execute('SELECT * FROM subjects WHERE id=?',(sid,)).fetchone()
    if not row:
        raise HTTPException(404,'Subject not found.')
    return dict(row)


def session_access(db,user,sid):
    row = db.execute('SELECT * FROM sessions WHERE id=?',(sid,)).fetchone()
    if not row:
        raise HTTPException(404,'Attendance session not found.')
    subject_access(db,user,row['subject_id'])
    return dict(row)


def create_app(data_dir=None):
    @asynccontextmanager
    async def lifespan(app):
        root = Path(data_dir or os.environ.get('CLASSLENS_DATA_DIR', HERE/'.local'))
        root.mkdir(parents=True,exist_ok=True)
        secret = os.environ.get('CLASSLENS_SECRET')
        if not secret:
            secret_path = root/'session.secret'
            if not secret_path.exists():
                fd = os.open(secret_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                with os.fdopen(fd,'w') as f:
                    f.write(secrets.token_urlsafe(48))
            secret = secret_path.read_text().strip()
        app.state.db_path = str(root/'classlens.db')
        app.state.signer = URLSafeTimedSerializer(secret,salt='classlens-session-v1')
        app.state.login_attempts = {}
        app.state.capture_lock = threading.Lock()
        initialize(app)
        yield
    app = FastAPI(title='ClassLens API',version='1.0.0',lifespan=lifespan)
    origins = os.environ.get('CLASSLENS_CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',')
    app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST','PATCH','DELETE','OPTIONS'],allow_headers=['Authorization','Content-Type'])
    register_routes(app)
    dist=HERE.parent/'dist'
    if dist.is_dir():
        @app.api_route('/api/{path:path}',methods=['GET','POST','PATCH','DELETE','PUT','OPTIONS'])
        def unknown_api(path:str):
            raise HTTPException(404,'API endpoint not found.')
        app.mount('/',StaticFiles(directory=dist,html=True),name='frontend')
    return app


class Login(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)
class NewSession(BaseModel):
    subject_id: int
    title: str = Field(default='Classroom attendance',min_length=1,max_length=120)
class EditAttendance(BaseModel):
    status: Literal['present','absent','late','excused']
    reason: str = Field(min_length=5,max_length=500)

    @field_validator('reason')
    @classmethod
    def meaningful_reason(cls, value):
        if len(value.strip()) < 5:
            raise ValueError('Explain the correction using at least five non-padding characters.')
        return value.strip()
class ManualAttendance(EditAttendance):
    student_id: int
class NewLeave(BaseModel):
    start_date: date
    end_date: date
    category: Literal['Medical','Personal','Academic','Other']
    reason: str = Field(min_length=10,max_length=2000)
class LeaveResponse(BaseModel):
    reason: str = Field(min_length=10,max_length=2000)

    @field_validator('reason')
    @classmethod
    def meaningful_reason(cls, value):
        if len(value.strip()) < 10:
            raise ValueError('Please provide at least ten non-padding characters.')
        return value.strip()


class ReviewLeave(BaseModel):
    status: Literal['approved','rejected','needs_information','cancelled']
    comment: str = Field(default='',max_length=1000)
class Assignment(BaseModel):
    teacher_id: int
class NewPerson(BaseModel):
    name: str = Field(min_length=2,max_length=100)
    email: str = Field(min_length=5,max_length=200)
    password: str = Field(min_length=10,max_length=128)
class NewStudent(NewPerson):
    roll_number: str = Field(min_length=2,max_length=30)
    class_id: int


def validate_person(body):
    if body.email.count('@') != 1 or '.' not in body.email.rsplit('@',1)[-1] or not body.email.split('@')[0] or any(c.isspace() for c in body.email):
        raise HTTPException(422,'Enter a valid email address.')
    if len(body.name.strip()) < 2:
        raise HTTPException(422,'Name must contain at least two non-padding characters.')



def attendance_rows(db,user,session_id=None):
    ids=scope(db,user)
    if not ids:
        return []
    query='''SELECT a.id,a.session_id,a.student_id,st.name student_name,st.roll_number,s.name subject_name,s.code subject_code,se.started_at date,a.status,a.source,a.updated_at FROM attendance a JOIN students st ON st.id=a.student_id JOIN sessions se ON se.id=a.session_id JOIN subjects s ON s.id=se.subject_id WHERE s.id IN ('''+','.join('?'*len(ids))+')'
    params=list(ids)
    if user['role']=='student':
        query+=' AND a.student_id=?';params.append(user['student_id'])
    if session_id:
        query+=' AND a.session_id=?';params.append(session_id)
    return [dict(r) for r in db.execute(query+' ORDER BY se.started_at DESC,st.roll_number',params)]


def sessions_rows(db,user):
    ids=scope(db,user)
    if not ids:
        return []
    rows=db.execute('''SELECT se.*,s.name subject_name,s.code subject_code,s.room,s.schedule,(SELECT COUNT(*) FROM students WHERE class_id=s.class_id) total,(SELECT COUNT(*) FROM attendance a WHERE a.session_id=se.id AND a.status IN ('present','late')) present FROM sessions se JOIN subjects s ON s.id=se.subject_id WHERE s.id IN ('''+','.join('?'*len(ids))+') ORDER BY se.started_at DESC',ids)
    return [dict(r) for r in rows]


def register_routes(app):
    @app.get('/api/health')
    def health(request:Request):
        from .vision import models_available
        with db_for(request.app) as db:
            db.execute('SELECT 1').fetchone()
        return {'status':'ok','database':'connected','vision_ready':models_available(),'demo':True}

    @app.get('/api/vision/status')
    def vision_status(user=Depends(current_user)):
        from .vision import models_available
        return {'ready':models_available(),'vision_ready':models_available(),'minimum_live_frames':3,'match_threshold':0.55,'thresholds_calibrated':False}

    @app.post('/api/auth/login')
    def login(body:Login,request:Request):
        key=(request.client.host if request.client else 'local',body.email.strip().lower())
        attempts=[t for t in request.app.state.login_attempts.get(key,[]) if time.monotonic()-t<60]
        if len(attempts)>=10:
            raise HTTPException(429,'Too many attempts. Please wait a minute.')
        request.app.state.login_attempts[key]=attempts+[time.monotonic()]
        with db_for(request.app) as db:
            user=db.execute('SELECT * FROM users WHERE email=?',(body.email.strip().lower(),)).fetchone()
            if not user or not check_password(body.password,user['password']):
                raise HTTPException(401,'Email or password is incorrect.')
            return {'token':request.app.state.signer.dumps({'uid':user['id']}),'user':user_public(user)}

    @app.get('/api/auth/me')
    def me(user=Depends(current_user)):
        return user_public(user)

    @app.get('/api/subjects')
    def subjects(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            ids=scope(db,user)
            result=[]
            for row in db.execute('SELECT s.*,u.name teacher_name,c.name section FROM subjects s JOIN users u ON u.id=s.teacher_id JOIN classes c ON c.id=s.class_id ORDER BY s.id'):
                if row['id'] not in ids: continue
                item=dict(row)
                clause=' AND a.student_id=?' if user['role']=='student' else ''
                params=[row['id']]+([user['student_id']] if clause else [])
                counts=db.execute("SELECT COUNT(*) total, SUM(a.status IN ('present','late')) attended FROM attendance a JOIN sessions se ON se.id=a.session_id WHERE se.subject_id=? AND se.status='completed'"+clause,params).fetchone()
                item.update(attendance=round(100*(counts['attended'] or 0)/(counts['total'] or 1),1),total_sessions=db.execute("SELECT COUNT(*) FROM sessions WHERE subject_id=? AND status='completed'",(row['id'],)).fetchone()[0])
                result.append(item)
            return result

    @app.get('/api/students')
    def students(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            ids=scope(db,user)
            class_ids=[r[0] for r in db.execute('SELECT DISTINCT class_id FROM subjects WHERE id IN ('+','.join('?'*len(ids))+')',ids)] if ids else []
            result=[]
            for row in db.execute('SELECT st.*,c.name section FROM students st JOIN classes c ON c.id=st.class_id ORDER BY st.roll_number'):
                if row['class_id'] not in class_ids or (user['role']=='student' and row['id']!=user['student_id']): continue
                item=dict(row)
                counts=db.execute("SELECT COUNT(*) total,SUM(a.status IN ('present','late')) attended FROM attendance a JOIN sessions se ON se.id=a.session_id WHERE a.student_id=? AND se.status='completed' AND se.subject_id IN ("+','.join('?'*len(ids))+')',[row['id'],*ids]).fetchone()
                # Complete scheduled lecture days, newest first; no records means no invented streak.
                days=db.execute("SELECT substr(se.started_at,1,10) day,MIN(a.status IN ('present','late','excused')) complete FROM attendance a JOIN sessions se ON se.id=a.session_id WHERE a.student_id=? AND se.status='completed' AND se.subject_id IN ("+','.join('?'*len(ids))+') GROUP BY day ORDER BY day DESC',[row['id'],*ids]).fetchall()
                streak=0
                for day in days:
                    if not day['complete']: break
                    streak+=1
                item.update(attendance=round(100*(counts['attended'] or 0)/(counts['total'] or 1),1),streak=streak,enrolled=db.execute('SELECT COUNT(*) FROM face_templates WHERE student_id=?',(row['id'],)).fetchone()[0]>0,initials=''.join(p[0] for p in row['name'].split()[:2]))
                result.append(item)
            return result

    @app.post('/api/students',status_code=201)
    def create_student(body:NewStudent,request:Request,user=Depends(current_user)):
        admin(user)
        validate_person(body)
        if len(body.roll_number.strip()) < 2:
            raise HTTPException(422,'Roll number must contain at least two non-padding characters.')
        with db_for(request.app) as db:
            if not db.execute('SELECT 1 FROM classes WHERE id=?',(body.class_id,)).fetchone():
                raise HTTPException(422,'Choose an existing class.')
            try:
                sid=db.execute('INSERT INTO students(name,roll_number,email,class_id) VALUES(?,?,?,?)',(body.name.strip(),body.roll_number.strip(),body.email.lower().strip(),body.class_id)).lastrowid
                db.execute('INSERT INTO users(name,email,password,role,student_id) VALUES(?,?,?,?,?)',(body.name.strip(),body.email.lower().strip(),hash_password(body.password),'student',sid))
            except sqlite3.IntegrityError:
                raise HTTPException(409,'This email address or roll number is already registered.')
            audit(db,user['id'],'Student registered',body.name.strip(),'admin',body.class_id,sid)
            return {'id':sid,'name':body.name.strip(),'roll_number':body.roll_number.strip(),'email':body.email.lower().strip(),'class_id':body.class_id,'enrolled':False}

    @app.post('/api/teachers',status_code=201)
    def create_teacher(body:NewPerson,request:Request,user=Depends(current_user)):
        admin(user)
        validate_person(body)
        with db_for(request.app) as db:
            try:
                tid=db.execute('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',(body.name.strip(),body.email.lower().strip(),hash_password(body.password),'teacher')).lastrowid
            except sqlite3.IntegrityError:
                raise HTTPException(409,'This email address is already registered.')
            audit(db,user['id'],'Teacher registered',body.name.strip(),'admin')
            return {'id':tid,'name':body.name.strip(),'email':body.email.lower().strip()}

    @app.get('/api/sessions')
    def sessions(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:return sessions_rows(db,user)

    @app.post('/api/sessions',status_code=201)
    def new_session(body:NewSession,request:Request,user=Depends(current_user)):
        staff(user)
        with db_for(request.app) as db:
            sub=subject_access(db,user,body.subject_id)
            try:
                sid=db.execute('INSERT INTO sessions(subject_id,teacher_id,title,started_at) VALUES(?,?,?,?)',(body.subject_id,user['id'],body.title,now())).lastrowid
            except sqlite3.IntegrityError:
                raise HTTPException(409,'This subject already has an active session. Resume it first.')
            audit(db,user['id'],'Attendance session started',sub['name'],'attendance',sub['class_id'])
            return next(r for r in sessions_rows(db,user) if r['id']==sid)

    @app.post('/api/sessions/{session_id}/finish')
    def finish(session_id:int,request:Request,user=Depends(current_user)):
        staff(user)
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            se=session_access(db,user,session_id)
            if se['status']=='completed':return {'status':'completed','message':'Session already completed.'}
            sub=subject_access(db,user,se['subject_id'])
            for row in db.execute('SELECT id FROM students WHERE class_id=?',(sub['class_id'],)).fetchall():
                approved=db.execute("SELECT 1 FROM leaves WHERE student_id=? AND status='approved' AND start_date<=? AND end_date>=?",(row['id'],se['started_at'][:10],se['started_at'][:10])).fetchone()
                db.execute("INSERT OR IGNORE INTO attendance(session_id,student_id,status,source,updated_at) VALUES(?,?,?,?,?)",(session_id,row['id'],'excused' if approved else 'absent','finalized',now()))
            db.execute("UPDATE sessions SET status='completed',ended_at=? WHERE id=?",(now(),session_id))
            audit(db,user['id'],'Attendance session completed',sub['name'],'attendance',sub['class_id'])
            return {'status':'completed'}

    @app.get('/api/attendance')
    def attendance(request:Request,session_id:int|None=None,user=Depends(current_user)):
        with db_for(request.app) as db:
            if session_id:session_access(db,user,session_id)
            return attendance_rows(db,user,session_id)

    @app.post('/api/sessions/{session_id}/attendance',status_code=201)
    def manual(session_id:int,body:ManualAttendance,request:Request,user=Depends(current_user)):
        staff(user)
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            se=session_access(db,user,session_id)
            sub=subject_access(db,user,se['subject_id'])
            student=db.execute('SELECT * FROM students WHERE id=? AND class_id=?',(body.student_id,sub['class_id'])).fetchone()
            if not student:raise HTTPException(404,'Student not in this class.')
            if se['status']=='completed':raise HTTPException(409,'Session is locked. An administrator must reopen it.')
            previous=db.execute('SELECT status FROM attendance WHERE session_id=? AND student_id=?',(session_id,body.student_id)).fetchone()
            db.execute('INSERT INTO attendance(session_id,student_id,status,source,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,source=excluded.source,updated_at=excluded.updated_at',(session_id,body.student_id,body.status,'manual',now()))
            audit(db,user['id'],'Attendance corrected',f"{student['name']}: {previous['status'] if previous else 'unmarked'} → {body.status}. Reason: {body.reason}",'correction',sub['class_id'],body.student_id)
            return next(r for r in attendance_rows(db,user,session_id) if r['student_id']==body.student_id)

    @app.patch('/api/attendance/{attendance_id}')
    def edit(attendance_id:int,body:EditAttendance,request:Request,user=Depends(current_user)):
        staff(user)
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            record=db.execute('SELECT * FROM attendance WHERE id=?',(attendance_id,)).fetchone()
            if not record:raise HTTPException(404,'Attendance record not found.')
            se=session_access(db,user,record['session_id'])
            if se['status']=='completed':raise HTTPException(409,'Session is locked. An administrator must reopen it.')
            sub=subject_access(db,user,se['subject_id'])
            db.execute("UPDATE attendance SET status=?,source='manual',updated_at=? WHERE id=?",(body.status,now(),attendance_id))
            audit(db,user['id'],'Attendance corrected',f"Student {record['student_id']}: {record['status']} → {body.status}. Reason: {body.reason}",'correction',sub['class_id'],record['student_id'])
            return {'id':attendance_id,'status':body.status}

    @app.post('/api/sessions/{session_id}/reopen')
    def reopen(session_id:int,request:Request,user=Depends(current_user)):
        admin(user)
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            se=session_access(db,user,session_id)
            try:db.execute("UPDATE sessions SET status='active',ended_at=NULL WHERE id=?",(session_id,))
            except sqlite3.IntegrityError:raise HTTPException(409,'Another session for this subject is active.')
            sub=subject_access(db,user,se['subject_id'])
            audit(db,user['id'],'Session reopened','Session '+str(session_id),'attendance',sub['class_id'])
            return {'status':'active'}

    @app.get('/api/leaves')
    def leaves(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            rows=db.execute('SELECT l.*,st.name student_name,st.roll_number,st.class_id,c.class_teacher_id FROM leaves l JOIN students st ON st.id=l.student_id JOIN classes c ON c.id=st.class_id ORDER BY l.created_at DESC')
            return [dict(r) for r in rows if user['role']=='admin' or (user['role']=='student' and r['student_id']==user['student_id']) or (user['role']=='teacher' and r['class_teacher_id']==user['id'])]

    @app.post('/api/leaves',status_code=201)
    def apply_leave(body:NewLeave,request:Request,user=Depends(current_user)):
        if user['role']!='student':raise HTTPException(403,'Sign in as a student to apply for leave.')
        if len(body.reason.strip()) < 10:raise HTTPException(422,'Please explain the leave using at least ten non-padding characters.')
        if body.end_date<body.start_date:raise HTTPException(422,'End date must follow the start date.')
        if (body.end_date-body.start_date).days>30:raise HTTPException(422,'Leave requests are limited to 31 days.')
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM leaves WHERE student_id=? AND status NOT IN ('rejected','cancelled') AND start_date<=? AND end_date>=?",(user['student_id'],str(body.end_date),str(body.start_date))).fetchone():raise HTTPException(409,'These dates overlap an existing leave request.')
            student=db.execute('SELECT * FROM students WHERE id=?',(user['student_id'],)).fetchone()
            lid=db.execute('INSERT INTO leaves(student_id,start_date,end_date,category,reason,created_at) VALUES(?,?,?,?,?,?)',(user['student_id'],str(body.start_date),str(body.end_date),body.category,body.reason,now())).lastrowid
            audit(db,user['id'],'Leave requested',body.category+' leave','leave',student['class_id'],student['id'])
            return {'id':lid,'status':'pending'}

    @app.patch('/api/leaves/{leave_id}')
    def review(leave_id:int,body:ReviewLeave,request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            leave=db.execute('SELECT l.*,s.class_id,c.class_teacher_id FROM leaves l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.id=?',(leave_id,)).fetchone()
            if not leave:raise HTTPException(404,'Leave request not found.')
            if user['role']=='student':
                if leave['student_id']!=user['student_id'] or body.status!='cancelled':raise HTTPException(403,'You may only cancel your own request.')
                if leave['status'] not in ('pending','needs_information'):raise HTTPException(409,'This request can no longer be cancelled.')
            else:
                if user['role']!='admin' and leave['class_teacher_id']!=user['id']:raise HTTPException(403,'Only the assigned class teacher can review this request.')
                if leave['status'] not in ('pending','needs_information'):raise HTTPException(409,'This request has already been resolved.')
                if body.status=='cancelled':raise HTTPException(422,'Teachers must approve, reject, or request information.')
                if body.status in ('rejected','needs_information') and len(body.comment.strip())<5:raise HTTPException(422,'Please explain the decision in a comment.')
            db.execute('UPDATE leaves SET status=?,comment=? WHERE id=?',(body.status,body.comment,leave_id))
            audit(db,user['id'],'Leave '+body.status.replace('_',' '),body.comment or 'Decision recorded.','leave',leave['class_id'],leave['student_id'])
            return {'id':leave_id,'status':body.status}

    @app.patch('/api/leaves/{leave_id}/response')
    def respond_to_leave(leave_id:int,body:LeaveResponse,request:Request,user=Depends(current_user)):
        if user['role']!='student':raise HTTPException(403,'Only the requesting student can respond.')
        with db_for(request.app) as db:
            db.execute('BEGIN IMMEDIATE')
            leave=db.execute('SELECT l.*,s.class_id FROM leaves l JOIN students s ON s.id=l.student_id WHERE l.id=?',(leave_id,)).fetchone()
            if not leave or leave['student_id']!=user['student_id']:raise HTTPException(404,'Leave request not found.')
            if leave['status']!='needs_information':raise HTTPException(409,'This request is not awaiting more information.')
            db.execute("UPDATE leaves SET reason=?,status='pending' WHERE id=?",(body.reason,leave_id))
            audit(db,user['id'],'Leave information updated','The student supplied additional information.','leave',leave['class_id'],leave['student_id'])
            return {'id':leave_id,'status':'pending'}

    @app.get('/api/classes')
    def classes(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            rows=db.execute('SELECT c.*,u.name class_teacher_name FROM classes c LEFT JOIN users u ON u.id=c.class_teacher_id')
            return [dict(r) for r in rows if user['role']=='admin' or r['class_teacher_id']==user['id'] or (user['role']=='student' and db.execute('SELECT 1 FROM students WHERE id=? AND class_id=?',(user['student_id'],r['id'])).fetchone())]

    @app.get('/api/teachers')
    def teachers(request:Request,user=Depends(current_user)):
        admin(user)
        with db_for(request.app) as db:return [dict(r) for r in db.execute("SELECT id,name,email FROM users WHERE role='teacher'")]

    @app.patch('/api/classes/{class_id}/teacher')
    def assign_class(class_id:int,body:Assignment,request:Request,user=Depends(current_user)):
        admin(user)
        with db_for(request.app) as db:
            if not db.execute("SELECT 1 FROM users WHERE id=? AND role='teacher'",(body.teacher_id,)).fetchone():raise HTTPException(422,'Choose an existing teacher.')
            if not db.execute('SELECT 1 FROM classes WHERE id=?',(class_id,)).fetchone():raise HTTPException(404,'Class not found.')
            db.execute('UPDATE classes SET class_teacher_id=? WHERE id=?',(body.teacher_id,class_id))
            audit(db,user['id'],'Class teacher assigned',f'Teacher {body.teacher_id} assigned to class {class_id}.','admin',class_id)
            return {'status':'assigned'}

    @app.patch('/api/subjects/{subject_id}/teacher')
    def assign_subject(subject_id:int,body:Assignment,request:Request,user=Depends(current_user)):
        admin(user)
        with db_for(request.app) as db:
            sub=subject_access(db,user,subject_id)
            if not db.execute("SELECT 1 FROM users WHERE id=? AND role='teacher'",(body.teacher_id,)).fetchone():raise HTTPException(422,'Choose an existing teacher.')
            db.execute('UPDATE subjects SET teacher_id=? WHERE id=?',(body.teacher_id,subject_id))
            audit(db,user['id'],'Subject teacher assigned',sub['name'],'admin',sub['class_id'])
            return {'status':'assigned'}

    @app.get('/api/activity')
    def activity(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            ids=scope(db,user)
            classes={r[0] for r in db.execute('SELECT DISTINCT class_id FROM subjects WHERE id IN ('+','.join('?'*len(ids))+')',ids)} if ids else set()
            leave_classes={r[0] for r in db.execute('SELECT id FROM classes WHERE class_teacher_id=?',(user['id'],))}
            rows=db.execute('SELECT a.id,a.title,a.detail,a.kind,a.created_at,a.class_id,a.student_id,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200')
            return [dict(r) for r in rows if user['role']=='admin' or (user['role']=='teacher' and r['class_id'] in (leave_classes if r['kind']=='leave' else classes)) or (user['role']=='student' and r['student_id']==user['student_id'])][:30]

    @app.get('/api/reports/attendance.csv')
    def export(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:rows=attendance_rows(db,user)
        output=io.StringIO();writer=csv.writer(output)
        writer.writerow(['Roll number','Student','Subject','Lecture date','Status','Source'])
        def safe(value):
            text=str(value)
            return "'"+text if text.startswith(('=','+','-','@','\t','\r')) else text
        writer.writerows([[safe(row[k]) for k in ('roll_number','student_name','subject_name','date','status','source')] for row in rows])
        return Response(output.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="classlens-attendance.csv"'})

    @app.get('/api/dashboard')
    def dashboard(request:Request,user=Depends(current_user)):
        with db_for(request.app) as db:
            sessions=sessions_rows(db,user)
            completed_ids={se['id'] for se in sessions if se['status']=='completed'}
            records=[r for r in attendance_rows(db,user) if r['session_id'] in completed_ids]
            total=len(records);present=sum(r['status'] in ('present','late') for r in records)
            trend=[]
            for offset in range(6,-1,-1):
                day=date.today()-timedelta(days=offset)
                day_rows=[r for r in records if r['date'][:10]==str(day)]
                trend.append({'date':str(day),'label':day.strftime('%a'),'present':sum(r['status'] in ('present','late') for r in day_rows),'total':len(day_rows),'percentage':round(100*sum(r['status'] in ('present','late') for r in day_rows)/len(day_rows)) if day_rows else 0})
            student_ids={r['student_id'] for r in records}
            assigned=scope(db,user)
            roster_ids={r[0] for r in db.execute('SELECT st.id FROM students st WHERE st.class_id IN (SELECT class_id FROM subjects WHERE id IN ('+','.join('?'*len(assigned))+'))',assigned)} if assigned else set()
            if user['role']=='student':roster_ids={user['student_id']}
            at_risk=sum(sum(r['status'] in ('present','late') for r in records if r['student_id']==sid)/max(1,sum(r['student_id']==sid for r in records))<.75 for sid in student_ids)
            return {'demo':True,'attendance_rate':round(100*present/(total or 1),1),'total_students':len(roster_ids),'total_sessions':len(completed_ids),'active_sessions':sum(s['status']=='active' for s in sessions),'at_risk':at_risk,'trend':trend,'stats':[{'label':'Attendance rate','value':f'{100*present/(total or 1):.1f}%','detail':'Present and late / all lecture records'},{'label':'Students','value':str(len(roster_ids)),'detail':'In your assigned classes'},{'label':'Lectures recorded','value':str(len(completed_ids)),'detail':'Completed across assigned subjects'},{'label':'Needs attention','value':str(at_risk),'detail':'Students below 75%'}],'policy':{'target_percentage':75,'excused_counts_as_present':False,'streak_excused_preserves':True}}

    @app.post('/api/vision/enroll/{student_id}')
    async def enroll(student_id:int,request:Request,image:UploadFile=File(...),user=Depends(current_user)):
        staff(user)
        data=await image.read(10*1024*1024+1)
        if len(data)>10*1024*1024:raise HTTPException(413,'Image limit is 10 MB.')
        from .vision import extract_faces
        with db_for(request.app) as db:
            student=db.execute('SELECT * FROM students WHERE id=?',(student_id,)).fetchone()
            if not student:raise HTTPException(404,'Student not found.')
            if not any(db.execute('SELECT class_id FROM subjects WHERE id=?',(sid,)).fetchone()[0]==student['class_id'] for sid in scope(db,user)):raise HTTPException(403,'Student is outside your assigned classes.')
            try:
                faces=await run_in_threadpool(extract_faces,data)
            except RuntimeError as error:raise HTTPException(503,str(error))
            except ValueError as error:raise HTTPException(422,str(error))
            if len(faces)!=1 or faces[0].get('embedding') is None:raise HTTPException(422,'Enrollment requires exactly one clear, sufficiently large face. Move closer and hold steady.')
            existing=db.execute('SELECT COUNT(*) FROM face_templates WHERE student_id=?',(student_id,)).fetchone()[0]
            if existing>=8:raise HTTPException(409,'Eight samples already enrolled. Delete enrollment before replacing samples.')
            db.execute('INSERT INTO face_templates(student_id,embedding,created_at) VALUES(?,?,?)',(student_id,json.dumps(faces[0]['embedding']),now()))
            audit(db,user['id'],'Face sample enrolled',student['name'],'enrollment',student['class_id'],student_id)
            return {'student_id':student_id,'samples':existing+1,'message':'Sample saved. Enroll several clear angles for better coverage.'}

    @app.delete('/api/vision/enroll/{student_id}')
    def delete_enrollment(student_id:int,request:Request,user=Depends(current_user)):
        staff(user)
        with db_for(request.app) as db:
            student=db.execute('SELECT * FROM students WHERE id=?',(student_id,)).fetchone()
            if not student:raise HTTPException(404,'Student not found.')
            if not any(db.execute('SELECT class_id FROM subjects WHERE id=?',(sid,)).fetchone()[0]==student['class_id'] for sid in scope(db,user)):raise HTTPException(403,'Student is outside your assigned classes.')
            db.execute('DELETE FROM face_templates WHERE student_id=?',(student_id,))
            audit(db,user['id'],'Enrollment deleted',student['name'],'enrollment',student['class_id'],student_id)
            return {'status':'deleted'}

    @app.post('/api/sessions/{session_id}/capture')
    async def capture(session_id:int,request:Request,image:UploadFile=File(...),mode:Literal['photo','live']=Query('photo'),user=Depends(current_user)):
        staff(user)
        data=await image.read(10*1024*1024+1)
        if len(data)>10*1024*1024:raise HTTPException(413,'Image limit is 10 MB.')
        from .vision import match_faces
        with db_for(request.app) as db:
            se=session_access(db,user,session_id)
            if se['status']!='active':raise HTTPException(409,'Session is locked. Start or reopen a session first.')
            sub=subject_access(db,user,se['subject_id'])
            templates=[{'student_id':r['student_id'],'name':r['name'],'embedding':json.loads(r['embedding'])} for r in db.execute('SELECT f.*,s.name FROM face_templates f JOIN students s ON s.id=f.student_id WHERE s.class_id=?',(sub['class_id'],))]
            try:
                faces=(await run_in_threadpool(match_faces,data,templates))['faces']
            except RuntimeError as error:raise HTTPException(503,str(error))
            except ValueError as error:raise HTTPException(422,str(error))
            db.execute('BEGIN IMMEDIATE')
            if session_access(db,user,session_id)['status']!='active':raise HTTPException(409,'Session was finalized while recognition was processing. No attendance was changed.')
            marked=[]
            seen=set()
            for face in faces:
                if face.get('status') not in ('matched','confirmed') or not face.get('student_id'):continue
                student_id=face['student_id']
                if student_id in seen:
                    face.update(status='review',reason='Repeated identity in this image; verify manually.')
                    continue
                seen.add(student_id)
                if mode=='live':
                    hit=db.execute('SELECT * FROM recognition_hits WHERE session_id=? AND student_id=?',(session_id,student_id)).fetchone()
                    hits=hit['hits']+1 if hit and (datetime.now(timezone.utc)-datetime.fromisoformat(hit['last_seen'])).total_seconds()<12 else 1
                    db.execute('INSERT INTO recognition_hits VALUES(?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET hits=excluded.hits,last_seen=excluded.last_seen',(session_id,student_id,hits,now()))
                    if hits<3:
                        face['status']='confirming';face['confirmation_frames']=hits;continue
                existing=db.execute('SELECT status FROM attendance WHERE session_id=? AND student_id=?',(session_id,student_id)).fetchone()
                if existing and existing['status'] not in ('present','late'):
                    face.update(status='review',reason='Existing '+existing['status']+' attendance was preserved. Review or correct this record manually.')
                    continue
                cursor=db.execute("INSERT OR IGNORE INTO attendance(session_id,student_id,status,source,updated_at) VALUES(?,?,'present','camera',?)",(session_id,student_id,now()))
                face['status']='confirmed'
                if cursor.rowcount:
                    marked.append(student_id)
                    audit(db,user['id'],'Student recognized',face.get('name','Student'),'recognition',sub['class_id'],student_id)
            return {'faces':faces,'newly_marked':marked,'detected':len(faces),'mode':mode,'message':'No enrolled face samples for this class.' if not templates else 'Review uncertain matches; raw captures are not retained.'}


app=create_app()
