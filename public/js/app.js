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

  const device = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
  const historyRes = await fetch('/api/login-history', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, device })
  });
  if (!historyRes.ok) {
    const d = await historyRes.json().catch(() => ({}));
    toast('⚠️ ' + (d.error || 'You cannot login with this name.'), 'error');
    return;
  }

  currentUser = name;
  localStorage.setItem('studyhub_user', name);

  document.documentElement.classList.remove('sh-restoring');
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userInitial').textContent = name[0].toUpperCase();
  document.getElementById('userName').textContent = name.toLowerCase() === SUPERADMIN_NAME ? 'Super Admin' : name;
  document.getElementById('noteAuthor').value = name;

  if (name.toLowerCase() === ADMIN_NAME || name.toLowerCase() === SUPERADMIN_NAME) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    document.getElementById('messageBtn').style.display = 'none';
  } else {
    checkUnreadMessages();
  }
  if (isSuperAdmin) {
    document.querySelectorAll('.superadmin-only').forEach(el => el.classList.remove('hidden'));
    loadAdminSettings();
  }

  showTopLoader();
  let savedView = null;
  try { savedView = JSON.parse(localStorage.getItem('studyhub_last_view') || 'null'); } catch {}
  if (savedView) {
    currentNoteCourse = savedView.noteCourse || null;
    currentNoteSubject = savedView.noteSubject || null;
  }

  socket.emit('user_join', name);
  await loadCoursesForUpload();
  checkAndShowNotifPrompt();
  await loadNotes();
  loadQuestions();
  loadAnnouncements();
  loadHomeWidgets();
  toast(`Welcome, ${name}! 👋`, 'success');
  updateStudyStreak();
  await restoreLastView();
  hideTopLoader();
}

function logout() { stopStudyTimer(); localStorage.removeItem('studyhub_user'); location.reload(); }

document.getElementById('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithValidation ? loginWithValidation() : loginUser(); });

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('studyhub_user');
  if (saved && saved.toLowerCase() !== ADMIN_NAME) {
    const FAKE_NAMES = ['hulk','superman','batman','spiderman','thor','naruto','goku','sasuke','ironman','xyz','abc','aaa','zzz','asdf','qwerty','zxcv','test','user','anjli','guest','noname','anonymous','foo','bar'];
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
      document.documentElement.classList.remove('sh-restoring');
    } else {
      document.getElementById('nameInput').value = saved;
      const restoreFailSafe = setTimeout(() => {
        document.documentElement.classList.remove('sh-restoring');
        toast('⚠️ Session restore is taking longer than usual...', 'error');
      }, 8000);
      loginUser().catch(() => {
        toast('⚠️ Could not restore session. Please login again.', 'error');
      }).finally(() => {
        clearTimeout(restoreFailSafe);
        document.documentElement.classList.remove('sh-restoring');
      });
    }
  } else {
    document.documentElement.classList.remove('sh-restoring');
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
  localStorage.setItem('studyhub_last_view', JSON.stringify(state));
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
  showTopLoader();
  setTimeout(hideTopLoader, 350);
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

async function checkFolderUnlock(prefix, id, name, obj) {
  if (!obj?.locked) return true;
  const sessionKey = `sh_unlocked_${prefix}_${id}`;
  if (sessionStorage.getItem(sessionKey) === 'yes') return true;
  const pwd = prompt(`"${name}" is locked. Enter password:`);
  if (pwd === null) return false;
  const res = await fetch(`/api/${prefix}/${id}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
  const d = await res.json();
  if (d.ok) { sessionStorage.setItem(sessionKey, 'yes'); return true; }
  toast('❌ Wrong password', 'error');
  return false;
}

async function refreshFolderView(prefix) {
  if (prefix === 'courses') { await loadCoursesForUpload(); renderNoteCourses(); }
  else if (prefix === 'subjects') { if (currentNoteCourse) await openNoteCourse(currentNoteCourse); }
  else if (prefix === 'timetable-sections') { await loadTimetables(); }
}

async function lockFolder(prefix, id) {
  const pwd = prompt('Set a password to lock this folder:');
  if (!pwd) return;
  const res = await fetch(`/api/${prefix}/${id}/lock`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, password: pwd }) });
  if (res.ok) { toast('Folder locked 🔒', 'success'); await refreshFolderView(prefix); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function unlockFolder(prefix, id) {
  if (!confirm('Remove the lock on this folder?')) return;
  const res = await fetch(`/api/${prefix}/${id}/unlock`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Folder unlocked 🔓', 'success'); await refreshFolderView(prefix); }
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
  const menuHeight = 230, menuWidth = 160;
  if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight;
  if (top < 10) top = 10;
  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  const safeName = name.replace(/'/g,"\\'");
  const dbC = allCourses.find(c => c.id === id);
  const lockBtn = dbC?.locked
    ? `<button onclick="unlockFolder('courses','${id}');document.getElementById('folderCtxMenu')?.remove();">🔓 Unlock</button>`
    : `<button onclick="lockFolder('courses','${id}');document.getElementById('folderCtxMenu')?.remove();">🔒 Lock Folder</button>`;
  const wpBtnC = dbC?.wallpaper_url
    ? `<button onclick="removeWallpaper('courses','${id}');document.getElementById('folderCtxMenu')?.remove();">🗑️ Remove Wallpaper</button>`
    : '';
  menu.innerHTML = `
    <button onclick="renameCourse('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();">✏️ Rename</button>
    ${lockBtn}
    <button onclick="triggerWallpaperUpload('courses','${id}');document.getElementById('folderCtxMenu')?.remove();">🖼️ Set Wallpaper</button>
    ${wpBtnC}
    <button onclick="deleteCourse('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();" style="color:#d9534f;">🗑 Delete</button>
  `;
  document.body.appendChild(menu);
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.bottom > window.innerHeight - 10) {
    menu.style.top = Math.max(10, window.innerHeight - menuRect.height - 10) + 'px';
  }
  if (menuRect.right > window.innerWidth - 10) {
    menu.style.left = Math.max(10, window.innerWidth - menuRect.width - 10) + 'px';
  }
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
    const wp = dbCourse?.wallpaper_url;
    return `
      <div class="note-card course-card ${wp ? 'has-wallpaper' : ''}" style="position:relative;${wp ? `background-image:url('${wp}')` : ''}">
        ${isAdmin && dbCourse ? `<button onclick="showFolderContextMenu(event,'${dbCourse.id}','${safeC}')" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2);padding:2px 8px;z-index:2;">⋮</button>` : ''}
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
  const dbC = allCourses.find(c => c.name === course);
  if (dbC && !(await checkFolderUnlock('courses', dbC.id, course, dbC))) return;
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
    const wpSub = dbSub?.wallpaper_url;
    return `
      <div class="note-card course-card ${wpSub ? 'has-wallpaper' : ''}" style="position:relative;${wpSub ? `background-image:url('${wpSub}')` : ''}">
        ${isAdmin && dbSub ? `<button onclick="showSubjectContextMenu(event,'${dbSub.id}','${safeSub}')" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2);padding:2px 8px;z-index:2;">⋮</button>` : ''}
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
  const dbS = currentCourseSubjects.find(s => s.id === id);
  const lockBtnS = dbS?.locked
    ? `<button onclick="unlockFolder('subjects','${id}');document.getElementById('folderCtxMenu')?.remove();">🔓 Unlock</button>`
    : `<button onclick="lockFolder('subjects','${id}');document.getElementById('folderCtxMenu')?.remove();">🔒 Lock Folder</button>`;
  const wpBtnS = dbS?.wallpaper_url
    ? `<button onclick="removeWallpaper('subjects','${id}');document.getElementById('folderCtxMenu')?.remove();">🗑️ Remove Wallpaper</button>`
    : '';
  menu.innerHTML = `
    <button onclick="renameSubject('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();">✏️ Rename</button>
    ${lockBtnS}
    <button onclick="triggerWallpaperUpload('subjects','${id}');document.getElementById('folderCtxMenu')?.remove();">🖼️ Set Wallpaper</button>
    ${wpBtnS}
    <button onclick="deleteSubject('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();" style="color:#d9534f;">🗑 Delete</button>
  `;
  document.body.appendChild(menu);
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.bottom > window.innerHeight - 10) {
    menu.style.top = Math.max(10, window.innerHeight - menuRect.height - 10) + 'px';
  }
  if (menuRect.right > window.innerWidth - 10) {
    menu.style.left = Math.max(10, window.innerWidth - menuRect.width - 10) + 'px';
  }
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      document.getElementById('folderCtxMenu')?.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 0);
}

async function openNoteSubject(subject) {
  const dbS = currentCourseSubjects.find(s => s.name === subject);
  if (dbS && !(await checkFolderUnlock('subjects', dbS.id, subject, dbS))) return;
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

// Installed PWAs (Android/iOS "Add to Home Screen") run inside a WebView that has
// no native PDF plugin, so a direct <iframe src="file.pdf"> — and even the hosted
// PDF.js viewer, which itself needs to fetch the file cross-origin — can show a
// blank/dark screen there. Fetching the PDF ourselves and handing the iframe a
// local blob: URL sidesteps both problems: no cross-origin fetch, no plugin
// dependency — the browser's own PDF renderer just opens the local blob data.
// Works identically on laptop and inside the installed app, no size cap.
// Android WebView (installed PWA) treats <iframe src="blob:...pdf"> as a download
// intent instead of rendering it — that's the stray "Open" link with a random ID
// you see inside the mobile app. Rendering the PDF ourselves onto <canvas> elements
// (via PDF.js as a library, not its iframe-based hosted viewer) avoids iframes
// entirely, so this WebView quirk never triggers. Works identically on laptop and
// inside the installed app. Page 1 renders first so the user sees something
// immediately; remaining pages render progressively in the background.
let pdfJsLoadPromise = null;
function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return Promise.resolve();
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load PDF renderer'));
    document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

async function renderPdfPage(pdf, pageNum, container, scaleMultiplier = 1, replaceFirstCanvas = false) {
  const page = await pdf.getPage(pageNum);
  const containerWidth = container.clientWidth || 600;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = (containerWidth / baseViewport.width) * scaleMultiplier;
  const viewport = page.getViewport({ scale });

  let canvas = replaceFirstCanvas ? container.querySelector('.pdf-preview-page') : null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'pdf-preview-page';
    container.appendChild(canvas);
  }
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function loadPdfIntoPreviewFrame(url) {
  const skeleton = document.getElementById('pdfPreviewLoading');
  const container = document.getElementById('pdfPreviewPages');
  if (!container) return;
  container.innerHTML = '';
  try {
    await ensurePdfJsLoaded();
    // Hand PDF.js the proxy URL directly instead of pre-fetching the whole file
    // ourselves — PDF.js then streams the file in range-requested chunks and can
    // start rendering page 1 as soon as its data arrives, instead of waiting for
    // the entire (possibly large) file to finish downloading first.
    const proxyUrl = `/api/proxy-file?url=${encodeURIComponent(url)}`;
    const pdf = await window.pdfjsLib.getDocument({ url: proxyUrl }).promise;

    // Fast, low-res first pass — renders far fewer pixels so it appears almost
    // instantly, replacing the skeleton right away instead of a "Loading..." wait.
    await renderPdfPage(pdf, 1, container, 0.45);
    if (skeleton) skeleton.remove();
    container.style.display = 'block';

    // Immediately swap the same canvas for a full-quality render, then continue
    // with the remaining pages in the background.
    renderPdfPage(pdf, 1, container, 1, true).catch(() => {});
    for (let pageNum = 2; pageNum <= pdf.numPages; pageNum++) {
      renderPdfPage(pdf, pageNum, container).catch(() => {});
    }
  } catch {
    if (skeleton) skeleton.innerHTML = '⚠️ Could not load preview here. Try "Open in New Tab" instead.';
  }
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
  let isPdfPreview = false;
  if (note.fileType === 'application/pdf') {
    isPdfPreview = true;
    content += `
      <div style="margin-bottom:10px;display:flex;gap:8px;justify-content:flex-end;">
        <a href="${fileUrl}" target="_blank" class="btn-secondary" style="padding:7px 16px;text-decoration:none;font-size:0.85rem;">🔗 Open in New Tab</a>
        <button class="btn-primary" style="padding:7px 16px;font-size:0.85rem;" onclick="downloadNote('${note.id}','${note.fileUrl}','${escHtml(note.fileName)}')">⬇ Download</button>
      </div>
      <div id="pdfPreviewLoading" class="pdf-skeleton"></div>
      <div id="pdfPreviewPages" style="width:100%;max-height:72vh;overflow-y:auto;border-radius:10px;background:#525659;display:none;padding:10px 0;"></div>`;
  } else if (note.fileType.startsWith('image/')) {
    content += `<img src="${fileUrl}" alt="${escHtml(note.title)}" />`;
  } else if (note.fileType.startsWith('video/')) {
    content += `<video src="${fileUrl}" controls style="width:100%;border-radius:10px;"></video>`;
  } else {
    content += `<div style="text-align:center;padding:40px;color:var(--text2);"><span style="font-size:3rem">${typeInfo.emoji}</span><p style="margin-top:12px;">Preview not available.</p><button class="btn-primary" style="margin-top:16px;" onclick="downloadNote('${note.id}','${note.fileUrl}','${escHtml(note.fileName)}')">⬇ Download to Open</button></div>`;
  }
  document.getElementById('previewContent').innerHTML = content;
  openModal('previewModal');
  if (isPdfPreview) loadPdfIntoPreviewFrame(fileUrl);
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
    const wpT = sec.wallpaper_url;
    return `
      <div class="note-card course-card ${wpT ? 'has-wallpaper' : ''}" style="position:relative;${wpT ? `background-image:url('${wpT}')` : ''}">
        ${isAdmin ? `<button onclick="showTTContextMenu(event,'${sec.id}','${safeName}')" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2);padding:2px 8px;z-index:2;">⋮</button>` : ''}
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
  if (top + 230 > window.innerHeight) top = rect.top - 230;
  if (top < 10) top = 10;
  if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
  menu.style.left = left + 'px'; menu.style.top = top + 'px';
  const safeName = name.replace(/'/g, "\\'");
  const dbT = allTTSections.find(s => s.id === id);
  const lockBtnT = dbT?.locked
    ? `<button onclick="unlockFolder('timetable-sections','${id}');document.getElementById('folderCtxMenu')?.remove();">🔓 Unlock</button>`
    : `<button onclick="lockFolder('timetable-sections','${id}');document.getElementById('folderCtxMenu')?.remove();">🔒 Lock Folder</button>`;
  const wpBtnT = dbT?.wallpaper_url
    ? `<button onclick="removeWallpaper('timetable-sections','${id}');document.getElementById('folderCtxMenu')?.remove();">🗑️ Remove Wallpaper</button>`
    : '';
  menu.innerHTML = `
    <button onclick="renameTTSection('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();">✏️ Rename</button>
    ${lockBtnT}
    <button onclick="triggerWallpaperUpload('timetable-sections','${id}');document.getElementById('folderCtxMenu')?.remove();">🖼️ Set Wallpaper</button>
    ${wpBtnT}
    <button onclick="deleteTTSection('${id}','${safeName}');document.getElementById('folderCtxMenu')?.remove();" style="color:#d9534f;">🗑 Delete</button>`;
  document.body.appendChild(menu);
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.bottom > window.innerHeight - 10) {
    menu.style.top = Math.max(10, window.innerHeight - menuRect.height - 10) + 'px';
  }
  if (menuRect.right > window.innerWidth - 10) {
    menu.style.left = Math.max(10, window.innerWidth - menuRect.width - 10) + 'px';
  }
  setTimeout(() => document.addEventListener('click', function c() { document.getElementById('folderCtxMenu')?.remove(); document.removeEventListener('click', c); }), 0);
}

async function loadSectionsForUpload() {
  const sel = document.getElementById('timetableSection');
  if (!sel) return;
  const res = await fetch('/api/timetable-sections');
  allTTSections = await res.json();
  sel.innerHTML = allTTSections.map(s => `<option value="${escHtml(s.name)}">${escHtml(s.name)}</option>`).join('');
}

async function openTimetableSection(section) {
  const dbT = allTTSections.find(s => s.name === section);
  if (dbT && !(await checkFolderUnlock('timetable-sections', dbT.id, section, dbT))) return;
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
  let isPdfPreview = false;
  if (t.fileType === 'application/pdf') {
    isPdfPreview = true;
    content += `
      <div style="margin-bottom:10px;display:flex;gap:8px;justify-content:flex-end;">
        <a href="${t.fileUrl}" target="_blank" class="btn-secondary" style="padding:7px 16px;text-decoration:none;font-size:0.85rem;">🔗 Open in New Tab</a>
      </div>
      <div id="pdfPreviewLoading" class="pdf-skeleton"></div>
      <div id="pdfPreviewPages" style="width:100%;max-height:72vh;overflow-y:auto;border-radius:10px;background:#525659;display:none;padding:10px 0;"></div>`;
  } else {
    content += `<img src="${t.fileUrl}" alt="${escHtml(t.section)}" />`;
  }
  document.getElementById('previewContent').innerHTML = content;
  openModal('previewModal');
  if (isPdfPreview) loadPdfIntoPreviewFrame(t.fileUrl);
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
  const btn = document.getElementById('submitQuestionBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }
  const res = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: currentUser, text }) });
  if (res.ok) { toast('Question posted! 📮', 'success'); closeModal('questionModal'); }
  else { const d = await res.json(); toast(d.error, 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = 'Post Question 📮'; }
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
  const btn = document.getElementById('submitReplyBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }
  const res = await fetch(`/api/questions/${questionId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: currentUser, text }) });
  if (res.ok) { toast('Reply posted! ✅', 'success'); closeModal('replyModal'); }
  else { const d = await res.json(); toast(d.error, 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = 'Post Reply ✅'; }
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

  const btn = document.getElementById('addEventBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

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
  if (btn) { btn.disabled = false; btn.textContent = '📅 Add Event'; }
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
    const confText = document.getElementById('confessionsBlockStatusText');
    const confBtn = document.getElementById('toggleConfessionsBtn');
    if (confText && confBtn) {
      if (data.confessions_disabled) {
        confText.textContent = '🚫 Disabled';
        confText.style.color = 'var(--accent)';
        confBtn.textContent = '✅ Enable Confessions';
      } else {
        confText.textContent = '✅ Active';
        confText.style.color = 'var(--green)';
        confBtn.textContent = '🚫 Disable Confessions Globally';
      }
    }
  } catch {}
}

async function toggleConfessionsDisabled() {
  const statusText = document.getElementById('confessionsBlockStatusText');
  const currentlyDisabled = statusText?.textContent.includes('Disabled');
  const res = await fetch('/api/admin-settings/confessions-toggle', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, disabled: !currentlyDisabled })
  });
  if (res.ok) { toast(currentlyDisabled ? 'Confessions enabled ✅' : 'Confessions disabled globally 🚫', 'success'); loadAdminSettings(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
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
  loadBlockedSenders();
  loadMsgGlobalStatus();
  if (isSuperAdmin) loadImageEditHistory();
  document.getElementById('statNotes').textContent = allNotes.length;
  document.getElementById('statQuestions').textContent = allQuestions.length;
  document.getElementById('statBlocked').textContent = blocked.length;
}

async function loadImageEditHistory() {
  const container = document.getElementById('imageEditHistoryList');
  if (!container) return;
  try {
    const res = await fetch(`/api/image-edit-history?requester=${encodeURIComponent(currentUser)}`);
    if (!res.ok) { container.innerHTML = ''; return; }
    const history = await res.json();
    if (!history.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No photo edits yet</div>'; return; }
    container.innerHTML = history.map(h => {
      const date = new Date(h.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const thumb = h.image_url
        ? `<img class="wallpaper-history-thumb" src="${h.image_url}" alt="${escHtml(h.username || '')}" />`
        : `<div class="wallpaper-history-removed">🗑️ Removed</div>`;
      return `<div class="wallpaper-history-item">
        ${thumb}
        <div class="wallpaper-history-meta">
          <div class="wallpaper-history-name">${escHtml(h.username || 'Unknown')}</div>
          <div class="wallpaper-history-sub">${escHtml(h.changes || 'Edited photo')} • ${date}</div>
        </div>
      </div>`;
    }).join('');
  } catch {}
}

async function checkUnreadMessages() {
  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(currentUser)}`);
    const messages = await res.json();
    const hasUnread = messages.some(m => m.reply && m.user_seen === false);
    document.getElementById('messageBtn')?.classList.toggle('has-unread', hasUnread);
  } catch {}
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
  const isSuper = isSuperAdmin;
  container.innerHTML = history.map(h => {
    const date = new Date(h.logged_in_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="admin-user-item"><div><strong style="font-size:0.88rem;">${escHtml(h.username)}</strong><span style="font-size:0.75rem;color:var(--text3);margin-left:8px;">${h.device === 'Mobile' ? '📱' : '💻'} ${h.device}</span></div><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:0.78rem;color:var(--text3);">${date}</span>${isSuper ? `<button class="btn-danger" onclick="deleteLoginEntry('${h.id}')" style="padding:3px 8px;font-size:0.72rem;">🗑</button>` : ''}</div></div>`;
  }).join('');
}

async function deleteLoginEntry(id) {
  const res = await fetch(`/api/login-history/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Entry removed 🗑', 'success'); loadLoginHistory(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
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
  const btn = document.getElementById('sendMessageBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  const res = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_user: currentUser, message: text }) });
  if (res.ok) { toast('Message sent to admin! 📨', 'success'); document.getElementById('messageText').value = ''; loadMyReplies(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = 'Send Message 📨'; }
}

async function loadMyReplies() {
  const container = document.getElementById('myReplies');
  if (!container) return;
  const res = await fetch(`/api/messages/${encodeURIComponent(currentUser)}`);
  const messages = await res.json();
  if (!messages.length) { container.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:0.85rem;padding:20px;">No messages yet — say hi! 👋</div>'; return; }
  container.innerHTML = messages.map(m => {
    const time = new Date(m.sent_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    let html = '';
    if (!m.admin_initiated) {
      html += `<div class="chat-bubble chat-bubble-me"><div class="chat-bubble-text">${escHtml(m.message)}</div><div class="chat-bubble-time">${time}</div></div>`;
    }
    if (m.reply) {
      html += `<div class="chat-bubble chat-bubble-admin"><div class="chat-bubble-text">${escHtml(m.reply)}</div><div class="chat-bubble-time">👑 Admin</div></div>`;
    } else if (!m.admin_initiated) {
      html += `<div class="chat-bubble-pending">⏳ Waiting for reply...</div>`;
    }
    return html;
  }).join('');
  container.scrollTop = container.scrollHeight;
  await fetch('/api/messages/mark-seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser }) });
  document.getElementById('messageBtn')?.classList.remove('has-unread');
}

async function loadMsgGlobalStatus() {
  try {
    const res = await fetch('/api/messages/settings');
    const data = await res.json();
    const statusText = document.getElementById('msgGlobalStatusText');
    const btn = document.getElementById('toggleMsgGlobalBtn');
    if (!statusText || !btn) return;
    if (data.messaging_disabled) {
      statusText.textContent = '🚫 Disabled'; statusText.style.color = 'var(--accent)';
      btn.textContent = '✅ Enable Messaging';
    } else {
      statusText.textContent = '✅ Active'; statusText.style.color = 'var(--green)';
      btn.textContent = '🚫 Stop All Messaging';
    }
  } catch {}
}

async function toggleMessagingGlobal() {
  const statusText = document.getElementById('msgGlobalStatusText');
  const currentlyDisabled = statusText?.textContent.includes('Disabled');
  const res = await fetch('/api/messages/toggle-all', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, disabled: !currentlyDisabled })
  });
  if (res.ok) { toast(currentlyDisabled ? 'Messaging enabled ✅' : 'All messaging stopped 🚫', 'success'); loadMsgGlobalStatus(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

let adminChatTargetUser = null;

async function openAdminChat(username) {
  adminChatTargetUser = username;
  document.getElementById('adminChatTitle').textContent = `✉️ ${username}`;
  await renderAdminChatThread();
  openModal('adminChatModal');
}

async function renderAdminChatThread() {
  const res = await fetch(`/api/messages/${encodeURIComponent(adminChatTargetUser)}`);
  const messages = await res.json();
  const container = document.getElementById('adminChatThread');
  container.innerHTML = messages.map(m => {
    const time = new Date(m.sent_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    let html = '';
    if (!m.admin_initiated) {
      html += `<div class="chat-bubble chat-bubble-admin"><div class="chat-bubble-text">${escHtml(m.message)}</div><div class="chat-bubble-time">${time}</div></div>`;
    }
    if (m.reply) {
      html += `<div class="chat-bubble chat-bubble-me"><div class="chat-bubble-text">${escHtml(m.reply)}</div><div class="chat-bubble-time">${time}</div></div>`;
    }
    return html;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendAdminChatMessage() {
  const input = document.getElementById('adminChatInput');
  const message = input.value.trim();
  if (!message || !adminChatTargetUser) return;
  const res = await fetch('/api/messages/admin-initiated', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, targetUser: adminChatTargetUser, message })
  });
  if (res.ok) { input.value = ''; await renderAdminChatThread(); loadAdminMessages(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function sendDirectMessage() {
  const targetUser = document.getElementById('directMsgUser').value.trim();
  const message = document.getElementById('directMsgText').value.trim();
  if (!targetUser || !message) { toast('Enter username and message', 'error'); return; }
  const res = await fetch('/api/messages/admin-initiated', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser, targetUser, message })
  });
  if (res.ok) { toast('Message sent! 📨', 'success'); document.getElementById('directMsgUser').value = ''; document.getElementById('directMsgText').value = ''; loadAdminMessages(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function blockSenderManual() {
  const name = document.getElementById('msgBlockInput').value.trim();
  if (!name) { toast('Enter a username', 'error'); return; }
  const res = await fetch('/api/messages/block-sender', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, targetUser: name }) });
  if (res.ok) { toast(`${name} can no longer message you 🚫`, 'success'); document.getElementById('msgBlockInput').value = ''; loadBlockedSenders(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function unblockSender(name) {
  const res = await fetch('/api/messages/unblock-sender', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser, targetUser: name }) });
  if (res.ok) { toast(`${name} can message you again ✅`, 'success'); loadBlockedSenders(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadBlockedSenders() {
  const container = document.getElementById('blockedSendersList');
  if (!container) return;
  const res = await fetch('/api/messages/blocked-senders');
  const senders = await res.json();
  container.innerHTML = senders.length ? senders.map(u => `<div class="admin-user-item"><span>🔇 ${escHtml(u)}</span><button class="btn-secondary" onclick="unblockSender('${escHtml(u)}')">Allow</button></div>`).join('') : '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No one is message-blocked</div>';
}

async function clearLoginHistory() {
  if (!confirm('Clear all login history? This cannot be undone.')) return;
  const res = await fetch('/api/login-history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Login history cleared 🗑', 'success'); loadLoginHistory(); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function loadAdminMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;
  const res = await fetch('/api/messages');
  const allMsgs = await res.json();
  if (!allMsgs.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No messages yet</div>'; return; }

  const byUser = {};
  allMsgs.forEach(m => {
    if (!byUser[m.from_user]) byUser[m.from_user] = [];
    byUser[m.from_user].push(m);
  });

  const contacts = Object.keys(byUser).map(u => {
    const msgs = byUser[u].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    const latest = msgs[0];
    const hasUnreplied = byUser[u].some(m => !m.admin_initiated && !m.reply);
    return { user: u, latest, hasUnreplied };
  }).sort((a, b) => new Date(b.latest.sent_at) - new Date(a.latest.sent_at));

  container.innerHTML = contacts.map(c => {
    const date = new Date(c.latest.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const preview = c.latest.admin_initiated ? c.latest.reply : c.latest.message;
    return `<div class="message-item-compact" style="cursor:pointer;" onclick="openAdminChat('${escHtml(c.user).replace(/'/g, "\\'")}')">
      <span class="msg-compact-from">👤 ${escHtml(c.user)}</span>
      <span class="msg-compact-text" title="${escHtml(preview)}">${escHtml(preview)}</span>
      <span class="msg-compact-time">${date}</span>
      ${c.hasUnreplied ? `<span class="msg-compact-badge" style="color:var(--accent);">🔴 Unreplied</span>` : ''}
    </div>`;
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
socket.on('message_reply', (msg) => {
  if (msg.from_user === currentUser && !isAdminUser()) {
    toast('📬 Admin replied to your message!', 'success');
    document.getElementById('messageBtn')?.classList.add('has-unread');
    if (!document.getElementById('messageModal')?.classList.contains('hidden')) loadMyReplies();
  }
  if (isAdminUser()) loadAdminMessages();
});
socket.on('new_event', () => { if (document.getElementById('tab-planner')?.classList.contains('active') === false) {} loadPlanner(); });
socket.on('event_deleted', () => { loadPlanner(); });
socket.on('new_quiz', () => { if (document.querySelector('[data-tab="quiz"]')?.classList.contains('active')) loadQuizList(); toast('🎯 New quiz added!', 'success'); });
socket.on('quiz_deleted', () => { loadQuizList(); });
socket.on('courses_locked', () => refreshFolderView('courses'));
socket.on('courses_unlocked', () => refreshFolderView('courses'));
socket.on('subjects_locked', () => { if (currentNoteCourse && !currentNoteSubject) openNoteCourse(currentNoteCourse); });
socket.on('subjects_unlocked', () => { if (currentNoteCourse && !currentNoteSubject) openNoteCourse(currentNoteCourse); });
socket.on('timetable-sections_locked', () => loadTimetables());
socket.on('timetable-sections_unlocked', () => loadTimetables());
socket.on('tt_section_added', () => loadTimetables());
socket.on('tt_section_renamed', () => loadTimetables());
socket.on('tt_section_deleted', () => loadTimetables());
socket.on('sender_blocked', () => loadBlockedSenders());
socket.on('sender_unblocked', () => loadBlockedSenders());
socket.on('login_history_cleared', () => loadLoginHistory());
socket.on('login_entry_deleted', () => loadLoginHistory());
socket.on('messaging_toggle_changed', () => loadMsgGlobalStatus());
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
    ['uploadModal', 'questionModal', 'replyModal', 'previewModal', 'messageModal', 'adminReplyModal', 'quizModal', 'quizResultModal', 'createQuizModal', 'timetableUploadModal', 'imgToolsModal', 'pdfToolsModal', 'mswordModal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
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
let gameCtx, gameCanvas, gameRunning = false, gameLoopId = null, gameLastTime = 0;
let dino, obstacles, gameSpeed, score, gameBest = parseInt(localStorage.getItem('studyhub_game_best') || '0');
const GAME_BASE_SPEED = 260;     // px per second (was ~192 before)
const GAME_MAX_SPEED = 560;      // px per second (was ~390 before)
const GAME_GRAVITY = 2400;       // px per second²
const GAME_JUMP_VELOCITY = -720; // px per second

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
  gameSpeed = GAME_BASE_SPEED;
  score = 0;
  gameLastTime = 0;
  document.getElementById('gameScore').textContent = '0';
}

function startGame() {
  resetGameState();
  document.getElementById('gameOverlay').classList.add('hidden');
  gameRunning = true;
  gameLoopId = requestAnimationFrame(loopGame);
}

function jumpDino() {
  if (!gameRunning) { startGame(); return; }
  if (!dino.jumping) {
    dino.jumping = true;
    dino.vy = GAME_JUMP_VELOCITY;
  }
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('gameModal')?.classList.contains('hidden')) {
    if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jumpDino(); }
  }
});
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

function loopGame(timestamp) {
  if (!gameRunning) return;
  if (!gameLastTime) gameLastTime = timestamp;
  const dt = Math.min((timestamp - gameLastTime) / 1000, 0.05); // cap so a stutter never causes a big jump
  gameLastTime = timestamp;

  dino.vy += GAME_GRAVITY * dt;
  dino.y += dino.vy * dt;
  if (dino.y >= dino.groundY) { dino.y = dino.groundY; dino.vy = 0; dino.jumping = false; }

  if (Math.random() < dt * 1.4 && (!obstacles.length || obstacles[obstacles.length - 1].x < gameCanvas.width * 0.6)) {
    obstacles.push({ x: gameCanvas.width, y: dino.groundY + 5, w: 16, h: 28 });
  }
  obstacles.forEach(o => o.x -= gameSpeed * dt);
  obstacles = obstacles.filter(o => o.x + o.w > 0);

  for (const o of obstacles) {
    if (dino.x < o.x + o.w && dino.x + dino.w > o.x && dino.y < o.y + o.h && dino.y + dino.h > o.y) {
      endGame();
      return;
    }
  }

  score += dt * 60;
  gameSpeed = Math.min(GAME_BASE_SPEED + Math.floor(score / 400) * 25, GAME_MAX_SPEED);
  dino.legPhase += dt * 21;
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
  snakeCellSize = isMobile ? 16 : 20;
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
  const isMobileDevice = window.innerWidth <= 640 || 'ontouchstart' in window;
  document.getElementById('snakeOverlayText').textContent = isMobileDevice ? 'Tap Play or use the joystick to start' : 'Tap Play or use arrow keys to start';
  const joyWrap = document.getElementById('snakeJoystickWrap');
  if (joyWrap) joyWrap.style.display = isMobileDevice ? 'flex' : 'none';
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
// ══════════════════════════════════════════════════
// ANONYMOUS CONFESSION
// ══════════════════════════════════════════════════
let confessionSubmitting = false;

function openConfessionModal() {
  openModal('confessionModal');
  loadConfessions();
}

function updateConfessionCharCount() {
  const text = document.getElementById('confessionText').value;
  document.getElementById('confessionCharCount').textContent = text.length;
}

function clearConfessionForm() {
  document.getElementById('confessionText').value = '';
  updateConfessionCharCount();
}

async function loadConfessions() {
  try {
    const res = await fetch('/api/confessions');
    const confessions = await res.json();
    renderConfessions(confessions);
  } catch {}
}

function renderConfessions(confessions) {
  const feed = document.getElementById('confessionFeed');
  const empty = document.getElementById('confessionEmpty');
  if (!confessions.length) { feed.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  feed.innerHTML = confessions.map(c => buildConfessionCardHTML(c)).join('');
}

function buildConfessionCardHTML(c) {
  const d = new Date(c.created_at);
  const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const isAdmin = isAdminUser();
  return `
    <div class="confession-card" id="confession-${c.id}">
      <div class="confession-card-header">
        <div class="confession-avatar">👤</div>
        <div>
          <div class="confession-anon-label">Anonymous</div>
          <div class="confession-datetime">${dateStr} • ${timeStr}</div>
        </div>
        ${isAdmin ? `<button class="btn-danger confession-delete-btn" onclick="deleteConfession('${c.id}')">🗑</button>` : ''}
      </div>
      <div class="confession-message">${escHtml(c.message)}</div>
      <div class="confession-card-footer">
        ${isAdmin ? `<button class="confession-like-btn" onclick="likeConfession('${c.id}')">❤️ <span id="confession-likes-${c.id}">${c.likes || 0}</span></button>` : `<span class="confession-like-display">❤️ ${c.likes || 0}</span>`}
        <button class="confession-copy-btn" onclick="copyConfession('${c.id}')">📋 Copy</button>
      </div>
    </div>`;
}

async function postConfession() {
  if (confessionSubmitting) return;
  const textEl = document.getElementById('confessionText');
  const message = textEl.value.trim();
  if (!message) { toast('Please write something first', 'error'); return; }
  if (message.length > 1000) { toast('Message too long (max 1000 characters)', 'error'); return; }

  confessionSubmitting = true;
  const btn = document.getElementById('confessionPostBtn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/confessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (res.ok) {
      toast('Posted anonymously! 🎭', 'success');
      clearConfessionForm();
      // Card is added via the 'new_confession' socket event below — not here — to avoid duplicates.
    } else {
      toast(data.error || 'Failed to post', 'error');
    }
  } catch { toast('Failed to post. Check your connection.', 'error'); }

  confessionSubmitting = false;
  btn.disabled = false;
}

async function likeConfession(id) {
  if (!isAdminUser()) return;
  try {
    const res = await fetch(`/api/confessions/${id}/like`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester: currentUser })
    });
    const data = await res.json();
    if (res.ok) {
      const el = document.getElementById(`confession-likes-${id}`);
      if (el) el.textContent = data.likes;
    } else { toast(data.error, 'error'); }
  } catch {}
}

async function deleteConfession(id) {
  if (!confirm('Delete this confession permanently?')) return;
  const res = await fetch(`/api/confessions/${id}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester: currentUser })
  });
  if (res.ok) toast('Confession deleted', 'success');
  else { const d = await res.json(); toast(d.error, 'error'); }
}

function copyConfession(id) {
  const card = document.getElementById(`confession-${id}`);
  const text = card?.querySelector('.confession-message')?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard 📋', 'success')).catch(() => toast('Copy failed', 'error'));
}

socket.on('new_confession', (c) => {
  if (document.getElementById(`confession-${c.id}`)) return; // prevent duplicate
  const feed = document.getElementById('confessionFeed');
  if (!feed) return;
  document.getElementById('confessionEmpty')?.classList.add('hidden');
  const card = document.createElement('div');
  card.innerHTML = buildConfessionCardHTML(c);
  const newCard = card.firstElementChild;
  newCard.classList.add('confession-card-new');
  feed.insertBefore(newCard, feed.firstChild);
  if (!document.getElementById('confessionModal')?.classList.contains('hidden')) {
    document.getElementById('confessionFeed').scrollTop = 0;
  }
});
socket.on('confession_liked', ({ id, likes }) => {
  const el = document.getElementById(`confession-likes-${id}`);
  if (el) el.textContent = likes;
});
socket.on('confession_deleted', (id) => {
  document.getElementById(`confession-${id}`)?.remove();
  const feed = document.getElementById('confessionFeed');
  if (feed && !feed.children.length) document.getElementById('confessionEmpty')?.classList.remove('hidden');
});
socket.on('confessions_toggle_changed', () => { if (isSuperAdmin) loadAdminSettings(); });
// ══════════════════════════════════════════════════
// KEYBOARD WARRIOR
// ══════════════════════════════════════════════════
const KW_WORDS = ['time','year','people','way','day','man','thing','woman','life','child','world','school','state','family','student','group','country','problem','hand','part','place','case','week','company','system','program','question','work','government','number','night','point','home','water','room','mother','area','money','story','fact','month','lot','right','study','book','eye','job','word','business','issue','side','kind','head','house','service','friend','father','power','hour','game','line','end','member','law','car','city','community','name','president','team','minute','idea','body','information','back','parent','face','others','level','office','door','health','person','art','war','history','party','result','change','morning','reason','research','girl','guy','moment','air','teacher','force','education','foot','boy','age','policy','process','music','market','sense','nation','plan','college','interest','death','experience','effect','use','class','control','care','field','development','role','effort','rate','heart','drug','show','leader','light','voice','wife','police','mind','price','report','decision','son','view','relationship','town','road','arm','ground','future','value','wood','industry','media','court','staff','future','position','million','coffee','baseball','impact','south','environment','event','military','clock','stage','vote','picture','author','magic','ocean','dragon','castle','forest','shadow','thunder','flame','crystal','journey','warrior','legend','battle','victory','ancient','mystery','phantom','glacier','horizon','whisper','cascade','emerald','falcon','saber','quantum','nebula','vortex','crimson','frontier','tempest','labyrinth','sanctuary','avalanche'];

const KW_DIFFICULTY = {
  easy: { minLen: 3, maxLen: 5, timeLimit: 5000, enemyHealth: 60, healthStep: 8, comboCrit: 6, damageMul: 1 },
  medium: { minLen: 4, maxLen: 7, timeLimit: 3800, enemyHealth: 90, healthStep: 12, comboCrit: 5, damageMul: 1.15 },
  hard: { minLen: 6, maxLen: 9, timeLimit: 3000, enemyHealth: 130, healthStep: 16, comboCrit: 4, damageMul: 1.3 },
  insane: { minLen: 8, maxLen: 13, timeLimit: 2400, enemyHealth: 180, healthStep: 22, comboCrit: 3, damageMul: 1.5 }
};

let kwState = {
  running: false, diff: 'easy', wave: 1, playerHP: 100, playerMaxHP: 100,
  enemyHP: 100, enemyMaxHP: 100, combo: 0, bestCombo: 0, score: 0,
  currentWord: '', typedIdx: 0, wordStartTime: 0, lastWord: '',
  enemiesDefeated: 0, totalChars: 0, correctChars: 0, wordsCompleted: 0,
  startTime: 0, wordTimeoutId: null, animFrame: null,
  playerAttackAnim: 0, enemyAttackAnim: 0, enemyHitFlash: 0, playerHitFlash: 0,
  playerJab: 0, playerStagger: 0, enemyStagger: 0,
  goodHits: 0, missHits: 0, moveCounts: { punch: 0, kick: 0, slam: 0, upper: 0 },
  currentMove: 'punch', bgScroll: 0,
  floatingNumbers: [], slowMo: false, freezeUntil: 0, doubleDmgUntil: 0
};
let kwCtx, kwCanvas;
let kwAudioCtx = null;

function kwGetAudioCtx() {
  if (!kwAudioCtx) kwAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return kwAudioCtx;
}
function kwBeep(freq, duration, type = 'square', vol = 0.08) {
  try {
    const ctx = kwGetAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch {}
}
function kwSoundType() { kwBeep(600 + Math.random() * 200, 0.05, 'square', 0.04); }
function kwSoundPunch() { kwBeep(120, 0.12, 'sawtooth', 0.12); }
function kwSoundCombo() { kwBeep(440, 0.1, 'triangle', 0.1); setTimeout(() => kwBeep(660, 0.12, 'triangle', 0.1), 80); }
function kwSoundCrit() { kwBeep(220, 0.05, 'sawtooth', 0.15); setTimeout(() => kwBeep(880, 0.15, 'square', 0.12), 50); }
function kwSoundVictory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => kwBeep(f, 0.2, 'triangle', 0.1), i * 120)); }
function kwSoundGameOver() { [400, 300, 200, 100].forEach((f, i) => setTimeout(() => kwBeep(f, 0.25, 'sawtooth', 0.1), i * 150)); }

function openKWModal() {
  openModal('kwModal');
  kwGoToMenu();
  kwLoadLeaderboard();
}
function closeKWModal() {
  kwState.running = false;
  if (kwState.animFrame) cancelAnimationFrame(kwState.animFrame);
  if (kwState.wordTimeoutId) clearTimeout(kwState.wordTimeoutId);
  closeModal('kwModal');
}

function kwGoToMenu() {
  kwState.running = false;
  if (kwState.animFrame) cancelAnimationFrame(kwState.animFrame);
  if (kwState.wordTimeoutId) clearTimeout(kwState.wordTimeoutId);
  document.getElementById('kwMenuScreen').classList.remove('hidden');
  document.getElementById('kwGameScreen').classList.add('hidden');
  document.getElementById('kwGameOverScreen').classList.add('hidden');
  kwLoadLeaderboard();
}

function kwSelectDifficulty(d) {
  kwState.diff = d;
  document.querySelectorAll('.kw-diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === d));
}
kwSelectDifficulty('easy');

let kwLbFilter = 'all';

function kwSetLbFilter(f) {
  kwLbFilter = f;
  document.querySelectorAll('.kw-lb-tab').forEach(b => b.classList.toggle('active', b.dataset.lb === f));
  kwLoadLeaderboard();
}

async function kwLoadLeaderboard() {
  try {
    const url = kwLbFilter === 'all' ? '/api/kw-leaderboard' : `/api/kw-leaderboard?diff=${kwLbFilter}`;
    const res = await fetch(url);
    let rows = await res.json();
    rows = rows.slice(0, 5); // top 5 only — client-side safety net either way
    const list = document.getElementById('kwLeaderboardList');
    if (!list) return;
    list.innerHTML = rows.length ? rows.map((r, i) => `
      <div class="kw-lb-row"><span><span class="kw-lb-rank">#${i + 1}</span><strong>${escHtml(r.nickname)}</strong></span><span>${r.score} pts · ${Math.round(r.wpm)} WPM</span></div>
    `).join('') : '<div style="text-align:center;color:#6b7099;font-size:0.8rem;">No warriors yet — be the first!</div>';
  } catch {}
}

function kwPickWord() {
  const cfg = KW_DIFFICULTY[kwState.diff];
  let pool = KW_WORDS.filter(w => w.length >= cfg.minLen && w.length <= cfg.maxLen && w !== kwState.lastWord);
  if (!pool.length) pool = KW_WORDS.filter(w => w !== kwState.lastWord);
  const word = pool[Math.floor(Math.random() * pool.length)];
  kwState.lastWord = word;
  return word;
}

function kwStartGame() {
  const cfg = KW_DIFFICULTY[kwState.diff];
  kwState = {
    ...kwState, running: true, wave: 1, playerHP: 100, playerMaxHP: 100,
    enemyHP: cfg.enemyHealth, enemyMaxHP: cfg.enemyHealth, combo: 0, bestCombo: 0, score: 0,
    typedIdx: 0, lastWord: '', enemiesDefeated: 0, totalChars: 0, correctChars: 0, wordsCompleted: 0,
    startTime: Date.now(), playerAttackAnim: 0, enemyAttackAnim: 0, enemyHitFlash: 0, playerHitFlash: 0,
    playerJab: 0, playerStagger: 0, enemyStagger: 0,
    goodHits: 0, missHits: 0, moveCounts: { punch: 0, kick: 0, slam: 0, upper: 0 },
    currentMove: 'punch', bgScroll: 0,
    floatingNumbers: [], slowMo: false, freezeUntil: 0, doubleDmgUntil: 0
  };
  kwState.currentWord = kwPickWord();

  document.getElementById('kwMenuScreen').classList.add('hidden');
  document.getElementById('kwGameOverScreen').classList.add('hidden');
  document.getElementById('kwGameScreen').classList.remove('hidden');

  kwCanvas = document.getElementById('kwCanvas');
  kwCtx = kwCanvas.getContext('2d');
  kwResizeCanvas();

  const input = document.getElementById('kwTypeInput');
  input.value = '';
  input.disabled = false;
  setTimeout(() => input.focus(), 100);

  kwUpdateHUD();
  kwRenderWord();
  kwArmWordTimer();
  kwLoop();
}

function kwResizeCanvas() {
  const wrap = document.getElementById('kwCanvasWrap');
  const w = wrap.clientWidth;
  kwCanvas.width = w;
  kwCanvas.height = window.innerWidth <= 640 ? 260 : 320;
}
window.addEventListener('resize', () => { if (kwState.running && kwCanvas) kwResizeCanvas(); });

function kwArmWordTimer() {
  if (kwState.wordTimeoutId) clearTimeout(kwState.wordTimeoutId);
  if (Date.now() < kwState.freezeUntil) {
    kwState.wordTimeoutId = setTimeout(kwArmWordTimer, kwState.freezeUntil - Date.now());
    return;
  }
  const cfg = KW_DIFFICULTY[kwState.diff];
  const waveShrink = Math.max(0.4, 1 - (kwState.wave - 1) * 0.08);
  const effectiveLimit = cfg.timeLimit * waveShrink;
  kwState.wordStartTime = Date.now();
  kwState.wordTimeoutId = setTimeout(() => { if (kwState.running) kwEnemyAttacks(); }, effectiveLimit);
}

function kwRenderWord() {
  const el = document.getElementById('kwWordDisplay');
  const word = kwState.currentWord;
  const typed = word.slice(0, kwState.typedIdx);
  const rest = word.slice(kwState.typedIdx);
  el.innerHTML = `<span class="kw-typed">${typed}</span><span class="kw-untyped">${rest}</span>`;
  const nextKey = document.getElementById('kwNextKeyBox');
  if (nextKey) nextKey.textContent = word[kwState.typedIdx] || '';
}

document.getElementById('kwTypeInput')?.addEventListener('input', (e) => {
  if (!kwState.running) return;
  const val = e.target.value;
  if (!val) return;
  const word = kwState.currentWord;
  const expectedChar = word[kwState.typedIdx];
  const typedChar = val[val.length - 1];
  e.target.value = '';

  if (typedChar && expectedChar && typedChar.toLowerCase() === expectedChar.toLowerCase()) {
    kwState.typedIdx++;
    kwState.correctChars++;
    kwState.totalChars++;
    kwState.playerJab = 1;
    kwSoundType();
    kwRenderWord();
    if (kwState.typedIdx >= word.length) {
      kwCompleteWord();
    }
  } else {
    kwState.totalChars++;
    kwState.missHits++;
    kwState.combo = Math.max(0, kwState.combo - 3);
    kwUpdateHUD();
    kwUpdateStatsBar();
    const wd = document.getElementById('kwWordDisplay');
    wd.classList.remove('kw-wrong'); void wd.offsetWidth; wd.classList.add('kw-wrong');
  }
});

function kwCompleteWord() {
  const cfg = KW_DIFFICULTY[kwState.diff];
  const timeTaken = Date.now() - kwState.wordStartTime;
  const fast = timeTaken < cfg.timeLimit * 0.55;
  kwState.combo++;
  kwState.bestCombo = Math.max(kwState.bestCombo, kwState.combo);
  kwState.wordsCompleted++;

  let damage = (10 + kwState.combo * 1.8) * cfg.damageMul;
  let isCrit = kwState.combo % cfg.comboCrit === 0 || fast;
  if (isCrit) damage *= 1.6;
  if (Date.now() < kwState.doubleDmgUntil) damage *= 2;
  damage = Math.round(damage);

  kwState.score += Math.round(damage + kwState.combo * 2);
  kwState.enemyHP = Math.max(0, kwState.enemyHP - damage);
  kwState.goodHits++;
  const kwMoveOrder = ['punch', 'kick', 'slam', 'upper'];
  const kwMove = kwMoveOrder[kwState.wordsCompleted % kwMoveOrder.length];
  kwState.currentMove = kwMove;
  kwState.moveCounts[kwMove] = (kwState.moveCounts[kwMove] || 0) + 1;
  kwState.playerAttackAnim = 1;
  kwState.enemyHitFlash = 1;
  kwState.enemyStagger = 1;
  kwState.floatingNumbers.push({ x: 0.72, y: 0.45, val: damage, crit: isCrit, life: 1 });
  kwShakeCanvas();
  kwUpdateStatsBar();

  if (isCrit) kwSoundCrit(); else kwSoundPunch();
  if (kwState.combo > 0 && kwState.combo % 3 === 0) kwSoundCombo();

  // Random power-up (15% chance)
  if (Math.random() < 0.15) kwTriggerPowerup();

  kwUpdateHUD();

  if (kwState.enemyHP <= 0) {
    kwEnemyDefeated();
  } else {
    kwState.typedIdx = 0;
    kwState.currentWord = kwPickWord();
    kwRenderWord();
    kwArmWordTimer();
  }
}

function kwTriggerPowerup() {
  const types = ['freeze', 'double', 'heal', 'lightning', 'instantCombo'];
  const type = types[Math.floor(Math.random() * types.length)];
  const badge = document.getElementById('kwPowerupBadge');
  let label = '';
  if (type === 'freeze') { kwState.freezeUntil = Date.now() + 3000; label = '❄️ Freeze Time!'; }
  else if (type === 'double') { kwState.doubleDmgUntil = Date.now() + 5000; label = '⚡ Double Damage!'; }
  else if (type === 'heal') { kwState.playerHP = Math.min(kwState.playerMaxHP, kwState.playerHP + 20); label = '💚 Healed +20!'; }
  else if (type === 'lightning') { kwState.enemyHP = Math.max(0, kwState.enemyHP - 25); kwState.floatingNumbers.push({ x: 0.72, y: 0.35, val: 25, crit: true, life: 1 }); label = '⚡ Lightning Strike!'; }
  else if (type === 'instantCombo') { kwState.combo += 5; kwState.bestCombo = Math.max(kwState.bestCombo, kwState.combo); label = '🔥 Instant Combo +5!'; }

  badge.textContent = label;
  badge.classList.remove('hidden');
  void badge.offsetWidth;
  badge.style.animation = 'none'; void badge.offsetWidth; badge.style.animation = '';
  setTimeout(() => badge.classList.add('hidden'), 1500);
  kwUpdateHUD();
}

function kwEnemyDefeated() {
  kwState.enemiesDefeated++;
  kwState.wave++;
  const cfg = KW_DIFFICULTY[kwState.diff];
  kwState.enemyMaxHP = cfg.enemyHealth + kwState.wave * cfg.healthStep;
  kwState.enemyHP = kwState.enemyMaxHP;
  kwState.typedIdx = 0;
  kwState.currentWord = kwPickWord();
  kwRenderWord();
  kwArmWordTimer();
  kwUpdateHUD();
}

function kwEnemyAttacks() {
  if (!kwState.running) return;
  const cfg = KW_DIFFICULTY[kwState.diff];
  const dmg = Math.round(8 + kwState.wave * 1.5);
  kwState.playerHP = Math.max(0, kwState.playerHP - dmg);
  kwState.enemyAttackAnim = 1;
  kwState.playerHitFlash = 1;
  kwState.playerStagger = 1;
  kwState.combo = 0;
  kwState.floatingNumbers.push({ x: 0.28, y: 0.45, val: dmg, crit: false, life: 1, enemy: true });
  kwShakeCanvas();
  kwSoundPunch();
  kwUpdateHUD();

  kwState.typedIdx = 0;
  document.getElementById('kwTypeInput').value = '';
  kwState.currentWord = kwPickWord();
  kwRenderWord();

  if (kwState.playerHP <= 0) { kwGameOver(); return; }
  kwArmWordTimer();
}

function kwShakeCanvas() {
  const wrap = document.getElementById('kwCanvasWrap');
  wrap.classList.remove('kw-shake'); void wrap.offsetWidth; wrap.classList.add('kw-shake');
}
function kwUpdateStatsBar() {
  const total = kwState.goodHits + kwState.missHits;
  const acc = total > 0 ? Math.round((kwState.goodHits / total) * 100) : 100;
  const elapsed = Math.max(0, Math.floor((Date.now() - kwState.startTime) / 1000));
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');
  const line = document.getElementById('kwStatsLine');
  if (line) line.textContent = `${kwState.goodHits} GOOD / ${kwState.missHits} MISS / ${acc}% / ${mm}:${ss}`;
  const big = document.getElementById('kwBigScore');
  if (big) big.textContent = kwState.score;
  const heart = document.getElementById('kwHeartVal');
  if (heart) heart.textContent = Math.round(kwState.playerHP);
  const p = document.getElementById('kwCountPunch'); if (p) p.textContent = kwState.moveCounts.punch;
  const k = document.getElementById('kwCountKick'); if (k) k.textContent = kwState.moveCounts.kick;
  const s = document.getElementById('kwCountSlam'); if (s) s.textContent = kwState.moveCounts.slam;
  const u = document.getElementById('kwCountUpper'); if (u) u.textContent = kwState.moveCounts.upper;
}

function kwUpdateHUD() {
  document.getElementById('kwPlayerHealthFill').style.width = `${(kwState.playerHP / kwState.playerMaxHP) * 100}%`;
  document.getElementById('kwEnemyHealthFill').style.width = `${(kwState.enemyHP / kwState.enemyMaxHP) * 100}%`;
  document.getElementById('kwComboDisplay').textContent = `Combo: ${kwState.combo}`;
  document.getElementById('kwScoreDisplay').textContent = `Score: ${kwState.score}`;
  document.getElementById('kwWaveDisplay').textContent = `Wave: ${kwState.wave}`;
}

function kwDrawStickman(x, y, scale, color, attackAnim, hitFlash, facingRight, jab, stagger, idleT, moveType) {
  const ctx = kwCtx;
  const dir = facingRight ? 1 : -1;
  const phase = Math.min(attackAnim, 1);
  const st = Math.min(stagger || 0, 1);
  const move = moveType || 'punch';

  const isIdle = phase < 0.02 && st < 0.02;
  const t = idleT || 0;
  const jumpH = Math.sin(phase * Math.PI) * 14 + (isIdle ? Math.abs(Math.sin(t * 2.4)) * 6 : 0);
  const knockSlide = -dir * st * st * 55;
  const knockDrop = st * st * 10;
  const tilt = -dir * st * 1.1 + (isIdle ? Math.sin(t * 1.6) * 0.05 : 0);
  const idleSway = isIdle ? Math.sin(t * 1.9) * 4 : 0;

  ctx.save();
  ctx.translate(x + knockSlide + idleSway, y - jumpH + knockDrop);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  ctx.strokeStyle = hitFlash > 0.05 ? '#ff4444' : color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  const punch = Math.sin(phase * Math.PI) * 26 + (jab || 0) * 14;
  const runSwing = Math.sin(phase * Math.PI * 4) * 12;
  const lean = phase * dir * 4 - st * dir * 6 + (isIdle ? Math.sin(t * 2.2) * 2 : 0);

  // head
  ctx.beginPath(); ctx.arc(0, -60, 12, 0, Math.PI * 2); ctx.fill();
  // body
  ctx.beginPath(); ctx.moveTo(lean, -48); ctx.lineTo(0, -10); ctx.stroke();

  if (isIdle) {
    // fighting stance — guard up, weight shifting, bent knees, weapon held ready
    const guardSway = Math.sin(t * 2.4) * 5;
    const kneeBend = Math.abs(Math.sin(t * 2.4)) * 4;
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-dir * 12, -34 + guardSway * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(dir * (14 + guardSway), -32 - guardSway * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(dir * (14 + guardSway), -32 - guardSway * 0.4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.strokeStyle = '#e8eaf6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dir * (14 + guardSway), -32 - guardSway * 0.4);
    ctx.lineTo(dir * (14 + guardSway) + dir * 18, -42 - guardSway * 0.4);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-10 - guardSway * 0.3, 20 - kneeBend); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10 + guardSway * 0.3, 20 - kneeBend); ctx.stroke();
  } else if (move === 'kick') {
    const kickLift = Math.sin(phase * Math.PI) * 30;
    // both arms tucked back
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-dir * 12, -30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-dir * 12, -22); ctx.stroke();
    // back leg planted
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-dir * 10, 20); ctx.stroke();
    // front leg kicks forward and up
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(dir * (14 + punch * 0.5), 14 - kickLift); ctx.stroke();
    ctx.beginPath(); ctx.arc(dir * (14 + punch * 0.5), 14 - kickLift, 4, 0, Math.PI * 2); ctx.fill();
  } else {
    let handX, handY;
    if (move === 'slam') { handX = dir * (10 + punch * 0.4); handY = -52 + punch * 0.85; }
    else if (move === 'upper') { handX = dir * (10 + punch * 0.7); handY = -18 - punch * 0.55; }
    else { handX = dir * (14 + punch); handY = -30 + punch * 0.3; }

    // back arm
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-dir * 14, -22 + st * 10); ctx.stroke();
    // front arm
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(handX, handY); ctx.stroke();
    ctx.beginPath(); ctx.arc(handX, handY, 4, 0, Math.PI * 2); ctx.fill();

    // weapon
    ctx.save();
    ctx.strokeStyle = '#e8eaf6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handX + dir * 20, handY - 10);
    ctx.stroke();
    ctx.restore();

    // legs — running motion
    const legSpread = 10 + phase * 6;
    const kneeBuckle = st * 10;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-legSpread + runSwing, 20 - kneeBuckle); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(legSpread + runSwing, 20 - kneeBuckle); ctx.stroke();
  }
  ctx.restore();
}

function kwDrawBackground(w, h, scroll) {
  const ctx = kwCtx;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  skyGrad.addColorStop(0, '#1a0e2e');
  skyGrad.addColorStop(1, '#2d1b4e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.72);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  const starTile = 60;
  const starOffset = (scroll * 0.4) % starTile;
  for (let gx = -starOffset; gx < w + starTile; gx += starTile) {
    ctx.beginPath(); ctx.arc(gx, h * 0.28, 2, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = '#120a1f';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);

  ctx.strokeStyle = 'rgba(168,85,247,0.4)';
  ctx.lineWidth = 2;
  const tile = 26;
  const offset = scroll % tile;
  for (let gx = -offset; gx < w + tile; gx += tile) {
    ctx.beginPath();
    ctx.moveTo(gx, h * 0.72);
    ctx.lineTo(gx - 6, h * 0.72 + 10);
    ctx.stroke();
  }
}

function kwDrawScene() {
  const ctx = kwCtx, w = kwCanvas.width, h = kwCanvas.height;
  ctx.clearRect(0, 0, w, h);

  kwDrawBackground(w, h, kwState.bgScroll || 0);

  const scale = Math.min(w / 700, 1.1) * (window.innerWidth <= 640 ? 0.8 : 1);

  const lungeDist = w * 0.22;
  const playerPhase = Math.min(kwState.playerAttackAnim, 1);
  const enemyPhase = Math.min(kwState.enemyAttackAnim, 1);
  const playerLunge = Math.sin(playerPhase * Math.PI) * lungeDist;
  const enemyLunge = Math.sin(enemyPhase * Math.PI) * lungeDist;

  const idleT = Date.now() / 1000;
  const pacing = (playerPhase < 0.02 && enemyPhase < 0.02) ? Math.sin(idleT * 1.3) * 8 : 0;

  const playerX = w * 0.28 + playerLunge + pacing;
  const enemyX = w * 0.72 - enemyLunge - pacing;

  kwDrawStickman(playerX, h * 0.72, scale, '#4ade9a', kwState.playerAttackAnim, kwState.playerHitFlash, true, kwState.playerJab, kwState.playerStagger, idleT, kwState.currentMove);
  kwDrawStickman(enemyX, h * 0.72, scale, '#f07050', kwState.enemyAttackAnim, kwState.enemyHitFlash, false, 0, kwState.enemyStagger, idleT + 1.7, 'punch');

  if (playerPhase > 0.35 && playerPhase < 0.7) kwDrawClash((playerX + enemyX) / 2, h * 0.72 - 45 * scale, playerPhase);
  if (enemyPhase > 0.35 && enemyPhase < 0.7) kwDrawClash((playerX + enemyX) / 2, h * 0.72 - 45 * scale, enemyPhase);

  // floating numbers
  kwState.floatingNumbers.forEach(fn => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, fn.life);
    ctx.fillStyle = fn.enemy ? '#f07050' : (fn.crit ? '#ffd873' : '#4ade9a');
    ctx.font = `${fn.crit ? 'bold ' : ''}${fn.crit ? 26 : 18}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`-${fn.val}`, w * fn.x, h * fn.y - (1 - fn.life) * 40);
    ctx.restore();
  });
}

function kwDrawClash(x, y, phase) {
  const ctx = kwCtx;
  const alpha = 1 - Math.abs(phase - 0.5) * 4;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.strokeStyle = '#ffd873';
  ctx.lineWidth = 4;
  const spread = 16;
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i + phase * 3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4);
    ctx.lineTo(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread);
    ctx.stroke();
  }
  ctx.restore();
}

function kwLoop() {
  if (!kwState.running) return;
  kwState.playerAttackAnim = Math.max(0, kwState.playerAttackAnim - 0.06);
  kwState.enemyAttackAnim = Math.max(0, kwState.enemyAttackAnim - 0.06);
  kwState.playerJab = Math.max(0, kwState.playerJab - 0.12);
  kwState.playerStagger = Math.max(0, kwState.playerStagger - 0.05);
  kwState.enemyStagger = Math.max(0, kwState.enemyStagger - 0.05);
  kwState.playerHitFlash = Math.max(0, kwState.playerHitFlash - 0.05);
  kwState.enemyHitFlash = Math.max(0, kwState.enemyHitFlash - 0.05);
  kwState.bgScroll = (kwState.bgScroll || 0) + 1.5;
  kwState.floatingNumbers.forEach(fn => fn.life -= 0.02);
  kwState.floatingNumbers = kwState.floatingNumbers.filter(fn => fn.life > 0);
  kwDrawScene();
  kwUpdateStatsBar();
  kwState.animFrame = requestAnimationFrame(kwLoop);
}

async function kwGameOver() {
  kwState.running = false;
  if (kwState.wordTimeoutId) clearTimeout(kwState.wordTimeoutId);
  if (kwState.animFrame) cancelAnimationFrame(kwState.animFrame);
  document.getElementById('kwTypeInput').disabled = true;
  kwSoundGameOver();

  const elapsedMin = Math.max(0.05, (Date.now() - kwState.startTime) / 60000);
  const wpm = Math.round(kwState.wordsCompleted / elapsedMin);
  const accuracy = kwState.totalChars > 0 ? Math.round((kwState.correctChars / kwState.totalChars) * 100) : 100;
  const timeSurvived = Math.round((Date.now() - kwState.startTime) / 1000);

  document.getElementById('kwFinalScore').textContent = kwState.score;
  document.getElementById('kwFinalWPM').textContent = wpm;
  document.getElementById('kwFinalAccuracy').textContent = `${accuracy}%`;
  document.getElementById('kwFinalCombo').textContent = kwState.bestCombo;
  document.getElementById('kwFinalEnemies').textContent = kwState.enemiesDefeated;
  document.getElementById('kwFinalTime').textContent = `${timeSurvived}s`;

  document.getElementById('kwGameScreen').classList.add('hidden');
  document.getElementById('kwGameOverScreen').classList.remove('hidden');

  const nickname = document.getElementById('kwNickname').value.trim() || 'Anonymous';
  try {
    await fetch('/api/kw-leaderboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, score: kwState.score, wpm, accuracy, diff: kwState.diff })
    });
  } catch {}
  kwLoadLeaderboard();
}
// ══════════════════════════════════════════════════
// GLOBAL NOTE SEARCH (fuzzy, cross-folder)
// ══════════════════════════════════════════════════
function normalizeSearchText(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyWordMatch(query, word) {
  if (!query || !word) return false;
  if (word.includes(query)) return true;
  const maxDist = query.length <= 4 ? 1 : query.length <= 7 ? 2 : 3;
  if (word.length <= query.length + maxDist + 2) {
    return levenshtein(query, word) <= maxDist;
  }
  for (let i = 0; i <= word.length - query.length; i++) {
    if (levenshtein(query, word.substr(i, query.length)) <= maxDist) return true;
  }
  return false;
}

function noteMatchesGlobalSearch(note, queryNorm) {
  const combined = [note.title, note.subject, note.course, note.description, note.author]
    .map(f => normalizeSearchText(f)).join(' ');
  if (combined.includes(queryNorm)) return true;
  const combinedWords = combined.split(' ').filter(Boolean);
  const queryWords = queryNorm.split(' ').filter(Boolean);
  return queryWords.every(qw => combinedWords.some(cw => fuzzyWordMatch(qw, cw)));
}

function handleGlobalSearch() {
  const raw = document.getElementById('globalNoteSearch').value;
  const resultsBox = document.getElementById('globalSearchResults');
  if (!raw.trim()) { resultsBox.classList.add('hidden'); resultsBox.innerHTML = ''; return; }
  const queryNorm = normalizeSearchText(raw);
  const matches = allNotes.filter(n => noteMatchesGlobalSearch(n, queryNorm)).slice(0, 15);
  resultsBox.innerHTML = matches.length ? matches.map(n => {
    const typeInfo = getFileTypeInfo(n.fileType);
    const safeCourse = escHtml(n.course).replace(/'/g, "\\'");
    const safeSubject = escHtml(n.subject).replace(/'/g, "\\'");
    return `
      <div class="global-search-item" onclick="goToSearchResult('${n.id}','${safeCourse}','${safeSubject}')">
        <div class="gs-title">${typeInfo.emoji} ${escHtml(n.title)}</div>
        <div class="gs-path">🎓 ${escHtml(n.course)} → 📚 ${escHtml(n.subject)}</div>
      </div>`;
  }).join('') : `<div class="global-search-empty">No matching notes found</div>`;
  resultsBox.classList.remove('hidden');
}

async function goToSearchResult(noteId, course, subject) {
  document.getElementById('globalSearchResults').classList.add('hidden');
  document.getElementById('globalNoteSearch').value = '';
  await openNoteCourse(course);
  await openNoteSubject(subject);
  setTimeout(() => {
    const el = document.getElementById(`note-${noteId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('note-card-highlight');
      setTimeout(() => el.classList.remove('note-card-highlight'), 2000);
    }
  }, 350);
}

document.addEventListener('click', (e) => {
  const input = document.getElementById('globalNoteSearch');
  const box = document.getElementById('globalSearchResults');
  if (input && box && !input.contains(e.target) && !box.contains(e.target)) box.classList.add('hidden');
});
// ══════════════════════════════════════════════════
// NOTIFICATION PERMISSION PROMPT (repeats until Yes)
// ══════════════════════════════════════════════════
function checkAndShowNotifPrompt() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') { setupPushNotifications(); return; }
  // Keep asking every session until the user actually grants it — a "No" is treated
  // as "not yet", not a permanent decline, since the browser itself allows re-asking
  // as long as permission isn't hard-blocked at the OS/browser level.
  if (Notification.permission === 'denied') {
    // Browser-level hard block — we truly can't re-prompt via JS here, but we can
    // still nudge the user to fix it manually instead of silently giving up.
    document.getElementById('notifPromptAsk')?.classList.add('hidden');
    const fb = document.getElementById('notifPromptFeedback');
    if (fb) {
      fb.classList.remove('hidden');
      document.getElementById('notifFeedbackEmoji').textContent = '🔕';
      document.getElementById('notifFeedbackText').textContent = 'Notifications are blocked in your browser settings. Enable them from site settings to get updates!';
    }
    setTimeout(() => openModal('notifPromptModal'), 1200);
    setTimeout(() => closeModal('notifPromptModal'), 3500);
    return;
  }
  document.getElementById('notifPromptAsk')?.classList.remove('hidden');
  document.getElementById('notifPromptFeedback')?.classList.add('hidden');
  setTimeout(() => openModal('notifPromptModal'), 800);
}

async function respondNotifPrompt(yes) {
  document.getElementById('notifPromptAsk').classList.add('hidden');
  const fb = document.getElementById('notifPromptFeedback');
  fb.classList.remove('hidden');
  if (yes) {
    document.getElementById('notifFeedbackEmoji').textContent = '😊';
    document.getElementById('notifFeedbackText').textContent = 'Awesome, thank you!';
    await setupPushNotifications();
  } else {
    document.getElementById('notifFeedbackEmoji').textContent = '😢';
    document.getElementById('notifFeedbackText').textContent = "Okay — we'll ask again next time you visit!";
  }
  setTimeout(() => closeModal('notifPromptModal'), 1100);
}
// ══════════════════════════════════════════════════
// TOP LOADING BAR (modern nav feel)
// ══════════════════════════════════════════════════
let topLoaderTimeout = null;
function showTopLoader() {
  const bar = document.getElementById('topLoaderBar');
  if (!bar) return;
  clearTimeout(topLoaderTimeout);
  bar.classList.remove('loading-done');
  bar.classList.add('loading-active');
}
function hideTopLoader() {
  const bar = document.getElementById('topLoaderBar');
  if (!bar) return;
  bar.classList.add('loading-done');
  topLoaderTimeout = setTimeout(() => bar.classList.remove('loading-active', 'loading-done'), 300);
}

// ══════════════════════════════════════════════════
// FOLDER WALLPAPER
// ══════════════════════════════════════════════════
let wallpaperTargetPrefix = null, wallpaperTargetId = null;

function triggerWallpaperUpload(prefix, id) {
  wallpaperTargetPrefix = prefix;
  wallpaperTargetId = id;
  toast('📸 Choose any photo — it will auto-resize to fit (max 2MB after compression)', '');
  document.getElementById('wallpaperFileInput').click();
}

function compressImageToLimit(file, maxBytes = 2 * 1024 * 1024, maxDimension = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.9;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('Compression failed')); return; }
            if (blob.size <= maxBytes || quality <= 0.4) {
              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
              resolve(compressedFile);
            } else {
              quality -= 0.1;
              tryCompress();
            }
          }, 'image/jpeg', quality);
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function handleWallpaperFileSelect(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !wallpaperTargetPrefix || !wallpaperTargetId) return;
  if (!file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }

  showTopLoader();
  let uploadFile = file;
  if (file.size > 2 * 1024 * 1024) {
    toast('📐 Auto-resizing your photo to fit the folder...', '');
    try {
      uploadFile = await compressImageToLimit(file, 2 * 1024 * 1024);
    } catch {
      hideTopLoader();
      toast('Could not process this image. Try a different photo.', 'error');
      return;
    }
  }

  const formData = new FormData();
  formData.append('requester', currentUser);
  formData.append('file', uploadFile);
  const res = await fetch(`/api/${wallpaperTargetPrefix}/${wallpaperTargetId}/wallpaper`, { method: 'PUT', body: formData });
  hideTopLoader();
  if (res.ok) { toast('Wallpaper updated 🖼️', 'success'); await refreshFolderView(wallpaperTargetPrefix); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

async function removeWallpaper(prefix, id) {
  if (!confirm('Remove this wallpaper?')) return;
  const res = await fetch(`/api/${prefix}/${id}/wallpaper`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requester: currentUser }) });
  if (res.ok) { toast('Wallpaper removed', 'success'); await refreshFolderView(prefix); }
  else { const d = await res.json(); toast(d.error, 'error'); }
}

socket.on('courses_wallpaper_updated', () => refreshFolderView('courses'));
socket.on('subjects_wallpaper_updated', () => refreshFolderView('subjects'));
socket.on('timetable-sections_wallpaper_updated', () => refreshFolderView('timetable-sections'));
socket.on('new_image_edit', () => { if (isSuperAdmin && document.querySelector('[data-tab="admin"]')?.classList.contains('active')) loadImageEditHistory(); });

// Preload the PDF renderer in the background right after the app becomes usable,
// so by the time someone actually opens a PDF preview, the library is already
// cached and ready — no waiting on the script tag at click time.
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { ensurePdfJsLoaded().catch(() => {}); }, 1500);
});

// ══════════════════════════════════════════════════
// REFRESH-PROOF NAVIGATION STATE
// ══════════════════════════════════════════════════
function saveLastView() {
  const state = {
    tab: document.querySelector('.nav-tab.active')?.dataset.tab || 'notes',
    noteCourse: typeof currentNoteCourse !== 'undefined' ? currentNoteCourse : null,
    noteSubject: typeof currentNoteSubject !== 'undefined' ? currentNoteSubject : null,
    ttSection: typeof currentTimetableSection !== 'undefined' ? currentTimetableSection : null
  };
  localStorage.setItem('studyhub_last_view', JSON.stringify(state));
}

async function restoreLastView() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('studyhub_last_view') || 'null'); } catch { saved = null; }
  if (!saved || !saved.tab || saved.tab === 'notes') return;
  const section = document.getElementById(`tab-${saved.tab}`);
  if (!section) return;
  document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-tab, .mnav-item').forEach(b => b.classList.remove('active'));
  section.classList.remove('hidden');
  document.querySelectorAll(`[data-tab="${saved.tab}"]`).forEach(el => el.classList.add('active'));
  if (saved.tab === 'admin') loadAdminPanel();
  if (saved.tab === 'planner') loadPlanner();
  if (saved.tab === 'quiz') loadQuizList();
  if (saved.tab === 'timetable') {
    await loadTimetables();
    if (saved.ttSection) openTimetableSection(saved.ttSection);
  }
}

// ══════════════════════════════════════════════════
// IMAGE RESIZER / EDITOR TOOL
// ══════════════════════════════════════════════════
let imgToolOriginalImage = null;
let imgToolTargetW = 0, imgToolTargetH = 0;
let imgToolBgColor = '#ffffff';
let imgToolPendingBlob = null;
let imgToolChangesLog = [];

function openImgToolsModal() {
  imgToolOriginalImage = null;
  imgToolPendingBlob = null;
  imgToolChangesLog = [];
  document.getElementById('imgToolFileInput').value = '';
  document.getElementById('imgToolWorkspace').classList.add('hidden');
  document.getElementById('imgToolDropZone').classList.remove('hidden');
  document.getElementById('imgToolSizeInfo').textContent = 'Current size: —';
  openModal('imgToolsModal');
}

function handleImgToolFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      imgToolOriginalImage = img;
      imgToolTargetW = img.naturalWidth;
      imgToolTargetH = img.naturalHeight;
      document.getElementById('imgToolWidth').value = imgToolTargetW;
      document.getElementById('imgToolHeight').value = imgToolTargetH;
      document.getElementById('imgToolDropZone').classList.add('hidden');
      document.getElementById('imgToolWorkspace').classList.remove('hidden');
      imgToolRedraw();
    };
    img.onerror = () => toast('Could not load this image', 'error');
    img.src = ev.target.result;
  };
  reader.onerror = () => toast('Could not read file', 'error');
  reader.readAsDataURL(file);
}

const imgToolDropZone = document.getElementById('imgToolDropZone');
if (imgToolDropZone) {
  imgToolDropZone.addEventListener('dragover', e => { e.preventDefault(); imgToolDropZone.classList.add('drag-over'); });
  imgToolDropZone.addEventListener('dragleave', () => imgToolDropZone.classList.remove('drag-over'));
  imgToolDropZone.addEventListener('drop', e => {
    e.preventDefault(); imgToolDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleImgToolFileSelect({ target: { files: [file] } });
  });
}

document.getElementById('imgToolWidth')?.addEventListener('input', () => {
  if (!imgToolOriginalImage) return;
  if (document.getElementById('imgToolLockAspect').checked) {
    const ratio = imgToolOriginalImage.naturalHeight / imgToolOriginalImage.naturalWidth;
    const w = parseInt(document.getElementById('imgToolWidth').value) || 0;
    document.getElementById('imgToolHeight').value = Math.round(w * ratio);
  }
});
document.getElementById('imgToolHeight')?.addEventListener('input', () => {
  if (!imgToolOriginalImage) return;
  if (document.getElementById('imgToolLockAspect').checked) {
    const ratio = imgToolOriginalImage.naturalWidth / imgToolOriginalImage.naturalHeight;
    const h = parseInt(document.getElementById('imgToolHeight').value) || 0;
    document.getElementById('imgToolWidth').value = Math.round(h * ratio);
  }
});

function imgToolApplyDimensions() {
  const w = parseInt(document.getElementById('imgToolWidth').value);
  const h = parseInt(document.getElementById('imgToolHeight').value);
  if (!w || !h || w < 1 || h < 1) { toast('Enter valid width and height', 'error'); return; }
  imgToolTargetW = w; imgToolTargetH = h;
  imgToolChangesLog.push(`Resized to ${w}x${h}`);
  imgToolRedraw();
}

function imgToolPassportSize() {
  imgToolTargetW = 413; imgToolTargetH = 531; // 35mm x 45mm @ ~300 DPI
  document.getElementById('imgToolWidth').value = imgToolTargetW;
  document.getElementById('imgToolHeight').value = imgToolTargetH;
  document.getElementById('imgToolLockAspect').checked = false;
  document.querySelector('input[name="imgToolFitMode"][value="cover"]').checked = true;
  imgToolChangesLog.push('Applied passport size (35x45mm)');
  imgToolRedraw();
  toast('🪪 Set to passport size (35×45mm)', 'success');
}

function imgToolUSPassportSize() {
  imgToolTargetW = 600; imgToolTargetH = 600; // 2in x 2in @ 300 DPI (US passport standard)
  document.getElementById('imgToolWidth').value = imgToolTargetW;
  document.getElementById('imgToolHeight').value = imgToolTargetH;
  document.getElementById('imgToolLockAspect').checked = false;
  document.querySelector('input[name="imgToolFitMode"][value="cover"]').checked = true;
  imgToolChangesLog.push('Applied US passport size (2x2in)');
  imgToolRedraw();
  toast('🇺🇸 Set to US Passport size (2×2 in)', 'success');
}

function imgToolPreset(w, h) {
  imgToolTargetW = w; imgToolTargetH = h;
  document.getElementById('imgToolWidth').value = w;
  document.getElementById('imgToolHeight').value = h;
  document.getElementById('imgToolLockAspect').checked = false;
  imgToolChangesLog.push(`Applied preset size ${w}x${h}`);
  imgToolRedraw();
}

function imgToolPickColor(color, el) {
  imgToolBgColor = color;
  document.querySelectorAll('.imgtool-swatch').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelector('input[name="imgToolFitMode"][value="contain"]').checked = true;
  imgToolChangesLog.push(`Set fit background color ${color}`);
  imgToolRedraw();
}

function imgToolRedraw() {
  if (!imgToolOriginalImage) return;
  imgToolPendingBlob = null;
  const canvas = document.getElementById('imgToolCanvas');
  canvas.width = imgToolTargetW;
  canvas.height = imgToolTargetH;
  const ctx = canvas.getContext('2d');
  const fitMode = document.querySelector('input[name="imgToolFitMode"]:checked')?.value || 'cover';
  const img = imgToolOriginalImage;
  const iw = img.naturalWidth, ih = img.naturalHeight;

  ctx.clearRect(0, 0, imgToolTargetW, imgToolTargetH);

  if (fitMode === 'cover') {
    const scale = Math.max(imgToolTargetW / iw, imgToolTargetH / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (imgToolTargetW - dw) / 2, dy = (imgToolTargetH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = imgToolBgColor;
    ctx.fillRect(0, 0, imgToolTargetW, imgToolTargetH);
    const scale = Math.min(imgToolTargetW / iw, imgToolTargetH / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (imgToolTargetW - dw) / 2, dy = (imgToolTargetH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  imgToolUpdateSizeInfo();
}

function imgToolUpdateSizeInfo() {
  const canvas = document.getElementById('imgToolCanvas');
  const format = document.getElementById('imgToolFormat').value;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const kb = (blob.size / 1024).toFixed(1);
    document.getElementById('imgToolSizeInfo').textContent = `Current size: ${kb} KB (${imgToolTargetW}×${imgToolTargetH}px)`;
  }, format, 0.92);
}

document.getElementById('imgToolFormat')?.addEventListener('change', () => {
  imgToolPendingBlob = null;
  imgToolUpdateSizeInfo();
});

async function imgToolApplyTargetSize() {
  if (!imgToolOriginalImage) return;
  const val = parseFloat(document.getElementById('imgToolTargetSize').value);
  const unit = document.getElementById('imgToolSizeUnit').value;
  if (!val || val <= 0) { toast('Enter a valid target size', 'error'); return; }
  const targetBytes = unit === 'MB' ? val * 1024 * 1024 : val * 1024;
  const format = document.getElementById('imgToolFormat').value;

  if (format === 'image/png') {
    toast('⚠️ PNG size can\'t be precisely controlled — switch to JPG or WEBP for exact size', 'error');
    return;
  }

  const canvas = document.getElementById('imgToolCanvas');
  let lowQ = 0.05, highQ = 1.0, bestBlob = null;

  for (let i = 0; i < 8; i++) {
    const midQ = (lowQ + highQ) / 2;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, midQ));
    if (!blob) break;
    if (blob.size > targetBytes) {
      highQ = midQ;
    } else {
      bestBlob = blob;
      lowQ = midQ;
    }
  }

  if (!bestBlob) {
    toast('⚠️ Target too small for current dimensions — try reducing width/height too', 'error');
    return;
  }

  const kb = (bestBlob.size / 1024).toFixed(1);
  document.getElementById('imgToolSizeInfo').textContent = `Current size: ${kb} KB (closest match to your target)`;
  imgToolPendingBlob = bestBlob;
  toast(`✅ Compressed to ~${kb} KB`, 'success');
}

function imgToolDownload() {
  if (!imgToolOriginalImage) { toast('Upload an image first', 'error'); return; }
  const format = document.getElementById('imgToolFormat').value;
  const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';

  const doDownload = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `studyhub-image.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded! 📥', 'success');
    logImageEdit(blob, ext);
    imgToolPendingBlob = null;
  };

  if (imgToolPendingBlob) {
    doDownload(imgToolPendingBlob);
  } else {
    const canvas = document.getElementById('imgToolCanvas');
    canvas.toBlob((blob) => { if (blob) doDownload(blob); }, format, 0.92);
  }
}

async function logImageEdit(blob, ext) {
  try {
    const formData = new FormData();
    formData.append('username', currentUser || 'Unknown');
    formData.append('changes', imgToolChangesLog.length ? imgToolChangesLog.join(', ') : 'Downloaded edited photo');
    formData.append('file', new File([blob], `edit.${ext}`, { type: blob.type }));
    await fetch('/api/image-edit-history', { method: 'POST', body: formData });
  } catch {}
}

// ══════════════════════════════════════════════════
// PDF EDITOR & CONVERTER
// ══════════════════════════════════════════════════
function loadScriptOnce(src, checkGlobal) {
  return new Promise((resolve, reject) => {
    if (checkGlobal && checkGlobal()) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(script);
  });
}
function ensurePdfLibLoaded() { return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', () => window.PDFLib); }
function ensureJsPdfLoaded() { return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf); }
function ensureMammothLoaded() { return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', () => window.mammoth); }
function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
// Builds a minimal but valid .docx (OOXML) file directly via JSZip instead of relying
// on an external "docx" library — CDN builds of that library kept failing to load
// reliably. A hand-built docx has no such dependency, opens fine in Word/Google
// Docs/LibreOffice, and only needs the JSZip library we already load elsewhere.
async function buildDocxBlob(paragraphs) {
  await ensureJsZipLoaded();
  const zip = new window.JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const bodyXml = paragraphs.map(p => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`).join('');
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`);
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
function ensureJsZipLoaded() { return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => window.JSZip); }
function ensurePptxGenLoaded() { return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js', () => window.PptxGenJS); }
function ensureXlsxLoaded() { return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX); }

function pdfToolSwitch(tool) {
  document.querySelectorAll('.pdftool-tab').forEach(b => b.classList.toggle('active', b.dataset.pt === tool));
  document.querySelectorAll('.pdftool-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`pt-${tool}`).classList.remove('hidden');
}
function openPdfToolsModal() {
  pdfToolSwitch('word2pdf');
  openModal('pdfToolsModal');
}

// ── Word to PDF ──
let ptWord2pdfFile = null;
function ptWord2PdfSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  ptWord2pdfFile = file;
  document.getElementById('ptWord2pdfDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📝</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptWord2pdfBtn').disabled = false;
}
async function ptConvertWordToPdf() {
  if (!ptWord2pdfFile) return;
  const btn = document.getElementById('ptWord2pdfBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensureMammothLoaded();
    await ensureJsPdfLoaded();
    const arrayBuffer = await ptWord2pdfFile.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:700px;padding:20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#000;background:#fff;position:fixed;left:-9999px;top:0;';
    wrap.innerHTML = result.value;
    document.body.appendChild(wrap);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    await pdf.html(wrap, {
      callback: (doc) => {
        doc.save(ptWord2pdfFile.name.replace(/\.docx$/i, '') + '.pdf');
        document.body.removeChild(wrap);
        toast('Converted to PDF! 📥', 'success');
      },
      margin: [30, 30, 30, 30], autoPaging: 'text', width: 550, windowWidth: 700
    });
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Convert to PDF ⬇';
}

// ── PDF to Word ──
let ptPdf2wordFile = null;
function ptPdf2WordSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  ptPdf2wordFile = file;
  document.getElementById('ptPdf2wordDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptPdf2wordBtn').disabled = false;
}
async function ptConvertPdfToWord() {
  if (!ptPdf2wordFile) return;
  const btn = document.getElementById('ptPdf2wordBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensurePdfJsLoaded();
    const arrayBuffer = await ptPdf2wordFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paragraphs = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const lines = {};
      textContent.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if (!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
      sortedY.forEach(y => paragraphs.push(lines[y].join(' ')));
      paragraphs.push('');
    }
    const blob = await buildDocxBlob(paragraphs.length ? paragraphs : ['']);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ptPdf2wordFile.name.replace(/\.pdf$/i, '') + '.docx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Converted to Word! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Convert to Word ⬇';
}

// ── Compress / Quality ──
let ptCompressFile = null;
let ptCompressQuality = 0.35;
function ptCompressSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  ptCompressFile = file;
  document.getElementById('ptCompressDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptCompressBtn').disabled = false;
  document.getElementById('ptCompressInfo').textContent = `Original size: ${formatBytes(file.size)}`;
}
function ptSetQuality(q, el) {
  ptCompressQuality = q;
  document.querySelectorAll('.pt-quality-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
async function ptConvertCompress() {
  if (!ptCompressFile) return;
  const btn = document.getElementById('ptCompressBtn');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    await ensurePdfJsLoaded();
    await ensureJsPdfLoaded();
    const arrayBuffer = await ptCompressFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const { jsPDF } = window.jspdf;
    let outPdf = null;
    const scale = 1 + ptCompressQuality;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const imgData = canvas.toDataURL('image/jpeg', Math.max(0.3, ptCompressQuality));
      const orientation = viewport.width > viewport.height ? 'l' : 'p';
      if (!outPdf) outPdf = new jsPDF(orientation, 'pt', [viewport.width, viewport.height]);
      else outPdf.addPage([viewport.width, viewport.height], orientation);
      outPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
    }
    const blob = outPdf.output('blob');
    document.getElementById('ptCompressInfo').textContent = `Original: ${formatBytes(ptCompressFile.size)} → New: ${formatBytes(blob.size)}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ptCompressFile.name.replace(/\.pdf$/i, '') + '-processed.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('PDF processed! 📥', 'success');
  } catch (err) { toast('Processing failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Process PDF ⬇';
}

// ── Lock / Unlock ──
function ptLockSwitch(sub) {
  document.querySelectorAll('.pdftool-subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
  document.getElementById('pt-lockUp').classList.toggle('hidden', sub !== 'lockUp');
  document.getElementById('pt-unlock').classList.toggle('hidden', sub !== 'unlock');
}
let ptLockFile = null;
function ptLockSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  ptLockFile = file;
  document.getElementById('ptLockDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptLockBtn').disabled = false;
}
async function ptLockUpload() {
  if (!ptLockFile) return;
  const password = document.getElementById('ptLockPassword').value;
  if (!password || password.length < 4) { toast('Password kam se kam 4 characters ka rakho', 'error'); return; }
  const btn = document.getElementById('ptLockBtn');
  btn.disabled = true; btn.textContent = 'Locking...';
  try {
    const formData = new FormData();
    formData.append('file', ptLockFile);
    formData.append('password', password);
    formData.append('uploaded_by', currentUser);
    const res = await fetch('/api/locked-pdfs', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('ptLockResult').innerHTML = `✅ Locked! Isse "Unlock a PDF" tab me kisi ko share karo (ID + password dono zaroori): <br><strong style="user-select:all;">${data.id}</strong>`;
      toast('PDF locked & saved 🔒', 'success');
    } else { toast(data.error || 'Failed to lock', 'error'); }
  } catch { toast('Failed to lock. Check your connection.', 'error'); }
  btn.disabled = false; btn.textContent = '🔒 Lock & Save';
}
async function ptUnlockPdf() {
  const id = document.getElementById('ptUnlockId').value.trim();
  const password = document.getElementById('ptUnlockPassword').value;
  if (!id || !password) { toast('ID aur password dono bharo', 'error'); return; }
  try {
    const res = await fetch(`/api/locked-pdfs/${id}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (res.ok && data.url) {
      document.getElementById('ptUnlockResult').innerHTML = `✅ Correct password! <a href="${data.url}" target="_blank">Click here to download</a>`;
      toast('Unlocked! 🔓', 'success');
    } else { toast(data.error || 'Wrong password', 'error'); }
  } catch { toast('Failed. Check your connection.', 'error'); }
}

// ── Edit PDF ──
let ptEditPdfDoc = null;
let ptEditFile = null;
let ptEditPlacedItems = [];
let ptEditClickPos = null;

function ptEditSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  ptEditFile = file;
  ptEditPlacedItems = [];
  document.getElementById('ptEditDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  ptEditLoad();
}
async function ptEditLoad() {
  await ensurePdfJsLoaded();
  const arrayBuffer = await ptEditFile.arrayBuffer();
  ptEditPdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  document.getElementById('ptEditPageCount').textContent = `of ${ptEditPdfDoc.numPages} pages`;
  document.getElementById('ptEditPageNum').max = ptEditPdfDoc.numPages;
  document.getElementById('ptEditPageNum').value = 1;
  document.getElementById('ptEditWorkspace').classList.remove('hidden');
  ptEditRenderPage();
}
async function ptEditRenderPage() {
  if (!ptEditPdfDoc) return;
  let pageNum = parseInt(document.getElementById('ptEditPageNum').value) || 1;
  pageNum = Math.max(1, Math.min(ptEditPdfDoc.numPages, pageNum));
  const page = await ptEditPdfDoc.getPage(pageNum);
  const canvas = document.getElementById('ptEditCanvas');
  const containerWidth = canvas.parentElement.clientWidth || 500;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = containerWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  ptEditClickPos = null;
}
document.getElementById('ptEditCanvas')?.addEventListener('click', (e) => {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  ptEditClickPos = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  toast('📍 Position set — click "Place on Page"', '');
});
function ptEditAddText() {
  const text = document.getElementById('ptEditTextInput').value.trim();
  if (!text) { toast('Text likho pehle', 'error'); return; }
  if (!ptEditClickPos) { toast('Pehle page pe click karke position choose karo', 'error'); return; }
  const color = document.getElementById('ptEditTextColor').value;
  const pageNum = parseInt(document.getElementById('ptEditPageNum').value) || 1;
  const canvas = document.getElementById('ptEditCanvas');
  ptEditPlacedItems.push({ pageNum, text, color, x: ptEditClickPos.x, y: ptEditClickPos.y, canvasW: canvas.width, canvasH: canvas.height });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = '20px Arial';
  ctx.fillText(text, ptEditClickPos.x, ptEditClickPos.y);
  document.getElementById('ptEditTextInput').value = '';
  ptEditClickPos = null;
  toast('Text placed ✅ (add more or Save & Download)', 'success');
}
async function ptEditDownload() {
  if (!ptEditFile) return;
  if (!ptEditPlacedItems.length) { toast('Kuch add nahi kiya abhi tak', 'error'); return; }
  try {
    await ensurePdfLibLoaded();
    const arrayBuffer = await ptEditFile.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    for (const item of ptEditPlacedItems) {
      const page = pages[item.pageNum - 1];
      if (!page) continue;
      const { width, height } = page.getSize();
      const scaleX = width / item.canvasW, scaleY = height / item.canvasH;
      const r = parseInt(item.color.slice(1, 3), 16) / 255;
      const g = parseInt(item.color.slice(3, 5), 16) / 255;
      const b = parseInt(item.color.slice(5, 7), 16) / 255;
      page.drawText(item.text, {
        x: item.x * scaleX, y: height - (item.y * scaleY),
        size: 20 * scaleX, color: window.PDFLib.rgb(r, g, b)
      });
    }
    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ptEditFile.name.replace(/\.pdf$/i, '') + '-edited.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Saved & downloaded! 📥', 'success');
  } catch (err) { toast('Save failed: ' + err.message, 'error'); }
}

// ── Merge PDF ──
let ptMergeFiles = [];
function ptMergeAddFiles(e) {
  ptMergeFiles.push(...Array.from(e.target.files || []));
  ptMergeRenderList();
  e.target.value = '';
}
function ptMergeRenderList() {
  document.getElementById('ptMergeList').innerHTML = ptMergeFiles.map((f, i) => `
    <div class="pt-file-item">
      <span>${i+1}. ${escHtml(f.name)} (${formatBytes(f.size)})</span>
      <div style="display:flex;gap:4px;">
        <button onclick="ptMergeMove(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Move up">⬆</button>
        <button onclick="ptMergeMove(${i},1)" ${i === ptMergeFiles.length - 1 ? 'disabled' : ''} title="Move down">⬇</button>
        <button onclick="ptMergeRemove(${i})" title="Remove">✕</button>
      </div>
    </div>`).join('');
  document.getElementById('ptMergeBtn').disabled = ptMergeFiles.length < 2;
}
function ptMergeMove(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= ptMergeFiles.length) return;
  [ptMergeFiles[i], ptMergeFiles[j]] = [ptMergeFiles[j], ptMergeFiles[i]];
  ptMergeRenderList();
}
function ptMergeRemove(i) { ptMergeFiles.splice(i, 1); ptMergeRenderList(); }
async function ptMergeDownload() {
  if (ptMergeFiles.length < 2) return;
  const btn = document.getElementById('ptMergeBtn');
  btn.disabled = true; btn.textContent = 'Merging...';
  try {
    await ensurePdfLibLoaded();
    const outDoc = await window.PDFLib.PDFDocument.create();
    for (const file of ptMergeFiles) {
      const bytes = await file.arrayBuffer();
      const srcDoc = await window.PDFLib.PDFDocument.load(bytes);
      const pages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach(p => outDoc.addPage(p));
    }
    const bytes = await outDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'merged.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('PDFs merged! 📥', 'success');
  } catch (err) { toast('Merge failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '🔗 Merge & Download';
}

// ── Split PDF ──
let ptSplitFile = null;
function ptSplitSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptSplitFile = file;
  document.getElementById('ptSplitDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptSplitBtn').disabled = false;
}
function ptParseRange(rangeStr, maxPages) {
  const pages = new Set();
  rangeStr.split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(n => parseInt(n));
      for (let i = a; i <= b; i++) if (i >= 1 && i <= maxPages) pages.add(i - 1);
    } else {
      const n = parseInt(part);
      if (n >= 1 && n <= maxPages) pages.add(n - 1);
    }
  });
  return [...pages].sort((a, b) => a - b);
}
async function ptSplitDownload() {
  if (!ptSplitFile) return;
  const btn = document.getElementById('ptSplitBtn');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    await ensurePdfLibLoaded();
    const bytes = await ptSplitFile.arrayBuffer();
    const srcDoc = await window.PDFLib.PDFDocument.load(bytes);
    const total = srcDoc.getPageCount();
    const rangeStr = document.getElementById('ptSplitRange').value.trim();

    if (rangeStr) {
      const indices = ptParseRange(rangeStr, total);
      if (!indices.length) { toast('Invalid page range', 'error'); btn.disabled = false; btn.textContent = '✂️ Split & Download'; return; }
      const outDoc = await window.PDFLib.PDFDocument.create();
      const pages = await outDoc.copyPages(srcDoc, indices);
      pages.forEach(p => outDoc.addPage(p));
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = ptSplitFile.name.replace(/\.pdf$/i, '') + '-extract.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      await ensureJsZipLoaded();
      const zip = new window.JSZip();
      for (let i = 0; i < total; i++) {
        const outDoc = await window.PDFLib.PDFDocument.create();
        const [page] = await outDoc.copyPages(srcDoc, [i]);
        outDoc.addPage(page);
        const outBytes = await outDoc.save();
        zip.file(`page-${i + 1}.pdf`, outBytes);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a'); a.href = url; a.download = ptSplitFile.name.replace(/\.pdf$/i, '') + '-pages.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    toast('Split complete! 📥', 'success');
  } catch (err) { toast('Split failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '✂️ Split & Download';
}

// ── PDF to JPG ──
let ptPdf2jpgFile = null;
function ptPdf2JpgSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptPdf2jpgFile = file;
  document.getElementById('ptPdf2jpgDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptPdf2jpgBtn').disabled = false;
}
async function ptPdf2JpgDownload() {
  if (!ptPdf2jpgFile) return;
  const btn = document.getElementById('ptPdf2jpgBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensurePdfJsLoaded();
    await ensureJsZipLoaded();
    const bytes = await ptPdf2jpgFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const zip = new window.JSZip();
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      zip.file(`page-${i}.jpg`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a'); a.href = url; a.download = ptPdf2jpgFile.name.replace(/\.pdf$/i, '') + '-images.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Converted to JPGs! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '🖼️ Convert & Download ZIP';
}

// ── JPG to PDF ──
let ptJpg2pdfFiles = [];
function ptJpg2PdfAddFiles(e) {
  ptJpg2pdfFiles.push(...Array.from(e.target.files || []));
  ptJpg2PdfRenderList();
  e.target.value = '';
}
function ptJpg2PdfRenderList() {
  document.getElementById('ptJpg2pdfList').innerHTML = ptJpg2pdfFiles.map((f, i) => `<div class="pt-file-item"><span>${i+1}. ${escHtml(f.name)} (${formatBytes(f.size)})</span><button onclick="ptJpg2PdfRemove(${i})">✕</button></div>`).join('');
  document.getElementById('ptJpg2pdfBtn').disabled = !ptJpg2pdfFiles.length;
}
function ptJpg2PdfRemove(i) { ptJpg2pdfFiles.splice(i, 1); ptJpg2PdfRenderList(); }
async function ptJpg2PdfDownload() {
  if (!ptJpg2pdfFiles.length) return;
  const btn = document.getElementById('ptJpg2pdfBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensureJsPdfLoaded();
    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (const file of ptJpg2pdfFiles) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = dataUrl;
      });
      const orientation = img.width > img.height ? 'l' : 'p';
      if (!pdf) pdf = new jsPDF(orientation, 'pt', [img.width, img.height]);
      else pdf.addPage([img.width, img.height], orientation);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, img.width, img.height);
    }
    pdf.save('images.pdf');
    toast('Converted to PDF! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '🖼️ Convert to PDF ⬇';
}

// ── Rotate PDF ──
let ptRotateFile = null;
let ptRotateDeg = 90;
function ptRotateSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptRotateFile = file;
  document.getElementById('ptRotateDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptRotateBtn').disabled = false;
}
function ptSetRotateDeg(deg, el) {
  ptRotateDeg = deg;
  document.querySelectorAll('.pt-rotate-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
async function ptRotateDownload() {
  if (!ptRotateFile) return;
  const btn = document.getElementById('ptRotateBtn');
  btn.disabled = true; btn.textContent = 'Rotating...';
  try {
    await ensurePdfLibLoaded();
    const bytes = await ptRotateFile.arrayBuffer();
    const doc = await window.PDFLib.PDFDocument.load(bytes);
    const pages = doc.getPages();
    const rangeStr = document.getElementById('ptRotatePages').value.trim();
    const targetIndices = rangeStr ? ptParseRange(rangeStr, pages.length) : pages.map((_, i) => i);
    targetIndices.forEach(i => {
      const page = pages[i];
      if (!page) return;
      const current = page.getRotation().angle;
      page.setRotation(window.PDFLib.degrees((current + ptRotateDeg) % 360));
    });
    const outBytes = await doc.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = ptRotateFile.name.replace(/\.pdf$/i, '') + '-rotated.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Rotated! 📥', 'success');
  } catch (err) { toast('Rotate failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '🔄 Rotate & Download';
}

// ── Watermark ──
let ptWatermarkFile = null;
function ptWatermarkSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptWatermarkFile = file;
  document.getElementById('ptWatermarkDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptWatermarkBtn').disabled = false;
}
let ptWatermarkPos = 'center';
function ptSetWatermarkPos(pos, el) {
  ptWatermarkPos = pos;
  document.querySelectorAll('.pt-wm-pos-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
async function ptWatermarkDownload() {
  if (!ptWatermarkFile) return;
  const text = document.getElementById('ptWatermarkText').value.trim();
  if (!text) { toast('Watermark text likho', 'error'); return; }
  const btn = document.getElementById('ptWatermarkBtn');
  btn.disabled = true; btn.textContent = 'Adding...';
  try {
    await ensurePdfLibLoaded();
    const bytes = await ptWatermarkFile.arrayBuffer();
    const doc = await window.PDFLib.PDFDocument.load(bytes);
    const font = await doc.embedFont(window.PDFLib.StandardFonts.HelveticaBold);
    doc.getPages().forEach(page => {
      const { width, height } = page.getSize();
      let x, y, size, rotate;
      if (ptWatermarkPos === 'top') { x = width / 2 - (text.length * 6); y = height - 50; size = 24; rotate = 0; }
      else if (ptWatermarkPos === 'bottom') { x = width / 2 - (text.length * 6); y = 30; size = 24; rotate = 0; }
      else { x = width / 2 - (text.length * 12); y = height / 2; size = 48; rotate = 45; }
      page.drawText(text, {
        x, y, size, font, color: window.PDFLib.rgb(0.6, 0.6, 0.6),
        opacity: 0.35, rotate: window.PDFLib.degrees(rotate)
      });
    });
    const outBytes = await doc.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = ptWatermarkFile.name.replace(/\.pdf$/i, '') + '-watermarked.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Watermark added! 📥', 'success');
  } catch (err) { toast('Failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '💧 Add Watermark & Download';
}

// ── Sign PDF ──
let ptSignPdfDoc = null;
let ptSignFile = null;
let ptSignClickPos = null;
let ptSignPlacedItems = [];
let ptSignPadDrawing = false;

function ptSignSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptSignFile = file;
  ptSignPlacedItems = [];
  document.getElementById('ptSignDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  ptSignLoad();
}
async function ptSignLoad() {
  await ensurePdfJsLoaded();
  const bytes = await ptSignFile.arrayBuffer();
  ptSignPdfDoc = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  document.getElementById('ptSignPageCount').textContent = `of ${ptSignPdfDoc.numPages} pages`;
  document.getElementById('ptSignPageNum').max = ptSignPdfDoc.numPages;
  document.getElementById('ptSignPageNum').value = 1;
  document.getElementById('ptSignWorkspace').classList.remove('hidden');
  ptSignPadSetup();
  ptSignRenderPage();
}
async function ptSignRenderPage() {
  if (!ptSignPdfDoc) return;
  let pageNum = parseInt(document.getElementById('ptSignPageNum').value) || 1;
  pageNum = Math.max(1, Math.min(ptSignPdfDoc.numPages, pageNum));
  const page = await ptSignPdfDoc.getPage(pageNum);
  const canvas = document.getElementById('ptSignCanvas');
  const containerWidth = canvas.parentElement.clientWidth || 500;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = containerWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  ptSignClickPos = null;
}
document.getElementById('ptSignCanvas')?.addEventListener('click', (e) => {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  ptSignClickPos = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  toast('📍 Position set — draw & place your signature', '');
});
function ptSignPadSetup() {
  const pad = document.getElementById('ptSignPad');
  if (!pad || pad.dataset.bound) return;
  pad.dataset.bound = '1';
  const ctx = pad.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a1612';
  const getPos = (e) => {
    const rect = pad.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => { e.preventDefault(); ptSignPadDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!ptSignPadDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { ptSignPadDrawing = false; };
  pad.addEventListener('mousedown', start); pad.addEventListener('mousemove', move); pad.addEventListener('mouseup', end); pad.addEventListener('mouseleave', end);
  pad.addEventListener('touchstart', start, { passive: false }); pad.addEventListener('touchmove', move, { passive: false }); pad.addEventListener('touchend', end);
}
function ptSignPadClear() {
  const pad = document.getElementById('ptSignPad');
  pad.getContext('2d').clearRect(0, 0, pad.width, pad.height);
}
function ptSignPlace() {
  if (!ptSignClickPos) { toast('Pehle page pe click karke position choose karo', 'error'); return; }
  const pad = document.getElementById('ptSignPad');
  const dataUrl = pad.toDataURL('image/png');
  const pageNum = parseInt(document.getElementById('ptSignPageNum').value) || 1;
  const canvas = document.getElementById('ptSignCanvas');
  ptSignPlacedItems.push({ pageNum, dataUrl, x: ptSignClickPos.x, y: ptSignClickPos.y, canvasW: canvas.width, canvasH: canvas.height });
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => { ctx.drawImage(img, ptSignClickPos.x, ptSignClickPos.y - 40, 120, 40); };
  img.src = dataUrl;
  ptSignClickPos = null;
  toast('Signature placed ✅ (add more or Save & Download)', 'success');
}
async function ptSignDownload() {
  if (!ptSignFile) return;
  if (!ptSignPlacedItems.length) { toast('Pehle signature place karo', 'error'); return; }
  try {
    await ensurePdfLibLoaded();
    const bytes = await ptSignFile.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(bytes);
    const pages = pdfDoc.getPages();
    for (const item of ptSignPlacedItems) {
      const page = pages[item.pageNum - 1];
      if (!page) continue;
      const { width, height } = page.getSize();
      const scaleX = width / item.canvasW, scaleY = height / item.canvasH;
      const pngImage = await pdfDoc.embedPng(item.dataUrl);
      const sigW = 120 * scaleX, sigH = 40 * scaleY;
      page.drawImage(pngImage, {
        x: item.x * scaleX, y: height - (item.y * scaleY) - sigH,
        width: sigW, height: sigH
      });
    }
    const outBytes = await pdfDoc.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = ptSignFile.name.replace(/\.pdf$/i, '') + '-signed.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Signed & downloaded! 📥', 'success');
  } catch (err) { toast('Failed: ' + err.message, 'error'); }
}

// ── PDF to PPT ──
let ptPdf2pptFile = null;
function ptPdf2PptSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptPdf2pptFile = file;
  document.getElementById('ptPdf2pptDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptPdf2pptBtn').disabled = false;
}
async function ptPdf2PptDownload() {
  if (!ptPdf2pptFile) return;
  const btn = document.getElementById('ptPdf2pptBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensurePdfJsLoaded();
    await ensurePptxGenLoaded();
    const bytes = await ptPdf2pptFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const pptx = new window.PptxGenJS();
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const slide = pptx.addSlide();
      slide.addImage({ data: dataUrl, x: 0, y: 0, w: '100%', h: '100%' });
    }
    await pptx.writeFile({ fileName: ptPdf2pptFile.name.replace(/\.pdf$/i, '') + '.pptx' });
    toast('Converted to PPTX! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '📊 Convert to PPTX ⬇';
}

// ── PPT to PDF ──
let ptPpt2pdfFile = null;
function ptPpt2PdfSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptPpt2pdfFile = file;
  document.getElementById('ptPpt2pdfDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📊</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptPpt2pdfBtn').disabled = false;
}
async function ptPpt2PdfDownload() {
  if (!ptPpt2pdfFile) return;
  const btn = document.getElementById('ptPpt2pdfBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensureJsZipLoaded();
    await ensureJsPdfLoaded();
    const bytes = await ptPpt2pdfFile.arrayBuffer();
    const zip = await window.JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/slide(\d+)\.xml/)[1]) - parseInt(b.match(/slide(\d+)\.xml/)[1]));
    if (!slideFiles.length) throw new Error('No slides found in this file');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'pt', 'a4');
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async('text');
      const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
      if (i > 0) pdf.addPage();
      pdf.setFontSize(20);
      pdf.text(`Slide ${i + 1}`, 40, 40);
      pdf.setFontSize(14);
      let y = 80;
      texts.forEach(t => {
        const lines = pdf.splitTextToSize(t, 750);
        pdf.text(lines, 40, y);
        y += lines.length * 18 + 10;
      });
    }
    pdf.save(ptPpt2pdfFile.name.replace(/\.pptx$/i, '') + '.pdf');
    toast('Converted to PDF! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '📊 Convert to PDF ⬇';
}

// ── PDF to Excel ──
let ptPdf2excelFile = null;
function ptPdf2ExcelSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptPdf2excelFile = file;
  document.getElementById('ptPdf2excelDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📄</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptPdf2excelBtn').disabled = false;
}
async function ptPdf2ExcelDownload() {
  if (!ptPdf2excelFile) return;
  const btn = document.getElementById('ptPdf2excelBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensurePdfJsLoaded();
    await ensureXlsxLoaded();
    const bytes = await ptPdf2excelFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const rows = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const lines = {};
      textContent.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if (!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
      sortedY.forEach(y => rows.push([lines[y].join(' ')]));
    }
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    window.XLSX.writeFile(wb, ptPdf2excelFile.name.replace(/\.pdf$/i, '') + '.xlsx');
    toast('Converted to Excel! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '📊 Convert to Excel ⬇';
}

// ── Excel to PDF ──
let ptExcel2pdfFile = null;
function ptExcel2PdfSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  ptExcel2pdfFile = file;
  document.getElementById('ptExcel2pdfDropInner').innerHTML = `<div class="file-selected"><span class="file-icon">📊</span><div><div class="file-selected-name">${escHtml(file.name)}</div><div class="file-selected-size">${formatBytes(file.size)}</div></div></div>`;
  document.getElementById('ptExcel2pdfBtn').disabled = false;
}
// ══════════════════════════════════════════════════
// MS WORD LIGHT VERSION (simple rich-text editor)
// ══════════════════════════════════════════════════
let mswordSavedRange = null;
function mswordSaveSelection() {
  const sel = window.getSelection();
  const editor = document.getElementById('mswordEditor');
  if (sel && sel.rangeCount > 0 && editor && editor.contains(sel.anchorNode)) mswordSavedRange = sel.getRangeAt(0);
}
function mswordRestoreSelection() {
  const sel = window.getSelection();
  if (mswordSavedRange) { sel.removeAllRanges(); sel.addRange(mswordSavedRange); }
}
document.getElementById('mswordEditor')?.addEventListener('keyup', mswordSaveSelection);
document.getElementById('mswordEditor')?.addEventListener('mouseup', mswordSaveSelection);

function openMSWordModal() {
  mswordCloseBackstage();
  openModal('mswordModal');
  setTimeout(() => document.getElementById('mswordEditor')?.focus(), 100);
}
function mswordSwitchTab(tab) {
  document.querySelectorAll('.msword-tab').forEach(b => b.classList.toggle('active', b.dataset.mwtab === tab));
  ['home', 'insert', 'layout', 'design'].forEach(t => document.getElementById(`mwtab-${t}`)?.classList.toggle('hidden', t !== tab));
}
function mswordOpenBackstage() {
  mswordRenderSavedList();
  document.getElementById('mswordBackstage')?.classList.remove('hidden');
}
function mswordCloseBackstage() {
  document.getElementById('mswordBackstage')?.classList.add('hidden');
}
function mswordExec(cmd, val = null) {
  document.getElementById('mswordEditor')?.focus();
  mswordRestoreSelection();
  document.execCommand(cmd, false, val);
  mswordUpdateWordCount();
}
function mswordApplyFont(f) {
  document.getElementById('mswordEditor')?.focus();
  mswordRestoreSelection();
  document.execCommand('fontName', false, f);
}
function mswordApplySize(s) {
  document.getElementById('mswordEditor')?.focus();
  mswordRestoreSelection();
  document.execCommand('fontSize', false, '7');
  document.querySelectorAll('#mswordEditor font[size="7"]').forEach(el => { el.removeAttribute('size'); el.style.fontSize = s + 'pt'; });
}
function mswordUpdateWordCount() {
  const text = document.getElementById('mswordEditor')?.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const el = document.getElementById('mswordWordCount');
  if (el) el.textContent = `Words: ${words}`;
}

// ── Insert tab ──
function mswordInsertTable() {
  const rows = parseInt(prompt('Number of rows?', '3')) || 3;
  const cols = parseInt(prompt('Number of columns?', '3')) || 3;
  let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;">';
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) html += '<td style="border:1px solid #999;padding:6px 8px;min-width:40px;">&nbsp;</td>';
    html += '</tr>';
  }
  html += '</table><p><br></p>';
  document.getElementById('mswordEditor')?.focus();
  mswordRestoreSelection();
  document.execCommand('insertHTML', false, html);
  mswordUpdateWordCount();
}
function mswordInsertImage(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('mswordEditor')?.focus();
    mswordRestoreSelection();
    document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:100%;margin:8px 0;" />`);
    mswordUpdateWordCount();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
function mswordInsertLink() {
  const url = prompt('Enter URL:', 'https://'); if (!url) return;
  document.getElementById('mswordEditor')?.focus();
  mswordRestoreSelection();
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    const text = prompt('Link text:', url) || url;
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank">${escHtml(text)}</a>`);
  } else {
    document.execCommand('createLink', false, url);
  }
}
function mswordInsertPageBreak() {
  document.getElementById('mswordEditor')?.focus();
  mswordRestoreSelection();
  document.execCommand('insertHTML', false, '<div style="page-break-before:always;border-top:1px dashed #999;margin:24px 0;padding-top:8px;color:#999;font-size:11px;">— Page break —</div>');
  mswordUpdateWordCount();
}

// ── Layout tab ──
function mswordApplyMargin(px) {
  const page = document.getElementById('mswordEditor');
  if (page) page.style.padding = `50px ${px}px`;
}
function mswordApplyOrientation(o) {
  const page = document.getElementById('mswordEditor');
  if (!page) return;
  const baseW = parseInt(document.getElementById('mswordPageSize').value) || 700;
  page.style.width = o === 'landscape' ? (baseW + 260) + 'px' : baseW + 'px';
}
function mswordApplyPageSize(px) {
  const page = document.getElementById('mswordEditor');
  if (!page) return;
  const orientation = document.getElementById('mswordOrientation').value;
  page.style.width = orientation === 'landscape' ? (parseInt(px) + 260) + 'px' : px + 'px';
}
function mswordApplyColumns(n) {
  const page = document.getElementById('mswordEditor');
  if (page) { page.style.columnCount = n; page.style.columnGap = '32px'; }
}

// ── Design tab ──
function mswordSetPageColor(color, el) {
  const page = document.getElementById('mswordEditor');
  if (page) page.style.background = color;
  document.querySelectorAll('#mswordPageColorSwatches .msword-swatch').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
}
let mswordBorderOn = false;
function mswordToggleBorder() {
  mswordBorderOn = !mswordBorderOn;
  const page = document.getElementById('mswordEditor');
  if (page) page.style.border = mswordBorderOn ? '3px double #333' : 'none';
  document.getElementById('mswordBorderBtn').textContent = mswordBorderOn ? 'Border on' : 'Border off';
}
function mswordSetWatermark() {
  const text = prompt('Watermark text:', 'DRAFT');
  if (!text) return;
  mswordApplyWatermark(text);
}
function mswordClearWatermark() { mswordApplyWatermark(''); }
function mswordApplyWatermark(text) {
  const wrap = document.querySelector('.msword-page-wrap');
  if (!wrap) return;
  let wm = document.getElementById('mswordWatermarkEl');
  if (!text) { wm?.remove(); return; }
  if (!wm) {
    wm = document.createElement('div');
    wm.id = 'mswordWatermarkEl';
    wm.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:72px;font-weight:700;color:rgba(150,150,150,0.35);pointer-events:none;white-space:nowrap;user-select:none;z-index:5;';
    wrap.appendChild(wm);
  }
  wm.textContent = text;
}

// ── File backstage ──
function mswordNew() {
  if (!confirm('Start a new document? Unsaved changes will be lost.')) return;
  document.getElementById('mswordEditor').innerHTML = '<p>Start typing your document here...</p>';
  document.getElementById('mswordTitle').value = 'Document1';
  mswordUpdateWordCount();
  mswordCloseBackstage();
}
function mswordGetSavedDocs() {
  try { return JSON.parse(localStorage.getItem('studyhub_msword_docs') || '{}'); } catch { return {}; }
}
function mswordSave() {
  const title = document.getElementById('mswordTitle').value.trim() || 'Document1';
  const docs = mswordGetSavedDocs();
  docs[title] = { html: document.getElementById('mswordEditor').innerHTML, savedAt: Date.now() };
  localStorage.setItem('studyhub_msword_docs', JSON.stringify(docs));
  const statusEl = document.getElementById('mswordStatus');
  statusEl.textContent = 'Saved ✅';
  setTimeout(() => statusEl.textContent = '', 1500);
}
function mswordSaveAs() {
  const t = prompt('Save as:', document.getElementById('mswordTitle').value.trim() || 'Document1');
  if (!t) return;
  document.getElementById('mswordTitle').value = t;
  mswordSave();
  mswordCloseBackstage();
}
function mswordRenderSavedList() {
  const docs = mswordGetSavedDocs();
  const container = document.getElementById('mswordSavedList');
  if (!container) return;
  const titles = Object.keys(docs);
  if (!titles.length) { container.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;">No saved documents yet</div>'; return; }
  container.innerHTML = titles.map(t => `
    <div class="msword-saved-item">
      <span onclick="mswordOpenSaved('${escHtml(t).replace(/'/g, "\\'")}')" style="flex:1;">${escHtml(t)}</span>
      <button onclick="mswordDeleteSaved('${escHtml(t).replace(/'/g, "\\'")}')">✕</button>
    </div>`).join('');
}
function mswordOpenSaved(title) {
  const docs = mswordGetSavedDocs();
  if (!docs[title]) return;
  document.getElementById('mswordEditor').innerHTML = docs[title].html;
  document.getElementById('mswordTitle').value = title;
  mswordUpdateWordCount();
  mswordCloseBackstage();
}
function mswordDeleteSaved(title) {
  const docs = mswordGetSavedDocs();
  delete docs[title];
  localStorage.setItem('studyhub_msword_docs', JSON.stringify(docs));
  mswordRenderSavedList();
}
async function mswordUploadFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (/\.docx$/i.test(file.name)) {
      await ensureMammothLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      document.getElementById('mswordEditor').innerHTML = result.value || '<p></p>';
    } else {
      const text = await file.text();
      document.getElementById('mswordEditor').innerHTML = text.includes('<body')
        ? (text.split(/<body[^>]*>/)[1]?.split('</body>')[0] || text)
        : `<p>${escHtml(text).replace(/\n/g, '</p><p>')}</p>`;
    }
    document.getElementById('mswordTitle').value = file.name.replace(/\.[^.]+$/, '');
    mswordUpdateWordCount();
    mswordCloseBackstage();
    toast('File opened! 📂', 'success');
  } catch (err) { toast('Could not open file: ' + err.message, 'error'); }
}
function mswordDownloadHtml() {
  const title = document.getElementById('mswordTitle').value.trim() || 'Document1';
  const html = document.getElementById('mswordEditor').innerHTML;
  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title></head><body>${html}</body></html>`;
  const blob = new Blob([full], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${title}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  mswordCloseBackstage();
}
async function mswordDownloadDocx() {
  const title = document.getElementById('mswordTitle').value.trim() || 'Document1';
  try {
    const text = document.getElementById('mswordEditor').innerText || '';
    const paragraphs = text.split('\n');
    const blob = await buildDocxBlob(paragraphs.length ? paragraphs : ['']);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${title}.docx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded as Word! 📥', 'success');
  } catch (err) { toast('Download failed: ' + err.message, 'error'); }
  mswordCloseBackstage();
}
function mswordPrint() {
  const html = document.getElementById('mswordEditor').innerHTML;
  const w = window.open('', '_blank');
  if (w) { w.document.write(`<html><head><title>Print</title></head><body>${html}</body></html>`); w.document.close(); w.print(); }
  mswordCloseBackstage();
}

async function ptExcel2PdfDownload() {
  if (!ptExcel2pdfFile) return;
  const btn = document.getElementById('ptExcel2pdfBtn');
  btn.disabled = true; btn.textContent = 'Converting...';
  try {
    await ensureXlsxLoaded();
    await ensureJsPdfLoaded();
    const bytes = await ptExcel2pdfFile.arrayBuffer();
    const wb = window.XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'pt', 'a4');
    pdf.setFontSize(11);
    let y = 40;
    rows.forEach(row => {
      const line = row.map(c => (c === undefined ? '' : String(c))).join('   |   ');
      const lines = pdf.splitTextToSize(line, 780);
      if (y + lines.length * 16 > 560) { pdf.addPage(); y = 40; }
      pdf.text(lines, 30, y);
      y += lines.length * 16 + 6;
    });
    pdf.save(ptExcel2pdfFile.name.replace(/\.xlsx?$/i, '') + '.pdf');
    toast('Converted to PDF! 📥', 'success');
  } catch (err) { toast('Conversion failed: ' + err.message, 'error'); }
  btn.disabled = false; btn.textContent = '📊 Convert to PDF ⬇';
}

// ══════════════════════════════════════════════════
// VOICE COMMAND (Web Speech API — Hindi/English)
// ══════════════════════════════════════════════════
let voiceRecognition = null;
let voiceListening = false;

function ensureSpeechRecognitionSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

function startVoiceCommand() {
  if (voiceListening) { stopVoiceCommand(); return; }
  if (!ensureSpeechRecognitionSupported()) {
    toast('⚠️ This browser does not have voice command support', 'error');
    return;
  }
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceRecognition = new SpeechRecognitionCtor();
  // en-IN handles both plain English and Hinglish (Hindi spoken/mixed) speech
  // reasonably well in Chrome's speech engine without needing a language toggle.
  voiceRecognition.lang = 'en-IN';
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;
  voiceRecognition.maxAlternatives = 1;

  const indicator = document.getElementById('voiceIndicator');
  const statusText = document.getElementById('voiceStatusText');
  const transcriptEl = document.getElementById('voiceTranscript');
  if (transcriptEl) transcriptEl.textContent = '';
  if (statusText) statusText.textContent = '🎤 Listening... speak';
  indicator?.classList.remove('hidden');
  document.getElementById('voiceMicBtn')?.classList.add('listening');
  document.getElementById('voiceMicBtnMobile')?.classList.add('listening');
  voiceListening = true;

  voiceRecognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    if (transcriptEl) transcriptEl.textContent = final || interim;
    if (final) {
      if (statusText) statusText.textContent = '⚙️ Processing command...';
      voiceProcessCommand(final);
    }
  };

  voiceRecognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'permission-denied') {
      toast('🚫 Give microphone permission, then only voice command will work', 'error');
    } else if (e.error === 'no-speech') {
      toast('🔇 Did not hear anything, try again', 'error');
    } else if (e.error !== 'aborted') {
      toast('⚠️ Voice error: ' + e.error, 'error');
    }
  };

  voiceRecognition.onend = () => {
    voiceListening = false;
    document.getElementById('voiceMicBtn')?.classList.remove('listening');
    document.getElementById('voiceMicBtnMobile')?.classList.remove('listening');
    setTimeout(() => indicator?.classList.add('hidden'), 900);
  };

  try { voiceRecognition.start(); }
  catch { voiceListening = false; indicator?.classList.add('hidden'); }
}

function stopVoiceCommand() {
  if (voiceRecognition && voiceListening) voiceRecognition.stop();
}

function voiceExtractFolderName(text) {
  return text
    .replace(/\b(please|open|folder|khol dijiye|khol do|kholo|khol|karo)\b/gi, '')
    .trim();
}

function voiceTryOpenFolder(rawText) {
  const name = voiceExtractFolderName(rawText);
  if (!name) return false;
  const norm = normalizeSearchText(name);
  if (!norm) return false;

  if (currentNoteCourse && currentCourseSubjects.length) {
    const subMatch = currentCourseSubjects.find(s => {
      const sn = normalizeSearchText(s.name);
      return sn.includes(norm) || norm.includes(sn);
    });
    if (subMatch) { switchTab('notes'); openNoteSubject(subMatch.name); return true; }
  }
  if (allCourses.length) {
    const courseMatch = allCourses.find(c => {
      const cn = normalizeSearchText(c.name);
      return cn.includes(norm) || norm.includes(cn);
    });
    if (courseMatch) { switchTab('notes'); openNoteCourse(courseMatch.name); return true; }
  }
  if (typeof allTTSections !== 'undefined' && allTTSections.length) {
    const ttMatch = allTTSections.find(s => {
      const sn = normalizeSearchText(s.name);
      return sn.includes(norm) || norm.includes(sn);
    });
    if (ttMatch) { switchTab('timetable'); openTimetableSection(ttMatch.name); return true; }
  }
  return false;
}

function voiceProcessCommand(rawText) {
  const text = rawText.toLowerCase().trim();
  if (!text) return;
  const say = (msg) => toast(msg, '');

  if (/\b(logout|log out|leave|nikal jao|nikal)\b/.test(text)) { say('👋 Logging out...'); logout(); return; }

  if (/dark\s?(theme|mode)|theme\s?dark/.test(text)) { setTheme('dark'); say('🌙 Dark theme on'); return; }
  if (/light\s?(theme|mode)|theme\s?light/.test(text)) { setTheme('light'); say('☀️ Light theme on'); return; }
  if (/blue\s?theme/.test(text)) { setTheme('blue'); say('🔵 Blue theme on'); return; }
  if (/green\s?theme/.test(text)) { setTheme('green'); say('🟢 Green theme on'); return; }

  if (/time\s?table/.test(text)) { switchTab('timetable'); say('🗓 Timetable opened'); return; }
  if (/\bquiz\b/.test(text)) { switchTab('quiz'); say('🎯 Quiz opened'); return; }
  if (/\bplanner\b/.test(text)) { switchTab('planner'); say('📅 Planner opened'); return; }
  if (/(question|qna|q\s?and\s?a|sawal)/.test(text) && !/paper/.test(text)) { switchTab('questions'); say('💬 Q&A opened'); return; }
  if (/\badmin\b/.test(text)) { switchTab('admin'); say('👑 Admin panel opened'); return; }

  if (/upload.*note|note.*upload/.test(text)) { switchTab('notes'); openUploadModal(); say('📤 Upload form opened'); return; }
  if (/message.*admin|admin.*message/.test(text)) { openMessageModal(); say('✉️ Message opened'); return; }
  if (/\bgame\b/.test(text) && !/keyboard/.test(text)) { switchTab('notes'); openGameModal(); say('🎮 Game opened'); return; }
  if (/\bsnake\b/.test(text)) { switchTab('notes'); openSnakeModal(); say('🐍 Snake game opened'); return; }
  if (/attendance/.test(text)) { switchTab('notes'); openAttendanceModal(); say('🧮 Attendance calculator opened'); return; }
  if (/chatbot|question\s?paper/.test(text)) { switchTab('notes'); openChatbotModal(); say('🤖 Question Paper Analyzer opened'); return; }
  if (/confession/.test(text)) { switchTab('notes'); openConfessionModal(); say('🎭 Confession opened'); return; }
  if (/keyboard\s?warrior|warrior/.test(text)) { switchTab('notes'); openKWModal(); say('⚔️ Keyboard Warrior opened'); return; }
  if (/image.*(tool|editor|resize)|photo.*(edit|resize)/.test(text)) { switchTab('notes'); openImgToolsModal(); say('🖼️ Image tool opened'); return; }
  if (/pdf.*(tool|editor|convert)/.test(text)) { switchTab('notes'); openPdfToolsModal(); say('📄 PDF tool opened'); return; }
  if (/ms\s?word|word\s?editor/.test(text)) { switchTab('notes'); openMSWordModal(); say('📝 MS Word opened'); return; }

  if (/\bsearch\b/.test(text)) {
    const query = text.replace(/.*\bsearch\b/i, '').trim();
    if (query) {
      switchTab('notes');
      const input = document.getElementById('globalNoteSearch');
      if (input) { input.value = query; handleGlobalSearch(); say(`🔍 Searching for "${query}"`); return; }
    }
  }

  if (/khol|kholo|open|folder/.test(text)) {
    if (voiceTryOpenFolder(text)) { say('📁 Folder opened'); return; }
  }

  if (/\bnotes\b/.test(text)) { switchTab('notes'); say('🗂 Notes opened'); return; }

  say('❓ Did not understand, try again');
}