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

            // Auto-reopen student slot inspection view directly
            const urlParams = new URLSearchParams(window.location.search);
            const inspectId = urlParams.get('student_id') || urlParams.get('inspect_student');
            if (inspectId) {
                switchTab('panelStudents');
                await openStudentInspection(inspectId);
            }
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

    function attachStudentInspectListeners() {
        document.querySelectorAll('.btn-inspect-student').forEach(btn => {
            btn.addEventListener('click', () => {
                const sId = btn.getAttribute('data-id');
                if (sId) openStudentInspection(sId);
            });
        });
    }

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

    // Return back from student inspection to directory list
    const btnBackToStudentsList = document.getElementById('btnBackToStudentsList');
    if (btnBackToStudentsList) {
        btnBackToStudentsList.addEventListener('click', () => {
            studentInspectionView.style.display = 'none';
            studentsListView.style.display = 'block';
            currentInspectedStudent = null;

            // Clear URL query parameters cleanly
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('student_id');
            cleanUrl.searchParams.delete('inspect_student');
            window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
        });
    }

    // --- 6. Live Student Slots Inspection (Identical to Student Dashboard) ---
    const studentsListView = document.getElementById('studentsListView');
    const studentInspectionView = document.getElementById('studentInspectionView');
    const inspectSlotsContainer = document.getElementById('inspectSlotsContainer');

    let currentInspectedStudent = null;
    let currentInspectedSlots = [];

    async function openStudentInspection(studentId) {
        if (!studentId) return;

        // 1. Resolve student info from cache or direct API
        let student = studentsList.find(s => String(s.id) === String(studentId));
        if (!student) {
            try {
                const checkData = await apiFetch(`slots/1?student_id=${studentId}`);
                if (checkData && checkData.student) {
                    student = checkData.student;
                }
            } catch (err) {
                console.warn('Direct student metadata fetch fallback failed:', err);
            }
        }

        if (!student) {
            student = {
                id: studentId,
                full_name: 'داوطلب انتخابی',
                stream: 'math',
                academic_year: '1405'
            };
        }

        currentInspectedStudent = student;

        const streamTitles = { math: 'ریاضی و فیزیک', experimental: 'علوم تجربی', humanities: 'علوم انسانی' };
        document.getElementById('inspectStudentName').textContent = student.full_name;
        document.getElementById('inspectStudentStream').textContent = streamTitles[student.stream] || student.stream;
        document.getElementById('inspectStudentYear').textContent = `کنکور ${toFa(student.academic_year || '1405')}`;

        // Switch to the inspection view immediately (one step back)
        studentsListView.style.display = 'none';
        studentInspectionView.style.display = 'block';
        inspectSlotsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">در حال بارگذاری چینش‌های داوطلب...</div>';

        try {
            const data = await apiFetch(`slots?student_id=${studentId}`);
            currentInspectedSlots = data?.slots || [];
            renderInspectedSlots();
        } catch (e) {
            inspectSlotsContainer.innerHTML = '<div style="color: var(--danger-700); padding: 20px; text-align: center;">خطا در دریافت چینش‌های داوطلب.</div>';
        }
    }

    function renderInspectedSlots() {
        inspectSlotsContainer.innerHTML = '';

        if (currentInspectedSlots.length === 0) {
            inspectSlotsContainer.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 40px;">
                    <p style="color: var(--text-muted); margin: 0;">این داوطلب هنوز هیچ چینشی ایجاد نکرده است.</p>
                </div>
            `;
            return;
        }

        const streamTitles = {
            math: { text: 'ریاضی و فیزیک', class: 'slot-stream-math' },
            experimental: { text: 'علوم تجربی', class: 'slot-stream-experimental' },
            humanities: { text: 'علوم انسانی', class: 'slot-stream-humanities' }
        };

        currentInspectedSlots.forEach(slot => {
            let choices = [];
            try {
                choices = typeof slot.custom_ordering_json === 'string'
                    ? JSON.parse(slot.custom_ordering_json || '[]')
                    : (slot.custom_ordering_json || []);
            } catch (e) {
                choices = [];
            }

            const totalChoices = choices.length;
            const streamInfo = streamTitles[slot.stream] || { text: 'ریاضی و فیزیک', class: 'slot-stream-math' };

            const card = document.createElement('div');
            card.className = 'slot-card';
            card.id = `inspect-slot-${slot.slot_index}`;
            card.dataset.slotIndex = slot.slot_index;

            card.innerHTML = `
                <div class="slot-card-header">
                    <div class="slot-badge-title">
                        <div class="slot-number-chip">${toFa(slot.slot_index)}</div>
                        <div class="slot-meta">
                            <div class="slot-title-row">
                                <h3 class="slot-title">${slot.title || `چینش شماره ${toFa(slot.slot_index)}`}</h3>
                                <span class="slot-stream-tag ${streamInfo.class}">${streamInfo.text}</span>
                            </div>
                            <div class="slot-sub-info">
                                <span>آخرین ویرایش: ${timeAgo(slot.updated_at)}</span>
                                <span>•</span>
                                <span>تعداد کل انتخاب‌ها: <strong>${toFa(totalChoices)}</strong> رشته‌محل</span>
                            </div>
                        </div>
                    </div>
                    <div class="slot-card-controls">
                        <div class="controls-row-top">
                            <button type="button" class="btn btn-secondary btn-icon-only btn-rename-slot" data-slot="${slot.slot_index}" title="تغییر نام">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            </button>
                            <button type="button" class="btn btn-secondary btn-icon-only btn-clone-slot" data-slot="${slot.slot_index}" title="تکثیر چینش">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            <button type="button" class="btn btn-danger-outline btn-icon-only btn-delete-slot" data-slot="${slot.slot_index}" title="حذف چینش">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                            <button type="button" class="btn btn-secondary btn-toggle-preview" data-slot="${slot.slot_index}">
                                <span class="preview-btn-text">پیش‌نمایش جدول</span>
                            </button>
                        </div>
                        <div class="controls-row-bottom">
                            <button type="button" class="btn btn-secondary btn-edit-manual" data-slot="${slot.slot_index}" title="ویرایش مستقیم جدول اولویت‌ها">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                <span>ویرایش دستی (گام ۵)</span>
                            </button>
                            <button type="button" class="btn btn-primary btn-open-builder" data-slot="${slot.slot_index}">
                                <span>سناریوساز کامل</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="slot-preview-wrapper" id="inspect-drawer-${slot.slot_index}">
                    <div class="preview-toolbar">
                        <div class="preview-search-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" class="preview-search-field" placeholder="جستجو در این سناریو (رشته، دانشگاه، استان یا کد ۵ رقمی)..." data-slot="${slot.slot_index}">
                        </div>
                        <div class="btn-group-export">
                            <button type="button" class="btn btn-secondary btn-sm btn-export-excel" data-slot="${slot.slot_index}">خروجی اکسل (.xlsx)</button>
                            <button type="button" class="btn btn-secondary btn-sm btn-export-pdf" data-slot="${slot.slot_index}">خروجی PDF چاپی</button>
                        </div>
                    </div>

                    <div class="preview-scroll-viewport">
                        <table class="preview-table">
                            <thead>
                                <tr>
                                    <th style="width: 44px; text-align: center;">ردیف</th>
                                    <th style="width: 72px; text-align: center;">کد رشته</th>
                                    <th>عنوان رشته تحصیلی</th>
                                    <th>دانشگاه و استان</th>
                                    <th style="width: 70px; text-align: center;">دوره</th>
                                    <th style="width: 58px; text-align: center;">نیمسال</th>
                                    <th style="width: 78px; text-align: center;">پذیرش</th>
                                </tr>
                            </thead>
                            <tbody id="inspect-tbody-${slot.slot_index}">
                                <!-- Populated dynamically -->
                            </tbody>
                        </table>
                    </div>
                    <div class="preview-footer-action-bar">
                        <div class="preview-overflow-note">
                            <span id="inspect-counter-${slot.slot_index}">نمایش ${toFa(totalChoices)} انتخاب</span>
                        </div>
                        <button type="button" class="btn btn-secondary btn-close-preview" data-slot="${slot.slot_index}">
                            بستن پیش‌نمایش
                        </button>
                    </div>
                </div>
            `;

            inspectSlotsContainer.appendChild(card);
            renderInspectTbody(slot.slot_index, choices, '');
        });

        attachInspectSlotListeners();
    }

    function renderInspectTbody(slotIndex, allChoices, filterQuery = '') {
        const tbody = document.getElementById(`inspect-tbody-${slotIndex}`);
        const counter = document.getElementById(`inspect-counter-${slotIndex}`);
        if (!tbody) return;

        const q = filterQuery.trim().toLowerCase();
        const filtered = allChoices.filter(item => {
            if (!q) return true;
            return (item.major || '').toLowerCase().includes(q) ||
                (item.uni || '').toLowerCase().includes(q) ||
                String(item.code || '').includes(q) ||
                (item.province || '').toLowerCase().includes(q);
        });

        if (counter) {
            counter.textContent = q
                ? `یافت شده: ${toFa(filtered.length)} از میان ${toFa(allChoices.length)} انتخاب`
                : `نمایش ${toFa(allChoices.length)} انتخاب`;
        }

        tbody.innerHTML = '';

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
                        ${allChoices.length === 0 ? 'هنوز انتخابی برای این سناریو ثبت نشده است.' : 'هیچ انتخابی مطابق با عبارت جستجو یافت نشد.'}
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach((item, idx) => {
            const rank = item.rank || (idx + 1);
            const major = item.major || 'نامشخص';
            const uni = item.uni || 'دانشگاه سراسری';
            const prov = item.province ? ` • ${item.province}` : '';
            const regime = item.regime || 'روزانه';
            const code = String(item.code || '');

            let regimeClass = 'regime-day';
            if (regime.includes('دوم') || regime.includes('شبانه')) regimeClass = 'regime-night';
            if (regime.includes('پردیس') || regime.includes('خودگردان')) regimeClass = 'regime-campus';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="preview-rank" style="text-align: center;">${toFa(rank)}</td>
                <td style="text-align: center;">
                    <span class="matrix-code-chip" data-code="${code}" title="کلیک برای کپی کد رشته">${toFa(code)}</span>
                </td>
                <td><strong>${major}</strong></td>
                <td>${uni}${prov}</td>
                <td style="text-align: center;"><span class="regime-pill ${regimeClass}">${regime}</span></td>
                <td style="text-align: center;">
                    <span class="matrix-term-badge ${item.isBahman ? 'term-bahman' : 'term-mehr'}">${item.isBahman ? 'بهمن' : 'مهر'}</span>
                </td>
                <td style="text-align: center;">
                    <span class="matrix-admission-badge ${item.byExam !== false ? 'admission-exam' : 'admission-records'}">
                        ${item.byExam !== false ? 'با آزمون' : 'سوابق'}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.matrix-code-chip').forEach(chip => {
            chip.addEventListener('click', async () => {
                const c = chip.dataset.code;
                if (!c) return;
                try {
                    await navigator.clipboard.writeText(c);
                    chip.classList.add('copied');
                    chip.textContent = 'کپی شد ✓';
                    setTimeout(() => {
                        chip.classList.remove('copied');
                        chip.textContent = toFa(c);
                    }, 1200);
                } catch (e) {}
            });
        });
    }

    function attachInspectSlotListeners() {
        if (!currentInspectedStudent) return;
        const studentId = currentInspectedStudent.id;

        // Toggle Preview
        document.querySelectorAll('.btn-toggle-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const card = document.getElementById(`inspect-slot-${slotIndex}`);
                const isOpen = card.classList.toggle('has-preview-open');
                btn.querySelector('.preview-btn-text').textContent = isOpen ? 'بستن پیش‌نمایش' : 'پیش‌نمایش جدول';
            });
        });

        document.querySelectorAll('.btn-close-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const card = document.getElementById(`inspect-slot-${slotIndex}`);
                card.classList.remove('has-preview-open');
                const toggleBtn = card.querySelector('.btn-toggle-preview .preview-btn-text');
                if (toggleBtn) toggleBtn.textContent = 'پیش‌نمایش جدول';
            });
        });

        // Search within preview table
        document.querySelectorAll('.preview-search-field').forEach(input => {
            input.addEventListener('input', (e) => {
                const slotIndex = e.target.dataset.slot;
                const slot = currentInspectedSlots.find(s => String(s.slot_index) === String(slotIndex));
                if (!slot) return;
                let choices = [];
                try {
                    choices = typeof slot.custom_ordering_json === 'string'
                        ? JSON.parse(slot.custom_ordering_json || '[]')
                        : (slot.custom_ordering_json || []);
                } catch (err) {}
                renderInspectTbody(slotIndex, choices, e.target.value);
            });
        });

        // Manual Edit: Direct jump to Step 5
        document.querySelectorAll('.btn-edit-manual').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                window.location.href = `/dashboard/student/builder/?slot=${slotIndex}&student_id=${studentId}&step=5`;
            });
        });

        // Open Builder: Standard 5-step flow
        document.querySelectorAll('.btn-open-builder').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                window.location.href = `/dashboard/student/builder/?slot=${slotIndex}&student_id=${studentId}&step=1`;
            });
        });

        // Clone Slot
        document.querySelectorAll('.btn-clone-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                try {
                    await apiFetch(`slots/${slotIndex}/clone?student_id=${studentId}`, { method: 'POST' });
                    showToast(`چینش شماره ${toFa(slotIndex)} با موفقیت تکثیر شد.`);
                    await openStudentInspection(studentId);
                } catch (e) {}
            });
        });

        // Delete Slot
        document.querySelectorAll('.btn-delete-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                if (confirm(`آیا از حذف چینش شماره ${toFa(slotIndex)} داوطلب اطمینان دارید؟`)) {
                    try {
                        await apiFetch(`slots/${slotIndex}?student_id=${studentId}`, { method: 'DELETE' });
                        showToast(`چینش شماره ${toFa(slotIndex)} حذف شد.`);
                        await openStudentInspection(studentId);
                    } catch (e) {}
                }
            });
        });

        // Rename Slot
        document.querySelectorAll('.btn-rename-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                const currentSlot = currentInspectedSlots.find(s => String(s.slot_index) === String(slotIndex));
                const newTitle = prompt('عنوان جدید چینش را وارد کنید:', currentSlot ? currentSlot.title : '');
                if (newTitle && newTitle.trim()) {
                    try {
                        await apiFetch(`slots/${slotIndex}?student_id=${studentId}`, {
                            method: 'PUT',
                            body: JSON.stringify({ title: newTitle.trim() })
                        });
                        showToast('عنوان چینش با موفقیت به‌روزرسانی شد.');
                        await openStudentInspection(studentId);
                    } catch (e) {}
                }
            });
        });

        // Export Excel
        document.querySelectorAll('.btn-export-excel').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const slot = currentInspectedSlots.find(s => String(s.slot_index) === String(slotIndex));
                if (slot) exportSlotToExcel(slot, currentInspectedStudent);
            });
        });

        // Export PDF
        document.querySelectorAll('.btn-export-pdf').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const slot = currentInspectedSlots.find(s => String(s.slot_index) === String(slotIndex));
                if (slot) exportSlotToPdf(slot, currentInspectedStudent);
            });
        });
    }

    // Counselor Create New Slot Trigger
    const btnCounselorCreateSlot = document.getElementById('btnCounselorCreateSlot');
    if (btnCounselorCreateSlot) {
        btnCounselorCreateSlot.addEventListener('click', () => {
            if (!currentInspectedStudent) return;
            if (currentInspectedSlots.length >= 20) {
                showToast('حداکثر سقف ۲۰ سناریوی مجاز تکمیل است.', 'error');
                return;
            }

            const usedIndices = currentInspectedSlots.map(s => Number(s.slot_index));
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

            window.location.href = `/dashboard/student/builder/?slot=${nextAvailableSlot}&new=1&step=1&student_id=${currentInspectedStudent.id}`;
        });
    }

    // --- Standalone Exports Engine for Counselor View ---
    async function exportSlotToExcel(slot, student) {
        let choices = [];
        try {
            choices = typeof slot.custom_ordering_json === 'string'
                ? JSON.parse(slot.custom_ordering_json || '[]')
                : (slot.custom_ordering_json || []);
        } catch (e) {}

        if (choices.length === 0) {
            showToast('این سناریو فاقد کدرشته‌های انتخابی برای دریافت فایل اکسل است.', 'error');
            return;
        }

        if (typeof ExcelJS === 'undefined') {
            showToast('کتابخانه اکسل هنوز بارگذاری نشده است.', 'error');
            return;
        }

        showToast('در حال آماده‌سازی فایل اکسل...');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'سامانه رستا (OptiMajor)';
        const sheetTitle = (slot.title || `چینش ${slot.slot_index}`).slice(0, 31);
        const ws = workbook.addWorksheet(sheetTitle, { views: [{ rightToLeft: true, showGridLines: true }] });

        const streamTitles = { math: 'ریاضی و فیزیک', experimental: 'علوم تجربی', humanities: 'علوم انسانی' };
        const jalaliDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

        ws.mergeCells('A1:H1');
        const r1 = ws.getCell('A1');
        r1.value = `سامانه رستا | ${slot.title || `چینش ${slot.slot_index}`} (داوطلب: ${student.full_name})`;
        r1.font = { name: 'Vazirmatn', family: 2, size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
        r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2FE' } };
        r1.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(1).height = 28;

        ws.mergeCells('A2:H2');
        const r2 = ws.getCell('A2');
        r2.value = `داوطلب: ${student.full_name} • گروه: ${streamTitles[slot.stream] || slot.stream} • تعداد انتخاب‌ها: ${choices.length} • تاریخ: ${jalaliDate}`;
        r2.font = { name: 'Vazirmatn', family: 2, size: 9, color: { argb: 'FF475569' } };
        r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2FE' } };
        r2.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(2).height = 20;

        const headers = ['ردیف', 'کد رشته', 'عنوان رشته تحصیلی', 'دانشگاه', 'استان', 'دوره', 'نیمسال', 'شیوه پذیرش'];
        const hRow = ws.getRow(4);
        hRow.height = 26;
        headers.forEach((h, idx) => {
            const cell = hRow.getCell(idx + 1);
            cell.value = h;
            cell.font = { name: 'Vazirmatn', family: 2, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        choices.forEach((it, idx) => {
            const row = ws.getRow(idx + 5);
            row.height = 20;
            const vals = [
                it.rank || idx + 1,
                parseInt(toEn(it.code), 10) || 0,
                it.major || '',
                it.uni || '',
                it.province || '',
                it.regime || '',
                it.isBahman ? 'بهمن' : 'مهر',
                it.byExam !== false ? 'با آزمون' : 'سوابق'
            ];
            vals.forEach((v, cIdx) => {
                const cell = row.getCell(cIdx + 1);
                cell.value = v;
                cell.font = { name: 'Vazirmatn', family: 2, size: 9 };
                cell.alignment = { vertical: 'middle', horizontal: (cIdx === 2 || cIdx === 3) ? 'right' : 'center' };
                if (cIdx === 1) cell.numFmt = '00000';
            });
        });

        ws.columns = [
            { width: 8 }, { width: 14 }, { width: 34 }, { width: 32 },
            { width: 16 }, { width: 16 }, { width: 12 }, { width: 16 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const studentName = (student && student.full_name) ? student.full_name : 'داوطلب';
        const safeName = `${studentName}-${slot.title || 'scenario'}`.replace(/[\\/:*?"<>|]/g, '_');
        a.download = `${safeName}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('فایل اکسل با موفقیت دانلود شد.');
    }

    function exportSlotToPdf(slot, student) {
        const studentName = (student && student.full_name) ? student.full_name : 'داوطلب';

        let choices = [];
        try {
            choices = typeof slot.custom_ordering_json === 'string'
                ? JSON.parse(slot.custom_ordering_json || '[]')
                : (slot.custom_ordering_json || []);
        } catch (e) {}

        if (choices.length === 0) {
            showToast('این سناریو فاقد کدرشته‌های انتخابی برای دریافت نسخه چاپی است.', 'error');
            return;
        }

        const streamTitles = { math: 'ریاضی و فیزیک', experimental: 'علوم تجربی', humanities: 'علوم انسانی' };
        const jalaliDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

        const rowsHtml = choices.map((item, idx) => `
            <tr>
                <td style="text-align: center; font-weight: 700; color: #1e40af;">${toFa(item.rank || idx + 1)}</td>
                <td style="text-align: center;"><span style="font-family: inherit; font-weight: 700;">${toFa(item.code)}</span></td>
                <td><strong>${item.major || ''}</strong></td>
                <td>${item.uni || ''}</td>
                <td style="text-align: center;">${item.province || ''}</td>
                <td style="text-align: center;">${item.regime || ''}</td>
                <td style="text-align: center;">${item.isBahman ? 'بهمن' : 'مهر'}</td>
                <td style="text-align: center;">${item.byExam !== false ? 'با آزمون' : 'سوابق'}</td>
            </tr>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html lang="fa" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>${studentName} - ${slot.title || 'گزارش چیدمان رستا'}</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css">
                <style>
                    @page { size: A4 portrait; margin: 10mm; }
                    body { font-family: 'Vazirmatn', sans-serif; font-size: 8pt; direction: rtl; margin: 0; color: #0f172a; }
                    .header { border: 1.5px solid #1e40af; background: #eff6ff; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
                    table { width: 100%; border-collapse: collapse; }
                    th { background: #1e40af; color: #ffffff; padding: 6px 4px; font-size: 7.6pt; border: 1px solid #1e3a8a; }
                    td { padding: 4px; border: 1px solid #e2e8f0; font-size: 7.2pt; }
                    tr:nth-child(even) { background: #f8fafc; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <strong style="font-size: 10pt; color: #1e3a8a;">سامانه رستا | ${slot.title || `چینش ${slot.slot_index}`} (داوطلب: ${studentName})</strong>
                        <div style="font-size: 7.5pt; color: #64748b;">گزارش رسمی اولویت‌های داوطلب تحت نظارت آموزشگاه</div>
                    </div>
                    <div style="font-size: 7.5pt; text-align: left;">
                        <span>گروه: <strong>${streamTitles[slot.stream] || slot.stream}</strong></span> |
                        <span>انتخاب‌ها: <strong>${toFa(choices.length)}</strong></span> |
                        <span>تاریخ: <strong>${jalaliDate}</strong></span>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>ردیف</th><th>کد رشته</th><th>عنوان رشته تحصیلی</th><th>دانشگاه</th><th>استان</th><th>دوره</th><th>نیمسال</th><th>پذیرش</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </body>
            </html>
        `;

        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        document.body.appendChild(frame);

        const doc = frame.contentDocument || frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
            frame.contentWindow.focus();
            frame.contentWindow.print();
            setTimeout(() => document.body.removeChild(frame), 2000);
        }, 500);
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