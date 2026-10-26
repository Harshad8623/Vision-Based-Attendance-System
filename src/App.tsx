import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  ScanLine,
  ClipboardCheck,
  Users,
  ChartNoAxesCombined,
  CalendarDays,
  Settings2,
  LogOut,
  ChevronDown,
  ArrowUpRight,
  Menu,
  X,
  Check,
  CircleAlert,
  Bell,
  Command,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  api,
  type User,
  type Subject,
  type Student,
  type Session,
  type Leave,
  type Activity,
} from "./api";
import { Brand, Avatar, Loading, Modal, Empty } from "./components/ui";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Capture from "./components/Capture";
import {
  AttendancePage,
  StudentsPage,
  LeavesPage,
  AnalyticsPage,
  SettingsPage,
} from "./components/Pages";
const navigation = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "capture", label: "Take attendance", icon: ScanLine },
  { id: "attendance", label: "Attendance log", icon: ClipboardCheck },
  { id: "students", label: "Students", icon: Users },
  { id: "analytics", label: "Insights & streaks", icon: ChartNoAxesCombined },
  { id: "leaves", label: "Leave requests", icon: CalendarDays },
];
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState(true),
    [loading, setLoading] = useState(false),
    [page, setPage] = useState("dashboard"),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [notifications, setNotifications] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]),
    [students, setStudents] = useState<Student[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [leaves, setLeaves] = useState<Leave[]>([]),
    [activity, setActivity] = useState<Activity[]>([]);
  const toast = useCallback(
    (message: string, error = false) => setNotice({ message, error }),
    [],
  );
  const load = useCallback(async () => {
    setError("");
    try {
      const [su, st, se, le, ac] = await Promise.all([
        api<Subject[]>("/subjects"),
        api<Student[]>("/students"),
        api<Session[]>("/sessions"),
        api<Leave[]>("/leaves"),
        api<Activity[]>("/activity"),
      ]);
      setSubjects(su);
      setStudents(st);
      setSessions(se);
      setLeaves(le);
      setActivity(ac);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (localStorage.getItem("classlens_token"))
      api<User>("/auth/me")
        .then(setUser)
        .catch(() => localStorage.removeItem("classlens_token"))
        .finally(() => setBoot(false));
    else setBoot(false);
  }, []);
  useEffect(() => {
    if (user) {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }
  }, [user, load]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function navigate(id: string) {
    setPage(id);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function logout() {
    localStorage.removeItem("classlens_token");
    setUser(null);
    setPage("dashboard");
    setMobile(false);
  }
  if (boot) return <Loading />;
  if (!user) return <Login onLogin={setUser} />;
  const pending = leaves.filter((l) => l.status === "pending").length;
  const current =
    navigation.find((n) => n.id === page)?.label || "Settings & people";
  const shared = { user, onRefresh: () => void load(), toast };
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-close icon-button"
            aria-label="Close menu"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-picker">
          <span className="workspace-icon">EC</span>
          <div>
            <strong>ECE Workspace</strong>
            <span>Academic year 2026–27</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navigation
            .filter(
              (n) =>
                user.role !== "student" ||
                !["capture", "students"].includes(n.id),
            )
            .map((n) => (
              <button
                key={n.id}
                aria-label={n.label}
                className={`nav-link ${page === n.id ? "active" : ""}`}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} strokeWidth={1.7} />
                <span>{n.label}</span>
                {n.id === "leaves" && pending > 0 && (
                  <span className="nav-count">{pending}</span>
                )}
                {n.id === "capture" && <span className="nav-new">LIVE</span>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <Sparkles size={18} />
            </span>
            <strong>Built for real classrooms.</strong>
            <p>
              Less busywork.
              <br />
              More meaningful moments.
            </p>
            <button onClick={() => navigate("settings")}>
              Meet ClassLens
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-link ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            <span>Settings & people</span>
          </button>
          <div className="sidebar-user">
            <Avatar name={user.name} small />
            <div>
              <strong>{user.name.replace("Prof. ", "")}</strong>
              <span>
                {user.role === "teacher"
                  ? "Teacher workspace"
                  : `${user.role[0].toUpperCase() + user.role.slice(1)} workspace`}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">
              <span />
              Sample data
            </span>
            <button
              className="icon-button refresh-button"
              title="Refresh workspace"
              aria-label="Refresh workspace"
              onClick={() => {
                void load();
                toast("Workspace refreshed.");
              }}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="notification-button icon-button"
              aria-label="Open activity notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={18} />
              {activity.length > 0 && <i />}
            </button>
            <span className="topbar-divider" />
            <Avatar name={user.name} small />
          </div>
        </header>
        <div className="content">
          {error ? (
            <div className="error-panel">
              <CircleAlert size={26} />
              <h2>We couldn’t load your workspace.</h2>
              <p>{error}</p>
              <div className="inline-actions">
                <button className="button primary" onClick={() => void load()}>
                  Try again
                </button>
                <button className="button secondary" onClick={logout}>
                  Sign in again
                </button>
              </div>
            </div>
          ) : loading ? (
            <Loading />
          ) : page === "dashboard" ? (
            <Dashboard
              user={user}
              subjects={subjects}
              students={students}
              sessions={sessions}
              leaves={leaves}
              activity={activity}
              navigate={navigate}
            />
          ) : page === "capture" ? (
            <Capture
              subjects={subjects}
              onRefresh={() => void load()}
              toast={toast}
            />
          ) : page === "attendance" ? (
            <AttendancePage {...shared} sessions={sessions} />
          ) : page === "students" ? (
            <StudentsPage {...shared} students={students} />
          ) : page === "leaves" ? (
            <LeavesPage {...shared} leaves={leaves} />
          ) : page === "analytics" ? (
            <AnalyticsPage
              user={user}
              subjects={subjects}
              students={students}
              sessions={sessions}
            />
          ) : (
            <SettingsPage {...shared} subjects={subjects} />
          )}
        </div>
        <footer className="global-credit">
          A project by <strong>Harshad Madhav Dhuppe</strong>
          <span>Electronics & Computer Engineering · Batch of 2027</span>
        </footer>
      </div>
      {notice && (
        <div
          role="status"
          className={`toast ${notice.error ? "toast-error" : ""}`}
        >
          {notice.error ? <CircleAlert size={19} /> : <Check size={19} />}
          <span>{notice.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {notifications && (
        <Modal
          title="Your classroom activity"
          subtitle="Updates you can trace back to real actions."
          onClose={() => setNotifications(false)}
        >
          {activity.length ? (
            <div className="notification-list">
              {activity.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    navigate(
                      a.kind === "leave"
                        ? "leaves"
                        : a.kind === "enrollment"
                          ? "students"
                          : "attendance",
                    );
                    setNotifications(false);
                  }}
                >
                  <span className="small-icon sage">
                    <Command size={16} />
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.detail}</p>
                    <small>
                      {new Date(a.created_at).toLocaleString("en-IN")}
                    </small>
                  </div>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="You’re all caught up"
              text="New activity will appear here."
            />
          )}
        </Modal>
      )}
    </div>
  );
}
