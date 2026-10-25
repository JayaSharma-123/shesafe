# SheSafe: Women & Child Safety App

Hands-free SOS with live video to the nearest police station, repeating alerts until someone answers,
and tamper-resistant evidence. Built for the Seva Innovation Challenge 2026.

Team: Jaya Sharma, Anjali Agrawal (B.Tech AIML)

> This is a **working web prototype**. Read "Known limits" before presenting it.

---

## 1. What it does

A person in danger asks for help without making a phone call. The app starts GPS, camera and
microphone, alerts the nearest on-duty police station and her trusted contacts, streams live video,
and saves the recording in an evidence vault that records every view.

### Two alert levels

| Level | Starts when | What happens |
|---|---|---|
| **Normal** (location only) | The user taps **No** (home screen, check-in, or PIN prompt) | Only GPS is shared. The station sees her in the **Normal** list with a live map. No siren, no video, no SMS |
| **Urgent** (full SOS) | **SOS** button, "I'm unsafe", **no reply in 30 s**, 3 wrong PINs, missed Safety Journey check-in, or the voice keyword (after its 5 s warning) | Station siren (max 3 beeps), live video, recording, SMS, trusted-contact alerts, escalation after 45 s |

### Feature list

**Accounts**
- Sign up with a real Indian mobile number verified by a **6-digit OTP** (valid 5 min, 5 tries, 30 s between sends, 5 sends per hour)
- Fake-looking numbers (such as 9000000001 or 9999999999) are rejected
- Login as **User** or as **Station** (a wrong choice is refused with a clear message)
- Forgot password with OTP (the safety PIN is not changed)
- Station sign-up needs a secret **invite code**
- JWT sessions, bcrypt-hashed passwords and PINs

**User**
- Big SOS button, "Are you safe?" Yes/No, PIN confirmation with a countdown
- **Safety Journey**: check-ins every 5/10/15 min (1 min for demos). "Yes + PIN" means safe right now and the trip continues. Ending the trip is a separate PIN box
- No reply to a check-in in 30 s starts an SOS
- Trusted contacts (up to 5), profile, change PIN and password
- **Voice keyword** (secret phrase, stored only as a hash) with a 5 s warning and PIN cancel
- **Voice recognition**: learns your voice from 3 samples and can ignore the keyword spoken by someone else
- Logout needs the PIN
- Consent screen before any recording

**Police station**
- Live dashboard: **Urgent** and **Normal** sections, plus past incidents
- Siren (max 3 beeps, 10 s apart) that stops when you press **Received**
- Live map (OpenStreetMap), live WebRTC video, status buttons: Received, On the way, Resolved
- Evidence player, **Verify chain** button, "who viewed the evidence" log
- Search, filters, sorting, statistics
- Urgent flags for 3 wrong PINs and a stream that stops suddenly

**Trusted contacts** (a contact who has an account and is logged in)
- A red alert card with a siren (max 3 beeps), call button, Google Maps link and a live map

**Evidence vault**
- 5-second clips uploaded as recorded
- Each file is written once, set read-only, and hash-chained: `sha256(previousHash + bytes)`
- Changing any old file breaks every later hash and **Verify chain** reports it
- Every view is logged. Exiting an SOS never deletes evidence

**General**
- Dark/light mode, toasts, notification centre, loading skeletons, empty and error states, responsive layout
- Runs on CPU only

---

## 2. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Fast to build, hot reload, consistent styling |
| Backend | Node.js + Express | Simple REST API |
| Realtime | Socket.IO | Live alerts and WebRTC signalling |
| Live video | WebRTC (peer to peer, Google STUN) | No media server and no GPU needed |
| Database | SQLite (better-sqlite3) | One file, no install, light on disk |
| Maps | Leaflet + OpenStreetMap | Free, no API key |
| SMS | Fast2SMS or Twilio (or console) | Indian and global options |
| Voice keyword | Browser SpeechRecognition | Works without extra software |
| Voice recognition | Transformers.js, model `Xenova/wavlm-base-plus-sv` | Runs in the browser on the CPU (WebAssembly) |

---

## 3. Folder structure

```
shesafe/
├── README.md
├── server/
│   ├── package.json
│   ├── .env                 your settings (never commit)
│   ├── .env.example
│   ├── server.js            API routes, escalation, evidence vault, sockets, WebRTC signalling
│   ├── auth.js              signup, login, OTP, forgot password, JWT
│   ├── db.js                SQLite tables and seed data
│   ├── geo.js               Haversine distance and nearest-station ranking
│   ├── phone.js             rules for accepting a mobile number
│   ├── sms.js               Fast2SMS / Twilio / console sender
│   ├── sms-test.js          sends one test SMS
│   ├── smoke.js             automated end-to-end test
│   ├── vault/               evidence clips (created automatically)
│   └── shesafe.db           database (created automatically)
└── client/
    ├── package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html
    └── src/
        ├── main.jsx, App.jsx, index.css
        ├── lib/        api.js  socket.js  phone.js  mic.js  voiceprint.js
        ├── context/    AuthContext.jsx  ThemeContext.jsx  ToastContext.jsx
        ├── hooks/      useSos.js  useJourney.js  useKeyword.js  useBeep.js
        ├── components/ Navbar  LogoutButton  NotificationCenter  ProtectedRoute  Field
        │               SosButton  ExitModal  SafePinModal  CheckInModal  EndTripModal
        │               WatchPrompt  JourneyCard  VoiceKeywordCard  ContactAlerts
        │               MapView  LiveVideo  IncidentPanel
        └── pages/      Login  Signup  ForgotPassword  UserHome  Contacts  Profile  StationDashboard
```

Which file shows what: `index.html` loads `main.jsx`, which loads `App.jsx` (the router), which shows the
screens in `pages/`. Emergency logic lives in `hooks/useSos.js`. Every server call goes through `lib/api.js`.

---

## 4. Setup (Windows, VS Code)

### Requirements
- **Node.js 22 LTS** (check with `node -v`). Very new Node versions can crash native packages
- Chrome or Edge
- A mobile number for the station account

### Server
```
cd server
npm install
copy .env.example .env
```
Edit `.env` (see section 5), then:
```
npm start
```
It prints `SheSafe API on http://localhost:4000`. Leave it running.

### Client (a second terminal)
```
cd client
npm install
npm run dev
```
Open **http://localhost:5173** in Chrome. Use `localhost`: browsers allow camera, microphone and
location only on `localhost` or HTTPS.

### First run
1. Sign in as the station: tab **Login as Station**, using `STATION_PHONE` and `STATION_PASSWORD`
2. Click **Enable alert sound** on the dashboard
3. In an **incognito** window, create a user account (OTP appears on screen in demo mode)
4. Allow location, camera and microphone, then try the SOS

### Reset all data
Stop the server, then delete `server/shesafe.db*` and `server/vault`, and start again.
(PowerShell: `Remove-Item shesafe.db*, vault -Recurse -Force -ErrorAction SilentlyContinue`)

---

## 5. Configuration: `server/.env`

```
PORT=4000
JWT_SECRET=a-long-random-string
CLIENT_ORIGIN=http://localhost:5173
ESCALATE_AFTER_SECONDS=45

# SMS provider: fast2sms | twilio | console
SMS_PROVIDER=console
FAST2SMS_API_KEY=
FAST2SMS_ROUTE=q
TWILIO_SID=
TWILIO_TOKEN=
TWILIO_FROM=

# Your police station account
STATION_NAME=Raipur Demo Police Station
STATION_PHONE=10-digit mobile number
STATION_PASSWORD=choose-a-strong-password
STATION_LAT=21.2514
STATION_LNG=81.6296
CONTACT_PHONE=10-digit number for the demo contact
DEMO_FORCE_PRIMARY=true

# OTP and sign-up
OTP_DEV_ECHO=true
STATION_INVITE_CODE=choose-a-secret-code
SEED_DEMO=false
```

| Setting | Meaning |
|---|---|
| `STATION_*` | Creates station 1 and its login on the first start. Use your real location from Google Maps |
| `DEMO_FORCE_PRIMARY` | `true` sends every SOS to your station first. Set `false` for true nearest-station routing |
| `OTP_DEV_ECHO` | `true` shows the OTP on screen and in the terminal. **Demo only**. Set `false` for real use |
| `SMS_PROVIDER` | `console` prints SMS in the terminal. Use `fast2sms` or `twilio` to send real texts |
| `STATION_INVITE_CODE` | Required to register a new station account |
| `SEED_DEMO` | `true` creates a test user `9000000001` / `Demo@1234` / PIN `1234`. Only for `npm test` |

`STATION_PHONE` must look like a real mobile number, because the login page checks it.
The station's account PIN is `1234` (stations are not asked for it).

**Secrets:** never commit `.env`, and never paste real keys into chat or screenshots. If a key is exposed,
regenerate it. Add `.env`, `node_modules`, `server/vault` and `server/shesafe.db*` to `.gitignore`.

### Real SMS
- **Fast2SMS** needs a wallet recharge (one transaction of 100 INR or more) before its API works. Their
  route and message-template rules may also apply, so check your dashboard
- **Twilio** trial accounts usually only text numbers you have verified, and `TWILIO_FROM` must be the
  number Twilio gave you, not your own
- Test with: `cd server && node sms-test.js`

---

## 6. How it works

### SOS flow
1. User triggers SOS. The browser reads GPS and calls `POST /api/sos/trigger`
2. The server ranks on-duty stations by Haversine distance and picks the nearest
3. Urgent: the station gets a live alert, an SMS goes to the station and trusted contacts, and contacts get a siren card
4. The user's phone starts camera and microphone, records 5-second clips, and uploads each one
5. GPS goes to the server every 4 seconds and appears on the station's map
6. The station opens the incident, WebRTC connects, and live video appears
7. The station presses **Received** (the siren stops), **On the way**, then **Resolved**
8. If nobody acknowledges within `ESCALATE_AFTER_SECONDS`, the next nearest station is alerted
9. The user exits with the PIN and chooses **I'm safe** or **False alarm**. The station confirms before closing

### Live video (WebRTC)
Signalling goes through Socket.IO: the station asks "ready", the user sends an offer, the station answers,
and both exchange ICE candidates. Video then flows directly between the two browsers.

### Evidence integrity
```
hash(clip 1) = sha256("" + bytes1)
hash(clip 2) = sha256(hash(clip 1) + bytes2)
hash(clip 3) = sha256(hash(clip 2) + bytes3)
```
Editing or removing any earlier clip changes every later hash. `GET /api/evidence/verify/:incidentId`
recomputes the whole chain and reports whether it is intact.

### Voice keyword and voice recognition
- The keyword is stored in the browser only as a SHA-256 hash
- One speech session runs while you are logged in, so moving between pages does not restart it
- When the keyword is heard, a 5-second warning appears. The correct PIN cancels it
- With voice recognition on, the last 3 seconds of audio are compared with your stored voiceprint
  (cosine similarity, threshold 0.86). A mismatch is ignored. If the check fails, the warning still appears

---

## 7. API reference

All routes are under `/api`. Routes marked 🔒 need `Authorization: Bearer <token>`.

**Auth**
| Method and path | Purpose |
|---|---|
| `POST /auth/send-otp` | OTP for sign-up |
| `POST /auth/register` | Create a user or station (needs the OTP, and an invite code for stations) |
| `POST /auth/login` | Login, with an optional `role` check |
| `POST /auth/forgot/send-otp` | OTP for password reset (same reply for unknown numbers) |
| `POST /auth/forgot/reset` | Set a new password with the OTP |
| `GET /auth/me` 🔒 | Current user |
| `POST /auth/verify-pin` 🔒 | Check the safety PIN |
| `GET /stations` | Station list (used by station sign-up and the map) |

**SOS**
| Method and path | Purpose |
|---|---|
| `POST /sos/trigger` 🔒 | Start an incident (`level`: `watch` or `urgent`) |
| `POST /sos/:id/upgrade` 🔒 | Normal to Urgent |
| `POST /sos/:id/location` 🔒 | Send a GPS point |
| `POST /sos/:id/status` 🔒 station | `received`, `on_the_way`, `resolved` |
| `POST /sos/:id/exit` 🔒 | Exit with PIN: `safe` or `false_alarm` |
| `GET /incidents` 🔒 | Incident list for this user or station |

**Evidence**
| Method and path | Purpose |
|---|---|
| `POST /evidence/:incidentId` 🔒 | Upload a clip (raw body) |
| `GET /evidence/incident/:id` 🔒 | List clips |
| `GET /evidence/file/:id` 🔒 | Download a clip (logged) |
| `GET /evidence/verify/:incidentId` 🔒 | Check the hash chain |
| `GET /audit/:incidentId` 🔒 station | Who viewed the evidence |

**Profile**
| Method and path | Purpose |
|---|---|
| `PUT /me/contacts` 🔒 | Save trusted contacts (max 5) |
| `PUT /me/profile` 🔒 | Change name |
| `POST /me/pin` 🔒 | Change PIN |
| `POST /me/password` 🔒 | Change password |
| `GET /me/alerts` 🔒 | Open urgent SOS alerts for contacts |

**Socket events:** `sos:new`, `sos:status`, `sos:location`, `sos:escalated`, `sos:urgent`, `sos:beep`, `rtc`.

---

## 8. Database (SQLite)

`stations`, `users`, `incidents` (with `level`), `locations`, `evidence`, `audit`, `otps`.
Passwords, PINs and OTPs are stored only as bcrypt hashes.

---

## 9. Testing

### Automated
In `.env` set `SEED_DEMO=true` and `SMS_PROVIDER=console`, delete the database, then:
```
cd server
npm test
```
It runs 11 checks: validation, nearest station, location, evidence upload, audit log, hash chain,
acknowledgement, wrong PIN, exit, and that evidence survives exit. Set the two values back afterwards.

### Manual (3 windows)
- **Window 1:** station login, **Enable alert sound**
- **Window 2 (incognito):** a user. In **Contacts**, add the phone number of the user in window 3
- **Window 3 (Edge or another Chrome profile):** a second user with that number, logged in

| Test | Expected |
|---|---|
| Press **SOS** in window 2 | Station siren, map, live video, window 3 red card |
| Press **No** | Station shows a blue **Normal** card, no siren. Window 3 gets nothing |
| Ignore the "safe or unsafe" prompt 30 s | The case becomes Urgent |
| Station presses **Received** | Siren stops, the user sees "Police have received your alert" |
| Wait 45 s without acknowledging | Next station alerted ("No answer yet" toast) |
| Close the user's tab during SOS | After about 5 s the station shows "Live stream stopped suddenly" |
| Open a clip, then **Verify chain** | Plays, one audit line, green toast |
| Start a trip (1 min), answer Yes + PIN | Trip continues, "last confirmed safe" updates |
| Press **End trip** | Separate PIN box. 3 wrong PINs start an SOS |
| Forgot password | Old password fails, new password works |

### Testing on a phone (the camera needs HTTPS)
```
cd client
npm install -D @vitejs/plugin-basic-ssl
```
In `vite.config.js`, add `import basicSsl from '@vitejs/plugin-basic-ssl'` and set
`plugins: [react(), basicSsl()]`. Restart, then open `https://<laptop-ip>:5173` on the phone (same Wi-Fi)
and accept the certificate warning. Allow Node through the Windows firewall when asked.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module ...` | Run `npm install` in the folder you are in |
| Crash from `better-sqlite3` | `npm install better-sqlite3@latest`, or use Node 22 LTS |
| `EADDRINUSE` port 4000 | Close the other server terminal, or change `PORT` |
| Page unstyled | Check the `@tailwind` lines in `index.css`, then restart `npm run dev` |
| "Failed to fetch" | The server is not running |
| `no such column: level` | Restart the server so `db.js` can add the column |
| Camera or location blocked | Use `localhost` or HTTPS, then allow in the lock-icon menu |
| No siren | Click **Enable alert sound** first (browsers need one click) |
| Video stuck on "Waiting" | The user must have started an urgent SOS. Check the Console (F12) for `rtc` errors. Some networks need a TURN server |
| Fast2SMS "complete one transaction of 100 INR" | Recharge, or keep `SMS_PROVIDER=console` |
| OTP not arriving | With `OTP_DEV_ECHO=true` it shows on screen and in the server terminal |
| Station keeps sirening by itself | Restart the server (it closes stale incidents), then refresh |
| Contact never sees an alert | The contact needs an account and must be logged in. Their number must match exactly. Log in again after being added |
| Soft ding when listening starts | Chrome plays it and a page cannot mute it. Untick **Listen for the keyword** in Profile |
| Voice setup says "heard almost nothing" | Fix the microphone input in the system sound settings. The blue bar must move while you speak |
| Voice model fails to load | You need internet for the first download (about 100 MB). Try a phone hotspot |

---

## 11. Known limits (be honest with judges)

- **Browser version.** Notifications, check-ins and the voice keyword work only while the page is open. The Android app with a foreground service is the next phase
- **Voice keyword** uses Chrome's speech recognition, which sends audio to Google. The planned Android version uses on-device detection (Picovoice or Vosk)
- **Voice recognition** is a false-alarm filter, not a security lock. A recording can fool it, and illness or noise lowers the match. It is tuned only by trial
- **Live video** uses STUN only. Some networks need a TURN server
- **OTP demo mode** shows the code on screen. Turn it off before any real use
- **Two sample stations** (Civil Lines, Pandri) are not real data and have no accounts. Escalating to them only demonstrates the routing. Real station data (OpenStreetMap Overpass) is future work
- **Trusted contacts** are not asked to accept the role (FR-7). A contact sees alerts only if they have an account and are logged in; the SMS reaches anyone
- **No duress PIN**, no admin panel, and station accounts are protected only by an invite code
- **Tokens** are kept in browser storage. Login and OTP routes have limited rate limiting
- **Evidence** is tamper-resistant (read-only files plus a hash chain), not impossible to delete. Court use needs certification under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023. Confirm with a legal expert
- **Police response** is outside the app's control. It alerts, the station decides
- The app **complements** 112 and Mission Shakti and does not replace them
- NCRB figures in the PRD must be verified on ncrb.gov.in before presenting

---

## 12. Privacy and security notes

- Consent is collected before any recording. Recording is user-initiated and pre-consented, never covert
- Camera and microphone indicators cannot be hidden, and the app does not try to
- Passwords, PINs and OTPs are hashed. The keyword is stored only as a hash. The voiceprint stays on the device and is never uploaded
- Evidence is visible only to the user and the assigned or escalated station, and every view is logged
- Voiceprints are biometric data. Handling must follow India's DPDP Act 2023 in any real deployment
- Disk use: `node_modules` is a few hundred MB. The voice model (about 100 MB) is cached by the browser. Evidence grows by roughly 4 to 5 MB per minute of recording

---

## 13. Roadmap

1. **Pilot (one campus, one police station):** Flutter Android app with a background foreground service,
   on-device wake word, SMS fallback when offline, real station data, admin verification, trusted-contact acceptance
2. **Later:** duress PIN, risk score from behaviour and movement (rule-based first, trained model after pilot data),
   S3 Object Lock evidence storage, iOS (limited by background rules), wearables, 112 integration subject to government approval

---

## 14. Demo script (about 3 minutes)

1. **Problem (20 s):** a victim often cannot unlock a phone or explain where she is. Quote the NCRB figure only after verifying it
2. **Setup (20 s):** sign-up with OTP, then the consent screen
3. **Normal level (30 s):** press **No**. The station shows a quiet blue tracking card
4. **Urgent (60 s):** say "I'm unsafe". The station gets the siren, live video and a moving map, and the trusted contact's red card appears. Press **Received** and **On the way**
5. **Evidence (30 s):** play a clip, show the audit line, press **Verify chain**
6. **Escalation (15 s):** if nobody answers in 45 seconds, the next nearest station is alerted
7. **Close honestly (15 s):** a browser prototype, with the Android app and a pilot next, subject to police approval