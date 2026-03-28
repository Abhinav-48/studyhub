/* ══════════════════════════════════════════════════
   StudyHub — Frontend App Logic
   ══════════════════════════════════════════════════ */

const ADMIN_NAME = 'admin';

let currentUser = null;
let allNotes = [];
let allQuestions = [];
let selectedFile = null;
const socket = io();

// ══════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════

document.getElementById('nameInput').addEventListener('input', (e) => {
  const val = e.target.value.trim().toLowerCase();
  const wrap = document.getElementById('adminPasswordWrap');
  if (val === ADMIN_NAME) wrap.classList.remove('hidden');
  else wrap.classList.add('hidden');
});

async function loginUser() {
  const input = document.getElementById('nameInput');
  const name = input.value.trim();
  if (!name || name.length < 2) {
    toast('Please enter at least 2 characters', 'error');
    return;
  }

  // Admin password check
  if (name.toLowerCase() === ADMIN_NAME) {
    const password = document.getElementById('adminPasswordInput').value;
    if (!password) { toast('Admin password required!', 'error'); return; }
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) { toast('❌ Wrong admin password!', 'error'); return; }
  }

  // Check if blocked BEFORE logging in
  if (name.toLowerCase() !== ADMIN_NAME) {
    const blockCheck = await fetch(`/api/check-blocked/${encodeURIComponent(name)}`);
    const blockData = await blockCheck.json();
    if (blockData.blocked) {
      toast('⛔ You have been blocked by the admin.', 'error');
      return;
    }
  }

  currentUser = name;
  localStorage.setItem('studyhub_user', name);

  // Save login history
  const device = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
  fetch('/api/login-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, device })
  });

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userInitial').textContent = name[0].toUpperCase();
  document.getElementById('userName').textContent = name;
  document.getElementById('noteAuthor').value = name;

  if (name.toLowerCase() === ADMIN_NAME) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  socket.emit('user_join', name);
  loadNotes();
  loadQuestions();
  loadAnnouncements();
  toast(`Welcome, ${name}! 👋`, 'success');
}

function logout() {
  localStorage.removeItem('studyhub_user');
  location.reload();
}

document.getElementById('nameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loginUser();
});

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('studyhub_user');
  if (saved && saved.toLowerCase() !== ADMIN_NAME) {
    document.getElementById('nameInput').value = saved;
    loginUser();
  }
  const savedTheme = localStorage.getItem('studyhub_theme') || 'light';
  setTheme(savedTheme);
});

// ══════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'admin') loadAdminPanel();
}

// ══════════════════════════════════════════════════
// NOTES
// ══════════════════════════════════════════════════

async function loadNotes() {
  const res = await fetch('/api/notes');
  allNotes = await res.json();
  renderNotes(allNotes);
}

function renderNotes(notes) {
  const grid = document.getElementById('notesGrid');
  const empty = document.getElementById('notesEmpty');
  grid.innerHTML = '';
  if (!notes.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  notes.forEach(note => grid.appendChild(buildNoteCard(note)));
}

function buildNoteCard(note) {
  const div = document.createElement('div');
  div.className = 'note-card';
  div.id = `note-${note.id}`;

  const typeInfo = getFileTypeInfo(note.fileType);
  const isAdmin = currentUser?.toLowerCase() === ADMIN_NAME;
  const size = formatBytes(note.fileSize);
  const date = new Date(note.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  div.innerHTML = `
    <div class="note-card-header">
      <span class="file-type-badge ${typeInfo.cls}">${typeInfo.emoji} ${typeInfo.label}</span>
      ${isAdmin ? `<div class="admin-actions"><button class="btn-danger" onclick="deleteNote('${note.id}')">🗑 Delete</button></div>` : ''}
    </div>
    <div class="note-title">${escHtml(note.title)}</div>
    <div class="note-meta">
      <span class="meta-tag">📚 ${escHtml(note.subject)}</span>
      <span class="meta-tag">👤 ${escHtml(note.author)}</span>
      <span class="meta-tag">📅 ${date}</span>
    </div>
    ${note.description ? `<div class="note-desc">${escHtml(note.description)}</div>` : ''}
    <div class="note-file-info">
      <span>${typeInfo.emoji}</span>
      <span class="note-file-name">${escHtml(note.fileName)}</span>
      <span>${size}</span>
    </div>
    <div class="note-card-footer">
      ${isAdmin && note.author.toLowerCase() !== ADMIN_NAME ? `<button class="btn-block" onclick="blockUser('${escHtml(note.author)}')">🚫 Block User</button>` : ''}
      <button class="btn-secondary" onclick="previewNote('${note.id}')">👁 Preview</button>
      <button class="btn-primary" onclick="downloadNote('${note.id}', '${note.fileUrl}', '${escHtml(note.fileName)}')">⬇ Download</button>
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text3);">
      <span>⬇ ${note.downloads} downloads</span>
    </div>
  `;
  return div;
}

function getFileTypeInfo(mime) {
  if (!mime) return { cls: 'type-other', emoji: '📄', label: 'FILE' };
  if (mime === 'application/pdf') return { cls: 'type-pdf', emoji: '📕', label: 'PDF' };
  if (mime.startsWith('image/')) return { cls: 'type-image', emoji: '🖼', label: 'IMAGE' };
  if (mime.startsWith('video/')) return { cls: 'type-video', emoji: '🎬', label: 'VIDEO' };
  if (mime.includes('word') || mime.includes('presentation') || mime.includes('powerpoint')) return { cls: 'type-doc', emoji: '📝', label: 'DOC' };
  return { cls: 'type-other', emoji: '📄', label: 'FILE' };
}

function filterNotes() {
  const search = document.getElementById('searchNotes').value.toLowerCase();
  const subject = document.getElementById('subjectFilter').value.toLowerCase();
  const type = document.getElementById('typeFilter').value;

  const normalize = s => (s || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  const searchNorm = normalize(search);

  const filtered = allNotes.filter(n => {
    const matchSearch = !search ||
      normalize(n.title).includes(searchNorm) ||
      normalize(n.author).includes(searchNorm) ||
      normalize(n.description).includes(searchNorm) ||
      normalize(n.subject).includes(searchNorm);
    const matchSubject = !subject || normalize(n.subject).includes(normalize(subject));
    const matchType = !type || (
      type === 'pdf' && n.fileType === 'application/pdf' ||
      type === 'image' && n.fileType.startsWith('image/') ||
      type === 'video' && n.fileType.startsWith('video/') ||
      type === 'doc' && (n.fileType.includes('word') || n.fileType.includes('presentation'))
    );
    return matchSearch && matchSubject && matchType;
  });
  renderNotes(filtered);
}

async function deleteNote(id) {
  if (!confirm('Delete this note permanently?')) return;
  const res = await fetch(`/api/notes/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) toast('Note deleted', 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function downloadNote(id, url, fileName) {
  await fetch(`/api/notes/${id}/download`, { method: 'POST' });
  const cleanName = fileName.endsWith('.pdf') ? fileName : fileName;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  toast(`Downloading "${cleanName}"`, 'success');
}

function previewNote(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  const typeInfo = getFileTypeInfo(note.fileType);
  let content = `
    <div class="preview-header">
      <h3>${escHtml(note.title)}</h3>
      <p>${typeInfo.emoji} ${escHtml(note.fileName)} &bull; ${escHtml(note.subject)} &bull; By ${escHtml(note.author)}</p>
    </div>
  `;

  if (note.fileType === 'application/pdf') {
    content += `
      <div style="margin-bottom:10px;display:flex;gap:8px;justify-content:flex-end;">
        <a href="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(note.fileUrl)}" target="_blank" class="btn-secondary" style="padding:7px 16px;text-decoration:none;font-size:0.85rem;">🔗 Open in New Tab</a>
        <button class="btn-primary" style="padding:7px 16px;font-size:0.85rem;" onclick="downloadNote('${note.id}','${note.fileUrl}','${escHtml(note.fileName)}')">⬇ Download</button>
      </div>
      <iframe src="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(note.fileUrl)}" style="width:100%;height:72vh;border:none;border-radius:10px;" allowfullscreen></iframe>
    `;
  } else if (note.fileType.startsWith('image/')) {
    content += `<img src="${note.fileUrl}" alt="${escHtml(note.title)}" />`;
  } else if (note.fileType.startsWith('video/')) {
    content += `<video src="${note.fileUrl}" controls style="width:100%;border-radius:10px;"></video>`;
  } else {
    content += `<div style="text-align:center;padding:40px;color:var(--text2);">
      <span style="font-size:3rem">${typeInfo.emoji}</span>
      <p style="margin-top:12px;">Preview not available for this file type.</p>
      <button class="btn-primary" style="margin-top:16px;" onclick="downloadNote('${note.id}','${note.fileUrl}','${escHtml(note.fileName)}')">⬇ Download to Open</button>
    </div>`;
  }

  document.getElementById('previewContent').innerHTML = content;
  openModal('previewModal');
}

// ══════════════════════════════════════════════════
// UPLOAD MODAL
// ══════════════════════════════════════════════════

function openUploadModal() {
  selectedFile = null;
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteDesc').value = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('dropInner').innerHTML = `
    <span class="drop-icon">📎</span>
    <p>Click or drag & drop your file here</p>
    <span class="file-types">PDF · JPG · PNG · MP4 · DOCX · PPTX · TXT</span>
  `;
  document.getElementById('uploadProgress').classList.add('hidden');
  openModal('uploadModal');
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) setSelectedFile(file);
}

function setSelectedFile(file) {
  selectedFile = file;
  const typeInfo = getFileTypeInfo(file.type);
  document.getElementById('dropInner').innerHTML = `
    <div class="file-selected">
      <span class="file-icon">${typeInfo.emoji}</span>
      <div>
        <div class="file-selected-name">${escHtml(file.name)}</div>
        <div class="file-selected-size">${formatBytes(file.size)}</div>
      </div>
    </div>
  `;
}

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

async function submitNote() {
  const title = document.getElementById('noteTitle').value.trim();
  const subject = document.getElementById('noteSubject').value;
  const description = document.getElementById('noteDesc').value.trim();

  if (!title) { toast('Please enter a title', 'error'); return; }
  if (!selectedFile) { toast('Please select a file', 'error'); return; }

  const formData = new FormData();
  formData.append('author', currentUser);
  formData.append('title', title);
  formData.append('subject', subject);
  formData.append('description', description);
  formData.append('file', selectedFile);

  const btn = document.getElementById('uploadBtn');
  btn.disabled = true; btn.textContent = 'Uploading...';
  document.getElementById('uploadProgress').classList.remove('hidden');

  let prog = 0;
  const interval = setInterval(() => {
    prog = Math.min(prog + Math.random() * 15, 85);
    document.getElementById('progressFill').style.width = prog + '%';
  }, 200);

  try {
    const res = await fetch('/api/notes', { method: 'POST', body: formData });
    clearInterval(interval);
    document.getElementById('progressFill').style.width = '100%';

    if (res.ok) {
      const data = await res.json();
      if (data.message) {
        document.getElementById('progressText').textContent = '⏳ Waiting for admin approval...';
        toast('Note submitted! Waiting for admin approval ⏳', 'success');
      } else {
        document.getElementById('progressText').textContent = 'Upload complete!';
        toast('Note uploaded successfully! 🎉', 'success');
      }
      closeModal('uploadModal');
    } else {
      const d = await res.json();
      toast(d.error || 'Upload failed', 'error');
    }
  } catch (err) {
    clearInterval(interval);
    toast('Upload failed. Check your connection.', 'error');
  }

  btn.disabled = false; btn.textContent = 'Upload Note 🚀';
}

// ══════════════════════════════════════════════════
// QUESTIONS
// ══════════════════════════════════════════════════

async function loadQuestions() {
  const res = await fetch('/api/questions');
  allQuestions = await res.json();
  renderQuestions();
}

function renderQuestions() {
  const list = document.getElementById('questionsList');
  const empty = document.getElementById('questionsEmpty');
  list.innerHTML = '';
  if (!allQuestions.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  allQuestions.forEach(q => list.appendChild(buildQuestionCard(q)));
}

function buildQuestionCard(q) {
  const div = document.createElement('div');
  div.className = 'question-card';
  div.id = `q-${q.id}`;
  const isAdmin = currentUser?.toLowerCase() === ADMIN_NAME;
  const date = new Date(q.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const initial = q.author[0].toUpperCase();

  let repliesHtml = '';
  if (q.replies && q.replies.length) {
    repliesHtml = `<div class="replies-section">
      <h5>💬 ${q.replies.length} Reply${q.replies.length > 1 ? 'ies' : ''}</h5>
      ${q.replies.map(r => `
        <div class="reply-item">
          <div class="reply-avatar">${r.author[0].toUpperCase()}</div>
          <div class="reply-body">
            <div class="reply-author">${escHtml(r.author)}</div>
            <div class="reply-text">${escHtml(r.text)}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  div.innerHTML = `
    <div class="question-header">
      <div class="q-author">
        <div class="q-avatar">${initial}</div>
        <div>
          <div class="q-author-name">${escHtml(q.author)}</div>
          <div class="q-time">${date}</div>
        </div>
      </div>
      ${isAdmin ? `<button class="btn-danger" onclick="deleteQuestion('${q.id}')">🗑 Delete</button>` : ''}
    </div>
    <div class="q-text">${escHtml(q.text)}</div>
    ${repliesHtml}
    <div class="q-actions">
      <button class="btn-reply" onclick="openReplyModal('${q.id}', \`${escHtml(q.text).replace(/`/g, "'")}\`)">💬 Reply</button>
      ${isAdmin && q.author.toLowerCase() !== ADMIN_NAME ? `<button class="btn-block" onclick="blockUser('${escHtml(q.author)}')">🚫 Block User</button>` : ''}
    </div>
  `;
  return div;
}

function openQuestionModal() {
  document.getElementById('questionText').value = '';
  openModal('questionModal');
}

async function submitQuestion() {
  const text = document.getElementById('questionText').value.trim();
  if (!text) { toast('Please type your question', 'error'); return; }
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: currentUser, text })
  });
  if (res.ok) { toast('Question posted! 📮', 'success'); closeModal('questionModal'); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

function openReplyModal(questionId, questionText) {
  document.getElementById('replyQuestionId').value = questionId;
  document.getElementById('replyQuestionText').textContent = questionText;
  document.getElementById('replyText').value = '';
  openModal('replyModal');
}

async function submitReply() {
  const text = document.getElementById('replyText').value.trim();
  const questionId = document.getElementById('replyQuestionId').value;
  if (!text) { toast('Please type your reply', 'error'); return; }
  const res = await fetch(`/api/questions/${questionId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: currentUser, text })
  });
  if (res.ok) { toast('Reply posted! ✅', 'success'); closeModal('replyModal'); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) return;
  const res = await fetch(`/api/questions/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) toast('Question deleted', 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

// ══════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════

async function blockUser(targetUser) {
  if (!confirm(`Block "${targetUser}"? They won't be able to upload or post.`)) return;
  const res = await fetch('/api/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, targetUser })
  });
  if (res.ok) toast(`${targetUser} has been blocked 🚫`, 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function unblockUser() {
  const name = document.getElementById('unblockInput').value.trim();
  if (!name) { toast('Enter a username', 'error'); return; }
  const res = await fetch('/api/unblock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, targetUser: name })
  });
  if (res.ok) {
    toast(`${name} unblocked ✅`, 'success');
    document.getElementById('unblockInput').value = '';
    loadAdminPanel();
  } else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadAdminPanel() {
  const blocked = await (await fetch('/api/blocked')).json();

  const blockedList = document.getElementById('blockedList');
  if (blocked.length) {
    blockedList.innerHTML = blocked.map(u => `
      <div class="admin-user-item">
        <span>🚫 ${escHtml(u)}</span>
        <button class="btn-secondary" onclick="quickUnblock('${escHtml(u)}')">Unblock</button>
      </div>`).join('');
  } else {
    blockedList.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No blocked users</div>';
  }

  await loadPendingNotes();
  await loadLoginHistory();
  await loadAdminMessages();
  await loadAnnouncements();

  document.getElementById('statNotes').textContent = allNotes.length;
  document.getElementById('statQuestions').textContent = allQuestions.length;
  document.getElementById('statBlocked').textContent = blocked.length;
}

async function loadPendingNotes() {
  const res = await fetch('/api/notes/pending');
  const pending = await res.json();
  const container = document.getElementById('pendingNotesList');
  if (!container) return;
  const statPending = document.getElementById('statPending');
  if (statPending) statPending.textContent = pending.length;

  if (!pending.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No pending notes ✅</div>';
    return;
  }

  container.innerHTML = pending.map(note => `
    <div class="admin-user-item" style="flex-direction:column;align-items:flex-start;gap:8px;padding:14px;">
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
        <strong>${escHtml(note.title)}</strong>
        <span style="font-size:0.78rem;color:var(--text3);">${escHtml(note.subject)}</span>
      </div>
      <div style="font-size:0.82rem;color:var(--text2);">By: ${escHtml(note.author)} • ${escHtml(note.fileName)}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" style="padding:6px 16px;font-size:0.82rem;" onclick="approveNote('${note.id}')">✅ Approve</button>
        <button class="btn-danger" onclick="rejectNote('${note.id}')">❌ Reject</button>
      </div>
    </div>
  `).join('');
}

async function approveNote(id) {
  const res = await fetch(`/api/notes/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) { toast('Note approved! ✅', 'success'); loadPendingNotes(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function rejectNote(id) {
  if (!confirm('Reject and delete this note?')) return;
  const res = await fetch(`/api/notes/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) { toast('Note rejected ❌', 'success'); loadPendingNotes(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadLoginHistory() {
  const res = await fetch('/api/login-history');
  const history = await res.json();
  const container = document.getElementById('loginHistoryList');
  if (!container) return;
  if (!history.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No login history yet</div>';
    return;
  }
  container.innerHTML = history.map(h => {
    const date = new Date(h.logged_in_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="admin-user-item">
        <div>
          <strong style="font-size:0.88rem;">${escHtml(h.username)}</strong>
          <span style="font-size:0.75rem;color:var(--text3);margin-left:8px;">${h.device === 'Mobile' ? '📱' : '💻'} ${h.device}</span>
        </div>
        <span style="font-size:0.78rem;color:var(--text3);">${date}</span>
      </div>
    `;
  }).join('');
}

async function quickUnblock(name) {
  await fetch('/api/unblock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, targetUser: name })
  });
  toast(`${name} unblocked`, 'success');
  loadAdminPanel();
}

// ══════════════════════════════════════════════════
// ANNOUNCEMENTS
// ══════════════════════════════════════════════════

let dismissedAnnouncements = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');

async function loadAnnouncements() {
  const res = await fetch('/api/announcements');
  const announcements = await res.json();
  const banner = document.getElementById('announcementBanner');

  const visible = announcements.filter(a => !dismissedAnnouncements.includes(a.id));
  if (visible.length > 0) {
    const latest = visible[0];
    banner.innerHTML = `
      <span class="announcement-text">📢 ${escHtml(latest.message)}</span>
      <button class="announcement-close" onclick="dismissAnnouncement('${latest.id}')">✕ Dismiss</button>
    `;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  const container = document.getElementById('announcementsList');
  if (!container) return;
  if (!announcements.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No announcements yet</div>';
    return;
  }
  container.innerHTML = announcements.map(a => {
    const date = new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="announcement-item">
        <span class="announcement-item-text">${escHtml(a.message)}</span>
        <span class="announcement-item-time">${date}</span>
        ${currentUser?.toLowerCase() === ADMIN_NAME ? `<button class="btn-danger" onclick="deleteAnnouncement('${a.id}')" style="padding:5px 10px;font-size:0.78rem;">🗑</button>` : ''}
      </div>
    `;
  }).join('');
}

function dismissAnnouncement(id) {
  dismissedAnnouncements.push(id);
  localStorage.setItem('dismissed_announcements', JSON.stringify(dismissedAnnouncements));
  document.getElementById('announcementBanner').classList.add('hidden');
}

async function postAnnouncement() {
  const text = document.getElementById('announcementText').value.trim();
  if (!text) { toast('Please type an announcement', 'error'); return; }
  const res = await fetch('/api/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, message: text })
  });
  if (res.ok) {
    toast('Announcement posted! 📢', 'success');
    document.getElementById('announcementText').value = '';
    loadAnnouncements();
  } else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await fetch(`/api/announcements/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  toast('Announcement deleted', 'success');
  loadAnnouncements();
}

// ══════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════

function openMessageModal() {
  document.getElementById('messageText').value = '';
  loadMyReplies();
  openModal('messageModal');
}

async function sendMessage() {
  const text = document.getElementById('messageText').value.trim();
  if (!text) { toast('Please type a message', 'error'); return; }
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_user: currentUser, message: text })
  });
  if (res.ok) {
    toast('Message sent to admin! 📨', 'success');
    document.getElementById('messageText').value = '';
    loadMyReplies();
  } else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadMyReplies() {
  const container = document.getElementById('myReplies');
  if (!container) return;
  const res = await fetch(`/api/messages/${encodeURIComponent(currentUser)}`);
  const messages = await res.json();
  if (!messages.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<h4 style="font-size:0.9rem;margin-bottom:10px;color:var(--text2);">Your Previous Messages:</h4>` +
    messages.map(m => {
      const date = new Date(m.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="message-item ${m.reply ? 'has-reply' : ''}">
          <div class="message-text">${escHtml(m.message)}</div>
          <div class="message-time">${date}</div>
          ${m.reply ? `<div class="message-reply-box">👑 Admin: ${escHtml(m.reply)}</div>` : '<div style="font-size:0.78rem;color:var(--text3);margin-top:6px;">⏳ Waiting for reply...</div>'}
        </div>
      `;
    }).join('');
}

async function loadAdminMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;
  const res = await fetch('/api/messages');
  const messages = await res.json();
  if (!messages.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No messages yet</div>';
    return;
  }
  container.innerHTML = messages.map(m => {
    const date = new Date(m.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="message-item ${m.reply ? 'has-reply' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="message-from">👤 ${escHtml(m.from_user)}</div>
          <div style="display:flex;gap:6px;">
            <button class="btn-reply" onclick="openAdminReply('${m.id}','${escHtml(m.message).replace(/'/g,'&#39;')}')" style="padding:5px 12px;font-size:0.78rem;">↩️ Reply</button>
            <button class="btn-danger" onclick="deleteMessage('${m.id}')" style="padding:5px 10px;font-size:0.78rem;">🗑</button>
          </div>
        </div>
        <div class="message-text">${escHtml(m.message)}</div>
        <div class="message-time">${date}</div>
        ${m.reply ? `<div class="message-reply-box">Your reply: ${escHtml(m.reply)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function openAdminReply(msgId, msgText) {
  document.getElementById('adminReplyMsgId').value = msgId;
  document.getElementById('adminReplyPreview').textContent = msgText;
  document.getElementById('adminReplyText').value = '';
  openModal('adminReplyModal');
}

async function sendAdminReply() {
  const reply = document.getElementById('adminReplyText').value.trim();
  const msgId = document.getElementById('adminReplyMsgId').value;
  if (!reply) { toast('Please type a reply', 'error'); return; }
  const res = await fetch(`/api/messages/${msgId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, reply })
  });
  if (res.ok) {
    toast('Reply sent! ✅', 'success');
    closeModal('adminReplyModal');
    loadAdminMessages();
  } else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteMessage(id) {
  if (!confirm('Delete this message?')) return;
  await fetch(`/api/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  toast('Message deleted', 'success');
  loadAdminMessages();
}

// ══════════════════════════════════════════════════
// SOCKET.IO REAL-TIME
// ══════════════════════════════════════════════════

socket.on('new_pending_note', () => {
  if (currentUser?.toLowerCase() === ADMIN_NAME) {
    toast('📋 New note waiting for approval!', '');
    loadPendingNotes();
  }
});

socket.on('note_approved', () => { loadNotes(); });
socket.on('note_rejected', () => { loadPendingNotes(); });

socket.on('new_note', (note) => {
  allNotes.unshift(note);
  const grid = document.getElementById('notesGrid');
  const card = buildNoteCard(note);
  grid.insertBefore(card, grid.firstChild);
  document.getElementById('notesEmpty').classList.add('hidden');
  if (note.author !== currentUser) toast(`📤 New note: "${note.title}" by ${note.author}`);
  updateAdminStats();
});

socket.on('note_deleted', (id) => {
  allNotes = allNotes.filter(n => n.id !== id);
  const el = document.getElementById(`note-${id}`);
  if (el) el.remove();
  updateAdminStats();
});

socket.on('note_updated', (note) => {
  const idx = allNotes.findIndex(n => n.id === note.id);
  if (idx !== -1) allNotes[idx] = note;
  const el = document.getElementById(`note-${note.id}`);
  if (el) el.replaceWith(buildNoteCard(note));
});

socket.on('new_question', (q) => {
  allQuestions.unshift(q);
  const list = document.getElementById('questionsList');
  const card = buildQuestionCard(q);
  list.insertBefore(card, list.firstChild);
  document.getElementById('questionsEmpty').classList.add('hidden');
  if (q.author !== currentUser) toast(`💬 New question from ${q.author}`);
  updateAdminStats();
});

socket.on('question_deleted', (id) => {
  allQuestions = allQuestions.filter(q => q.id !== id);
  const el = document.getElementById(`q-${id}`);
  if (el) el.remove();
});

socket.on('new_reply', ({ questionId, reply }) => {
  const q = allQuestions.find(q => q.id === questionId);
  if (q) {
    q.replies = q.replies || [];
    q.replies.push(reply);
    const el = document.getElementById(`q-${questionId}`);
    if (el) el.replaceWith(buildQuestionCard(q));
    if (reply.author !== currentUser) toast(`💬 ${reply.author} replied to a question`);
  }
});

socket.on('online_users', (users) => {
  document.getElementById('onlineCount').textContent = users.length;
  document.getElementById('statOnline').textContent = users.length;
  const adminList = document.getElementById('adminUserList');
  if (adminList) {
    adminList.innerHTML = users.map(u => `
      <div class="admin-user-item">
        <span>🟢 ${escHtml(u)}</span>
        ${u.toLowerCase() !== ADMIN_NAME && currentUser?.toLowerCase() === ADMIN_NAME
          ? `<button class="btn-block" onclick="blockUser('${escHtml(u)}')">Block</button>` : ''}
      </div>`).join('') || '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No users online</div>';
  }
});

socket.on('user_blocked', (username) => {
  if (currentUser?.toLowerCase() === username) {
    toast('⛔ You have been blocked by the admin.', 'error');
  }
});

socket.on('new_announcement', (announcement) => {
  if (!dismissedAnnouncements.includes(announcement.id)) {
    const banner = document.getElementById('announcementBanner');
    banner.innerHTML = `
      <span class="announcement-text">📢 ${escHtml(announcement.message)}</span>
      <button class="announcement-close" onclick="dismissAnnouncement('${announcement.id}')">✕ Dismiss</button>
    `;
    banner.classList.remove('hidden');
  }
  loadAnnouncements();
});

socket.on('announcement_deleted', () => { loadAnnouncements(); });

socket.on('new_message', () => {
  if (currentUser?.toLowerCase() === ADMIN_NAME) {
    toast('📬 New message from a user!', '');
    loadAdminMessages();
  }
});

socket.on('message_reply', (msg) => {
  if (msg.from_user === currentUser) {
    toast('📬 Admin replied to your message!', 'success');
    loadMyReplies();
  }
});

// ══════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOnBg(e, id) { if (e.target === e.currentTarget) closeModal(id); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['uploadModal', 'questionModal', 'replyModal', 'previewModal', 'messageModal', 'adminReplyModal'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
  }
});

// ══════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function formatBytes(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function updateAdminStats() {
  document.getElementById('statNotes').textContent = allNotes.length;
  document.getElementById('statQuestions').textContent = allQuestions.length;
}

// ══════════════════════════════════════════════════
// THEME SWITCHER
// ══════════════════════════════════════════════════

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
  localStorage.setItem('studyhub_theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.theme-btn-${theme}`);
  if (activeBtn) activeBtn.classList.add('active');
}