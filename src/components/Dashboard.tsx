import {
  ArrowRight,
  ArrowUpRight,
  ScanLine,
  Users,
  CalendarCheck,
  Clock3,
  Flame,
  BookOpen,
  Check,
  ArrowDownRight,
  Sparkles,
  CircleCheck,
  CalendarDays,
  Coffee,
} from "lucide-react";
import { Avatar, Pill, SectionTitle, Empty } from "./ui";
import type { Subject, Student, Session, Leave, Activity, User } from "../api";
export default function Dashboard({
  user,
  subjects,
  students,
  sessions,
  leaves,
  activity,
  navigate,
}: {
  user: User;
  subjects: Subject[];
  students: Student[];
  sessions: Session[];
  leaves: Leave[];
  activity: Activity[];
  navigate: (page: string) => void;
}) {
  const isStudent = user.role === "student";
  const average = Math.round(
    subjects.reduce((a, s) => a + s.attendance * s.total_sessions, 0) /
      (subjects.reduce((a, s) => a + s.total_sessions, 0) || 1),
  );
  const pending = leaves.filter((l) => l.status === "pending").length;
  const own = students[0];
  const streak = isStudent
    ? own?.streak || 0
    : Math.max(0, ...students.map((s) => s.streak));
  const atRisk = students.filter((s) => s.attendance < 75).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CLASSROOM, IN FOCUS</div>
          <h1>
            A little clarity. A better day<span className="orange">.</span>
          </h1>
          <p>
            Welcome back, {user.name.replace("Prof. ", "").split(" ")[0]}.
            Here’s what’s happening in your classroom.
          </p>
        </div>
        <div className="date-tag">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>
      <div className="dashboard-top">
        <section className="attendance-hero">
          <div className="hero-copy">
            <span className="hero-tag">
              <span /> MORE TIME FOR WHAT MATTERS
            </span>
            <h2>
              {isStudent ? (
                <>
                  Small steps.
                  <br />
                  Stronger habits.
                </>
              ) : (
                <>
                  Less roll call.
                  <br />
                  More real teaching.
                </>
              )}
            </h2>
            <p>
              {isStudent
                ? "Your progress is built one lecture at a time. Make today count."
                : "Bring your classroom into focus. Capture a group, review the matches, and you’re ready to teach."}
            </p>
            <button
              className="button dark"
              onClick={() => navigate(isStudent ? "analytics" : "capture")}
            >
              {isStudent ? "Explore my attendance" : "Start capturing"}
              {isStudent ? <ArrowUpRight size={17} /> : <ScanLine size={18} />}
            </button>
            <span className="hero-footnote">
              {isStudent
                ? "A clearer view of your academic journey"
                : "Your phone. Your classroom. One simple workflow."}
            </span>
          </div>
          <div className="hero-illustration" aria-hidden="true">
            <div className="scan-orbit" />
            <div className="scan-frame">
              <i />
              <i />
              <i />
              <i />
              <div className="portrait portrait-back">
                <div className="hair" />
                <div className="head" />
                <div className="body" />
              </div>
              <div className="portrait portrait-front">
                <div className="hair" />
                <div className="head" />
                <div className="body" />
              </div>
              <div className="portrait portrait-right">
                <div className="hair" />
                <div className="head" />
                <div className="body" />
              </div>
              <div className="scan-beam" />
            </div>
            <div className="illustration-tag">
              <CircleCheck size={17} />
              <span>Every student counts.</span>
            </div>
            <Sparkles className="hero-sparkle" size={25} />
            <span className="hero-cross">+</span>
          </div>
        </section>
        <section className="daily-note">
          <div className="note-top">
            <span className="eyebrow">THE BIGGER PICTURE</span>
            <span className="small-icon">
              <Coffee size={18} />
            </span>
          </div>
          <h3>
            A classroom is more
            <br />
            than a headcount.
          </h3>
          <p>
            Notice the patterns.
            <br />
            Support the person.
          </p>
          <div className="note-divider" />
          <div className="note-bottom">
            <div className="avatar-stack">
              {students.slice(0, 3).map((s, i) => (
                <Avatar key={s.id} name={s.name} index={i} />
              ))}
            </div>
            <span>
              {students.length}{" "}
              {isStudent ? "student in your view" : "students"}
              <br />
              <strong>One shared journey.</strong>
            </span>
          </div>
        </section>
      </div>
      <div className="stat-grid">
        <Stat
          icon={<Users size={20} />}
          label={isStudent ? "Overall attendance" : "Class attendance"}
          value={`${average}%`}
          meta="Across assigned subjects"
          tone="sage"
        />
        <Stat
          icon={<CalendarCheck size={20} />}
          label="Lecture sessions"
          value={String(
            sessions.filter((s) => s.status === "completed").length,
          ).padStart(2, "0")}
          meta="Completed in this workspace"
          tone="peach"
        />
        <Stat
          icon={<Flame size={20} />}
          label={isStudent ? "Your best habit" : "Longest current streak"}
          value={`${streak}`}
          unit="days"
          meta="Consecutive eligible class days"
          tone="lavender"
        />
        <Stat
          icon={isStudent ? <BookOpen size={20} /> : <Clock3 size={20} />}
          label={isStudent ? "Your subjects" : "Leave requests"}
          value={String(isStudent ? subjects.length : pending).padStart(2, "0")}
          meta={
            isStudent
              ? "Keep your progress in view"
              : "Awaiting a class teacher decision"
          }
          tone="sand"
          onClick={() => navigate(isStudent ? "analytics" : "leaves")}
        />
      </div>
      <div className="dashboard-middle">
        <section className="card trend-card">
          <SectionTitle
            title="The attendance picture"
            subtitle="Recorded attendance by subject"
            action="Explore insights"
            onAction={() => navigate("analytics")}
          />
          <div className="chart-key">
            <span>
              <i className="legend-sage" />
              Attendance rate
            </span>
            <span className="chart-policy">75% minimum target</span>
          </div>
          <div className="bar-chart">
            <div className="chart-labels">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            <div className="bar-plot">
              <div className="chart-grid">
                <i />
                <i className="target-grid" />
                <i />
                <i />
                <i />
              </div>
              <div className="bars">
                {subjects.slice(0, 6).map((s, i) => (
                  <div className="bar-column" key={s.id}>
                    <span className="bar-value">{s.attendance}%</span>
                    <div
                      className={`chart-bar chart-bar-${i % 3}`}
                      style={{
                        height: `${Math.max(1, s.attendance) * 1.65}px`,
                      }}
                      title={`${s.name}: ${s.attendance}%`}
                    />
                    <span className="bar-name">{s.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-footer">
            <span className="small-icon sage">
              <ArrowUpRight size={16} />
            </span>
            <p>
              {atRisk
                ? `${atRisk} student${atRisk === 1 ? " needs" : "s need"} a little extra attention.`
                : "Every small improvement adds up."}{" "}
              <button onClick={() => navigate("students")}>
                View student details
              </button>
            </p>
          </div>
        </section>
        <section className="card subjects-card">
          <SectionTitle
            title={isStudent ? "Your subjects" : "Subjects at a glance"}
            action="View all"
            onAction={() => navigate("analytics")}
          />
          <div className="subject-list">
            {subjects.slice(0, 4).map((s, i) => (
              <div className="subject-row" key={s.id}>
                <span className={`subject-icon subject-icon-${i % 4}`}>
                  <BookOpen size={18} />
                </span>
                <div className="subject-info">
                  <strong>{s.name}</strong>
                  <span>
                    {s.code} · {s.section}
                  </span>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${s.attendance}%`,
                        background: s.attendance < 75 ? "#da8a58" : "#719487",
                      }}
                    />
                  </div>
                </div>
                <div className="subject-rate">
                  <strong>{s.attendance}%</strong>
                  <small>
                    {s.attendance >= 75 ? "On track" : "Needs care"}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="card">
          <SectionTitle
            title="Recent sessions"
            subtitle="A record of the moments that count"
            action="Attendance log"
            onAction={() => navigate("attendance")}
          />
          {sessions.length ? (
            <div className="session-list">
              {sessions.slice(0, 3).map((s, i) => (
                <div className="session-row" key={s.id}>
                  <div className={`session-date session-date-${i}`}>
                    <span>
                      {new Date(s.started_at).toLocaleDateString("en-IN", {
                        month: "short",
                      })}
                    </span>
                    <strong>{new Date(s.started_at).getDate()}</strong>
                  </div>
                  <div className="session-info">
                    <strong>{s.subject_name}</strong>
                    <span>
                      {s.title || s.subject_code} ·{" "}
                      {new Date(s.started_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <Pill tone={s.status === "active" ? "orange" : "green"}>
                    {s.status === "active" ? "In progress" : "Completed"}
                  </Pill>
                  <span className="session-count">
                    {s.present}
                    <small> / {s.total}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your first session awaits"
              text="Start a capture to create your first lecture attendance record."
            />
          )}
        </section>
        <section className="card activity-card">
          <SectionTitle title="Around your classroom" />
          <div className="activity-list">
            {activity.slice(0, 3).map((a, i) => (
              <div className="activity-row" key={a.id}>
                <span className={`activity-icon activity-icon-${i}`}>
                  {i === 0 ? (
                    <Check size={15} />
                  ) : i === 1 ? (
                    <CalendarCheck size={15} />
                  ) : (
                    <ArrowDownRight size={15} />
                  )}
                </span>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.detail}</p>
                  <small>
                    {new Date(a.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <button
            className="activity-footer"
            onClick={() => navigate("leaves")}
          >
            Keep things moving
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <div className="workspace-footer">
        <span>
          <span className="status-dot" /> A thoughtfully connected classroom.
        </span>
        <span>
          Designed & developed by <strong>Harshad Madhav Dhuppe</strong>
        </span>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  unit,
  meta,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  meta: string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="stat-meta">
        {meta}
        {onClick && <ArrowUpRight size={13} />}
      </div>
    </button>
  );
}
