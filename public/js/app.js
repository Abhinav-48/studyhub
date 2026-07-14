/* ══════════════════════════════════════════════════
   StudyHub — Frontend App Logic
   ══════════════════════════════════════════════════ */

const ADMIN_NAME = 'admin';
const SUPERADMIN_NAME = 'abhinav8112';

function isAdminUser() {
  const n = currentUser?.toLowerCase();
  return n === ADMIN_NAME || n === SUPERADMIN_NAME;
}

let currentUser = null;
let isSuperAdmin = false;
let allNotes = [];
let allQuestions = [];
let selectedFile = null;
let currentQuiz = null;
let quizAnswers = {};
const socket = io();

// ══════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════

document.getElementById('nameInput').addEventListener('input', (e) => {
  const val = e.target.value.trim().toLowerCase();
  const wrap = document.getElementById('adminPasswordWrap');
  if (val === ADMIN_NAME || val === SUPERADMIN_NAME) wrap.classList.remove('hidden');
  else wrap.classList.add('hidden');
});

async function loginUser() {
  const input = document.getElementById('nameInput');
  const name = input.value.trim();
  if (!name || name.length < 2) { toast('Please enter your student name as per college records', 'error'); return; }

  if (name.toLowerCase() === ADMIN_NAME) {
    const password = document.getElementById('adminPasswordInput').value;
    if (!password) { toast('Admin password required!', 'error'); return; }
    const res = await fetch('/api/admin-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast('❌ ' + (d.error || 'Wrong admin password!'), 'error'); return; }
  }

  if (name.toLowerCase() === SUPERADMIN_NAME) {
    const password = document.getElementById('adminPasswordInput').value;
    if (!password) { toast('Password required!', 'error'); return; }
    const res = await fetch('/api/superadmin-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) { toast('❌ Wrong password!', 'error'); return; }
    isSuperAdmin = true;
  }

  if (name.toLowerCase() !== ADMIN_NAME) {
    const blockCheck = await fetch(`/api/check-blocked/${encodeURIComponent(name)}`);
    const blockData = await blockCheck.json();
    if (blockData.blocked) { toast('⛔ You have been blocked by the admin.', 'error'); return; }
  }

  currentUser = name;
  localStorage.setItem('studyhub_user', name);

  const device = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
  fetch('/api/login-history', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, device })
  });

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userInitial').textContent = name[0].toUpperCase();
  document.getElementById('userName').textContent = name.toLowerCase() === SUPERADMIN_NAME ? 'Super Admin' : name;
  document.getElementById('noteAuthor').value = name;

  if (name.toLowerCase() === ADMIN_NAME || name.toLowerCase() === SUPERADMIN_NAME) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
  if (isSuperAdmin) {
    document.querySelectorAll('.superadmin-only').forEach(el => el.classList.remove('hidden'));
    loadAdminSettings();
  }

  socket.emit('user_join', name);
  await loadCoursesForUpload();
  setupPushNotifications();
  loadNotes();
  loadQuestions();
  loadAnnouncements();
  loadHomeWidgets();
  toast(`Welcome, ${name}! 👋`, 'success');
  updateStudyStreak();
}

function logout() { stopStudyTimer(); localStorage.removeItem('studyhub_user'); location.reload(); }

document.getElementById('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithValidation ? loginWithValidation() : loginUser(); });

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('studyhub_user');
  if (saved && saved.toLowerCase() !== ADMIN_NAME) {
    const FAKE_NAMES = ['hulk','superman','batman','spiderman','thor','naruto','goku','sasuke','ironman','xyz','abc','aaa','zzz','asdf','qwerty','zxcv','test','user','hello','guest','noname','anonymous','foo','bar'];
    const lower = saved.toLowerCase().replace(/\s/g,'');
    const keyboardPatterns = /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i;
    const nameParts = saved.trim().toLowerCase().split(/\s+/);
    const hasRepeatedWords = nameParts.length > 1 && new Set(nameParts).size !== nameParts.length;
    const isInvalid =
      saved.length < 3 ||
      !/^[a-zA-Z\u0900-\u097F\s]+$/.test(saved) ||
      FAKE_NAMES.includes(lower) ||
      /^(.)\1+$/i.test(saved.replace(/\s/g,'')) ||
      keyboardPatterns.test(saved.replace(/\s/g,'')) ||
      hasRepeatedWords;
    if (isInvalid) {
      localStorage.removeItem('studyhub_user');
    } else {
      document.getElementById('nameInput').value = saved;
      loginUser();
    }
  }
  const savedTheme = localStorage.getItem('studyhub_theme') || 'light';
  setTheme(savedTheme);
});

// ══════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════

let isRestoringNav = false;

function pushNavState() {
  if (isRestoringNav) return;
  const state = {
    tab: document.querySelector('.nav-tab.active')?.dataset.tab || 'notes',
    noteCourse: currentNoteCourse, noteSubject: currentNoteSubject,
    ttSection: typeof currentTimetableSection !== 'undefined' ? currentTimetableSection : null
  };
  history.pushState(state, '');
}

window.addEventListener('popstate', (e) => {
  if (!e.state) return;
  isRestoringNav = true;
  const s = e.state;
  switchTab(s.tab);
  if (s.tab === 'notes') {
    if (s.noteSubject) { currentNoteCourse = s.noteCourse; openNoteSubject(s.noteSubject); }
    else if (s.noteCourse) { openNoteCourse(s.noteCourse); }
    else { renderNoteCourses(); }
  }
  if (s.tab === 'timetable') {
    if (s.ttSection) { openTimetableSection(s.ttSection); }
    else { renderTimetableSections(); }
  }
  isRestoringNav = false;
});

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-tab, .mnav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.add('active'));
  if (tab === 'admin') loadAdminPanel();
  if (tab === 'planner') loadPlanner();
  if (tab === 'quiz') loadQuizList();
  if (tab === 'timetable') loadTimetables();
  if (tab === 'notes') loadHomeWidgets();
  pushNavState();
}

// ══════════════════════════════════════════════════
// HOME WIDGETS (News & Exam Dates)
// ══════════════════════════════════════════════════

async function loadHomeWidgets() {
  try {
    const [annRes, evRes, linkRes] = await Promise.all([fetch('/api/announcements'), fetch('/api/events'), fetch('/api/links')]);
    const links = await linkRes.json();
    const linksList = document.getElementById('linksWidgetList');
    if (linksList) {
      linksList.innerHTML = links.length ? links.slice(0, 5).map(l => `
        <div class="news-widget-item">
          <span class="news-dot"></span>
          <a href="${l.url}" target="_blank" class="news-widget-text" style="color:var(--accent);text-decoration:none;">${escHtml(l.title)}</a>
        </div>${l.description ? `<div style="font-size:0.75rem;color:var(--text3);margin:-4px 0 4px 15px;">${escHtml(l.description)}</div>` : ''}`
      ).join('') : `<div class="news-widget-empty">No links yet</div>`;
    }
    const announcements = await annRes.json();
    const events = await evRes.json();

    const widget = document.getElementById('newsNoticeWidget');
    const newsList = document.getElementById('newsWidgetList');
    const examList = document.getElementById('examWidgetList');
    if (!widget) return;

    const latestNews = announcements.slice(0, 3);
    newsList.innerHTML = latestNews.length ? latestNews.map(a => {
      const date = new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const attach = a.attachment_url ? ` <a href="javascript:void(0)" onclick="openAttachment('${a.attachment_url}','${a.id}','ann')" style="color:var(--accent);">📎</a>` : '';
      return `<div class="news-widget-item"><span class="news-dot"></span><span class="news-widget-text">${escHtml(a.message)}${attach}</span><span class="news-widget-date">${date}</span></div>`;
    }).join('') : `<div class="news-widget-empty">No news yet</div>`;

    const today = new Date(); today.setHours(0,0,0,0);
    const upcomingExams = events.filter(e => e.event_type === 'exam' && new Date(e.event_date) >= today)
      .sort((a,b) => new Date(a.event_date) - new Date(b.event_date)).slice(0, 3);
    examList.innerHTML = upcomingExams.length ? upcomingExams.map(e => {
      const evDate = new Date(e.event_date);
      const diffDays = Math.ceil((evDate - today) / (1000*60*60*24));
      const dateStr = evDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const attach = e.attachment_url ? ` <a href="javascript:void(0)" onclick="openAttachment('${e.attachment_url}','${e.id}','event')" style="color:var(--accent);">📎</a>` : '';
      return `<div class="news-widget-item"><span class="exam-dot"></span><span class="news-widget-text">${escHtml(e.title)} (${escHtml(e.subject)})${attach}</span><span class="news-widget-date">${dateStr} · ${diffDays === 0 ? 'Today' : diffDays + 'd left'}</span></div>`;
    }).join('') : `<div class="news-widget-empty">No exams scheduled</div>`;

    widget.classList.remove('hidden');
  } catch {}
}

// ══════════════════════════════════════════════════
// NOTES
// ══════════════════════════════════════════════════

async function loadNotes() {
  const res = await fetch('/api/notes');
  allNotes = await res.json();
  if (currentNoteSubject) { openNoteSubject(currentNoteSubject); }
  else if (currentNoteCourse) { openNoteCourse(currentNoteCourse); }
  else { renderNoteCourses(); }
}

let currentNoteCourse = null;
let currentNoteSubject = null;
let allCourses = [];
let currentCourseSubjects = [];

async function loadCoursesForUpload() {
  const res = await fetch('/api/courses');
  allCourses = await res.json();
  const sel = document.getElementById('noteCourse');
  if (sel) sel.innerHTML = allCourses.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');
}

async function renameCourse(id, oldName) {
  const newName = prompt('Enter new folder name:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const res = await fetch(`/api/courses/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, name: newName.trim() })
  });
  if (res.ok) { toast('Folder renamed! ✅', 'success'); await loadCoursesForUpload(); loadNotes(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

function showFolderContextMenu(e, id, name) {
  e.preventDefault();
  e.stopPropagation();
  if (!isAdminUser()) return;
  document.getElementById('folderCtxMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'folderCtxMenu';
  menu.className = 'folder-ctx-menu';
  const rect = e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null;
  let top = rect ? rect.bottom : e.clientY;
  let left = rect ? rect.left : e.clientX;
  // keep menu inside viewport
  const menuHeight = 90, menuWidth = 150;
  if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight;
  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  const safeName = name.replace(/'/g,"\\'");
  menu.innerHTML = `
    <button onclick="renameCourse('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();">✏️ Rename</button>
    <button onclick="deleteCourse('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();" style="color:#d9534f;">🗑 Delete</button>
  `;
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      document.getElementById('folderCtxMenu')?.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 0);
}

async function deleteCourse(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/courses/${id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) { toast('Folder deleted 🗑', 'success'); await loadCoursesForUpload(); loadNotes(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function openAddFolderPrompt() {
  const name = prompt('Enter new folder name:');
  if (!name || !name.trim()) return;
  const res = await fetch('/api/courses', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, name: name.trim() })
  });
  if (res.ok) {
    toast('Folder added! 📁 Opening it now...', 'success');
    await loadCoursesForUpload();
    await loadNotes();
    openNoteCourse(name.trim());
  }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

function renderNoteCourses() {
  document.getElementById('notesSubjectsView')?.classList.add('hidden');
  document.getElementById('notesFilesView')?.classList.add('hidden');
  const grid = document.getElementById('notesCoursesGrid');
  const empty = document.getElementById('notesCoursesEmpty');
  if (!grid) return;
  grid.classList.remove('hidden');
  document.getElementById('notesBreadcrumb').textContent = 'Select your course to browse notes';

  const courses = allCourses.length ? allCourses.map(c => c.name) : [...new Set(allNotes.map(n => n.course || 'BCA 6th Sem'))];
  const isAdmin = isAdminUser();

  if (!courses.length && !isAdmin) { empty.classList.remove('hidden'); grid.innerHTML = ''; return; }
  empty.classList.add('hidden');

  let html = courses.map(c => {
    const dbCourse = allCourses.find(x => x.name === c);
    const count = allNotes.filter(n => (n.course || 'BCA 6th Sem') === c).length;
    const safeC = escHtml(c).replace(/'/g, "\\'");
    return `
      <div class="note-card course-card" style="position:relative;">
        ${isAdmin && dbCourse ? `<button onclick="showFolderContextMenu(event,'${dbCourse.id}','${safeC}')" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2);padding:2px 8px;">⋮</button>` : ''}
        <div style="cursor:pointer;" onclick="openNoteCourse('${safeC}')">
          <div class="note-title">🎓 ${escHtml(c)}</div>
          <div class="note-meta"><span class="meta-tag">${count} note${count === 1 ? '' : 's'}</span></div>
        </div>
      </div>`;
  }).join('');

  if (isAdmin) {
    html += `
      <div class="note-card" style="cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:90px;border:2px dashed var(--border);" onclick="openAddFolderPrompt()">
        <div style="text-align:center;color:var(--text2);">
          <div style="font-size:1.6rem;">➕</div>
          <div style="font-size:0.85rem;margin-top:4px;">Add Folder</div>
        </div>
      </div>`;
  }

  grid.innerHTML = html;
}

async function openNoteCourse(course) {
  currentNoteCourse = course;
  currentNoteSubject = null;
  pushNavState();
  document.getElementById('notesCoursesGrid').classList.add('hidden');
  document.getElementById('notesFilesView').classList.add('hidden');
  document.getElementById('notesSubjectsView').classList.remove('hidden');
  document.getElementById('notesBreadcrumb').textContent = `🎓 ${course} — select a subject`;

  const grid = document.getElementById('notesSubjectsGrid');
  const empty = document.getElementById('notesSubjectsEmpty');

  const res = await fetch(`/api/subjects?course=${encodeURIComponent(course)}`);
  currentCourseSubjects = await res.json();

  const derivedNames = [...new Set(allNotes.filter(n => (n.course || '6th Sem') === course).map(n => n.subject || 'General'))];
  const dbNames = currentCourseSubjects.map(s => s.name);
  const allNames = [...new Set([...dbNames, ...derivedNames])].sort();
  const isAdmin = isAdminUser();

  if (!allNames.length && !isAdmin) { empty.classList.remove('hidden'); grid.innerHTML = ''; return; }
  empty.classList.add('hidden');

  let html = allNames.map(sub => {
    const dbSub = currentCourseSubjects.find(s => s.name === sub);
    const count = allNotes.filter(n => (n.course || '6th Sem') === course && (n.subject || 'General') === sub).length;
    const safeSub = escHtml(sub).replace(/'/g, "\\'");
    return `
      <div class="note-card course-card" style="position:relative;">
        ${isAdmin && dbSub ? `<button onclick="showSubjectContextMenu(event,'${dbSub.id}','${safeSub}')" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2);padding:2px 8px;">⋮</button>` : ''}
        <div style="cursor:pointer;" onclick="openNoteSubject('${safeSub}')">
          <div class="note-title">📚 ${escHtml(sub)}</div>
          <div class="note-meta"><span class="meta-tag">${count} note${count === 1 ? '' : 's'}</span></div>
        </div>
      </div>`;
  }).join('');

  if (isAdmin) {
    html += `
      <div class="note-card" style="cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:90px;border:2px dashed var(--border);" onclick="addSubjectFolderPrompt()">
        <div style="text-align:center;color:var(--text2);">
          <div style="font-size:1.6rem;">➕</div>
          <div style="font-size:0.85rem;margin-top:4px;">Add Folder</div>
        </div>
      </div>`;
  }

  grid.innerHTML = html;
}

async function addSubjectFolderPrompt() {
  const name = prompt('Enter new subject folder name:');
  if (!name || !name.trim()) return;
  const res = await fetch('/api/subjects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, course: currentNoteCourse, name: name.trim() })
  });
  if (res.ok) {
    toast('Subject folder added! 📁 Opening it now...', 'success');
    openNoteSubject(name.trim());
  }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function renameSubject(id, oldName) {
  const newName = prompt('Enter new subject name:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const res = await fetch(`/api/subjects/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, name: newName.trim() })
  });
  if (res.ok) { toast('Subject renamed! ✅', 'success'); await loadNotes(); openNoteCourse(currentNoteCourse); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteSubject(id, name) {
  if (!confirm(`Delete subject "${name}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/subjects/${id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) { toast('Subject deleted 🗑', 'success'); openNoteCourse(currentNoteCourse); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

function showSubjectContextMenu(e, id, name) {
  e.preventDefault();
  e.stopPropagation();
  if (!isAdminUser()) return;
  document.getElementById('folderCtxMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'folderCtxMenu';
  menu.className = 'folder-ctx-menu';
  const rect = e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null;
  let top = rect ? rect.bottom : e.clientY;
  let left = rect ? rect.left : e.clientX;
  const menuHeight = 90, menuWidth = 150;
  if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight;
  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  const safeName = name.replace(/'/g,"\\'");
  menu.innerHTML = `
    <button onclick="renameSubject('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();">✏️ Rename</button>
    <button onclick="deleteSubject('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();" style="color:#d9534f;">🗑 Delete</button>
  `;
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      document.getElementById('folderCtxMenu')?.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 0);
}

function openNoteSubject(subject) {
  currentNoteSubject = subject;
  pushNavState();
  document.getElementById('notesSubjectsView').classList.add('hidden');
  document.getElementById('notesFilesView').classList.remove('hidden');
  document.getElementById('notesSubjectTitle').textContent = `📚 ${subject}`;
  document.getElementById('notesBreadcrumb').textContent = `🎓 ${currentNoteCourse} → 📚 ${subject}`;
  document.getElementById('searchNotes').value = '';
  document.getElementById('typeFilter').value = '';
  filterNotes();
}

function backToNoteCourses() {
  currentNoteCourse = null;
  currentNoteSubject = null;
  renderNoteCourses();
  pushNavState();
}

function backToNoteSubjects() {
  currentNoteSubject = null;
  openNoteCourse(currentNoteCourse);
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
  const isAdmin = isAdminUser();
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
  const type = document.getElementById('typeFilter').value;
  const normalize = s => (s || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  const searchNorm = normalize(search);
  const scoped = allNotes.filter(n => (n.course || '6th Sem') === currentNoteCourse && (n.subject || 'General') === currentNoteSubject);
  const filtered = scoped.filter(n => {
    const matchSearch = !search || normalize(n.title).includes(searchNorm) || normalize(n.author).includes(searchNorm) || normalize(n.description).includes(searchNorm) || normalize(n.subject).includes(searchNorm);
    const matchType = !type || (type === 'pdf' && n.fileType === 'application/pdf' || type === 'image' && n.fileType.startsWith('image/') || type === 'video' && n.fileType.startsWith('video/') || type === 'doc' && (n.fileType.includes('word') || n.fileType.includes('presentation')));
    return matchSearch && matchType;
  });
  renderNotes(filtered);
}

async function deleteNote(id) {
  if (!confirm('Delete this note permanently?')) return;
  const res = await fetch(`/api/notes/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) toast('Note deleted', 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function downloadNote(id, url, fileName) {
  await fetch(`/api/notes/${id}/download`, { method: 'POST' });
  const cleanName = fileName;
  if (url.startsWith('b2://') || url.startsWith('placeholder')) {
    try {
      const sres = await fetch(`/api/notes/${id}/signed-url`);
      const sdata = await sres.json();
      url = sdata.url;
    } catch { toast('Failed to get file link', 'error'); return; }
  }
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl; link.download = cleanName;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    const link = document.createElement('a');
    link.href = url; link.download = cleanName; link.target = '_blank';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }
  toast(`Downloading "${cleanName}"`, 'success');
}

async function previewNote(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;
  let fileUrl = note.fileUrl;
  if (fileUrl.startsWith('b2://')) {
    try {
      const sres = await fetch(`/api/notes/${id}/signed-url`);
      const sdata = await sres.json();
      fileUrl = sdata.url;
    } catch { toast('Failed to load preview', 'error'); return; }
  }
  const typeInfo = getFileTypeInfo(note.fileType);
  let content = `<div class="preview-header"><h3>${escHtml(note.title)}</h3><p>${typeInfo.emoji} ${escHtml(note.fileName)} &bull; ${escHtml(note.subject)} &bull; By ${escHtml(note.author)}</p></div>`;
  if (note.fileType === 'application/pdf') {
    content += `
      <div style="margin-bottom:10px;display:flex;gap:8px;justify-content:flex-end;">
        <a href="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(fileUrl)}" target="_blank" class="btn-secondary" style="padding:7px 16px;text-decoration:none;font-size:0.85rem;">🔗 Open in New Tab</a>
        <button class="btn-primary" style="padding:7px 16px;font-size:0.85rem;" onclick="downloadNote('${note.id}','${note.fileUrl}','${escHtml(note.fileName)}')">⬇ Download</button>
      </div>
      <iframe src="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(fileUrl)}" style="width:100%;height:72vh;border:none;border-radius:10px;" allowfullscreen></iframe>`;
  } else if (note.fileType.startsWith('image/')) {
    content += `<img src="${fileUrl}" alt="${escHtml(note.title)}" />`;
  } else if (note.fileType.startsWith('video/')) {
    content += `<video src="${fileUrl}" controls style="width:100%;border-radius:10px;"></video>`;
  } else {
    content += `<div style="text-align:center;padding:40px;color:var(--text2);"><span style="font-size:3rem">${typeInfo.emoji}</span><p style="margin-top:12px;">Preview not available.</p><button class="btn-primary" style="margin-top:16px;" onclick="downloadNote('${note.id}','${note.fileUrl}','${escHtml(note.fileName)}')">⬇ Download to Open</button></div>`;
  }
  document.getElementById('previewContent').innerHTML = content;
  openModal('previewModal');
}

// ══════════════════════════════════════════════════
// UPLOAD MODAL
// ══════════════════════════════════════════════════

async function loadSubjectsForUpload(course) {
  const sel = document.getElementById('noteSubject');
  if (!sel || !course) return;
  const res = await fetch(`/api/subjects?course=${encodeURIComponent(course)}`);
  const dbSubjects = await res.json();
  const derivedNames = [...new Set(allNotes.filter(n => (n.course || '6th Sem') === course).map(n => n.subject || 'General'))];
  const dbNames = dbSubjects.map(s => s.name);
  const allNames = [...new Set([...dbNames, ...derivedNames])].sort();
  sel.innerHTML = allNames.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('') + `<option value="__new__">➕ Add new subject...</option>`;
}

document.getElementById('noteCourse')?.addEventListener('change', async (e) => {
  await loadSubjectsForUpload(e.target.value);
});

document.getElementById('noteSubject')?.addEventListener('change', async (e) => {
  if (e.target.value === '__new__') {
    const name = prompt('Enter new subject name:');
    const course = document.getElementById('noteCourse').value;
    if (!name || !name.trim()) { await loadSubjectsForUpload(course); return; }
    const res = await fetch('/api/subjects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester: currentUser, course, name: name.trim() })
    });
    if (res.ok) {
      await loadSubjectsForUpload(course);
      document.getElementById('noteSubject').value = name.trim();
    } else { const d = await res.json(); toast(d.error || 'Failed to add subject', 'error'); await loadSubjectsForUpload(course); }
  }
});

async function openUploadModal() {
  selectedFile = null;
  document.getElementById('noteTitle').value = '';
  await loadCoursesForUpload();
  const courseToUse = currentNoteCourse || (allCourses[0] && allCourses[0].name) || '';
  document.getElementById('noteCourse').value = courseToUse;
  await loadSubjectsForUpload(courseToUse);
  const subjSel = document.getElementById('noteSubject');
  if (currentNoteSubject) { subjSel.value = currentNoteSubject; }
  else if (subjSel.options.length) { subjSel.selectedIndex = 0; }
  document.getElementById('noteDesc').value = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('dropInner').innerHTML = `<span class="drop-icon">📎</span><p>Click or drag & drop your file here</p><span class="file-types">PDF · JPG · PNG · MP4 · DOCX · PPTX · TXT</span>`;
  document.getElementById('uploadProgress').classList.add('hidden');
  openModal('uploadModal');
}

function handleFileSelect(e) { const file = e.target.files[0]; if (file) setSelectedFile(file); }

function setSelectedFile(file) {
  selectedFile = file;
  const typeInfo = getFileTypeInfo(file.type);
  document.getElementById('dropInner').innerHTML = `<div class="file-selected"><span class="file-icon">${typeInfo.emoji}</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
}

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); const file = e.dataTransfer.files[0]; if (file) setSelectedFile(file); });

async function submitNote() {
  const title = document.getElementById('noteTitle').value.trim();
  const course = document.getElementById('noteCourse').value.trim();
  const subject = document.getElementById('noteSubject').value.trim();
  const description = document.getElementById('noteDesc').value.trim();
  if (!title) { toast('Please enter a title', 'error'); return; }
  if (!course) { toast('Please enter course/semester', 'error'); return; }
  if (!subject || subject === '__new__') { toast('Please select or add a subject', 'error'); return; }
  if (!selectedFile) { toast('Please select a file', 'error'); return; }
  const formData = new FormData();
  formData.append('author', currentUser); formData.append('title', title);
  formData.append('course', course); formData.append('subject', subject); formData.append('description', description);
  formData.append('file', selectedFile);
  const btn = document.getElementById('uploadBtn');
  btn.disabled = true; btn.textContent = 'Uploading...';
  document.getElementById('uploadProgress').classList.remove('hidden');
  let prog = 0;
  const interval = setInterval(() => { prog = Math.min(prog + Math.random() * 15, 85); document.getElementById('progressFill').style.width = prog + '%'; }, 200);
  try {
    const res = await fetch('/api/notes', { method: 'POST', body: formData });
    clearInterval(interval);
    document.getElementById('progressFill').style.width = '100%';
    if (res.ok) {
      const data = await res.json();
      document.getElementById('progressText').textContent = data.message ? '⏳ Waiting for admin approval...' : 'Upload complete!';
      toast(data.message ? 'Note submitted! Waiting for admin approval ⏳' : 'Note uploaded! 🎉', 'success');
      closeModal('uploadModal');
    } else { const d = await res.json(); toast(d.error || 'Upload failed', 'error'); }
  } catch { clearInterval(interval); toast('Upload failed. Check your connection.', 'error'); }
  btn.disabled = false; btn.textContent = 'Upload Note 🚀';
}

// ══════════════════════════════════════════════════
// TIMETABLE
// ══════════════════════════════════════════════════

let allTimetables = [];
let allTTSections = [];
let currentTimetableSection = null;
let timetableSelectedFile = null;

async function loadTimetables() {
  const [tRes, sRes] = await Promise.all([fetch('/api/timetables'), fetch('/api/timetable-sections')]);
  allTimetables = await tRes.json();
  allTTSections = await sRes.json();
  renderTimetableSections();
}

function renderTimetableSections() {
  document.getElementById('timetableFilesView').classList.add('hidden');
  const grid = document.getElementById('timetableSectionsGrid');
  grid.classList.remove('hidden');
  const isAdmin = isAdminUser();

  let html = allTTSections.map(sec => {
    const count = allTimetables.filter(t => t.section === sec.name).length;
    const safeName = escHtml(sec.name).replace(/'/g, "\\'");
    return `
      <div class="note-card course-card" style="position:relative;">
        ${isAdmin ? `<button onclick="showTTContextMenu(event,'${sec.id}','${safeName}')" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2);padding:2px 8px;">⋮</button>` : ''}
        <div style="cursor:pointer;" onclick="openTimetableSection('${safeName}')">
          <div class="note-title">📘 ${escHtml(sec.name)}</div>
          <div class="note-meta"><span class="meta-tag">${count} file${count === 1 ? '' : 's'}</span></div>
        </div>
      </div>`;
  }).join('');

  if (isAdmin) {
    html += `
      <div class="note-card" style="cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:90px;border:2px dashed var(--border);" onclick="addTTSectionPrompt()">
        <div style="text-align:center;color:var(--text2);">
          <div style="font-size:1.6rem;">➕</div>
          <div style="font-size:0.85rem;margin-top:4px;">Add Section</div>
        </div>
      </div>`;
  }
  grid.innerHTML = html;
}

async function addTTSectionPrompt() {
  const name = prompt('Enter new section name (e.g. BCA 3A):');
  if (!name || !name.trim()) return;
  const res = await fetch('/api/timetable-sections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, name: name.trim() }) });
  if (res.ok) {
    toast('Section added! 📁 Opening it now...', 'success');
    await loadTimetables();
    openTimetableSection(name.trim());
  }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function renameTTSection(id, oldName) {
  const newName = prompt('Enter new section name:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const res = await fetch(`/api/timetable-sections/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, name: newName.trim() }) });
  if (res.ok) { toast('Section renamed! ✅', 'success'); loadTimetables(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteTTSection(id, name) {
  if (!confirm(`Delete section "${name}"?`)) return;
  const res = await fetch(`/api/timetable-sections/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Section deleted 🗑', 'success'); loadTimetables(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

function showTTContextMenu(e, id, name) {
  e.preventDefault(); e.stopPropagation();
  if (!isAdminUser()) return;
  document.getElementById('folderCtxMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'folderCtxMenu';
  menu.className = 'folder-ctx-menu';
  const rect = e.currentTarget.getBoundingClientRect();
  let top = rect.bottom, left = rect.left;
  if (top + 90 > window.innerHeight) top = rect.top - 90;
  if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
  menu.style.left = left + 'px'; menu.style.top = top + 'px';
  const safeName = name.replace(/'/g, "\\'");
  menu.innerHTML = `
    <button onclick="renameTTSection('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();">✏️ Rename</button>
    <button onclick="deleteTTSection('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();" style="color:#d9534f;">🗑 Delete</button>`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function c() { document.getElementById('folderCtxMenu')?.remove(); document.removeEventListener('click', c); }), 0);
}

async function loadSectionsForUpload() {
  const sel = document.getElementById('timetableSection');
  if (!sel) return;
  const res = await fetch('/api/timetable-sections');
  allTTSections = await res.json();
  sel.innerHTML = allTTSections.map(s => `<option value="${escHtml(s.name)}">${escHtml(s.name)}</option>`).join('');
}

function openTimetableSection(section) {
  currentTimetableSection = section;
  pushNavState();
  document.getElementById('timetableSectionsGrid').classList.add('hidden');
  document.getElementById('timetableFilesView').classList.remove('hidden');
  document.getElementById('timetableSectionTitle').textContent = `🗓 ${section} Timetable`;
  const files = allTimetables.filter(t => t.section === section);
  const grid = document.getElementById('timetableFilesGrid');
  const empty = document.getElementById('timetableFilesEmpty');
  grid.innerHTML = '';
  if (!files.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  files.forEach(f => grid.appendChild(buildTimetableCard(f)));
}

function backToSections() { renderTimetableSections(); pushNavState(); }

function buildTimetableCard(t) {
  const div = document.createElement('div');
  div.className = 'note-card'; div.id = `tt-${t.id}`;
  const typeInfo = getFileTypeInfo(t.fileType);
  const isAdmin = isAdminUser();
  const size = formatBytes(t.fileSize);
  const date = new Date(t.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  div.innerHTML = `
    <div class="note-card-header">
      <span class="file-type-badge ${typeInfo.cls}">${typeInfo.emoji} ${typeInfo.label}</span>
      ${isAdmin ? `<div class="admin-actions"><button class="btn-danger" onclick="deleteTimetable('${t.id}')">🗑 Delete</button></div>` : ''}
    </div>
    <div class="note-title">${escHtml(t.section)} Timetable</div>
    <div class="note-meta"><span class="meta-tag">📅 ${date}</span></div>
    <div class="note-file-info">
      <span>${typeInfo.emoji}</span>
      <span class="note-file-name">${escHtml(t.fileName)}</span>
      <span>${size}</span>
    </div>
    <div class="note-card-footer">
      <button class="btn-secondary" onclick="previewTimetable('${t.id}')">👁 Preview</button>
      <button class="btn-primary" onclick="downloadTimetableFile('${t.id}', '${t.fileUrl}', '${escHtml(t.fileName)}')">⬇ Download</button>
    </div>`;
  return div;
}

function previewTimetable(id) {
  const t = allTimetables.find(x => x.id === id);
  if (!t) return;
  const typeInfo = getFileTypeInfo(t.fileType);
  let content = `<div class="preview-header"><h3>${escHtml(t.section)} Timetable</h3><p>${typeInfo.emoji} ${escHtml(t.fileName)}</p></div>`;
  if (t.fileType === 'application/pdf') {
    content += `<iframe src="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(t.fileUrl)}" style="width:100%;height:72vh;border:none;border-radius:10px;" allowfullscreen></iframe>`;
  } else {
    content += `<img src="${t.fileUrl}" alt="${escHtml(t.section)}" />`;
  }
  document.getElementById('previewContent').innerHTML = content;
  openModal('previewModal');
}

async function downloadTimetableFile(id, url, fileName) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl; link.download = fileName;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.target = '_blank';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }
  toast(`Downloading "${fileName}"`, 'success');
}

async function deleteTimetable(id) {
  if (!confirm('Delete this timetable?')) return;
  const res = await fetch(`/api/timetables/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) toast('Timetable deleted', 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function openTimetableUploadModal() {
  timetableSelectedFile = null;
  document.getElementById('timetableFileInput').value = '';
  document.getElementById('timetableDropInner').innerHTML = `<span class="drop-icon">📎</span><p>Click or drag & drop your file here</p><span class="file-types">PDF · JPG · PNG</span>`;
  await loadSectionsForUpload();
  if (currentTimetableSection) document.getElementById('timetableSection').value = currentTimetableSection;
  openModal('timetableUploadModal');
}

function handleTimetableFileSelect(e) { const file = e.target.files[0]; if (file) setTimetableFile(file); }

function setTimetableFile(file) {
  timetableSelectedFile = file;
  const typeInfo = getFileTypeInfo(file.type);
  document.getElementById('timetableDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">${typeInfo.emoji}</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
}

const timetableDropZone = document.getElementById('timetableDropZone');
if (timetableDropZone) {
  timetableDropZone.addEventListener('dragover', e => { e.preventDefault(); timetableDropZone.classList.add('drag-over'); });
  timetableDropZone.addEventListener('dragleave', () => timetableDropZone.classList.remove('drag-over'));
  timetableDropZone.addEventListener('drop', e => { e.preventDefault(); timetableDropZone.classList.remove('drag-over'); const file = e.dataTransfer.files[0]; if (file) setTimetableFile(file); });
}

async function submitTimetable() {
  const section = document.getElementById('timetableSection').value;
  if (!timetableSelectedFile) { toast('Please select a file', 'error'); return; }
  const formData = new FormData();
  formData.append('section', section);
  formData.append('uploaded_by', currentUser);
  formData.append('file', timetableSelectedFile);
  const btn = document.getElementById('timetableUploadBtn');
  btn.disabled = true; btn.textContent = 'Uploading...';
  try {
    const res = await fetch('/api/timetables', { method: 'POST', body: formData });
    if (res.ok) {
      toast('Timetable uploaded! 🎉', 'success');
      closeModal('timetableUploadModal');
      loadTimetables();
    } else { const d = await res.json(); toast(d.error || 'Upload failed', 'error'); }
  } catch { toast('Upload failed. Check your connection.', 'error'); }
  btn.disabled = false; btn.textContent = 'Upload Timetable 🚀';
}

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
  div.className = 'question-card'; div.id = `q-${q.id}`;
  const isAdmin = isAdminUser();
  const date = new Date(q.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const initial = q.author[0].toUpperCase();
  let repliesHtml = '';
  if (q.replies && q.replies.length) {
    repliesHtml = `<div class="replies-section"><h5>💬 ${q.replies.length} Reply${q.replies.length > 1 ? 'ies' : ''}</h5>${q.replies.map(r => `<div class="reply-item"><div class="reply-avatar">${r.author[0].toUpperCase()}</div><div class="reply-body"><div class="reply-author">${escHtml(r.author)}</div><div class="reply-text">${escHtml(r.text)}</div></div></div>`).join('')}</div>`;
  }
  div.innerHTML = `
    <div class="question-header">
      <div class="q-author"><div class="q-avatar">${initial}</div><div><div class="q-author-name">${escHtml(q.author)}</div><div class="q-time">${date}</div></div></div>
      ${isAdmin ? `<button class="btn-danger" onclick="deleteQuestion('${q.id}')">🗑 Delete</button>` : ''}
    </div>
    <div class="q-text">${escHtml(q.text)}</div>
    ${repliesHtml}
    <div class="q-actions">
      <button class="btn-reply" onclick="openReplyModal('${q.id}', \`${escHtml(q.text).replace(/`/g, "'")}\`)">💬 Reply</button>
      ${isAdmin && q.author.toLowerCase() !== ADMIN_NAME ? `<button class="btn-block" onclick="blockUser('${escHtml(q.author)}')">🚫 Block User</button>` : ''}
    </div>`;
  return div;
}

function openQuestionModal() { document.getElementById('questionText').value = ''; openModal('questionModal'); }

async function submitQuestion() {
  const text = document.getElementById('questionText').value.trim();
  if (!text) { toast('Please type your question', 'error'); return; }
  const res = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: currentUser, text }) });
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
  const res = await fetch(`/api/questions/${questionId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: currentUser, text }) });
  if (res.ok) { toast('Reply posted! ✅', 'success'); closeModal('replyModal'); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) return;
  const res = await fetch(`/api/questions/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) toast('Question deleted', 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

// ══════════════════════════════════════════════════
// STUDY PLANNER
// ══════════════════════════════════════════════════

async function loadPlanner() {
  const res = await fetch('/api/events');
  const events = await res.json();
  const container = document.getElementById('plannerList');
  const empty = document.getElementById('plannerEmpty');
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter upcoming events
  const upcoming = events.filter(e => new Date(e.event_date) >= today);
  const past = events.filter(e => new Date(e.event_date) < today);

  if (!events.length) {
    empty?.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }
  empty?.classList.add('hidden');

  const isAdmin = isAdminUser();

  const renderEvents = (evts, label) => {
    if (!evts.length) return '';
    return `<div class="planner-section-title">${label}</div>` +
      evts.map(e => {
        const evDate = new Date(e.event_date);
        const diffDays = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));
        const typeEmoji = e.event_type === 'exam' ? '📝' : e.event_type === 'assignment' ? '📋' : e.event_type === 'holiday' ? '🎉' : '📅';
        const typeColor = e.event_type === 'exam' ? 'var(--accent)' : e.event_type === 'assignment' ? 'var(--blue)' : e.event_type === 'holiday' ? 'var(--green)' : 'var(--amber)';
        const countdown = diffDays > 0 ? `<span class="planner-countdown" style="background:${typeColor}20;color:${typeColor};">${diffDays} day${diffDays > 1 ? 's' : ''} left</span>` :
          diffDays === 0 ? `<span class="planner-countdown" style="background:var(--accent)20;color:var(--accent);">Today!</span>` : '';
        return `
          <div class="planner-card">
            <div class="planner-card-left">
              <span class="planner-type-icon">${typeEmoji}</span>
              <div>
                <div class="planner-title">${escHtml(e.title)} ${e.attachment_url ? `<a href="javascript:void(0)" onclick="openAttachment('${e.attachment_url}','${e.id}','event')" style="color:var(--accent);font-size:0.85rem;">📎</a>` : ''}</div>
                <div class="planner-meta">📚 ${escHtml(e.subject)} • ${evDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
            </div>
            <div class="planner-card-right">
              ${countdown}
              ${isAdmin ? `<button class="btn-danger" onclick="deleteEvent('${e.id}')" style="padding:5px 10px;font-size:0.78rem;">🗑</button>` : ''}
            </div>
          </div>`;
      }).join('');
  };

  container.innerHTML = renderEvents(upcoming, '📅 Upcoming') + (past.length ? renderEvents(past, '✅ Past') : '');
}

async function addEvent() {
  const title = document.getElementById('eventTitle').value.trim();
  const subject = document.getElementById('eventSubject').value.trim();
  const date = document.getElementById('eventDate').value;
  const type = document.getElementById('eventType').value;
  const fileInput = document.getElementById('eventFile');

  if (!title || !subject || !date) { toast('Please fill all fields', 'error'); return; }

  const formData = new FormData();
  formData.append('title', title); formData.append('subject', subject);
  formData.append('event_date', date); formData.append('event_type', type);
  formData.append('created_by', currentUser);
  if (fileInput && fileInput.files[0]) formData.append('file', fileInput.files[0]);

  const res = await fetch('/api/events', { method: 'POST', body: formData });

  if (res.ok) {
    toast('Event added! 📅', 'success');
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventSubject').value = '';
    document.getElementById('eventDate').value = '';
    if (fileInput) fileInput.value = '';
    loadPlanner();
  } else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  await fetch(`/api/events/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  toast('Event deleted', 'success');
  loadPlanner();
}

// ══════════════════════════════════════════════════
// QUIZ MODE
// ══════════════════════════════════════════════════

async function loadQuizList() {
  const res = await fetch('/api/quizzes');
  const quizzes = await res.json();
  const container = document.getElementById('quizList');
  const empty = document.getElementById('quizEmpty');
  if (!container) return;

  if (!quizzes.length) { empty?.classList.remove('hidden'); container.innerHTML = ''; return; }
  empty?.classList.add('hidden');

  const isAdmin = isAdminUser();
  container.innerHTML = quizzes.map(q => `
    <div class="quiz-card">
      <div class="quiz-card-info">
        <div class="quiz-title">🎯 ${escHtml(q.title)}</div>
        <div class="quiz-meta">📚 ${escHtml(q.subject)} • By ${escHtml(q.created_by)}</div>
      </div>
      <div class="quiz-card-actions">
        <button class="btn-primary" onclick="startQuiz('${q.id}')">▶ Start Quiz</button>
        ${isAdmin ? `<button class="btn-secondary" onclick="viewQuizResults('${q.id}', \`${escHtml(q.title).replace(/`/g, "'")}\`)" style="padding:8px 14px;">📊 Results</button>` : ''}
        ${isAdmin ? `<button class="btn-danger" onclick="deleteQuiz('${q.id}')" style="padding:8px 14px;">🗑</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function startQuiz(quizId) {
  const res = await fetch(`/api/quizzes/${quizId}`);
  currentQuiz = await res.json();
  quizAnswers = {};

  if (!currentQuiz.questions || !currentQuiz.questions.length) {
    toast('This quiz has no questions yet!', 'error'); return;
  }

  document.getElementById('quizModalTitle').textContent = `🎯 ${currentQuiz.title}`;
  document.getElementById('quizModalSubject').textContent = `📚 ${currentQuiz.subject}`;
  renderQuizQuestions();
  openModal('quizModal');
}

function renderQuizQuestions() {
  const container = document.getElementById('quizQuestionsContainer');
  container.innerHTML = currentQuiz.questions.map((q, idx) => `
    <div class="quiz-question-card">
      <div class="quiz-q-number">Q${idx + 1} of ${currentQuiz.questions.length}</div>
      <div class="quiz-q-text">${escHtml(q.question)}</div>
      <div class="quiz-options">
        ${['a', 'b', 'c', 'd'].map(opt => `
          <label class="quiz-option" id="opt-${q.id}-${opt}">
            <input type="radio" name="q-${q.id}" value="${opt}" onchange="selectAnswer('${q.id}', '${opt}')">
            <span class="quiz-opt-label">${opt.toUpperCase()}</span>
            <span>${escHtml(q[`option_${opt}`])}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectAnswer(questionId, answer) {
  quizAnswers[questionId] = answer;
  // Highlight selected
  ['a', 'b', 'c', 'd'].forEach(opt => {
    const el = document.getElementById(`opt-${questionId}-${opt}`);
    if (el) el.classList.toggle('selected', opt === answer);
  });
}

async function submitQuiz() {
  const total = currentQuiz.questions.length;
  const answered = Object.keys(quizAnswers).length;

  if (answered < total) {
    if (!confirm(`You answered ${answered}/${total} questions. Submit anyway?`)) return;
  }

  const res = await fetch(`/api/quizzes/${currentQuiz.id}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser, answers: quizAnswers })
  });

  const result = await res.json();
  closeModal('quizModal');

  // Show result
  const percent = Math.round((result.score / result.total) * 100);
  const emoji = percent >= 80 ? '🏆' : percent >= 60 ? '😊' : percent >= 40 ? '📚' : '💪';
  document.getElementById('quizResultEmoji').textContent = emoji;
  document.getElementById('quizResultScore').textContent = `${result.score} / ${result.total}`;
  document.getElementById('quizResultPercent').textContent = `${percent}%`;
  document.getElementById('quizResultMsg').textContent = percent >= 80 ? 'Excellent! Keep it up!' : percent >= 60 ? 'Good job! Keep practicing!' : percent >= 40 ? 'Keep studying, you\'ll do better!' : 'Don\'t give up, practice more!';
  openModal('quizResultModal');
}

async function viewQuizResults(quizId, quizTitle) {
  const res = await fetch(`/api/quizzes/${quizId}/results`);
  const results = await res.json();
  let content = `<div class="preview-header"><h3>📊 Results: ${escHtml(quizTitle)}</h3></div>`;
  if (!results.length) {
    content += `<div style="text-align:center;padding:40px;color:var(--text2);">No attempts yet.</div>`;
  } else {
    content += `<div style="display:flex;flex-direction:column;gap:8px;">` +
      results.map(r => {
        const percent = Math.round((r.score / r.total) * 100);
        const date = new Date(r.attempted_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--border);border-radius:8px;">
          <strong>${escHtml(r.username)}</strong>
          <span>${r.score}/${r.total} (${percent}%)</span>
          <span style="font-size:0.78rem;color:var(--text3);">${date}</span>
        </div>`;
      }).join('') + `</div>`;
  }
  document.getElementById('previewContent').innerHTML = content;
  openModal('previewModal');
}

async function deleteQuiz(id) {
  if (!confirm('Delete this quiz?')) return;
  await fetch(`/api/quizzes/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  toast('Quiz deleted', 'success');
  loadQuizList();
}

// Create Quiz (Admin)
let quizQuestions = [];

function openCreateQuizModal() {
  quizQuestions = [];
  document.getElementById('quizCreateTitle').value = '';
  document.getElementById('quizCreateSubject').value = '';
  document.getElementById('quizQuestionsList').innerHTML = '';
  addQuizQuestion();
  openModal('createQuizModal');
}

function addQuizQuestion() {
  const idx = quizQuestions.length;
  quizQuestions.push({ question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a' });
  const container = document.getElementById('quizQuestionsList');
  const div = document.createElement('div');
  div.className = 'quiz-create-question';
  div.id = `create-q-${idx}`;
  div.innerHTML = `
    <div class="quiz-create-q-header">
      <strong>Question ${idx + 1}</strong>
      ${idx > 0 ? `<button class="btn-danger" onclick="removeQuestion(${idx})" style="padding:4px 10px;font-size:0.78rem;">Remove</button>` : ''}
    </div>
    <div class="form-group">
      <input type="text" placeholder="Enter question..." oninput="updateQuestion(${idx}, 'question', this.value)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-family:DM Sans,sans-serif;outline:none;" />
    </div>
    <div class="quiz-options-create">
      ${['a', 'b', 'c', 'd'].map(opt => `
        <div class="form-group">
          <label style="font-size:0.78rem;font-weight:600;color:var(--text2);text-transform:uppercase;">Option ${opt.toUpperCase()}</label>
          <input type="text" placeholder="Option ${opt.toUpperCase()}..." oninput="updateQuestion(${idx}, 'option_${opt}', this.value)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-family:DM Sans,sans-serif;outline:none;" />
        </div>
      `).join('')}
      <div class="form-group">
        <label style="font-size:0.78rem;font-weight:600;color:var(--text2);text-transform:uppercase;">Correct Answer</label>
        <select onchange="updateQuestion(${idx}, 'correct_answer', this.value)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-family:DM Sans,sans-serif;outline:none;">
          <option value="a">A</option>
          <option value="b">B</option>
          <option value="c">C</option>
          <option value="d">D</option>
        </select>
      </div>
    </div>
  `;
  container.appendChild(div);
}

function updateQuestion(idx, field, value) { if (quizQuestions[idx]) quizQuestions[idx][field] = value; }

function removeQuestion(idx) {
  quizQuestions.splice(idx, 1);
  document.getElementById(`create-q-${idx}`)?.remove();
}

async function saveQuiz() {
  const title = document.getElementById('quizCreateTitle').value.trim();
  const subject = document.getElementById('quizCreateSubject').value.trim();
  if (!title || !subject) { toast('Please enter title and subject', 'error'); return; }
  if (!quizQuestions.length) { toast('Add at least one question', 'error'); return; }

  const invalid = quizQuestions.find(q => !q.question || !q.option_a || !q.option_b || !q.option_c || !q.option_d);
  if (invalid) { toast('Please fill all question fields', 'error'); return; }

  const res = await fetch('/api/quizzes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, subject, created_by: currentUser, questions: quizQuestions })
  });

  if (res.ok) {
    toast('Quiz created! 🎯', 'success');
    closeModal('createQuizModal');
    loadQuizList();
  } else { const d = await res.json(); toast(d.error, 'error'); }
}

// ══════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════

async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin-settings');
    const data = await res.json();
    const statusText = document.getElementById('adminBlockStatusText');
    const btn = document.getElementById('toggleAdminBlockBtn');
    if (statusText && btn) {
      if (data.admin_blocked) {
        statusText.textContent = '🚫 Blocked';
        statusText.style.color = 'var(--accent)';
        btn.textContent = '✅ Unblock Admin Access';
      } else {
        statusText.textContent = '✅ Active';
        statusText.style.color = 'var(--green)';
        btn.textContent = '🚫 Block Admin Access';
      }
    }
    const uploadsText = document.getElementById('uploadsBlockStatusText');
    const uploadsBtn = document.getElementById('toggleUploadsBtn');
    if (uploadsText && uploadsBtn) {
      if (data.uploads_disabled) {
        uploadsText.textContent = '🚫 Disabled';
        uploadsText.style.color = 'var(--accent)';
        uploadsBtn.textContent = '✅ Enable Uploads';
      } else {
        uploadsText.textContent = '✅ Active';
        uploadsText.style.color = 'var(--green)';
        uploadsBtn.textContent = '🚫 Disable Uploads Globally';
      }
    }
  } catch {}
}

async function toggleAdminBlock() {
  const statusText = document.getElementById('adminBlockStatusText');
  const currentlyBlocked = statusText?.textContent.includes('Blocked');
  const res = await fetch('/api/admin-settings/block', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, blocked: !currentlyBlocked })
  });
  if (res.ok) { toast(currentlyBlocked ? 'Admin access unblocked ✅' : 'Admin access blocked 🚫', 'success'); loadAdminSettings(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function toggleUploadsDisabled() {
  const statusText = document.getElementById('uploadsBlockStatusText');
  const currentlyDisabled = statusText?.textContent.includes('Disabled');
  const res = await fetch('/api/admin-settings/uploads-toggle', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, disabled: !currentlyDisabled })
  });
  if (res.ok) { toast(currentlyDisabled ? 'Uploads enabled ✅' : 'Uploads disabled globally 🚫', 'success'); loadAdminSettings(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function changeAdminPassword() {
  const input = document.getElementById('newAdminPasswordInput');
  const newPassword = input.value.trim();
  if (!newPassword) { toast('Enter a new password', 'error'); return; }
  const res = await fetch('/api/admin-settings/change-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, newPassword })
  });
  if (res.ok) { toast('Admin password updated ✅', 'success'); input.value = ''; }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function blockUser(targetUser) {
  if (!confirm(`Block "${targetUser}"?`)) return;
  const res = await fetch('/api/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, targetUser }) });
  if (res.ok) toast(`${targetUser} has been blocked 🚫`, 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function blockUserManual() {
  const name = document.getElementById('blockInput').value.trim();
  if (!name) { toast('Enter a username', 'error'); return; }
  if (!confirm(`Block "${name}"? They won't be able to upload notes, ask questions, or reply.`)) return;
  const res = await fetch('/api/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, targetUser: name }) });
  if (res.ok) { toast(`${name} blocked 🚫`, 'success'); document.getElementById('blockInput').value = ''; loadAdminPanel(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function unblockUser() {
  const name = document.getElementById('unblockInput').value.trim();
  if (!name) { toast('Enter a username', 'error'); return; }
  const res = await fetch('/api/unblock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, targetUser: name }) });
  if (res.ok) { toast(`${name} unblocked ✅`, 'success'); document.getElementById('unblockInput').value = ''; loadAdminPanel(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadAdminPanel() {
  const blocked = await (await fetch('/api/blocked')).json();
  const blockedList = document.getElementById('blockedList');
  blockedList.innerHTML = blocked.length ? blocked.map(u => `<div class="admin-user-item"><span>🚫 ${escHtml(u)}</span><button class="btn-secondary" onclick="quickUnblock('${escHtml(u)}')">Unblock</button></div>`).join('') : '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No blocked users</div>';
  await loadPendingNotes();
  await loadLoginHistory();
  await loadAdminMessages();
  await loadAnnouncements();
  loadLinksAdmin();
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
  if (!pending.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No pending notes ✅</div>'; return; }
  container.innerHTML = pending.map(note => `
    <div class="admin-user-item" style="flex-direction:column;align-items:flex-start;gap:8px;padding:14px;">
      <div style="display:flex;justify-content:space-between;width:100%;"><strong>${escHtml(note.title)}</strong><span style="font-size:0.78rem;color:var(--text3);">${escHtml(note.subject)}</span></div>
      <div style="font-size:0.82rem;color:var(--text2);">By: ${escHtml(note.author)} • ${escHtml(note.fileName)}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary" style="padding:6px 16px;font-size:0.82rem;" onclick="approveNote('${note.id}')">✅ Approve</button>
        <button class="btn-danger" onclick="rejectNote('${note.id}')">❌ Reject</button>
      </div>
    </div>`).join('');
}

async function approveNote(id) {
  const res = await fetch(`/api/notes/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Note approved! ✅', 'success'); loadPendingNotes(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function rejectNote(id) {
  if (!confirm('Reject and delete this note?')) return;
  const res = await fetch(`/api/notes/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Note rejected ❌', 'success'); loadPendingNotes(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadLoginHistory() {
  const res = await fetch('/api/login-history');
  const history = await res.json();
  const container = document.getElementById('loginHistoryList');
  if (!container) return;
  if (!history.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No login history yet</div>'; return; }
  container.innerHTML = history.map(h => {
    const date = new Date(h.logged_in_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="admin-user-item"><div><strong style="font-size:0.88rem;">${escHtml(h.username)}</strong><span style="font-size:0.75rem;color:var(--text3);margin-left:8px;">${h.device === 'Mobile' ? '📱' : '💻'} ${h.device}</span></div><span style="font-size:0.78rem;color:var(--text3);">${date}</span></div>`;
  }).join('');
}

async function quickUnblock(name) {
  await fetch('/api/unblock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, targetUser: name }) });
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
  document.getElementById('announcementBanner')?.classList.add('hidden');

  const container = document.getElementById('announcementsList');
  if (!container) return;
  if (!announcements.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No announcements yet</div>'; return; }
  container.innerHTML = announcements.map(a => {
    const date = new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const attach = a.attachment_url ? `<button class="btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="openAttachment('${a.attachment_url}','${a.id}','ann')">📎 View</button>` : '';
    return `<div class="announcement-item"><span class="announcement-item-text">${escHtml(a.message)}</span>${attach}<span class="announcement-item-time">${date}</span>${isAdminUser() ? `<button class="btn-danger" onclick="deleteAnnouncement('${a.id}')" style="padding:5px 10px;font-size:0.78rem;">🗑</button>` : ''}</div>`;
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
  const fileInput = document.getElementById('announcementFile');
  const formData = new FormData();
  formData.append('requester', currentUser);
  formData.append('message', text);
  if (fileInput && fileInput.files[0]) formData.append('file', fileInput.files[0]);
  const res = await fetch('/api/announcements', { method: 'POST', body: formData });
  if (res.ok) { toast('Announcement posted! 📢', 'success'); document.getElementById('announcementText').value = ''; if (fileInput) fileInput.value = ''; loadAnnouncements(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function openAttachment(url, id, type) {
  let finalUrl = url;
  if (url.startsWith('b2://')) {
    try {
      const endpoint = type === 'event' ? `/api/events/${id}/signed-url` : `/api/announcements/${id}/signed-url`;
      const sres = await fetch(endpoint);
      const sdata = await sres.json();
      finalUrl = sdata.url;
    } catch { toast('Failed to load attachment', 'error'); return; }
  }
  window.open(finalUrl, '_blank');
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await fetch(`/api/announcements/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  toast('Announcement deleted', 'success');
  loadAnnouncements();
}

// ══════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════

function openMessageModal() { document.getElementById('messageText').value = ''; loadMyReplies(); openModal('messageModal'); }

async function sendMessage() {
  const text = document.getElementById('messageText').value.trim();
  if (!text) { toast('Please type a message', 'error'); return; }
  const res = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_user: currentUser, message: text }) });
  if (res.ok) { toast('Message sent to admin! 📨', 'success'); document.getElementById('messageText').value = ''; loadMyReplies(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
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
      return `<div class="message-item ${m.reply ? 'has-reply' : ''}"><div class="message-text">${escHtml(m.message)}</div><div class="message-time">${date}</div>${m.reply ? `<div class="message-reply-box">👑 Admin: ${escHtml(m.reply)}</div>` : '<div style="font-size:0.78rem;color:var(--text3);margin-top:6px;">⏳ Waiting for reply...</div>'}</div>`;
    }).join('');
}

async function loadAdminMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;
  const res = await fetch('/api/messages');
  const messages = await res.json();
  if (!messages.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No messages yet</div>'; return; }
  container.innerHTML = messages.map(m => {
    const date = new Date(m.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="message-item ${m.reply ? 'has-reply' : ''}"><div style="display:flex;justify-content:space-between;align-items:center;"><div class="message-from">👤 ${escHtml(m.from_user)}</div><div style="display:flex;gap:6px;"><button class="btn-reply" onclick="openAdminReply('${m.id}','${escHtml(m.message).replace(/'/g,'&#39;')}')" style="padding:5px 12px;font-size:0.78rem;">↩️ Reply</button><button class="btn-danger" onclick="deleteMessage('${m.id}')" style="padding:5px 10px;font-size:0.78rem;">🗑</button></div></div><div class="message-text">${escHtml(m.message)}</div><div class="message-time">${date}</div>${m.reply ? `<div class="message-reply-box">Your reply: ${escHtml(m.reply)}</div>` : ''}</div>`;
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
  const res = await fetch(`/api/messages/${msgId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, reply }) });
  if (res.ok) { toast('Reply sent! ✅', 'success'); closeModal('adminReplyModal'); loadAdminMessages(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function deleteMessage(id) {
  if (!confirm('Delete this message?')) return;
  const res = await fetch(`/api/messages/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Message deleted', 'success'); loadAdminMessages(); }
  else { const d = await res.json(); toast(d.error || 'Delete failed', 'error'); }
}

// ══════════════════════════════════════════════════
// SOCKET.IO REAL-TIME
// ══════════════════════════════════════════════════

socket.on('new_pending_note', () => { if (currentUser?.toLowerCase() === ADMIN_NAME) { toast('📋 New note waiting for approval!', ''); loadPendingNotes(); } });
socket.on('note_approved', () => { loadNotes(); });
socket.on('note_rejected', () => { loadPendingNotes(); });
socket.on('new_note', (note) => {
  allNotes.unshift(note);
  const noteCourse = note.course || '6th Sem';
  const noteSubject = note.subject || 'General';
  if (currentNoteSubject && noteCourse === currentNoteCourse && noteSubject === currentNoteSubject) {
    const grid = document.getElementById('notesGrid');
    grid.insertBefore(buildNoteCard(note), grid.firstChild);
    document.getElementById('notesEmpty').classList.add('hidden');
  } else if (currentNoteCourse && !currentNoteSubject) {
    openNoteCourse(currentNoteCourse);
  } else if (!currentNoteCourse) {
    renderNoteCourses();
  }
  if (note.author !== currentUser) toast(`📤 New note: "${note.title}" by ${note.author}`);
  updateAdminStats();
});
socket.on('note_deleted', (id) => {
  allNotes = allNotes.filter(n => n.id !== id);
  document.getElementById(`note-${id}`)?.remove();
  if (currentNoteCourse && !currentNoteSubject) openNoteCourse(currentNoteCourse);
  else if (!currentNoteCourse) renderNoteCourses();
  updateAdminStats();
});
socket.on('note_updated', (note) => { const idx = allNotes.findIndex(n => n.id === note.id); if (idx !== -1) allNotes[idx] = note; document.getElementById(`note-${note.id}`)?.replaceWith(buildNoteCard(note)); });
socket.on('new_question', (q) => { allQuestions.unshift(q); const list = document.getElementById('questionsList'); list.insertBefore(buildQuestionCard(q), list.firstChild); document.getElementById('questionsEmpty').classList.add('hidden'); if (q.author !== currentUser) toast(`💬 New question from ${q.author}`); updateAdminStats(); });
socket.on('question_deleted', (id) => { allQuestions = allQuestions.filter(q => q.id !== id); document.getElementById(`q-${id}`)?.remove(); });
socket.on('new_reply', ({ questionId, reply }) => { const q = allQuestions.find(q => q.id === questionId); if (q) { q.replies = q.replies || []; q.replies.push(reply); document.getElementById(`q-${questionId}`)?.replaceWith(buildQuestionCard(q)); if (reply.author !== currentUser) toast(`💬 ${reply.author} replied to a question`); } });
socket.on('online_users', (users) => {
  const visibleUsers = users.filter(u => u.toLowerCase() !== SUPERADMIN_NAME);
  document.getElementById('onlineCount').textContent = visibleUsers.length;
  document.getElementById('statOnline').textContent = visibleUsers.length;
  const adminList = document.getElementById('adminUserList');
  if (adminList) adminList.innerHTML = visibleUsers.map(u => `<div class="admin-user-item"><span>🟢 ${escHtml(u)}</span>${u.toLowerCase() !== ADMIN_NAME && isAdminUser() ? `<button class="btn-block" onclick="blockUser('${escHtml(u)}')">Block</button>` : ''}</div>`).join('') || '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No users online</div>';
});
socket.on('user_blocked', (username) => { if (currentUser?.toLowerCase() === username) toast('⛔ You have been blocked by the admin.', 'error'); });
socket.on('new_announcement', () => {
  loadAnnouncements();
});
socket.on('announcement_deleted', () => { loadAnnouncements(); });
socket.on('new_message', () => { if (currentUser?.toLowerCase() === ADMIN_NAME) { toast('📬 New message from a user!', ''); loadAdminMessages(); } });
socket.on('message_reply', (msg) => { if (msg.from_user === currentUser) { toast('📬 Admin replied to your message!', 'success'); loadMyReplies(); loadAdminMessages(); } });
socket.on('new_event', () => { if (document.getElementById('tab-planner')?.classList.contains('active') === false) {} loadPlanner(); });
socket.on('event_deleted', () => { loadPlanner(); });
socket.on('new_quiz', () => { if (document.querySelector('[data-tab="quiz"]')?.classList.contains('active')) loadQuizList(); toast('🎯 New quiz added!', 'success'); });
socket.on('quiz_deleted', () => { loadQuizList(); });
socket.on('tt_section_added', () => loadTimetables());
socket.on('tt_section_renamed', () => loadTimetables());
socket.on('tt_section_deleted', () => loadTimetables());
socket.on('new_link', () => { loadLinksAdmin(); loadHomeWidgets(); });
socket.on('link_deleted', () => { loadLinksAdmin(); loadHomeWidgets(); });
socket.on('course_renamed', async () => { await loadCoursesForUpload(); loadNotes(); });
socket.on('course_added', async () => { await loadCoursesForUpload(); loadNotes(); });
socket.on('course_deleted', async () => { await loadCoursesForUpload(); loadNotes(); });
socket.on('subject_added', () => { if (currentNoteCourse && !currentNoteSubject) openNoteCourse(currentNoteCourse); });
socket.on('subject_renamed', async () => { await loadNotes(); if (currentNoteCourse && !currentNoteSubject) openNoteCourse(currentNoteCourse); });
socket.on('subject_deleted', () => { if (currentNoteCourse && !currentNoteSubject) openNoteCourse(currentNoteCourse); });

// ══════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOnBg(e, id) { if (e.target === e.currentTarget) closeModal(id); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['uploadModal', 'questionModal', 'replyModal', 'previewModal', 'messageModal', 'adminReplyModal', 'quizModal', 'quizResultModal', 'createQuizModal', 'timetableUploadModal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  }
});

// ══════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type}`; t.classList.remove('hidden');
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
// STUDY STREAK
// ══════════════════════════════════════════════════
async function postLink() {
  const title = document.getElementById('linkTitle').value.trim();
  const url = document.getElementById('linkUrl').value.trim();
  const description = document.getElementById('linkDesc').value.trim();
  if (!title || !url) { toast('Title and URL required', 'error'); return; }
  const res = await fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, title, url, description }) });
  if (res.ok) { toast('Link added! 🔗', 'success'); document.getElementById('linkTitle').value=''; document.getElementById('linkUrl').value=''; document.getElementById('linkDesc').value=''; loadLinksAdmin(); loadHomeWidgets(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadLinksAdmin() {
  const container = document.getElementById('linksAdminList');
  if (!container) return;
  const res = await fetch('/api/links');
  const links = await res.json();
  container.innerHTML = links.length ? links.map(l => `<div class="admin-user-item"><a href="${l.url}" target="_blank" style="color:var(--accent);">${escHtml(l.title)}</a><button class="btn-danger" onclick="deleteLink('${l.id}')" style="padding:4px 10px;font-size:0.75rem;">🗑</button></div>`).join('') : '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No links yet</div>';
}

async function deleteLink(id) {
  if (!confirm('Delete this link?')) return;
  await fetch(`/api/links/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  toast('Link deleted', 'success');
  loadLinksAdmin(); loadHomeWidgets();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
}

async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    if (await reg.pushManager.getSubscription()) return;
    if (Notification.permission === 'denied') return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const keyRes = await fetch('/api/vapid-public-key');
    const { key } = await keyRes.json();
    if (!key) return;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await fetch('/api/push-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser, subscription: sub }) });
  } catch {}
}

async function sendPushNotification() {
  const title = document.getElementById('pushTitle').value.trim();
  const body = document.getElementById('pushBody').value.trim();
  if (!title || !body) { toast('Title aur message dono likho', 'error'); return; }
  const res = await fetch('/api/send-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, title, body }) });
  if (res.ok) { const d = await res.json(); toast(`Sent! (${d.sent} delivered)`, 'success'); document.getElementById('pushTitle').value=''; document.getElementById('pushBody').value=''; }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function updateStudyStreak() {
  try {
    const res = await fetch('/api/streak/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });
    if (!res.ok) return;
    const d = await res.json();
    const badge = document.getElementById('streakBadge');
    const count = document.getElementById('streakCount');
    if (badge && count) {
      count.textContent = d.current;
      badge.classList.remove('hidden');
    }
    if (d.current > 1) {
      setTimeout(() => toast(`🔥 ${d.current}-day streak! Keep going!`, 'success'), 1200);
    }
  } catch {}
}

// ══════════════════════════════════════════════════
// STUDY LIGHT (main app navbar)
// ══════════════════════════════════════════════════
const appLampBtn = document.getElementById('appLampBtn');
const appLampGlows = [1, 2, 3, 4].map(n => document.getElementById(`appLampGlow${n}`));
appLampBtn?.addEventListener('click', () => {
  appLampBtn.classList.toggle('on');
  appLampGlows.forEach(g => g?.classList.toggle('on'));
});

// ══════════════════════════════════════════════════
// STUDY TIMER (stopwatch)
// ══════════════════════════════════════════════════
let studySeconds = 0;
let studyInterval = null;
let studyRunning = false;

function formatStudyTime(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function toggleStudyTimer() {
  const btn = document.getElementById('timerToggleBtn');
  const display = document.getElementById('timerDisplay');
  if (!studyRunning) {
    studyRunning = true;
    btn.textContent = '⏸ Pause';
    display.classList.remove('hidden');
    studyInterval = setInterval(() => {
      studySeconds++;
      display.textContent = formatStudyTime(studySeconds);
    }, 1000);
  } else {
    studyRunning = false;
    btn.textContent = '⏱ Resume';
    clearInterval(studyInterval);
  }
}

function stopStudyTimer() {
  studyRunning = false;
  clearInterval(studyInterval);
  studySeconds = 0;
  const btn = document.getElementById('timerToggleBtn');
  const display = document.getElementById('timerDisplay');
  if (btn) btn.textContent = '⏱ Start';
  if (display) { display.textContent = '00:00:00'; display.classList.add('hidden'); }
}

document.getElementById('timerToggleBtn')?.addEventListener('click', toggleStudyTimer);

// ══════════════════════════════════════════════════
// THEME SWITCHER
// ══════════════════════════════════════════════════

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
  localStorage.setItem('studyhub_theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.theme-btn-${theme}`)?.classList.add('active');
}
// ══════════════════════════════════════════════════
// MINI GAME — Study Break Runner (Dino-style)
// ══════════════════════════════════════════════════
let gameCtx, gameCanvas, gameRunning = false, gameLoopId = null;
let dino, obstacles, gameSpeed, score, gameBest = parseInt(localStorage.getItem('studyhub_game_best') || '0');

function openGameModal() {
  openModal('gameModal');
  gameCanvas = document.getElementById('gameCanvas');
  gameCtx = gameCanvas.getContext('2d');
  resizeGameCanvas();
  document.getElementById('gameBest').textContent = gameBest;
  resetGameState();
  drawGame();
  document.getElementById('gameOverlay').classList.remove('hidden');
  document.getElementById('gameOverlayText').textContent = 'Tap or press Space to start';
  if (window.innerWidth <= 768) {
    const btn = document.getElementById('mobileJumpBtn');
    btn.classList.remove('hidden');
    btn.classList.add('show');
  }
}

function resizeGameCanvas() {
  const isMobile = window.innerWidth <= 768;
  gameCanvas.width = isMobile ? 340 : 700;
  gameCanvas.height = isMobile ? 160 : 220;
}

function closeGameModal() {
  gameRunning = false;
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  closeModal('gameModal');
  const btn = document.getElementById('mobileJumpBtn');
  btn.classList.add('hidden');
  btn.classList.remove('show');
}

function resetGameState() {
  const groundY = gameCanvas.height - 50;
  dino = { x: 40, y: groundY, groundY, w: 24, h: 36, vy: 0, jumping: false, legPhase: 0 };
  obstacles = [];
  gameSpeed = 3.2;
  score = 0;
  document.getElementById('gameScore').textContent = '0';
}

function startGame() {
  resetGameState();
  document.getElementById('gameOverlay').classList.add('hidden');
  gameRunning = true;
  loopGame();
}

function jumpDino() {
  if (!gameRunning) { startGame(); return; }
  if (!dino.jumping) {
    dino.jumping = true;
    dino.vy = -11;
  }
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('gameModal')?.classList.contains('hidden')) {
    if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jumpDino(); }
  }
});
document.getElementById('gameCanvas')?.addEventListener('click', jumpDino);
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gameCanvas')?.addEventListener('click', jumpDino);
  document.getElementById('gameOverlay')?.addEventListener('click', jumpDino);
  document.getElementById('mobileJumpBtn')?.addEventListener('click', jumpDino);
});
window.addEventListener('resize', () => {
  if (gameCanvas && !document.getElementById('gameModal')?.classList.contains('hidden')) {
    resizeGameCanvas();
    if (dino) { dino.groundY = gameCanvas.height - 50; if (!dino.jumping) dino.y = dino.groundY; }
  }
});

function loopGame() {
  if (!gameRunning) return;

  dino.vy += 0.6;
  dino.y += dino.vy;
  if (dino.y >= dino.groundY) { dino.y = dino.groundY; dino.vy = 0; dino.jumping = false; }

  if (Math.random() < 0.02 && (!obstacles.length || obstacles[obstacles.length - 1].x < gameCanvas.width * 0.6)) {
    obstacles.push({ x: gameCanvas.width, y: dino.groundY + 5, w: 16, h: 28 });
  }
  obstacles.forEach(o => o.x -= gameSpeed);
  obstacles = obstacles.filter(o => o.x + o.w > 0);

  for (const o of obstacles) {
    if (dino.x < o.x + o.w && dino.x + dino.w > o.x && dino.y < o.y + o.h && dino.y + dino.h > o.y) {
      endGame();
      return;
    }
  }

  score += 1;
  gameSpeed = Math.min(3.2 + Math.floor(score / 800) * 0.3, 6.5);
  dino.legPhase += 0.35;
  document.getElementById('gameScore').textContent = Math.floor(score / 10);

  drawGame();
  gameLoopId = requestAnimationFrame(loopGame);
}

function drawGame() {
  const w = gameCanvas.width, h = gameCanvas.height;
  gameCtx.clearRect(0, 0, w, h);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  gameCtx.fillStyle = isDark ? '#e8eaf6' : '#1a1612';

  gameCtx.strokeStyle = isDark ? '#404460' : '#cdc7bc';
  gameCtx.beginPath();
  gameCtx.moveTo(0, dino.groundY + 34);
  gameCtx.lineTo(w, dino.groundY + 34);
  gameCtx.stroke();

  drawRunner(dino);

  obstacles.forEach(o => gameCtx.fillRect(o.x, o.y, o.w, o.h));
}

function drawRunner(d) {
  const cx = d.x + d.w / 2;
  const headR = 6;
  const headY = d.y + headR;
  const bodyTopY = d.y + headR * 2;
  const bodyBottomY = d.y + d.h - 8;

  // head
  gameCtx.beginPath();
  gameCtx.arc(cx, headY, headR, 0, Math.PI * 2);
  gameCtx.fill();

  // body
  gameCtx.beginPath();
  gameCtx.moveTo(cx, bodyTopY);
  gameCtx.lineTo(cx, bodyBottomY);
  gameCtx.lineWidth = 3;
  gameCtx.strokeStyle = gameCtx.fillStyle;
  gameCtx.stroke();

  // arms (swing opposite to legs)
  const armSwing = Math.sin(d.legPhase) * 8;
  gameCtx.beginPath();
  gameCtx.moveTo(cx, bodyTopY + 6);
  gameCtx.lineTo(cx - 7, bodyTopY + 14 + armSwing * 0.3);
  gameCtx.moveTo(cx, bodyTopY + 6);
  gameCtx.lineTo(cx + 7, bodyTopY + 14 - armSwing * 0.3);
  gameCtx.stroke();

  // legs (animated running motion, or straight if jumping)
  if (d.jumping) {
    gameCtx.beginPath();
    gameCtx.moveTo(cx, bodyBottomY);
    gameCtx.lineTo(cx - 6, bodyBottomY + 8);
    gameCtx.moveTo(cx, bodyBottomY);
    gameCtx.lineTo(cx + 6, bodyBottomY + 8);
    gameCtx.stroke();
  } else {
    const legSwing = Math.sin(d.legPhase) * 10;
    gameCtx.beginPath();
    gameCtx.moveTo(cx, bodyBottomY);
    gameCtx.lineTo(cx - 6 + legSwing * 0.4, bodyBottomY + 10);
    gameCtx.moveTo(cx, bodyBottomY);
    gameCtx.lineTo(cx + 6 - legSwing * 0.4, bodyBottomY + 10);
    gameCtx.stroke();
  }
}

function endGame() {
  gameRunning = false;
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  const finalScore = Math.floor(score / 10);
  if (finalScore > gameBest) {
    gameBest = finalScore;
    localStorage.setItem('studyhub_game_best', gameBest);
    document.getElementById('gameBest').textContent = gameBest;
  }
  document.getElementById('gameOverlay').classList.remove('hidden');
  document.getElementById('gameOverlayText').textContent = `💥 Game Over! Score: ${finalScore} — tap to retry`;
}

// ══════════════════════════════════════════════════
// SNAKE GAME
// ══════════════════════════════════════════════════
let snakeCanvas, snakeCtx;
let snakeCellSize = 20;
let snakeCols = 22, snakeRows = 22;
let snakeBody = [];
let snakeDir = { x: 1, y: 0 };
let snakeNextDir = { x: 1, y: 0 };
let snakeFood = { x: 5, y: 5, super: false };
let snakeRunning = false;
let snakeTimeoutId = null;
let snakeScoreVal = 0;
let snakeBestVal = parseInt(localStorage.getItem('studyhub_snake_best') || '0');
let snakeFoodsEaten = 0;
const snakeBaseDelay = 130;

function resizeSnakeCanvas() {
  const isMobile = window.innerWidth <= 768;
  snakeCellSize = isMobile ? 14 : 18;
  snakeCols = isMobile ? 20 : 22;
  snakeRows = isMobile ? 20 : 22;
  snakeCanvas.width = snakeCols * snakeCellSize;
  snakeCanvas.height = snakeRows * snakeCellSize;
}

function openSnakeModal() {
  openModal('snakeModal');
  snakeCanvas = document.getElementById('snakeCanvas');
  snakeCtx = snakeCanvas.getContext('2d');
  resizeSnakeCanvas();
  document.getElementById('snakeBest').textContent = snakeBestVal;
  resetSnakeState();
  drawSnake();
  document.getElementById('snakeOverlay').classList.remove('hidden');
  document.getElementById('snakeOverlayText').textContent = 'Tap Play or use the joystick to start';
  setupSnakeJoystick();
}

function closeSnakeModal() {
  snakeRunning = false;
  if (snakeTimeoutId) clearTimeout(snakeTimeoutId);
  closeModal('snakeModal');
  document.getElementById('snakeWinnerOverlay')?.remove();
}

function resetSnakeState() {
  const midX = Math.floor(snakeCols / 2), midY = Math.floor(snakeRows / 2);
  snakeBody = [{ x: midX, y: midY }, { x: midX - 1, y: midY }, { x: midX - 2, y: midY }];
  snakeDir = { x: 1, y: 0 };
  snakeNextDir = { x: 1, y: 0 };
  snakeScoreVal = 0;
  snakeFoodsEaten = 0;
  document.getElementById('snakeScore').textContent = '0';
  placeSnakeFood();
  document.getElementById('snakeWinnerOverlay')?.remove();
}

function placeSnakeFood() {
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * snakeCols), y: Math.floor(Math.random() * snakeRows) };
  } while (snakeBody.some(s => s.x === pos.x && s.y === pos.y));
  const isSuper = snakeFoodsEaten > 0 && snakeFoodsEaten % 5 === 0;
  snakeFood = { x: pos.x, y: pos.y, super: isSuper };
}

function startSnakeGame() {
  resetSnakeState();
  document.getElementById('snakeOverlay').classList.add('hidden');
  snakeRunning = true;
  snakeLoop();
}

function snakeSetDir(dir) {
  if (!snakeRunning) { startSnakeGame(); return; }
  if (dir === 'up' && snakeDir.y === 0) snakeNextDir = { x: 0, y: -1 };
  else if (dir === 'down' && snakeDir.y === 0) snakeNextDir = { x: 0, y: 1 };
  else if (dir === 'left' && snakeDir.x === 0) snakeNextDir = { x: -1, y: 0 };
  else if (dir === 'right' && snakeDir.x === 0) snakeNextDir = { x: 1, y: 0 };
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('snakeModal')?.classList.contains('hidden')) {
    if (e.key === 'ArrowUp') { e.preventDefault(); snakeSetDir('up'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); snakeSetDir('down'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); snakeSetDir('left'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); snakeSetDir('right'); }
  }
});

window.addEventListener('resize', () => {
  if (snakeCanvas && !document.getElementById('snakeModal')?.classList.contains('hidden')) {
    resizeSnakeCanvas();
    drawSnake();
  }
});

// ── Circular Joystick ──
function setupSnakeJoystick() {
  const joystick = document.getElementById('snakeJoystick');
  const knob = document.getElementById('snakeJoystickKnob');
  if (!joystick || joystick.dataset.bound) return;
  joystick.dataset.bound = '1';

  let active = false;
  const maxDist = 40;

  function handleMove(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * dist;
    const ky = Math.sin(angle) * dist;
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

    if (dist > 12) {
      const deg = angle * 180 / Math.PI;
      if (deg >= -45 && deg < 45) snakeSetDir('right');
      else if (deg >= 45 && deg < 135) snakeSetDir('down');
      else if (deg >= -135 && deg < -45) snakeSetDir('up');
      else snakeSetDir('left');
    }
  }

  function resetKnob() {
    knob.style.transform = 'translate(-50%, -50%)';
  }

  joystick.addEventListener('touchstart', (e) => { active = true; e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  joystick.addEventListener('touchmove', (e) => { if (active) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  joystick.addEventListener('touchend', () => { active = false; resetKnob(); });

  joystick.addEventListener('mousedown', (e) => { active = true; handleMove(e.clientX, e.clientY); });
  document.addEventListener('mousemove', (e) => { if (active) handleMove(e.clientX, e.clientY); });
  document.addEventListener('mouseup', () => { if (active) { active = false; resetKnob(); } });
}

function snakeLoop() {
  if (!snakeRunning) return;
  snakeDir = snakeNextDir;
  const head = { x: snakeBody[0].x + snakeDir.x, y: snakeBody[0].y + snakeDir.y };

  if (head.x < 0 || head.x >= snakeCols || head.y < 0 || head.y >= snakeRows) { endSnakeGame(false); return; }
  if (snakeBody.some(s => s.x === head.x && s.y === head.y)) { endSnakeGame(false); return; }

  snakeBody.unshift(head);

  if (head.x === snakeFood.x && head.y === snakeFood.y) {
    snakeScoreVal += snakeFood.super ? 3 : 1;
    snakeFoodsEaten++;
    document.getElementById('snakeScore').textContent = snakeScoreVal;
    if (snakeFood.super) {
      snakeBody.push({ ...snakeBody[snakeBody.length - 1] });
      snakeBody.push({ ...snakeBody[snakeBody.length - 1] });
    }
    if (snakeBody.length >= snakeCols * snakeRows) { endSnakeGame(true); return; }
    placeSnakeFood();
  } else {
    snakeBody.pop();
  }

  drawSnake();

  const delay = Math.min(snakeBaseDelay + snakeBody.length * 1.5, 220);
  snakeTimeoutId = setTimeout(snakeLoop, delay);
}

function drawSnake() {
  const w = snakeCanvas.width, h = snakeCanvas.height;
  snakeCtx.clearRect(0, 0, w, h);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  snakeCtx.strokeStyle = isDark ? '#404460' : '#cdc7bc';
  snakeCtx.lineWidth = 2;
  snakeCtx.strokeRect(1, 1, w - 2, h - 2);

  // Food
  const fx = snakeFood.x * snakeCellSize + snakeCellSize / 2;
  const fy = snakeFood.y * snakeCellSize + snakeCellSize / 2;
  const foodR = snakeFood.super ? snakeCellSize / 1.8 : snakeCellSize / 2.6;
  snakeCtx.fillStyle = snakeFood.super ? '#ffd873' : (isDark ? '#f07050' : '#c84b31');
  snakeCtx.beginPath();
  snakeCtx.arc(fx, fy, foodR - 2, 0, Math.PI * 2);
  snakeCtx.fill();
  if (snakeFood.super) {
    snakeCtx.strokeStyle = '#c47a1e';
    snakeCtx.lineWidth = 2;
    snakeCtx.stroke();
  }

  // Body (rounded segments)
  snakeBody.forEach((seg, i) => {
    const isHead = i === 0;
    const cx = seg.x * snakeCellSize + snakeCellSize / 2;
    const cy = seg.y * snakeCellSize + snakeCellSize / 2;
    const r = (snakeCellSize / 2) - 1;
    snakeCtx.fillStyle = isHead ? (isDark ? '#4ade9a' : '#2d7a5b') : (isDark ? '#3a5a48' : '#8fc4a8');
    snakeCtx.beginPath();
    snakeCtx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.6);
    snakeCtx.fill();

    if (isHead) {
      const eyeOffsetX = snakeDir.x !== 0 ? snakeDir.x * (r * 0.35) : r * 0.35;
      const eyeOffsetY = snakeDir.y !== 0 ? snakeDir.y * (r * 0.35) : -r * 0.35;
      snakeCtx.fillStyle = '#1a1612';
      snakeCtx.beginPath();
      snakeCtx.arc(cx + eyeOffsetX - (snakeDir.y !== 0 ? r * 0.35 : 0), cy + eyeOffsetY - (snakeDir.x !== 0 ? r * 0.35 : 0), r * 0.16, 0, Math.PI * 2);
      snakeCtx.arc(cx + eyeOffsetX + (snakeDir.y !== 0 ? r * 0.35 : 0), cy + eyeOffsetY + (snakeDir.x !== 0 ? r * 0.35 : 0), r * 0.16, 0, Math.PI * 2);
      snakeCtx.fill();
    }
  });
}

function endSnakeGame(won) {
  snakeRunning = false;
  if (snakeTimeoutId) clearTimeout(snakeTimeoutId);
  if (snakeScoreVal > snakeBestVal) {
    snakeBestVal = snakeScoreVal;
    localStorage.setItem('studyhub_snake_best', snakeBestVal);
    document.getElementById('snakeBest').textContent = snakeBestVal;
  }
  if (won) {
    const wrap = document.querySelector('.snake-wrap');
    const overlay = document.createElement('div');
    overlay.id = 'snakeWinnerOverlay';
    overlay.className = 'snake-winner-overlay';
    overlay.innerHTML = `<div class="snake-crown">👑</div><div class="snake-winner-text">WINNER</div>`;
    wrap.appendChild(overlay);
  } else {
    document.getElementById('snakeOverlay').classList.remove('hidden');
    document.getElementById('snakeOverlayText').textContent = `💥 Game Over! Score: ${snakeScoreVal} — tap Play to retry`;
  }
}

// ══════════════════════════════════════════════════
// ATTENDANCE CALCULATOR
// ══════════════════════════════════════════════════
function openAttendanceModal() {
  document.getElementById('attTotalLecture').value = '';
  document.getElementById('attTotalAbsent').value = '';
  document.getElementById('attTotalOAA').value = '';
  document.getElementById('attResult').textContent = '';
  openModal('attendanceModal');
}

function calcAttendance() {
  const totalLecture = parseFloat(document.getElementById('attTotalLecture').value);
  const totalAbsent = parseFloat(document.getElementById('attTotalAbsent').value) || 0;
  const totalOAA = parseFloat(document.getElementById('attTotalOAA').value) || 0;
  if (!totalLecture || totalLecture <= 0) { toast('Total Lecture sahi bharo', 'error'); return; }
  const percentage = 100 - (((totalAbsent - totalOAA) / totalLecture) * 100);
  const el = document.getElementById('attResult');
  el.textContent = `${percentage.toFixed(2)}%`;
  el.style.color = percentage >= 75 ? 'var(--green)' : 'var(--accent)';
}

// ══════════════════════════════════════════════════
// CHATBOT (Keyword-based, no API, 100% free)
// ══════════════════════════════════════════════════
let chatbotSelectedFile = null;

function openChatbotModal() { openModal('chatbotModal'); }

function handleChatbotFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('File 50MB se bada hai', 'error'); e.target.value = ''; return; }
  chatbotSelectedFile = file;
  document.getElementById('chatbotFileName').textContent = `📎 ${file.name}`;
  document.getElementById('chatbotFileChip').classList.remove('hidden');
}

function clearChatbotFile() {
  chatbotSelectedFile = null;
  document.getElementById('chatbotFileInput').value = '';
  document.getElementById('chatbotFileChip').classList.add('hidden');
}

async function sendChatbotMessage() {
  const input = document.getElementById('chatbotInput');
  const query = input.value.trim();
  if (!query && !chatbotSelectedFile) return;

  const messages = document.getElementById('chatbotMessages');
  const userLabel = query || (chatbotSelectedFile ? `📎 ${chatbotSelectedFile.name}` : '');
  messages.insertAdjacentHTML('beforeend', `<div style="align-self:flex-end;background:var(--accent-light);color:var(--accent);padding:10px 14px;border-radius:14px;max-width:80%;">${escHtml(userLabel)}</div>`);
  input.value = '';
  messages.scrollTop = messages.scrollHeight;

  const loadingId = 'load-' + Date.now();
  messages.insertAdjacentHTML('beforeend', `<div id="${loadingId}" style="align-self:flex-start;color:var(--text3);font-size:0.85rem;">Searching...</div>`);
  messages.scrollTop = messages.scrollHeight;

  try {
    const formData = new FormData();
    formData.append('query', query);
    if (currentNoteCourse) formData.append('course', currentNoteCourse);
    if (currentNoteSubject) formData.append('subject', currentNoteSubject);
    if (chatbotSelectedFile) formData.append('file', chatbotSelectedFile);

    const res = await fetch('/api/chatbot', { method: 'POST', body: formData });
    const data = await res.json();
    document.getElementById(loadingId)?.remove();
    if (res.ok) {
      messages.insertAdjacentHTML('beforeend', `<div style="align-self:flex-start;background:var(--bg2);padding:10px 14px;border-radius:14px;max-width:85%;white-space:pre-wrap;">${escHtml(data.answer)}</div>`);
    } else {
      messages.insertAdjacentHTML('beforeend', `<div style="align-self:flex-start;color:var(--accent);">${escHtml(data.error || 'Error')}</div>`);
    }
  } catch {
    document.getElementById(loadingId)?.remove();
    messages.insertAdjacentHTML('beforeend', `<div style="align-self:flex-start;color:var(--accent);">Connection failed</div>`);
  }
  clearChatbotFile();
  messages.scrollTop = messages.scrollHeight;
}