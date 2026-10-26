# Initial validation

The following checks were executed in the development environment. They establish implementation behaviour, not an institutional deployment or a recognition accuracy claim.

## Application checks

- TypeScript compilation and Vite production build succeeded.
- All 22 backend tests passed against temporary SQLite databases, covering signed authentication, role boundaries, registration, scoped analytics, duplicate attendance prevention, audit reasons, session locks, persistence, leave overlaps, leave decisions, and information responses.
- Four Chromium browser workflows passed: desktop/mobile navigation with no runtime errors or horizontal overflow at 390px, student leave application and class teacher approval, manual attendance correction with refresh recovery and finalization, and administrator teacher creation and assignment.
- A multi-stage Docker image built successfully using the cloud proxy’s trusted CA. The non-root container served the compiled frontend, connected to its database, authenticated a teacher, and verified the read-only mounted models. The temporary validation container was removed.
- Desktop and mobile screenshots in `docs/screenshots/` show the actual interface and fictional seeded records.

## Vision checks

- Official YuNet and SFace binaries downloaded with TLS and passed pinned SHA-256 and size checks.
- An official OpenCV sample, held outside the repository, produced one face and a 128 dimensional embedding; a blank image produced no faces.
- A tiled sample produced two detections. Temporary database enrollment and group capture created one attendance record for the repeated identity, with its duplicate held for review.
- Repeating the photo did not create duplicate attendance. A separate live session required three observations before marking present.
- Deleting the enrollment removed the temporary template. No test biometric data was inserted into the development workspace or committed to Git.

The same source sample was used to verify the recognition mechanism. This is **not** an independent identity evaluation. False match rate, missed students, classroom coverage, distance, lighting robustness, and liveness protection remain unmeasured.

## Scope limits

- SQLite and in-process worker threads support the local prototype; there is no distributed queue or offline synchronization.
- A complete institutional holiday calendar and adjustable attendance policy are future work.
- A physical phone camera cannot be exercised by headless browser tests; test camera permissions and rear camera selection on an HTTPS deployment with consented participants before a pilot.
- Public demo credentials are intentional. This version requires production hardening before external use.
- Configuration draft saving does not publish an environment, and local checks do not establish that GitHub Actions has run successfully.
