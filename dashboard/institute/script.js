/**
 * Rasta Institute & Counselor Dashboard Frontend Controller
 * Authenticated REST Engine with Live Backend Synchronization
 */

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. Utilities, Tokens & Native Persian Jalali Converter ---
    const toFa = (n) => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const toEn = (n) => String(n ?? '')
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

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

    function toJalaliDate(dateStr) {
        if (!dateStr) return 'به تازگی';
        try {
            const d = new Date(dateStr.replace(' ', 'T') + 'Z');
            return new Intl.DateTimeFormat('fa-IR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(d);
        } catch (e) {
            return toFa(dateStr);
        }
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

    // --- 2. State Holders ---
    let currentUser = null;
    let instituteDetails = null;
    let studentsList = [];
    let coworkersList = [];

    // --- 3. Session Initialization ---
    async function initSession() {
        try {
            const authData = await apiFetch('auth/me');
            if (!authData || !authData.user) return;
            currentUser = authData.user;

            if (currentUser.role !== 'institute' && currentUser.role !== 'admin') {
                showToast('دسترسی غیرمجاز؛ این پنل مختص مشاوران و مراکز آموزشی است.', 'error');
                setTimeout(() => window.location.href = '/dashboard/student/', 1200);
                return;
            }

            await loadInstituteDetails();
            await loadStudents();
            await loadCoworkers();
        } catch (e) {
            console.error('Institute session initialization failed:', e);
        }
    }

    // --- 4. Load Institute Profile & Synchronize UI ---
    async function loadInstituteDetails() {
        const data = await apiFetch('institute/details');
        if (!data || !data.institute) return;
        instituteDetails = data.institute;
        renderSummary();
    }

    function renderSummary() {
        document.getElementById('sidebarCounselorName').textContent = currentUser.full_name;
        document.getElementById('sidebarAvatar').textContent = currentUser.full_name.substring(0, 2);
        document.getElementById('sidebarInstituteBadge').textContent = instituteDetails.name;
        const rawInviteCode = toEn(instituteDetails.invite_code);
        const sidebarTextEl = document.getElementById('sidebarInviteCodeText') || document.getElementById('sidebarInviteCode');
        sidebarTextEl.textContent = rawInviteCode;
        document.getElementById('sidebarInviteCode').setAttribute('data-code', rawInviteCode);

        document.getElementById('instituteInviteCodeDisplay').textContent = rawInviteCode;

        document.getElementById('studentCountPill').textContent = toFa(studentsList.length);
        document.getElementById('coworkerCountPill').textContent = toFa(coworkersList.length);

        // Settings View Form
        document.getElementById('instituteNameInput').value = instituteDetails.name || '';
        document.getElementById('instituteLandlineInput').value = instituteDetails.contact_phone || '';
        document.getElementById('instituteCityInput').value = instituteDetails.city || 'تهران';

        // Counselor View Form
        document.getElementById('counselorFullName').value = currentUser.full_name;
        document.getElementById('counselorPhone').value = toFa(currentUser.phone);

        updateAcceptanceToggleUI();
    }

    function updateAcceptanceToggleUI() {
        const btnToggleAcceptance = document.getElementById('btnToggleAcceptance');
        const acceptanceStatusLabel = document.getElementById('acceptanceStatusLabel');
        const acceptanceStatusHint = document.getElementById('acceptanceStatusHint');

        const isActive = Boolean(Number(instituteDetails.accepts_new_students));
        if (isActive) {
            btnToggleAcceptance.className = 'btn-status-toggle active';
            acceptanceStatusLabel.textContent = 'پذیرش داوطلب جدید: فعال';
            acceptanceStatusHint.textContent = 'داوطلبان می‌توانند با وارد کردن کد معرف متصل شوند.';
        } else {
            btnToggleAcceptance.className = 'btn-status-toggle inactive';
            acceptanceStatusLabel.textContent = 'پذیرش داوطلب جدید: غیرفعال';
            acceptanceStatusHint.textContent = 'پذیرش داوطلبان جدید موقتاً مسدود است؛ ثبت‌نام با این کد انجام نمی‌شود.';
        }
    }

    // --- 5. Students Management & Search/Filter ---
    async function loadStudents() {
        const filterYearVal = document.getElementById('filterYear').value;
        const query = filterYearVal && filterYearVal !== 'all' ? `?academic_year=${filterYearVal}` : '';
        const data = await apiFetch(`institute/students${query}`);
        if (!data) return;

        studentsList = data.students || [];
        document.getElementById('studentCountPill').textContent = toFa(studentsList.length);
        renderStudentsTable();
    }

    function renderStudentsTable() {
        const tbody = document.getElementById('studentsTableBody');
        const searchInput = document.getElementById('studentSearchInput');
        const query = searchInput.value.trim().toLowerCase();
        const selectedStream = document.getElementById('filterStream').value;

        const filtered = studentsList.filter(std => {
            const matchesQuery = (std.full_name || '').toLowerCase().includes(query) || (std.phone || '').includes(query);
            const matchesStream = (selectedStream === 'all') || (std.stream === selectedStream);
            return matchesQuery && matchesStream;
        });

        tbody.innerHTML = '';

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        داوطلبی با معیارهای مشخص‌شده یافت نشد.
                    </td>
                </tr>
            `;
            return;
        }

        const streamTitles = {
            math: { text: 'ریاضی و فیزیک', class: 'stream-math' },
            experimental: { text: 'علوم تجربی', class: 'stream-experimental' },
            humanities: { text: 'علوم انسانی', class: 'stream-humanities' }
        };

        filtered.forEach((std, idx) => {
            const tr = document.createElement('tr');
            const streamInfo = streamTitles[std.stream] || { text: 'نامشخص', class: 'stream-math' };
            const subDateFa = toJalaliDate(std.created_at);

            tr.innerHTML = `
                <td style="font-weight: 700; color: var(--primary-700);">${toFa(idx + 1)}</td>
                <td>
                    <strong>${std.full_name}</strong>
                    <div style="font-size: 0.74rem; color: var(--text-muted);">عضویت: ${subDateFa}</div>
                </td>
                <td>
                    <span class="copyable-phone" data-phone="${std.phone}" title="کلیک جهت کپی شماره همراه">
                        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>${toFa(std.phone)}</span>
                    </span>
                </td>
                <td><span class="stream-pill ${streamInfo.class}">${streamInfo.text}</span></td>
                <td>کنکور ${toFa(std.academic_year || '1405')}</td>
                <td><span class="chinresh-count-tag">${toFa(std.slot_count || 0)} از ۲۰ چینش</span></td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button type="button" class="btn btn-secondary btn-sm btn-inspect-student" data-id="${std.id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>مشاهده چینش‌ها</span>
                        </button>
                        <button type="button" class="btn btn-danger-outline btn-sm btn-remove-student" data-id="${std.id}" data-name="${std.full_name}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            <span>حذف</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        attachStudentInspectListeners();
        attachStudentRemoveListeners();
    }

    document.getElementById('studentSearchInput').addEventListener('input', renderStudentsTable);
    document.getElementById('filterStream').addEventListener('change', renderStudentsTable);
    document.getElementById('filterYear').addEventListener('change', loadStudents);

    function attachStudentRemoveListeners() {
        document.querySelectorAll('.btn-remove-student').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sId = btn.getAttribute('data-id');
                const sName = btn.getAttribute('data-name');
                if (confirm(`آیا از حذف داوطلب «${sName}» از آموزشگاه اطمینان دارید؟ ارتباط داوطلب قطع خواهد شد.`)) {
                    try {
                        await apiFetch(`institute/students/${sId}`, { method: 'DELETE' });
                        showToast(`داوطلب «${sName}» با موفقیت از آموزشگاه حذف گردید.`);
                        await loadStudents();
                    } catch (e) {}
                }
            });
        });
    }

    // --- 6. Live Student Slots Inspection ---
    const studentsListView = document.getElementById('studentsListView');
    const studentInspectionView = document.getElementById('studentInspectionView');
    const inspectSlotsContainer = document.getElementById('inspectSlotsContainer');

    async function openStudentInspection(studentId) {
        const student = studentsList.find(s => String(s.id) === String(studentId));
        if (!student) return;

        const streamTitles = { math: 'ریاضی و فیزیک', experimental: 'علوم تجربی', humanities: 'علوم انسانی' };
        document.getElementById('inspectStudentName').textContent = student.full_name;
        document.getElementById('inspectStudentStream').textContent = streamTitles[student.stream] || student.stream;
        document.getElementById('inspectStudentYear').textContent = `کنکور ${toFa(student.academic_year || '1405')}`;

        inspectSlotsContainer.innerHTML = '<div style="text-align: center; padding: 40px;">در حال بارگذاری چینش‌های داوطلب...</div>';
        studentsListView.style.display = 'none';
        studentInspectionView.style.display = 'block';

        try {
            const data = await apiFetch(`slots?student_id=${studentId}`);
            const slots = data?.slots || [];
            inspectSlotsContainer.innerHTML = '';

            if (slots.length === 0) {
                inspectSlotsContainer.innerHTML = `
                    <div class="settings-card" style="text-align: center; padding: 40px;">
                        <p style="color: var(--text-muted); margin: 0;">این داوطلب هنوز هیچ چینشی ایجاد نکرده است.</p>
                    </div>
                `;
                return;
            }

            slots.forEach(slot => {
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
                        if (regime.includes('پردیس') || regime.includes('خودگردان')) regimeClass = 'regime-campus';

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
                            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
                                هنوز انتخابی برای این چینش ثبت نشده است.
                            </td>
                        </tr>
                    `;
                }

                const card = document.createElement('div');
                card.className = 'slot-card';
                card.id = `inspect-slot-${slot.slot_index}`;

                card.innerHTML = `
                    <div class="slot-card-header">
                        <div class="slot-badge-title">
                            <div class="slot-number-chip">${toFa(slot.slot_index)}</div>
                            <div class="slot-meta">
                                <h3 class="slot-title">${slot.title || `چینش شماره ${toFa(slot.slot_index)}`}</h3>
                                <div class="slot-sub-info">
                                    <span>آخرین ویرایش: ${timeAgo(slot.updated_at)}</span>
                                    <span>•</span>
                                    <span>تعداد کل انتخاب‌ها: ${toFa(totalChoices)} رشته‌محل</span>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn btn-secondary btn-inspect-preview-toggle" data-slot="${slot.slot_index}">
                                <span class="btn-text">مشاهده ۱۰ انتخاب برتر</span>
                            </button>
                            <button type="button" class="btn btn-primary btn-inspect-builder" data-student="${student.id}" data-slot="${slot.slot_index}">
                                <span>ورود به سناریوساز / ویرایش چینش</span>
                            </button>
                        </div>
                    </div>

                    <div class="slot-preview-wrapper" id="inspect-drawer-${slot.slot_index}">
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
                            <span style="font-size: 0.82rem; color: var(--text-muted);">نمایش ۱۰ انتخاب نخست از میان ${toFa(totalChoices)} انتخاب</span>
                            <button type="button" class="btn btn-secondary btn-inspect-preview-close" data-slot="${slot.slot_index}">بستن</button>
                        </div>
                    </div>
                `;

                inspectSlotsContainer.appendChild(card);
            });

            attachSlotInspectionCardListeners();
        } catch (e) {
            inspectSlotsContainer.innerHTML = '<div style="color: var(--danger-700); padding: 20px;">خطا در دریافت چینش‌های داوطلب.</div>';
        }
    }

    function attachStudentInspectListeners() {
        document.querySelectorAll('.btn-inspect-student').forEach(btn => {
            btn.addEventListener('click', () => {
                const sId = btn.getAttribute('data-id');
                openStudentInspection(sId);
            });
        });
    }

    document.getElementById('btnBackToStudentsList').addEventListener('click', () => {
        studentInspectionView.style.display = 'none';
        studentsListView.style.display = 'block';
    });

    function attachSlotInspectionCardListeners() {
        document.querySelectorAll('.btn-inspect-preview-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const sIdx = btn.getAttribute('data-slot');
                const card = document.getElementById(`inspect-slot-${sIdx}`);
                const isOpen = card.classList.toggle('has-preview-open');
                btn.querySelector('.btn-text').textContent = isOpen ? 'بستن پیش‌نمایش' : 'مشاهده ۱۰ انتخاب برتر';
            });
        });

        document.querySelectorAll('.btn-inspect-preview-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const sIdx = btn.getAttribute('data-slot');
                const card = document.getElementById(`inspect-slot-${sIdx}`);
                card.classList.remove('has-preview-open');
                const toggleBtn = card.querySelector('.btn-inspect-preview-toggle .btn-text');
                if (toggleBtn) toggleBtn.textContent = 'مشاهده ۱۰ انتخاب برتر';
            });
        });

        document.querySelectorAll('.btn-inspect-builder').forEach(btn => {
            btn.addEventListener('click', () => {
                const sId = btn.getAttribute('data-student');
                const slot = btn.getAttribute('data-slot');
                window.location.href = `/dashboard/student/builder.html?slot=${slot}&student_id=${sId}`;
            });
        });
    }

    // --- 7. Coworkers Team & Removal Flow ---
    async function loadCoworkers() {
        const data = await apiFetch('institute/coworkers');
        if (!data) return;

        coworkersList = data.coworkers || [];
        document.getElementById('coworkerCountPill').textContent = toFa(coworkersList.length);
        renderCoworkersTable();
    }

    function renderCoworkersTable() {
        const tbody = document.getElementById('coworkersTableBody');
        tbody.innerHTML = '';

        coworkersList.forEach((c, idx) => {
            const tr = document.createElement('tr');
            const isSelf = String(c.id) === String(currentUser.id);
            const joinDate = toJalaliDate(c.created_at);

            tr.innerHTML = `
                <td style="font-weight: 700; color: var(--primary-700);">${toFa(idx + 1)}</td>
                <td>
                    <strong>${c.full_name}</strong> 
                    ${isSelf ? '<span style="font-size:0.75rem; color:var(--primary-600);">(شما)</span>' : ''}
                </td>
                <td>
                    <span class="copyable-phone" data-phone="${c.phone}" title="کلیک جهت کپی شماره همراه">
                        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>${toFa(c.phone)}</span>
                    </span>
                </td>
                <td>مشاور کادر آموزشی</td>
                <td>${joinDate}</td>
                <td>
                    ${!isSelf ? `
                        <button type="button" class="btn btn-danger-outline btn-sm btn-remove-coworker" data-id="${c.id}" data-name="${c.full_name}">
                            حذف از آموزشگاه
                        </button>
                    ` : '<span style="color:var(--text-muted); font-size:0.80rem;">حساب جاری</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-remove-coworker').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (confirm(`آیا از حذف «${name}» از کادر مشاوره این آموزشگاه اطمینان دارید؟`)) {
                    try {
                        await apiFetch(`institute/coworkers/${id}`, { method: 'DELETE' });
                        showToast(`مشاور «${name}» با موفقیت از آموزشگاه حذف شد.`);
                        await loadCoworkers();
                    } catch (e) {}
                }
            });
        });
    }

    // Modal: 24h Link vs. SMS
    const inviteModal = document.getElementById('inviteCoworkerModal');
    const tabModeLink = document.getElementById('tabModeLink');
    const tabModeSms = document.getElementById('tabModeSms');
    const inviteModeLink = document.getElementById('inviteModeLink');
    const inviteModeSms = document.getElementById('inviteModeSms');
    const btnGenerateInviteLink = document.getElementById('btnGenerateInviteLink');
    const generatedLinkWrapper = document.getElementById('generatedLinkWrapper');
    const generatedLinkInput = document.getElementById('generatedLinkInput');
    const btnCopyGeneratedLink = document.getElementById('btnCopyGeneratedLink');

    document.getElementById('btnOpenInviteModal').addEventListener('click', () => {
        inviteModal.style.display = 'flex';
        tabModeLink.click();
    });

    document.getElementById('btnCloseInviteLinkModal').addEventListener('click', () => {
        inviteModal.style.display = 'none';
    });

    document.getElementById('btnCancelInviteSms').addEventListener('click', () => {
        inviteModal.style.display = 'none';
    });

    tabModeLink.addEventListener('click', () => {
        tabModeLink.classList.add('active');
        tabModeSms.classList.remove('active');
        inviteModeLink.style.display = 'block';
        inviteModeSms.style.display = 'none';
    });

    tabModeSms.addEventListener('click', () => {
        tabModeSms.classList.add('active');
        tabModeLink.classList.remove('active');
        inviteModeSms.style.display = 'block';
        inviteModeLink.style.display = 'none';
    });

    btnGenerateInviteLink.addEventListener('click', async () => {
        try {
            const res = await apiFetch('institute/coworkers/invite-link', { method: 'POST' });
            generatedLinkInput.value = res.invite_url;
            generatedLinkWrapper.style.display = 'block';
            showToast('لینک یک‌بارمصرف ۲۴ ساعته با موفقیت ایجاد گردید.');
        } catch (e) {}
    });

    btnCopyGeneratedLink.addEventListener('click', () => {
        navigator.clipboard.writeText(generatedLinkInput.value).then(() => {
            showToast('لینک دعوت یک‌بارمصرف در کلیپ‌بورد کپی شد.');
        });
    });

    document.getElementById('inviteCoworkerSmsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('coworkerPhoneInput').value.trim();
        const full_name = document.getElementById('coworkerFullNameInput').value.trim();

        if (phone.length < 11 || !phone.startsWith('09')) {
            showToast('شماره تلفن همراه معتبر ۱۱ رقمی وارد نمایید.', 'error');
            return;
        }

        try {
            const res = await apiFetch('institute/coworkers/invite-sms', {
                method: 'POST',
                body: JSON.stringify({ phone, full_name })
            });
            showToast(res.message);
            inviteModal.style.display = 'none';
            document.getElementById('inviteCoworkerSmsForm').reset();
            await loadCoworkers();
        } catch (e) {}
    });

    // --- 8. Institute Code & Acceptance Toggle Actions ---
    document.getElementById('btnCopyInviteCode').addEventListener('click', () => {
        if (!instituteDetails) return;
        navigator.clipboard.writeText(instituteDetails.invite_code).then(() => {
            showToast('کد اختصاصی آموزشگاه کپی شد.');
        });
    });

    document.getElementById('btnRegenerateInviteCode').addEventListener('click', async () => {
        if (confirm('آیا از ابطال کد معرف فعلی و صدور کد جدید اطمینان دارید؟ داوطلبان جدید تنها با کد جدید قادر به پیوند خواهند بود.')) {
            try {
                const res = await apiFetch('institute/regenerate-code', { method: 'POST' });
                const cleanCode = toEn(res.invite_code);
                instituteDetails.invite_code = cleanCode;
                renderSummary();
                showToast(`کد معرف جدید (${cleanCode}) با موفقیت صادر گردید.`);
            } catch (e) {}
        }
    });

    document.getElementById('btnToggleAcceptance').addEventListener('click', async () => {
        const nextState = !Boolean(Number(instituteDetails.accepts_new_students));
        try {
            await apiFetch('institute/details', {
                method: 'PUT',
                body: JSON.stringify({ accepts_new_students: nextState ? 1 : 0 })
            });
            instituteDetails.accepts_new_students = nextState ? 1 : 0;
            updateAcceptanceToggleUI();
            showToast(nextState ? 'پذیرش داوطلبان جدید برای آموزشگاه فعال گردید.' : 'پذیرش داوطلبان جدید غیرفعال شد.');
        } catch (e) {}
    });

    document.getElementById('instituteProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('instituteNameInput').value.trim();
        const contact_phone = document.getElementById('instituteLandlineInput').value.trim();
        const city = document.getElementById('instituteCityInput').value.trim();

        if (!name || !contact_phone) {
            showToast('نام و شماره تماس آموزشگاه الزامی است.', 'error');
            return;
        }

        try {
            await apiFetch('institute/details', {
                method: 'PUT',
                body: JSON.stringify({ name, contact_phone, city })
            });
            instituteDetails.name = name;
            instituteDetails.contact_phone = contact_phone;
            instituteDetails.city = city;
            renderSummary();
            showToast('مشخصات رسمی آموزشگاه با موفقیت ذخیره گردید.');
        } catch (e) {}
    });

    // --- 9. Counselor Phone Change (Matches Student Dashboard) ---
    const phoneChangeContainer = document.getElementById('phoneChangeContainer');
    const newPhoneInput = document.getElementById('newPhoneInput');
    const otpCodeInput = document.getElementById('otpCodeInput');
    const btnRequestPhoneOtp = document.getElementById('btnRequestPhoneOtp');
    const btnConfirmPhoneOtp = document.getElementById('btnConfirmPhoneOtp');

    document.getElementById('btnStartChangePhone').addEventListener('click', () => {
        phoneChangeContainer.style.display = phoneChangeContainer.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btnCancelPhoneChange').addEventListener('click', () => {
        phoneChangeContainer.style.display = 'none';
        newPhoneInput.value = '';
        otpCodeInput.value = '';
        otpCodeInput.disabled = true;
        btnConfirmPhoneOtp.disabled = true;
    });

    btnRequestPhoneOtp.addEventListener('click', async () => {
        const new_phone = newPhoneInput.value.trim();
        try {
            const res = await apiFetch('user/phone/request-otp', {
                method: 'POST',
                body: JSON.stringify({ new_phone })
            });
            otpCodeInput.disabled = false;
            btnConfirmPhoneOtp.disabled = false;
            showToast(res.message);
            if (res.dev_code) {
                otpCodeInput.value = res.dev_code;
            }
        } catch (e) {}
    });

    btnConfirmPhoneOtp.addEventListener('click', async () => {
        const new_phone = newPhoneInput.value.trim();
        const code = otpCodeInput.value.trim();

        try {
            const res = await apiFetch('user/phone/verify', {
                method: 'POST',
                body: JSON.stringify({ new_phone, code })
            });
            currentUser.phone = res.phone;
            document.getElementById('counselorPhone').value = toFa(res.phone);
            phoneChangeContainer.style.display = 'none';
            newPhoneInput.value = '';
            otpCodeInput.value = '';
            otpCodeInput.disabled = true;
            btnConfirmPhoneOtp.disabled = true;
            showToast(res.message);
            await loadCoworkers();
        } catch (e) {}
    });

    // Counselor Profile Form Submit
    document.getElementById('counselorProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('counselorFullName').value.trim();
        if (!full_name) {
            showToast('نام و نام خانوادگی الزامی است.', 'error');
            return;
        }

        try {
            const res = await apiFetch('user/profile', {
                method: 'PUT',
                body: JSON.stringify({ full_name })
            });
            currentUser.full_name = full_name;
            renderSummary();
            await loadCoworkers();
            showToast(res.message);
        } catch (e) {}
    });

    // --- 10. Password Change & Forgot Password Modal ---
    document.getElementById('counselorPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const current_password = document.getElementById('counselorCurrentPass').value;
        const new_password = document.getElementById('counselorNewPass').value;
        const confirm_password = document.getElementById('counselorConfirmPass').value;

        if (new_password !== confirm_password) {
            showToast('تکرار کلمه عبور مطابقت ندارد.', 'error');
            return;
        }

        try {
            const res = await apiFetch('user/password', {
                method: 'POST',
                body: JSON.stringify({ current_password, new_password })
            });
            showToast(res.message);
            document.getElementById('counselorPasswordForm').reset();
        } catch (e) {}
    });

    const otpResetModal = document.getElementById('otpResetModal');
    const resetOtpCodeInput = document.getElementById('resetOtpCodeInput');
    const resetNewPasswordInput = document.getElementById('resetNewPasswordInput');

    document.getElementById('btnCounselorForgotPass').addEventListener('click', async () => {
        try {
            const res = await apiFetch('user/password/reset-otp-request', { method: 'POST' });
            showToast(res.message);
            otpResetModal.style.display = 'flex';
            if (res.dev_code) {
                resetOtpCodeInput.value = res.dev_code;
            }
        } catch (e) {}
    });

    document.getElementById('btnCancelResetModal').addEventListener('click', () => {
        otpResetModal.style.display = 'none';
        resetOtpCodeInput.value = '';
        resetNewPasswordInput.value = '';
    });

    document.getElementById('btnConfirmOtpPasswordReset').addEventListener('click', async () => {
        const code = resetOtpCodeInput.value.trim();
        const new_password = resetNewPasswordInput.value;

        try {
            const res = await apiFetch('user/password/reset-otp-verify', {
                method: 'POST',
                body: JSON.stringify({ code, new_password })
            });
            showToast(res.message);
            otpResetModal.style.display = 'none';
            resetOtpCodeInput.value = '';
            resetNewPasswordInput.value = '';
        } catch (e) {}
    });

    // --- 11. Tab Switching Architecture ---
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

        const hash = targetPanelId.replace('panel', '#').toLowerCase();
        if (window.location.hash !== hash) {
            history.replaceState(null, '', hash);
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-target')));
    });

    const hashToTab = {
        '#students': 'panelStudents',
        '#coworkers': 'panelCoworkers',
        '#institute': 'panelInstitute',
        '#myaccount': 'panelMyAccount'
    };
    if (hashToTab[window.location.hash]) {
        switchTab(hashToTab[window.location.hash]);
    } else {
        switchTab('panelStudents');
    }

    // --- 12. Global Delegated Click-to-Copy for Phone Numbers & Invite Code ---
    document.addEventListener('click', (e) => {
        // 1. Sidebar Invite Code
        const codeTarget = e.target.closest('.copyable-code');
        if (codeTarget) {
            const rawCode = toEn(codeTarget.getAttribute('data-code') || instituteDetails?.invite_code || '');
            if (rawCode) {
                navigator.clipboard.writeText(rawCode).then(() => {
                    showToast(`کد معرف آموزشگاه (${rawCode}) در کلیپ‌بورد کپی شد.`);
                }).catch(() => {
                    const temp = document.createElement('input');
                    temp.value = rawCode;
                    document.body.appendChild(temp);
                    temp.select();
                    document.execCommand('copy');
                    document.body.removeChild(temp);
                    showToast(`کد معرف آموزشگاه (${rawCode}) در کلیپ‌بورد کپی شد.`);
                });
            }
            return;
        }

        // 2. Phone Numbers
        const copyTarget = e.target.closest('.copyable-phone');
        if (!copyTarget) return;

        const rawPhone = copyTarget.getAttribute('data-phone');
        if (!rawPhone) return;

        navigator.clipboard.writeText(rawPhone).then(() => {
            showToast(`شماره ${toFa(rawPhone)} در کلیپ‌بورد کپی شد.`);
        }).catch(() => {
            const tempInput = document.createElement('input');
            tempInput.value = rawPhone;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            showToast(`شماره ${toFa(rawPhone)} در کلیپ‌بورد کپی شد.`);
        });
    });

    // --- 13. Toast Notification Engine ---
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

    // Boot Session
    await initSession();
});