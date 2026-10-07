/**
 * Rasta Major Ranking Wizard - Engine Controller (Full 5-Step MCDM Engine)
 * Manages:
 * - Step 1: Admission Regimes (/data/{stream}/admission-regimes.json)
 * - Step 2: Provinces (/data/{stream}/provinces.json)
 * - Step 3: Universities (/data/{stream}/universities.json)
 * - Step 4: Majors (/data/{stream}/majors.json)
 * - Step 5: 300-Choice Matrix Engine (/data/{stream}/pairs.json & Cobb-Douglas MCDM)
 * - Backend: REST Persistence, LocalStorage Caching & Optimistic Concurrency Polling
 */

document.addEventListener('DOMContentLoaded', () => {
    const toFa = (n) => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const toEn = (n) => String(n ?? '')
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

    // --- 1. Master Catalogs (Strictly JSON-driven, No fallbacks) ---
    let regimeMasterCatalog = [];
    let provincesMasterCatalog = [];
    let universitiesMasterCatalog = [];
    let majorsMasterCatalog = [];
    let pairsMasterCatalog = [];

    // Catalog Load Error Tracking
    const catalogErrors = {
        regimes: false,
        provinces: false,
        universities: false,
        majors: false,
        pairs: false
    };

    // Helper: Prepopulate active items from loaded catalog
    function seedInitialActive(catalog, count = 3) {
        if (!Array.isArray(catalog) || catalog.length === 0) return [];
        return catalog.slice(0, count).map((item, idx) => ({
            id: item.id,
            title: item.title,
            desc: item.desc || '',
            score: Math.max(1, 10 - idx)
        }));
    }

    // --- 2. Wizard State ---
    const wizardState = {
        currentStep: 1,
        slotIndex: 1,
        slotTitle: "",
        stream: "math",
        gender: "female",
        lambda_term: 1.0,
        lambda_records: "exam_only",
        activeRegimes: [],
        activeProvinces: [],
        provinceSearchQuery: "",
        activeUniversities: [],
        uniSearchQuery: "",
        activeMajors: [],
        majorSearchQuery: "",
        weights: {
            alpha: 0.50,
            beta: 0.30,
            gamma: 0.20
        },
        version: 1,
        customOrdering: null,
        isLockedByOther: false,
        lockedByName: null,
        slotExistsOnServer: false
    };

    // Matrix Engine State
    let currentMatrixItems = [];
    let isMatrixDirty = false;

    // URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('slot')) {
        wizardState.slotIndex = parseInt(urlParams.get('slot'), 10) || 1;
    }
    const targetStudentId = urlParams.get('student_id');
    const isNew = urlParams.get('new') === '1';
    wizardState.slotExistsOnServer = !isNew;
    wizardState.slotTitle = `چینش شماره ${toFa(wizardState.slotIndex)}`;

    const cacheKey = `rasta_wizard_draft_slot_${wizardState.slotIndex}${targetStudentId ? '_' + targetStudentId : ''}`;

    // Clean stale cache immediately if creating a brand-new slot
    if (isNew) {
        try { localStorage.removeItem(cacheKey); } catch (e) {}
    }

    let candidateProfile = null;

    // --- 3. Async Fetch for JSON Catalogs (Stream-Specific) ---
    async function fetchJsonStrict(url, label) {
        let res = await fetch(url).catch(() => null);

        // Fallback for local testing if leading slash fails
        if (!res || !res.ok) {
            const relUrl = url.startsWith('/') ? url.slice(1) : url;
            res = await fetch(relUrl).catch(() => null);
        }

        if (!res || !res.ok) {
            console.error(`خطا در بارگذاری ${label} از: ${url}`);
            return null;
        }

        const data = await res.json().catch(() => null);
        if (!Array.isArray(data)) {
            console.error(`فرمت داده ${label} نامعتبر است.`);
            return null;
        }

        return data.map(item => ({
            id: String(item.id || item.code || item.title),
            title: String(item.title || item.name || item.major || item.id),
            desc: String(item.desc || item.university || ''),
            ...item
        }));
    }

    async function loadRegimesData(stream) {
        const targetStream = stream || wizardState.stream;
        let data = await fetchJsonStrict(`/data/${targetStream}/admission-regimes.json`, 'دوره‌های تحصیلی');
        if (!data) {
            data = await fetchJsonStrict(`/data/${targetStream}/addmission-regimes.json`, 'دوره‌های تحصیلی');
        }

        if (data && data.length > 0) {
            regimeMasterCatalog = data;
            catalogErrors.regimes = false;
            if ((isNew && wizardState.activeRegimes.length === 0) || wizardState.activeRegimes.length === 0) {
                wizardState.activeRegimes = seedInitialActive(regimeMasterCatalog, 1);
            }
        } else {
            regimeMasterCatalog = [];
            catalogErrors.regimes = true;
            wizardState.activeRegimes = [];
        }
        if (typeof regimeArena !== 'undefined') regimeArena.render();
    }

    async function loadProvincesData(stream) {
        const targetStream = stream || wizardState.stream;
        const data = await fetchJsonStrict(`/data/${targetStream}/provinces.json`, 'استان‌ها');
        if (data) {
            provincesMasterCatalog = data;
            catalogErrors.provinces = false;
            if ((isNew && wizardState.activeProvinces.length === 0) || wizardState.activeProvinces.length === 0) {
                wizardState.activeProvinces = seedInitialActive(provincesMasterCatalog, 3);
            }
        } else {
            provincesMasterCatalog = [];
            catalogErrors.provinces = true;
            wizardState.activeProvinces = [];
        }
        if (typeof provincesArena !== 'undefined') provincesArena.render();
    }

    async function loadUniversitiesData(stream) {
        const targetStream = stream || wizardState.stream;
        const data = await fetchJsonStrict(`/data/${targetStream}/universities.json`, 'دانشگاه‌ها');
        if (data) {
            universitiesMasterCatalog = data;
            catalogErrors.universities = false;
            if ((isNew && wizardState.activeUniversities.length === 0) || wizardState.activeUniversities.length === 0) {
                wizardState.activeUniversities = seedInitialActive(universitiesMasterCatalog, 3);
            }
        } else {
            universitiesMasterCatalog = [];
            catalogErrors.universities = true;
            wizardState.activeUniversities = [];
        }
        if (typeof universitiesArena !== 'undefined') universitiesArena.render();
    }

    async function loadMajorsData(stream) {
        const targetStream = stream || wizardState.stream;
        const data = await fetchJsonStrict(`/data/${targetStream}/majors.json`, 'رشته‌های تحصیلی');
        if (data) {
            majorsMasterCatalog = data;
            catalogErrors.majors = false;
            if ((isNew && wizardState.activeMajors.length === 0) || wizardState.activeMajors.length === 0) {
                wizardState.activeMajors = seedInitialActive(majorsMasterCatalog, 3);
            } else {
                // Re-hydrate existing active items to repair any duplicate/poisoned titles
                wizardState.activeMajors = wizardState.activeMajors.map(activeItem => {
                    const match = majorsMasterCatalog.find(catItem => String(catItem.id) === String(activeItem.id));
                    return match
                        ? { ...activeItem, title: match.title, desc: match.desc }
                        : activeItem;
                });
            }
        } else {
            majorsMasterCatalog = [];
            catalogErrors.majors = true;
            wizardState.activeMajors = [];
        }
        if (typeof majorsArena !== 'undefined') majorsArena.render();
    }

    async function loadPairsData(stream) {
        const targetStream = stream || wizardState.stream;
        const data = await fetchJsonStrict(`/data/${targetStream}/pairs.json`, 'بانک ترکیبات رشته‌محل‌ها');

        if (data && Array.isArray(data) && data.length > 0) {
            pairsMasterCatalog = data;
            catalogErrors.pairs = false;
        } else {
            pairsMasterCatalog = [];
            catalogErrors.pairs = true;
            currentMatrixItems = [];
            console.error(`خطا در بارگذاری کاتالوگ رشته‌محل‌ها: /data/${targetStream}/pairs.json یافت نشد یا خالی است.`);
        }
    }

    // --- 4. API Client & Local Cache Handlers ---
    function getToken() {
        return localStorage.getItem('rasta_token') || localStorage.getItem('rasta_admin_token') || '';
    }

    async function apiFetch(endpoint, options = {}) {
        const token = getToken();
        if (!token) return null;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        };

        try {
            const res = await fetch(`/api/${endpoint}`, { credentials: 'same-origin', ...options, headers });
            if (res.status === 401) {
                window.location.href = '/';
                return null;
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { _error: true, status: res.status, ...data };
            }
            return data;
        } catch (err) {
            console.error('API Fetch Exception:', err);
            return null;
        }
    }

    function saveToLocalCache() {
        try {
            const payload = {
                slotIndex: wizardState.slotIndex,
                slotTitle: wizardState.slotTitle,
                version: wizardState.version,
                stream: wizardState.stream,
                gender: wizardState.gender,
                lambda_term: wizardState.lambda_term,
                lambda_records: wizardState.lambda_records,
                weights: wizardState.weights,
                activeRegimes: wizardState.activeRegimes,
                activeProvinces: wizardState.activeProvinces,
                activeUniversities: wizardState.activeUniversities,
                activeMajors: wizardState.activeMajors,
                customOrdering: wizardState.customOrdering || currentMatrixItems,
                cachedAt: Date.now()
            };
            localStorage.setItem(cacheKey, JSON.stringify(payload));
        } catch (e) {
            console.warn('LocalStorage draft write failed:', e);
        }
    }

    function loadFromLocalCache() {
        try {
            const raw = localStorage.getItem(cacheKey);
            if (!raw) return false;
            const draft = JSON.parse(raw);
            if (draft && draft.slotIndex === wizardState.slotIndex) {
                wizardState.slotTitle = draft.slotTitle || wizardState.slotTitle;
                wizardState.stream = draft.stream || wizardState.stream;
                wizardState.gender = draft.gender || wizardState.gender;
                wizardState.lambda_term = draft.lambda_term ?? wizardState.lambda_term;
                wizardState.lambda_records = draft.lambda_records || wizardState.lambda_records;
                wizardState.weights = draft.weights || wizardState.weights;
                wizardState.activeRegimes = draft.activeRegimes || [];
                wizardState.activeProvinces = draft.activeProvinces || [];
                wizardState.activeUniversities = draft.activeUniversities || [];
                wizardState.activeMajors = draft.activeMajors || [];
                wizardState.customOrdering = draft.customOrdering || null;
                wizardState.version = draft.version || wizardState.version;
                return true;
            }
        } catch (e) {
            console.warn('LocalStorage draft read failed:', e);
        }
        return false;
    }

    // --- 5. Header, Profile & Navigation Dock Init ---
    function initHeaderAndProfile() {
        document.getElementById('wizardSlotIndexChip').textContent = `چینش شماره ${toFa(wizardState.slotIndex)}`;
        const titleEl = document.getElementById('wizardSlotTitle');
        titleEl.textContent = wizardState.slotTitle;

        titleEl.addEventListener('blur', () => {
            let clean = titleEl.textContent.trim();
            if (!clean) {
                clean = `چینش شماره ${toFa(wizardState.slotIndex)}`;
                titleEl.textContent = clean;
            }
            wizardState.slotTitle = clean;
            triggerAutoSync();
        });

        // Context-aware Back Link (Direct return to student's slot cards inspection)
        const exitLink = document.querySelector('.btn-back-dashboard');
        if (exitLink) {
            if (targetStudentId) {
                exitLink.href = `/dashboard/institute/?student_id=${targetStudentId}#students`;
                const label = exitLink.querySelector('span');
                if (label) label.textContent = 'چینش‌های داوطلب';
                exitLink.title = 'بازگشت به کارت‌های چینش این داوطلب در میز کار مشاور';
            } else {
                exitLink.href = '/dashboard/student/#slots';
            }
        }

        const streamRadio = document.querySelector(`input[name="paramStream"][value="${wizardState.stream}"]`);
        if (streamRadio) streamRadio.checked = true;

        document.querySelectorAll('input[name="paramStream"]').forEach(r => {
            r.addEventListener('change', async (e) => {
                const newStream = e.target.value;
                if (newStream !== wizardState.stream) {
                    wizardState.stream = newStream;

                    // Flush all active lists to re-seed from the new stream catalog
                    wizardState.activeRegimes = [];
                    wizardState.activeProvinces = [];
                    wizardState.activeUniversities = [];
                    wizardState.activeMajors = [];
                    wizardState.customOrdering = null;

                    await Promise.all([
                        loadRegimesData(newStream),
                        loadProvincesData(newStream),
                        loadUniversitiesData(newStream),
                        loadMajorsData(newStream),
                        loadPairsData(newStream)
                    ]);

                    triggerAutoSync();
                    validateCurrentStep();
                    showToast(`گروه آزمایشی به «${e.target.closest('.selection-radio-card').querySelector('.box-title').textContent}» تغییر یافت و پایگاه‌ها بروزرسانی شدند.`);
                }
            });
        });

        const genderRadio = document.querySelector(`input[name="paramGender"][value="${wizardState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
        document.querySelectorAll('input[name="paramGender"]').forEach(r => {
            r.addEventListener('change', (e) => {
                wizardState.gender = e.target.value;
                markMatrixDirty();
                triggerAutoSync();
            });
        });

        const termRadio = document.querySelector(`input[name="paramLambdaTerm"][value="${wizardState.lambda_term}"]`);
        if (termRadio) {
            termRadio.checked = true;
            document.querySelectorAll('#semesterOptionsContainer .semester-radio-card').forEach(c => {
                c.classList.toggle('active', c.querySelector('input').checked);
            });
        }
        document.querySelectorAll('input[name="paramLambdaTerm"]').forEach(r => {
            r.addEventListener('change', (e) => {
                wizardState.lambda_term = parseFloat(e.target.value);
                document.querySelectorAll('#semesterOptionsContainer .semester-radio-card').forEach(card => {
                    card.classList.toggle('active', card.querySelector('input').checked);
                });
                markMatrixDirty();
                triggerAutoSync();
            });
        });

        const recordsRadio = document.querySelector(`input[name="paramLambdaRecords"][value="${wizardState.lambda_records}"]`);
        if (recordsRadio) {
            recordsRadio.checked = true;
            document.querySelectorAll('#admissionOptionsContainer .semester-radio-card').forEach(c => {
                c.classList.toggle('active', c.querySelector('input').checked);
            });
        }

        document.querySelectorAll('input[name="paramLambdaRecords"]').forEach(r => {
            r.addEventListener('change', (e) => {
                wizardState.lambda_records = e.target.value;
                document.querySelectorAll('#admissionOptionsContainer .semester-radio-card').forEach(card => {
                    card.classList.toggle('active', card.querySelector('input').checked);
                });
                markMatrixDirty();
                triggerAutoSync();
            });
        });
    }

    // --- 6. Tri-Coefficient Priority Engine (Sliders & Ternary Simplex) ---
    const sliderWeightAlpha = document.getElementById('sliderWeightAlpha');
    const sliderWeightBeta = document.getElementById('sliderWeightBeta');
    const sliderWeightGamma = document.getElementById('sliderWeightGamma');
    const dispWeightAlpha = document.getElementById('dispWeightAlpha');
    const dispWeightBeta = document.getElementById('dispWeightBeta');
    const dispWeightGamma = document.getElementById('dispWeightGamma');

    const ternarySvg = document.getElementById('ternary-svg');
    const ternaryPuck = document.getElementById('ternaryPuck');

    const V1 = { x: 160, y: 28 };   // Major (Top)
    const V2 = { x: 292, y: 235 };  // University (Bottom-Right)
    const V3 = { x: 28, y: 235 };   // Province (Bottom-Left)

    function syncSliderFill(slider) {
        if (!slider) return;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const fillPct = max > min ? ((val - min) / (max - min)) * 100 : 0;
        slider.style.setProperty('--fill', `${fillPct}%`);
    }

    function setTriWeights(newAlpha, newBeta, newGamma, source = null) {
        const total = newAlpha + newBeta + newGamma;
        wizardState.weights.alpha = Math.round((newAlpha / total) * 100) / 100;
        wizardState.weights.beta = Math.round((newBeta / total) * 100) / 100;
        wizardState.weights.gamma = Math.max(0, Math.round((1 - (wizardState.weights.alpha + wizardState.weights.beta)) * 100) / 100);

        const pctA = Math.round(wizardState.weights.alpha * 100);
        const pctB = Math.round(wizardState.weights.beta * 100);
        const pctG = Math.round(wizardState.weights.gamma * 100);

        if (dispWeightAlpha) dispWeightAlpha.textContent = `${toFa(pctA)}٪`;
        if (dispWeightBeta) dispWeightBeta.textContent = `${toFa(pctB)}٪`;
        if (dispWeightGamma) dispWeightGamma.textContent = `${toFa(pctG)}٪`;

        if (source !== 'slider') {
            if (sliderWeightAlpha) sliderWeightAlpha.value = pctA;
            if (sliderWeightBeta) sliderWeightBeta.value = pctB;
            if (sliderWeightGamma) sliderWeightGamma.value = pctG;
        }

        syncSliderFill(sliderWeightAlpha);
        syncSliderFill(sliderWeightBeta);
        syncSliderFill(sliderWeightGamma);

        if (source !== 'triangle' && ternaryPuck) {
            const px = wizardState.weights.alpha * V1.x + wizardState.weights.beta * V2.x + wizardState.weights.gamma * V3.x;
            const py = wizardState.weights.alpha * V1.y + wizardState.weights.beta * V2.y + wizardState.weights.gamma * V3.y;
            ternaryPuck.setAttribute('cx', px.toString());
            ternaryPuck.setAttribute('cy', py.toString());
        }

        if (source) {
            markMatrixDirty();
            triggerAutoSync();
        }
    }

    function initTriWeightsModule() {
        if (!sliderWeightAlpha || !ternarySvg) return;

        function handleSliderSync(e) {
            if (e && e.target) {
                syncSliderFill(e.target);
            }
            const rawA = parseFloat(sliderWeightAlpha.value);
            const rawB = parseFloat(sliderWeightBeta.value);
            const rawG = parseFloat(sliderWeightGamma.value);
            const total = rawA + rawB + rawG;
            setTriWeights(rawA / total, rawB / total, rawG / total, 'slider');
        }

        [sliderWeightAlpha, sliderWeightBeta, sliderWeightGamma].forEach(slider => {
            slider.addEventListener('input', handleSliderSync);
        });

        let isDraggingTriangle = false;

        function updateTriangleCoords(evt) {
            const pt = ternarySvg.createSVGPoint();
            const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
            const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

            pt.x = clientX;
            pt.y = clientY;
            const cursor = pt.matrixTransform(ternarySvg.getScreenCTM().inverse());

            const det = (V2.y - V3.y) * (V1.x - V3.x) + (V3.x - V2.x) * (V1.y - V3.y);
            let a = ((V2.y - V3.y) * (cursor.x - V3.x) + (V3.x - V2.x) * (cursor.y - V3.y)) / det;
            let b = ((V3.y - V1.y) * (cursor.x - V3.x) + (V1.x - V3.x) * (cursor.y - V3.y)) / det;
            let c = 1 - a - b;

            a = Math.max(0, a);
            b = Math.max(0, b);
            c = Math.max(0, c);
            const sum = a + b + c;
            a /= sum;
            b /= sum;
            c /= sum;

            const px = a * V1.x + b * V2.x + c * V3.x;
            const py = a * V1.y + b * V2.y + c * V3.y;
            ternaryPuck.setAttribute('cx', px.toString());
            ternaryPuck.setAttribute('cy', py.toString());

            setTriWeights(a, b, c, 'triangle');
        }

        ternaryPuck.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDraggingTriangle = true;
        });

        ternarySvg.addEventListener('mousedown', (e) => {
            isDraggingTriangle = true;
            updateTriangleCoords(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (isDraggingTriangle) updateTriangleCoords(e);
        });

        window.addEventListener('mouseup', () => {
            isDraggingTriangle = false;
        });

        ternarySvg.addEventListener('touchstart', (e) => {
            isDraggingTriangle = true;
            updateTriangleCoords(e);
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (isDraggingTriangle) updateTriangleCoords(e);
        }, { passive: false });

        window.addEventListener('touchend', () => {
            isDraggingTriangle = false;
        });

        setTriWeights(wizardState.weights.alpha, wizardState.weights.beta, wizardState.weights.gamma);
    }

    // --- 7. Universal Ranking Arena Factory ---
    function createRankingArena(config) {
        let isDragging = false;
        let draggedIndex = null;
        let currentDropIndex = null;

        function render() {
            if (config.hasError && config.hasError()) {
                config.poolEl.innerHTML = `
                    <div style="padding: 14px; color: var(--danger-700); font-size: 0.84rem; text-align: center;">
                        خطا در دریافت اطلاعات از سرور. لطفاً اتصال اینترنت را بررسی و صفحه را تازه‌سازی فرمایید.
                    </div>
                `;
                config.listEl.innerHTML = `
                    <div style="text-align: center; padding: 24px; border: 1.5px dashed var(--danger-border); border-radius: var(--radius-md); color: var(--danger-700); background: var(--danger-subtle); font-size: 0.86rem;">
                        اطلاعات ${config.itemLabel} بارگذاری نشد.
                    </div>
                `;
                config.badgeEl.textContent = `خطا در دریافت داده`;
                validateCurrentStep();
                return;
            }

            const activeItems = config.getActive();
            const activeIds = activeItems.map(i => i.id);
            const masterList = config.getMaster();
            const query = config.getSearchQuery ? config.getSearchQuery().toLowerCase().trim() : '';

            config.poolEl.innerHTML = '';

            if (config.isLargeArena && !query) {
                config.poolEl.innerHTML = `
                    <div class="pool-empty-search-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <span>برای مشاهده و افزودن ${config.itemLabel}، عنوان آن را در کادر بالا جستجو کنید.</span>
                    </div>
                `;
            } else {
                let available = masterList.filter(m => !activeIds.includes(m.id));

                if (query) {
                    available = available.filter(item =>
                        item.title.toLowerCase().includes(query) || (item.desc && item.desc.toLowerCase().includes(query))
                    );
                }

                if (config.isLargeArena && available.length > 25) {
                    available = available.slice(0, 25);
                }

                if (available.length === 0) {
                    config.poolEl.innerHTML = `<span style="font-size:0.78rem; color:var(--text-subtle); padding:6px 0;">موردی با این عنوان یافت نشد.</span>`;
                } else {
                    available.forEach(item => {
                        const chipBtn = document.createElement('button');
                        chipBtn.type = 'button';
                        chipBtn.className = 'available-chip-btn';
                        chipBtn.innerHTML = `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span>${item.title}</span>
                        `;
                        chipBtn.addEventListener('click', () => addItem(item));
                        config.poolEl.appendChild(chipBtn);
                    });
                }
            }

            config.listEl.innerHTML = '';
            config.badgeEl.textContent = `${toFa(activeItems.length)} ${config.itemLabel} فعال`;

            if (activeItems.length === 0) {
                config.listEl.innerHTML = `
                    <div style="text-align: center; padding: 24px; border: 1.5px dashed var(--border-color); border-radius: var(--radius-md); color: var(--danger-700); background: var(--danger-50); font-size: 0.86rem;">
                        ${config.emptyMessage}
                    </div>
                `;
                validateCurrentStep();
                return;
            }

            activeItems.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'arena-item-card';
                card.draggable = false;
                card.dataset.index = index;
                card.dataset.id = item.id;

                card.innerHTML = `
                    <div class="arena-item-lead" title="برای جابجایی اولویت کلیک کنید و بکشید">
                        <div class="drag-grip-handle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="6" r="1.5"></circle>
                                <circle cx="15" cy="6" r="1.5"></circle>
                                <circle cx="9" cy="12" r="1.5"></circle>
                                <circle cx="15" cy="12" r="1.5"></circle>
                                <circle cx="9" cy="18" r="1.5"></circle>
                                <circle cx="15" cy="18" r="1.5"></circle>
                            </svg>
                        </div>
                        <div class="arena-rank-number">${toFa(index + 1)}</div>
                        <div class="arena-item-info">
                            <span class="arena-item-name">${item.title}</span>
                            <span class="arena-item-detail">${item.desc}</span>
                        </div>
                    </div>
                    <div class="arena-item-controls">
                        <div class="score-control-bundle">
                            <input type="range" class="score-slider-input" min="1" max="10" step="1" value="${item.score}" data-index="${index}" style="--fill: ${((item.score - 1) / 9) * 100}%;">
                            <span class="score-value-badge">${toFa(item.score)}</span>
                        </div>
                        <button type="button" class="btn-remove-from-arena" title="حذف از اولویت‌ها (امتیاز ۰)" data-index="${index}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;
                config.listEl.appendChild(card);
            });

            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'arena-drop-indicator';
            dropIndicator.id = `${config.prefix}DropIndicator`;
            config.listEl.appendChild(dropIndicator);

            attachCardEvents();
            validateCurrentStep();
        }

        function addItem(masterItem) {
            const activeItems = config.getActive();
            const newScore = activeItems.length > 0
                ? activeItems[activeItems.length - 1].score
                : 10;

            activeItems.push({
                id: masterItem.id,
                title: masterItem.title,
                desc: masterItem.desc,
                score: newScore
            });

            markMatrixDirty();
            render();
            triggerAutoSync();
            showToast(`«${masterItem.title}» با امتیاز اولیه ${toFa(newScore)} افزوده شد.`);
        }

        function removeItem(index) {
            const activeItems = config.getActive();
            const removed = activeItems.splice(index, 1)[0];
            markMatrixDirty();
            render();
            triggerAutoSync();
            showToast(`«${removed.title}» حذف شد (امتیاز در مدل = ۰).`);
        }

        function attachCardEvents() {
            config.listEl.querySelectorAll('.score-slider-input').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.index, 10);
                    const val = parseInt(e.target.value, 10);
                    config.getActive()[idx].score = val;
                    e.target.style.setProperty('--fill', `${((val - 1) / 9) * 100}%`);
                    e.target.closest('.score-control-bundle').querySelector('.score-value-badge').textContent = toFa(val);
                    markMatrixDirty();
                    triggerAutoSync();
                });

                slider.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.index, 10);
                    const val = parseInt(e.target.value, 10);
                    handleScoreChangeReorder(idx, val);
                });
            });

            config.listEl.querySelectorAll('.btn-remove-from-arena').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.index, 10);
                    removeItem(idx);
                });
            });

            const cards = Array.from(config.listEl.querySelectorAll('.arena-item-card'));
            cards.forEach(card => {
                const lead = card.querySelector('.arena-item-lead');
                const controls = card.querySelector('.arena-item-controls');

                lead.addEventListener('mouseenter', () => { if (!isDragging) card.draggable = true; });
                lead.addEventListener('mouseleave', () => { if (!isDragging) card.draggable = false; });
                controls.addEventListener('mouseenter', () => { if (!isDragging) card.draggable = false; });
                controls.addEventListener('mousedown', (e) => { card.draggable = false; e.stopPropagation(); });

                card.addEventListener('dragstart', (e) => {
                    isDragging = true;
                    draggedIndex = parseInt(card.dataset.index, 10);
                    currentDropIndex = draggedIndex;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(draggedIndex));

                    setTimeout(() => {
                        card.classList.add('dragging');
                        config.listEl.classList.add('is-dragging');
                    }, 0);
                });

                card.addEventListener('dragend', () => {
                    isDragging = false;
                    draggedIndex = null;
                    currentDropIndex = null;
                    config.listEl.querySelectorAll('.arena-item-card').forEach(c => {
                        c.classList.remove('dragging');
                        c.draggable = false;
                    });
                    config.listEl.classList.remove('is-dragging');
                    const indicator = document.getElementById(`${config.prefix}DropIndicator`);
                    if (indicator) indicator.style.display = 'none';
                });
            });
        }

        function initContainerEvents() {
            config.listEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const indicator = document.getElementById(`${config.prefix}DropIndicator`);
                if (!isDragging || !indicator) return;

                const nonDragging = Array.from(config.listEl.querySelectorAll('.arena-item-card:not(.dragging)'));
                if (nonDragging.length === 0) return;

                let targetCard = null;
                let insertAfter = false;
                currentDropIndex = 0;

                for (let i = 0; i < nonDragging.length; i++) {
                    const card = nonDragging[i];
                    const box = card.getBoundingClientRect();
                    const midY = box.top + (box.height / 2);

                    if (e.clientY < midY) {
                        targetCard = card;
                        insertAfter = false;
                        currentDropIndex = i;
                        break;
                    } else if (e.clientY <= box.bottom) {
                        targetCard = card;
                        insertAfter = true;
                        currentDropIndex = i + 1;
                        break;
                    }
                }

                if (!targetCard) {
                    targetCard = nonDragging[nonDragging.length - 1];
                    insertAfter = true;
                    currentDropIndex = nonDragging.length;
                }

                indicator.style.display = 'block';
                if (insertAfter) targetCard.after(indicator);
                else targetCard.before(indicator);
            });

            config.listEl.addEventListener('drop', (e) => {
                e.preventDefault();
                const indicator = document.getElementById(`${config.prefix}DropIndicator`);
                const targetIndex = currentDropIndex;
                const fromIndex = draggedIndex;

                if (indicator) indicator.style.display = 'none';
                config.listEl.classList.remove('is-dragging');

                if (!isDragging || fromIndex === null || targetIndex === null) return;
                isDragging = false;
                draggedIndex = null;
                currentDropIndex = null;

                if (targetIndex !== fromIndex) {
                    reorderAndReconcileScores(fromIndex, targetIndex);
                }
            });
        }

        function getNearestValidIndex(itemIndex, newScore) {
            const activeItems = config.getActive();
            const remaining = activeItems.filter((_, idx) => idx !== itemIndex);
            const validIndices = [];

            for (let k = 0; k <= remaining.length; k++) {
                const scoreAbove = (k === 0) ? Infinity : remaining[k - 1].score;
                const scoreBelow = (k === remaining.length) ? -Infinity : remaining[k].score;
                if (scoreAbove >= newScore && scoreBelow <= newScore) validIndices.push(k);
            }

            if (validIndices.length === 0 || validIndices.includes(itemIndex)) return itemIndex;

            let bestIndex = validIndices[0];
            let minDistance = Math.abs(bestIndex - itemIndex);
            for (let i = 1; i < validIndices.length; i++) {
                const dist = Math.abs(validIndices[i] - itemIndex);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestIndex = validIndices[i];
                }
            }
            return bestIndex;
        }

        function handleScoreChangeReorder(fromIndex, newScore) {
            const toIndex = getNearestValidIndex(fromIndex, newScore);
            if (toIndex === fromIndex) {
                triggerAutoSync();
                return;
            }

            const activeItems = config.getActive();
            const firstTops = new Map();
            config.listEl.querySelectorAll('.arena-item-card').forEach(card => {
                if (card.dataset.id) firstTops.set(card.dataset.id, card.getBoundingClientRect().top);
            });

            const [movedItem] = activeItems.splice(fromIndex, 1);
            activeItems.splice(toIndex, 0, movedItem);

            markMatrixDirty();
            render();
            triggerAutoSync();

            const newCards = Array.from(config.listEl.querySelectorAll('.arena-item-card'));
            newCards.forEach(card => {
                const id = card.dataset.id;
                const oldTop = firstTops.get(id);
                if (oldTop !== undefined) {
                    const deltaY = oldTop - card.getBoundingClientRect().top;
                    if (deltaY !== 0) {
                        card.style.transform = `translateY(${deltaY}px)`;
                        card.style.transition = 'none';
                        if (id === movedItem.id) card.classList.add('is-reordering');
                    }
                }
            });

            void config.listEl.offsetHeight;

            requestAnimationFrame(() => {
                newCards.forEach(card => {
                    if (card.style.transform) {
                        card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.35s ease, border-color 0.35s ease';
                        card.style.transform = '';
                    }
                });

                setTimeout(() => {
                    newCards.forEach(card => {
                        card.style.transition = '';
                        card.classList.remove('is-reordering');
                    });
                }, 360);
            });

            showToast(`جایگاه «${movedItem.title}» بر اساس امتیاز ${toFa(movedItem.score)} بروزرسانی شد.`);
        }

        function reorderAndReconcileScores(oldIndex, newIndex) {
            const activeItems = config.getActive();
            const [movedItem] = activeItems.splice(oldIndex, 1);
            activeItems.splice(newIndex, 0, movedItem);

            const scoreAbove = (newIndex === 0) ? 10 : activeItems[newIndex - 1].score;
            const scoreBelow = (newIndex === activeItems.length - 1) ? 1 : activeItems[newIndex + 1].score;

            movedItem.score = Math.max(1, Math.min(10, Math.round((scoreAbove + scoreBelow) / 2)));

            markMatrixDirty();
            render();
            triggerAutoSync();
            showToast(`اولویت «${movedItem.title}» جابجا شد و امتیاز به ${toFa(movedItem.score)} تراز گردید.`);
        }

        initContainerEvents();
        return { render, initContainerEvents };
    }

    // Step 1: Regimes Arena
    const regimeArena = createRankingArena({
        prefix: 'regime',
        itemLabel: 'دوره',
        isLargeArena: false,
        poolEl: document.getElementById('regimeAvailableChips'),
        listEl: document.getElementById('regimeArenaList'),
        badgeEl: document.getElementById('arenaCountBadge'),
        emptyMessage: 'هیچ دوره‌ای انتخاب نشده است. حداقل یک دوره تحصیلی را از بانک بالا اضافه کنید.',
        getMaster: () => regimeMasterCatalog,
        getActive: () => wizardState.activeRegimes,
        hasError: () => catalogErrors.regimes
    });

    // Step 2: Provinces Arena
    const provincesArena = createRankingArena({
        prefix: 'province',
        itemLabel: 'استان',
        isLargeArena: false,
        poolEl: document.getElementById('provinceAvailableChips'),
        listEl: document.getElementById('provinceArenaList'),
        badgeEl: document.getElementById('provinceArenaCountBadge'),
        emptyMessage: 'هیچ استانی انتخاب نشده است. حداقل یک استان را از بانک بالا اضافه کنید.',
        getMaster: () => provincesMasterCatalog,
        getActive: () => wizardState.activeProvinces,
        getSearchQuery: () => wizardState.provinceSearchQuery,
        hasError: () => catalogErrors.provinces
    });

    // Step 3: Universities Large Arena
    const universitiesArena = createRankingArena({
        prefix: 'uni',
        itemLabel: 'دانشگاه',
        isLargeArena: true,
        poolEl: document.getElementById('uniAvailableChips'),
        listEl: document.getElementById('uniArenaList'),
        badgeEl: document.getElementById('uniArenaCountBadge'),
        emptyMessage: 'هیچ دانشگاهی انتخاب نشده است. نام دانشگاه را از کادر بالا جستجو و به میدان اضافه کنید.',
        getMaster: () => universitiesMasterCatalog,
        getActive: () => wizardState.activeUniversities,
        getSearchQuery: () => wizardState.uniSearchQuery,
        hasError: () => catalogErrors.universities
    });

    // Step 4: Majors Large Arena
    const majorsArena = createRankingArena({
        prefix: 'major',
        itemLabel: 'رشته',
        isLargeArena: true,
        poolEl: document.getElementById('majorAvailableChips'),
        listEl: document.getElementById('majorArenaList'),
        badgeEl: document.getElementById('majorArenaCountBadge'),
        emptyMessage: 'هیچ رشته‌ای انتخاب نشده است. نام رشته را از کادر بالا جستجو و به میدان اضافه کنید.',
        getMaster: () => majorsMasterCatalog,
        getActive: () => wizardState.activeMajors,
        getSearchQuery: () => wizardState.majorSearchQuery,
        hasError: () => catalogErrors.majors
    });

    // Search Listeners
    const provinceSearchInput = document.getElementById('provinceSearchInput');
    if (provinceSearchInput) {
        provinceSearchInput.addEventListener('input', (e) => {
            wizardState.provinceSearchQuery = e.target.value;
            provincesArena.render();
        });
    }

    const uniSearchInput = document.getElementById('uniSearchInput');
    if (uniSearchInput) {
        uniSearchInput.addEventListener('input', (e) => {
            wizardState.uniSearchQuery = e.target.value;
            universitiesArena.render();
        });
    }

    const majorSearchInput = document.getElementById('majorSearchInput');
    if (majorSearchInput) {
        majorSearchInput.addEventListener('input', (e) => {
            wizardState.majorSearchQuery = e.target.value;
            majorsArena.render();
        });
    }

    // --- Dirty State & Notice UI Controller ---
    function markMatrixDirty() {
        if (currentMatrixItems.length > 0 || (wizardState.customOrdering && wizardState.customOrdering.length > 0)) {
            isMatrixDirty = true;
            if (wizardState.currentStep === 5) {
                renderRecalcNoticeState();
            }
        }
    }

    function renderRecalcNoticeState() {
        const btnRecalc = document.getElementById('btnTriggerRecalculate');
        const noticeEl = document.getElementById('recalcNoticeBanner');
        if (!btnRecalc || !noticeEl) return;

        if (isMatrixDirty) {
            btnRecalc.classList.add('pulse-attention');
            noticeEl.style.display = 'inline-flex';
            noticeEl.classList.remove('anim-slide-out');
            noticeEl.classList.add('anim-slide-in');
        } else {
            btnRecalc.classList.remove('pulse-attention');
            if (noticeEl.style.display !== 'none') {
                noticeEl.classList.remove('anim-slide-in');
                noticeEl.classList.add('anim-slide-out');
                setTimeout(() => {
                    noticeEl.style.display = 'none';
                    noticeEl.classList.remove('anim-slide-out');
                }, 240);
            }
        }
    }

    // --- 8. Step 5 MCDM Matrix Engine & Sanjesh Export Engine ---
    function computeCobbDouglasMatrix() {
        if (!pairsMasterCatalog || pairsMasterCatalog.length === 0) return [];

        const alpha = wizardState.weights.alpha;
        const beta = wizardState.weights.beta;
        const gamma = wizardState.weights.gamma;

        const majorMap = new Map();
        const uniMap = new Map();
        const provMap = new Map();
        const regimeMap = new Map();
        const uniDescMap = new Map();

        // Map university descriptions from catalog and active selection
        universitiesMasterCatalog.forEach(u => {
            if (u.desc) {
                uniDescMap.set(u.id, u.desc);
                uniDescMap.set(u.title, u.desc);
            }
        });
        wizardState.activeUniversities.forEach(u => {
            if (u.desc) {
                uniDescMap.set(u.id, u.desc);
                uniDescMap.set(u.title, u.desc);
            }
        });

        wizardState.activeMajors.forEach(m => { majorMap.set(m.id, m.score); majorMap.set(m.title, m.score); });
        wizardState.activeUniversities.forEach(u => { uniMap.set(u.id, u.score); uniMap.set(u.title, u.score); });
        wizardState.activeProvinces.forEach(p => { provMap.set(p.id, p.score); provMap.set(p.title, p.score); });
        wizardState.activeRegimes.forEach(r => { regimeMap.set(r.id, r.score); regimeMap.set(r.title, r.score); });

        const viable = [];

        for (const pair of pairsMasterCatalog) {
            if (wizardState.gender === 'female' && !pair.genderWomen) continue;
            if (wizardState.gender === 'male' && !pair.genderMen) continue;

            const rScore = regimeMap.get(pair.regime_id) ?? regimeMap.get(pair.courseType);
            if (rScore === undefined) continue;

            const pScore = provMap.get(pair.province_id) ?? provMap.get(pair.province);
            if (pScore === undefined) continue;

            const uScore = uniMap.get(pair.uni_id) ?? uniMap.get(pair.university);
            if (uScore === undefined) continue;

            const mScore = majorMap.get(pair.major_id) ?? majorMap.get(pair.major);
            if (mScore === undefined) continue;

            let lambdaRecords = 1.0;
            const isByExam = Boolean(pair.byExam);

            if (wizardState.lambda_records === 'exam_only') {
                if (!isByExam) continue;
                lambdaRecords = 1.0;
            } else if (wizardState.lambda_records === 'records_only') {
                if (isByExam) continue;
                lambdaRecords = 1.0;
            } else if (wizardState.lambda_records === '0.70') {
                lambdaRecords = isByExam ? 1.0 : 0.70;
            } else {
                lambdaRecords = 1.0;
            }

            const isBahman = (pair.capacityTerm2 > 0 && (!pair.capacityTerm1 || pair.capacityTerm1 === 0));
            let lambdaTerm = 1.0;

            if (isBahman) {
                if (wizardState.lambda_term === 0.0) continue;
                lambdaTerm = wizardState.lambda_term;
            }

            const geomMean = Math.pow(mScore, alpha) * Math.pow(uScore, beta) * Math.pow(pScore, gamma);
            const regimeScalar = rScore / 10;
            const utility = geomMean * regimeScalar * lambdaTerm * lambdaRecords;

            const uDesc = pair.campus || uniDescMap.get(pair.uni_id) || uniDescMap.get(pair.university) || '';

            viable.push({
                code: String(pair.code),
                major: pair.major,
                uni: pair.university,
                province: pair.province,
                uniDesc: uDesc,
                regime: pair.courseType,
                isBahman: isBahman,
                byExam: isByExam,
                capacityTerm1: pair.capacityTerm1 ?? 0,
                capacityTerm2: pair.capacityTerm2 ?? 0,
                genderMen: Boolean(pair.genderMen),
                genderWomen: Boolean(pair.genderWomen),
                notes: pair.notes || '',
                _utility: utility,
                _r_major: mScore,
                _r_uni: uScore
            });
        }

        viable.sort((a, b) => b._utility - a._utility || b._r_major - a._r_major || b._r_uni - a._r_uni);
        return viable.slice(0, 300).map(({ _utility, _r_major, _r_uni, ...item }) => item);
    }

    function initStep5MatrixModule() {
        const matrixTbody = document.getElementById('matrixTableBody');
        const matrixDropIndicator = document.getElementById('matrixDropIndicator');
        const matrixInlineInsertLine = document.getElementById('matrixInlineInsertLine');
        const matrixInlineInsertBtn = document.getElementById('matrixInlineInsertBtn');
        const viableCountText = document.getElementById('matrixViableCountText');
        const emptyState = document.getElementById('matrixEmptyState');
        const filterRegimeSelect = document.getElementById('matrixFilterRegime');
        const filterProvinceSelect = document.getElementById('matrixFilterProvince');
        const searchInput = document.getElementById('matrixSearchInput');

        // Modal Elements
        const addChoiceModal = document.getElementById('addChoiceModal');
        const btnOpenAddModal = document.getElementById('btnOpenAddChoiceModal');
        const btnCloseAddModal = document.getElementById('btnCloseAddChoiceModal');
        const addChoiceSearchInput = document.getElementById('addChoiceSearchInput');
        const addChoiceFilterRegime = document.getElementById('addChoiceFilterRegime');
        const addChoiceFilterProvince = document.getElementById('addChoiceFilterProvince');
        const addChoiceResultsList = document.getElementById('addChoiceResultsList');
        const addChoiceEmptyState = document.getElementById('addChoiceEmptyState');
        const addChoiceTargetRankInput = document.getElementById('addChoiceTargetRankInput');
        const addChoiceTotalRankNotice = document.getElementById('addChoiceTotalRankNotice');
        const btnTargetStart = document.getElementById('btnTargetStart');
        const btnTargetEnd = document.getElementById('btnTargetEnd');
        const addChoiceLimitWarning = document.getElementById('addChoiceLimitWarning');

        let isRowDragging = false;
        let draggedCode = null;
        let currentTargetCode = null;
        let currentInsertAfter = false;
        let currentModalTargetRank = 1;
        let modalSearchDebounceTimer = null;

        async function mountStep5() {
            if (pairsMasterCatalog.length === 0 && !catalogErrors.pairs) {
                await loadPairsData();
            }

            if (catalogErrors.pairs) {
                currentMatrixItems = [];
                renderMatrixRows();
                validateCurrentStep();
                return;
            }

            if (currentMatrixItems.length === 0) {
                if (wizardState.customOrdering && wizardState.customOrdering.length > 0) {
                    const pairsMap = new Map(pairsMasterCatalog.map(p => [String(p.code), p]));
                    currentMatrixItems = wizardState.customOrdering.map((item, idx) => {
                        const match = pairsMap.get(String(item.code));
                        if (!match) return { ...item, rank: idx + 1 };
                        const isBahman = (match.capacityTerm2 > 0 && (!match.capacityTerm1 || match.capacityTerm1 === 0));
                        return {
                            rank: idx + 1,
                            code: String(match.code),
                            major: match.major,
                            uni: match.university,
                            province: match.province,
                            uniDesc: match.campus || item.uniDesc || '',
                            regime: match.courseType,
                            isBahman: isBahman,
                            byExam: match.byExam !== false
                        };
                    });
                    wizardState.customOrdering = [...currentMatrixItems];
                } else {
                    const calculated = computeCobbDouglasMatrix();
                    currentMatrixItems = calculated.map((item, idx) => ({ ...item, rank: idx + 1 }));
                    isMatrixDirty = false;
                }
            }

            populateDropdownFilters();
            populateAddModalDropdownFilters();
            renderMatrixRows();
            runSanjeshSanityValidator();
            renderRecalcNoticeState();
            validateCurrentStep();
        }

        function populateDropdownFilters() {
            if (!filterRegimeSelect || !filterProvinceSelect) return;

            const activeRegimeTitles = [...new Set(currentMatrixItems.map(i => i.regime))];
            filterRegimeSelect.innerHTML = '<option value="all">تمام دوره‌ها</option>';
            activeRegimeTitles.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r;
                opt.textContent = r;
                filterRegimeSelect.appendChild(opt);
            });

            const activeProvTitles = [...new Set(currentMatrixItems.map(i => i.province))];
            filterProvinceSelect.innerHTML = '<option value="all">تمام استان‌ها</option>';
            activeProvTitles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                filterProvinceSelect.appendChild(opt);
            });
        }

        function populateAddModalDropdownFilters() {
            if (!addChoiceFilterRegime || !addChoiceFilterProvince || pairsMasterCatalog.length === 0) return;

            const allRegimes = [...new Set(pairsMasterCatalog.map(p => p.courseType).filter(Boolean))];
            addChoiceFilterRegime.innerHTML = '<option value="all">تمام دوره‌ها</option>';
            allRegimes.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r;
                opt.textContent = r;
                addChoiceFilterRegime.appendChild(opt);
            });

            const allProvs = [...new Set(pairsMasterCatalog.map(p => p.province).filter(Boolean))];
            addChoiceFilterProvince.innerHTML = '<option value="all">تمام استان‌ها</option>';
            allProvs.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                addChoiceFilterProvince.appendChild(opt);
            });
        }

        function renderMatrixRows() {
            if (!matrixTbody) return;

            if (catalogErrors.pairs) {
                if (viableCountText) viableCountText.textContent = 'خطا در بارگذاری فایل رشته‌محل‌ها از سرور';
                matrixTbody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align: center; padding: 40px 20px; background: var(--danger-50); color: var(--danger-700); font-weight: 600;">
                            بارگذاری فایل داده‌های رشته‌محل‌ها (/data/${wizardState.stream}/pairs.json) با خطا مواجه شد یا فایل در سرور موجود نیست.
                        </td>
                    </tr>
                `;
                if (emptyState) emptyState.style.display = 'none';
                return;
            }

            const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
            const selectedRegime = filterRegimeSelect ? filterRegimeSelect.value : 'all';
            const selectedProv = filterProvinceSelect ? filterProvinceSelect.value : 'all';

            const visibleItems = currentMatrixItems.filter(item => {
                const matchesSearch = !query ||
                    item.major.toLowerCase().includes(query) ||
                    item.uni.toLowerCase().includes(query) ||
                    item.code.includes(query) ||
                    item.province.toLowerCase().includes(query);

                const matchesRegime = (selectedRegime === 'all') || (item.regime === selectedRegime);
                const matchesProv = (selectedProv === 'all') || (item.province === selectedProv);

                return matchesSearch && matchesRegime && matchesProv;
            });

            if (viableCountText) {
                viableCountText.textContent = `${toFa(currentMatrixItems.length)} رشته‌محل بهینه‌سازی‌شده در چینش شما`;
            }
            matrixTbody.innerHTML = '';

            if (visibleItems.length === 0) {
                if (emptyState) emptyState.style.display = 'block';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';

            visibleItems.forEach((item, index) => {
                const tr = document.createElement('tr');
                tr.className = 'matrix-row-item';
                tr.draggable = false;
                tr.dataset.index = index;
                tr.dataset.code = item.code;

                let regimeClass = 'regime-day';
                if (item.regime.includes('دوم') || item.regime.includes('شبانه')) regimeClass = 'regime-night';
                else if (item.regime.includes('خودگردان آزاد')) regimeClass = 'regime-azad-self';
                else if (item.regime.includes('پردیس') || item.regime.includes('خودگردان')) regimeClass = 'regime-campus';
                else if (item.regime.includes('مجازی') || item.regime.includes('الکترونیکی')) regimeClass = 'regime-virtual';
                else if (item.regime.includes('شهریه')) regimeClass = 'regime-tuition';
                else if (item.regime.includes('آزاد')) regimeClass = 'regime-azad';

                const provWithDesc = item.uniDesc ? `${item.province} • ${item.uniDesc}` : item.province;

                tr.innerHTML = `
                    <td class="col-rank">
                        <span class="matrix-rank-num">${toFa(item.rank || index + 1)}</span>
                    </td>
                    <td class="col-drag">
                        <span class="matrix-drag-grip" title="برای جابجایی ردیف کلیک کنید و بکشید">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <circle cx="9" cy="6" r="1.5"></circle>
                                <circle cx="15" cy="6" r="1.5"></circle>
                                <circle cx="9" cy="12" r="1.5"></circle>
                                <circle cx="15" cy="12" r="1.5"></circle>
                                <circle cx="9" cy="18" r="1.5"></circle>
                                <circle cx="15" cy="18" r="1.5"></circle>
                            </svg>
                        </span>
                    </td>
                    <td class="col-code">
                        <span class="matrix-code-chip" data-code="${item.code}" title="برای کپی کد ۵ رقمی کلیک کنید">
                            ${toFa(item.code)}
                        </span>
                    </td>
                    <td class="col-major">
                        <strong class="matrix-major-name">${item.major}</strong>
                    </td>
                    <td class="col-uni-prov">
                        <span class="matrix-uni-title">${item.uni}</span>
                        <div class="matrix-uni-badge-row">
                            <button type="button" class="matrix-info-trigger-badge ${item.notes ? 'has-notes' : ''}" data-code="${item.code}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                                <span>ظرفیت و شرایط</span>
                            </button>
                        </div>
                    </td>
                    <td class="col-regime">
                        <span class="regime-pill ${regimeClass}">${item.regime}</span>
                    </td>
                    <td class="col-term">
                        <span class="matrix-term-badge ${item.isBahman ? 'term-bahman' : 'term-mehr'}">
                            ${item.isBahman ? 'بهمن' : 'مهر'}
                        </span>
                    </td>
                    <td class="col-admission">
                        <span class="matrix-admission-badge ${item.byExam !== false ? 'admission-exam' : 'admission-records'}">
                            ${item.byExam !== false ? 'با آزمون' : 'سوابق'}
                        </span>
                    </td>
                    <td class="col-actions">
                        <button type="button" class="btn-remove-from-arena btn-remove-matrix-item" data-index="${index}" title="حذف این انتخاب">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </td>
                `;

                matrixTbody.appendChild(tr);
            });

            attachMatrixRowEvents();
        }

        function attachMatrixRowEvents() {
            const tableContainer = matrixTbody.closest('.matrix-table-container');

            // Click-to-copy handler
            matrixTbody.querySelectorAll('.matrix-code-chip').forEach(chip => {
                chip.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const code = chip.dataset.code;
                    if (!code || chip.classList.contains('copied')) return;

                    try {
                        await navigator.clipboard.writeText(code);
                    } catch {
                        const tempInput = document.createElement('textarea');
                        tempInput.value = code;
                        tempInput.style.position = 'fixed';
                        tempInput.style.opacity = '0';
                        document.body.appendChild(tempInput);
                        tempInput.select();
                        document.execCommand('copy');
                        document.body.removeChild(tempInput);
                    }

                    chip.classList.add('copied');
                    chip.textContent = 'کپی شد';

                    setTimeout(() => {
                        chip.classList.remove('copied');
                        chip.textContent = toFa(code);
                    }, 1200);
                });
            });

            // Remove button handler
            matrixTbody.querySelectorAll('.btn-remove-matrix-item').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.index, 10);
                    const removed = currentMatrixItems.splice(idx, 1)[0];
                    reindexRanks();
                    renderMatrixRows();
                    runSanjeshSanityValidator();
                    triggerAutoSync();
                    showToast(`رشته‌محل «${removed.major} - ${removed.uni}» حذف شد.`);
                });
            });

            // Grip drag events
            const rows = Array.from(matrixTbody.querySelectorAll('.matrix-row-item'));
            rows.forEach(row => {
                const grip = row.querySelector('.matrix-drag-grip');
                if (!grip) return;

                grip.addEventListener('mousedown', () => {
                    row.draggable = true;
                });

                grip.addEventListener('mouseup', () => {
                    if (!isRowDragging) row.draggable = false;
                });

                row.addEventListener('dragstart', (e) => {
                    isRowDragging = true;
                    draggedCode = row.dataset.code;
                    currentTargetCode = null;
                    currentInsertAfter = false;

                    if (matrixInlineInsertLine) matrixInlineInsertLine.style.display = 'none';

                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(draggedCode));

                    setTimeout(() => {
                        row.classList.add('matrix-row-dragging');
                        if (tableContainer) tableContainer.classList.add('is-dragging');
                    }, 0);
                });

                row.addEventListener('dragend', () => {
                    isRowDragging = false;
                    draggedCode = null;
                    currentTargetCode = null;
                    currentInsertAfter = false;

                    matrixTbody.querySelectorAll('.matrix-row-item').forEach(r => {
                        r.classList.remove('matrix-row-dragging');
                        r.draggable = false;
                    });
                    if (tableContainer) tableContainer.classList.remove('is-dragging');
                    if (matrixDropIndicator) matrixDropIndicator.style.display = 'none';
                });
            });
        }

        // Persistent container-level drag events & In-Between row boundary tracker
        function initMatrixContainerDragEvents() {
            const tableContainer = matrixTbody.closest('.matrix-table-container');
            if (!tableContainer) return;

            // In-Between Row Hover Tracker
            tableContainer.addEventListener('mousemove', (e) => {
                if (isRowDragging || !matrixInlineInsertLine || currentMatrixItems.length === 0) {
                    if (matrixInlineInsertLine) matrixInlineInsertLine.style.display = 'none';
                    return;
                }

                if (matrixInlineInsertLine.contains(e.target)) return;

                const rows = Array.from(matrixTbody.querySelectorAll('.matrix-row-item'));
                if (rows.length === 0) {
                    matrixInlineInsertLine.style.display = 'none';
                    return;
                }

                const containerRect = tableContainer.getBoundingClientRect();
                const clientY = e.clientY;
                let matchedTargetRank = null;
                let targetY = 0;

                // 1. Check above Row 0 (Rank 1)
                const firstRect = rows[0].getBoundingClientRect();
                if (Math.abs(clientY - firstRect.top) <= 8) {
                    matchedTargetRank = 1;
                    targetY = (firstRect.top - containerRect.top) + tableContainer.scrollTop;
                }

                // 2. Check between rows
                if (matchedTargetRank === null) {
                    for (let i = 0; i < rows.length; i++) {
                        const rRect = rows[i].getBoundingClientRect();
                        if (Math.abs(clientY - rRect.bottom) <= 8) {
                            matchedTargetRank = i + 2;
                            targetY = (rRect.bottom - containerRect.top) + tableContainer.scrollTop;
                            break;
                        }
                    }
                }

                if (matchedTargetRank !== null) {
                    matrixInlineInsertLine.style.top = `${targetY}px`;
                    matrixInlineInsertLine.style.display = 'flex';
                    if (matrixInlineInsertBtn) {
                        matrixInlineInsertBtn.dataset.targetRank = matchedTargetRank;
                        matrixInlineInsertBtn.querySelector('span').textContent = `درج در رتبه ${toFa(matchedTargetRank)}`;
                    }
                } else {
                    matrixInlineInsertLine.style.display = 'none';
                }
            });

            tableContainer.addEventListener('mouseleave', (e) => {
                if (matrixInlineInsertLine && !matrixInlineInsertLine.contains(e.relatedTarget)) {
                    matrixInlineInsertLine.style.display = 'none';
                }
            });

            if (matrixInlineInsertBtn) {
                matrixInlineInsertBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rank = parseInt(matrixInlineInsertBtn.dataset.targetRank, 10) || (currentMatrixItems.length + 1);
                    if (matrixInlineInsertLine) matrixInlineInsertLine.style.display = 'none';
                    openAddChoiceModal(rank);
                });
            }

            // Drag-and-drop mechanics
            tableContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!isRowDragging || !draggedCode || !matrixDropIndicator) return;

                const fromIndex = currentMatrixItems.findIndex(it => String(it.code) === String(draggedCode));
                if (fromIndex === -1) return;

                const nonDraggingRows = Array.from(matrixTbody.querySelectorAll('.matrix-row-item:not(.matrix-row-dragging)'));
                if (nonDraggingRows.length === 0) return;

                const containerRect = tableContainer.getBoundingClientRect();
                const clientY = e.clientY;

                let targetRow = null;
                let insertAfter = false;
                let indicatorY = 0;

                for (let i = 0; i < nonDraggingRows.length; i++) {
                    const row = nonDraggingRows[i];
                    const rect = row.getBoundingClientRect();
                    const mid = rect.top + (rect.height / 2);

                    if (clientY < mid) {
                        targetRow = row;
                        insertAfter = false;
                        indicatorY = (rect.top - containerRect.top) + tableContainer.scrollTop;
                        break;
                    } else if (i === nonDraggingRows.length - 1) {
                        targetRow = row;
                        insertAfter = true;
                        indicatorY = (rect.bottom - containerRect.top) + tableContainer.scrollTop;
                        break;
                    }
                }

                if (targetRow) {
                    const targetIdx = currentMatrixItems.findIndex(it => String(it.code) === String(targetRow.dataset.code));
                    let predictedToIndex = targetIdx;

                    if (insertAfter) {
                        predictedToIndex = (fromIndex < targetIdx) ? targetIdx : targetIdx + 1;
                    } else {
                        predictedToIndex = (fromIndex < targetIdx) ? targetIdx - 1 : targetIdx;
                    }

                    if (predictedToIndex === fromIndex) {
                        currentTargetCode = null;
                        currentInsertAfter = false;
                        matrixDropIndicator.style.display = 'none';
                    } else {
                        currentTargetCode = targetRow.dataset.code;
                        currentInsertAfter = insertAfter;
                        matrixDropIndicator.style.top = `${indicatorY}px`;
                        matrixDropIndicator.style.display = 'block';
                    }
                }
            });

            tableContainer.addEventListener('dragleave', (e) => {
                if (!tableContainer.contains(e.relatedTarget) && matrixDropIndicator) {
                    matrixDropIndicator.style.display = 'none';
                }
            });

            tableContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                if (matrixDropIndicator) matrixDropIndicator.style.display = 'none';
                tableContainer.classList.remove('is-dragging');

                if (!isRowDragging || !draggedCode) return;

                const fromCode = draggedCode;
                const targetCode = currentTargetCode;
                const insertAfter = currentInsertAfter;

                isRowDragging = false;
                draggedCode = null;
                currentTargetCode = null;
                currentInsertAfter = false;

                if (!targetCode) return;

                const fromIndex = currentMatrixItems.findIndex(it => String(it.code) === String(fromCode));
                if (fromIndex === -1) return;

                const targetIdx = currentMatrixItems.findIndex(it => String(it.code) === String(targetCode));
                if (targetIdx === -1) return;

                let toIndex;
                if (insertAfter) {
                    toIndex = (fromIndex < targetIdx) ? targetIdx : targetIdx + 1;
                } else {
                    toIndex = (fromIndex < targetIdx) ? targetIdx - 1 : targetIdx;
                }

                toIndex = Math.max(0, Math.min(currentMatrixItems.length - 1, toIndex));

                if (fromIndex !== toIndex) {
                    const [movedItem] = currentMatrixItems.splice(fromIndex, 1);
                    currentMatrixItems.splice(toIndex, 0, movedItem);
                    reindexRanks();
                    renderMatrixRows();
                    runSanjeshSanityValidator();
                    triggerAutoSync();
                    showToast(`ردیف ${toFa(fromIndex + 1)} به رتبه ${toFa(toIndex + 1)} جابجا شد.`);
                }
            });
        }

        // --- Add Choice Modal Engine (Search-to-Reveal & Single-Row Selection) ---
        const addChoicePromptState = document.getElementById('addChoicePromptState');
        const selectedChoicePreview = document.getElementById('selectedChoicePreview');
        const btnConfirmInsertChoice = document.getElementById('btnConfirmInsertChoice');
        const btnConfirmInsertText = document.getElementById('btnConfirmInsertText');
        const btnCancelAddChoice = document.getElementById('btnCancelAddChoice');
        const btnRankMinus = document.getElementById('btnRankMinus');
        const btnRankPlus = document.getElementById('btnRankPlus');

        let selectedPairForInsertion = null;

        function setModalTargetRank(rank) {
            const maxAllowed = Math.min(300, currentMatrixItems.length + 1);
            currentModalTargetRank = Math.max(1, Math.min(maxAllowed, rank));

            if (addChoiceTargetRankInput) {
                addChoiceTargetRankInput.value = toFa(currentModalTargetRank);
            }
            if (btnConfirmInsertText) {
                btnConfirmInsertText.textContent = `درج در رتبه ${toFa(currentModalTargetRank)}`;
            }
        }

        function openAddChoiceModal(targetRank) {
            if (!addChoiceModal) return;

            selectedPairForInsertion = null;
            updateSelectedPreviewUI();

            setModalTargetRank(targetRank || (currentMatrixItems.length + 1));

            if (addChoiceTotalRankNotice) {
                addChoiceTotalRankNotice.textContent = `از میان ${toFa(currentMatrixItems.length)} انتخاب فعلی`;
            }

            if (addChoiceLimitWarning) {
                addChoiceLimitWarning.style.display = (currentMatrixItems.length >= 300) ? 'flex' : 'none';
            }

            if (addChoiceSearchInput) addChoiceSearchInput.value = '';
            if (addChoiceFilterRegime) addChoiceFilterRegime.value = 'all';
            if (addChoiceFilterProvince) addChoiceFilterProvince.value = 'all';

            addChoiceModal.style.display = 'flex';
            renderModalPairsList();

            setTimeout(() => {
                if (addChoiceSearchInput) addChoiceSearchInput.focus();
            }, 60);
        }

        function closeAddChoiceModal() {
            if (!addChoiceModal) return;
            addChoiceModal.style.display = 'none';
            selectedPairForInsertion = null;
        }

        function updateSelectedPreviewUI() {
            if (!selectedChoicePreview || !btnConfirmInsertChoice) return;

            if (selectedPairForInsertion) {
                selectedChoicePreview.innerHTML = `
                    <span>انتخاب شده:</span> <strong>${selectedPairForInsertion.major}</strong> (${selectedPairForInsertion.university})
                `;
                btnConfirmInsertChoice.disabled = false;
            } else {
                selectedChoicePreview.innerHTML = `
                    <span class="preview-empty-text">هنوز رشته‌محلی انتخاب نشده است</span>
                `;
                btnConfirmInsertChoice.disabled = true;
            }
        }

        function renderModalPairsList() {
            if (!addChoiceResultsList) return;

            const qRaw = (addChoiceSearchInput ? addChoiceSearchInput.value : '').trim().toLowerCase();
            const qEn = toEn(qRaw);
            const regimeFilter = addChoiceFilterRegime ? addChoiceFilterRegime.value : 'all';
            const provFilter = addChoiceFilterProvince ? addChoiceFilterProvince.value : 'all';

            // Search-to-Reveal: Hide results and show friendly prompt when search query is empty
            if (!qRaw && regimeFilter === 'all' && provFilter === 'all') {
                if (addChoicePromptState) addChoicePromptState.style.display = 'flex';
                if (addChoiceResultsList) addChoiceResultsList.style.display = 'none';
                if (addChoiceEmptyState) addChoiceEmptyState.style.display = 'none';
                return;
            }

            if (addChoicePromptState) addChoicePromptState.style.display = 'none';

            const existingCodesMap = new Map();
            currentMatrixItems.forEach((it, idx) => {
                existingCodesMap.set(String(it.code), idx + 1);
            });

            // Search across ALL pairs in pairs.json without Step 1-4 filters (gender, active arenas, etc.)
            const filtered = pairsMasterCatalog.filter(pair => {
                if (regimeFilter !== 'all' && pair.courseType !== regimeFilter) return false;
                if (provFilter !== 'all' && pair.province !== provFilter) return false;

                if (qRaw) {
                    const matchMajor = (pair.major || '').toLowerCase().includes(qRaw);
                    const matchUni = (pair.university || '').toLowerCase().includes(qRaw);
                    const matchCode = String(pair.code || '').includes(qEn) || String(pair.code || '').includes(qRaw);
                    const matchProv = (pair.province || '').toLowerCase().includes(qRaw);
                    const matchCampus = (pair.campus || '').toLowerCase().includes(qRaw);
                    const matchRegime = (pair.courseType || '').toLowerCase().includes(qRaw);
                    if (!matchMajor && !matchUni && !matchCode && !matchProv && !matchCampus && !matchRegime) return false;
                }

                return true;
            });

            const displaySlice = filtered.slice(0, 30);

            if (displaySlice.length === 0) {
                if (addChoiceResultsList) addChoiceResultsList.style.display = 'none';
                if (addChoiceEmptyState) addChoiceEmptyState.style.display = 'flex';
                return;
            }

            if (addChoiceEmptyState) addChoiceEmptyState.style.display = 'none';
            if (addChoiceResultsList) addChoiceResultsList.style.display = 'flex';
            addChoiceResultsList.innerHTML = '';

            displaySlice.forEach(pair => {
                const existingRank = existingCodesMap.get(String(pair.code));
                const isBahman = (pair.capacityTerm2 > 0 && (!pair.capacityTerm1 || pair.capacityTerm1 === 0));
                const isCurrentlySelected = selectedPairForInsertion && String(selectedPairForInsertion.code) === String(pair.code);

                let regimeClass = 'regime-day';
                if (pair.courseType && (pair.courseType.includes('دوم') || pair.courseType.includes('شبانه'))) regimeClass = 'regime-night';
                else if (pair.courseType && pair.courseType.includes('خودگردان آزاد')) regimeClass = 'regime-azad-self';
                else if (pair.courseType && (pair.courseType.includes('پردیس') || pair.courseType.includes('خودگردان'))) regimeClass = 'regime-campus';
                else if (pair.courseType && (pair.courseType.includes('مجازی') || pair.courseType.includes('الکترونیکی'))) regimeClass = 'regime-virtual';
                else if (pair.courseType && pair.courseType.includes('شهریه')) regimeClass = 'regime-tuition';
                else if (pair.courseType && pair.courseType.includes('آزاد')) regimeClass = 'regime-azad';

                const row = document.createElement('div');
                row.className = `add-choice-row ${existingRank ? 'is-disabled' : ''} ${isCurrentlySelected ? 'is-selected' : ''}`;
                row.dataset.code = pair.code;

                row.innerHTML = `
                    <div class="row-selection-dot">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <span class="matrix-code-chip">${toFa(pair.code)}</span>
                    <span class="add-choice-major-col" title="${pair.major}">${pair.major}</span>
                    <span class="add-choice-uni-col" title="${pair.university} - ${pair.province}">
                        ${pair.university} • ${pair.province}${pair.campus ? ' (' + pair.campus + ')' : ''}
                    </span>
                    <div class="add-choice-badges-col">
                        <span class="regime-pill ${regimeClass}">${pair.courseType || 'روزانه'}</span>
                        <span class="matrix-term-badge ${isBahman ? 'term-bahman' : 'term-mehr'}">${isBahman ? 'بهمن' : 'مهر'}</span>
                        <span class="matrix-admission-badge ${pair.byExam !== false ? 'admission-exam' : 'admission-records'}">${pair.byExam !== false ? 'با آزمون' : 'سوابق'}</span>
                    </div>
                    <div class="add-choice-status-col">
                        ${existingRank
                    ? `<span class="already-added-badge">رتبه ${toFa(existingRank)}</span>`
                    : `<button type="button" class="modal-notes-trigger-btn ${pair.notes ? 'has-notes' : ''}" data-code="${pair.code}">توضیحات</button>`
                }
                    </div>
                `;

                if (!existingRank) {
                    row.addEventListener('click', () => {
                        selectedPairForInsertion = pair;
                        addChoiceResultsList.querySelectorAll('.add-choice-row').forEach(r => r.classList.remove('is-selected'));
                        row.classList.add('is-selected');
                        updateSelectedPreviewUI();
                    });

                    row.addEventListener('dblclick', () => {
                        selectedPairForInsertion = pair;
                        executeInsertPair(pair.code);
                    });
                }

                addChoiceResultsList.appendChild(row);
            });
        }

        function executeInsertPair(code) {
            const pair = pairsMasterCatalog.find(p => String(p.code) === String(code));
            if (!pair) return;

            const isBahman = (pair.capacityTerm2 > 0 && (!pair.capacityTerm1 || pair.capacityTerm1 === 0));
            const newItem = {
                code: String(pair.code),
                major: pair.major,
                uni: pair.university,
                province: pair.province,
                uniDesc: pair.campus || '',
                regime: pair.courseType,
                isBahman: isBahman,
                byExam: pair.byExam !== false,
                capacityTerm1: pair.capacityTerm1 ?? 0,
                capacityTerm2: pair.capacityTerm2 ?? 0,
                genderMen: Boolean(pair.genderMen),
                genderWomen: Boolean(pair.genderWomen),
                notes: pair.notes || ''
            };

            // Correctly parse rank by converting Persian numerals first
            let targetRank = currentModalTargetRank;
            if (addChoiceTargetRankInput && addChoiceTargetRankInput.value) {
                const rawEn = toEn(addChoiceTargetRankInput.value).replace(/\D/g, '');
                const parsed = parseInt(rawEn, 10);
                if (!isNaN(parsed) && parsed >= 1) {
                    targetRank = parsed;
                }
            }

            const maxAllowed = Math.min(300, currentMatrixItems.length + 1);
            targetRank = Math.max(1, Math.min(maxAllowed, targetRank));
            const insertIdx = targetRank - 1;

            let poppedNotice = false;
            if (currentMatrixItems.length >= 300) {
                currentMatrixItems.pop();
                poppedNotice = true;
            }

            currentMatrixItems.splice(insertIdx, 0, newItem);
            reindexRanks();
            closeAddChoiceModal();
            populateDropdownFilters();
            renderMatrixRows();
            runSanjeshSanityValidator();
            triggerAutoSync();

            requestAnimationFrame(() => {
                const targetRow = matrixTbody.querySelector(`.matrix-row-item[data-code="${newItem.code}"]`);
                if (targetRow) {
                    targetRow.classList.add('row-just-inserted');
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                        targetRow.classList.remove('row-just-inserted');
                    }, 2100);
                }
            });

            if (poppedNotice) {
                showToast(`«${newItem.major} - ${newItem.uni}» در رتبه ${toFa(targetRank)} درج شد (رشته‌محل رتبه ۳۰۰ خارج گردید).`);
            } else {
                showToast(`«${newItem.major} - ${newItem.uni}» با موفقیت در رتبه ${toFa(targetRank)} درج شد.`);
            }
        }

        // Initialize Add Choice Modal Event Listeners
        if (btnOpenAddModal) {
            btnOpenAddModal.addEventListener('click', () => {
                openAddChoiceModal(currentMatrixItems.length + 1);
            });
        }

        if (btnCloseAddModal) {
            btnCloseAddModal.addEventListener('click', closeAddChoiceModal);
        }

        if (addChoiceModal) {
            addChoiceModal.addEventListener('click', (e) => {
                if (e.target === addChoiceModal) closeAddChoiceModal();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && addChoiceModal && addChoiceModal.style.display !== 'none') {
                closeAddChoiceModal();
            }
        });

        // Rank Input: Sanitizes English and Persian digits and formats back to Persian
        if (addChoiceTargetRankInput) {
            addChoiceTargetRankInput.addEventListener('input', (e) => {
                const rawEn = toEn(e.target.value).replace(/\D/g, '');
                if (!rawEn) return;
                const parsed = parseInt(rawEn, 10);
                const maxAllowed = Math.min(300, currentMatrixItems.length + 1);
                currentModalTargetRank = Math.max(1, Math.min(maxAllowed, parsed));
                if (btnConfirmInsertText) {
                    btnConfirmInsertText.textContent = `درج در رتبه ${toFa(currentModalTargetRank)}`;
                }
            });

            addChoiceTargetRankInput.addEventListener('blur', () => {
                addChoiceTargetRankInput.value = toFa(currentModalTargetRank);
            });
        }

        if (btnRankMinus) {
            btnRankMinus.addEventListener('click', () => {
                setModalTargetRank(currentModalTargetRank - 1);
            });
        }

        if (btnRankPlus) {
            btnRankPlus.addEventListener('click', () => {
                setModalTargetRank(currentModalTargetRank + 1);
            });
        }

        if (btnTargetStart) {
            btnTargetStart.addEventListener('click', () => {
                setModalTargetRank(1);
            });
        }

        if (btnTargetEnd) {
            btnTargetEnd.addEventListener('click', () => {
                setModalTargetRank(currentMatrixItems.length + 1);
            });
        }

        if (btnConfirmInsertChoice) {
            btnConfirmInsertChoice.addEventListener('click', () => {
                if (!selectedPairForInsertion) return;
                executeInsertPair(selectedPairForInsertion.code);
            });
        }

        if (btnCancelAddChoice) {
            btnCancelAddChoice.addEventListener('click', closeAddChoiceModal);
        }

        function triggerModalSearchDebounced() {
            clearTimeout(modalSearchDebounceTimer);
            modalSearchDebounceTimer = setTimeout(renderModalPairsList, 150);
        }

        if (addChoiceSearchInput) addChoiceSearchInput.addEventListener('input', triggerModalSearchDebounced);
        if (addChoiceFilterRegime) addChoiceFilterRegime.addEventListener('change', renderModalPairsList);
        if (addChoiceFilterProvince) addChoiceFilterProvince.addEventListener('change', renderModalPairsList);

        function reindexRanks() {
            currentMatrixItems.forEach((item, idx) => {
                item.rank = idx + 1;
            });
            wizardState.customOrdering = [...currentMatrixItems];
        }

        function runSanjeshSanityValidator() {
            const anomalyBox = document.getElementById('matrixAnomalyBox');
            const anomalyList = document.getElementById('anomalyListContainer');
            if (!anomalyBox || !anomalyList) return;

            anomalyList.innerHTML = '';
            const anomalies = [];

            for (let i = 0; i < currentMatrixItems.length; i++) {
                for (let j = i + 1; j < currentMatrixItems.length; j++) {
                    const itemHigher = currentMatrixItems[i];
                    const itemLower = currentMatrixItems[j];

                    const sameMajorUni = (itemHigher.major === itemLower.major) && (itemHigher.uni === itemLower.uni);
                    if (sameMajorUni) {
                        const higherIsPardis = itemHigher.regime.includes('پردیس') || itemHigher.regime.includes('خودگردان');
                        const lowerIsDay = itemLower.regime.includes('روزانه');

                        if (higherIsPardis && lowerIsDay) {
                            anomalies.push({
                                type: 'regime',
                                highIdx: i,
                                lowIdx: j,
                                desc: `ردیف ${toFa(i + 1)} (${itemHigher.major} - ${itemHigher.uni} - ${itemHigher.regime}) پیش از ردیف ${toFa(j + 1)} (دوره روزانه رایگان) قرار گرفته است.`
                            });
                        }

                        if (itemHigher.regime === itemLower.regime && itemHigher.isBahman && !itemLower.isBahman) {
                            anomalies.push({
                                type: 'term',
                                highIdx: i,
                                lowIdx: j,
                                desc: `ردیف ${toFa(i + 1)} (بهمن) جلوتر از ردیف ${toFa(j + 1)} (مهر) در دوره ${itemHigher.regime} چیده شده است.`
                            });
                        }
                    }
                }
            }

            if (anomalies.length > 0) {
                const titleEl = document.getElementById('anomalyAlertTitle');
                if (titleEl) titleEl.textContent = `اعتبارسنجی منطق سنجش: ${toFa(anomalies.length)} مورد تقدم نامتعارف شناسایی شد`;
                anomalies.slice(0, 3).forEach(anom => {
                    const p = document.createElement('span');
                    p.className = 'anomaly-item-text';
                    p.textContent = `• ${anom.desc}`;
                    anomalyList.appendChild(p);
                });
                anomalyBox.style.display = 'flex';
                anomalyBox.dataset.anomalies = JSON.stringify(anomalies);
            } else {
                anomalyBox.style.display = 'none';
            }
        }

        const btnAutoFix = document.getElementById('btnAutoFixAnomalies');
        if (btnAutoFix) {
            btnAutoFix.addEventListener('click', () => {
                const anomalyBox = document.getElementById('matrixAnomalyBox');
                const raw = anomalyBox ? anomalyBox.dataset.anomalies : null;
                if (!raw) return;
                const anomalies = JSON.parse(raw);

                anomalies.forEach(anom => {
                    const temp = currentMatrixItems[anom.highIdx];
                    currentMatrixItems[anom.highIdx] = currentMatrixItems[anom.lowIdx];
                    currentMatrixItems[anom.lowIdx] = temp;
                });

                reindexRanks();
                renderMatrixRows();
                runSanjeshSanityValidator();
                triggerAutoSync();
                showToast('اولویت دوره‌های روزانه و نیمسال اول اصلاح شد.');
            });
        }

        const recalcModal = document.getElementById('recalculateConfirmModal');
        const btnRecalc = document.getElementById('btnTriggerRecalculate');
        if (btnRecalc && recalcModal) {
            btnRecalc.addEventListener('click', () => {
                recalcModal.style.display = 'flex';
            });
        }

        const btnCancelRecalc = document.getElementById('btnCancelRecalculate');
        if (btnCancelRecalc && recalcModal) {
            btnCancelRecalc.addEventListener('click', () => {
                recalcModal.style.display = 'none';
            });
        }

        const btnConfirmRecalc = document.getElementById('btnConfirmRecalculate');
        if (btnConfirmRecalc && recalcModal) {
            btnConfirmRecalc.addEventListener('click', () => {
                recalcModal.style.display = 'none';
                wizardState.customOrdering = null;
                const calculated = computeCobbDouglasMatrix();
                currentMatrixItems = calculated.map((item, idx) => ({ ...item, rank: idx + 1 }));
                isMatrixDirty = false;
                renderRecalcNoticeState();
                populateDropdownFilters();
                renderMatrixRows();
                runSanjeshSanityValidator();
                triggerAutoSync();
                showToast('ماتریس اولویت‌ها بر اساس جدیدترین مقادیر مجدداً محاسبه شد.');
            });
        }

        const btnDismiss = document.getElementById('btnDismissNotice');
        if (btnDismiss) {
            btnDismiss.addEventListener('click', () => {
                const noticeEl = document.getElementById('recalcNoticeBanner');
                const btnRecalc = document.getElementById('btnTriggerRecalculate');
                if (noticeEl) {
                    noticeEl.classList.remove('anim-slide-in');
                    noticeEl.classList.add('anim-slide-out');
                    setTimeout(() => {
                        noticeEl.style.display = 'none';
                        noticeEl.classList.remove('anim-slide-out');
                    }, 240);
                }
                if (btnRecalc) {
                    btnRecalc.classList.remove('pulse-attention');
                }
            });
        }

        if (searchInput) searchInput.addEventListener('input', renderMatrixRows);
        if (filterRegimeSelect) filterRegimeSelect.addEventListener('change', renderMatrixRows);
        if (filterProvinceSelect) filterProvinceSelect.addEventListener('change', renderMatrixRows);

        initMatrixContainerDragEvents();

        // --- Floating Smart Popover Engine ---
        const popoverEl = document.getElementById('sanjeshInfoPopover');
        let activePopoverTrigger = null;
        let popoverHideTimeout = null;

        function getCatalogPairByCode(code) {
            // Master catalog contains canonical properties (university, campus, province, capacityTerm1, etc.)
            const cat = pairsMasterCatalog.find(p => String(p.code) === String(code));
            if (cat) return cat;
            return currentMatrixItems.find(p => String(p.code) === String(code)) || null;
        }

        function showSanjeshPopover(triggerEl, pairCode) {
            if (!popoverEl || !triggerEl) return;
            clearTimeout(popoverHideTimeout);

            // Escapes any parent CSS transform stacking context
            if (popoverEl.parentElement !== document.body) {
                document.body.appendChild(popoverEl);
            }

            const pair = getCatalogPairByCode(pairCode);
            if (!pair) return;

            activePopoverTrigger = triggerEl;

            // Safe property resolution eliminates the 'undefined' subtitle
            const majorTitle = pair.major || '';
            const uniTitle = pair.university || pair.uni || '';
            const provTitle = pair.province || '';
            const campus = typeof pair.campus === 'string' ? pair.campus.trim() : '';

            const c1 = Number(pair.capacityTerm1) || 0;
            const c2 = Number(pair.capacityTerm2) || 0;

            // Determine single non-zero capacity and month
            let termMonth = 'مهرماه';
            let capVal = 0;

            if (c1 > 0 && c2 === 0) {
                termMonth = 'مهرماه';
                capVal = c1;
            } else if (c2 > 0 && c1 === 0) {
                termMonth = 'بهمن‌ماه';
                capVal = c2;
            } else if (c1 > 0 && c2 > 0) {
                termMonth = 'مهر و بهمن';
                capVal = c1 + c2;
            }

            const genderWord = wizardState.gender === 'female' ? 'خانم' : 'آقا';
            const notesText = (pair.notes || '').trim();

            popoverEl.innerHTML = `
                <div class="popover-header">
                    <div class="popover-title-group">
                        <strong class="popover-major-title">${majorTitle}</strong>
                        <span class="popover-uni-title">${uniTitle}</span>
                    </div>
                    <span class="popover-code-pill">${toFa(pair.code)}</span>
                </div>

                <!-- Consolidated Metadata Card (Location, Campus & Single Capacity) -->
                <div class="popover-meta-box">
                    <div class="popover-meta-row">
                        <svg class="popover-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span class="popover-meta-text">استان: <strong>${provTitle}</strong></span>
                    </div>
                    ${campus ? `
                    <div class="popover-meta-divider"></div>
                    <div class="popover-meta-row">
                        <svg class="popover-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 21h18"></path>
                            <path d="M5 21V7l8-4v18"></path>
                            <path d="M19 21V11l-6-3"></path>
                        </svg>
                        <span class="popover-meta-text">مکان: <strong>${campus}</strong></span>
                    </div>
                    ` : ''}
                    <div class="popover-meta-divider"></div>
                    <div class="popover-meta-row">
                        <svg class="popover-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                        </svg>
                        <span class="popover-meta-text">ظرفیت ${termMonth} (${genderWord}): <strong>${toFa(capVal)} نفر</strong></span>
                    </div>
                </div>

                ${notesText ? `
                    <div class="popover-notes-box">
                        <span class="popover-notes-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            توضیحات اختصاصی دفترچه:
                        </span>
                        <p class="popover-notes-content">${notesText}</p>
                    </div>
                ` : `
                    <div class="popover-notes-empty">فاقد شرایط خاص یا توضیحات تکمیلی در دفترچه سنجش</div>
                `}
            `;

            popoverEl.style.display = 'flex';
            positionSanjeshPopover(triggerEl);
        }

        function positionSanjeshPopover(triggerEl) {
            if (!popoverEl) return;

            const rect = triggerEl.getBoundingClientRect();
            const popRect = popoverEl.getBoundingClientRect();

            let left = rect.left + (rect.width / 2) - (popRect.width / 2);
            left = Math.max(12, Math.min(window.innerWidth - popRect.width - 12, left));

            let top = rect.top - popRect.height - 8;
            if (top < 10) {
                top = rect.bottom + 8;
            }

            popoverEl.style.left = `${Math.round(left)}px`;
            popoverEl.style.top = `${Math.round(top)}px`;
        }

        function scheduleHidePopover() {
            popoverHideTimeout = setTimeout(() => {
                if (popoverEl) popoverEl.style.display = 'none';
                activePopoverTrigger = null;
            }, 120);
        }

        if (popoverEl) {
            popoverEl.addEventListener('mouseenter', () => clearTimeout(popoverHideTimeout));
            popoverEl.addEventListener('mouseleave', scheduleHidePopover);
        }

        // Event delegation for both main table & modal triggers
        document.addEventListener('mouseover', (e) => {
            const trigger = e.target.closest('.matrix-info-trigger-badge, .modal-notes-trigger-btn');
            if (trigger) {
                const code = trigger.dataset.code;
                if (code) showSanjeshPopover(trigger, code);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const trigger = e.target.closest('.matrix-info-trigger-badge, .modal-notes-trigger-btn');
            if (trigger) {
                scheduleHidePopover();
            }
        });

        window.addEventListener('scroll', () => {
            if (popoverEl && popoverEl.style.display !== 'none') {
                popoverEl.style.display = 'none';
            }
        }, { passive: true });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popoverEl && popoverEl.style.display !== 'none') {
                popoverEl.style.display = 'none';
            }
        });

        // --- Export Dropdown Controller ---
        const exportWrapper = document.getElementById('exportDropdownWrapper');
        const btnExportDropdown = document.getElementById('btnExportDropdown');
        const btnExportExcel = document.getElementById('btnExportExcel');
        const btnExportPdf = document.getElementById('btnExportPdf');

        function toggleExportDropdown(show = null) {
            if (!exportWrapper) return;
            const willOpen = (show !== null) ? show : !exportWrapper.classList.contains('active');
            exportWrapper.classList.toggle('active', willOpen);
            if (btnExportDropdown) {
                btnExportDropdown.setAttribute('aria-expanded', String(willOpen));
            }
        }

        if (btnExportDropdown) {
            btnExportDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleExportDropdown();
            });
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (exportWrapper && !exportWrapper.contains(e.target)) {
                toggleExportDropdown(false);
            }
        });

        // Close on Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && exportWrapper && exportWrapper.classList.contains('active')) {
                toggleExportDropdown(false);
            }
        });

        async function exportMatrixToExcel() {
            if (!currentMatrixItems || currentMatrixItems.length === 0) {
                showToast('هیچ رشته‌محلی در چینش فعلی برای دریافت خروجی وجود ندارد.', 'error');
                return;
            }

            if (typeof ExcelJS === 'undefined') {
                showToast('کتابخانه اکسل هنوز بارگذاری نشده است. لطفاً اتصال اینترنت را بررسی فرمایید.', 'error');
                return;
            }

            showToast('در حال آماده‌سازی و طراحی فایل اکسل...');

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'سامانه رستا (OptiMajor)';
            workbook.lastModifiedBy = 'سامانه رستا';
            workbook.created = new Date();
            workbook.modified = new Date();

            const sheetTitle = (wizardState.slotTitle || 'چینش انتخاب رشته').slice(0, 31);
            const worksheet = workbook.addWorksheet(sheetTitle, {
                views: [{ rightToLeft: true, showGridLines: true }]
            });

            const streamMap = {
                math: 'ریاضی و فیزیک',
                experimental: 'علوم تجربی',
                humanities: 'علوم انسانی'
            };
            const streamLabel = streamMap[wizardState.stream] || wizardState.stream;
            const jalaliDate = new Intl.DateTimeFormat('fa-IR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(new Date());

            // --- 1. Top Branding & Metadata Banner ---
            worksheet.mergeCells('A1:J1');
            const row1 = worksheet.getCell('A1');
            row1.value = `سامانه هوشمند انتخاب رشته رستا | ${wizardState.slotTitle}`;
            row1.font = { name: 'Vazirmatn', family: 2, size: 13, bold: true, color: { argb: 'FF1E3A8A' } };
            row1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2FE' } };
            row1.alignment = { vertical: 'middle', horizontal: 'center' };
            worksheet.getRow(1).height = 32;

            worksheet.mergeCells('A2:J2');
            const row2 = worksheet.getCell('A2');
            row2.value = `گروه آزمایشی: ${streamLabel}   •   تعداد کل انتخاب‌ها: ${toFa(currentMatrixItems.length)} رشته‌محل   •   تاریخ صدور گزارش: ${jalaliDate}`;
            row2.font = { name: 'Vazirmatn', family: 2, size: 9, bold: false, color: { argb: 'FF475569' } };
            row2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2FE' } };
            row2.alignment = { vertical: 'middle', horizontal: 'center' };
            worksheet.getRow(2).height = 22;

            worksheet.getRow(3).height = 8; // Blank spacer row

            // --- 2. Table Column Definitions & Header Setup ---
            const headers = [
                { header: 'ردیف', key: 'rank', minWidth: 8, maxWidth: 10, align: 'center' },
                { header: 'کد رشته', key: 'code', minWidth: 12, maxWidth: 14, align: 'center' },
                { header: 'عنوان رشته تحصیلی', key: 'major', minWidth: 20, maxWidth: 38, align: 'right' },
                { header: 'دانشگاه', key: 'uni', minWidth: 18, maxWidth: 36, align: 'right' },
                { header: 'استان', key: 'province', minWidth: 12, maxWidth: 18, align: 'center' },
                { header: 'دوره تحصیلی', key: 'regime', minWidth: 14, maxWidth: 20, align: 'center' },
                { header: 'نیمسال', key: 'term', minWidth: 10, maxWidth: 12, align: 'center' },
                { header: 'شیوه پذیرش', key: 'admission', minWidth: 14, maxWidth: 18, align: 'center' },
                { header: 'ظرفیت', key: 'capacity', minWidth: 14, maxWidth: 20, align: 'center' },
                { header: 'توضیحات و شرایط سنجش', key: 'notes', minWidth: 22, maxWidth: 46, align: 'right' }
            ];

            const headerRow = worksheet.getRow(4);
            headerRow.height = 28;

            headers.forEach((col, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = col.header;
                cell.font = { name: 'Vazirmatn', family: 2, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF3B82F6' } },
                    bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } },
                    left: { style: 'thin', color: { argb: 'FF3B82F6' } },
                    right: { style: 'thin', color: { argb: 'FF3B82F6' } }
                };
            });

            // --- 3. Data Rows Population with Alternating Zebra Fills ---
            currentMatrixItems.forEach((item, index) => {
                const rowIndex = index + 5;
                const row = worksheet.getRow(rowIndex);
                row.height = 22;

                const pairDetail = getCatalogPairByCode(item.code) || item;
                const c1 = Number(pairDetail.capacityTerm1) || 0;
                const c2 = Number(pairDetail.capacityTerm2) || 0;

                let capText = '-';
                if (c1 > 0 && c2 === 0) capText = `${c1} نفر (مهر)`;
                else if (c2 > 0 && c1 === 0) capText = `${c2} نفر (بهمن)`;
                else if (c1 > 0 && c2 > 0) capText = `${c1 + c2} نفر`;

                const values = [
                    item.rank || index + 1,
                    parseInt(toEn(item.code), 10) || 0,
                    item.major || '',
                    item.uni || '',
                    item.province || '',
                    item.regime || '',
                    item.isBahman ? 'بهمن' : 'مهر',
                    item.byExam !== false ? 'با آزمون' : 'سوابق تحصیلی',
                    capText,
                    (item.notes || pairDetail.notes || '-').trim()
                ];

                const isEven = index % 2 === 0;
                const bgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

                values.forEach((val, colIdx) => {
                    const cell = row.getCell(colIdx + 1);
                    cell.value = val;
                    cell.font = { name: 'Vazirmatn', family: 2, size: 9.5, color: { argb: 'FF0F172A' } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.alignment = {
                        vertical: 'middle',
                        horizontal: headers[colIdx].align,
                        wrapText: colIdx === 9
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                    };

                    if (colIdx === 1) {
                        cell.numFmt = '00000'; // Stored as a number; displays full 5 digits
                    }
                });
            });

            // --- 4. Dynamic Auto-Fit Column Widths (Double-tap auto-width calculation) ---
            headers.forEach((col, colIdx) => {
                let maxContentLen = col.header.length;

                for (let r = 5; r < 5 + currentMatrixItems.length; r++) {
                    const rawVal = worksheet.getRow(r).getCell(colIdx + 1).value;
                    if (rawVal != null) {
                        const len = String(rawVal).trim().length;
                        if (len > maxContentLen) {
                            maxContentLen = len;
                        }
                    }
                }

                // Add padding (+ 4) and clamp within column's boundary limits
                const computedWidth = Math.max(col.minWidth, Math.min(col.maxWidth, maxContentLen + 4));
                worksheet.getColumn(colIdx + 1).width = computedWidth;
            });

            // --- 5. Buffer Generation & Browser Download Trigger ---
            try {
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const safeTitle = (wizardState.slotTitle || 'rasta-selection').replace(/[\\/:*?"<>|]/g, '_');
                a.href = url;
                a.download = `${safeTitle}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('فایل اکسل سناریو با موفقیت ایجاد و دانلود شد.');
            } catch (err) {
                console.error('Excel Generation Error:', err);
                showToast('خطا در تولید فایل اکسل.', 'error');
            }
        }

        if (btnExportExcel) {
            btnExportExcel.addEventListener('click', () => {
                toggleExportDropdown(false);
                exportMatrixToExcel();
            });
        }

        function exportMatrixToPdf() {
            if (!currentMatrixItems || currentMatrixItems.length === 0) {
                showToast('هیچ رشته‌محلی در چینش فعلی برای دریافت خروجی وجود ندارد.', 'error');
                return;
            }

            showToast('در حال آماده‌سازی و صفحه‌‌آرایی فایل PDF...');

            const streamMap = {
                math: 'ریاضی و فیزیک',
                experimental: 'علوم تجربی',
                humanities: 'علوم انسانی'
            };
            const streamLabel = streamMap[wizardState.stream] || wizardState.stream;
            const jalaliDate = new Intl.DateTimeFormat('fa-IR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(new Date());

            const rowsHtml = currentMatrixItems.map((item, index) => {
                const pairDetail = getCatalogPairByCode(item.code) || item;
                const c1 = Number(pairDetail.capacityTerm1) || 0;
                const c2 = Number(pairDetail.capacityTerm2) || 0;

                let capText = '-';
                if (c1 > 0 && c2 === 0) capText = `${toFa(c1)}`;
                else if (c2 > 0 && c1 === 0) capText = `${toFa(c2)}`;
                else if (c1 > 0 && c2 > 0) capText = `${toFa(c1 + c2)}`;

                let regimeClass = 'regime-day';
                if (item.regime.includes('دوم') || item.regime.includes('شبانه')) regimeClass = 'regime-night';
                else if (item.regime.includes('خودگردان آزاد')) regimeClass = 'regime-azad-self';
                else if (item.regime.includes('پردیس') || item.regime.includes('خودگردان')) regimeClass = 'regime-campus';
                else if (item.regime.includes('مجازی') || item.regime.includes('الکترونیکی')) regimeClass = 'regime-virtual';
                else if (item.regime.includes('شهریه')) regimeClass = 'regime-tuition';
                else if (item.regime.includes('آزاد')) regimeClass = 'regime-azad';

                const notesText = (item.notes || pairDetail.notes || '').trim();

                return `
                    <tr>
                        <td class="col-rank">${toFa(item.rank || index + 1)}</td>
                        <td class="col-code"><span class="code-pill">${toFa(item.code)}</span></td>
                        <td class="col-major"><strong>${item.major || ''}</strong></td>
                        <td class="col-uni">${item.uni || ''}</td>
                        <td class="col-prov">${item.province || ''}</td>
                        <td class="col-regime"><span class="badge ${regimeClass}">${item.regime || ''}</span></td>
                        <td class="col-term"><span class="badge ${item.isBahman ? 'term-bahman' : 'term-mehr'}">${item.isBahman ? 'بهمن' : 'مهر'}</span></td>
                        <td class="col-admission"><span class="badge ${item.byExam !== false ? 'admission-exam' : 'admission-records'}">${item.byExam !== false ? 'با آزمون' : 'سوابق'}</span></td>
                        <td class="col-capacity">${capText}</td>
                        <td class="col-notes">${notesText || '-'}</td>
                    </tr>
                `;
            }).join('');

            const printableHtml = `
                <!DOCTYPE html>
                <html lang="fa" dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <title>${wizardState.slotTitle} - گزارش چیدمان رستا</title>
                    <link rel="preconnect" href="https://fonts.googleapis.com">
                    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css">
                    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap">
                    <style>
                        @page {
                            size: A4 landscape;
                            margin: 8mm 10mm 10mm 10mm;
                        }

                        * {
                            box-sizing: border-box;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }

                        html, body {
                            margin: 0;
                            padding: 0;
                            font-family: 'Vazirmatn', 'Vazir', system-ui, -apple-system, sans-serif;
                            font-size: 8pt;
                            color: #0f172a;
                            background: #ffffff;
                            direction: rtl;
                            text-align: right;
                        }

                        /* Header Card */
                        .report-header {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            border: 1.5px solid #1e40af;
                            border-radius: 8px;
                            padding: 8px 14px;
                            background: #eff6ff;
                            margin-bottom: 8px;
                        }

                        .header-brand {
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        }

                        .brand-symbol {
                            width: 28px;
                            height: 28px;
                            border-radius: 6px;
                            background: #1e40af;
                            color: #ffffff;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 12pt;
                            font-weight: 800;
                            font-family: inherit;
                        }

                        .brand-titles {
                            display: flex;
                            flex-direction: column;
                            gap: 1px;
                        }

                        .report-main-title {
                            font-size: 10.5pt;
                            font-weight: 800;
                            color: #1e3a8a;
                            margin: 0;
                            font-family: inherit;
                        }

                        .report-sub-title {
                            font-size: 7.2pt;
                            color: #64748b;
                            margin: 0;
                            font-family: inherit;
                        }

                        .header-meta-group {
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        }

                        .meta-pill {
                            background: #ffffff;
                            border: 1px solid #cbd5e1;
                            border-radius: 6px;
                            padding: 3px 8px;
                            font-size: 7.4pt;
                            color: #334155;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                            font-family: inherit;
                        }

                        .meta-pill strong {
                            color: #1e40af;
                            font-weight: 700;
                        }

                        /* Table Styling */
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            table-layout: fixed;
                        }

                        thead {
                            display: table-header-group;
                        }

                        tr {
                            page-break-inside: avoid;
                        }

                        th {
                            background-color: #1e40af;
                            color: #ffffff;
                            font-weight: 700;
                            font-size: 7.4pt;
                            padding: 5px 4px;
                            text-align: right;
                            border: 1px solid #1e3a8a;
                            font-family: inherit;
                        }

                        th.center, td.center {
                            text-align: center;
                        }

                        td {
                            padding: 3px 4px;
                            border: 1px solid #e2e8f0;
                            font-size: 7.2pt;
                            color: #1e293b;
                            vertical-align: middle;
                            font-family: inherit;
                            line-height: 1.35;
                        }

                        tbody tr:nth-child(even) {
                            background-color: #f8fafc;
                        }

                        /* Optimized Column Sizing */
                        .col-rank { width: 26px; text-align: center; font-weight: 800; color: #1e40af; }
                        .col-code { width: 48px; text-align: center; }
                        .col-major { width: 17%; }
                        .col-uni { width: 15%; font-weight: 600; }
                        .col-prov { width: 44px; text-align: center; }
                        .col-regime { width: 50px; text-align: center; }
                        .col-term { width: 34px; text-align: center; }
                        .col-admission { width: 42px; text-align: center; }
                        .col-capacity { width: 36px; text-align: center; font-weight: 700; }
                        .col-notes { font-size: 6.8pt; color: #475569; line-height: 1.35; word-wrap: break-word; }

                        .code-pill {
                            display: inline-block;
                            padding: 1px 4px;
                            border-radius: 3px;
                            background: #f1f5f9;
                            border: 1px solid #cbd5e1;
                            font-weight: 700;
                            color: #334155;
                            direction: ltr;
                            font-size: 7.2pt;
                        }

                        .badge {
                            display: inline-block;
                            padding: 1px 3px;
                            border-radius: 999px;
                            font-size: 6.4pt;
                            font-weight: 700;
                            white-space: nowrap;
                        }

                        .regime-day { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
                        .regime-night { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
                        .regime-campus { background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; }
                        .regime-virtual { background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; }
                        .regime-azad-self { background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; }
                        .regime-tuition { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
                        .regime-azad { background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc; }

                        .term-mehr { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
                        .term-bahman { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }

                        .admission-exam { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
                        .admission-records { background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; }

                        .report-footer {
                            margin-top: 8px;
                            padding-top: 6px;
                            border-top: 1px solid #e2e8f0;
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            font-size: 6.8pt;
                            color: #94a3b8;
                            font-family: inherit;
                        }
                    </style>
                </head>
                <body>
                    <header class="report-header">
                        <div class="header-brand">
                            <div class="brand-symbol">ر</div>
                            <div class="brand-titles">
                                <h1 class="report-main-title">سامانه هوشمند رستا | ${wizardState.slotTitle}</h1>
                                <p class="report-sub-title">چیدمان بهینه‌سازی‌شده رشته‌محل‌های آزمون سراسری دانشگاه‌ها و موسسات آموزش عالی</p>
                            </div>
                        </div>
                        <div class="header-meta-group">
                            <div class="meta-pill">گروه: <strong>${streamLabel}</strong></div>
                            <div class="meta-pill">تعداد انتخاب‌ها: <strong>${toFa(currentMatrixItems.length)}</strong></div>
                            <div class="meta-pill">تاریخ صدور: <strong>${jalaliDate}</strong></div>
                        </div>
                    </header>

                    <table>
                        <thead>
                            <tr>
                                <th class="center">ردیف</th>
                                <th class="center">کد رشته</th>
                                <th>عنوان رشته تحصیلی</th>
                                <th>دانشگاه</th>
                                <th class="center">استان</th>
                                <th class="center">دوره</th>
                                <th class="center">نیمسال</th>
                                <th class="center">پذیرش</th>
                                <th class="center">ظرفیت</th>
                                <th>توضیحات و شرایط دفترچه سنجش</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <footer class="report-footer">
                        <span>این گزارش بر اساس آخرین ویرایش دفترچه سازمان سنجش آموزش کشور در سامانه تصمیم‌یار رستا تولید شده است.</span>
                        <span>صفحه گزارش اختصاصی داوطلب</span>
                    </footer>
                </body>
                </html>
            `;

            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            printFrame.style.visibility = 'hidden';

            document.body.appendChild(printFrame);

            const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
            frameDoc.open();
            frameDoc.write(printableHtml);
            frameDoc.close();

            let hasPrinted = false;
            const triggerPrint = async () => {
                if (hasPrinted) return;
                hasPrinted = true;

                try {
                    if (frameDoc.fonts) {
                        await frameDoc.fonts.ready;
                    }
                } catch (e) {
                    console.warn('Font loading check error:', e);
                }

                setTimeout(() => {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();
                    setTimeout(() => {
                        if (printFrame.parentNode) {
                            document.body.removeChild(printFrame);
                        }
                    }, 2500);
                }, 200);
            };

            printFrame.onload = triggerPrint;
            setTimeout(triggerPrint, 600);
        }

        if (btnExportPdf) {
            btnExportPdf.addEventListener('click', () => {
                toggleExportDropdown(false);
                exportMatrixToPdf();
            });
        }

        return { mount: mountStep5, render: renderMatrixRows };
    }

    const step5MatrixEngine = initStep5MatrixModule();

    // --- 9. Smart Stepper & Prerequisite Reachability Controller ---
    const btnNextStep = document.getElementById('btnNextStep');
    const btnPrevStep = document.getElementById('btnPrevStep');
    const dockValidationHint = document.getElementById('dockValidationHint');
    const dockValidationText = document.getElementById('dockValidationText');

    function isStepValid(stepNumber) {
        if (stepNumber === 1) return wizardState.activeRegimes.length > 0;
        if (stepNumber === 2) return wizardState.activeProvinces.length > 0;
        if (stepNumber === 3) return wizardState.activeUniversities.length > 0;
        if (stepNumber === 4) return wizardState.activeMajors.length > 0;
        if (stepNumber === 5) return currentMatrixItems.length > 0;
        return false;
    }

    function isStepReachable(targetStep) {
        if (targetStep === 1) return true;
        for (let s = 1; s < targetStep; s++) {
            if (!isStepValid(s)) return false;
        }
        return true;
    }

    function updateStepperUI() {
        const current = wizardState.currentStep;
        const currentValid = isStepValid(current);

        document.querySelectorAll('.step-node').forEach(node => {
            const step = parseInt(node.dataset.step, 10);
            node.classList.remove('active', 'completed', 'unlocked');

            if (step === current) {
                node.classList.add('active');
            } else if (step < current) {
                node.classList.add('completed');
            } else if (isStepReachable(step)) {
                node.classList.add('unlocked');
            }
        });

        const connectors = document.querySelectorAll('.step-connector');
        connectors.forEach((conn, idx) => {
            const fromStep = idx + 1;
            conn.classList.toggle('completed', fromStep < current);
        });

        if (btnPrevStep) btnPrevStep.disabled = (current === 1);
        if (btnNextStep) {
            btnNextStep.disabled = !currentValid;

            if (current === 5) {
                btnNextStep.innerHTML = `<span>تکمیل و ثبت نهایی چینش</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            } else {
                const nextStepTitles = [
                    'استان و شهرها',
                    'رتبه‌بندی دانشگاه‌ها',
                    'رغبت‌سنجی رشته‌ها',
                    'جدول ۳۰۰ انتخاب'
                ];
                btnNextStep.innerHTML = `<span>گام بعدی: ${nextStepTitles[current - 1] || ''}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
            }
        }

        let hintMsg = '';
        if (current === 1) {
            hintMsg = currentValid
                ? 'ضوابط پایه و دوره‌ها تایید شد.'
                : 'حداقل یک دوره تحصیلی در میدان رتبه‌بندی الزامی است.';
        } else if (current === 2) {
            hintMsg = currentValid
                ? 'استان‌های هدف با موفقیت مشخص شدند.'
                : 'حداقل یک استان برای محاسبه بعد مسافت الزامی است.';
        } else if (current === 3) {
            hintMsg = currentValid
                ? 'کیفیت علمی دانشگاه‌های هدف تایید شد.'
                : 'حداقل یک دانشگاه هدف در میدان رتبه‌بندی الزامی است.';
        } else if (current === 4) {
            hintMsg = currentValid
                ? 'رغبت‌سنجی رشته‌های تحصیلی تکمیل است.'
                : 'حداقل یک رشته دانشگاهی در میدان الزامی است.';
        } else if (current === 5) {
            if (catalogErrors.pairs) {
                hintMsg = 'خطا در دریافت اطلاعات رشته‌محل‌ها از سرور. داده‌ای بارگذاری نشد.';
            } else {
                hintMsg = currentValid
                    ? `${toFa(currentMatrixItems.length)} رشته‌محل بهینه‌سازی‌شده آماده تحویل به سازمان سنجش.`
                    : 'هیچ رشته‌محلی با ترکیب‌های انتخابی شما همپوشانی ندارد.';
            }
        }

        if (dockValidationText) dockValidationText.textContent = hintMsg;
        if (dockValidationHint) dockValidationHint.classList.toggle('invalid', !currentValid);
    }

    function validateCurrentStep() {
        const valid = isStepValid(wizardState.currentStep);
        updateStepperUI();
        return valid;
    }

    async function switchStep(targetStep) {
        targetStep = parseInt(targetStep, 10);
        if (isNaN(targetStep) || targetStep < 1 || targetStep > 5) return;

        wizardState.currentStep = targetStep;

        const p1 = document.getElementById('wizardStep1Panel');
        const p2 = document.getElementById('wizardStep2Panel');
        const p3 = document.getElementById('wizardStep3Panel');
        const p4 = document.getElementById('wizardStep4Panel');
        const p5 = document.getElementById('wizardStep5Panel');

        if (p1) p1.classList.toggle('active', targetStep === 1);
        if (p2) p2.classList.toggle('active', targetStep === 2);
        if (p3) p3.classList.toggle('active', targetStep === 3);
        if (p4) p4.classList.toggle('active', targetStep === 4);
        if (p5) p5.classList.toggle('active', targetStep === 5);

        if (targetStep === 2) provincesArena.render();
        if (targetStep === 3) universitiesArena.render();
        if (targetStep === 4) majorsArena.render();
        if (targetStep === 5) await step5MatrixEngine.mount();

        updateStepperUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Dock Navigation Buttons
    if (btnNextStep) {
        btnNextStep.addEventListener('click', async () => {
            if (!validateCurrentStep()) return;

            if (wizardState.currentStep === 5) {
                await triggerAutoSync(true);
                if (targetStudentId) {
                    window.location.href = `/dashboard/institute/?student_id=${targetStudentId}#students`;
                } else {
                    window.location.href = '/dashboard/student/#slots';
                }
                return;
            }

            const stepNames = ['', 'استان‌ها', 'رتبه‌بندی دانشگاه‌ها', 'رغبت‌سنجی رشته‌ها', 'جدول ۳۰۰ انتخاب'];
            const next = wizardState.currentStep + 1;
            await switchStep(next);
            showToast(`به مرحله ${stepNames[next - 1]} خوش آمدید.`);
        });
    }

    if (btnPrevStep) {
        btnPrevStep.addEventListener('click', async () => {
            if (wizardState.currentStep > 1) {
                await switchStep(wizardState.currentStep - 1);
            }
        });
    }

    // Stepper Strip Clicks
    document.querySelectorAll('.step-node').forEach(node => {
        node.addEventListener('click', async () => {
            const target = parseInt(node.dataset.step, 10);
            const current = wizardState.currentStep;

            if (target === current) return;

            if (isStepReachable(target)) {
                await switchStep(target);
            } else {
                showToast('برای دسترسی به این گام، ابتدا باید مراحل پیش‌نیاز قبلی را تکمیل فرمایید.');
            }
        });
    });

    // --- 10. Robust Persistence: Debounced Sync & Optimistic Concurrency ---
    let syncTimeout = null;
    let pollInterval = null;

    async function triggerAutoSync(forceImmediate = false) {
        const syncStatusEl = document.getElementById('wizardSyncStatus');
        const syncTextEl = document.getElementById('wizardSyncText');

        if (syncStatusEl && syncTextEl) {
            syncStatusEl.className = 'cloud-status-pill';
            syncTextEl.textContent = 'در حال ذخیره‌سازی...';
        }

        saveToLocalCache();

        clearTimeout(syncTimeout);

        const executeSync = async () => {
            if (wizardState.isLockedByOther) {
                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill offline';
                    syncTextEl.textContent = `قفل توسط ${wizardState.lockedByName || 'کاربر دیگر'}`;
                }
                return;
            }

            const payload = {
                title: wizardState.slotTitle,
                version: wizardState.version,
                preferences: {
                    stream: wizardState.stream,
                    gender: wizardState.gender,
                    lambda_term: wizardState.lambda_term,
                    lambda_records: wizardState.lambda_records,
                    weights: wizardState.weights,
                    active_regimes: wizardState.activeRegimes.map(r => ({ id: r.id, score: r.score })),
                    active_provinces: wizardState.activeProvinces.map(p => ({ id: p.id, score: p.score })),
                    active_universities: wizardState.activeUniversities.map(u => ({ id: u.id, score: u.score })),
                    active_majors: wizardState.activeMajors.map(m => ({ id: m.id, score: m.score }))
                },
                custom_ordering: currentMatrixItems.map(item => ({
                    rank: item.rank,
                    code: item.code,
                    major: item.major,
                    uni: item.uni,
                    province: item.province,
                    uniDesc: item.uniDesc || '',
                    regime: item.regime,
                    isBahman: item.isBahman,
                    byExam: item.byExam !== false
                }))
            };

            const query = targetStudentId ? `?student_id=${targetStudentId}` : '';
            const res = await apiFetch(`slots/${wizardState.slotIndex}${query}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res && res.ok) {
                wizardState.version = res.version;
                wizardState.slotExistsOnServer = true;
                saveToLocalCache();

                // Clean '?new=1' from URL without page reload
                if (urlParams.has('new')) {
                    urlParams.delete('new');
                    const cleanQuery = urlParams.toString() ? `?${urlParams.toString()}` : '';
                    window.history.replaceState(null, '', `${window.location.pathname}${cleanQuery}`);
                }

                // Activate polling once the slot row exists on the server
                if (!pollInterval) {
                    startConcurrencyPolling();
                }

                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill saved';
                    syncTextEl.textContent = 'همگام‌سازی ابری فعال';
                }
            } else if (res && res.status === 423) {
                wizardState.isLockedByOther = true;
                wizardState.lockedByName = res.details?.locked_by || 'کاربر دیگر';
                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill offline';
                    syncTextEl.textContent = `قفل ویرایش: ${wizardState.lockedByName}`;
                }
                showToast(`این چینش در حال حاضر توسط «${wizardState.lockedByName}» در حال تغییر است.`, 'error');
            } else if (res && res.status === 409) {
                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill offline';
                    syncTextEl.textContent = 'تداخل نسخه با سرور';
                }
                await handleConflictResolution();
            } else {
                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill offline';
                    syncTextEl.textContent = 'ذخیره در حافظه محلی مرورگر (آفلاین)';
                }
            }
        };

        if (forceImmediate) {
            await executeSync();
        } else {
            syncTimeout = setTimeout(executeSync, 800);
        }
    }

    async function handleConflictResolution() {
        const query = targetStudentId ? `?student_id=${targetStudentId}` : '';
        const serverData = await apiFetch(`slots/${wizardState.slotIndex}${query}`);

        if (serverData && serverData.slot) {
            applyServerSlot(serverData.slot);
            showToast('ویرایش‌های جدیدتر از سمت همکار دریافت و با جدول ادغام شد.');
        }
    }

    async function applyServerSlot(slot) {
        wizardState.version = slot.version || 1;
        wizardState.slotTitle = slot.title || wizardState.slotTitle;

        const titleEl = document.getElementById('wizardSlotTitle');
        if (titleEl) titleEl.textContent = wizardState.slotTitle;

        const pref = slot.preferences || {};
        const incomingStream = pref.stream || slot.stream || candidateProfile?.stream || wizardState.stream || 'math';
        const streamChanged = incomingStream !== wizardState.stream;

        wizardState.stream = incomingStream;
        wizardState.gender = pref.gender || candidateProfile?.gender || 'male';
        if (pref.lambda_term !== undefined) wizardState.lambda_term = parseFloat(pref.lambda_term);
        if (pref.lambda_records) wizardState.lambda_records = pref.lambda_records;
        if (pref.weights) wizardState.weights = pref.weights;

        // Synchronize Step 1 controls with loaded data
        const streamRadio = document.querySelector(`input[name="paramStream"][value="${wizardState.stream}"]`);
        if (streamRadio) streamRadio.checked = true;

        const genderRadio = document.querySelector(`input[name="paramGender"][value="${wizardState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;

        const termRadio = document.querySelector(`input[name="paramLambdaTerm"][value="${wizardState.lambda_term}"]`);
        if (termRadio) {
            termRadio.checked = true;
            document.querySelectorAll('#semesterOptionsContainer .semester-radio-card').forEach(c => {
                c.classList.toggle('active', c.querySelector('input').checked);
            });
        }

        const recordsRadio = document.querySelector(`input[name="paramLambdaRecords"][value="${wizardState.lambda_records}"]`);
        if (recordsRadio) {
            recordsRadio.checked = true;
            document.querySelectorAll('#admissionOptionsContainer .semester-radio-card').forEach(c => {
                c.classList.toggle('active', c.querySelector('input').checked);
            });
        }

        if (wizardState.weights) {
            setTriWeights(wizardState.weights.alpha, wizardState.weights.beta, wizardState.weights.gamma);
        }

        // If the stream changed on the server, reload all master catalogs before reconciling active selections
        if (streamChanged || majorsMasterCatalog.length === 0) {
            await Promise.all([
                loadRegimesData(wizardState.stream),
                loadProvincesData(wizardState.stream),
                loadUniversitiesData(wizardState.stream),
                loadMajorsData(wizardState.stream),
                loadPairsData(wizardState.stream)
            ]);
        }

        // Reconcile arrays with master catalogs
        if (pref.active_regimes && Array.isArray(pref.active_regimes)) {
            wizardState.activeRegimes = pref.active_regimes.map(r => {
                const match = regimeMasterCatalog.find(m => String(m.id) === String(r.id));
                return {
                    id: String(r.id),
                    title: match ? match.title : (r.title || String(r.id)),
                    desc: match ? match.desc : (r.desc || ''),
                    score: Number(r.score) || 10
                };
            });
        }
        if (pref.active_provinces && Array.isArray(pref.active_provinces)) {
            wizardState.activeProvinces = pref.active_provinces.map(p => {
                const match = provincesMasterCatalog.find(m => String(m.id) === String(p.id));
                return {
                    id: String(p.id),
                    title: match ? match.title : (p.title || String(p.id)),
                    desc: match ? match.desc : (p.desc || ''),
                    score: Number(p.score) || 10
                };
            });
        }
        if (pref.active_universities && Array.isArray(pref.active_universities)) {
            wizardState.activeUniversities = pref.active_universities.map(u => {
                const match = universitiesMasterCatalog.find(m => String(m.id) === String(u.id));
                return {
                    id: String(u.id),
                    title: match ? match.title : (u.title || String(u.id)),
                    desc: match ? match.desc : (u.desc || ''),
                    score: Number(u.score) || 10
                };
            });
        }
        if (pref.active_majors && Array.isArray(pref.active_majors)) {
            wizardState.activeMajors = pref.active_majors.map(m => {
                const match = majorsMasterCatalog.find(catItem => String(catItem.id) === String(m.id));
                return {
                    id: String(m.id),
                    title: match ? match.title : (m.title || String(m.id)),
                    desc: match ? match.desc : (m.desc || ''),
                    score: Number(m.score) || 10
                };
            });
        }

        if (Array.isArray(slot.custom_ordering) && slot.custom_ordering.length > 0) {
            const pairsMap = new Map(pairsMasterCatalog.map(p => [String(p.code), p]));

            const rehydrated = slot.custom_ordering.map((item, idx) => {
                const match = pairsMap.get(String(item.code));
                if (!match) {
                    return { ...item, rank: idx + 1 };
                }

                const isBahman = (match.capacityTerm2 > 0 && (!match.capacityTerm1 || match.capacityTerm1 === 0));

                return {
                    rank: idx + 1,
                    code: String(match.code),
                    major: match.major,
                    uni: match.university,
                    province: match.province,
                    uniDesc: match.campus || item.uniDesc || '',
                    regime: match.courseType,
                    isBahman: isBahman,
                    byExam: match.byExam !== false,
                    capacityTerm1: match.capacityTerm1 ?? 0,
                    capacityTerm2: match.capacityTerm2 ?? 0,
                    genderMen: Boolean(match.genderMen),
                    genderWomen: Boolean(match.genderWomen),
                    notes: match.notes || ''
                };
            });

            wizardState.customOrdering = rehydrated;
            currentMatrixItems = rehydrated;
        } else {
            wizardState.customOrdering = null;
            currentMatrixItems = [];
        }

        regimeArena.render();
        provincesArena.render();
        universitiesArena.render();
        majorsArena.render();

        if (wizardState.currentStep === 5) {
            await step5MatrixEngine.mount();
        }

        validateCurrentStep();
        saveToLocalCache();
    }

    function startConcurrencyPolling() {
        if (pollInterval) clearInterval(pollInterval);
        if (!wizardState.slotExistsOnServer) return;

        pollInterval = setInterval(async () => {
            if (!wizardState.slotExistsOnServer) return;

            const query = targetStudentId ? `&student_id=${targetStudentId}` : '';
            const poll = await apiFetch(`slots/${wizardState.slotIndex}/poll?version=${wizardState.version}${query}`);

            if (!poll || !poll.ok || poll.exists === false) return;

            const syncStatusEl = document.getElementById('wizardSyncStatus');
            const syncTextEl = document.getElementById('wizardSyncText');

            if (poll.is_locked) {
                wizardState.isLockedByOther = true;
                wizardState.lockedByName = poll.locked_by || 'کاربر دیگر';
                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill offline';
                    syncTextEl.textContent = `قفل ویرایش: ${wizardState.lockedByName}`;
                }
            } else {
                wizardState.isLockedByOther = false;
                wizardState.lockedByName = null;
                if (syncStatusEl && syncTextEl && !syncStatusEl.classList.contains('saved')) {
                    syncStatusEl.className = 'cloud-status-pill saved';
                    syncTextEl.textContent = 'همگام‌سازی ابری فعال';
                }
            }

            if (poll.modified) {
                wizardState.version = poll.version;
                await applyServerSlot({
                    version: poll.version,
                    title: poll.title,
                    stream: poll.stream,
                    preferences: poll.preferences,
                    custom_ordering: poll.custom_ordering
                });
                showToast('تغییرات جلسه مشترک به‌‌صورت زنده با این رایانه همگام‌سازی شد.');
            }
        }, 3000);
    }

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
        }, 3000);
    }

    // --- 11. Initial Boot Sequence ---
    async function bootWizard() {
        // 1. Fetch Server Slot & Candidate Profile FIRST before touching DOM
        const query = targetStudentId ? `?student_id=${targetStudentId}` : '';
        const serverData = await apiFetch(`slots/${wizardState.slotIndex}${query}`);

        candidateProfile = serverData?.student || null;
        if (!candidateProfile && !targetStudentId) {
            const meData = await apiFetch('auth/me');
            if (meData && meData.user) {
                candidateProfile = meData.user;
            }
        }

        let hasLoadedSlot = false;

        if (serverData && serverData.exists && serverData.slot) {
            wizardState.slotExistsOnServer = true;
            if (serverData.is_locked) {
                wizardState.isLockedByOther = true;
                wizardState.lockedByName = serverData.locked_by || 'کاربر دیگر';
                const syncStatusEl = document.getElementById('wizardSyncStatus');
                const syncTextEl = document.getElementById('wizardSyncText');
                if (syncStatusEl && syncTextEl) {
                    syncStatusEl.className = 'cloud-status-pill offline';
                    syncTextEl.textContent = `قفل ویرایش: ${wizardState.lockedByName}`;
                }
            }
            await applyServerSlot(serverData.slot);
            hasLoadedSlot = true;
            startConcurrencyPolling();
        } else {
            wizardState.slotExistsOnServer = false;
        }

        // 2. For new or unpersisted slots, enforce user account settings
        if (!hasLoadedSlot) {
            const hasCachedDraft = isNew ? false : loadFromLocalCache();

            if (candidateProfile) {
                // Profile ALWAYS dictates candidate identity (gender & stream) on new slots
                if (candidateProfile.gender) wizardState.gender = candidateProfile.gender;
                if (candidateProfile.stream && (!hasCachedDraft || !wizardState.stream)) {
                    wizardState.stream = candidateProfile.stream;
                }
            }

            if (!wizardState.gender) wizardState.gender = 'male';
            if (!wizardState.stream) wizardState.stream = 'math';

            initHeaderAndProfile();
            initTriWeightsModule();

            await Promise.all([
                loadRegimesData(wizardState.stream),
                loadProvincesData(wizardState.stream),
                loadUniversitiesData(wizardState.stream),
                loadMajorsData(wizardState.stream),
                loadPairsData(wizardState.stream)
            ]);

            if (!hasCachedDraft) {
                if (wizardState.activeRegimes.length === 0) wizardState.activeRegimes = seedInitialActive(regimeMasterCatalog, 1);
                if (wizardState.activeProvinces.length === 0) wizardState.activeProvinces = seedInitialActive(provincesMasterCatalog, 3);
                if (wizardState.activeUniversities.length === 0) wizardState.activeUniversities = seedInitialActive(universitiesMasterCatalog, 3);
                if (wizardState.activeMajors.length === 0) wizardState.activeMajors = seedInitialActive(majorsMasterCatalog, 3);
            }

            regimeArena.render();
            provincesArena.render();
            universitiesArena.render();
            majorsArena.render();
        } else {
            initHeaderAndProfile();
            initTriWeightsModule();
        }

        // 3. Step parameter routing (&step=5) or fallback to Step 1
        const targetStepParam = parseInt(urlParams.get('step'), 10);
        if (!isNaN(targetStepParam) && targetStepParam >= 1 && targetStepParam <= 5) {
            await switchStep(targetStepParam);
        } else {
            validateCurrentStep();
        }

        // 4. Release Lock on Page Departure
        window.addEventListener('pagehide', () => {
            if (wizardState.slotExistsOnServer && !wizardState.isLockedByOther) {
                const token = getToken();
                if (token && navigator.sendBeacon) {
                    const releaseQuery = targetStudentId ? `?student_id=${targetStudentId}` : '';
                    const url = `/api/slots/${wizardState.slotIndex}/release-lock${releaseQuery}`;
                    const payload = JSON.stringify({ token, student_id: targetStudentId || undefined });
                    const blob = new Blob([payload], { type: 'application/json' });
                    navigator.sendBeacon(url, blob);
                }
            }
        });
    }

    bootWizard();
});