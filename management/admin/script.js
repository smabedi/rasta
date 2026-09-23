/**
 * Rasta | Admin Controller (Server-Backed)
 */

document.addEventListener('DOMContentLoaded', async () => {
    const adminSetupView = document.getElementById('admin-setup-view');
    const adminGateView = document.getElementById('admin-gate-view');
    const adminWorkspaceView = document.getElementById('admin-workspace-view');

    const adminSetupForm = document.getElementById('admin-setup-form');
    const setupUserInput = document.getElementById('setup-user-input');
    const setupPinInput = document.getElementById('setup-pin-input');
    const adminSetupError = document.getElementById('admin-setup-error');

    const adminLoginForm = document.getElementById('admin-login-form');
    const adminUserInput = document.getElementById('admin-user-input');
    const adminPinInput = document.getElementById('admin-pin-input');
    const adminLoginError = document.getElementById('admin-login-error');
    const btnAdminLogout = document.getElementById('btn-admin-logout');

    const createUserForm = document.getElementById('create-user-form');
    const inputPersianName = document.getElementById('input-persian-name');
    const inputNumericPin = document.getElementById('input-numeric-pin');
    const formFeedback = document.getElementById('form-feedback');
    const userTableBody = document.getElementById('user-table-body');
    const userCountBadge = document.getElementById('user-count-badge');

    async function refreshViewState() {
        const hasAdmin = await RastaAuth.checkAdminStatus();
        const session = RastaAuth.getSession();

        if (!hasAdmin) {
            adminSetupView.classList.remove('hidden');
            adminGateView.classList.add('hidden');
            adminWorkspaceView.classList.add('hidden');
            btnAdminLogout.classList.add('hidden');
            setupUserInput.focus();
            return;
        }

        if (!session || session.role !== 'ADMIN') {
            adminSetupView.classList.add('hidden');
            adminGateView.classList.remove('hidden');
            adminWorkspaceView.classList.add('hidden');
            btnAdminLogout.classList.add('hidden');
            adminUserInput.focus();
            return;
        }

        adminSetupView.classList.add('hidden');
        adminGateView.classList.add('hidden');
        adminWorkspaceView.classList.remove('hidden');
        btnAdminLogout.classList.remove('hidden');
        await renderUserList();
    }

    adminSetupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        adminSetupError.textContent = '';

        const res = await RastaAuth.setupAdmin(setupUserInput.value, setupPinInput.value);
        if (res.success) {
            await refreshViewState();
        } else {
            adminSetupError.textContent = res.message;
        }
    });

    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        adminLoginError.textContent = '';

        const res = await RastaAuth.login(adminUserInput.value, adminPinInput.value);
        if (res.success && res.user.role === 'ADMIN') {
            adminUserInput.value = '';
            adminPinInput.value = '';
            await refreshViewState();
        } else {
            adminLoginError.textContent = res.message || 'اطلاعات مدیر ارشد نادرست است.';
        }
    });

    async function renderUserList() {
        const users = await RastaAuth.fetchUsers();
        userCountBadge.textContent = `${new Intl.NumberFormat('fa-IR').format(users.length)} کاربر`;
        userTableBody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.username}</strong></td>
                <td><span class="role-badge ${u.role.toLowerCase()}">${u.role === 'ADMIN' ? 'مدیر ارشد' : 'همکار'}</span></td>
                <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(u.createdAt).toLocaleDateString('fa-IR')}</td>
                <td>
                    <button type="button" class="btn-delete" data-id="${u.id}" data-username="${u.username}" ${u.role === 'ADMIN' ? 'disabled' : ''}>
                        حذف
                    </button>
                </td>
            `;
            userTableBody.appendChild(tr);
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.currentTarget.dataset.id;
                const userName = e.currentTarget.dataset.username || 'این کاربر';

                const confirmed = await RastaDialog.confirm({
                    title: 'حذف دسترسی همکار',
                    message: `آیا از حذف دسترسی «${userName}» از سامانه اطمینان دارید؟ این عمل دسترسی و فایل‌های پیش‌نویس کاربر را باطل خواهد کرد.`,
                    confirmText: 'بله، حذف شود',
                    cancelText: 'انصراف',
                    danger: true
                });

                if (confirmed) {
                    const ok = await RastaAuth.removeUser(userId);
                    if (ok) {
                        RastaToast.show(`دسترسی «${userName}» با موفقیت حذف شد.`, 'info');
                        await renderUserList();
                    } else {
                        RastaToast.show('خطا در حذف کاربر از سرور.', 'error');
                    }
                }
            });
        });
    }

    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formFeedback.textContent = '';
        formFeedback.className = 'feedback-msg';

        const res = await RastaAuth.createEditor(inputPersianName.value, inputNumericPin.value);
        if (res.success) {
            formFeedback.textContent = 'همکار با موفقیت افزوده شد.';
            formFeedback.classList.add('success');
            RastaToast.show(`همکار «${inputPersianName.value}» با موفقیت افزوده شد.`, 'success');
            inputPersianName.value = '';
            inputNumericPin.value = '';
            await renderUserList();
        } else {
            formFeedback.textContent = res.message;
            formFeedback.classList.add('error');
            RastaToast.show(res.message, 'error');
        }
    });

    btnAdminLogout.addEventListener('click', async () => {
        RastaAuth.logout();
        await refreshViewState();
    });

    await refreshViewState();
});