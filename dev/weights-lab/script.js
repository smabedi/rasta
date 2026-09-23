/**
 * Rasta | Cobb-Douglas Weight Calibration Engine
 * Strictly Persian Numerals & Synchronized 4-Input Laboratory
 */

document.addEventListener('DOMContentLoaded', () => {

    // --------------------------------------------------------------------------
    // 1. Strict Persian Digits Conversion Helper
    // --------------------------------------------------------------------------
    const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

    function toPersianDigits(value, decimals = null) {
        if (value === null || value === undefined) return '';

        let str;
        if (decimals !== null && typeof value === 'number') {
            str = value.toFixed(decimals);
        } else {
            str = value.toString();
        }

        // Standardize Persian decimal mark (Momayyez ٫)
        str = str.replace('.', '٫');

        // Convert ASCII numbers to Persian Unicode digits
        return str.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[d]);
    }

    // Initialize KaTeX typesetting across the page
    if (window.renderMathInElement) {
        renderMathInElement(document.body, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }

    // Master Weights State
    const weights = {
        alpha: 0.50,
        beta: 0.30,
        gamma: 0.20
    };

    // Internal Token State (10-Point Pool)
    const tokenBudget = {
        m: 5,
        u: 3,
        c: 2
    };

    // DOM Elements - Ribbon
    const dispAlpha = document.getElementById('disp-alpha');
    const dispBeta = document.getElementById('disp-beta');
    const dispGamma = document.getElementById('disp-gamma');
    const dispAlphaPct = document.getElementById('disp-alpha-pct');
    const dispBetaPct = document.getElementById('disp-beta-pct');
    const dispGammaPct = document.getElementById('disp-gamma-pct');
    const dispSum = document.getElementById('disp-sum');

    // DOM Elements - Approach 1: Presets
    const presetBtns = document.querySelectorAll('.preset-btn');

    // DOM Elements - Approach 2: Sliders
    const sliderM = document.getElementById('slider-m');
    const sliderU = document.getElementById('slider-u');
    const sliderC = document.getElementById('slider-c');
    const sliderValM = document.getElementById('slider-val-m');
    const sliderValU = document.getElementById('slider-val-u');
    const sliderValC = document.getElementById('slider-val-c');

    // DOM Elements - Approach 3: Token Budget
    const tokenPoolDisp = document.getElementById('token-pool-disp');
    const tokenValM = document.getElementById('token-val-m');
    const tokenValU = document.getElementById('token-val-u');
    const tokenValC = document.getElementById('token-val-c');
    const tokenPctM = document.getElementById('token-pct-m');
    const tokenPctU = document.getElementById('token-pct-u');
    const tokenPctC = document.getElementById('token-pct-c');
    const stepperBtns = document.querySelectorAll('.btn-stepper');

    // DOM Elements - Approach 4: Ternary Simplex Triangle
    const svg = document.getElementById('ternary-svg');
    const puck = document.getElementById('puck');
    const V1 = { x: 160, y: 28 };   // Major (Top)
    const V2 = { x: 292, y: 235 };  // University (Bottom-Right)
    const V3 = { x: 28, y: 235 };   // City (Bottom-Left)

    // Benchmark Candidates for Real-Time Ranking Proof
    const sampleCandidates = [
        {
            id: 'tehran_ce',
            title: 'مهندسی کامپیوتر',
            uni: 'دانشگاه تهران (روزانه)',
            city: 'تهران',
            Rm: 10.0,
            Ru: 9.2,
            Cc: 9.0
        },
        {
            id: 'sharif_ee',
            title: 'مهندسی برق',
            uni: 'دانشگاه صنعتی شریف (روزانه)',
            city: 'تهران',
            Rm: 7.8,
            Ru: 10.0,
            Cc: 9.0
        },
        {
            id: 'iut_ce',
            title: 'مهندسی کامپیوتر',
            uni: 'دانشگاه صنعتی اصفهان (روزانه)',
            city: 'اصفهان',
            Rm: 10.0,
            Ru: 8.5,
            Cc: 7.0
        }
    ];

    // --------------------------------------------------------------------------
    // 2. Central Synchronizer
    // --------------------------------------------------------------------------
    function setWeights(newAlpha, newBeta, newGamma, source = null) {
        // Enforce sum constraint
        const total = newAlpha + newBeta + newGamma;
        weights.alpha = Math.round((newAlpha / total) * 100) / 100;
        weights.beta = Math.round((newBeta / total) * 100) / 100;
        weights.gamma = Math.round((1 - (weights.alpha + weights.beta)) * 100) / 100;

        // 1. Update Master Ribbon with Persian Numerals
        dispAlpha.textContent = toPersianDigits(weights.alpha, 2);
        dispBeta.textContent = toPersianDigits(weights.beta, 2);
        dispGamma.textContent = toPersianDigits(weights.gamma, 2);
        dispSum.textContent = toPersianDigits(1.0, 2);

        dispAlphaPct.textContent = `${toPersianDigits(Math.round(weights.alpha * 100))}٪`;
        dispBetaPct.textContent = `${toPersianDigits(Math.round(weights.beta * 100))}٪`;
        dispGammaPct.textContent = `${toPersianDigits(Math.round(weights.gamma * 100))}٪`;

        // 2. Sync Approach 1 (Presets)
        presetBtns.forEach(btn => {
            const bA = parseFloat(btn.dataset.alpha);
            const bB = parseFloat(btn.dataset.beta);
            const match = Math.abs(bA - weights.alpha) < 0.05 && Math.abs(bB - weights.beta) < 0.05;
            btn.classList.toggle('active', match);
        });

        // 3. Sync Approach 2 (Sliders)
        if (source !== 'slider') {
            sliderM.value = Math.round(weights.alpha * 100);
            sliderU.value = Math.round(weights.beta * 100);
            sliderC.value = Math.round(weights.gamma * 100);
            sliderValM.textContent = toPersianDigits(sliderM.value);
            sliderValU.textContent = toPersianDigits(sliderU.value);
            sliderValC.textContent = toPersianDigits(sliderC.value);
        }

        // 4. Sync Approach 3 (Tokens)
        if (source !== 'tokens') {
            tokenBudget.m = Math.round(weights.alpha * 10);
            tokenBudget.u = Math.round(weights.beta * 10);
            tokenBudget.c = Math.max(0, 10 - (tokenBudget.m + tokenBudget.u));

            tokenValM.textContent = toPersianDigits(tokenBudget.m);
            tokenValU.textContent = toPersianDigits(tokenBudget.u);
            tokenValC.textContent = toPersianDigits(tokenBudget.c);

            tokenPctM.textContent = `${toPersianDigits(tokenBudget.m * 10)}٪ وزن اثرگذاری`;
            tokenPctU.textContent = `${toPersianDigits(tokenBudget.u * 10)}٪ وزن اثرگذاری`;
            tokenPctC.textContent = `${toPersianDigits(tokenBudget.c * 10)}٪ وزن اثرگذاری`;

            syncStepperDisabledStates();
        }

        // 5. Sync Approach 4 (Ternary Simplex Puck)
        if (source !== 'triangle') {
            const px = weights.alpha * V1.x + weights.beta * V2.x + weights.gamma * V3.x;
            const py = weights.alpha * V1.y + weights.beta * V2.y + weights.gamma * V3.y;
            puck.setAttribute('cx', px.toString());
            puck.setAttribute('cy', py.toString());
        }

        // 6. Recalculate Live Simulation
        updateLiveSimulation();
    }

    // --------------------------------------------------------------------------
    // 3. Approach Listeners
    // --------------------------------------------------------------------------

    // Approach 1: Presets
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const a = parseFloat(btn.dataset.alpha);
            const b = parseFloat(btn.dataset.beta);
            const g = parseFloat(btn.dataset.gamma);
            setWeights(a, b, g, 'presets');
        });
    });

    // Approach 2: Auto-Normalizing Sliders
    function handleSliderChange() {
        const rawM = parseFloat(sliderM.value);
        const rawU = parseFloat(sliderU.value);
        const rawC = parseFloat(sliderC.value);

        sliderValM.textContent = toPersianDigits(rawM);
        sliderValU.textContent = toPersianDigits(rawU);
        sliderValC.textContent = toPersianDigits(rawC);

        const total = rawM + rawU + rawC;
        setWeights(rawM / total, rawU / total, rawC / total, 'slider');
    }

    [sliderM, sliderU, sliderC].forEach(s => {
        s.addEventListener('input', handleSliderChange);
    });

    // Approach 3: Token Budget Steppers
    stepperBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const action = btn.dataset.action;
            const used = tokenBudget.m + tokenBudget.u + tokenBudget.c;

            if (action === 'inc' && used < 10) {
                tokenBudget[target]++;
            } else if (action === 'dec' && tokenBudget[target] > 0) {
                tokenBudget[target]--;
            }

            tokenValM.textContent = toPersianDigits(tokenBudget.m);
            tokenValU.textContent = toPersianDigits(tokenBudget.u);
            tokenValC.textContent = toPersianDigits(tokenBudget.c);

            tokenPctM.textContent = `${toPersianDigits(tokenBudget.m * 10)}٪ وزن اثرگذاری`;
            tokenPctU.textContent = `${toPersianDigits(tokenBudget.u * 10)}٪ وزن اثرگذاری`;
            tokenPctC.textContent = `${toPersianDigits(tokenBudget.c * 10)}٪ وزن اثرگذاری`;

            syncStepperDisabledStates();

            const curTotal = tokenBudget.m + tokenBudget.u + tokenBudget.c;
            if (curTotal > 0) {
                setWeights(tokenBudget.m / 10, tokenBudget.u / 10, tokenBudget.c / 10, 'tokens');
            }
        });
    });

    function syncStepperDisabledStates() {
        const poolRem = 10 - (tokenBudget.m + tokenBudget.u + tokenBudget.c);
        tokenPoolDisp.textContent = `${toPersianDigits(poolRem)} از ${toPersianDigits(10)}`;

        document.querySelector('[data-action="inc"][data-target="m"]').disabled = (poolRem === 0);
        document.querySelector('[data-action="inc"][data-target="u"]').disabled = (poolRem === 0);
        document.querySelector('[data-action="inc"][data-target="c"]').disabled = (poolRem === 0);

        document.querySelector('[data-action="dec"][data-target="m"]').disabled = (tokenBudget.m === 0);
        document.querySelector('[data-action="dec"][data-target="u"]').disabled = (tokenBudget.u === 0);
        document.querySelector('[data-action="dec"][data-target="c"]').disabled = (tokenBudget.c === 0);
    }

    // Approach 4: Ternary Simplex Triangle Dragging
    let isDraggingTriangle = false;

    function updateTriangleCoords(evt) {
        const pt = svg.createSVGPoint();
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

        pt.x = clientX;
        pt.y = clientY;
        const cursor = pt.matrixTransform(svg.getScreenCTM().inverse());

        // Invert barycentric coordinates
        const det = (V2.y - V3.y) * (V1.x - V3.x) + (V3.x - V2.x) * (V1.y - V3.y);
        let a = ((V2.y - V3.y) * (cursor.x - V3.x) + (V3.x - V2.x) * (cursor.y - V3.y)) / det;
        let b = ((V3.y - V1.y) * (cursor.x - V3.x) + (V1.x - V3.x) * (cursor.y - V3.y)) / det;
        let c = 1 - a - b;

        // Clamp to 2-simplex boundaries
        a = Math.max(0, a);
        b = Math.max(0, b);
        c = Math.max(0, c);
        const s = a + b + c;
        a /= s;
        b /= s;
        c /= s;

        const px = a * V1.x + b * V2.x + c * V3.x;
        const py = a * V1.y + b * V2.y + c * V3.y;
        puck.setAttribute('cx', px.toString());
        puck.setAttribute('cy', py.toString());

        setWeights(a, b, c, 'triangle');
    }

    puck.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDraggingTriangle = true;
    });

    svg.addEventListener('mousedown', (e) => {
        isDraggingTriangle = true;
        updateTriangleCoords(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingTriangle) updateTriangleCoords(e);
    });

    window.addEventListener('mouseup', () => {
        isDraggingTriangle = false;
    });

    // Touch support
    svg.addEventListener('touchstart', (e) => {
        isDraggingTriangle = true;
        updateTriangleCoords(e);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (isDraggingTriangle) updateTriangleCoords(e);
    }, { passive: false });

    window.addEventListener('touchend', () => {
        isDraggingTriangle = false;
    });

    // --------------------------------------------------------------------------
    // 4. Live Ranking Preview Engine
    // --------------------------------------------------------------------------
    const candidateCardsContainer = document.getElementById('candidate-cards-container');

    function updateLiveSimulation() {
        const scored = sampleCandidates.map(c => {
            const u = Math.pow(c.Rm, weights.alpha) *
                Math.pow(c.Ru, weights.beta) *
                Math.pow(c.Cc, weights.gamma);
            return { ...c, utility: u };
        });

        // Sort descending by calculated Cobb-Douglas score
        scored.sort((a, b) => b.utility - a.utility);

        candidateCardsContainer.innerHTML = '';
        scored.forEach((item, idx) => {
            const isFirst = idx === 0;
            const card = document.createElement('div');
            card.className = `candidate-choice-card ${isFirst ? 'rank-1' : ''}`;

            card.innerHTML = `
                <div class="choice-top">
                    <div>
                        <h3 class="choice-title">${item.title}</h3>
                        <div class="choice-meta">${item.uni} • ${item.city}</div>
                    </div>
                    <span class="choice-rank-badge">اولویت #${toPersianDigits(idx + 1)}</span>
                </div>

                <div class="choice-ratings">
                    <span>رشته (Rm): <strong>${toPersianDigits(item.Rm, 1)}</strong></span>
                    <span>دانشگاه (Ru): <strong>${toPersianDigits(item.Ru, 1)}</strong></span>
                    <span>شهر (Cc): <strong>${toPersianDigits(item.Cc, 1)}</strong></span>
                </div>

                <div class="choice-utility">
                    <span>مطلوبیت نهایی (U):</span>
                    <span class="utility-score">${toPersianDigits(item.utility, 2)}</span>
                </div>
            `;
            candidateCardsContainer.appendChild(card);
        });
    }

    // Set Initial State
    setWeights(0.50, 0.30, 0.20);
});