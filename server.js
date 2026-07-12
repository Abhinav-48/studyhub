process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
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

const ADMIN_NAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Abhinav210507';
const SUPERADMIN_NAME = 'abhinav8112';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
const PORT = process.env.PORT || 3000;

function isPrivileged(name) {
  const n = (name || '').toLowerCase();
  return n === ADMIN_NAME || n === SUPERADMIN_NAME;
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    db: { schema: 'public' },
    global: { fetch: fetch.bind(globalThis) }
  }
);

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const b2 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: `https://${process.env.B2_ENDPOINT}`,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

let onlineUsers = {};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
// ─── Admin Login ──────────────────────────────────────────────────────────────
app.post('/api/admin-login', async (req, res) => {
  try {
    const { password } = req.body;
    const { data: blockedRow } = await supabase.from('app_settings').select('value').eq('key', 'admin_blocked').single();
    if (blockedRow?.value === 'true') return res.status(403).json({ error: 'You cannot access this account.' });
    const { data: passRow } = await supabase.from('app_settings').select('value').eq('key', 'admin_password').single();
    const currentPassword = passRow?.value || ADMIN_PASSWORD;
    if (password === currentPassword) res.json({ success: true });
    else res.status(401).json({ error: 'Wrong password!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/superadmin-login', (req, res) => {
  const { password } = req.body;
  if (!SUPERADMIN_PASSWORD) return res.status(500).json({ error: 'Super admin not configured.' });
  if (password === SUPERADMIN_PASSWORD) res.json({ success: true });
  else res.status(401).json({ error: 'Wrong password!' });
});

app.get('/api/admin-settings', async (req, res) => {
  try {
    const { data } = await supabase.from('app_settings').select('*');
    const settings = {};
    (data || []).forEach(s => { settings[s.key] = s.value; });
    res.json({ admin_blocked: settings.admin_blocked === 'true', uploads_disabled: settings.uploads_disabled === 'true' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin-settings/block', async (req, res) => {
  try {
    const { requester, blocked } = req.body;
    if (requester?.toLowerCase() !== SUPERADMIN_NAME) return res.status(403).json({ error: 'Only super admin can do this.' });
    await supabase.from('app_settings').upsert({ key: 'admin_blocked', value: blocked ? 'true' : 'false' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin-settings/uploads-toggle', async (req, res) => {
  try {
    const { requester, disabled } = req.body;
    if (requester?.toLowerCase() !== SUPERADMIN_NAME) return res.status(403).json({ error: 'Only super admin can do this.' });
    await supabase.from('app_settings').upsert({ key: 'uploads_disabled', value: disabled ? 'true' : 'false' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin-settings/change-password', async (req, res) => {
  try {
    const { requester, newPassword } = req.body;
    if (requester?.toLowerCase() !== SUPERADMIN_NAME) return res.status(403).json({ error: 'Only super admin can do this.' });
    if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Password too short (min 4 chars).' });
    await supabase.from('app_settings').upsert({ key: 'admin_password', value: newPassword });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CHECK BLOCKED ────────────────────────────────────────────────────────────
app.get('/api/check-blocked/:username', async (req, res) => {
  try {
    const { data } = await supabase.from('blocked_users').select('username').eq('username', req.params.username.toLowerCase()).single();
    res.json({ blocked: !!data });
  } catch { res.json({ blocked: false }); }
});

// ─── LOGIN HISTORY ────────────────────────────────────────────────────────────
app.post('/api/login-history', async (req, res) => {
  try {
    const { username, device } = req.body;
    if (!username) return res.json({ success: true });
    if (username.toLowerCase() === SUPERADMIN_NAME) return res.json({ success: true });

    if (username.toLowerCase() !== 'admin') {
      const FAKE_NAMES = ['hulk','superman','batman','spiderman','thor','naruto','goku','sasuke','ironman','xyz','abc','aaa','zzz','asdf','qwerty','zxcv','test','user','hello','guest','noname','anonymous','foo','bar'];
      const lower = username.toLowerCase().replace(/\s/g,'');
      const keyboardPatterns = /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i;
      const nameParts = username.trim().toLowerCase().split(/\s+/);
      const hasRepeatedWords = nameParts.length > 1 && new Set(nameParts).size !== nameParts.length;
      const isInvalid =
        username.length < 3 ||
        !/^[a-zA-Z\u0900-\u097F\s]+$/.test(username) ||
        FAKE_NAMES.includes(lower) ||
        /^(.)\1+$/i.test(username.replace(/\s/g,'')) ||
        keyboardPatterns.test(username.replace(/\s/g,'')) ||
        hasRepeatedWords;
      if (isInvalid) return res.status(400).json({ error: 'Invalid name' });
    }

    await supabase.from('login_history').insert({ username, device: device || 'Unknown' });
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

app.get('/api/login-history', async (req, res) => {
  try {
    const { data, error } = await supabase.from('login_history').select('*').order('logged_in_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  try {
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function uploadGeneric(file) {
  const isDocument = [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ].includes(file.mimetype);

  if (isDocument) {
    const ext = file.originalname.split('.').pop();
    const key = `attachments/${uuidv4()}.${ext}`;
    await b2.send(new PutObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    return { url: `b2://${key}`, type: file.mimetype };
  } else {
    const rt = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: rt, folder: 'studyhub/attachments', public_id: uuidv4(), timeout: 120000 },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(file.buffer);
    });
    return { url: uploadResult.secure_url, type: file.mimetype };
  }
}

app.post('/api/announcements', upload.single('file'), async (req, res) => {
  try {
    const { requester, message } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    let attachment_url = null, attachment_type = null;
    if (req.file) {
      const up = await uploadGeneric(req.file);
      attachment_url = up.url; attachment_type = up.type;
    }
    const { data, error } = await supabase.from('announcements').insert({ message, attachment_url, attachment_type }).select().single();
    if (error) throw error;
    io.emit('new_announcement', data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/announcements/:id/signed-url', async (req, res) => {
  try {
    const { data } = await supabase.from('announcements').select('attachment_url').eq('id', req.params.id).single();
    if (!data?.attachment_url?.startsWith('b2://')) return res.status(400).json({ error: 'Not a B2 file' });
    const key = data.attachment_url.replace('b2://', '');
    const url = await getSignedUrl(b2, new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/announcements/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    await supabase.from('announcements').delete().eq('id', req.params.id);
    io.emit('announcement_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
app.post('/api/messages', async (req, res) => {
  try {
    const { from_user, message } = req.body;
    if (!from_user || !message) return res.status(400).json({ error: 'Missing fields' });
    const { data: blockedRows } = await supabase.from('blocked_users').select('username').eq('username', from_user.toLowerCase());
    if (blockedRows && blockedRows.length > 0) return res.status(403).json({ error: 'You have been blocked.' });
    const { data, error } = await supabase.from('messages').insert({ from_user, message }).select().single();
    if (error) throw error;
    io.emit('new_message', data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { data, error } = await supabase.from('messages').select('*').order('sent_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/messages/:username', async (req, res) => {
  try {
    const { data, error } = await supabase.from('messages').select('*').eq('from_user', req.params.username).order('sent_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/messages/:id/reply', async (req, res) => {
  try {
    const { requester, reply } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    const { data, error } = await supabase.from('messages').update({ reply, read: true }).eq('id', req.params.id).select();
    if (error) throw error;
    io.emit('message_reply', data[0]);
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    await supabase.from('messages').delete().eq('id', req.params.id);
    io.emit('message_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── STUDY PLANNER ────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase.from('study_events').select('*').order('event_date', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/events', upload.single('file'), async (req, res) => {
  try {
    const { title, subject, event_date, event_type, created_by } = req.body;
    if (!title || !subject || !event_date || !created_by) return res.status(400).json({ error: 'Missing fields' });
    if (!isPrivileged(created_by)) return res.status(403).json({ error: 'Only admin can add events.' });
    let attachment_url = null, attachment_type = null;
    if (req.file) {
      const up = await uploadGeneric(req.file);
      attachment_url = up.url; attachment_type = up.type;
    }
    const { data, error } = await supabase.from('study_events').insert({ title, subject, event_date, event_type: event_type || 'exam', created_by, attachment_url, attachment_type }).select().single();
    if (error) throw error;
    io.emit('new_event', data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/events/:id/signed-url', async (req, res) => {
  try {
    const { data } = await supabase.from('study_events').select('attachment_url').eq('id', req.params.id).single();
    if (!data?.attachment_url?.startsWith('b2://')) return res.status(400).json({ error: 'Not a B2 file' });
    const key = data.attachment_url.replace('b2://', '');
    const url = await getSignedUrl(b2, new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    await supabase.from('study_events').delete().eq('id', req.params.id);
    io.emit('event_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── QUIZ ─────────────────────────────────────────────────────────────────────
app.get('/api/quizzes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/quizzes', async (req, res) => {
  try {
    const { title, subject, created_by, questions } = req.body;
    if (!title || !subject || !created_by) return res.status(400).json({ error: 'Missing fields' });
    if (!isPrivileged(created_by)) return res.status(403).json({ error: 'Only admin can create quizzes.' });
    const { data: quiz, error } = await supabase.from('quizzes').insert({ title, subject, created_by }).select().single();
    if (error) throw error;
    if (questions && questions.length) {
      const qs = questions.map(q => ({ ...q, quiz_id: quiz.id }));
      await supabase.from('quiz_questions').insert(qs);
    }
    io.emit('new_quiz', quiz);
    res.json(quiz);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const { data: quiz, error } = await supabase.from('quizzes').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    const { data: questions } = await supabase.from('quiz_questions').select('*').eq('quiz_id', req.params.id);
    res.json({ ...quiz, questions: questions || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/quizzes/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    await supabase.from('quizzes').delete().eq('id', req.params.id);
    io.emit('quiz_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/quizzes/:id/submit', async (req, res) => {
  try {
    const { username, answers } = req.body;
    if (!username || !answers) return res.status(400).json({ error: 'Missing fields' });
    const { data: questions } = await supabase.from('quiz_questions').select('*').eq('quiz_id', req.params.id);
    let score = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.correct_answer) score++;
    });
    await supabase.from('quiz_results').insert({ quiz_id: req.params.id, username, score, total: questions.length });
    res.json({ score, total: questions.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quizzes/:id/results', async (req, res) => {
  try {
    const { data, error } = await supabase.from('quiz_results').select('*').eq('quiz_id', req.params.id).order('attempted_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── COURSES (folders) ─────────────────────────────────────────────────────────
app.get('/api/courses', async (req, res) => {
  try {
    const { data, error } = await supabase.from('courses').select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/courses/:id', async (req, res) => {
  try {
    const { requester, name } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const { data: old } = await supabase.from('courses').select('name').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('courses').update({ name: name.trim() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (old) await supabase.from('notes').update({ course: name.trim() }).eq('course', old.name);
    io.emit('course_renamed');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/courses', async (req, res) => {
  try {
    const { requester, name } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const { count } = await supabase.from('courses').select('id', { count: 'exact', head: true });
    const { data, error } = await supabase.from('courses').insert({ name: name.trim(), sort_order: (count || 0) + 1 }).select().single();
    if (error) throw error;
    io.emit('course_added', data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/courses/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    const { data: course } = await supabase.from('courses').select('name').eq('id', req.params.id).single();
    if (!course) return res.status(404).json({ error: 'Folder not found' });
    const { count } = await supabase.from('notes').select('id', { count: 'exact', head: true }).eq('course', course.name);
    if (count && count > 0) return res.status(400).json({ error: `Cannot delete — folder has ${count} note(s). Delete or move them first.` });
    await supabase.from('courses').delete().eq('id', req.params.id);
    io.emit('course_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function getResourceType(mimetype) {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('image/')) return 'image';
  return 'raw';
}

app.post('/api/notes', upload.single('file'), async (req, res) => {
  try {
    const { author, title, subject, description, course } = req.body;
    if (!author || !title || !req.file) return res.status(400).json({ error: 'Missing required fields' });
    const { data: uploadsRow } = await supabase.from('app_settings').select('value').eq('key', 'uploads_disabled').single();
    if (uploadsRow?.value === 'true') return res.status(403).json({ error: 'Uploads are currently disabled by the administrator.' });
    const { data: blocked } = await supabase.from('blocked_users').select('username').eq('username', author.toLowerCase()).single();
    if (blocked) return res.status(403).json({ error: 'You have been blocked by the admin.' });
    const resourceType = getResourceType(req.file.mimetype);
    let fileUrl = '';

    const isDocument = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain'
    ].includes(req.file.mimetype);

    if (isDocument) {
      const ext = req.file.originalname.split('.').pop();
      const key = `notes/${uuidv4()}.${ext}`;
      await b2.send(new PutObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }));
      fileUrl = `b2://${key}`;
    } else {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: resourceType, folder: 'studyhub', public_id: uuidv4(), timeout: 120000 },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      fileUrl = uploadResult.secure_url;
    }

    const { data: note, error: dbError } = await supabase.from('notes').insert({
      author, title, subject: subject || 'General', course: course || '6th Sem', description: description || '',
      file_name: req.file.originalname, file_type: req.file.mimetype,
      file_url: fileUrl, file_size: req.file.size, downloads: 0, status: 'pending'
    }).select().single();
    if (dbError) throw dbError;
    io.emit('new_pending_note', formatNote(note));
    res.json({ success: true, message: 'Note submitted for approval!' });
  } catch (err) { res.status(500).json({ error: 'Upload failed: ' + err.message }); }
});

app.get('/api/notes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('notes').select('*').eq('status', 'approved').order('uploaded_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(formatNote));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/notes/pending', async (req, res) => {
  try {
    const { data, error } = await supabase.from('notes').select('*').eq('status', 'pending').order('uploaded_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(formatNote));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notes/:id/approve', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    const { data: note, error } = await supabase.from('notes').update({ status: 'approved' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    const formatted = formatNote(note);
    io.emit('new_note', formatted);
    io.emit('note_approved', req.params.id);
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notes/:id/reject', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    const { data: note } = await supabase.from('notes').select('file_url, file_type').eq('id', req.params.id).single();
    if (note?.file_url) {
      const publicId = 'studyhub/' + note.file_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId, { resource_type: getResourceType(note.file_type || '') }).catch(() => {});
    }
    await supabase.from('notes').delete().eq('id', req.params.id);
    io.emit('note_rejected', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    const { data: note } = await supabase.from('notes').select('file_url, file_type').eq('id', req.params.id).single();
    if (note?.file_url?.startsWith('b2://')) {
      const key = note.file_url.replace('b2://', '');
      await b2.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key })).catch(() => {});
    } else if (note?.file_url) {
      const publicId = 'studyhub/' + note.file_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId, { resource_type: getResourceType(note.file_type || '') }).catch(() => {});
    }
    await supabase.from('notes').delete().eq('id', req.params.id);
    io.emit('note_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/notes/:id/signed-url', async (req, res) => {
  try {
    const { data: note } = await supabase.from('notes').select('file_url').eq('id', req.params.id).single();
    if (!note || !note.file_url.startsWith('b2://')) return res.status(400).json({ error: 'Not a B2 file' });
    const key = note.file_url.replace('b2://', '');
    const url = await getSignedUrl(b2, new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notes/:id/download', async (req, res) => {
  try {
    const { data: note } = await supabase.from('notes').select('downloads').eq('id', req.params.id).single();
    if (note) {
      const { data: updated } = await supabase.from('notes').update({ downloads: note.downloads + 1 }).eq('id', req.params.id).select().single();
      io.emit('note_updated', formatNote(updated));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TIMETABLE ────────────────────────────────────────────────────────────────
app.post('/api/timetables', upload.single('file'), async (req, res) => {
  try {
    const { section, uploaded_by } = req.body;
    if (!section || !req.file) return res.status(400).json({ error: 'Missing required fields' });
    if (!isPrivileged(uploaded_by)) return res.status(403).json({ error: 'Only admin can upload timetables.' });

    const isDocument = req.file.mimetype === 'application/pdf';
    let fileUrl = '';
    if (isDocument) {
      const ext = req.file.originalname.split('.').pop();
      const fileName = `${uuidv4()}.${ext}`;
      const { error: storageError } = await supabase.storage
        .from('studyhub-files')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (storageError) throw storageError;
      const { data: urlData } = supabase.storage.from('studyhub-files').getPublicUrl(fileName);
      fileUrl = urlData.publicUrl;
    } else {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', folder: 'studyhub/timetables', public_id: uuidv4(), timeout: 120000 },
          (error, result) => { if (error) reject(error); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      fileUrl = uploadResult.secure_url;
    }

    const { data: tt, error: dbError } = await supabase.from('timetables').insert({
      section, file_name: req.file.originalname, file_type: req.file.mimetype,
      file_url: fileUrl, file_size: req.file.size, uploaded_by
    }).select().single();
    if (dbError) throw dbError;
    const formatted = formatTimetable(tt);
    io.emit('new_timetable', formatted);
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: 'Upload failed: ' + err.message }); }
});

app.get('/api/timetables', async (req, res) => {
  try {
    const { data, error } = await supabase.from('timetables').select('*').order('uploaded_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(formatTimetable));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/timetables/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    const { data: tt } = await supabase.from('timetables').select('file_url, file_type').eq('id', req.params.id).single();
    if (tt?.file_url && tt.file_type.startsWith('image/')) {
      const publicId = 'studyhub/timetables/' + tt.file_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {});
    }
    await supabase.from('timetables').delete().eq('id', req.params.id);
    io.emit('timetable_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/questions', async (req, res) => {
  try {
    const { data, error } = await supabase.from('questions').select('*, replies(*)').order('posted_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(formatQuestion));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/questions', async (req, res) => {
  try {
    const { author, text } = req.body;
    if (!author || !text) return res.status(400).json({ error: 'Missing fields' });
    const { data: blocked } = await supabase.from('blocked_users').select('username').eq('username', author.toLowerCase()).single();
    if (blocked) return res.status(403).json({ error: 'You have been blocked.' });
    const { data: q, error } = await supabase.from('questions').insert({ author, text }).select().single();
    if (error) throw error;
    const formatted = { ...formatQuestion(q), replies: [] };
    io.emit('new_question', formatted);
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/questions/:id/reply', async (req, res) => {
  try {
    const { author, text } = req.body;
    const { data: blockedRows } = await supabase.from('blocked_users').select('username').eq('username', author?.toLowerCase());
    if (blockedRows && blockedRows.length > 0) return res.status(403).json({ error: 'You have been blocked.' });
    const { data: reply, error } = await supabase.from('replies').insert({ question_id: req.params.id, author, text }).select().single();
    if (error) throw error;
    const formatted = formatReply(reply);
    io.emit('new_reply', { questionId: req.params.id, reply: formatted });
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    const { requester } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    await supabase.from('replies').delete().eq('question_id', req.params.id);
    await supabase.from('questions').delete().eq('id', req.params.id);
    io.emit('question_deleted', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── STUDY STREAK ─────────────────────────────────────────────────────────────
app.post('/api/streak/update', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    const key = username.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase.from('user_streaks').select('*').eq('username', key).single();

    let current = 1, longest = 1;

    if (existing) {
      if (existing.last_login_date === today) {
        current = existing.current_streak;
        longest = existing.longest_streak;
      } else {
        const diffDays = Math.round((new Date(today) - new Date(existing.last_login_date)) / (1000 * 60 * 60 * 24));
        current = diffDays === 1 ? existing.current_streak + 1 : 1;
        longest = Math.max(current, existing.longest_streak);
        await supabase.from('user_streaks').update({ current_streak: current, longest_streak: longest, last_login_date: today }).eq('username', key);
      }
    } else {
      await supabase.from('user_streaks').insert({ username: key, current_streak: 1, longest_streak: 1, last_login_date: today });
    }

    res.json({ current, longest });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/streak/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase.from('user_streaks').select('*').order('current_streak', { ascending: false }).limit(10);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/block', async (req, res) => {
  try {
    const { requester, targetUser } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    if (targetUser?.toLowerCase() === SUPERADMIN_NAME) return res.status(403).json({ error: 'Cannot block this user.' });
    await supabase.from('blocked_users').upsert({ username: targetUser.toLowerCase() });
    io.emit('user_blocked', targetUser.toLowerCase());
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/unblock', async (req, res) => {
  try {
    const { requester, targetUser } = req.body;
    if (!isPrivileged(requester)) return res.status(403).json({ error: 'Only admin.' });
    await supabase.from('blocked_users').delete().eq('username', targetUser.toLowerCase());
    io.emit('user_unblocked', targetUser.toLowerCase());
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/blocked', async (req, res) => {
  try {
    const { data } = await supabase.from('blocked_users').select('username');
    res.json((data || []).map(u => u.username));
  } catch (err) { res.status(500).json({ error: err.message }); }
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
function formatTimetable(t) {
  return {
    id: t.id, section: t.section, fileName: t.file_name, fileType: t.file_type,
    fileUrl: t.file_url, fileSize: t.file_size, uploadedBy: t.uploaded_by, uploadedAt: t.uploaded_at
  };
}
function formatNote(n) {
  return {
    id: n.id, author: n.author, title: n.title, subject: n.subject, course: n.course || '6th Sem',
    description: n.description, fileName: n.file_name, fileType: n.file_type,
    fileUrl: n.file_url, fileSize: n.file_size, uploadedAt: n.uploaded_at,
    downloads: n.downloads, status: n.status
  };
}
function formatQuestion(q) {
  return { id: q.id, author: q.author, text: q.text, postedAt: q.posted_at, replies: (q.replies || []).map(formatReply) };
}
function formatReply(r) {
  return { id: r.id, author: r.author, text: r.text, postedAt: r.posted_at };
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 StudyHub running at http://localhost:${PORT}`);
  console.log(`👑 Admin: "${ADMIN_NAME}"`);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

const https = require('https');
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    https.get(`${url}/health`, (res) => {
      console.log(`🔄 Self-ping: ${res.statusCode}`);
    }).on('error', () => {});
  }
}, 55 * 1000); // every 55 seconds