// ============================================
// RISEUP - Goals & Habits Tracker
// With Firebase Cloud Sync
// ============================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyC0iIZwC12V8qPEPwqI3-JZpxeaFaI0lR8",
    authDomain: "boys-goal-app.firebaseapp.com",
    projectId: "boys-goal-app",
    storageBucket: "boys-goal-app.firebasestorage.app",
    messagingSenderId: "287812145399",
    appId: "1:287812145399:web:6654e556404c5d2c9e83f2",
    measurementId: "G-NW89YC2ZXT"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ============================================
// STATE
// ============================================
// Goal Tracker state
let goals = [];
let currentGoalId = null;
let editingGoalId = null;
let selectedType = 'financial';
let selectedIcon = 'star';
let selectedColor = '#007AFF';

// Habit Tracker state
let habits = [];
let habitChecks = {}; // { "2026-02-14": { "habitId": true } }
let currentWeekOffset = 0;
let editingHabitId = null;
let selectedHabitIcon = 'workout';
let selectedHabitColor = '#34C759';
let reportPeriod = 'weekly';

// Auth state
let currentUser = null;
let unsubscribeSnapshot = null;
let isSyncingFromCloud = false;

// ============================================
// CONSTANTS
// ============================================
const ICONS = {
    star: '\u2733',
    money: '\uD83D\uDCB0',
    target: '\uD83C\uDFAF',
    trophy: '\uD83C\uDFC6',
    rocket: '\uD83D\uDE80',
    heart: '\u2764\uFE0F',
    fire: '\uD83D\uDD25',
    gem: '\uD83D\uDC8E'
};

const HABIT_ICONS = {
    workout: '\uD83D\uDCAA',
    reading: '\uD83D\uDCD6',
    meditation: '\uD83E\uDDD8',
    water: '\uD83D\uDCA7',
    running: '\uD83C\uDFC3',
    journal: '\uD83D\uDCDD',
    creative: '\uD83C\uDFA8',
    sleep: '\uD83D\uDE34'
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MOTIVATIONAL = [
    'Keep pushing forward',
    'One step at a time',
    'You\'re making progress',
    'Stay focused, stay sharp',
    'Every entry counts',
    'Discipline is freedom',
    'Consistency beats intensity',
    'Build your future today'
];

// ============================================
// DOM ELEMENTS
// ============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const loadingScreen = $('#loading-screen');
const authScreen = $('#auth-screen');
const app = $('#app');
const hubScreen = $('#hub-screen');
const homeScreen = $('#home-screen');
const createScreen = $('#create-screen');
const detailScreen = $('#detail-screen');
const habitsScreen = $('#habits-screen');
const habitFormScreen = $('#habit-form-screen');
const habitReportsScreen = $('#habit-reports-screen');
const goalsGrid = $('#goals-grid');
const goalForm = $('#goal-form');
const toast = $('#toast');
const confettiCanvas = $('#confetti-canvas');
const ctx = confettiCanvas.getContext('2d');
const syncStatus = $('#sync-status');
const syncIcon = $('#sync-icon');
const syncText = $('#sync-text');

// ============================================
// SYNC STATUS UI
// ============================================
function showSyncStatus(type, message) {
    syncStatus.classList.remove('hidden', 'sync-saving', 'sync-saved', 'sync-offline', 'sync-error');
    syncStatus.classList.add('sync-' + type);
    syncIcon.textContent = type === 'saving' ? '\u2B6E' : type === 'saved' ? '\u2713' : type === 'offline' ? '\u26A0' : '\u2717';
    syncText.textContent = message;

    if (type === 'saved') {
        setTimeout(() => {
            syncStatus.classList.add('hidden');
        }, 2000);
    }
}

// ============================================
// FIREBASE AUTH
// ============================================
let isSignUpMode = false;

function showAuthError(msg) {
    const el = $('#auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function hideAuthError() {
    $('#auth-error').classList.add('hidden');
}

function handleAuthSubmit(e) {
    e.preventDefault();
    hideAuthError();

    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const btn = $('#auth-submit-btn');

    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }

    btn.disabled = true;
    btn.textContent = isSignUpMode ? 'Creating account...' : 'Signing in...';

    const authFn = isSignUpMode
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password);

    authFn.then(() => {
        // onAuthStateChanged will handle the rest
    }).catch((error) => {
        btn.disabled = false;
        btn.textContent = isSignUpMode ? 'Sign Up' : 'Sign In';

        const messages = {
            'auth/user-not-found': 'No account with this email. Try Sign Up instead.',
            'auth/wrong-password': 'Wrong password. Try again.',
            'auth/invalid-credential': 'Wrong email or password. Try again.',
            'auth/email-already-in-use': 'Email already registered. Try Sign In instead.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.'
        };
        showAuthError(messages[error.code] || 'Sign in failed: ' + error.message);
    });
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    hideAuthError();
    $('#auth-submit-btn').textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
    $('#auth-toggle-btn').innerHTML = isSignUpMode
        ? 'Already have an account? <strong>Sign In</strong>'
        : "Don't have an account? <strong>Sign Up</strong>";
}

function handleSignOut() {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }
    signOut(auth).then(() => {
        goals = [];
        habits = [];
        habitChecks = {};
        currentUser = null;
        app.classList.add('hidden');
        authScreen.classList.remove('hidden');
    });
}

// ============================================
// FIRESTORE SYNC
// ============================================
function getUserDocRef() {
    if (!currentUser) return null;
    return doc(db, 'users', currentUser.uid);
}

function saveData() {
    // Save to localStorage as backup
    localStorage.setItem('riseup_goals', JSON.stringify(goals));
    localStorage.setItem('riseup_habits', JSON.stringify(habits));
    localStorage.setItem('riseup_checks', JSON.stringify(habitChecks));

    // Save to Firestore
    if (currentUser) {
        const ref = getUserDocRef();
        if (!ref) return;
        showSyncStatus('saving', 'Saving...');
        setDoc(ref, {
            goals: JSON.parse(JSON.stringify(goals)),
            habits: JSON.parse(JSON.stringify(habits)),
            habitChecks: JSON.parse(JSON.stringify(habitChecks)),
            updatedAt: new Date().toISOString()
        }).then(() => {
            showSyncStatus('saved', 'Saved to cloud');
        }).catch((err) => {
            console.error('Save error:', err);
            showSyncStatus('error', 'Save failed');
        });
    }
}

// Keep backward compat - old code calls saveGoals()
function saveGoals() {
    saveData();
}

function loadLocalData() {
    try {
        // Try new keys first, fall back to old key
        const goalsData = localStorage.getItem('riseup_goals') || localStorage.getItem('goals_tracker_data');
        goals = goalsData ? JSON.parse(goalsData) : [];
    } catch { goals = []; }
    try {
        const habitsData = localStorage.getItem('riseup_habits');
        habits = habitsData ? JSON.parse(habitsData) : [];
    } catch { habits = []; }
    try {
        const checksData = localStorage.getItem('riseup_checks');
        habitChecks = checksData ? JSON.parse(checksData) : {};
    } catch { habitChecks = {}; }
}

function startRealtimeSync() {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    const ref = getUserDocRef();
    if (!ref) return;

    unsubscribeSnapshot = onSnapshot(ref, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            isSyncingFromCloud = true;

            if (data.goals) goals = data.goals;
            if (data.habits) habits = data.habits;
            if (data.habitChecks) habitChecks = data.habitChecks;

            // Update localStorage backup
            localStorage.setItem('riseup_goals', JSON.stringify(goals));
            localStorage.setItem('riseup_habits', JSON.stringify(habits));
            localStorage.setItem('riseup_checks', JSON.stringify(habitChecks));

            renderHub();
            renderHome();

            // Refresh active screens
            if (currentGoalId && detailScreen.classList.contains('active')) {
                openGoalDetail(currentGoalId);
            }
            if (habitsScreen.classList.contains('active')) {
                renderHabitsScreen();
            }

            isSyncingFromCloud = false;
        }
    }, (error) => {
        console.error('Realtime sync error:', error);
        showSyncStatus('offline', 'Offline mode');
    });
}

async function migrateLocalDataToCloud() {
    try {
        const localGoals = localStorage.getItem('riseup_goals') || localStorage.getItem('goals_tracker_data');
        const localHabits = localStorage.getItem('riseup_habits');
        const localChecks = localStorage.getItem('riseup_checks');

        const goalsArr = localGoals ? JSON.parse(localGoals) : [];
        const habitsArr = localHabits ? JSON.parse(localHabits) : [];
        const checksObj = localChecks ? JSON.parse(localChecks) : {};

        if (goalsArr.length === 0 && habitsArr.length === 0) return;

        const ref = getUserDocRef();
        if (!ref) return;

        await setDoc(ref, {
            goals: goalsArr,
            habits: habitsArr,
            habitChecks: checksObj,
            updatedAt: new Date().toISOString()
        }, { merge: false });
    } catch (err) {
        console.error('Migration error:', err);
    }
}

// ============================================
// NAVIGATION
// ============================================
function showScreen(screen) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');

    // Show FAB only on goals home or habits home
    const goalFab = $('#add-goal-btn');
    const habitFab = $('#add-habit-btn');
    if (goalFab) goalFab.classList.toggle('hidden', screen !== homeScreen);
    if (habitFab) habitFab.classList.toggle('hidden', screen !== habitsScreen);
}

// ============================================
// HELPERS
// ============================================
function formatNumber(num) {
    return new Intl.NumberFormat('en-PK').format(num);
}

function formatDate(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDeadlineInfo(goal) {
    if (!goal.deadline) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadline = new Date(goal.deadline + 'T00:00:00');
    const diff = deadline - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    const isComplete = goal.achieved >= goal.target;
    const dateStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (isComplete) return { text: 'Completed', class: 'deadline-done', days, dateStr };
    if (days < 0) return { text: Math.abs(days) + 'd overdue', class: 'deadline-overdue', days, dateStr };
    if (days === 0) return { text: 'Due today', class: 'deadline-urgent', days, dateStr };
    if (days <= 7) return { text: days + 'd left', class: 'deadline-urgent', days, dateStr };
    return { text: days + 'd left', class: '', days, dateStr };
}

function getProgress(goal) {
    if (goal.target <= 0) return 0;
    return Math.min((goal.achieved / goal.target) * 100, 100);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function resolveGoalIcon(icon) {
    if (icon && icon.startsWith('custom:')) return icon.slice(7);
    return ICONS[icon] || ICONS.star;
}

function resolveHabitIcon(icon) {
    if (icon && icon.startsWith('custom:')) return icon.slice(7);
    return HABIT_ICONS[icon] || HABIT_ICONS.workout;
}

function getDateStr(date) {
    const d = new Date(date);
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

function getTodayStr() {
    return getDateStr(new Date());
}

function getMondayOfWeek(offset) {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setDate(monday.getDate() + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function getWeekDates(offset) {
    const monday = getMondayOfWeek(offset);
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(getDateStr(d));
    }
    return dates;
}

// ============================================
// HUB SCREEN
// ============================================
function renderHub() {
    // Hub is now just static cards - no dynamic content needed
}

// ============================================
// GOAL TRACKER - Render Home
// ============================================
function renderHome() {
    $('#home-subtitle').textContent = MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)];

    if (goals.length === 0) {
        goalsGrid.innerHTML = `
            <div class="empty-home">
                <div class="empty-home-icon">\uD83C\uDFAF</div>
                <p class="empty-home-text">No goals yet</p>
                <p class="empty-home-hint">Tap + to create your first goal</p>
            </div>
        `;
        return;
    }

    const sorted = [...goals].sort((a, b) => {
        const aComplete = a.achieved >= a.target;
        const bComplete = b.achieved >= b.target;
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        return getProgress(b) - getProgress(a);
    });

    goalsGrid.innerHTML = sorted.map(goal => {
        const progress = getProgress(goal);
        const isComplete = goal.achieved >= goal.target;
        return `
            <div class="goal-card ${isComplete ? 'completed-card' : ''}" data-id="${goal.id}" style="--goal-color:${goal.color}">
                <span class="goal-card-icon">${resolveGoalIcon(goal.icon)}</span>
                <div class="goal-card-name">${escapeHtml(goal.name)}</div>
                <div class="goal-card-percent" style="color:${goal.color}">${Math.round(progress)}%</div>
                <div class="goal-card-progress-bar">
                    <div class="goal-card-progress-fill" style="width:${progress}%;background:${goal.color}"></div>
                </div>
                <div class="goal-card-info">
                    ${goal.type === 'financial'
                        ? `PKR ${formatNumber(goal.achieved)} / ${formatNumber(goal.target)}`
                        : `${goal.achieved} / ${goal.target}`
                    }
                </div>
                ${isComplete ? '<div class="completed-badge">\u2713 Done</div>' : ''}
                ${(() => {
                    const dl = getDeadlineInfo(goal);
                    if (!dl || isComplete) return '';
                    return '<div class="goal-card-deadline ' + dl.class + '">' + dl.text + '</div>';
                })()}
            </div>
        `;
    }).join('');

    $$('.goal-card').forEach(card => {
        card.addEventListener('click', () => openGoalDetail(card.dataset.id));
    });
}

// ============================================
// GOAL TRACKER - Detail
// ============================================
function openGoalDetail(id) {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    currentGoalId = id;
    showScreen(detailScreen);

    $('#detail-icon').textContent = resolveGoalIcon(goal.icon);
    $('#detail-title').textContent = goal.name;

    const deadlineEl = $('#detail-deadline');
    const dlInfo = getDeadlineInfo(goal);
    if (dlInfo) {
        deadlineEl.classList.remove('hidden', 'deadline-urgent', 'deadline-overdue', 'deadline-done');
        if (dlInfo.class) deadlineEl.classList.add(dlInfo.class);
        deadlineEl.textContent = dlInfo.dateStr + ' \u2022 ' + dlInfo.text;
    } else {
        deadlineEl.classList.add('hidden');
    }

    const progress = getProgress(goal);
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (progress / 100) * circumference;
    const circle = $('#progress-circle');
    circle.style.stroke = goal.color;
    circle.style.transition = 'none';
    circle.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
        circle.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.25, 0.1, 0.25, 1)';
        circle.style.strokeDashoffset = offset;
    });

    $('#progress-text').textContent = Math.round(progress) + '%';

    if (goal.type === 'financial') {
        $('#stat-achieved').textContent = 'PKR ' + formatNumber(goal.achieved);
        $('#stat-remaining').textContent = 'PKR ' + formatNumber(Math.max(0, goal.target - goal.achieved));
    } else {
        $('#stat-achieved').textContent = goal.achieved;
        $('#stat-remaining').textContent = Math.max(0, goal.target - goal.achieved);
    }
    $('#stat-entries').textContent = goal.entries ? goal.entries.length : 0;

    const entryInput = $('#entry-amount');
    entryInput.placeholder = goal.type === 'financial' ? 'Enter amount (PKR)' : 'Enter count';

    renderEntries(goal);
}

// ============================================
// GOAL TRACKER - Entries
// ============================================
function renderEntries(goal) {
    const list = $('#entries-list');
    const empty = $('#empty-entries');
    const entries = goal.entries || [];

    if (entries.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    list.classList.remove('hidden');
    empty.classList.add('hidden');

    const reversed = [...entries].reverse();
    list.innerHTML = reversed.map((entry) => `
        <div class="entry-item">
            <div class="entry-dot" style="background:${goal.color}">+</div>
            <div class="entry-details">
                <div class="entry-value">
                    ${goal.type === 'financial'
                        ? '+PKR ' + formatNumber(entry.amount)
                        : '+' + entry.amount + (entry.amount === 1 ? ' unit' : ' units')
                    }
                </div>
                ${entry.note ? `<div class="entry-note">${escapeHtml(entry.note)}</div>` : ''}
            </div>
            <div class="entry-meta">
                <div class="entry-date">${formatDate(entry.date)}</div>
            </div>
            <button class="entry-delete-btn" data-entry-id="${entry.id}" title="Delete">\u2715</button>
        </div>
    `).join('');

    list.querySelectorAll('.entry-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteEntry(goal.id, btn.dataset.entryId);
        });
    });
}

function addEntry() {
    const goal = goals.find(g => g.id === currentGoalId);
    if (!goal) return;

    const input = $('#entry-amount');
    const noteInput = $('#entry-note');
    const amount = parseInt(input.value, 10);

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount');
        input.focus();
        return;
    }

    if (!goal.entries) goal.entries = [];

    goal.achieved += amount;
    goal.entries.push({
        id: generateId(),
        amount: amount,
        note: noteInput.value.trim(),
        date: new Date().toISOString()
    });
    saveGoals();

    input.value = '';
    noteInput.value = '';
    openGoalDetail(currentGoalId);

    const progress = getProgress(goal);
    if (goal.achieved >= goal.target) {
        showToast('\uD83C\uDF89 Goal completed! Amazing work!');
        triggerCelebration('big');
    } else if (progress >= 75 && progress - (amount / goal.target * 100) < 75) {
        showToast('\uD83D\uDD25 75% done! Almost there!');
        triggerCelebration('medium');
    } else if (progress >= 50 && progress - (amount / goal.target * 100) < 50) {
        showToast('\uD83D\uDCAA Halfway there! Keep going!');
        triggerCelebration('medium');
    } else if (progress >= 25 && progress - (amount / goal.target * 100) < 25) {
        showToast('\u2B50 25% milestone reached!');
        triggerCelebration('small');
    } else {
        showToast('\u2713 Entry added');
        triggerCelebration('tiny');
    }
}

function deleteEntry(goalId, entryId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal || !goal.entries) return;

    const entry = goal.entries.find(e => e.id === entryId);
    if (!entry) return;

    goal.achieved = Math.max(0, goal.achieved - entry.amount);
    goal.entries = goal.entries.filter(e => e.id !== entryId);
    saveGoals();
    openGoalDetail(goalId);
    showToast('Entry removed');
}

// ============================================
// GOAL TRACKER - Create/Edit Form
// ============================================
function openCreateForm(editId) {
    editingGoalId = editId || null;
    showScreen(createScreen);

    if (editId) {
        const goal = goals.find(g => g.id === editId);
        if (!goal) return;
        $('#create-title').textContent = 'Edit Goal';
        $('#goal-name').value = goal.name;
        $('#goal-target').value = goal.target;
        $('#goal-deadline').value = goal.deadline || '';
        selectedType = goal.type;
        selectedIcon = goal.icon;
        selectedColor = goal.color;
        $('#save-goal-btn').textContent = 'Save Changes';
        $('#delete-goal-btn').classList.remove('hidden');
    } else {
        $('#create-title').textContent = 'New Goal';
        $('#goal-name').value = '';
        $('#goal-target').value = '';
        $('#goal-deadline').value = '';
        selectedType = 'financial';
        selectedIcon = 'star';
        selectedColor = '#007AFF';
        $('#save-goal-btn').textContent = 'Create Goal';
        $('#delete-goal-btn').classList.add('hidden');
    }

    updateTypeUI();
    updateIconUI();
    updateColorUI();
    updateTargetLabel();
}

function updateTypeUI() {
    $$('.type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === selectedType));
}
function updateIconUI() {
    const isCustom = selectedIcon.startsWith('custom:');
    $$('#icon-picker .icon-btn').forEach(btn => {
        if (btn.dataset.icon === 'custom') {
            btn.classList.toggle('active', isCustom);
            if (isCustom) {
                btn.textContent = selectedIcon.slice(7);
                btn.classList.add('has-emoji');
            } else {
                btn.textContent = '+';
                btn.classList.remove('has-emoji');
            }
        } else {
            btn.classList.toggle('active', btn.dataset.icon === selectedIcon);
        }
    });
    const emojiInput = $('#goal-custom-emoji');
    emojiInput.classList.toggle('visible', isCustom);
    if (isCustom) emojiInput.value = selectedIcon.slice(7);
}
function updateColorUI() {
    $$('#color-picker .color-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.color === selectedColor));
}
function updateTargetLabel() {
    const label = $('#target-label');
    const input = $('#goal-target');
    if (selectedType === 'financial') {
        label.textContent = 'Target Amount (PKR)';
        input.placeholder = 'e.g., 4000000';
    } else {
        label.textContent = 'Target Count';
        input.placeholder = 'e.g., 6';
    }
}

function saveGoal(e) {
    e.preventDefault();
    const name = $('#goal-name').value.trim();
    const target = parseInt($('#goal-target').value, 10);
    const deadline = $('#goal-deadline').value || null;

    if (!name) { showToast('Please enter a goal name'); return; }
    if (!target || target <= 0) { showToast('Please enter a valid target'); return; }

    if (editingGoalId) {
        const goal = goals.find(g => g.id === editingGoalId);
        if (goal) {
            goal.name = name;
            goal.target = target;
            goal.deadline = deadline;
            goal.type = selectedType;
            goal.icon = selectedIcon;
            goal.color = selectedColor;
            saveGoals();
            showToast('Goal updated');
            openGoalDetail(editingGoalId);
        }
    } else {
        goals.push({
            id: generateId(), name, target, deadline,
            achieved: 0, type: selectedType, icon: selectedIcon,
            color: selectedColor, entries: [], createdAt: new Date().toISOString()
        });
        saveGoals();
        showToast('Goal created!');
        triggerCelebration('small');
        showScreen(homeScreen);
        renderHome();
    }
    editingGoalId = null;
}

function deleteGoal() {
    if (!editingGoalId) return;
    goals = goals.filter(g => g.id !== editingGoalId);
    saveGoals();
    editingGoalId = null;
    showToast('Goal deleted');
    showScreen(homeScreen);
    renderHome();
}

// ============================================
// HABIT TRACKER - Render
// ============================================
function renderHabitsScreen() {
    renderTodayHabits();
    renderWeekGrid();
}

function renderTodayHabits() {
    const today = getTodayStr();
    const todayDate = new Date();
    const dateLabel = todayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    $('#today-date-label').textContent = dateLabel;

    const list = $('#today-habits-list');
    const empty = $('#habits-empty');

    if (habits.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    const todayChecks = habitChecks[today] || {};

    list.innerHTML = habits.map(habit => {
        const checked = todayChecks[habit.id] || false;
        const streak = getStreak(habit.id);
        const icon = resolveHabitIcon(habit.icon);

        return `
            <div class="today-habit-item ${checked ? 'checked' : ''}" data-habit-id="${habit.id}" data-date="${today}">
                <div class="today-habit-check" style="--habit-color: ${habit.color}">
                    <div class="check-box ${checked ? 'checked' : ''}">
                        ${checked ? '\u2713' : ''}
                    </div>
                </div>
                <div class="today-habit-info">
                    <span class="today-habit-icon">${icon}</span>
                    <span class="today-habit-name">${escapeHtml(habit.name)}</span>
                </div>
                <div class="today-habit-streak ${streak > 0 ? 'active' : ''}">
                    ${streak > 0 ? '\uD83D\uDD25 ' + streak + 'd' : ''}
                </div>
                <button class="habit-edit-btn" data-habit-id="${habit.id}" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    // Checkbox toggle handlers
    list.querySelectorAll('.today-habit-item').forEach(item => {
        const checkBox = item.querySelector('.today-habit-check');
        checkBox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHabitCheck(item.dataset.habitId, item.dataset.date);
        });
    });

    // Edit button handlers
    list.querySelectorAll('.habit-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openHabitForm(btn.dataset.habitId);
        });
    });
}

function renderWeekGrid() {
    const grid = $('#habit-grid');
    const weekDates = getWeekDates(currentWeekOffset);

    // Week label
    const startDate = new Date(weekDates[0] + 'T00:00:00');
    const endDate = new Date(weekDates[6] + 'T00:00:00');
    const fmt = { month: 'short', day: 'numeric' };
    $('#week-label').textContent = startDate.toLocaleDateString('en-US', fmt) + ' - ' + endDate.toLocaleDateString('en-US', fmt);

    if (habits.length === 0) {
        grid.innerHTML = '<div class="habit-grid-empty">Add habits to see the weekly grid</div>';
        return;
    }

    const todayStr = getTodayStr();

    // Build grid HTML
    let html = '<div class="habit-grid-header">';
    html += '<div class="habit-grid-label"></div>';
    weekDates.forEach((d, i) => {
        const isToday = d === todayStr;
        html += `<div class="habit-grid-day ${isToday ? 'today' : ''}">${DAY_LETTERS[i]}</div>`;
    });
    html += '<div class="habit-grid-pct">%</div>';
    html += '</div>';

    habits.forEach(habit => {
        const icon = resolveHabitIcon(habit.icon);
        let checkedCount = 0;

        html += '<div class="habit-grid-row">';
        html += `<div class="habit-grid-label" title="${escapeHtml(habit.name)}">${icon}</div>`;

        weekDates.forEach(date => {
            const checked = habitChecks[date] && habitChecks[date][habit.id];
            if (checked) checkedCount++;
            const isToday = date === todayStr;

            html += `<div class="habit-grid-cell ${isToday ? 'today' : ''}" data-habit-id="${habit.id}" data-date="${date}">
                <div class="grid-check ${checked ? 'checked' : ''}" style="--habit-color: ${habit.color}">
                    ${checked ? '\u2713' : ''}
                </div>
            </div>`;
        });

        const pct = Math.round((checkedCount / 7) * 100);
        html += `<div class="habit-grid-pct-value" style="color: ${pct >= 70 ? '#34C759' : pct >= 40 ? '#FF9500' : 'var(--text-tertiary)'}">${pct}%</div>`;
        html += '</div>';
    });

    grid.innerHTML = html;

    // Click handlers on grid cells
    grid.querySelectorAll('.habit-grid-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            toggleHabitCheck(cell.dataset.habitId, cell.dataset.date);
        });
    });
}

function toggleHabitCheck(habitId, dateStr) {
    if (!habitChecks[dateStr]) habitChecks[dateStr] = {};
    habitChecks[dateStr][habitId] = !habitChecks[dateStr][habitId];
    saveData();
    renderHabitsScreen();
    renderHub();
}

function getStreak(habitId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streak = 0;
    let d = new Date(today);

    // Check today first
    const todayStr = getDateStr(d);
    const todayChecked = habitChecks[todayStr] && habitChecks[todayStr][habitId];

    if (!todayChecked) {
        // Check if yesterday was checked (streak still counts if today isn't done yet)
        d.setDate(d.getDate() - 1);
    }

    while (true) {
        const ds = getDateStr(d);
        if (habitChecks[ds] && habitChecks[ds][habitId]) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
        if (streak > 365) break; // safety
    }

    return streak;
}

// ============================================
// HABIT TRACKER - CRUD
// ============================================
function openHabitForm(editId) {
    editingHabitId = editId || null;
    showScreen(habitFormScreen);

    if (editId) {
        const habit = habits.find(h => h.id === editId);
        if (!habit) return;
        $('#habit-form-title').textContent = 'Edit Habit';
        $('#habit-name').value = habit.name;
        selectedHabitIcon = habit.icon;
        selectedHabitColor = habit.color;
        $('#save-habit-btn').textContent = 'Save Changes';
        $('#delete-habit-btn').classList.remove('hidden');
    } else {
        $('#habit-form-title').textContent = 'New Habit';
        $('#habit-name').value = '';
        selectedHabitIcon = 'workout';
        selectedHabitColor = '#34C759';
        $('#save-habit-btn').textContent = 'Create Habit';
        $('#delete-habit-btn').classList.add('hidden');
    }

    updateHabitIconUI();
    updateHabitColorUI();
}

function updateHabitIconUI() {
    const isCustom = selectedHabitIcon.startsWith('custom:');
    $$('#habit-icon-picker .icon-btn').forEach(btn => {
        if (btn.dataset.icon === 'custom') {
            btn.classList.toggle('active', isCustom);
            if (isCustom) {
                btn.textContent = selectedHabitIcon.slice(7);
                btn.classList.add('has-emoji');
            } else {
                btn.textContent = '+';
                btn.classList.remove('has-emoji');
            }
        } else {
            btn.classList.toggle('active', btn.dataset.icon === selectedHabitIcon);
        }
    });
    const emojiInput = $('#habit-custom-emoji');
    emojiInput.classList.toggle('visible', isCustom);
    if (isCustom) emojiInput.value = selectedHabitIcon.slice(7);
}

function updateHabitColorUI() {
    $$('#habit-color-picker .color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === selectedHabitColor);
    });
}

function saveHabit(e) {
    e.preventDefault();
    const name = $('#habit-name').value.trim();
    if (!name) { showToast('Please enter a habit name'); return; }

    if (editingHabitId) {
        const habit = habits.find(h => h.id === editingHabitId);
        if (habit) {
            habit.name = name;
            habit.icon = selectedHabitIcon;
            habit.color = selectedHabitColor;
            saveData();
            showToast('Habit updated');
        }
    } else {
        habits.push({
            id: generateId(),
            name,
            icon: selectedHabitIcon,
            color: selectedHabitColor,
            createdAt: new Date().toISOString()
        });
        saveData();
        showToast('Habit created!');
        triggerCelebration('small');
    }

    editingHabitId = null;
    showScreen(habitsScreen);
    renderHabitsScreen();
    renderHub();
}

function deleteHabit() {
    if (!editingHabitId) return;
    // Remove habit checks for this habit
    Object.keys(habitChecks).forEach(date => {
        delete habitChecks[date][editingHabitId];
    });
    habits = habits.filter(h => h.id !== editingHabitId);
    saveData();
    editingHabitId = null;
    showToast('Habit deleted');
    showScreen(habitsScreen);
    renderHabitsScreen();
    renderHub();
}

function resetWeekChecks() {
    const weekDates = getWeekDates(currentWeekOffset);
    weekDates.forEach(date => {
        if (habitChecks[date]) {
            delete habitChecks[date];
        }
    });
    saveData();
    renderHabitsScreen();
    renderHub();
    showToast('Week reset');
}

// ============================================
// REPORTS
// ============================================
function renderReports() {
    renderBarChart();
    renderLineChart();
    renderHeatMap();
}

function getCompletionForDate(dateStr) {
    if (habits.length === 0) return 0;
    const checks = habitChecks[dateStr] || {};
    const done = habits.filter(h => checks[h.id]).length;
    return done / habits.length;
}

function renderBarChart() {
    const container = $('#report-bar-chart');
    let dates, labels;

    if (reportPeriod === 'weekly') {
        dates = getWeekDates(0);
        labels = DAY_NAMES;
    } else {
        // Monthly - last 4 weeks
        dates = [];
        labels = [];
        for (let w = 3; w >= 0; w--) {
            const weekDates = getWeekDates(-w);
            const startD = new Date(weekDates[0] + 'T00:00:00');
            labels.push(startD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            // Average completion for the week
            let sum = 0;
            weekDates.forEach(d => sum += getCompletionForDate(d));
            dates.push(sum / 7);
        }
    }

    let html = '<div class="bar-chart-bars">';
    if (reportPeriod === 'weekly') {
        dates.forEach((date, i) => {
            const pct = Math.round(getCompletionForDate(date) * 100);
            const color = pct >= 70 ? '#34C759' : pct >= 40 ? '#FF9500' : pct > 0 ? '#007AFF' : 'var(--bg-tertiary)';
            html += `<div class="bar-col">
                <div class="bar-value">${pct}%</div>
                <div class="bar-track"><div class="bar-fill" style="height:${Math.max(pct, 2)}%;background:${color}"></div></div>
                <div class="bar-label">${labels[i]}</div>
            </div>`;
        });
    } else {
        dates.forEach((avgCompletion, i) => {
            const pct = Math.round(avgCompletion * 100);
            const color = pct >= 70 ? '#34C759' : pct >= 40 ? '#FF9500' : pct > 0 ? '#007AFF' : 'var(--bg-tertiary)';
            html += `<div class="bar-col">
                <div class="bar-value">${pct}%</div>
                <div class="bar-track"><div class="bar-fill" style="height:${Math.max(pct, 2)}%;background:${color}"></div></div>
                <div class="bar-label">${labels[i]}</div>
            </div>`;
        });
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderLineChart() {
    const canvas = $('#report-line-chart');
    const lineCtx = canvas.getContext('2d');

    // Set canvas size
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 300;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '150px';

    lineCtx.clearRect(0, 0, canvas.width, canvas.height);

    let dataPoints, xLabels;

    if (reportPeriod === 'weekly') {
        const dates = getWeekDates(0);
        dataPoints = dates.map(d => getCompletionForDate(d));
        xLabels = DAY_NAMES;
    } else {
        // Monthly - 28 days
        dataPoints = [];
        xLabels = [];
        for (let i = 27; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dataPoints.push(getCompletionForDate(getDateStr(d)));
            if (i % 7 === 0) {
                xLabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            }
        }
    }

    const padding = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartW = canvas.width - padding.left - padding.right;
    const chartH = canvas.height - padding.top - padding.bottom;

    // Determine if dark mode
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#98989d' : '#86868b';
    const lineColor = '#00C7BE';

    // Draw grid lines
    lineCtx.strokeStyle = gridColor;
    lineCtx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartH / 5) * i;
        lineCtx.beginPath();
        lineCtx.moveTo(padding.left, y);
        lineCtx.lineTo(canvas.width - padding.right, y);
        lineCtx.stroke();

        // Y-axis labels
        lineCtx.fillStyle = textColor;
        lineCtx.font = '20px -apple-system, sans-serif';
        lineCtx.textAlign = 'right';
        const val = (1 - i / 5).toFixed(1);
        lineCtx.fillText(val, padding.left - 8, y + 6);
    }

    if (dataPoints.length < 2) return;

    // Draw smooth line
    const points = dataPoints.map((val, i) => ({
        x: padding.left + (i / (dataPoints.length - 1)) * chartW,
        y: padding.top + (1 - val) * chartH
    }));

    // Fill area under curve
    lineCtx.beginPath();
    lineCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        lineCtx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        lineCtx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
    }
    lineCtx.lineTo(points[points.length - 1].x, padding.top + chartH);
    lineCtx.lineTo(points[0].x, padding.top + chartH);
    lineCtx.closePath();
    const gradient = lineCtx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, isDark ? 'rgba(0, 199, 190, 0.3)' : 'rgba(0, 199, 190, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 199, 190, 0)');
    lineCtx.fillStyle = gradient;
    lineCtx.fill();

    // Draw line
    lineCtx.beginPath();
    lineCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        lineCtx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        lineCtx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
    }
    lineCtx.strokeStyle = lineColor;
    lineCtx.lineWidth = 3;
    lineCtx.stroke();

    // Draw dots
    points.forEach(p => {
        lineCtx.beginPath();
        lineCtx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        lineCtx.fillStyle = lineColor;
        lineCtx.fill();
        lineCtx.strokeStyle = isDark ? '#1c1c1e' : '#ffffff';
        lineCtx.lineWidth = 2;
        lineCtx.stroke();
    });

    // X-axis labels
    lineCtx.fillStyle = textColor;
    lineCtx.font = '18px -apple-system, sans-serif';
    lineCtx.textAlign = 'center';
    if (reportPeriod === 'weekly') {
        points.forEach((p, i) => {
            lineCtx.fillText(xLabels[i], p.x, canvas.height - 10);
        });
    } else {
        xLabels.forEach((label, i) => {
            const x = padding.left + (i * 7 / (dataPoints.length - 1)) * chartW;
            lineCtx.fillText(label, x, canvas.height - 10);
        });
    }
}

function renderHeatMap() {
    const container = $('#report-heat-map');
    let startDate, numDays;

    if (reportPeriod === 'weekly') {
        const weekDates = getWeekDates(0);
        startDate = new Date(weekDates[0] + 'T00:00:00');
        numDays = 7;
    } else {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 27);
        startDate.setHours(0, 0, 0, 0);
        numDays = 28;
    }

    let html = '<div class="heat-map-grid">';
    const todayStr = getTodayStr();

    for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const ds = getDateStr(d);
        const completion = getCompletionForDate(ds);
        const isToday = ds === todayStr;

        // Color intensity
        let colorClass;
        if (completion === 0) colorClass = 'heat-0';
        else if (completion <= 0.25) colorClass = 'heat-1';
        else if (completion <= 0.5) colorClass = 'heat-2';
        else if (completion <= 0.75) colorClass = 'heat-3';
        else colorClass = 'heat-4';

        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
        const dateNum = d.getDate();

        html += `<div class="heat-cell ${colorClass} ${isToday ? 'heat-today' : ''}" title="${ds}: ${Math.round(completion * 100)}%">
            <span class="heat-date">${dateNum}</span>
        </div>`;
    }

    html += '</div>';

    // Legend
    html += '<div class="heat-legend">';
    html += '<span class="heat-legend-label">Less</span>';
    html += '<div class="heat-cell-small heat-0"></div>';
    html += '<div class="heat-cell-small heat-1"></div>';
    html += '<div class="heat-cell-small heat-2"></div>';
    html += '<div class="heat-cell-small heat-3"></div>';
    html += '<div class="heat-cell-small heat-4"></div>';
    html += '<span class="heat-legend-label">More</span>';
    html += '</div>';

    container.innerHTML = html;
}

// ============================================
// TOAST
// ============================================
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================
// CONFETTI
// ============================================
let confettiParticles = [];
let confettiAnimating = false;

function triggerCelebration(size) {
    const counts = { tiny: 12, small: 25, medium: 45, big: 80 };
    const count = counts[size] || 20;

    resizeCanvas();
    confettiParticles = [];

    for (let i = 0; i < count; i++) {
        confettiParticles.push({
            x: Math.random() * confettiCanvas.width,
            y: -10 - Math.random() * 100,
            w: 4 + Math.random() * 4,
            h: 6 + Math.random() * 6,
            color: randomConfettiColor(),
            vx: (Math.random() - 0.5) * 3,
            vy: 2 + Math.random() * 3,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
            decay: 0.005 + Math.random() * 0.01
        });
    }

    if (!confettiAnimating) {
        confettiAnimating = true;
        animateConfetti();
    }
}

function randomConfettiColor() {
    const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#5856D6', '#00C7BE', '#FFD60A'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function resizeCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}

function animateConfetti() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParticles = confettiParticles.filter(p => p.opacity > 0);

    if (confettiParticles.length === 0) {
        confettiAnimating = false;
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        return;
    }

    confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rotation += p.rotationSpeed;
        p.opacity -= p.decay;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    });

    requestAnimationFrame(animateConfetti);
}

// ============================================
// EVENT LISTENERS
// ============================================
function initUI() {
    // === HUB (event delegation for robust click handling) ===
    $('#hub-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.hub-card');
        if (!card) return;
        const target = card.dataset.target;
        if (target === 'goals') {
            showScreen(homeScreen);
            renderHome();
        } else if (target === 'habits') {
            showScreen(habitsScreen);
            renderHabitsScreen();
        }
    });

    // === GOAL TRACKER ===
    $('#add-goal-btn').addEventListener('click', () => openCreateForm());

    $('#goals-home-back-btn').addEventListener('click', () => {
        showScreen(hubScreen);
        renderHub();
    });

    $('#create-back-btn').addEventListener('click', () => {
        if (editingGoalId) {
            openGoalDetail(editingGoalId);
            editingGoalId = null;
        } else {
            showScreen(homeScreen);
            renderHome();
        }
    });

    $('#detail-back-btn').addEventListener('click', () => {
        currentGoalId = null;
        showScreen(homeScreen);
        renderHome();
    });

    $('#edit-goal-btn').addEventListener('click', () => {
        if (currentGoalId) openCreateForm(currentGoalId);
    });

    $$('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedType = btn.dataset.type;
            updateTypeUI();
            updateTargetLabel();
        });
    });

    $$('#icon-picker .icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.icon === 'custom') {
                const emojiInput = $('#goal-custom-emoji');
                if (!selectedIcon.startsWith('custom:')) {
                    selectedIcon = 'custom:';
                }
                updateIconUI();
                emojiInput.focus();
            } else {
                selectedIcon = btn.dataset.icon;
                updateIconUI();
            }
        });
    });

    $('#goal-custom-emoji').addEventListener('input', (e) => {
        const val = e.target.value;
        if (val) {
            // Get the first emoji/character (handles multi-codepoint emoji)
            const emoji = [...val][0];
            selectedIcon = 'custom:' + emoji;
            e.target.value = emoji;
            const customBtn = $('#goal-custom-icon-btn');
            customBtn.textContent = emoji;
            customBtn.classList.add('has-emoji');
        }
    });

    $$('#color-picker .color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedColor = btn.dataset.color;
            updateColorUI();
        });
    });

    goalForm.addEventListener('submit', saveGoal);

    $('#delete-goal-btn').addEventListener('click', () => {
        if (confirm('Delete this goal and all its entries?')) deleteGoal();
    });

    $('#add-entry-btn').addEventListener('click', addEntry);
    $('#entry-amount').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addEntry(); }
    });

    // === HABIT TRACKER ===
    $('#habits-back-btn').addEventListener('click', () => {
        showScreen(hubScreen);
        renderHub();
    });

    $('#add-habit-btn').addEventListener('click', () => openHabitForm());

    $('#habit-form-back-btn').addEventListener('click', () => {
        editingHabitId = null;
        showScreen(habitsScreen);
        renderHabitsScreen();
    });

    $$('#habit-icon-picker .icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.icon === 'custom') {
                const emojiInput = $('#habit-custom-emoji');
                if (!selectedHabitIcon.startsWith('custom:')) {
                    selectedHabitIcon = 'custom:';
                }
                updateHabitIconUI();
                emojiInput.focus();
            } else {
                selectedHabitIcon = btn.dataset.icon;
                updateHabitIconUI();
            }
        });
    });

    $('#habit-custom-emoji').addEventListener('input', (e) => {
        const val = e.target.value;
        if (val) {
            const emoji = [...val][0];
            selectedHabitIcon = 'custom:' + emoji;
            e.target.value = emoji;
            const customBtn = $('#habit-custom-icon-btn');
            customBtn.textContent = emoji;
            customBtn.classList.add('has-emoji');
        }
    });

    $$('#habit-color-picker .color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedHabitColor = btn.dataset.color;
            updateHabitColorUI();
        });
    });

    $('#habit-form').addEventListener('submit', saveHabit);

    $('#delete-habit-btn').addEventListener('click', () => {
        if (confirm('Delete this habit and all its check-in data?')) deleteHabit();
    });

    // Week navigation
    $('#week-prev-btn').addEventListener('click', () => {
        currentWeekOffset--;
        renderWeekGrid();
    });
    $('#week-next-btn').addEventListener('click', () => {
        if (currentWeekOffset < 0) {
            currentWeekOffset++;
            renderWeekGrid();
        }
    });

    // Reset tracker
    $('#reset-tracker-btn').addEventListener('click', () => {
        if (confirm('Reset all check-ins for this week?')) resetWeekChecks();
    });

    // === REPORTS ===
    $('#open-reports-btn').addEventListener('click', () => {
        showScreen(habitReportsScreen);
        renderReports();
    });

    $('#reports-back-btn').addEventListener('click', () => {
        showScreen(habitsScreen);
        renderHabitsScreen();
    });

    $$('.report-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.report-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            reportPeriod = btn.dataset.period;
            renderReports();
        });
    });

    // === AUTH ===
    $('#sign-out-btn').addEventListener('click', handleSignOut);
    $('#auth-form').addEventListener('submit', handleAuthSubmit);
    $('#auth-toggle-btn').addEventListener('click', toggleAuthMode);

    // Canvas resize
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

// ============================================
// INIT
// ============================================
function init() {
    initUI();

    const loadingTimeout = setTimeout(() => {
        console.warn('Firebase Auth timeout - showing login screen');
        loadingScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
    }, 4000);

    onAuthStateChanged(auth, async (user) => {
        clearTimeout(loadingTimeout);
        loadingScreen.classList.add('hidden');

        if (user) {
            currentUser = user;
            authScreen.classList.add('hidden');
            app.classList.remove('hidden');

            const emailEl = $('#user-email');
            emailEl.textContent = user.email || 'Signed In';

            await migrateLocalDataToCloud();
            startRealtimeSync();

            loadLocalData();
            renderHub();
            renderHome();
        } else {
            currentUser = null;
            authScreen.classList.remove('hidden');
            app.classList.add('hidden');
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
