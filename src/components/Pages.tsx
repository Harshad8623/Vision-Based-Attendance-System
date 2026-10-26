import { useEffect, useState } from "react";
import {
  Search,
  Download,
  Pencil,
  Users,
  ShieldCheck,
  ArrowUpRight,
  Flame,
  Plus,
  CalendarDays,
  Send,
  Check,
  X,
  FileText,
  Upload,
  BookOpen,
  LockKeyhole,
  RotateCcw,
  Info,
  TrendingUp,
  UserPlus,
  LoaderCircle,
} from "lucide-react";
import {
  api,
  post,
  patch,
  type Attendance,
  type Student,
  type Subject,
  type User,
  type Leave,
  type Teacher,
  type Session,
} from "../api";
import {
  Avatar,
  Empty,
  Modal,
  Notice,
  Pill,
  SectionTitle,
  formatDate,
} from "./ui";
type Shared = {
  user: User;
  onRefresh: () => void;
  toast: (message: string, error?: boolean) => void;
};
export function PageHeading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="orange">.</span>
        </h1>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}
export function AttendancePage({
  user,
  onRefresh,
  toast,
  sessions,
}: { sessions: Session[] } & Shared) {
  const [records, setRecords] = useState<Attendance[]>([]),
    [search, setSearch] = useState(""),
    [session, setSession] = useState(""),
    [status, setStatus] = useState(""),
    [edit, setEdit] = useState<Attendance | null>(null),
    [value, setValue] = useState("present"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api<Attendance[]>("/attendance" + (session ? `?session_id=${session}` : ""))
      .then(setRecords)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [session]);
  const filtered = records.filter(
    (r) =>
      `${r.student_name} ${r.roll_number} ${r.subject_name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!status || r.status === status),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    try {
      await patch(`/attendance/${edit.id}`, { status: value, reason });
      setEdit(null);
      await load();
      onRefresh();
      toast("Attendance updated. The reason is saved in the audit trail.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    try {
      const response = await fetch("/api/reports/attendance.csv", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("classlens_token")}`,
        },
      });
      if (!response.ok) throw new Error("Could not export attendance.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "classlens-attendance.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast("Exported all attendance records you are authorized to access.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function reopen(id: number) {
    try {
      await post(`/sessions/${id}/reopen`, {});
      onRefresh();
      await load();
      toast("Session reopened. You can now correct its records.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="EVERY RECORD HAS A STORY"
        title="Attendance, accounted for"
        text="Review lecture records, make thoughtful corrections, and keep a clear history."
      >
        <button className="button secondary" onClick={download}>
          <Download size={16} />
          Export all CSV
        </button>
      </PageHeading>
      <div className="info-banner">
        <ShieldCheck size={20} />
        <span>
          Corrections require a reason and are audited. Completed sessions are
          locked; an administrator can reopen them.
        </span>
      </div>
      <section className="card">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search attendance"
              placeholder="Find a student, roll number, or subject"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter lecture"
            value={session}
            onChange={(e) => setSession(e.target.value)}
          >
            <option value="">All lectures</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject_name} · {formatDate(s.started_at)} · #{s.id}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter attendance status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {["present", "late", "absent", "excused"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {error && <Notice error>{error}</Notice>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject / lecture</th>
                <th>Date</th>
                <th>Status</th>
                <th>Recorded by</th>
                {user.role !== "student" && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 150).map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={r.student_name} index={i} small />
                      <div>
                        <strong>{r.student_name}</strong>
                        <small>{r.roll_number}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.subject_name}
                    <small>Session #{r.session_id}</small>
                  </td>
                  <td>{formatDate(r.date)}</td>
                  <td>
                    <Pill
                      tone={
                        r.status === "present"
                          ? "green"
                          : r.status === "absent"
                            ? "red"
                            : r.status === "late"
                              ? "orange"
                              : "blue"
                      }
                    >
                      {r.status}
                    </Pill>
                  </td>
                  <td>
                    <span className="source-label">{r.source}</span>
                  </td>
                  {user.role !== "student" && (
                    <td>
                      <div className="inline-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${r.student_name} attendance`}
                          onClick={() => {
                            setEdit(r);
                            setValue(r.status);
                            setReason("");
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        {user.role === "admin" &&
                          sessions.find((s) => s.id === r.session_id)
                            ?.status === "completed" && (
                            <button
                              className="icon-button"
                              title="Reopen lecture"
                              aria-label={`Reopen session ${r.session_id}`}
                              onClick={() => void reopen(r.session_id)}
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty
            title="No matching records"
            text="Try another filter, or start a lecture to record attendance."
          />
        )}
        <div className="table-footer">
          Showing {Math.min(filtered.length, 150)} of {filtered.length} matching
          records · Export includes all authorized records.
        </div>
      </section>
      {edit && (
        <Modal
          title="Correct attendance"
          subtitle={`${edit.student_name} · ${edit.subject_name}`}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <label>
              Attendance status
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                {["present", "late", "absent", "excused"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Reason for correction
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={5}
                maxLength={500}
                placeholder="Explain what changed and why…"
                required
              />
            </label>
            <p className="form-hint">
              Your identity, the previous status, and this reason will be
              recorded.
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save correction"}
              <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function StudentsPage({
  students,
  user,
  onRefresh,
  toast,
}: { students: Student[] } & Shared) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Student | null>(null),
    [busy, setBusy] = useState(false),
    [add, setAdd] = useState(false);
  const list = students.filter(
    (s) =>
      `${s.name} ${s.roll_number}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "risk" && s.attendance < 75) ||
        (filter === "enroll" && !s.enrolled)),
  );
  async function enroll(file: File) {
    if (!selected) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const result = await api<{ message: string }>(
        `/vision/enroll/${selected.id}`,
        { method: "POST", body: data },
      );
      toast(result.message);
      onRefresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/vision/enroll/${selected.id}`, { method: "DELETE" });
      toast("Face templates deleted.");
      setSelected(null);
      onRefresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function addStudent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await post("/students", {
        name: data.get("name"),
        email: data.get("email"),
        roll_number: data.get("roll_number"),
        password: data.get("password"),
        class_id: 1,
      });
      setAdd(false);
      onRefresh();
      toast("Student and sign-in account created.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE BEFORE PERCENTAGES"
        title="Meet your classroom"
        text="A little context helps you support every student better."
      >
        {user.role === "admin" && (
          <button className="button primary" onClick={() => setAdd(true)}>
            <UserPlus size={17} />
            Add student
          </button>
        )}
      </PageHeading>
      <div className="mini-stat-row">
        <div>
          <Users size={20} />
          <strong>{students.length}</strong>
          <span>Students</span>
        </div>
        <div>
          <ShieldCheck size={20} />
          <strong>{students.filter((s) => s.enrolled).length}</strong>
          <span>Face enrolled</span>
        </div>
        <div>
          <Flame size={20} />
          <strong>{Math.max(0, ...students.map((s) => s.streak))}</strong>
          <span>Longest current streak</span>
        </div>
      </div>
      <section className="card">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search students"
              placeholder="Search by name or roll number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter students"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All students</option>
            <option value="risk">Below 75%</option>
            <option value="enroll">Enrollment needed</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Attendance</th>
                <th>Current streak</th>
                <th>Face enrollment</th>
                {user.role !== "student" && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={s.name} index={i} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.roll_number}</small>
                      </div>
                    </div>
                  </td>
                  <td>{s.section}</td>
                  <td>
                    <strong>{s.attendance}%</strong>
                    <div className="progress-track table-progress">
                      <i style={{ width: `${s.attendance}%` }} />
                    </div>
                  </td>
                  <td>
                    <span className="streak-inline">
                      <Flame size={16} />
                      {s.streak} days
                    </span>
                  </td>
                  <td>
                    <Pill tone={s.enrolled ? "green" : "neutral"}>
                      {s.enrolled ? "Enrolled" : "Not enrolled"}
                    </Pill>
                  </td>
                  {user.role !== "student" && (
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(s)}
                      >
                        Manage
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty
            title="No students found"
            text="Try adjusting your search or filter."
          />
        )}
      </section>
      {selected && (
        <Modal
          title="Face enrollment"
          subtitle={`${selected.name} · ${selected.roll_number}`}
          onClose={() => setSelected(null)}
        >
          <div className="info-banner">
            <Info size={19} />
            <span>
              With the student’s consent, add several clear images at slightly
              different angles. Each image must contain exactly one face.
            </span>
          </div>
          <p className="form-hint">
            Only face embeddings are stored; uploaded images are not retained.
            Biometric templates are sensitive data. Enrollment requires
            installed recognition models.
          </p>
          <label className="upload-zone">
            <Upload size={24} />
            <strong>
              {busy ? "Processing sample…" : "Choose a face image"}
            </strong>
            <span>JPEG or PNG · up to 10 MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enroll(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="button secondary danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete all face samples
          </button>
        </Modal>
      )}
      {add && (
        <Modal
          title="Add a student"
          subtitle="Create a student profile and sign-in account."
          onClose={() => setAdd(false)}
        >
          <form onSubmit={addStudent}>
            <label>
              Full name
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <div className="field-row">
              <label>
                Roll number
                <input name="roll_number" required maxLength={30} />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
            </div>
            <label>
              Initial password
              <input
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </label>
            <p className="form-hint">
              Assigned to ECE · Final Year · Section A. Share the initial
              password securely.
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? "Creating…" : "Create student"}
              <Plus size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function LeavesPage({
  leaves,
  user,
  onRefresh,
  toast,
}: { leaves: Leave[] } & Shared) {
  const [filter, setFilter] = useState("all"),
    [apply, setApply] = useState(false),
    [review, setReview] = useState<Leave | null>(null),
    [decision, setDecision] = useState("approved"),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState<Leave | null>(null),
    [replyReason, setReplyReason] = useState("");
  const pending = leaves.filter(
    (l) => l.status === "pending" || l.status === "needs_information",
  ).length;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await post("/leaves", Object.fromEntries(data.entries()));
      setApply(false);
      onRefresh();
      toast("Leave request sent to your assigned class teacher.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function decide(e: React.FormEvent) {
    e.preventDefault();
    if (!review) return;
    setBusy(true);
    try {
      await patch(`/leaves/${review.id}`, { status: decision, comment });
      setReview(null);
      onRefresh();
      toast("Decision recorded. The student can see your response.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function respond(e: React.FormEvent) {
    e.preventDefault();
    if (!reply) return;
    setBusy(true);
    try {
      await patch(`/leaves/${reply.id}/response`, { reason: replyReason });
      setReply(null);
      onRefresh();
      toast("Updated information sent to your class teacher.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: number) {
    try {
      await patch(`/leaves/${id}`, {
        status: "cancelled",
        comment: "Withdrawn by student.",
      });
      onRefresh();
      toast("Leave request withdrawn.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE UNDERSTANDING GOES A LONG WAY"
        title={
          user.role === "student"
            ? "Room for life"
            : "Leave, without the paperwork"
        }
        text={
          user.role === "student"
            ? "Request time away and keep your class teacher in the loop."
            : "Review student requests with context, clarity, and care."
        }
      >
        {user.role === "student" && (
          <button className="button primary" onClick={() => setApply(true)}>
            <Plus size={17} />
            Apply for leave
          </button>
        )}
      </PageHeading>
      <div className="mini-stat-row">
        <div>
          <ClockIcon />
          <strong>{pending}</strong>
          <span>Awaiting action</span>
        </div>
        <div>
          <Check size={20} />
          <strong>
            {leaves.filter((l) => l.status === "approved").length}
          </strong>
          <span>Approved</span>
        </div>
        <div>
          <FileText size={20} />
          <strong>{leaves.length}</strong>
          <span>Total requests</span>
        </div>
      </div>
      <div className="info-banner">
        <ShieldCheck size={20} />
        <span>
          Requests go to the class teacher assigned by the administrator.
          Approved leave becomes excused when an affected session is finalized;
          it does not count as present.
        </span>
      </div>
      <div className="tabs">
        {["all", "pending", "approved", "rejected", "needs_information"].map(
          (s) => (
            <button
              key={s}
              className={filter === s ? "active" : ""}
              onClick={() => setFilter(s)}
            >
              {s.replace("_", " ")}
              {s === "pending" && (
                <span>
                  {leaves.filter((l) => l.status === "pending").length}
                </span>
              )}
            </button>
          ),
        )}
      </div>
      <div className="leave-grid">
        {leaves
          .filter((l) => filter === "all" || l.status === filter)
          .map((l, i) => (
            <article className="card leave-card" key={l.id}>
              <div className="leave-card-top">
                <div className="person-cell">
                  <Avatar name={l.student_name} index={i} />
                  <div>
                    <strong>{l.student_name}</strong>
                    <small>{l.roll_number}</small>
                  </div>
                </div>
                <Pill
                  tone={
                    l.status === "approved"
                      ? "green"
                      : l.status === "rejected"
                        ? "red"
                        : l.status === "pending"
                          ? "orange"
                          : "neutral"
                  }
                >
                  {l.status.replace("_", " ")}
                </Pill>
              </div>
              <div className="leave-dates">
                <CalendarDays size={19} />
                <strong>
                  {formatDate(l.start_date)}
                  {l.end_date !== l.start_date &&
                    ` — ${formatDate(l.end_date)}`}
                </strong>
                <span>{l.category}</span>
              </div>
              <p className="leave-reason">{l.reason}</p>
              {l.comment && (
                <div className="leave-comment">
                  <span>CLASS TEACHER’S RESPONSE</span>
                  <p>{l.comment}</p>
                </div>
              )}
              <div className="leave-card-bottom">
                <small>Requested {formatDate(l.created_at)}</small>
                {["pending", "needs_information"].includes(l.status) &&
                  (user.role === "student" ? (
                    <div className="inline-actions">
                      {l.status === "needs_information" && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setReply(l);
                            setReplyReason(l.reason);
                          }}
                        >
                          Respond
                          <Send size={14} />
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => void cancel(l.id)}
                      >
                        Withdraw
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => {
                        setReview(l);
                        setComment("");
                        setDecision("approved");
                      }}
                    >
                      Review request
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </div>
            </article>
          ))}
      </div>
      {!leaves.filter((l) => filter === "all" || l.status === filter)
        .length && (
        <section className="card">
          <Empty
            title="All clear here"
            text="No leave requests match this view."
            icon={<CalendarDays size={32} />}
          />
        </section>
      )}
      {reply && (
        <Modal
          title="Add more information"
          subtitle="Your request will return to your class teacher for review."
          onClose={() => setReply(null)}
        >
          <form onSubmit={respond}>
            <div className="review-reason">{reply.comment}</div>
            <label>
              Updated reason
              <textarea
                value={replyReason}
                onChange={(e) => setReplyReason(e.target.value)}
                minLength={10}
                maxLength={2000}
                required
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Sending…" : "Send response"}
              <Send size={16} />
            </button>
          </form>
        </Modal>
      )}
      {apply && (
        <Modal
          title="Apply for leave"
          subtitle="Your request will reach your assigned class teacher."
          onClose={() => setApply(false)}
        >
          <form onSubmit={submit}>
            <div className="field-row">
              <label>
                From
                <input type="date" name="start_date" required />
              </label>
              <label>
                Until
                <input type="date" name="end_date" required />
              </label>
            </div>
            <label>
              Category
              <select name="category">
                {["Medical", "Personal", "Academic", "Other"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <textarea
                name="reason"
                placeholder="Help your class teacher understand your request…"
                minLength={10}
                maxLength={2000}
                required
              />
            </label>
            <p className="form-hint">
              Maximum 31 days. Overlapping active requests are not allowed.
              Avoid including unnecessary medical details.
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? "Sending…" : "Send request"}
              <Send size={16} />
            </button>
          </form>
        </Modal>
      )}
      {review && (
        <Modal
          title="Review leave request"
          subtitle={`${review.student_name} · ${formatDate(review.start_date)} to ${formatDate(review.end_date)}`}
          onClose={() => setReview(null)}
        >
          <div className="review-reason">{review.reason}</div>
          <form onSubmit={decide}>
            <label>
              Decision
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="approved">Approve leave</option>
                <option value="rejected">Reject request</option>
                <option value="needs_information">
                  Request more information
                </option>
              </select>
            </label>
            <label>
              Response to student
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a helpful explanation…"
                required={decision !== "approved"}
                minLength={decision === "approved" ? 0 : 5}
                maxLength={1000}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save decision"}
              <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function ClockIcon() {
  return <CalendarDays size={20} />;
}
export function AnalyticsPage({
  subjects,
  students,
  user,
  sessions,
}: {
  subjects: Subject[];
  students: Student[];
  user: User;
  sessions: Session[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || 0),
    [target, setTarget] = useState(75);
  const [records, setRecords] = useState<Attendance[]>([]);
  useEffect(() => {
    api<Attendance[]>("/attendance")
      .then(setRecords)
      .catch(() => {});
  }, []);
  const subject = subjects.find((s) => s.id === subjectId);
  const ownRows = records.filter(
    (r) =>
      r.subject_name === subject?.name &&
      sessions.some((s) => s.id === r.session_id && s.status === "completed"),
  );
  const total = ownRows.length,
    attended = ownRows.filter((r) =>
      ["present", "late"].includes(r.status),
    ).length;
  const required =
    target === 100
      ? attended === total
        ? 0
        : Infinity
      : Math.max(
          0,
          Math.ceil((target * total - 100 * attended) / (100 - target)),
        );
  return (
    <>
      <PageHeading
        eyebrow="FROM NUMBERS TO NEXT STEPS"
        title="Understand the bigger picture"
        text="Clear subject insights and practical guidance. No unexplained predictions."
      />
      <div className="analytics-grid">
        {subjects.map((s, i) => (
          <section className="card analytic-subject" key={s.id}>
            <div className="analytic-top">
              <span className={`subject-icon subject-icon-${i % 4}`}>
                <BookOpen size={21} />
              </span>
              <Pill tone={s.attendance >= 75 ? "green" : "orange"}>
                {s.attendance >= 75 ? "On track" : "Needs attention"}
              </Pill>
            </div>
            <h2>{s.name}</h2>
            <p>
              {s.code} · {s.section}
            </p>
            <div className="analytic-number">
              {s.attendance}
              <span>%</span>
            </div>
            <div className="progress-track">
              <i style={{ width: `${s.attendance}%` }} />
            </div>
            <div className="analytic-bottom">
              <span>{s.total_sessions} lectures recorded</span>
              <span>Target 75%</span>
            </div>
          </section>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="card planner">
          <SectionTitle
            title={
              user.role === "student"
                ? "Your attendance planner"
                : "Attendance policy, explained"
            }
            subtitle={
              user.role === "student"
                ? "Know the next step, not just the percentage."
                : "Consistent calculations that everyone can understand."
            }
          />
          {user.role === "student" ? (
            <>
              <div className="field-row">
                <label>
                  Subject
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(Number(e.target.value))}
                  >
                    {subjects.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Target percentage
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={target}
                    onChange={(e) =>
                      setTarget(
                        Math.min(100, Math.max(1, Number(e.target.value))),
                      )
                    }
                  />
                </label>
              </div>
              <div className="planner-result">
                <TrendingUp size={28} />
                <div>
                  <strong>
                    {required === Infinity
                      ? "100% cannot be recovered after a missed lecture."
                      : required === 0
                        ? "You’re meeting your target."
                        : `Attend the next ${required} lecture${required === 1 ? "" : "s"}.`}
                  </strong>
                  <p>
                    {attended} attended of {total} recorded. Assumes all next
                    lectures are attended and the target stays the same.
                    Remaining term schedule is not yet configured.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="policy-list">
              <div>
                <Check size={17} />
                <p>
                  <strong>Present + late count as attended.</strong> The
                  denominator includes all recorded lectures, including excused
                  leave.
                </p>
              </div>
              <div>
                <CalendarDays size={17} />
                <p>
                  <strong>Leave is context, not automatic presence.</strong>{" "}
                  Approved leave excuses unmarked students when an affected
                  session is finalized.
                </p>
              </div>
              <div>
                <ShieldCheck size={17} />
                <p>
                  <strong>Corrections stay traceable.</strong> Every manual
                  change stores the actor, reason, and previous status.
                </p>
              </div>
            </div>
          )}
        </section>
        <section className="card streak-card">
          <div className="streak-emblem">
            <Flame size={31} />
          </div>
          <span className="eyebrow">CONSISTENCY, CELEBRATED</span>
          <h2>
            Small steps.
            <br />
            Lasting habits.
          </h2>
          <div className="streak-large">
            {Math.max(0, ...students.map((s) => s.streak))}
            <span>day current streak</span>
          </div>
          <p>
            {user.role === "student"
              ? "Your consecutive completed class days."
              : "Longest current streak in your visible roster."}{" "}
            A complete day has no absent records. Days without recorded lectures
            are skipped; excused records preserve the streak.
          </p>
          <span className="streak-caption">
            PROGRESS IS PERSONAL. NO PUBLIC RANKINGS.
          </span>
        </section>
      </div>
    </>
  );
}
export function SettingsPage({
  user,
  subjects,
  onRefresh,
  toast,
}: Shared & { subjects: Subject[] }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]),
    [classes, setClasses] = useState<
      {
        id: number;
        name: string;
        class_teacher_id: number;
        class_teacher_name: string;
      }[]
    >([]),
    [health, setHealth] = useState<{ vision_ready: boolean } | null>(null),
    [add, setAdd] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ vision_ready: boolean }>("/health")
      .then(setHealth)
      .catch(() => {});
    if (user.role === "admin") {
      api<Teacher[]>("/teachers")
        .then(setTeachers)
        .catch((e) => toast(e.message, true));
      api<typeof classes>("/classes")
        .then(setClasses)
        .catch((e) => toast(e.message, true));
    }
  }, [user.role]);
  async function assign(kind: string, id: number, teacher: number) {
    try {
      await patch(`/${kind}/${id}/teacher`, { teacher_id: teacher });
      onRefresh();
      if (kind === "classes") setClasses(await api("/classes"));
      toast(
        "Teacher assignment updated. Access rules now reflect this assignment.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function addTeacher(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(
        "/teachers",
        Object.fromEntries(new FormData(e.currentTarget).entries()),
      );
      setTeachers(await api("/teachers"));
      setAdd(false);
      toast(
        "Teacher account created. Assign a class or subject to grant access.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A WORKSPACE THAT WORKS FOR YOU"
        title="Settings & people"
        text="Clear responsibilities, careful permissions, and transparent system status."
      />
      <section className="card settings-profile">
        <Avatar name={user.name} />
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
        </div>
        <Pill tone="green">{user.role}</Pill>
      </section>
      {user.role === "admin" && (
        <>
          <section className="card settings-section">
            <SectionTitle
              title="Class teacher assignments"
              subtitle="Class teachers review leave requests for their assigned class."
              action="Add teacher"
              onAction={() => setAdd(true)}
            />
            {classes.map((c) => (
              <div className="assignment-row" key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <p>Leave approval access</p>
                </div>
                <select
                  aria-label={`Class teacher for ${c.name}`}
                  value={c.class_teacher_id}
                  onChange={(e) =>
                    void assign("classes", c.id, Number(e.target.value))
                  }
                >
                  {teachers.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </section>
          <section className="card settings-section">
            <SectionTitle
              title="Subject teacher assignments"
              subtitle="Teachers can manage attendance for their assigned subjects."
            />
            {subjects.map((s) => (
              <div className="assignment-row" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>
                    {s.code} · {s.section}
                  </p>
                </div>
                <select
                  aria-label={`Teacher for ${s.name}`}
                  value={s.teacher_id}
                  onChange={(e) =>
                    void assign("subjects", s.id, Number(e.target.value))
                  }
                >
                  {teachers.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </section>
        </>
      )}
      <div className="dashboard-middle">
        <section className="card settings-section">
          <SectionTitle title="System status" />
          <div className="status-row">
            <span>Database</span>
            <Pill tone="green">Connected</Pill>
          </div>
          <div className="status-row">
            <span>Face recognition models</span>
            <Pill tone={health?.vision_ready ? "green" : "orange"}>
              {health?.vision_ready ? "Available" : "Setup required"}
            </Pill>
          </div>
          <p className="form-hint">
            Recognition requires the official YuNet and SFace model files and
            enrolled students. Camera access on a phone requires HTTPS.
          </p>
          <div className="info-banner">
            <LockKeyhole size={19} />
            <span>
              Development workspace with publicly documented demo accounts. Do
              not expose it to real students without production hardening.
            </span>
          </div>
        </section>
        <section className="card creator-card">
          <span className="eyebrow">BUILT WITH PURPOSE</span>
          <h2>
            A clearer picture.
            <br />A human touch.
          </h2>
          <p>Vision Based Classroom Automated Attendance System</p>
          <div className="creator-detail">
            <strong>Harshad Madhav Dhuppe</strong>
            <span>Electronics & Computer Engineering</span>
            <span>Batch of 2027</span>
          </div>
          <a
            href="https://github.com/Harshad8623/Vision-Based-Attendance-System"
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            View project on GitHub
            <ArrowUpRight size={15} />
          </a>
        </section>
      </div>
      {add && (
        <Modal
          title="Create teacher account"
          subtitle="Assignments determine what this teacher can access."
          onClose={() => setAdd(false)}
        >
          <form onSubmit={addTeacher}>
            <label>
              Full name
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <label>
              Email address
              <input name="email" type="email" required />
            </label>
            <label>
              Initial password
              <input
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <>
                  Create teacher
                  <UserPlus size={16} />
                </>
              )}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
