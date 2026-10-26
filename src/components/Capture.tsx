import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  FileImage,
  Focus,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  ScanFace,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  api,
  post,
  patch,
  type Subject,
  type Session,
  type Attendance,
  type Student,
} from "../api";
import { Avatar, Empty, Modal, Notice, Pill, SectionTitle } from "./ui";
import "./capture.css";

type FaceResult = {
  box: number[];
  status: string;
  student_id?: number;
  name?: string;
  reason?: string;
  quality_reason?: string;
  confirmation_frames?: number;
};
type CaptureResult = {
  faces: FaceResult[];
  detected: number;
  newly_marked: number[];
  mode: string;
  message?: string;
};
type VisionStatus = {
  available?: boolean;
  ready?: boolean;
  models_available?: boolean;
  message?: string;
};
const statuses = ["present", "absent", "late", "excused"];
export default function Capture({
  subjects,
  onRefresh,
  toast,
}: {
  subjects: Subject[];
  onRefresh: () => void;
  toast: (message: string, error?: boolean) => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || 0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [rawRows, setRows] = useState<Attendance[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [mode, setMode] = useState<"live" | "photo">("live");
  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vision, setVision] = useState<VisionStatus | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [photo, setPhoto] = useState<string>("");
  const [photoSize, setPhotoSize] = useState({ width: 1, height: 1 });
  const [edit, setEdit] = useState<Attendance | null>(null);
  const [editStatus, setEditStatus] = useState("present");
  const [reason, setReason] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const current = sessions.find((s) => s.id === sessionId);
  const subject = subjects.find(
    (s) => s.id === (current?.subject_id || subjectId),
  );
  const rows: Attendance[] = !sessionId
    ? []
    : students
        .filter((s) => s.section === subject?.section)
        .map(
          (s) =>
            rawRows.find((r) => r.student_id === s.id) || {
              id: -s.id,
              student_id: s.id,
              student_name: s.name,
              roll_number: s.roll_number,
              subject_name: subject?.name || "",
              session_id: sessionId || 0,
              date: current?.started_at || "",
              status: "unmarked",
              source: "",
            },
        );
  const active = current?.status === "active";
  const present = rows.filter((r) =>
    ["present", "late"].includes(r.status),
  ).length;
  const modelReady = Boolean(
    vision && (vision.available || vision.ready || vision.models_available),
  );

  const refreshRows = useCallback(async (id: number) => {
    const records = await api<Attendance[]>(`/attendance?session_id=${id}`);
    if (mountedRef.current) setRows(records);
  }, []);
  const loadSessions = useCallback(async () => {
    const data = await api<Session[]>("/sessions");
    if (mountedRef.current) setSessions(data);
    return data;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    loadSessions()
      .then((data) => {
        const saved = Number(localStorage.getItem("classlens_capture_session"));
        if (data.some((s) => s.id === saved)) {
          setSessionId(saved);
          const previous = data.find((s) => s.id === saved);
          if (previous) setSubjectId(previous.subject_id);
        }
      })
      .catch((e) => setError(e.message));
    api<VisionStatus>("/vision/status")
      .then(setVision)
      .catch(() => setVision(null));
    api<Student[]>("/students")
      .then(setStudents)
      .catch((e) => setError(e.message));
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [loadSessions]);
  useEffect(() => {
    if (!subjectId && subjects[0]) setSubjectId(subjects[0].id);
  }, [subjectId, subjects]);
  useEffect(() => {
    if (sessionId) refreshRows(sessionId).catch((e) => setError(e.message));
    else setRows([]);
  }, [sessionId, refreshRows]);
  useEffect(() => {
    if (cameraOn && videoRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [cameraOn]);
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo);
    };
  }, [photo]);

  function stopCamera() {
    setScanning(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }
  async function openCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access requires HTTPS or localhost. You can also upload a classroom photo.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);
      setPhoto("");
      setResult(null);
    } catch (e) {
      setError(
        (e as DOMException).name === "NotAllowedError"
          ? "Camera permission was declined. Allow camera access in your browser settings, or upload a photo."
          : "Could not open the camera. Check that it is connected and is not being used by another app.",
      );
    }
  }
  async function startSession() {
    if (!subjectId) return;
    setBusy(true);
    setError("");
    try {
      const created = await post<Session>("/sessions", {
        subject_id: subjectId,
      });
      await loadSessions();
      setSessionId(created.id);
      localStorage.setItem("classlens_capture_session", String(created.id));
      setResult(null);
      onRefresh();
      toast(
        "Attendance session started. Capture students or update the roster.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sendImage = useCallback(
    async (blob: Blob, live: boolean) => {
      if (!sessionId || inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(true);
      setError("");
      try {
        const form = new FormData();
        form.append("image", blob, "classroom.jpg");
        const output = await api<CaptureResult>(
          `/sessions/${sessionId}/capture?mode=${live ? "live" : "photo"}`,
          { method: "POST", body: form },
        );
        if (!mountedRef.current) return;
        setResult(output);
        await refreshRows(sessionId);
        if (!live) {
          toast(
            output.message ||
              `${output.detected} face${output.detected === 1 ? "" : "s"} detected. Review the results below.`,
          );
          onRefresh();
        }
      } catch (e) {
        if (mountedRef.current) {
          setError((e as Error).message);
          setScanning(false);
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    },
    [sessionId, refreshRows, toast, onRefresh],
  );
  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || inFlightRef.current) return;
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1920 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhotoSize({ width: canvas.width, height: canvas.height });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (blob) {
      if (mode === "photo") {
        setPhoto(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
      }
      await sendImage(blob, mode === "live");
    }
  }, [mode, sendImage]);
  useEffect(() => {
    if (!scanning || !cameraOn || !active) return;
    const interval = window.setInterval(() => {
      void captureFrame();
    }, 2400);
    return () => window.clearInterval(interval);
  }, [scanning, cameraOn, active, captureFrame]);
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Please select a JPEG or PNG photo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Please select an image smaller than 10 MB.");
      return;
    }
    stopCamera();
    setResult(null);
    const url = URL.createObjectURL(file);
    setPhoto(url);
    const image = new Image();
    image.onload = () => {
      if (mountedRef.current)
        setPhotoSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
    };
    image.src = url;
    await sendImage(file, false);
    if (uploadRef.current) uploadRef.current.value = "";
  }
  async function saveCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!edit || !reason.trim()) return;
    setBusy(true);
    try {
      if (edit.id < 0)
        await post(`/sessions/${sessionId}/attendance`, {
          student_id: edit.student_id,
          status: editStatus,
          reason,
        });
      else
        await patch(`/attendance/${edit.id}`, { status: editStatus, reason });
      await refreshRows(sessionId!);
      onRefresh();
      setEdit(null);
      toast(
        "Attendance updated. The correction is saved in the audit history.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function finishSession() {
    if (!sessionId || inFlightRef.current) return;
    setFinishing(true);
    try {
      await post(`/sessions/${sessionId}/finish`, {});
      stopCamera();
      await loadSessions();
      await refreshRows(sessionId);
      setConfirmFinish(false);
      onRefresh();
      toast(
        "Session completed and locked. Approved leave has been applied to unmarked students.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setFinishing(false);
    }
  }
  function switchSession(id: number | null) {
    stopCamera();
    setSessionId(id);
    if (id) {
      localStorage.setItem("classlens_capture_session", String(id));
      const selected = sessions.find((s) => s.id === id);
      if (selected) setSubjectId(selected.subject_id);
    } else localStorage.removeItem("classlens_capture_session");
    setResult(null);
    setPhoto("");
    setError("");
  }

  return (
    <div className="capture-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow orange">A LITTLE LESS ROLL CALL</span>
          <h1>
            Attendance studio<span className="heading-dot">.</span>
          </h1>
          <p>Point. Capture. Review. Give your classroom its time back.</p>
        </div>
        <Pill tone="green">
          <ShieldCheck size={13} /> Teacher verified
        </Pill>
      </div>
      <div className="capture-session-bar card">
        <div className="capture-session-field">
          <label htmlFor="capture-subject">SUBJECT & CLASS</label>
          <div className="capture-select">
            <select
              id="capture-subject"
              value={subjectId}
              disabled={Boolean(sessionId)}
              onChange={(e) => setSubjectId(Number(e.target.value))}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.section}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
        </div>
        <div className="capture-session-meta">
          <span>{subject?.code || "—"}</span>
          <small>{subject?.room || "Your classroom"}</small>
        </div>
        <div className="capture-session-field session-picker">
          <label htmlFor="capture-session">SESSION</label>
          <select
            id="capture-session"
            value={sessionId ?? ""}
            disabled={busy || scanning}
            onChange={(e) =>
              switchSession(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Create a new session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject_code} ·{" "}
                {new Date(s.started_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {s.status}
              </option>
            ))}
          </select>
        </div>
        {!sessionId ? (
          <button
            className="button primary"
            disabled={!subjectId || busy}
            onClick={startSession}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Play size={16} />
            )}
            Start session
          </button>
        ) : active ? (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setScanning(false);
              setConfirmFinish(true);
            }}
          >
            <CheckCheck size={16} />
            Finish session
          </button>
        ) : (
          <Pill tone="green">Completed session</Pill>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="capture-layout">
        <section className="card capture-main">
          <div className="capture-toolbar">
            <div className="capture-mode-switch">
              <button
                className={mode === "live" ? "active" : ""}
                onClick={() => {
                  setMode("live");
                  setScanning(false);
                  setResult(null);
                }}
              >
                <Camera size={16} />
                Live scan
              </button>
              <button
                className={mode === "photo" ? "active" : ""}
                onClick={() => {
                  setMode("photo");
                  setScanning(false);
                  setResult(null);
                }}
              >
                <FileImage size={16} />
                Group photo
              </button>
            </div>
            <span className="capture-processing">
              {busy ? (
                <>
                  <LoaderCircle size={13} className="spin" />
                  Processing
                </>
              ) : scanning ? (
                <>
                  <span className="live-dot" />
                  Scanning
                </>
              ) : cameraOn ? (
                "Camera ready"
              ) : (
                "Ready when you are"
              )}
            </span>
          </div>
          <div
            className={`camera-stage ${cameraOn || photo ? "has-media" : ""}`}
            style={
              cameraOn || photo
                ? { aspectRatio: `${photoSize.width} / ${photoSize.height}` }
                : undefined
            }
          >
            {cameraOn && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setPhotoSize({
                      width: videoRef.current.videoWidth,
                      height: videoRef.current.videoHeight,
                    });
                  }
                }}
              />
            )}
            {photo && (
              <img
                src={photo}
                alt="Classroom capture submitted for recognition"
              />
            )}
            {!cameraOn && !photo && (
              <div className="camera-placeholder">
                <div className="camera-reticle">
                  <Focus size={68} strokeWidth={1} />
                  <ScanFace size={30} strokeWidth={1.4} />
                </div>
                <h3>
                  {sessionId
                    ? "Your classroom, in focus."
                    : "Every student counts."}
                </h3>
                <p>
                  {sessionId
                    ? "Open your rear camera or upload a group photo. Clear, visible faces work best."
                    : "Choose a subject and start a session to capture attendance."}
                </p>
                <div className="capture-device-label">
                  <Camera size={14} /> Phone, tablet, or laptop
                </div>
              </div>
            )}
            {photo && result && (
              <div className="capture-face-overlay">
                {result.faces?.map((face, i) => (
                  <div
                    key={i}
                    className={`capture-face-box ${face.status === "confirmed" ? "confirmed" : face.status === "unknown" ? "unknown" : "review"}`}
                    style={{
                      left: `${(face.box[0] / photoSize.width) * 100}%`,
                      top: `${(face.box[1] / photoSize.height) * 100}%`,
                      width: `${(face.box[2] / photoSize.width) * 100}%`,
                      height: `${(face.box[3] / photoSize.height) * 100}%`,
                    }}
                  >
                    <span>
                      {face.name ||
                        (face.status === "review" ? "Review" : "Unknown")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {cameraOn && (
              <div className="camera-live-label">
                <span className="live-dot" />
                {scanning ? "LIVE SCANNING" : "CAMERA PREVIEW"}
              </div>
            )}
            {cameraOn && (
              <button
                className="camera-close"
                aria-label="Turn off camera"
                onClick={stopCamera}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <div className="capture-actions">
            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            {!cameraOn ? (
              <button
                className="button primary"
                disabled={!active}
                onClick={openCamera}
              >
                <Camera size={17} />
                Open camera
              </button>
            ) : mode === "live" ? (
              <button
                className="button primary"
                disabled={!active || !modelReady}
                onClick={() => setScanning(!scanning)}
              >
                {scanning ? <Pause size={17} /> : <Play size={17} />}{" "}
                {scanning ? "Pause scan" : "Start scanning"}
              </button>
            ) : (
              <button
                className="button primary"
                disabled={!active || busy || !modelReady}
                onClick={() => void captureFrame()}
              >
                <Camera size={17} />
                Capture photo
              </button>
            )}
            <button
              className="button secondary"
              disabled={!active || busy || !modelReady}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload size={16} />
              Upload photo
            </button>
            {cameraOn && (
              <button
                className="icon-button"
                aria-label="Stop camera"
                onClick={stopCamera}
              >
                <CameraOff size={18} />
              </button>
            )}
          </div>
          <div className="capture-guidance">
            <ShieldCheck size={17} />
            <p>
              Only enrolled students from this class can be matched. Live
              results refer to the latest processed frame; uncertain faces stay
              unmarked for review.
            </p>
          </div>
        </section>
        <aside className="capture-sidebar">
          <section className="card capture-progress">
            <span className="eyebrow">SESSION COVERAGE</span>
            <div className="capture-count">
              <strong>{present}</strong>
              <span>
                / {rows.length}
                <small>students present</small>
              </span>
            </div>
            <div className="capture-progress-track">
              <span
                style={{
                  width: rows.length
                    ? `${(present / rows.length) * 100}%`
                    : "0%",
                }}
              />
            </div>
            <div className="capture-count-footer">
              <span>
                <i />
                {present} present / late
              </span>
              <span>
                {rows.filter((r) => r.status === "unmarked").length} unmarked
              </span>
            </div>
          </section>
          <section className="card capture-tips">
            <span className="capture-tip-icon">
              <Focus size={22} />
            </span>
            <h3>
              A better capture.
              <br />A clearer result.
            </h3>
            <ul>
              <li>Move closer so each face is clearly visible.</li>
              <li>Use even lighting. Avoid bright windows behind students.</li>
              <li>Hold steady and scan small groups at a time.</li>
              <li>Review missed students before finishing.</li>
            </ul>
          </section>
          <section
            className={`capture-model-status ${modelReady ? "ready" : ""}`}
          >
            <span>
              {modelReady ? <CircleCheck size={17} /> : <ScanFace size={17} />}
            </span>
            <div>
              <strong>
                {modelReady
                  ? "Recognition models ready"
                  : "Recognition setup required"}
              </strong>
              <p>
                {modelReady
                  ? "Enroll consented face samples from the Students page before scanning."
                  : "Download the verified face models and enroll students. Manual attendance works independently."}
              </p>
            </div>
          </section>
        </aside>
      </div>
      {result && (
        <section className="card capture-results">
          <SectionTitle
            title="Capture results"
            subtitle={`${result.detected} face${result.detected === 1 ? "" : "s"} detected · ${result.newly_marked.length} newly marked present`}
          />
          {result.faces?.length ? (
            <div className="capture-result-list">
              {result.faces.map((face, i) => (
                <div key={i}>
                  <span
                    className={`capture-result-icon ${face.status === "confirmed" ? "good" : ""}`}
                  >
                    {face.status === "confirmed" ? (
                      <CircleCheck size={17} />
                    ) : (
                      <ScanFace size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{face.name || `Face ${i + 1}`}</strong>
                    <small>
                      {face.reason ||
                        face.quality_reason ||
                        (face.status === "confirmed"
                          ? "Attendance confirmed. Check the roster below."
                          : face.status === "confirming"
                            ? "Keep the face visible for consistent recognition."
                            : "No reliable match. Recapture or verify manually.")}
                    </small>
                  </div>
                  <Pill tone={face.status === "confirmed" ? "green" : "orange"}>
                    {face.status === "confirmed"
                      ? "Confirmed"
                      : face.status === "unknown"
                        ? "Unknown"
                        : face.status === "confirming"
                          ? `Confirming ${face.confirmation_frames || 1}/3`
                          : "Review"}
                  </Pill>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No faces detected"
              text="Try another photo with larger, well lit faces."
              icon={<ImagePlus size={25} />}
            />
          )}
        </section>
      )}
      <section className="card">
        <SectionTitle
          title="Class roster"
          subtitle={
            sessionId
              ? "Review attendance and resolve any missed students."
              : "The roster appears when you start or select a session."
          }
        />
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll number</th>
                  <th>Status</th>
                  <th>Recorded by</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td>
                      <div className="capture-student-cell">
                        <Avatar name={row.student_name} index={i} small />
                        <strong>{row.student_name}</strong>
                      </div>
                    </td>
                    <td className="muted">{row.roll_number}</td>
                    <td>
                      <Pill
                        tone={
                          ["present", "late"].includes(row.status)
                            ? "green"
                            : row.status === "absent"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {row.status}
                      </Pill>
                    </td>
                    <td className="muted">{row.source || "—"}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEdit(row);
                          setEditStatus(
                            row.status === "unmarked" ? "present" : row.status,
                          );
                          setReason("");
                        }}
                        disabled={!active}
                      >
                        {active ? "Edit attendance" : "Locked"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your roster will appear here"
            text="Start a lecture session to view students and manage their attendance."
            icon={<Users size={28} />}
          />
        )}
      </section>
      {edit && (
        <Modal
          title="Edit attendance"
          subtitle={`${edit.student_name} · ${edit.roll_number}`}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={saveCorrection}>
            <label>
              Attendance status
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason for this change
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the correction for the audit history"
                required
                minLength={5}
                maxLength={500}
              />
            </label>
            <p className="muted capture-edit-note">
              Your name, the previous status, and this reason are recorded in
              the change history.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || reason.trim().length < 5}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <CheckCheck size={16} />
                )}
                Save correction
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmFinish && (
        <Modal
          title="Finish this session?"
          subtitle="Review the roster before completing attendance."
          onClose={() => setConfirmFinish(false)}
        >
          <p className="capture-finish-copy">
            You have recorded{" "}
            <strong>
              {present} of {rows.length}
            </strong>{" "}
            students as present or late. Remaining unmarked students will be
            marked absent, or excused when approved leave applies. The session
            will lock; an administrator must reopen it for corrections.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirmFinish(false)}
            >
              Keep reviewing
            </button>
            <button
              className="button primary"
              disabled={finishing}
              onClick={finishSession}
            >
              {finishing ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <CheckCheck size={16} />
              )}
              Finish session
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
