const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

// ─── Config ───────────────────────────────────────────────────────────────────
const ADMIN_NAME = 'admin'; // Admin username
const ADMIN_PASSWORD = 'Abhinav210507'; // Admin password
const PORT = 3000;

// ─── In-memory store ──────────────────────────────────────────────────────────
let notes = [];       // { id, author, title, subject, description, fileName, fileType, fileUrl, fileSize, uploadedAt, downloads }
let questions = [];   // { id, author, text, postedAt, replies: [{ id, author, text, postedAt }] }
let onlineUsers = {}; // socketId → { name, id }
let blockedUsers = new Set();

// ─── Multer setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── REST Routes ──────────────────────────────────────────────────────────────

// Verify admin password
app.post('/api/admin-login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Wrong password!' });
  }
});

// Upload note
app.post('/api/notes', upload.single('file'), (req, res) => {
  const { author, title, subject, description } = req.body;
  if (!author || !title || !req.file) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (blockedUsers.has(author.toLowerCase())) {
    return res.status(403).json({ error: 'You have been blocked by the admin.' });
  }

  const note = {
    id: uuidv4(),
    author,
    title,
    subject: subject || 'General',
    description: description || '',
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    fileUrl: `/uploads/${req.file.filename}`,
    fileSize: req.file.size,
    uploadedAt: new Date().toISOString(),
    downloads: 0
  };
  notes.unshift(note);
  io.emit('new_note', note);
  res.json(note);
});

// Get all notes
app.get('/api/notes', (req, res) => {
  res.json(notes);
});

// Delete note (admin only)
app.delete('/api/notes/:id', (req, res) => {
  const { requester } = req.body;
  if (requester?.toLowerCase() !== ADMIN_NAME) {
    return res.status(403).json({ error: 'Only admin can delete notes.' });
  }
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  // Remove file
  const filePath = path.join(__dirname, 'public', notes[idx].fileUrl);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  notes.splice(idx, 1);

  io.emit('note_deleted', req.params.id);
  res.json({ success: true });
});

// Track download
app.post('/api/notes/:id/download', (req, res) => {
  const note = notes.find(n => n.id === req.params.id);
  if (note) { note.downloads++; io.emit('note_updated', note); }
  res.json({ success: true });
});

// Get all questions
app.get('/api/questions', (req, res) => res.json(questions));

// Post question
app.post('/api/questions', (req, res) => {
  const { author, text } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'Missing fields' });
  if (blockedUsers.has(author.toLowerCase())) {
    return res.status(403).json({ error: 'You have been blocked by the admin.' });
  }
  const q = { id: uuidv4(), author, text, postedAt: new Date().toISOString(), replies: [] };
  questions.unshift(q);
  io.emit('new_question', q);
  res.json(q);
});

// Reply to question
app.post('/api/questions/:id/reply', (req, res) => {
  const { author, text } = req.body;
  const q = questions.find(q => q.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  if (blockedUsers.has(author?.toLowerCase())) {
    return res.status(403).json({ error: 'You have been blocked.' });
  }
  const reply = { id: uuidv4(), author, text, postedAt: new Date().toISOString() };
  q.replies.push(reply);
  io.emit('new_reply', { questionId: q.id, reply });
  res.json(reply);
});

// Delete question (admin only)
app.delete('/api/questions/:id', (req, res) => {
  const { requester } = req.body;
  if (requester?.toLowerCase() !== ADMIN_NAME) {
    return res.status(403).json({ error: 'Only admin can delete.' });
  }
  const idx = questions.findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  questions.splice(idx, 1);
  io.emit('question_deleted', req.params.id);
  res.json({ success: true });
});

// Block user (admin only)
app.post('/api/block', (req, res) => {
  const { requester, targetUser } = req.body;
  if (requester?.toLowerCase() !== ADMIN_NAME) {
    return res.status(403).json({ error: 'Only admin can block.' });
  }
  blockedUsers.add(targetUser.toLowerCase());
  io.emit('user_blocked', targetUser.toLowerCase());
  res.json({ success: true });
});

// Unblock user (admin only)
app.post('/api/unblock', (req, res) => {
  const { requester, targetUser } = req.body;
  if (requester?.toLowerCase() !== ADMIN_NAME) {
    return res.status(403).json({ error: 'Only admin can unblock.' });
  }
  blockedUsers.delete(targetUser.toLowerCase());
  io.emit('user_unblocked', targetUser.toLowerCase());
  res.json({ success: true });
});

// Get blocked users (admin only)
app.get('/api/blocked', (req, res) => {
  res.json([...blockedUsers]);
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('user_join', (name) => {
    onlineUsers[socket.id] = { name, id: socket.id };
    io.emit('online_users', Object.values(onlineUsers).map(u => u.name));
  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.id];
    io.emit('online_users', Object.values(onlineUsers).map(u => u.name));
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 StudyHub running at http://localhost:${PORT}`);
  console.log(`👑 Admin username: "${ADMIN_NAME}" (change in server.js)`);
});
