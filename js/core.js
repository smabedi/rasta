/**
 * Rasta | Client Authentication & Server Bridge
 */

let RastaAuth = (() => {
    const SESSION_KEY = 'rasta_active_session';

    function normalizeDigits(str) {
        if (!str) return '';
        const p = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        const a = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return str.toString()
            .replace(/[۰-۹]/g, d => String(p.indexOf(d)))
            .replace(/[٠-٩]/g, d => String(a.indexOf(d)));
    }

    function normalizeText(str) {
        if (!str) return '';
        return str.trim()
            .replace(/ي/g, 'ی')
            .replace(/ك/g, 'ک')
            .replace(/\u200c{2,}/g, '\u200c')
            .replace(/\s+/g, ' ');
    }

    async function checkAdminStatus() {
        const res = await fetch('/api/auth/status', { cache: 'no-store' });
        const data = await res.json();
        return data.hasAdmin;
    }

    async function setupAdmin(username, pin) {
        const res = await fetch('/api/auth/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: normalizeText(username),
                pin: normalizeDigits(pin)
            })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
            return { success: true, user: data.user };
        }
        return { success: false, message: data.error };
    }

    async function login(username, pin) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: normalizeText(username),
                pin: normalizeDigits(pin)
            })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
            return { success: true, user: data.user };
        }
        return { success: false, message: data.error };
    }

    function getSession() {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    }

    function logout() {
        localStorage.removeItem(SESSION_KEY);
    }

    async function fetchUsers() {
        const res = await fetch('/api/users', { cache: 'no-store' });
        const data = await res.json();
        return data.users || [];
    }

    async function createEditor(username, pin) {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: normalizeText(username),
                pin: normalizeDigits(pin)
            })
        });
        const data = await res.json();
        if (res.ok) return { success: true, user: data.user };
        return { success: false, message: data.error };
    }

    async function removeUser(userId) {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        return res.ok;
    }

    return {
        checkAdminStatus,
        setupAdmin,
        login,
        getSession,
        logout,
        fetchUsers,
        createEditor,
        removeUser
    };
})();

/**
 * Rasta | Non-blocking Toast Notification Engine
 */
let RastaToast = (() => {
    let container = null;

    function getContainer() {
        if (!container || !document.body.contains(container)) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function show(message, type = 'info', duration = 3500) {
        const c = getContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || 'ℹ'}</span>
            <div class="toast-content">${message}</div>
        `;

        c.appendChild(toast);

        // Slide in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto dismiss
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            }, { once: true });
        }, duration);
    }

    return { show };
})();

/**
 * Rasta | In-App Reusable Confirmation Dialog
 */
const RastaDialog = (() => {
    function confirm({
                         title = 'تأیید عملیات',
                         message = 'آیا از انجام این عملیات اطمینان دارید؟',
                         confirmText = 'تأیید و ادامه',
                         cancelText = 'انصراف',
                         danger = false
                     } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay dialog-overlay';

            const card = document.createElement('div');
            card.className = 'modal-card dialog-card';

            card.innerHTML = `
                <button type="button" class="modal-close-btn dialog-close-btn" title="بستن">✕</button>
                <div class="dialog-icon ${danger ? 'danger' : 'primary'}">
                    ${danger ? '⚠️' : '❓'}
                </div>
                <h3 class="dialog-title">${title}</h3>
                <p class="dialog-message">${message}</p>
                <div class="dialog-actions">
                    <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} dialog-btn-confirm">${confirmText}</button>
                    <button type="button" class="btn btn-outline dialog-btn-cancel">${cancelText}</button>
                </div>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            const btnConfirm = card.querySelector('.dialog-btn-confirm');
            const btnCancel = card.querySelector('.dialog-btn-cancel');
            const btnClose = card.querySelector('.dialog-close-btn');

            btnConfirm.focus();

            function cleanup(result) {
                window.removeEventListener('keydown', handleKeyDown);
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.15s ease';
                setTimeout(() => overlay.remove(), 150);
                resolve(result);
            }

            btnConfirm.addEventListener('click', () => cleanup(true));
            btnCancel.addEventListener('click', () => cleanup(false));
            btnClose.addEventListener('click', () => cleanup(false));

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup(false);
            });

            function handleKeyDown(e) {
                if (e.key === 'Escape') {
                    cleanup(false);
                }
            }
            window.addEventListener('keydown', handleKeyDown);
        });
    }

    return { confirm };
})();

window.RastaToast = RastaToast;

/**
 * Rasta | Live Presence Tracker
 * Pings /api/presence/ping every 5 seconds and updates all counter elements.
 */
const RastaPresence = (() => {
    const STORAGE_KEY = 'rasta_presence_client_id';

    function getClientId() {
        let id = sessionStorage.getItem(STORAGE_KEY);
        if (!id) {
            id = 'cli_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
            sessionStorage.setItem(STORAGE_KEY, id);
        }
        return id;
    }

    async function sendHeartbeat() {
        try {
            const res = await fetch('/api/presence/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: getClientId() }),
                cache: 'no-store'
            });

            if (!res.ok) return;
            const data = await res.json();

            if (data && typeof data.onlineCount === 'number') {
                updateCounterUI(data.onlineCount);
            }
        } catch (err) {
            // Fail silently on transient network disconnects
        }
    }

    function updateCounterUI(count) {
        // Convert to Persian digits using fa-IR locale
        const formatted = count.toLocaleString('fa-IR');
        const elements = document.querySelectorAll('[data-online-counter]');

        elements.forEach(el => {
            el.textContent = formatted;
        });
    }

    function start() {
        sendHeartbeat(); // Immediate first ping
        setInterval(sendHeartbeat, 5000); // Repeat every 5 seconds
    }

    return { start };
})();

// Auto-start on load
document.addEventListener('DOMContentLoaded', () => {
    RastaPresence.start();
});

/**
 * Rasta | Optimistic Top Loading Bar Engine
 * Continuous 60/120 FPS Asymptotic Physics with Cross-Page Relay
 */
let RastaProgress = (() => {
    let barEl = null;
    let fillEl = null;
    let currentProgress = 0;
    let rafId = null;
    let startTime = null;
    let isRunning = false;

    // Physics parameters
    const START_OFFSET = 0.14;   // Immediate tactile bite upon click
    const ASYMPTOTE_MAX = 0.92;  // Ceiling it asymptotically approaches
    const DECAY_RATE = 0.78;     // Speed multiplier (higher = faster early glide)

    const STORAGE_KEY_ACTIVE = 'rasta_nav_active';
    const STORAGE_KEY_VAL = 'rasta_nav_progress';

    function initDOM() {
        if (barEl) return;
        barEl = document.getElementById('rasta-progress-bar');
        if (!barEl) {
            barEl = document.createElement('div');
            barEl.id = 'rasta-progress-bar';
            fillEl = document.createElement('div');
            fillEl.className = 'progress-fill';
            barEl.appendChild(fillEl);
            document.body.appendChild(barEl);
        } else {
            fillEl = barEl.querySelector('.progress-fill');
        }
    }

    function set(val) {
        if (!barEl) initDOM();
        currentProgress = Math.min(Math.max(val, 0), 1);
        fillEl.style.transform = `scaleX(${currentProgress})`;
    }

    // Mathematical continuous deceleration: P(t) = Target - (Target - Start) * e^(-k * t)
    function tickPhysics(timestamp) {
        if (!isRunning) return;
        if (!startTime) startTime = timestamp;

        const elapsed = (timestamp - startTime) / 1000; // in seconds
        const distance = ASYMPTOTE_MAX - START_OFFSET;

        currentProgress = ASYMPTOTE_MAX - (distance * Math.exp(-DECAY_RATE * elapsed));
        fillEl.style.transform = `scaleX(${currentProgress})`;

        // Sync snapshot to sessionStorage every ~60ms for smooth cross-page handoff
        if (Math.round(elapsed * 100) % 6 === 0) {
            try {
                sessionStorage.setItem(STORAGE_KEY_VAL, currentProgress.toString());
            } catch (e) {}
        }

        rafId = requestAnimationFrame(tickPhysics);
    }

    function start() {
        if (isRunning) return;
        isRunning = true;
        cancelAnimationFrame(rafId);
        startTime = null;

        initDOM();
        barEl.classList.add('active');

        // Disable CSS transitions during the continuous RAF loop
        fillEl.style.transition = 'none';
        set(START_OFFSET);

        rafId = requestAnimationFrame(tickPhysics);
    }

    function done() {
        if (!isRunning) return;
        cancelAnimationFrame(rafId);
        rafId = null;

        initDOM();

        // Engage hardware-accelerated CSS ease exclusively for the final glide to 100%
        fillEl.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
        set(1);

        setTimeout(() => {
            if (barEl) barEl.classList.remove('active');
            setTimeout(() => {
                fillEl.style.transition = 'none';
                set(0);
                isRunning = false;
                try {
                    sessionStorage.removeItem(STORAGE_KEY_ACTIVE);
                    sessionStorage.removeItem(STORAGE_KEY_VAL);
                } catch (e) {}
            }, 300);
        }, 280);
    }

    function checkPageRelay() {
        let wasNavigating = false;
        let savedProgress = 0.65;

        try {
            wasNavigating = sessionStorage.getItem(STORAGE_KEY_ACTIVE);
            savedProgress = parseFloat(sessionStorage.getItem(STORAGE_KEY_VAL)) || 0.65;
        } catch (e) {}

        if (!wasNavigating) return;

        isRunning = true;
        initDOM();
        barEl.classList.add('active');

        // Mount instantly at the handoff point with zero jumping
        fillEl.style.transition = 'none';
        set(savedProgress);
        void fillEl.offsetWidth; // Force reflow

        // Glide across the final stretch to 100% on the newly arrived page
        setTimeout(() => {
            done();
        }, 40);
    }

    function bindNavigationListeners() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (
                !href ||
                href.startsWith('#') ||
                href.startsWith('javascript:') ||
                link.target === '_blank' ||
                link.hasAttribute('download')
            ) {
                return;
            }

            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (link.origin && link.origin !== window.location.origin) return;

            try {
                sessionStorage.setItem(STORAGE_KEY_ACTIVE, '1');
            } catch (e) {}

            start();
        });

        window.addEventListener('pageshow', (event) => {
            if (event.persisted) done();
        });
    }

    return {
        start,
        done,
        set,
        init: () => {
            initDOM();
            bindNavigationListeners();
            checkPageRelay();
        }
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RastaProgress.init());
} else {
    RastaProgress.init();
}

window.RastaProgress = RastaProgress;