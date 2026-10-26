import { useState } from "react";
import {
  ArrowRight,
  ScanFace,
  ShieldCheck,
  Users,
  Sparkles,
  LoaderCircle,
} from "lucide-react";
import { Brand, Notice } from "./ui";
import { post, type User, type Role } from "../api";
export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [role, setRole] = useState<Role>("teacher");
  const [email, setEmail] = useState("teacher@classlens.demo");
  const [password, setPassword] = useState("ClassLens@2027");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{ token: string; user: User }>("/auth/login", {
        email,
        password,
      });
      localStorage.setItem("classlens_token", result.token);
      onLogin(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="story-copy">
          <span className="eyebrow">
            <span /> A LITTLE LESS ADMIN. A LOT MORE TEACHING.
          </span>
          <h1>
            Your classroom.
            <br />A clearer <em>picture.</em>
          </h1>
          <p>
            Thoughtful attendance tools that give teachers their time back. One
            classroom, one student, one meaningful moment at a time.
          </p>
          <div className="story-visual">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="visual-center">
              <ScanFace size={54} strokeWidth={1.3} />
            </div>
            <div className="floating-note note-one">
              <span className="note-icon">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong>Every record, accounted for</strong>
                <small>Recognition + teacher review</small>
              </div>
            </div>
            <div className="floating-note note-two">
              <span className="note-icon peach">
                <Users size={20} />
              </span>
              <div>
                <strong>A whole class. One capture.</strong>
                <small>Made for the way you teach</small>
              </div>
            </div>
            <span className="visual-dot dot-one" />
            <span className="visual-dot dot-two" />
          </div>
        </div>
        <div className="story-footer">
          BUILT WITH PURPOSE <span>•</span> DESIGNED AROUND PEOPLE
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-top">
          <span>YOUR CLASSROOM WORKSPACE</span>
          <span className="demo-chip">
            <Sparkles size={12} /> Interactive demo
          </span>
        </div>
        <div className="login-form-wrap">
          <span className="eyebrow orange">LET’S MAKE TODAY COUNT</span>
          <h2>Welcome to ClassLens.</h2>
          <p className="login-subtitle">
            A calmer way to manage your classroom.
          </p>
          <div className="role-switch">
            {(["teacher", "student", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                className={role === r ? "active" : ""}
                onClick={() => {
                  setRole(r);
                  setEmail(`${r}@classlens.demo`);
                  setPassword("ClassLens@2027");
                  setError("");
                }}
              >
                {r === "teacher"
                  ? "Teacher"
                  : r === "student"
                    ? "Student"
                    : "Admin"}
              </button>
            ))}
          </div>
          <form onSubmit={login}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            {error && <Notice error>{error}</Notice>}
            <button className="button primary login-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  Enter workspace
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="demo-explanation">
            <ShieldCheck size={18} />
            <p>
              <strong>A safe space to explore.</strong> These accounts contain
              fictional students and sample attendance. No real biometric data
              is included.
            </p>
          </div>
        </div>
        <footer className="creator-credit">
          <span className="credit-line" />
          <p>
            MADE BY <strong>HARSHAD MADHAV DHUPPE</strong>
            <br />
            <span>Electronics & Computer Engineering · Batch of 2027</span>
          </p>
        </footer>
      </section>
    </main>
  );
}
