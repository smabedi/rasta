/**
 * Rasta Student Dashboard Frontend Controller
 * Authenticated API Integration with SQLite/PHP Backend
 * Fully Connected with Step 5 Matrix Engine & Standalone Exports
 */

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. Utilities & Token Resolution ---
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

        document.getElementById('profileFullName').value = currentUser.full_name;
        document.getElementById('profilePhone').value = toFa(currentUser.phone);
        document.getElementById('profileAcademicYear').value = currentUser.academic_year || '1405';

        const streamRadio = document.querySelector(`input[name="profileStream"][value="${currentUser.stream}"]`);
        if (streamRadio) streamRadio.checked = true;

        const genderRadio = document.querySelector(`input[name="profileGender"][value="${currentUser.gender}"]`);
        if (genderRadio) genderRadio.checked = true;

        const headerUserName = document.getElementById('userNavName');
        if (headerUserName) headerUserName.textContent = currentUser.full_name;
        const headerRoleTag = document.getElementById('userRoleTag');
        if (headerRoleTag) headerRoleTag.textContent = 'داوطلب';
        const loginBtn = document.getElementById('authActionBtn');
        if (loginBtn) loginBtn.style.display = 'none';
        const userNavTrigger = document.getElementById('userNavTrigger');
        if (userNavTrigger) userNavTrigger.style.display = 'flex';
    }

    // --- 4. Slots Management & Matrix Rendering ---
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

        const streamTitles = {
            math: { text: 'ریاضی و فیزیک', class: 'slot-stream-math' },
            experimental: { text: 'علوم تجربی', class: 'slot-stream-experimental' },
            humanities: { text: 'علوم انسانی', class: 'slot-stream-humanities' }
        };

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
            const streamInfo = streamTitles[slot.stream] || { text: 'ریاضی و فیزیک', class: 'slot-stream-math' };

            const card = document.createElement('div');
            card.className = 'slot-card';
            card.id = `slot-card-${slot.slot_index}`;
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

                <div class="slot-preview-wrapper" id="preview-drawer-${slot.slot_index}">
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
                            <tbody id="preview-tbody-${slot.slot_index}">
                                <!-- Rows injected by renderPreviewTbody -->
                            </tbody>
                        </table>
                    </div>
                    <div class="preview-footer-action-bar">
                        <div class="preview-overflow-note">
                            <span id="preview-counter-${slot.slot_index}">نمایش ${toFa(totalChoices)} انتخاب</span>
                        </div>
                        <button type="button" class="btn btn-secondary btn-close-preview" data-slot="${slot.slot_index}">
                            بستن پیش‌نمایش
                        </button>
                    </div>
                </div>
            `;

            slotsContainer.appendChild(card);
            renderPreviewTbody(slot.slot_index, choices, '');
        });

        attachSlotListeners();
    }

    function renderPreviewTbody(slotIndex, allChoices, filterQuery = '') {
        const tbody = document.getElementById(`preview-tbody-${slotIndex}`);
        const counter = document.getElementById(`preview-counter-${slotIndex}`);
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

        // Click-to-copy handler on chips
        tbody.querySelectorAll('.matrix-code-chip').forEach(chip => {
            chip.addEventListener('click', async () => {
                const c = chip.dataset.code;
                if (!c) return;
                try {
                    await navigator.clipboard.writeText(c);
                    chip.classList.add('copied');
                    chip.textContent = 'کپی شد';
                    setTimeout(() => {
                        chip.classList.remove('copied');
                        chip.textContent = toFa(c);
                    }, 1200);
                } catch (e) {}
            });
        });
    }

    function attachSlotListeners() {
        // Toggle Preview
        document.querySelectorAll('.btn-toggle-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const card = document.getElementById(`slot-card-${slotIndex}`);
                const isOpen = card.classList.toggle('has-preview-open');
                btn.querySelector('.preview-btn-text').textContent = isOpen ? 'بستن پیش‌نمایش' : 'پیش‌نمایش جدول';
            });
        });

        document.querySelectorAll('.btn-close-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const card = document.getElementById(`slot-card-${slotIndex}`);
                card.classList.remove('has-preview-open');
                const toggleBtn = card.querySelector('.btn-toggle-preview .preview-btn-text');
                if (toggleBtn) toggleBtn.textContent = 'پیش‌نمایش جدول';
            });
        });

        // Search within preview table
        document.querySelectorAll('.preview-search-field').forEach(input => {
            input.addEventListener('input', (e) => {
                const slotIndex = e.target.dataset.slot;
                const slot = currentSlots.find(s => String(s.slot_index) === String(slotIndex));
                if (!slot) return;
                let choices = [];
                try {
                    choices = typeof slot.custom_ordering_json === 'string'
                        ? JSON.parse(slot.custom_ordering_json || '[]')
                        : (slot.custom_ordering_json || []);
                } catch (err) {}
                renderPreviewTbody(slotIndex, choices, e.target.value);
            });
        });

        // Manual Edit: Direct jump to Step 5
        document.querySelectorAll('.btn-edit-manual').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const targetParam = targetStudentId ? `&student_id=${targetStudentId}` : '';
                window.location.href = `/dashboard/student/builder/?slot=${slotIndex}&step=5${targetParam}`;
            });
        });

        // Open Builder: Standard 5-step flow
        document.querySelectorAll('.btn-open-builder').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const targetParam = targetStudentId ? `&student_id=${targetStudentId}` : '';
                window.location.href = `/dashboard/student/builder/?slot=${slotIndex}&step=1${targetParam}`;
            });
        });

        // Clone Slot
        document.querySelectorAll('.btn-clone-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                try {
                    await apiFetch(`slots/${slotIndex}/clone`, { method: 'POST' });
                    showToast(`چینش شماره ${toFa(slotIndex)} با موفقیت تکثیر شد`);
                    await loadSlots();
                } catch (e) {}
            });
        });

        // Delete Slot
        document.querySelectorAll('.btn-delete-slot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slotIndex = btn.getAttribute('data-slot');
                if (confirm(`آیا از حذف چینش شماره ${toFa(slotIndex)} اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`)) {
                    try {
                        await apiFetch(`slots/${slotIndex}`, { method: 'DELETE' });
                        showToast(`چینش شماره ${toFa(slotIndex)} حذف شد`);
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
                const newTitle = prompt('عنوان جدید چینش را وارد کنید:', currentSlot ? currentSlot.title : '');
                if (newTitle && newTitle.trim()) {
                    try {
                        await apiFetch(`slots/${slotIndex}`, {
                            method: 'PUT',
                            body: JSON.stringify({ title: newTitle.trim() })
                        });
                        showToast('عنوان چینش بروزرسانی شد');
                        await loadSlots();
                    } catch (e) {}
                }
            });
        });

        // Export Excel on Slot Card
        document.querySelectorAll('.btn-export-excel').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const slot = currentSlots.find(s => String(s.slot_index) === String(slotIndex));
                if (slot) exportSlotToExcel(slot);
            });
        });

        // Export PDF on Slot Card
        document.querySelectorAll('.btn-export-pdf').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIndex = btn.getAttribute('data-slot');
                const slot = currentSlots.find(s => String(s.slot_index) === String(slotIndex));
                if (slot) exportSlotToPdf(slot);
            });
        });
    }

    // --- 5. Standalone Exports Engine for Dashboard Cards ---
    async function exportSlotToExcel(slot) {
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
        r1.value = `سامانه رستا | ${slot.title || `چینش ${slot.slot_index}`}`;
        r1.font = { name: 'Vazirmatn', family: 2, size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
        r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2FE' } };
        r1.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(1).height = 28;

        ws.mergeCells('A2:H2');
        const r2 = ws.getCell('A2');
        r2.value = `گروه: ${streamTitles[slot.stream] || slot.stream} • تعداد انتخاب‌ها: ${choices.length} • تاریخ گزارش: ${jalaliDate}`;
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
        a.download = `${(slot.title || 'rasta-scenario').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('فایل اکسل با موفقیت دانلود شد.');
    }

    function exportSlotToPdf(slot) {
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
                <title>${slot.title || 'گزارش چیدمان رستا'}</title>
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
                        <strong style="font-size: 10pt; color: #1e3a8a;">سامانه رستا | ${slot.title || `چینش ${slot.slot_index}`}</strong>
                        <div style="font-size: 7.5pt; color: #64748b;">گزارش رسمی اولویت‌های داوطلب</div>
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

    // Create New Slot Button: Redirect directly to builder
    document.getElementById('btnCreateSlot').addEventListener('click', () => {
        if (currentSlots.length >= 20) {
            showToast('حداکثر سقف ۲۰ سناریوی مجاز تکمیل است.', 'error');
            return;
        }

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
        window.location.href = `/dashboard/student/builder/?slot=${nextAvailableSlot}&new=1&step=1${targetParam}`;
    });

    // --- 6. Form Submissions & Event Listeners ---
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

    // --- 7. Tab Navigation Logic ---
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

    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
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

    await initSession();
});