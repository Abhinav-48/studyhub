# 📚 StudyHub — Collaborative Study Platform

A real-time, full-featured study notes sharing platform. Upload PDFs, images, videos and documents. Ask questions, reply to others, and collaborate live!

---

## 🚀 Quick Start (VS Code)

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version recommended)

### Step 2 — Open this folder in VS Code
```
File → Open Folder → select the "studyhub" folder
```

### Step 3 — Open the Terminal
```
View → Terminal   (or press Ctrl+`)
```

### Step 4 — Install dependencies
```bash
npm install
```

### Step 5 — Start the server
```bash
npm start
```
Or for auto-reload during development:
```bash
npm run dev
```

### Step 6 — Open your browser
Go to: **http://localhost:3000**

---

## 👑 Admin Setup

The default admin username is **`admin`**

To change it, open `server.js` and edit line 8:
```js
const ADMIN_NAME = 'admin'; // ← Change this to your preferred username
```

When you log in with the admin username:
- You can **delete** any note or question
- You can **block/unblock** users
- You get access to the **Admin Panel** tab

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 Login | Enter your name to join — no password needed |
| 📤 Upload Notes | Upload PDF, Images, Videos, Word, PowerPoint, TXT (up to 100MB) |
| 📋 Fill Details | Add title, subject, author name, description per file |
| 🔍 Search & Filter | Search by keyword, filter by subject or file type |
| 👁 Preview | Preview PDFs, images, and videos in-browser |
| ⬇ Download | Anyone can download any file |
| 💬 Q&A | Post questions and reply to others |
| ⚡ Real-time | All uploads and questions appear instantly for everyone |
| 🚫 Block Users | Admin can block users from posting |
| 🗑 Delete | Admin can delete any note or question |
| 📊 Admin Panel | Stats, online users, blocked users list |
| 📱 Responsive | Works on mobile and desktop |

---

## 📁 Project Structure

```
studyhub/
├── server.js          ← Backend (Node.js + Express + Socket.io)
├── package.json       ← Dependencies
├── public/
│   ├── index.html     ← Main page
│   ├── css/
│   │   └── style.css  ← All styles
│   ├── js/
│   │   └── app.js     ← Frontend logic
│   └── uploads/       ← Uploaded files stored here (auto-created)
└── README.md
```

---

## 🌐 Share with Others on Same Network

Find your local IP address:
- **Windows**: Run `ipconfig` in Command Prompt → look for IPv4 Address
- **Mac/Linux**: Run `ifconfig` or `ip addr`

Then others on the same WiFi can visit:
```
http://YOUR_IP:3000
```
Example: `http://192.168.1.5:3000`

---

## 🛠 Troubleshooting

**Port already in use?**
Change the port in `server.js`:
```js
const PORT = 3001; // ← Use any unused port
```

**Files not uploading?**
Make sure the `public/uploads/` folder exists (it's created automatically on first run).

**Need to reset all data?**
Restart the server — notes and questions are stored in memory only. To persist data permanently, a database (like MongoDB or SQLite) would need to be added.

---

## 💡 Tips

- The platform is best experienced with multiple browser tabs or devices
- Admin actions (delete, block) apply instantly across all connected users
- Files up to **100MB** are supported
- All content is lost when the server restarts (in-memory storage)
