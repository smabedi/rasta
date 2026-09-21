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
        const res = await fetch('/api/auth/status');
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
        const res = await fetch('/api/users');
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
