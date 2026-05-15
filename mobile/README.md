# callnade — React Native (Expo)

Native shell that mirrors the web app's auth → discovery → profile flow
against the same backend at `https://callnade.site/api/v1`. Built on
Expo SDK 51 (managed workflow). Run on a physical device with Expo Go
to start, then graduate to a custom dev client when adding native
modules (WebRTC, FLAG_SECURE, push).

## What's wired

- **Auth**: email + password login, signup with gender / DOB / referral.
- **Token persistence** via `AsyncStorage` so cold starts skip the login
  screen.
- **API client** with the same 401-refresh interceptor pattern as the
  web (`src/services/api.js`).
- **Home feed**: `/popular` grid + `/users/online` row, with the same
  `LIVE / BUSY / OFFLINE` pill on `UserCard`.
- **Profile**: read-only header, gallery strip, packages list. Tapping a
  package opens the Call screen.
- **Navigation**: `@react-navigation/native-stack`, gated by auth.

## Anti-screenshot

`expo-screen-capture` is wired into `App.jsx` and the config plugin
is registered in `app.json`. Effect:

- **Android**: sets `FLAG_SECURE` on the activity window from cold
  start. The system shows a black frame for any screenshot attempt;
  screen recordings come out blanked.
- **iOS**: registers a screenshot-listener (it's the most iOS lets you
  do — there's no real block API). On first screenshot we currently
  log it; hook it into telemetry / a "creator was screenshotted" banner
  via `listenForScreenshotAttempts()` in `src/services/screenCapture.js`.

This **only works inside a custom dev client**, not stock Expo Go,
because it's a native module. See "Building a dev client" below.

## What's NOT wired (yet)

- **WebRTC video / audio** — install `react-native-webrtc`, run
  `npx expo prebuild`, then port the signaling logic from
  `frontend/src/pages/Call.jsx`. Same socket.io contract works.
- **Push notifications** — `expo-notifications` + a backend hook to
  store the device token next to the user.
- **Live wallet sync** — `socket.io-client` works fine in RN, just
  port the `useWalletSync` / `usePresenceSync` hooks.
- **Image upload** (avatar / gallery / verification selfie) —
  `expo-image-picker` for picking, multipart upload to the same
  `/media/...` endpoints.
- **Admin screens** — skipped on mobile; admins use the web.

## Setup

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone (same Wi-Fi as your laptop).

To point at a different API (e.g. local dev), edit `app.json`:

```json
"extra": { "apiBaseUrl": "http://192.168.1.x:4000/api/v1" }
```

(Use your machine's LAN IP, not `localhost` — the phone won't resolve
that.)

## Building a dev client (one-time)

Native modules (`expo-screen-capture`, `react-native-webrtc` later)
can't run in Expo Go. You need a custom dev client built once, then
you reload it like Expo Go for every code change.

The fastest path is **EAS Build** (Expo's cloud builder, free tier
covers dev builds):

```bash
npm install -g eas-cli
cd mobile
eas login                                  # one-time, free Expo account
eas init                                   # creates project on EAS
eas build -p android --profile development # ~15-20 min in the cloud
```

When it finishes EAS prints a URL — open it on your phone, install the
APK. Now run `npx expo start --dev-client` instead of plain
`npx expo start`. Open the new app (it looks like Expo Go), it'll
auto-connect to your laptop's bundler and show your code with FLAG_SECURE
already on.

For iOS the same flow with `-p ios` works if you have an Apple Developer
account; otherwise stick to Android for dev and ship to the App Store
when you're ready.

If you want the local route instead, install Android Studio + the
Android SDK, then `npx expo run:android` builds straight to a connected
device or emulator.

## WebRTC video / audio calls

Wired in:
- `react-native-webrtc` (native module).
- `@config-plugins/react-native-webrtc` (handles iOS Info.plist + Android manifest entries).
- `socket.io-client` for signaling, pointed at the same backend the web uses.
- `src/services/webrtc.js` — fetch ICE, create peer, getUserMedia (front camera), tuneSenders for bitrate caps.
- `src/services/socket.js` — singleton socket.io connection with JWT in handshake.
- `src/screens/Call.jsx` — real WebRTC peer connection, RTCView for remote feed, local PIP, mute / camera / hangup controls.

After adding these deps you need to rebuild the dev client once:

```bash
npm install
npx expo prebuild --clean    # refreshes ios/ + android/
eas build -p android --profile development
```

Then `npx expo start --dev-client --tunnel` and reload — every JS
change to the call screen is hot-reload from there.

## Architecture mirror

| Web                                         | Mobile                                       |
| ------------------------------------------- | -------------------------------------------- |
| `frontend/src/services/api.js`              | `mobile/src/services/api.js`                 |
| `frontend/src/stores/auth.store.js`         | `mobile/src/stores/auth.store.js`            |
| `frontend/src/components/UserCard.jsx`      | `mobile/src/components/UserCard.jsx`         |
| `frontend/src/components/PresenceDot.jsx`   | `mobile/src/components/PresenceDot.jsx`      |
| `frontend/src/pages/Login.jsx`              | `mobile/src/screens/Login.jsx`               |
| `frontend/src/pages/Home.jsx`               | `mobile/src/screens/Home.jsx`                |
| (n/a)                                       | `mobile/App.jsx` (nav root)                  |

The backend is shared — no duplication.
