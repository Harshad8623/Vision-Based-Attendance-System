export type Role = "teacher" | "student" | "admin";
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  initials: string;
}
export interface Subject {
  id: number;
  name: string;
  code: string;
  teacher_id: number;
  teacher_name: string;
  section: string;
  room: string;
  attendance: number;
  total_sessions: number;
  schedule: string;
  color: string;
}
export interface Student {
  id: number;
  name: string;
  roll_number: string;
  section: string;
  email: string;
  attendance: number;
  streak: number;
  enrolled: boolean;
  initials: string;
}
export interface Session {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  title: string;
  started_at: string;
  status: string;
  present: number;
  total: number;
}
export interface Attendance {
  id: number;
  student_id: number;
  student_name: string;
  roll_number: string;
  subject_name: string;
  session_id: number;
  date: string;
  status: string;
  source: string;
}
export interface Leave {
  id: number;
  student_id: number;
  student_name: string;
  roll_number: string;
  start_date: string;
  end_date: string;
  category: string;
  reason: string;
  status: string;
  comment: string;
  created_at: string;
}
export interface Activity {
  id: number;
  title: string;
  detail: string;
  created_at: string;
  kind: string;
}
export interface Teacher {
  id: number;
  name: string;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem("classlens_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Request failed (${response.status}). Please check your input and try again.`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
