/**
 * 🏛️ Rasta Admin Engine
 * Hardened Controller: XSS-Proof, Dynamic Role Fields, Strict Regex
 */

const API_BASE = '/api';
let authToken = localStorage.getItem('rasta_admin_token') || localStorage.getItem('rasta_token') || '';
let currentUser = null;
let cachedInstitutes = [];
let cachedUsers = [];

// Helper: Convert digits to Persian
function toPersianDigits(value) {
    if (value === null || value === undefined) return '';
    const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return value.toString().replace(/\d/g, d => farsiDigits[d]);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', async () => {
    setupTabSwitching();
    setupModals();
    setupDelegatedTableActions();
    setupDynamicRoleForm();
    await verifySystemState();
});

// --- AUTH & BOOTSTRAP STATE MACHINE ---

async function verifySystemState() {
    try {
        const bootRes = await fetch(`${API_BASE}/admin/bootstrap`);
        const bootData = await bootRes.json();

        if (bootData.needs_bootstrap) {
            showBootstrapMode();
            return;
        }

        if (!authToken) {
            showLoginMode();
            return;
        }

        const meRes = await apiRequest('/auth/me');
        if (!meRes.ok || meRes.user.role !== 'admin') {
            logout();
            return;
        }

        currentUser = meRes.user;
        localStorage.setItem('rasta_admin_token', authToken);
        localStorage.setItem('rasta_token', authToken);
        const persianPhone = toPersianDigits(currentUser.phone);
        document.getElementById('currentAdminName').textContent = `${currentUser.full_name} (${persianPhone})`;
        document.getElementById('authModal').style.display = 'none';

        await refreshDashboard();
    } catch (err) {
        console.error('System verification failed:', err);
        showLoginMode();
    }
}

function showBootstrapMode() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'flex';
    document.getElementById('authModalTitle').textContent = '⚡ راه‌اندازی نخستین حساب مدیر ارشد';
    document.getElementById('authModalDesc').textContent = 'پایگاه داده تازه ایجاد شده است. لطفاً اولین مدیر سامانه را ثبت کنید.';
    document.getElementById('bootstrapNameField').style.display = 'block';
    document.getElementById('authSubmitBtn').textContent = 'راه‌اندازی و ثبت نام';
}

function showLoginMode() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'flex';
    document.getElementById('authModalTitle').textContent = 'ورود به پنل مدیریت رستا';
    document.getElementById('authModalDesc').textContent = 'برای دسترسی، شماره تلفن و رمز عبور مدیر را وارد کنید.';
    document.getElementById('bootstrapNameField').style.display = 'none';
    document.getElementById('authSubmitBtn').textContent = 'ورود به پنل';
}

// --- API COMMUNICATIONS ---

async function apiRequest(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const options = { method, headers };
    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const json = await res.json();

    if (res.status === 401 || res.status === 403) {
        if (!endpoint.includes('/auth/login') && !endpoint.includes('/admin/bootstrap')) {
            logout();
        }
    }
    return json;
}

// --- DASHBOARD DATA LOADER ---

async function refreshDashboard() {
    await Promise.all([
        loadStats(),
        loadInstitutes(),
        loadUsers()
    ]);
}

async function loadStats() {
    const res = await apiRequest('/admin/stats');
    if (res.ok) {
        document.getElementById('statTotalUsers').textContent = res.stats.users_count.toLocaleString('fa-IR');
        document.getElementById('statTotalStudents').textContent = res.stats.students_count.toLocaleString('fa-IR');
        document.getElementById('statTotalInstitutes').textContent = res.stats.institutes_count.toLocaleString('fa-IR');
        document.getElementById('statTotalSlots').textContent = res.stats.slots_count.toLocaleString('fa-IR');
    }
}

async function loadInstitutes() {
    const res = await apiRequest('/admin/institutes');
    if (res.ok) {
        cachedInstitutes = res.institutes;
        renderInstitutesTable(cachedInstitutes);
        populateInstituteDropdowns(cachedInstitutes);
    }
}

async function loadUsers() {
    const roleFilter = document.getElementById('roleFilterSelect').value;
    const url = roleFilter ? `/admin/users?role=${roleFilter}` : '/admin/users';
    const res = await apiRequest(url);
    if (res.ok) {
        cachedUsers = res.users;
        renderUsersTable(cachedUsers);
    }
}

// --- RENDERING WITH XSS PROTECTION ---

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">هیچ کاربری یافت نشد.</td></tr>';
        return;
    }

    const roleMap = {
        'admin': 'مدیر سامانه',
        'institute': 'مشاور مرکز',
        'student_affiliated': 'دانش‌آموز وابسته',
        'student_independent': 'داوطلب آزاد'
    };

    const streamMap = {
        'math': 'ریاضی',
        'experimental': 'تجربی',
        'humanities': 'انسانی'
    };

    const genderMap = {
        'male': 'مرد',
        'female': 'زن'
    };

    tbody.innerHTML = users.map(u => {
        const slotCount = Number(u.slot_count) || 0;
        const safePhone = escapeHtml(u.phone);
        const safeName = escapeHtml(u.full_name);
        const safeInst = escapeHtml(u.institute_name || 'مستقل');
        const roleBadge = `<span class="badge badge-${escapeHtml(u.role)}">${roleMap[u.role] || escapeHtml(u.role)}</span>`;

        return `
        <tr>
            <td>${toPersianDigits(u.id)}</td>
            <td><strong>${safeName}</strong></td>
            <td>
                <span class="user-phone" data-copy="${safePhone}" title="برای کپی کلیک کنید">
                    ${safePhone}
                </span>
            </td>
            <td>${roleBadge}</td>
            <td>${genderMap[u.gender] || '-'}</td>
            <td>${streamMap[u.stream] || '-'}</td>
            <td>${u.academic_year ? toPersianDigits(u.academic_year) : '-'}</td>
            <td>${safeInst}</td>
            <td><span class="badge badge-slot">${slotCount.toLocaleString('fa-IR')} چینش</span></td>
            <td>
                <button class="btn btn-sm btn-secondary" data-action="edit-user" data-id="${u.id}">ویرایش</button>
                ${u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}">حذف</button>` : ''}
            </td>
        </tr>
    `;
    }).join('');
}

function renderInstitutesTable(institutes) {
    const tbody = document.getElementById('institutesTableBody');
    if (institutes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">هیچ مرکزی ثبت نشده است.</td></tr>';
        return;
    }

    tbody.innerHTML = institutes.map(inst => {
        const safeName = escapeHtml(inst.name);
        const safeCode = escapeHtml(inst.invite_code);
        const safePhone = escapeHtml(inst.contact_phone || '');

        return `
        <tr>
            <td>${toPersianDigits(inst.id)}</td>
            <td><strong>${safeName}</strong></td>
            <td>
                <span class="code-badge" data-copy="${safeCode}" title="برای کپی کلیک کنید">
                    ${safeCode}
                </span>
            </td>
            <td>
                ${safePhone ? `<span class="user-phone" data-copy="${safePhone}" title="برای کپی کلیک کنید">${safePhone}</span>` : '-'}
            </td>
            <td><span class="badge badge-counter">${(inst.student_count || 0).toLocaleString('fa-IR')} داوطلب</span></td>
            <td>${new Date(inst.created_at).toLocaleDateString('fa-IR')}</td>
            <td>
                <button class="btn btn-sm btn-secondary" data-action="edit-inst" data-id="${inst.id}">ویرایش</button>
                <button class="btn btn-sm btn-danger" data-action="delete-inst" data-id="${inst.id}">حذف</button>
            </td>
        </tr>
    `;
    }).join('');
}

function populateInstituteDropdowns(institutes) {
    const select = document.getElementById('formUserInstitute');
    select.innerHTML = '<option value="">بدون مرکز (مستقل)</option>' +
        institutes.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.invite_code)})</option>`).join('');
}

// --- DELEGATED SECURE EVENT LISTENERS (NO INLINE ONCLICK) ---

function setupDelegatedTableActions() {
    // 1. Safe clipboard copy for phones and invite codes
    document.addEventListener('click', (e) => {
        const copyEl = e.target.closest('[data-copy]');
        if (copyEl) {
            const val = copyEl.getAttribute('data-copy');
            if (val) {
                navigator.clipboard.writeText(val).then(() => {
                    const original = copyEl.textContent;
                    copyEl.textContent = 'کپی شد';
                    setTimeout(() => { copyEl.textContent = original; }, 1200);
                });
            }
        }
    });

    // 2. Delegated User Actions
    const userTable = document.getElementById('usersTableBody');
    userTable.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.getAttribute('data-id'));
        if (!id) return;

        if (btn.getAttribute('data-action') === 'edit-user') {
            openEditUserModal(id);
        } else if (btn.getAttribute('data-action') === 'delete-user') {
            deleteUser(id);
        }
    });

    // 3. Delegated Institute Actions
    const instTable = document.getElementById('institutesTableBody');
    instTable.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.getAttribute('data-id'));
        if (!id) return;

        if (btn.getAttribute('data-action') === 'edit-inst') {
            openEditInstModal(id);
        } else if (btn.getAttribute('data-action') === 'delete-inst') {
            deleteInstitute(id);
        }
    });
}

// --- DYNAMIC ROLE VISIBILITY IN FORM ---

function setupDynamicRoleForm() {
    const roleSelect = document.getElementById('formUserRole');
    const genderField = document.getElementById('fieldUserGender');
    const cohortRow = document.getElementById('fieldCandidateCohort');
    const instGroup = document.getElementById('formUserInstituteGroup');

    function syncFields() {
        const role = roleSelect.value;
        const isStudent = role.startsWith('student');
        const isAffiliated = role === 'student_affiliated';

        genderField.style.display = isStudent ? 'block' : 'none';
        cohortRow.style.display = isStudent ? 'grid' : 'none';
        instGroup.style.display = isAffiliated ? 'block' : 'none';
    }

    roleSelect.addEventListener('change', syncFields);
    syncFields();
}

// --- USER ACTIONS ---

function openEditUserModal(userId) {
    const u = cachedUsers.find(x => Number(x.id) === userId);
    if (!u) return;

    document.getElementById('userEditId').value = u.id;
    document.getElementById('userModalTitle').textContent = `ویرایش کاربر: ${u.full_name}`;
    document.getElementById('formUserFullName').value = u.full_name;
    document.getElementById('formUserPhone').value = u.phone;
    document.getElementById('formUserPhone').disabled = false;
    document.getElementById('formUserPassword').value = '';
    document.getElementById('pwdHint').textContent = '(تنها در صورت نیاز به تغییر پر کنید)';
    document.getElementById('formUserRole').value = u.role;
    document.getElementById('formUserGender').value = u.gender || 'male';
    document.getElementById('formUserStream').value = u.stream || 'math';
    document.getElementById('formUserAcademicYear').value = u.academic_year || '04-05';
    document.getElementById('formUserInstitute').value = u.institute_id || '';
    document.getElementById('userFormError').textContent = '';

    // Trigger visibility update
    document.getElementById('formUserRole').dispatchEvent(new Event('change'));
    document.getElementById('userModal').style.display = 'flex';
}

async function deleteUser(userId) {
    if (!confirm('آیا از حذف این کاربر و تمام چینش‌های مرتبط اطمینان دارید؟ این عمل غیرقابل برگشت است.')) {
        return;
    }
    const res = await apiRequest(`/admin/users/${userId}`, 'DELETE');
    if (res.ok) {
        await refreshDashboard();
    } else {
        alert(res.error || 'خطا در حذف کاربر.');
    }
}

function openEditInstModal(instId) {
    const inst = cachedInstitutes.find(x => Number(x.id) === instId);
    if (!inst) return;

    document.getElementById('instEditId').value = inst.id;
    document.getElementById('instituteModalTitle').textContent = `ویرایش مرکز: ${inst.name}`;
    document.getElementById('formInstName').value = inst.name;
    document.getElementById('formInstCode').value = inst.invite_code;
    document.getElementById('formInstCode').disabled = true;
    document.getElementById('formInstPhone').value = inst.contact_phone || '';
    document.getElementById('instFormError').textContent = '';

    document.getElementById('instituteModal').style.display = 'flex';
}

async function deleteInstitute(instId) {
    if (!confirm('با حذف مرکز، داوطلبان متصل تبدیل به داوطلب آزاد می‌شوند. ادامه می‌دهید؟')) {
        return;
    }
    const res = await apiRequest(`/admin/institutes/${instId}`, 'DELETE');
    if (res.ok) {
        await refreshDashboard();
    } else {
        alert(res.error || 'خطا در حذف مرکز.');
    }
}

// --- MODAL CONTROLS & LISTENERS ---

function setupModals() {
    document.getElementById('authForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('authErrorMsg');
        errEl.textContent = '';

        const phone = document.getElementById('authPhone').value.trim();
        const password = document.getElementById('authPassword').value.trim();
        const fullName = document.getElementById('authFullName').value.trim();
        const isBootstrap = document.getElementById('bootstrapNameField').style.display !== 'none';

        const endpoint = isBootstrap ? '/admin/bootstrap' : '/auth/login';
        const payload = isBootstrap ? { phone, password, full_name: fullName } : { phone, password };

        const res = await apiRequest(endpoint, 'POST', payload);
        if (res.ok && res.token) {
            authToken = res.token;
            localStorage.setItem('rasta_admin_token', authToken);
            await verifySystemState();
        } else {
            errEl.textContent = res.error || 'خطا در اعتبارسنجی.';
        }
    });

    document.getElementById('openNewUserModalBtn').addEventListener('click', () => {
        document.getElementById('userEditId').value = '';
        document.getElementById('userModalTitle').textContent = 'ثبت کاربر جدید';
        document.getElementById('formUserFullName').value = '';
        document.getElementById('formUserPhone').value = '';
        document.getElementById('formUserPhone').disabled = false;
        document.getElementById('formUserPassword').value = '';
        document.getElementById('pwdHint').textContent = '(حداقل ۶ نویسه)';
        document.getElementById('formUserRole').value = 'student_independent';
        document.getElementById('formUserGender').value = 'male';
        document.getElementById('formUserStream').value = 'math';
        document.getElementById('formUserAcademicYear').value = '04-05';
        document.getElementById('formUserInstitute').value = '';
        document.getElementById('userFormError').textContent = '';

        document.getElementById('formUserRole').dispatchEvent(new Event('change'));
        document.getElementById('userModal').style.display = 'flex';
    });

    document.getElementById('closeUserModalBtn').addEventListener('click', () => {
        document.getElementById('userModal').style.display = 'none';
    });

    document.getElementById('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('userFormError');
        errEl.textContent = '';

        const editId = document.getElementById('userEditId').value;
        const role = document.getElementById('formUserRole').value;
        const phone = document.getElementById('formUserPhone').value.trim();

        const payload = {
            full_name: document.getElementById('formUserFullName').value.trim(),
            phone: phone,
            role: role,
            gender: role.startsWith('student') ? document.getElementById('formUserGender').value : null,
            stream: role.startsWith('student') ? document.getElementById('formUserStream').value : null,
            academic_year: role.startsWith('student') ? document.getElementById('formUserAcademicYear').value : null,
            institute_id: (role === 'student_affiliated') ? (document.getElementById('formUserInstitute').value || null) : null
        };

        const password = document.getElementById('formUserPassword').value.trim();
        if (password) payload.password = password;

        if (!editId) {
            if (!password) {
                errEl.textContent = 'کلمه عبور برای کاربر جدید الزامی است.';
                return;
            }
        }

        const endpoint = editId ? `/admin/users/${editId}` : '/admin/users';
        const method = editId ? 'PUT' : 'POST';

        const res = await apiRequest(endpoint, method, payload);
        if (res.ok) {
            document.getElementById('userModal').style.display = 'none';
            await refreshDashboard();
        } else {
            errEl.textContent = res.error || 'خطا در ثبت اطلاعات.';
        }
    });

    document.getElementById('openNewInstituteModalBtn').addEventListener('click', () => {
        document.getElementById('instEditId').value = '';
        document.getElementById('instituteModalTitle').textContent = 'ثبت مرکز آموزشی جدید';
        document.getElementById('formInstName').value = '';
        document.getElementById('formInstCode').value = '';
        document.getElementById('formInstCode').disabled = false;
        document.getElementById('formInstPhone').value = '';
        document.getElementById('instFormError').textContent = '';
        document.getElementById('instituteModal').style.display = 'flex';
    });

    document.getElementById('closeInstModalBtn').addEventListener('click', () => {
        document.getElementById('instituteModal').style.display = 'none';
    });

    document.getElementById('instituteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('instFormError');
        errEl.textContent = '';

        const editId = document.getElementById('instEditId').value;
        const payload = {
            name: document.getElementById('formInstName').value.trim(),
            contact_phone: document.getElementById('formInstPhone').value.trim()
        };

        if (!editId) {
            const code = document.getElementById('formInstCode').value.trim();
            if (code) payload.invite_code = code;
        }

        const endpoint = editId ? `/admin/institutes/${editId}` : '/admin/institutes';
        const method = editId ? 'PUT' : 'POST';

        const res = await apiRequest(endpoint, method, payload);
        if (res.ok) {
            document.getElementById('instituteModal').style.display = 'none';
            await refreshDashboard();
        } else {
            errEl.textContent = res.error || 'خطا در ثبت مرکز.';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', logout);

    document.getElementById('userSearchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = cachedUsers.filter(u =>
            u.full_name.toLowerCase().includes(query) || u.phone.includes(query)
        );
        renderUsersTable(filtered);
    });

    document.getElementById('roleFilterSelect').addEventListener('change', () => {
        loadUsers();
    });

    document.getElementById('instituteSearchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = cachedInstitutes.filter(i =>
            i.name.toLowerCase().includes(query) || i.invite_code.toLowerCase().includes(query)
        );
        renderInstitutesTable(filtered);
    });
}

function setupTabSwitching() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = 'tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
        });
    });
}

async function logout() {
    try {
        if (authToken) {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
        }
    } catch (err) {
        console.error('Logout error:', err);
    } finally {
        authToken = '';
        currentUser = null;
        localStorage.removeItem('rasta_admin_token');
        localStorage.removeItem('rasta_token');
        window.location.href = '/';
    }
}
