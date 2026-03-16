const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// ─── Config ───────────────────────────────────────────────────────────────────
const ADMIN_NAME = 'admin';
const ADMIN_PASSWORD = 'Abhinav210507';
const PORT = process.env.PORT || 3000;

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─── Cloudinary ───────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ─── Online Users ─────────────────────────────────────────────────────────────
let onlineUsers = {};

// ─── Multer (memory storage) ──────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Admin Login ──────────────────────────────────────────────────────────────
app.post('/api/admin-login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ success: true });
  else res.status(401).json({ error: 'Wrong password!' });
});

// ─── NOTES ────────────────────────────────────────────────────────────────────

// Upload note
app.post('/api/notes', upload.single('file'), async (req, res) => {
  try {
    const { author, title, subject, description } = req.body;
    if (!author || !title || !req.file) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if blocked
    const { data: blocked } = await supabase
      .from('blocked_users')
      .select('username')
      .eq('username', author.toLowerCase())
      .single();
    if (blocked) return res.status(403).json({ error: 'You have been blocked by the admin.' });

    // Upload file to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'studyhub',
          public_id: uuidv4(),
          use_filename: true
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // Save note to Supabase database
    const { data: note, error: dbError } = await supabase
      .from('notes')
      .insert({
        author,
        title,
        subject: subject || 'General',
        description: description || '',
        file_name: req.file.originalname,
        file_type: req.file.mimetype,
        file_url: uploadResult.secure_url,
        file_size: req.file.size,
        downloads: 0
      })
      .select()
      .single();

    if (dbError) throw dbError;

    const formattedNote = formatNote(note);
    io.emit('new_note', formattedNote);
    res.json(formattedNote);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(formatNote));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete note (admin only)
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (requester?.toLowerCase() !== ADMIN_NAME) {
      return res.status(403).json({ error: 'Only admin can delete.' });
    }

    // Get note file url
    const { data: note } = await supabase
      .from('notes')
      .select('file_url')
      .eq('id', req.params.id)
      .single();

    // Delete from Cloudinary
    if (note?.file_url) {
      const publicId = note.file_url.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
    }

    const { error } = await supabase.from('notes').delete().eq('id', req.params.id);
    if (error) throw error;

    io.emit('note_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track download
app.post('/api/notes/:id/download', async (req, res) => {
  try {
    const { data: note } = await supabase
      .from('notes')
      .select('downloads')
      .eq('id', req.params.id)
      .single();
    if (note) {
      const { data: updated } = await supabase
        .from('notes')
        .update({ downloads: note.downloads + 1 })
        .eq('id', req.params.id)
        .select()
        .single();
      io.emit('note_updated', formatNote(updated));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── QUESTIONS ────────────────────────────────────────────────────────────────

app.get('/api/questions', async (req, res) => {
  try {
    const { data: questions, error } = await supabase
      .from('questions')
      .select('*, replies(*)')
      .order('posted_at', { ascending: false });
    if (error) throw error;
    res.json(questions.map(formatQuestion));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/questions', async (req, res) => {
  try {
    const { author, text } = req.body;
    if (!author || !text) return res.status(400).json({ error: 'Missing fields' });

    const { data: blocked } = await supabase
      .from('blocked_users')
      .select('username')
      .eq('username', author.toLowerCase())
      .single();
    if (blocked) return res.status(403).json({ error: 'You have been blocked.' });

    const { data: q, error } = await supabase
      .from('questions')
      .insert({ author, text })
      .select()
      .single();
    if (error) throw error;

    const formatted = { ...formatQuestion(q), replies: [] };
    io.emit('new_question', formatted);
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/questions/:id/reply', async (req, res) => {
  try {
    const { author, text } = req.body;

    const { data: blocked } = await supabase
      .from('blocked_users')
      .select('username')
      .eq('username', author?.toLowerCase())
      .single();
    if (blocked) return res.status(403).json({ error: 'You have been blocked.' });

    const { data: reply, error } = await supabase
      .from('replies')
      .insert({ question_id: req.params.id, author, text })
      .select()
      .single();
    if (error) throw error;

    const formatted = formatReply(reply);
    io.emit('new_reply', { questionId: req.params.id, reply: formatted });
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (requester?.toLowerCase() !== ADMIN_NAME) {
      return res.status(403).json({ error: 'Only admin can delete.' });
    }
    const { error } = await supabase.from('questions').delete().eq('id', req.params.id);
    if (error) throw error;
    io.emit('question_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BLOCK/UNBLOCK ────────────────────────────────────────────────────────────

app.post('/api/block', async (req, res) => {
  try {
    const { requester, targetUser } = req.body;
    if (requester?.toLowerCase() !== ADMIN_NAME) {
      return res.status(403).json({ error: 'Only admin can block.' });
    }
    await supabase.from('blocked_users').upsert({ username: targetUser.toLowerCase() });
    io.emit('user_blocked', targetUser.toLowerCase());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unblock', async (req, res) => {
  try {
    const { requester, targetUser } = req.body;
    if (requester?.toLowerCase() !== ADMIN_NAME) {
      return res.status(403).json({ error: 'Only admin can unblock.' });
    }
    await supabase.from('blocked_users').delete().eq('username', targetUser.toLowerCase());
    io.emit('user_unblocked', targetUser.toLowerCase());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/blocked', async (req, res) => {
  try {
    const { data } = await supabase.from('blocked_users').select('username');
    res.json(data.map(u => u.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNote(n) {
  return {
    id: n.id,
    author: n.author,
    title: n.title,
    subject: n.subject,
    description: n.description,
    fileName: n.file_name,
    fileType: n.file_type,
    fileUrl: n.file_url,
    fileSize: n.file_size,
    uploadedAt: n.uploaded_at,
    downloads: n.downloads
  };
}

function formatQuestion(q) {
  return {
    id: q.id,
    author: q.author,
    text: q.text,
    postedAt: q.posted_at,
    replies: (q.replies || []).map(formatReply)
  };
}

function formatReply(r) {
  return {
    id: r.id,
    author: r.author,
    text: r.text,
    postedAt: r.posted_at
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 StudyHub running at http://localhost:${PORT}`);
  console.log(`👑 Admin: "${ADMIN_NAME}" | Cloudinary + Supabase connected`);
});