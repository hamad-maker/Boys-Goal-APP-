// ============================================
// GOALS TRACKER - Application Logic
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

// --- State ---
let goals = [];
let currentGoalId = null;
let editingGoalId = null;
let selectedType = 'financial';
let selectedIcon = 'star';
let selectedColor = '#007AFF';
let currentUser = null;
let unsubscribeSnapshot = null;
let isSyncingFromCloud = false;

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

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const loadingScreen = $('#loading-screen');
const authScreen = $('#auth-screen');
const app = $('#app');
const homeScreen = $('#home-screen');
const createScreen = $('#create-screen');
const detailScreen = $('#detail-screen');
const goalsGrid = $('#goals-grid');
const goalForm = $('#goal-form');
const fab = $('#add-goal-btn');
const toast = $('#toast');
const confettiCanvas = $('#confetti-canvas');
const ctx = confettiCanvas.getContext('2d');
const syncStatus = $('#sync-status');
const syncIcon = $('#sync-icon');
const syncText = $('#sync-text');

// --- Sync Status UI ---
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

// --- Firebase Auth ---
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
        currentUser = null;
        app.classList.add('hidden');
        authScreen.classList.remove('hidden');
    });
}

// --- Firestore Sync ---
function getUserDocRef() {
    if (!currentUser) return null;
    return doc(db, 'users', currentUser.uid);
}

function saveGoals() {
    // Save to localStorage as backup
    localStorage.setItem('goals_tracker_data', JSON.stringify(goals));

    // Save to Firestore
    if (currentUser) {
        const ref = getUserDocRef();
        if (!ref) return;
        showSyncStatus('saving', 'Saving...');
        setDoc(ref, {
            goals: JSON.parse(JSON.stringify(goals)),
            updatedAt: new Date().toISOString()
        }).then(() => {
            showSyncStatus('saved', 'Saved to cloud');
        }).catch((err) => {
            console.error('Save error:', err);
            showSyncStatus('error', 'Save failed');
        });
    }
}

function loadGoals() {
    try {
        const data = localStorage.getItem('goals_tracker_data');
        goals = data ? JSON.parse(data) : [];
    } catch {
        goals = [];
    }
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
            if (data.goals) {
                isSyncingFromCloud = true;
                goals = data.goals;
                // Also update localStorage backup
                localStorage.setItem('goals_tracker_data', JSON.stringify(goals));
                renderHome();
                // If viewing a goal detail, refresh it
                if (currentGoalId && detailScreen.classList.contains('active')) {
                    openGoalDetail(currentGoalId);
                }
                isSyncingFromCloud = false;
            }
        }
    }, (error) => {
        console.error('Realtime sync error:', error);
        showSyncStatus('offline', 'Offline mode');
    });
}

async function migrateLocalDataToCloud() {
    // If user had local data before signing in, push it to the cloud
    try {
        const localData = localStorage.getItem('goals_tracker_data');
        if (!localData) return;
        const localGoals = JSON.parse(localData);
        if (!localGoals || localGoals.length === 0) return;

        const ref = getUserDocRef();
        if (!ref) return;

        // Check if cloud already has data
        // We do this by checking the snapshot we'll get
        // For first-time users, we push local data up
        await setDoc(ref, {
            goals: localGoals,
            updatedAt: new Date().toISOString()
        }, { merge: false });
    } catch (err) {
        console.error('Migration error:', err);
    }
}

// --- Navigation ---
function showScreen(screen) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    fab.classList.toggle('hidden', screen !== homeScreen);
}

// --- Formatting ---
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

    if (isComplete) {
        return { text: 'Completed', class: 'deadline-done', days: days, dateStr: dateStr };
    }
    if (days < 0) {
        return { text: Math.abs(days) + 'd overdue', class: 'deadline-overdue', days: days, dateStr: dateStr };
    }
    if (days === 0) {
        return { text: 'Due today', class: 'deadline-urgent', days: days, dateStr: dateStr };
    }
    if (days <= 7) {
        return { text: days + 'd left', class: 'deadline-urgent', days: days, dateStr: dateStr };
    }
    return { text: days + 'd left', class: '', days: days, dateStr: dateStr };
}

function getProgress(goal) {
    if (goal.target <= 0) return 0;
    return Math.min((goal.achieved / goal.target) * 100, 100);
}

// --- Render Home ---
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

    // Sort: incomplete first (by progress desc), then completed
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
            <div class="goal-card ${isComplete ? 'completed-card' : ''}" data-id="${goal.id}">
                <span class="goal-card-icon">${ICONS[goal.icon] || ICONS.star}</span>
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

    // Attach click handlers
    $$('.goal-card').forEach(card => {
        card.addEventListener('click', () => {
            openGoalDetail(card.dataset.id);
        });
    });
}

// --- Open Goal Detail ---
function openGoalDetail(id) {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    currentGoalId = id;
    showScreen(detailScreen);

    // Set hero
    $('#detail-icon').textContent = ICONS[goal.icon] || ICONS.star;
    $('#detail-title').textContent = goal.name;

    // Deadline
    const deadlineEl = $('#detail-deadline');
    const dlInfo = getDeadlineInfo(goal);
    if (dlInfo) {
        deadlineEl.classList.remove('hidden', 'deadline-urgent', 'deadline-overdue', 'deadline-done');
        if (dlInfo.class) deadlineEl.classList.add(dlInfo.class);
        deadlineEl.textContent = dlInfo.dateStr + ' \u2022 ' + dlInfo.text;
    } else {
        deadlineEl.classList.add('hidden');
    }

    // Progress ring
    const progress = getProgress(goal);
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference - (progress / 100) * circumference;
    const circle = $('#progress-circle');
    circle.style.stroke = goal.color;
    // Reset and animate
    circle.style.transition = 'none';
    circle.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
        circle.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.25, 0.1, 0.25, 1)';
        circle.style.strokeDashoffset = offset;
    });

    $('#progress-text').textContent = Math.round(progress) + '%';

    // Stats
    if (goal.type === 'financial') {
        $('#stat-achieved').textContent = 'PKR ' + formatNumber(goal.achieved);
        $('#stat-remaining').textContent = 'PKR ' + formatNumber(Math.max(0, goal.target - goal.achieved));
    } else {
        $('#stat-achieved').textContent = goal.achieved;
        $('#stat-remaining').textContent = Math.max(0, goal.target - goal.achieved);
    }
    $('#stat-entries').textContent = goal.entries ? goal.entries.length : 0;

    // Entry input placeholder
    const entryInput = $('#entry-amount');
    if (goal.type === 'financial') {
        entryInput.placeholder = 'Enter amount (PKR)';
    } else {
        entryInput.placeholder = 'Enter count';
    }

    // Render entries
    renderEntries(goal);
}

// --- Render Entries ---
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

    // Show entries newest first
    const reversed = [...entries].reverse();

    list.innerHTML = reversed.map((entry) => {
        return `
            <div class="entry-item">
                <div class="entry-dot" style="background:${goal.color}">
                    +
                </div>
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
        `;
    }).join('');

    // Attach delete handlers
    list.querySelectorAll('.entry-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteEntry(goal.id, btn.dataset.entryId);
        });
    });
}

// --- Add Entry ---
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

    const entry = {
        id: generateId(),
        amount: amount,
        note: noteInput.value.trim(),
        date: new Date().toISOString()
    };

    goal.achieved += amount;
    goal.entries.push(entry);
    saveGoals();

    // Clear inputs
    input.value = '';
    noteInput.value = '';

    // Refresh detail view
    openGoalDetail(currentGoalId);

    // Celebration
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

// --- Delete Entry ---
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

// --- Create / Edit Goal Form ---
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
    $$('.type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === selectedType);
    });
}

function updateIconUI() {
    $$('.icon-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.icon === selectedIcon);
    });
}

function updateColorUI() {
    $$('.color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === selectedColor);
    });
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

    if (!name) {
        showToast('Please enter a goal name');
        return;
    }
    if (!target || target <= 0) {
        showToast('Please enter a valid target');
        return;
    }

    if (editingGoalId) {
        // Update existing
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
        // Create new
        const goal = {
            id: generateId(),
            name: name,
            target: target,
            deadline: deadline,
            achieved: 0,
            type: selectedType,
            icon: selectedIcon,
            color: selectedColor,
            entries: [],
            createdAt: new Date().toISOString()
        };
        goals.push(goal);
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

// --- Toast ---
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// --- Confetti / Celebration ---
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
        p.vy += 0.05; // gravity
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

// --- Helpers ---
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Event Listeners ---
function initUI() {
    // FAB
    fab.addEventListener('click', () => openCreateForm());

    // Back buttons
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

    // Edit goal
    $('#edit-goal-btn').addEventListener('click', () => {
        if (currentGoalId) {
            openCreateForm(currentGoalId);
        }
    });

    // Type selector
    $$('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedType = btn.dataset.type;
            updateTypeUI();
            updateTargetLabel();
        });
    });

    // Icon picker
    $$('.icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedIcon = btn.dataset.icon;
            updateIconUI();
        });
    });

    // Color picker
    $$('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedColor = btn.dataset.color;
            updateColorUI();
        });
    });

    // Goal form submit
    goalForm.addEventListener('submit', saveGoal);

    // Delete goal
    $('#delete-goal-btn').addEventListener('click', () => {
        if (confirm('Delete this goal and all its entries?')) {
            deleteGoal();
        }
    });

    // Add entry
    $('#add-entry-btn').addEventListener('click', addEntry);

    // Enter key on entry input
    $('#entry-amount').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addEntry();
        }
    });

    // Sign out
    $('#sign-out-btn').addEventListener('click', handleSignOut);

    // Email/password auth
    $('#auth-form').addEventListener('submit', handleAuthSubmit);
    $('#auth-toggle-btn').addEventListener('click', toggleAuthMode);

    // Resize canvas
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

// --- Auth State Listener ---
function init() {
    initUI();

    // Safety timeout: if Firebase Auth doesn't respond in 4 seconds, show login screen
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
            // Show app
            authScreen.classList.add('hidden');
            app.classList.remove('hidden');

            // Show user info
            const emailEl = $('#user-email');
            emailEl.textContent = user.email || 'Signed In';

            // Migrate any existing local data on first sign-in
            await migrateLocalDataToCloud();

            // Start real-time sync from Firestore
            startRealtimeSync();

            // Load from localStorage as immediate fallback
            loadGoals();
            renderHome();
        } else {
            currentUser = null;
            authScreen.classList.remove('hidden');
            app.classList.add('hidden');
        }
    });
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);
