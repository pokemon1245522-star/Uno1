# UNO Live - Real-Time Multiplayer Card Game

A full-stack, real-time multiplayer UNO card game built for the web. Playable across multiple devices and browsers simultaneously using a clean room-code system.

---

## 🌟 Key Features

### 1. Real-Time Multiplayer Room System
- **Create & Join Rooms**: Host creates a room with custom rules and gets a clean 6-character room code (e.g., `B4K8Z2`).
- **Cross-Device Play**: Share the room code or 1-click invite link (`?room=CODE`) with friends on phones, tablets, or computers.
- **Server-Authoritative Game State**: Game logic runs entirely on the server. Opponents' cards are never leaked to client browsers.
- **Lobby Management**:
  - Live player list with avatars, ready status, and host badge.
  - Host controls: kick players before the match, customize game rules, start game when ready.
- **Automatic Reconnection**: Reconnects seamlessly if a connection drops without losing cards, score, or table position.
- **Host Migration**: If the host disconnects, privileges automatically transfer to the next connected player.
- **Live In-Game Chat**: Quick messaging, emoji reactions, and real-time game activity logs.

### 2. Standard & House Rules (Configurable)
- **Official 108-Card UNO Deck**:
  - 4 colors: Red, Blue, Green, Yellow.
  - Numbers 0–9.
  - Action cards: Skip, Reverse (acts as Skip in 2-player mode), Draw Two (+2).
  - Wild & Wild Draw Four (+4) cards with interactive 4-color wheel selector.
- **Stacking Draw (+2 on +2, +4 on +4)**: Pass the penalty to the next player.
- **Jump-In Rule**: Play an identical card out of turn.
- **7-0 Rule**: Playing a 7 allows a player to swap hands; playing a 0 rotates all hands in the current direction.
- **Turn Timer**: Configurable turn countdown (15s, 20s, 30s, or off) with automatic auto-draw on timeout.
- **Shout UNO & Catch Penalty**:
  - A big glowing **UNO** button appears when a player has 1–2 cards.
  - If a player down to 1 card forgets to call UNO, opponents can hit **CATCH UNO!** to hit them with a penalty (+2 cards).

### 3. Tactile UI & Sound Design
- **3D Felt Poker/Card Table**: Atmospheric dark table surface with dynamic active color lighting and direction indicators.
- **Responsive Card Hand**: Hover elevation, playable glowing highlights, and sorting (by Color or Number).
- **Web Audio Sound Effects**: Card snap, drawing whoosh, turn alert chime, UNO fanfare, catch buzzer, and victory song with volume & mute controls.
- **Round & Match End**: Confetti celebration, hand reveal, score calculation, and leaderboard.

---

## 🛠️ Tech Stack & Architecture

## 🛠️ Firebase Real-Time Architecture

The application now uses **Google Firebase Firestore** (`uno1-d9f32`) for real-time multiplayer state synchronization. This means:
- **No dedicated WebSocket server container needed**: Works seamlessly on Vercel, Netlify, Firebase Hosting, GitHub Pages, or any static host!
- **Real-time document listeners (`onSnapshot`)**: Synchronizes turns, card plays, deck counts, and chat across devices in real time.
- **Cross-device**: Multiple players join the same 6-character room code on different devices (phones, tablets, PCs).

### Firebase Security Rules
In your [Firebase Console](https://console.firebase.google.com/project/uno1-d9f32/firestore/rules), ensure your Firestore Rules allow the game rooms to read and write:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if true;

      match /hands/{playerId} {
        allow read, write: if true;
      }

      match /deck/{docId} {
        allow read, write: if true;
      }

      match /messages/{messageId} {
        allow read, write: if true;
      }
    }
  }
}
```

---

## 🚀 Deployment (Vercel, Netlify, Firebase)

1. Connect your repository to Vercel (or run `vercel`).
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. The multiplayer game will connect directly to your Firebase project `uno1-d9f32` with zero server configuration!

---

## 👥 How to Test Multiplayer
1. Open `http://localhost:3000` in Browser A.
2. Enter a nickname and click **Create New Room**.
3. Copy the 6-character room code from the lobby (e.g., `A8B3C4`).
4. Open another browser window or incognito tab (or another device on the same local network).
5. Enter a nickname, click **Join with Room Code**, and paste the code.
6. Once both players are ready, the host clicks **Start UNO Match**!
