/**
 * Rasta Student Dashboard Frontend Controller
 * Authenticated API Integration with SQLite/PHP Backend
 */

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. Utilities & Token Resolution ---
    const toFa = (n) => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

    function getToken() {
        return localStorage.getItem('rasta_token') || localStorage.getItem('rasta_admin_token') || '';
    }

    async function apiFetch(endpoint, options = {}) {
        const token = getToken();
        if (!token) {
            window.location.href = '/';
            return null;
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        };

        let res;
        try {
            res = await fetch(`/api/${endpoint}`, { credentials: 'same-origin', ...options, headers });
        } catch (networkErr) {
            showToast('خطا در برقراری ارتباط با سرور', 'error');
            throw networkErr;
        }

        if (res.status === 401) {
            localStorage.removeItem('rasta_token');
            window.location.href = '/';
            return null;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const errorMsg = data.error || 'خطایی در ارتباط با سرور رخ داد';
            showToast(errorMsg, 'error');
            throw new Error(errorMsg);
        }

        return data;
    }

    function timeAgo(dateStr) {
        if (!dateStr) return 'به تازگی';
        const now = new Date();
        const past = new Date(dateStr.replace(' ', 'T') + 'Z');
        const diffSec = Math.floor((now - past) / 1000);

        if (diffSec < 60) return 'لحظاتی پیش';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${toFa(diffMin)} دقیقه پیش`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${toFa(diffHour)} ساعت پیش`;
        const diffDay = Math.floor(diffHour / 24);
        return `${toFa(diffDay)} روز پیش`;
    }

    // --- 2. State & Session Guard ---
    let currentUser = null;
    let currentSlots = [];
    const urlParams = new URLSearchParams(window.location.search);
    const targetStudentId = urlParams.get('student_id');

    async function initSession() {
        try {
            const data = await apiFetch('auth/me');
            if (!data || !data.user) return;
            currentUser = data.user;

            populateProfileUI();
            await loadSlots();
        } catch (e) {
            console.error('Session init failed:', e);
        }
    }

    // --- 3. Profile UI Rendering ---
    function populateProfileUI() {
        document.getElementById('sidebarUserName').textContent = currentUser.full_name;
        document.getElementById('sidebarAvatar').textContent = currentUser.full_name.substring(0, 2);

        const streamTitles = { math: 'ریاضی و فیزیک', experimental: 'علوم تجربی', humanities: 'علوم انسانی' };
        document.getElementById('sidebarStreamTag').textContent = streamTitles[currentUser.stream] || 'داوطلب کنکور';

        // Affiliation display
        const connectedBlock = document.getElementById('instituteConnectedBlock');
        const joinBlock = document.getElementById('instituteJoinBlock');

        if (currentUser.institute_id && currentUser.institute_name) {
            document.getElementById('sidebarAffiliationName').textContent = currentUser.institute_name;
            document.getElementById('displayInstituteName').textContent = currentUser.institute_name;
            connectedBlock.style.display = 'flex';
            joinBlock.style.display = 'none';
        } else {
            document.getElementById('sidebarAffiliationName').textContent = 'داوطلب آزاد (بدون موسسه)';
            connectedBlock.style.display = 'none';
            joinBlock.style.display = 'block';
        }

        // Form Fields
        document.getElementById('profileFullName').value = currentUser.full_name;
        document.getElementById('profilePhone').value = toFa(currentUser.phone);
        document.getElementById('profileAcademicYear').value = currentUser.academic_year || '1405';

        const streamRadio = document.querySelector(`input[name="profileStream"][value="${currentUser.stream}"]`);
        if (streamRadio) streamRadio.checked = true;

        const genderRadio = document.querySelector(`input[name="profileGender"][value="${currentUser.gender}"]`);
        if (genderRadio) genderRadio.checked = true;

        // Synchronize Global Live Header
        const headerUserName = document.getElementById('userNavName');
        if (headerUserName) headerUserName.textContent = currentUser.full_name;
        const headerRoleTag = document.getElementById('userRoleTag');
        if (headerRoleTag) headerRoleTag.textContent = 'داوطلب';
        const loginBtn = document.getElementById('authActionBtn');
        if (loginBtn) loginBtn.style.display = 'none';
        const userNavTrigger = document.getElementById('userNavTrigger');
        if (userNavTrigger) userNavTrigger.style.display = 'flex';
    }

    // --- 4. Slots Management & Preview Rendering ---
    const slotsContainer = document.getElementById('slotsContainer');

    async function loadSlots() {
        const query = targetStudentId ? `?student_id=${targetStudentId}` : '';
        const data = await apiFetch(`slots${query}`);
        if (!data) return;

        currentSlots = Array.isArray(data) ? data : (data.slots || []);
        document.getElementById('slotCountPill').textContent = `${toFa(currentSlots.length)}/${toFa(20)}`;
        renderSlots();
    }

    function renderSlots() {
        slotsContainer.innerHTML = '';

        if (currentSlots.length === 0) {
            slotsContainer.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 40px;">
                    <p style="color: var(--text-muted); margin-bottom: 16px;">هیچ سناریویی یافت نشد. اولین سناریوی خود را ایجاد کنید.</p>
                </div>
            `;
            return;
        }

        currentSlots.forEach(slot => {
            let choices = [];
            try {
                choices = typeof slot.custom_ordering_json === 'string'
                    ? JSON.parse(slot.custom_ordering_json || '[]')
                    : (slot.custom_ordering_json || []);
            } catch (e) {
                choices = [];
            }

            const totalChoices = choices.length;
            const topChoices = choices.slice(0, 10);

            let previewRowsHtml = '';
            if (topChoices.length > 0) {
                topChoices.forEach((item, idx) => {
                    const rank = item.rank || (idx + 1);
                    const major = item.major || item.major_name || 'نامشخص';
                    const uni = item.uni || item.uni_name || 'دانشگاه سراسری';
                    const regime = item.regime || 'روزانه';
                    const score = Number(item.score || 0).toFixed(2);

                    let regimeClass = 'regime-day';
                    if (regime.includes('دوم') || regime.includes('شبانه')) regimeClass = 'regime-night';
                    if (regime.includes('پردیس')) regimeClass = 'regime-campus';

                    previewRowsHtml += `
                        <tr>
                            <td class="preview-rank">${toFa(rank)}</td>
                            <td><strong>${major}</strong></td>
                            <td>${uni}</td>
                            <td><span class="regime-pill ${regimeClass}">${regime}</span></td>
                            <td><span class="mcdm-score-tag">${toFa(score)}</span></td>
                        </tr>
                    `;
                });
            } else {
                previewRowsHtml = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">
                            هنوز انتخابی برای این سناریو ثبت نشده است. از دکمه «ویرایش و سناریوساز» شروع کنید.
                        </td>
                    </tr>
                `;
            }

            const card = document.createElement('div');
            card.className = 'slot-card';
            card.id = `slot-card-${slot.slot_index}`;

            card.innerHTML = `
                <div class="slot-card-header">
                    <div class="slot-badge-title">
                        <div class="slot-number-chip">${toFa(slot.slot_index)}</div>
                        <div class="slot-meta">
                            <h3 class="slot-title">${slot.title || `سناریو شماره ${toFa(slot.slot_index)}`}</h3>
                            <div class="slot-sub-info">
                                <span>آخرین ویرایش: ${timeAgo(slot.updated_at)}</span>
                                <span>•</span>
                                <span>تعداد انتخاب‌ها: ${toFa(totalChoices)} رشته‌محل</span>
                            </div>
                        </div>
                    </div>
                    <div class="slot-card-controls">
                        <button type="button" class="btn btn-secondary btn-icon-only btn-rename-slot" data-slot="${slot.slot_index}" title="تغییر نام">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        <button type="button" class="btn btn-secondary btn-icon-only btn-clone-slot" data-slot="${slot.slot_index}" title="تکثیر سناریو">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button type="button" class="btn btn-danger-outline btn-icon-only btn-delete-slot" data-slot="${slot.slot_index}" title="حذف سناریو">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                        <button type="button" class="btn btn-secondary btn-toggle-preview" data-slot="${slot.slot_index}">
                            <span class="preview-btn-text">مشاهده ۱۰ انتخاب برتر</span>
                        </button>
                        <button type="button" class="btn btn-primary btn-open-builder" data-slot="${slot.slot_index}">
                            <span>ویرایش و سناریوساز</span>
                        </button>
                    </div>
                </div>

                <div class="slot-preview-wrapper" id="preview-drawer-${slot.slot_index}">
                    <div class="preview-table-container">
                        <table class="preview-table">
                            <thead>
                                <tr>
                                    <th>رتبه</th>
                                    <th>رشته تحصیلی</th>
                                    <th>دانشگاه / موسسه</th>
                                    <th>دوره</th>
                                    <th>امتیاز مدل</th>
                                </tr>
                            </thead>
                            <tbody>${previewRowsHtml}</tbody>
                        </table>
                        ${topChoices.length > 5 ? '<div class="preview-shading-mask"></div>' : ''}
                    </div>
                    <div class="preview-footer-action-bar">
                        <div class="preview-overflow-note">
                            <span>نمایش ۱۰ انتخاب نخست از میان ${toFa(totalChoices)} انتخاب</span>
                        </div>
                        <button type="button" class="btn btn-secondary btn-close-preview" data-slot="${slot.slot_index}">
                            بستن پیش‌نمایش
                        </button>
                    </div>
                </div>
            `;

            slotsContainer.appendChild(card);
        });

        attachSlotListeners();
    }

    function attachSlotListeners() {
        // Toggle Top 10 Preview
        document.querySelectorAll('.btn-toggle-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const card = document.getElementById(`slot-card-${slotIndex}`);
                const isOpen = card.classList.toggle('has-preview-open');
                btn.querySelector('.preview-btn-text').textContent = isOpen ? 'بستن پیش‌نمایش' : 'مشاهده ۱۰ انتخاب برتر';
            });
        });

        document.querySelectorAll('.btn-close-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const card = document.getElementById(`slot-card-${slotIndex}`);
                card.classList.remove('has-preview-open');
                const toggleBtn = card.querySelector('.btn-toggle-preview .preview-btn-text');
                if (toggleBtn) toggleBtn.textContent = 'مشاهده ۱۰ انتخاب برتر';
            });
        });

        // Open Builder (Stage 1-5 Wizard)
        document.querySelectorAll('.btn-open-builder').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const targetParam = targetStudentId ? `&student_id=${targetStudentId}` : '';
                window.location.href = `/dashboard/student/builder.html?slot=${slotIndex}${targetParam}`;
            });
        });

        // Clone Slot
        document.querySelectorAll('.btn-clone-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                try {
                    await apiFetch(`slots/${slotIndex}/clone`, { method: 'POST' });
                    showToast(`سناریو شماره ${toFa(slotIndex)} با موفقیت تکثیر شد`);
                    await loadSlots();
                } catch (e) {}
            });
        });

        // Delete Slot (Protected for Slot 1)
        document.querySelectorAll('.btn-delete-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                if (confirm(`آیا از حذف سناریو شماره ${toFa(slotIndex)} اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`)) {
                    try {
                        await apiFetch(`slots/${slotIndex}`, { method: 'DELETE' });
                        showToast(`سناریو شماره ${toFa(slotIndex)} حذف شد`);
                        await loadSlots();
                    } catch (e) {}
                }
            });
        });

        // Rename Slot
        document.querySelectorAll('.btn-rename-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                const currentSlot = currentSlots.find(s => String(s.slot_index) === String(slotIndex));
                const newTitle = prompt('عنوان جدید سناریو را وارد کنید:', currentSlot ? currentSlot.title : '');
                if (newTitle && newTitle.trim()) {
                    try {
                        await apiFetch(`slots/${slotIndex}`, {
                            method: 'PUT',
                            body: JSON.stringify({ title: newTitle.trim() })
                        });
                        showToast('عنوان سناریو بروزرسانی شد');
                        await loadSlots();
                    } catch (e) {}
                }
            });
        });
    }

    // Create New Slot Button: Redirect directly to the wizard selection page
    document.getElementById('btnCreateSlot').addEventListener('click', () => {
        if (currentSlots.length >= 20) {
            showToast('حداکثر سقف ۲۰ سناریوی مجاز تکمیل است.', 'error');
            return;
        }

        // Find the lowest available slot index (1 to 20)
        const usedIndices = currentSlots.map(s => Number(s.slot_index));
        let nextAvailableSlot = null;
        for (let i = 1; i <= 20; i++) {
            if (!usedIndices.includes(i)) {
                nextAvailableSlot = i;
                break;
            }
        }

        if (!nextAvailableSlot) {
            showToast('سقف ۲۰ سناریو تکمیل است.', 'error');
            return;
        }

        const targetParam = targetStudentId ? `&student_id=${targetStudentId}` : '';
        // Redirect to the 5-stage selection wizard without creating an empty database record
        window.location.href = `/dashboard/student/builder.html?slot=${nextAvailableSlot}&new=1${targetParam}`;
    });

    // --- 5. Form Submissions & Event Listeners ---

    // Save Profile Form
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('profileFullName').value.trim();
        const academic_year = document.getElementById('profileAcademicYear').value;
        const stream = document.querySelector('input[name="profileStream"]:checked')?.value;
        const gender = document.querySelector('input[name="profileGender"]:checked')?.value;

        try {
            await apiFetch('user/profile', {
                method: 'PUT',
                body: JSON.stringify({ full_name, academic_year, stream, gender })
            });
            showToast('مشخصات فردی با موفقیت بروزرسانی شد');
            currentUser.full_name = full_name;
            currentUser.academic_year = academic_year;
            currentUser.stream = stream;
            currentUser.gender = gender;
            populateProfileUI();
        } catch (e) {}
    });

    // Phone Change via OTP
    const phoneContainer = document.getElementById('phoneChangeContainer');
    document.getElementById('btnStartChangePhone').addEventListener('click', () => {
        phoneContainer.style.display = phoneContainer.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btnCancelPhoneChange').addEventListener('click', () => {
        phoneContainer.style.display = 'none';
    });

    document.getElementById('btnRequestPhoneOtp').addEventListener('click', async () => {
        const new_phone = document.getElementById('newPhoneInput').value.trim();
        try {
            const res = await apiFetch('user/phone/request-otp', {
                method: 'POST',
                body: JSON.stringify({ new_phone })
            });
            document.getElementById('otpCodeInput').disabled = false;
            document.getElementById('btnConfirmPhoneOtp').disabled = false;
            showToast(res.message);
            if (res.dev_code) {
                document.getElementById('otpCodeInput').value = res.dev_code;
            }
        } catch (e) {}
    });

    document.getElementById('btnConfirmPhoneOtp').addEventListener('click', async () => {
        const new_phone = document.getElementById('newPhoneInput').value.trim();
        const code = document.getElementById('otpCodeInput').value.trim();

        try {
            const res = await apiFetch('user/phone/verify', {
                method: 'POST',
                body: JSON.stringify({ new_phone, code })
            });
            currentUser.phone = res.phone;
            populateProfileUI();
            phoneContainer.style.display = 'none';
            showToast(res.message);
        } catch (e) {}
    });

    // Attach Institute via Invite Code
    document.getElementById('btnAttachInstitute').addEventListener('click', async () => {
        const invite_code = document.getElementById('inviteCodeInput').value.trim();
        if (!invite_code) {
            showToast('لطفاً کد دعوت را وارد نمایید', 'error');
            return;
        }

        try {
            const res = await apiFetch('user/institute/attach', {
                method: 'POST',
                body: JSON.stringify({ invite_code })
            });
            currentUser.institute_id = true;
            currentUser.institute_name = res.institute_name;
            populateProfileUI();
            showToast(res.message);
        } catch (e) {}
    });

    // Disconnect Institute
    document.getElementById('btnDisconnectInstitute').addEventListener('click', async () => {
        if (confirm('آیا از قطع ارتباط با این موسسه اطمینان دارید؟ دسترسی مشاور ناظر لغو خواهد شد.')) {
            try {
                const res = await apiFetch('user/institute/detach', { method: 'POST' });
                currentUser.institute_id = null;
                currentUser.institute_name = null;
                populateProfileUI();
                showToast(res.message);
            } catch (e) {}
        }
    });

    // Update Password Form
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const current_password = document.getElementById('currentPassword').value;
        const new_password = document.getElementById('newPassword').value;
        const confirm_password = document.getElementById('confirmPassword').value;

        if (new_password.length < 6) {
            showToast('کلمه عبور جدید باید حداقل ۶ نویسه باشد.', 'error');
            return;
        }
        if (new_password !== confirm_password) {
            showToast('تکرار کلمه عبور جدید مطابقت ندارد', 'error');
            return;
        }

        try {
            const res = await apiFetch('user/password', {
                method: 'POST',
                body: JSON.stringify({ current_password, new_password })
            });
            showToast(res.message);
            document.getElementById('passwordForm').reset();
        } catch (e) {}
    });

    // Forgot Password OTP Modal Flow
    const otpResetModal = document.getElementById('otpResetModal');
    document.getElementById('btnForgotPasswordOtp').addEventListener('click', async () => {
        try {
            const res = await apiFetch('user/password/reset-otp-request', { method: 'POST' });
            showToast(res.message);
            otpResetModal.style.display = 'flex';
            if (res.dev_code) {
                document.getElementById('resetOtpCodeInput').value = res.dev_code;
            }
        } catch (e) {}
    });

    document.getElementById('btnCancelResetModal').addEventListener('click', () => {
        otpResetModal.style.display = 'none';
    });

    document.getElementById('btnConfirmOtpPasswordReset').addEventListener('click', async () => {
        const code = document.getElementById('resetOtpCodeInput').value.trim();
        const new_password = document.getElementById('resetNewPasswordInput').value;

        if (new_password.length < 6) {
            showToast('کلمه عبور جدید باید حداقل ۶ نویسه باشد.', 'error');
            return;
        }

        try {
            const res = await apiFetch('user/password/reset-otp-verify', {
                method: 'POST',
                body: JSON.stringify({ code, new_password })
            });
            showToast(res.message);
            otpResetModal.style.display = 'none';
        } catch (e) {}
    });

    // --- 6. Tab Navigation Logic ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    function switchTab(targetPanelId) {
        tabButtons.forEach(btn => {
            const isTarget = btn.getAttribute('data-target') === targetPanelId;
            btn.classList.toggle('active', isTarget);
            btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        });

        tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === targetPanelId);
        });

        const hash = targetPanelId === 'panelSettings' ? '#settings' : '#slots';
        if (window.location.hash !== hash) history.replaceState(null, '', hash);
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-target')));
    });

    if (window.location.hash === '#settings') switchTab('panelSettings');
    else switchTab('panelSlots');

    // Toast notification utility
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // Initialize session
    await initSession();
});