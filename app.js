// ============================================
// GOALS TRACKER - Application Logic
// ============================================

(function () {
    'use strict';

    // --- State ---
    let goals = [];
    let currentGoalId = null;
    let editingGoalId = null;
    let selectedType = 'financial';
    let selectedIcon = 'star';
    let selectedColor = '#007AFF';

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

    const homeScreen = $('#home-screen');
    const createScreen = $('#create-screen');
    const detailScreen = $('#detail-screen');
    const goalsGrid = $('#goals-grid');
    const goalForm = $('#goal-form');
    const fab = $('#add-goal-btn');
    const toast = $('#toast');
    const confettiCanvas = $('#confetti-canvas');
    const ctx = confettiCanvas.getContext('2d');

    // --- LocalStorage ---
    function saveGoals() {
        localStorage.setItem('goals_tracker_data', JSON.stringify(goals));
    }

    function loadGoals() {
        try {
            const data = localStorage.getItem('goals_tracker_data');
            goals = data ? JSON.parse(data) : [];
        } catch {
            goals = [];
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
            selectedType = goal.type;
            selectedIcon = goal.icon;
            selectedColor = goal.color;
            $('#save-goal-btn').textContent = 'Save Changes';
            $('#delete-goal-btn').classList.remove('hidden');
        } else {
            $('#create-title').textContent = 'New Goal';
            $('#goal-name').value = '';
            $('#goal-target').value = '';
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
    function init() {
        loadGoals();
        renderHome();

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

        // Resize canvas
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    }

    // --- Start ---
    document.addEventListener('DOMContentLoaded', init);
})();
