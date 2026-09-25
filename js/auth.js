/**
 * 🏛️ Rasta Public Authentication & Header Manager
 */

const AUTH_API = '/api';
let authToken = localStorage.getItem('rasta_token') || '';
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    initHeaderState();
    setupAuthModalListeners();
});

function normalizeDigits(val) {
    if (!val) return '';
    return val.toString()
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .trim();
}

function toPersianDigits(val) {
    if (val === null || val === undefined || val === '') return '';
    return val.toString().replace(/\d/g, d => ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'][d]);
}

// 1. Session & Header Synchronization
async function initHeaderState() {
    const slot = document.getElementById('headerUserSlot');
    if (!authToken) {
        renderLoggedOutHeader(slot);
        return;
    }

    try {
        const res = await fetch(`${AUTH_API}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.ok && data.user) {
            currentUser = data.user;
            renderLoggedInHeader(slot, currentUser);
        } else {
            clearSession();
            renderLoggedOutHeader(slot);
        }
    } catch {
        renderLoggedOutHeader(slot);
    }
}

function renderLoggedOutHeader(slot) {
    slot.innerHTML = `
        <button class="btn-auth-trigger" id="btnOpenAuthModal" type="button" aria-label="ورود یا ثبت‌نام">
            <svg class="auth-trigger-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span class="auth-trigger-text">ورود</span>
            <span class="auth-trigger-pipe"></span>
            <span class="auth-trigger-text">ثبت‌نام</span>
        </button>
    `;
    const openBtn = document.getElementById('btnOpenAuthModal');
    if (openBtn) {
        openBtn.addEventListener('click', () => openAuthModal());
    }
}

function renderLoggedInHeader(slot, user) {
    const roleLabels = {
        'admin': { title: 'مدیر کل', url: '/management/admin/' },
        'institute': { title: 'مشاور آموزشگاه', url: '/management/institute/' },
        'student_affiliated': { title: 'دانش‌آموز وابسته', url: '/' },
        'student_independent': { title: 'داوطلب آزاد', url: '/' }
    };
    const roleInfo = roleLabels[user.role] || { title: 'کاربر', url: '/' };

    slot.innerHTML = `
        <div class="user-dropdown-wrapper">
            <button class="btn-auth-trigger user-dropdown-trigger" id="btnUserDropdown" type="button" aria-expanded="false" aria-haspopup="true">
                <!-- RTL: Name on the right -->
                <span class="user-dropdown-name">${escapeHtml(user.full_name)}</span>
                
                <!-- Divider pipe -->
                <span class="auth-trigger-pipe"></span>
                
                <!-- Role on the left -->
                <span class="user-dropdown-role">${roleInfo.title}</span>
                
                <!-- Crisp down chevron on the leftmost end -->
                <svg class="user-dropdown-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>

            <!-- Custom Dropdown Menu -->
            <div class="user-dropdown-menu" id="userDropdownMenu" role="menu">
                <a href="${roleInfo.url}" class="user-dropdown-item" role="menuitem">
                    <svg class="dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    <span>ورود به داشبورد</span>
                </a>
                <div class="user-dropdown-divider"></div>
                <button type="button" class="user-dropdown-item text-danger" id="btnHeaderLogout" role="menuitem">
                    <svg class="dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>خروج از حساب</span>
                </button>
            </div>
        </div>
    `;

    // Dropdown toggle logic
    const dropdownBtn = document.getElementById('btnUserDropdown');
    const dropdownMenu = document.getElementById('userDropdownMenu');

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdownMenu.classList.toggle('active');
        dropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownMenu.classList.remove('active');
            dropdownBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdownMenu.classList.contains('active')) {
            dropdownMenu.classList.remove('active');
            dropdownBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Instant Logout
    document.getElementById('btnHeaderLogout').addEventListener('click', async () => {
        try {
            await fetch(`${AUTH_API}/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            clearSession();
            window.location.href = '/';
        }
    });
}

function clearSession() {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('rasta_token');
    localStorage.removeItem('rasta_admin_token');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}

// 2. Auth Modal Interactivity
function setupAuthModalListeners() {
    const backdrop = document.getElementById('authModalBackdrop');
    const closeBtn = document.getElementById('btnCloseAuthModal');

    // Bind to the statically included header button immediately
    const staticOpenBtn = document.getElementById('btnOpenAuthModal');
    if (staticOpenBtn) {
        staticOpenBtn.addEventListener('click', () => openAuthModal());
    }

    const heroBtn = document.getElementById('btnHeroAuth');
    if (heroBtn) {
        heroBtn.addEventListener('click', () => {
            if (authToken && currentUser) {
                // If the user is already authenticated, take them directly to their workspace
                const roleRedirects = {
                    'admin': '/management/admin/',
                    'institute': '/management/institute/',
                    'student_affiliated': '/',
                    'student_independent': '/'
                };
                window.location.href = roleRedirects[currentUser.role] || '/';
            } else {
                openAuthModal();
            }
        });
    }

    closeBtn.addEventListener('click', () => closeAuthModal());
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeAuthModal();
    });

    // Nav Switcher
    document.querySelectorAll('.auth-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.auth-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = btn.dataset.tab === 'login' ? 'formAuthLogin' :
                btn.dataset.tab === 'register-student' ? 'formAuthRegisterStudent' : 'formAuthRegisterInstitute';
            document.getElementById(targetPane).classList.add('active');
            clearAlert();
        });
    });

    // Login Method Toggle (Password vs. OTP)
    document.querySelectorAll('input[name="login_method"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isOtp = e.target.value === 'otp';
            document.getElementById('loginPasswordGroup').style.display = isOtp ? 'none' : 'block';
            document.getElementById('loginOtpGroup').style.display = isOtp ? 'block' : 'none';
        });
    });

    // Candidate Affiliation Toggle (Independent vs. Code)
    document.querySelectorAll('input[name="cand_affiliation"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const hasCode = e.target.value === 'affiliated';
            document.getElementById('inviteCodeContainer').style.display = hasCode ? 'block' : 'none';
        });
    });

    // Async Institute Code Verification (Debounced)
    let verifyTimeout = null;
    const inviteInput = document.getElementById('candInviteCode');
    const badge = document.getElementById('inviteVerifyBadge');

    inviteInput.addEventListener('input', () => {
        clearTimeout(verifyTimeout);
        const code = inviteInput.value.trim().toUpperCase();
        badge.textContent = '';
        badge.className = 'badge-verification';

        if (code.length < 5) return;

        verifyTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`${AUTH_API}/institutes/verify?code=${encodeURIComponent(code)}`);
                const data = await res.json();
                if (data.ok) {
                    badge.textContent = `✓ ${data.institute.name}`;
                    badge.classList.add('valid');
                } else {
                    badge.textContent = '✗ کد آموزشگاه نامعتبر است';
                    badge.classList.add('invalid');
                }
            } catch {
                badge.textContent = '✗ خطا در بررسی کد';
                badge.classList.add('invalid');
            }
        }, 350);
    });

    // Registration OTP Request with In-Button Countdown
    let regOtpTimer = null;
    const btnRegOtp = document.getElementById('btnRequestRegOtp');
    if (btnRegOtp) {
        btnRegOtp.addEventListener('click', async () => {
            const phone = normalizeDigits(document.getElementById('candPhone').value);
            if (!/^09\d{9}$/.test(phone)) {
                showAlert('لطفاً ابتدا شماره تلفن معتبر ۱۱ رقمی وارد نمایید.');
                return;
            }

            // Provide immediate feedback while network request flies
            btnRegOtp.disabled = true;
            btnRegOtp.textContent = 'در حال ارسال...';

            try {
                const res = await fetch(`${AUTH_API}/auth/otp-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, type: 'register_otp' })
                });
                const data = await res.json();

                if (data.ok) {
                    showAlert('کد تایید ایجاد شد (در کنسول مرورگر لاگ گردید).', false);
                    document.getElementById('candOtpGroup').style.display = 'block';
                    document.getElementById('candPhone').readOnly = true;

                    if (data.dev_sms) {
                        logSimulatedSms(data.dev_sms);
                    }
                    if (data.dev_code) {
                        document.getElementById('candOtpCode').value = data.dev_code;
                    }

                    // Start in-button countdown (180 seconds)
                    let remaining = 120;
                    clearInterval(regOtpTimer);

                    const updateTimerLabel = () => {
                        const m = Math.floor(remaining / 60);
                        const s = remaining % 60;
                        const sPad = s < 10 ? '0' + s : s;
                        btnRegOtp.textContent = `ارسال مجدد (${toPersianDigits(m)}:${toPersianDigits(sPad)})`;
                    };

                    updateTimerLabel();
                    regOtpTimer = setInterval(() => {
                        remaining--;
                        if (remaining <= 0) {
                            clearInterval(regOtpTimer);
                            btnRegOtp.textContent = 'ارسال مجدد کد';
                            btnRegOtp.disabled = false;
                            document.getElementById('candPhone').readOnly = false;
                        } else {
                            updateTimerLabel();
                        }
                    }, 1000);
                } else {
                    showAlert(data.error || 'خطا در صدور کد.');
                    btnRegOtp.disabled = false;
                    btnRegOtp.textContent = 'دریافت کد تایید';
                }
            } catch {
                showAlert('ارتباط با سرور برقرار نشد.');
                btnRegOtp.disabled = false;
                btnRegOtp.textContent = 'دریافت کد تایید';
            }
        });
    }

    // Login OTP Request with In-Button Countdown
    let loginOtpTimer = null;
    const btnLoginOtp = document.getElementById('btnRequestOtp');
    if (btnLoginOtp) {
        btnLoginOtp.addEventListener('click', async () => {
            const phone = normalizeDigits(document.getElementById('loginPhone').value);
            if (!/^09\d{9}$/.test(phone)) {
                showAlert('لطفاً ابتدا شماره تلفن معتبر ۱۱ رقمی وارد نمایید.');
                return;
            }

            // Immediate UI feedback
            btnLoginOtp.disabled = true;
            btnLoginOtp.textContent = 'در حال ارسال...';

            try {
                const res = await fetch(`${AUTH_API}/auth/otp-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, type: 'otp' })
                });
                const data = await res.json();

                if (data.ok) {
                    showAlert('کد ورود ارسال شد (در کنسول مرورگر لاگ گردید).', false);

                    // 1. Print formatted simulated SMS to browser console
                    if (data.dev_sms) {
                        logSimulatedSms(data.dev_sms);
                    }
                    // 2. Auto-fill the input in development mode
                    if (data.dev_code) {
                        document.getElementById('loginOtpCode').value = data.dev_code;
                    }

                    // Start in-button countdown (180 seconds)
                    let remaining = 120;
                    clearInterval(loginOtpTimer);

                    const updateTimerLabel = () => {
                        const m = Math.floor(remaining / 60);
                        const s = remaining % 60;
                        const sPad = s < 10 ? '0' + s : s;
                        btnLoginOtp.textContent = `ارسال مجدد (${toPersianDigits(m)}:${toPersianDigits(sPad)})`;
                    };

                    updateTimerLabel();
                    loginOtpTimer = setInterval(() => {
                        remaining--;
                        if (remaining <= 0) {
                            clearInterval(loginOtpTimer);
                            btnLoginOtp.textContent = 'ارسال مجدد کد';
                            btnLoginOtp.disabled = false;
                        } else {
                            updateTimerLabel();
                        }
                    }, 1000);
                } else {
                    showAlert(data.error || 'خطا در ارسال پیامک.');
                    btnLoginOtp.disabled = false;
                    btnLoginOtp.textContent = 'دریافت کد تایید';
                }
            } catch {
                showAlert('ارتباط با سرور برقرار نشد.');
                btnLoginOtp.disabled = false;
                btnLoginOtp.textContent = 'دریافت کد تایید';
            }
        });
    }



    // Counselor Registration OTP Request with In-Button Countdown
    let instOtpTimer = null;
    const btnInstOtp = document.getElementById('btnRequestInstRegOtp');
    if (btnInstOtp) {
        btnInstOtp.addEventListener('click', async () => {
            const phone = normalizeDigits(document.getElementById('instCounselorPhone').value);
            if (!/^09\d{9}$/.test(phone)) {
                showAlert('لطفاً ابتدا شماره تلفن معتبر ۱۱ رقمی وارد نمایید.');
                return;
            }

            btnInstOtp.disabled = true;
            btnInstOtp.textContent = 'در حال ارسال...';

            try {
                const res = await fetch(`${AUTH_API}/auth/otp-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, type: 'register_otp' })
                });
                const data = await res.json();

                if (data.ok) {
                    showAlert('کد تایید ایجاد شد (در کنسول مرورگر لاگ گردید).', false);
                    document.getElementById('instOtpGroup').style.display = 'block';
                    document.getElementById('instCounselorPhone').readOnly = true;

                    if (data.dev_sms) {
                        logSimulatedSms(data.dev_sms);
                    }
                    if (data.dev_code) {
                        document.getElementById('instOtpCode').value = data.dev_code;
                    }

                    let remaining = 120;
                    clearInterval(instOtpTimer);

                    const updateTimerLabel = () => {
                        const m = Math.floor(remaining / 60);
                        const s = remaining % 60;
                        const sPad = s < 10 ? '0' + s : s;
                        btnInstOtp.textContent = `ارسال مجدد (${toPersianDigits(m)}:${toPersianDigits(sPad)})`;
                    };

                    updateTimerLabel();
                    instOtpTimer = setInterval(() => {
                        remaining--;
                        if (remaining <= 0) {
                            clearInterval(instOtpTimer);
                            btnInstOtp.textContent = 'ارسال مجدد کد';
                            btnInstOtp.disabled = false;
                            document.getElementById('instCounselorPhone').readOnly = false;
                        } else {
                            updateTimerLabel();
                        }
                    }, 1000);
                } else {
                    showAlert(data.error || 'خطا در صدور کد.');
                    btnInstOtp.disabled = false;
                    btnInstOtp.textContent = 'دریافت کد تایید';
                }
            } catch {
                showAlert('ارتباط با سرور برقرار نشد.');
                btnInstOtp.disabled = false;
                btnInstOtp.textContent = 'دریافت کد تایید';
            }
        });
    }

    // Form 1: Login Handler
    document.getElementById('formAuthLogin').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const phone = normalizeDigits(document.getElementById('loginPhone').value);
        const method = document.querySelector('input[name="login_method"]:checked').value;

        let payload = { phone };
        let url = `${AUTH_API}/auth/login`;

        if (method === 'password') {
            payload.password = document.getElementById('loginPassword').value.trim();
        } else {
            payload.code = normalizeDigits(document.getElementById('loginOtpCode').value);
            url = `${AUTH_API}/auth/otp-verify`;
        }

        handleAuthResponse(await postData(url, payload));
    });

    // Form 2: Candidate Register Handler
    document.getElementById('formAuthRegisterStudent').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const affiliation = document.querySelector('input[name="cand_affiliation"]:checked').value;
        const payload = {
            full_name: document.getElementById('candFullName').value.trim(),
            phone: normalizeDigits(document.getElementById('candPhone').value),
            code: normalizeDigits(document.getElementById('candOtpCode').value),
            password: document.getElementById('candPassword').value.trim(),
            gender: document.querySelector('input[name="cand_gender"]:checked').value,
            stream: document.querySelector('input[name="cand_stream"]:checked').value,
            academic_year: document.getElementById('candAcademicYear').value,
            invite_code: affiliation === 'affiliated' ? document.getElementById('candInviteCode').value.trim() : ''
        };

        handleAuthResponse(await postData(`${AUTH_API}/auth/register`, payload));
    });

    // Form 3: Institute/Counselor Register Handler
    document.getElementById('formAuthRegisterInstitute').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const contactPhone = normalizeDigits(document.getElementById('instOfficialPhone').value);
        if (!contactPhone) {
            showAlert('تلفن تماس ثابت یا اداری آموزشگاه الزامی است.');
            document.getElementById('instOfficialPhone').focus();
            return;
        }

        const payload = {
            full_name: document.getElementById('instCounselorName').value.trim(),
            phone: normalizeDigits(document.getElementById('instCounselorPhone').value),
            code: normalizeDigits(document.getElementById('instOtpCode').value),
            password: document.getElementById('instPassword').value.trim(),
            institute_name: document.getElementById('instName').value.trim(),
            contact_phone: contactPhone
        };

        handleAuthResponse(await postData(`${AUTH_API}/auth/register-institute`, payload));
    });

    // -------------------------------------------------------------
    // PASSWORD RESET LISTENERS (Add starting here)
    // -------------------------------------------------------------

    const resetPane = document.getElementById('formAuthResetPassword');
    const navTabs = document.querySelector('.auth-nav-tabs');

    // 1. Toggle between Login view and Password Reset view
    const btnOpenForgot = document.getElementById('btnOpenForgotPwd');
    if (btnOpenForgot) {
        btnOpenForgot.addEventListener('click', () => {
            document.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.auth-nav-btn').forEach(b => b.classList.remove('active'));
            if (navTabs) navTabs.style.display = 'none';
            if (resetPane) resetPane.classList.add('active');
            clearAlert();
        });
    }

    const btnCancelReset = document.getElementById('btnCancelResetPwd');
    if (btnCancelReset) {
        btnCancelReset.addEventListener('click', () => {
            if (navTabs) navTabs.style.display = 'flex';
            document.querySelector('.auth-nav-btn[data-tab="login"]')?.click();
        });
    }

    // 2. Request OTP for Password Reset
    let resetOtpTimer = null;
    const btnResetOtp = document.getElementById('btnRequestResetOtp');
    if (btnResetOtp) {
        btnResetOtp.addEventListener('click', async () => {
            const phone = normalizeDigits(document.getElementById('resetPhone').value);
            if (!/^09\d{9}$/.test(phone)) {
                showAlert('لطفاً ابتدا شماره تلفن معتبر ۱۱ رقمی وارد نمایید.');
                return;
            }

            btnResetOtp.disabled = true;
            btnResetOtp.textContent = 'در حال ارسال...';

            try {
                const res = await fetch(`${AUTH_API}/auth/otp-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, type: 'password_reset' })
                });
                const data = await res.json();

                if (data.ok) {
                    showAlert('کد بازیابی ارسال شد (در کنسول مرورگر لاگ گردید).', false);
                    document.getElementById('resetOtpGroup').style.display = 'block';
                    document.getElementById('resetPhone').readOnly = true;

                    if (data.dev_sms) logSimulatedSms(data.dev_sms);
                    if (data.dev_code) document.getElementById('resetOtpCode').value = data.dev_code;

                    let remaining = 120;
                    clearInterval(resetOtpTimer);

                    const updateTimer = () => {
                        const m = Math.floor(remaining / 60);
                        const s = remaining % 60;
                        btnResetOtp.textContent = `ارسال مجدد (${toPersianDigits(m)}:${toPersianDigits(s < 10 ? '0' + s : s)})`;
                    };

                    updateTimer();
                    resetOtpTimer = setInterval(() => {
                        remaining--;
                        if (remaining <= 0) {
                            clearInterval(resetOtpTimer);
                            btnResetOtp.textContent = 'ارسال مجدد کد';
                            btnResetOtp.disabled = false;
                            document.getElementById('resetPhone').readOnly = false;
                        } else {
                            updateTimer();
                        }
                    }, 1000);
                } else {
                    showAlert(data.error || 'خطا در ارسال کد.');
                    btnResetOtp.disabled = false;
                    btnResetOtp.textContent = 'دریافت کد تایید';
                }
            } catch {
                showAlert('ارتباط با سرور برقرار نشد.');
                btnResetOtp.disabled = false;
                btnResetOtp.textContent = 'دریافت کد تایید';
            }
        });
    }

    // 3. Submit New Password & Verification Code
    const formResetPwd = document.getElementById('formAuthResetPassword');
    if (formResetPwd) {
        formResetPwd.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAlert();

            const payload = {
                phone: normalizeDigits(document.getElementById('resetPhone').value),
                code: normalizeDigits(document.getElementById('resetOtpCode').value),
                password: document.getElementById('resetNewPassword').value.trim()
            };

            handleAuthResponse(await postData(`${AUTH_API}/auth/reset-password`, payload));
        });
    }

}

function openAuthModal(defaultTab = 'login') {
    const backdrop = document.getElementById('authModalBackdrop');
    const navTabs = document.querySelector('.auth-nav-tabs');
    if (navTabs) navTabs.style.display = 'flex';
    backdrop.style.display = 'flex';
    const btn = document.querySelector(`.auth-nav-btn[data-tab="${defaultTab}"]`);
    if (btn) btn.click();
}

function closeAuthModal() {
    document.getElementById('authModalBackdrop').style.display = 'none';
    clearAlert();
}

async function postData(url, data) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
    } catch {
        return { ok: false, error: 'خطای ارتباط با سرور' };
    }
}

/**
 * @param {Object} res
 * @param {boolean} res.ok
 * @param {string} [res.token]
 * @param {string} [res.redirect]
 * @param {boolean} [res.registered]
 * @param {string} [res.message]
 * @param {string} [res.error]
 */
function handleAuthResponse(res) {
    if (res.ok && res.token) {
        localStorage.setItem('rasta_token', res.token);
        closeAuthModal();
        if (res.redirect) {
            window.location.href = res.redirect;
        } else {
            window.location.reload();
        }
    } else if (res.ok && res.registered === false) {
        showAlert(res.message || 'این شماره در سامانه ثبت نشده است. لطفاً ابتدا ثبت‌نام کنید.');
    } else {
        showAlert(res.error || res.message || 'عملیات با خطا مواجه شد.');
    }
}

function showAlert(msg, isError = true) {
    const box = document.getElementById('authAlert');
    box.textContent = msg;
    box.style.display = 'block';
    box.style.backgroundColor = isError ? '#fef2f2' : '#f0fdf4';
    box.style.color = isError ? '#b91c1c' : '#15803d';
    box.style.borderColor = isError ? '#fecaca' : '#bbf7d0';
}

function clearAlert() {
    const box = document.getElementById('authAlert');
    box.style.display = 'none';
    box.textContent = '';
}

/**
 * Visual Console Logger for Dev SMS & Invitation Links
 */
function logSimulatedSms(devSms) {
    if (!devSms || !devSms.message) return;

    console.log(
        `%c📱 [شبیه‌ساز پیامک رستا / SMS SIMULATOR]%c\n` +
        `گیرنده: ${devSms.phone}\n` +
        `─────────────────────────────────────\n` +
        `${devSms.message}\n` +
        `─────────────────────────────────────`,
        `background: #0284c7; color: #ffffff; font-weight: bold; font-size: 12px; padding: 4px 8px; border-radius: 4px;`,
        `color: #0f172a; font-family: monospace; font-size: 12px; line-height: 1.5;`
    );
}

// Global helper you can also call for counselor invitations
window.logSimulatedInvite = function(counselorName, inviteCode, inviteUrl) {
    console.log(
        `%c🔗 [لینک دعوت مشاور همکار / COUNSELOR INVITATION]%c\n` +
        `مشاور دعوت‌شده: ${counselorName}\n` +
        `کد اختصاصی: ${inviteCode}\n` +
        `لینک ورود: ${inviteUrl}`,
        `background: #059669; color: #ffffff; font-weight: bold; font-size: 12px; padding: 4px 8px; border-radius: 4px;`,
        `color: #064e3b; font-family: monospace; font-size: 12px; line-height: 1.5;`
    );
};
