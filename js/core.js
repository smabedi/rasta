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
 * Decelerating trickle with automatic link interception and programmatic API.
 */
let RastaProgress = (() => {
    let barEl = null;
    let fillEl = null;
    let currentProgress = 0;
    let trickleTimer = null;
    let isRunning = false;

    function initDOM() {
        if (document.getElementById('rasta-progress-bar')) return;

        barEl = document.createElement('div');
        barEl.id = 'rasta-progress-bar';

        fillEl = document.createElement('div');
        fillEl.className = 'progress-fill';

        barEl.appendChild(fillEl);
        document.body.appendChild(barEl);
    }

    function set(val) {
        if (!barEl) initDOM();
        currentProgress = Math.min(Math.max(val, 0), 1);
        fillEl.style.transform = `scaleX(${currentProgress})`;
    }

    function trickle() {
        if (currentProgress >= 0.95) return;

        // Smaller, gentler increments to avoid jerky jumps
        let step = 0;
        if (currentProgress < 0.25) {
            step = 0.08;
        } else if (currentProgress < 0.55) {
            step = 0.035;
        } else if (currentProgress < 0.8) {
            step = 0.015;
        } else {
            step = 0.004;
        }

        set(currentProgress + step);
        trickleTimer = setTimeout(trickle, 240 + Math.random() * 60);
    }

    function start() {
        if (isRunning) return;
        isRunning = true;
        clearTimeout(trickleTimer);

        initDOM();
        barEl.classList.add('active');
        set(0.15); // Instant optimistic start
        trickleTimer = setTimeout(trickle, 100);
    }

    function done() {
        if (!isRunning) return;
        clearTimeout(trickleTimer);
        set(1); // Glide to 100%

        // Allow 320ms for the smooth transform to actually complete before fading out
        setTimeout(() => {
            if (barEl) barEl.classList.remove('active');
            setTimeout(() => {
                set(0);
                isRunning = false;
            }, 350);
        }, 320);
    }

    // Auto-intercept navigation clicks to show immediate tactile feedback
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

            // Don't trigger if modified click (opening in background tab)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            // Internal domain check
            if (link.origin && link.origin !== window.location.origin) return;

            start();
        });

        // Flash complete on page load
        window.addEventListener('load', () => {
            done();
        });

        // Safety cleanup if user returns via back/forward cache
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
        }
    };
})();

// Initialize automatically
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RastaProgress.init());
} else {
    RastaProgress.init();
}

window.RastaProgress = RastaProgress;
