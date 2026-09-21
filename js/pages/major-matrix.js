/**
 * Rasta | Major Matrix Controller (with In-App Toasts & Drafts)
 */

const AVAILABLE_STREAMS = [
    { id: "math", label: "ریاضی و فنی", file: "majors_math.json" },
    { id: "humanities", label: "علوم انسانی", file: "majors_humanities.json" },
    { id: "experimental", label: "علوم تجربی", file: "majors_experimental.json" }
];

let currentSession = null;
let activeStream = AVAILABLE_STREAMS[0].id;
let targetUserId = null;
let targetUserName = null;
let loadedTimestamp = 0;

let universitiesCatalog = [];
let majorsCache = {};
let matrixState = {};
let isDragging = false;
let dragTargetValue = 0;

// DOM Selectors
const userModal = document.getElementById("user-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const matrixLoginForm = document.getElementById("matrix-login-form");
const inputUsername = document.getElementById("input-username");
const inputPin = document.getElementById("input-pin");
const loginErrorMsg = document.getElementById("login-error-msg");
const displayUser = document.getElementById("display-user");
const btnLogout = document.getElementById("btn-logout");
const linkAdmin = document.getElementById("link-admin");

const streamToggleContainer = document.getElementById("stream-toggle-container");
const profileSelect = document.getElementById("profile-select");
const loadStatus = document.getElementById("load-status");
const matrixTheadRow = document.getElementById("matrix-thead-row");
const matrixTbody = document.getElementById("matrix-tbody");
const btnSave = document.getElementById("btn-save");
const btnExportJson = document.getElementById("btn-export-json");

// 1. Session Gate
async function checkSession() {
    currentSession = RastaAuth.getSession();
    if (!currentSession) {
        userModal.classList.remove("hidden");
        inputUsername.focus();
    } else {
        userModal.classList.add("hidden");
        displayUser.textContent = currentSession.username;
        if (currentSession.role === 'ADMIN') {
            linkAdmin.classList.remove('hidden');
        }
        targetUserId = currentSession.id;
        targetUserName = currentSession.username;
        await initApp();
    }
}

btnCloseModal.addEventListener("click", () => {
    window.location.href = "/";
});

matrixLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErrorMsg.textContent = "";

    const res = await RastaAuth.login(inputUsername.value, inputPin.value);
    if (res.success) {
        await checkSession();
        RastaToast.show(`خوش آمدید، ${currentSession.username}`, 'success');
    } else {
        loginErrorMsg.textContent = res.message;
        RastaToast.show(res.message || 'نام کاربری یا رمز عبور نامعتبر است.', 'error');
    }
});

btnLogout.addEventListener("click", () => {
    RastaAuth.logout();
    window.location.reload();
});

// 2. Main Lifecycle
async function initApp() {
    renderStreamToggle();
    attachDragListeners();

    try {
        setLoading(true, "در حال دریافت کاتالوگ دانشگاه‌ها...");
        universitiesCatalog = await fetchJson("/data/universities.json");
        await switchStream(activeStream);
    } catch (err) {
        console.error(err);
        setLoading(false);
        RastaToast.show('خطا در برقراری ارتباط با وب‌سرور.', 'error');
    }
}

async function fetchJson(filePath) {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${filePath}`);
    return await res.json();
}

// 3. Stream Controller
function renderStreamToggle() {
    streamToggleContainer.innerHTML = "";
    AVAILABLE_STREAMS.forEach(stream => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `segment-btn ${stream.id === activeStream ? "active" : ""}`;
        btn.textContent = stream.label;
        btn.dataset.stream = stream.id;

        btn.addEventListener("click", async () => {
            if (activeStream !== stream.id) await switchStream(stream.id);
        });

        streamToggleContainer.appendChild(btn);
    });
}

async function switchStream(streamId) {
    activeStream = streamId;

    document.querySelectorAll(".segment-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.stream === streamId);
    });

    const streamConfig = AVAILABLE_STREAMS.find(s => s.id === streamId);
    if (!majorsCache[streamId]) {
        setLoading(true, `در حال دریافت رشته‌های ${streamConfig.label}...`);
        try {
            majorsCache[streamId] = await fetchJson(`/data/${streamConfig.file}`);
        } catch (err) {
            setLoading(false);
            RastaToast.show(`خطا در فراخوانی فایل کاتالوگ ${streamConfig.label}`, 'error');
            return;
        }
    }

    setLoading(false);
    await populateProfilesDropdown();
    await loadMatrixData(targetUserId);
    renderMatrixTable();
}

// 4. Multi-User Dropdown (Fetched from Server)
async function populateProfilesDropdown() {
    profileSelect.innerHTML = "";
    const users = await RastaAuth.fetchUsers();

    if (!users.some(u => u.id === targetUserId)) {
        targetUserId = currentSession.id;
        targetUserName = currentSession.username;
    }

    users.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.dataset.username = u.username;
        opt.textContent = (u.id === currentSession.id) ? `نسخه من (${u.username})` : `نسخه همکار: ${u.username}`;
        if (u.id === targetUserId) opt.selected = true;
        profileSelect.appendChild(opt);
    });
}

profileSelect.addEventListener("change", async (e) => {
    targetUserId = e.target.value;
    const selectedOpt = profileSelect.options[profileSelect.selectedIndex];
    targetUserName = selectedOpt.dataset.username;
    await loadMatrixData(targetUserId);
    renderMatrixTable();
    RastaToast.show(`نسخه «${targetUserName}» بارگذاری شد.`, 'info');
});

// 5. Server Data & Client Draft Resolution
function getDraftKey(userId, stream) {
    return `rasta_draft_${stream}_${userId}`;
}

async function loadMatrixData(userId) {
    setLoading(true, "در حال فراخوانی فایل ماتریس از سرور...");
    try {
        const res = await fetch(`/api/matrix/${activeStream}/${userId}`);
        const serverData = await res.json();

        matrixState = serverData.matrix || {};
        loadedTimestamp = serverData.updatedAt || 0;

        // Check for local unsaved draft
        const draftKey = getDraftKey(userId, activeStream);
        const localDraft = localStorage.getItem(draftKey);
        if (localDraft) {
            const parsedDraft = JSON.parse(localDraft);
            if (parsedDraft.timestamp > loadedTimestamp) {
                matrixState = parsedDraft.matrix;
                setLoading(false);
                RastaToast.show('پیش‌نویس ذخیره‌نشده شما از حافظه مرورگر بازیابی شد.', 'warning');
                return;
            }
        }
        setLoading(false);
    } catch (e) {
        matrixState = {};
        setLoading(false);
        RastaToast.show('خطا در دریافت اطلاعات ماتریس از سرور.', 'error');
    }
}

// 6. Cell Drag-to-Toggle & Draft Auto-Saving
function attachCellInteraction(cell) {
    cell.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isDragging = true;
        const isCurrentlyInvalid = cell.classList.contains("invalid");
        dragTargetValue = isCurrentlyInvalid ? 1 : 0;
        applyCellState(cell, dragTargetValue);
    });

    cell.addEventListener("mouseenter", () => {
        if (isDragging) {
            applyCellState(cell, dragTargetValue);
        }
    });
}

function applyCellState(cell, targetValue) {
    const uniId = cell.dataset.uni;
    const majorId = cell.dataset.major;

    if (!matrixState[uniId]) matrixState[uniId] = {};
    matrixState[uniId][majorId] = targetValue;

    if (targetValue === 0) {
        cell.classList.add("invalid");
    } else {
        cell.classList.remove("invalid");
    }

    // Cache to client draft silently
    const draftKey = getDraftKey(targetUserId, activeStream);
    localStorage.setItem(draftKey, JSON.stringify({
        timestamp: Date.now(),
        matrix: matrixState
    }));
    setLoading(false, "● تغییرات در پیش‌نویس موقت مرورگر ذخیره شد");
}

function attachDragListeners() {
    window.addEventListener("mouseup", () => {
        isDragging = false;
    });
}

function setLoading(isLoading, message = "") {
    loadStatus.textContent = isLoading ? message : message;
}

// 7. Official Save to Server
btnSave.addEventListener("click", async () => {
    setLoading(true, "در حال ذخیره‌سازی روی سرور...");

    try {
        const res = await fetch(`/api/matrix/${activeStream}/${targetUserId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matrix: matrixState,
                modifiedByName: currentSession.username
            })
        });

        const data = await res.json();
        if (res.ok) {
            loadedTimestamp = data.updatedAt;
            localStorage.removeItem(getDraftKey(targetUserId, activeStream));
            setLoading(false);
            RastaToast.show(`تغییرات ماتریس برای «${targetUserName}» روی سرور ذخیره شد.`, 'success');
        } else {
            setLoading(false);
            RastaToast.show(data.error || 'خطا در ثبت اطلاعات روی سرور.', 'error');
        }
    } catch (e) {
        setLoading(false);
        RastaToast.show('خطای شبکه در ارتباط با سرور.', 'error');
    }
});

// 8. Grid Viewport Renderer
function renderMatrixTable() {
    const currentMajors = majorsCache[activeStream] || [];

    matrixTheadRow.innerHTML = '<th class="sticky-cell sticky-corner">دانشگاه / رشته</th>';
    currentMajors.forEach(major => {
        const th = document.createElement("th");
        th.textContent = major.name || major.title;
        matrixTheadRow.appendChild(th);
    });

    matrixTbody.innerHTML = "";
    universitiesCatalog.forEach(uni => {
        const tr = document.createElement("tr");

        const uniTh = document.createElement("th");
        uniTh.className = "sticky-cell";
        uniTh.textContent = uni.name || uni.title;
        tr.appendChild(uniTh);

        currentMajors.forEach(major => {
            const td = document.createElement("td");
            td.className = "matrix-cell";
            td.dataset.uni = uni.id || uni.code;
            td.dataset.major = major.id || major.code;

            const isAssigned = matrixState[uni.id] && matrixState[uni.id][major.id] !== undefined;
            const isValid = isAssigned ? matrixState[uni.id][major.id] : 1;

            if (isValid === 0) {
                td.classList.add("invalid");
            }

            attachCellInteraction(td);
            tr.appendChild(td);
        });

        matrixTbody.appendChild(tr);
    });
}

// 9. Export Client JSON
btnExportJson.addEventListener("click", () => {
    const payload = {
        meta: {
            stream: activeStream,
            profileOwner: targetUserName,
            exportedBy: currentSession.username,
            exportedAt: new Date().toISOString()
        },
        matrix: matrixState
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix_${activeStream}_${targetUserId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    RastaToast.show('فایل خروجی JSON دانلود شد.', 'info');
});

// Initialize
void checkSession();
