<div align="center">

# 🏛️ Rasta

### Algorithmic Multi-Criteria Decision Engine for University & Major Ranking

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![PHP Version](https://img.shields.io/badge/PHP-%3E%3D8.0-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://www.php.net/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/smabedi/rasta/pulls)

<br/>

[**Live Demo**](https://rasta-app.ir) • [**Major Matrix Validator**](https://rasta-app.ir/management/major-matrix/) • [**Report Bug / Feedback**](https://github.com/smabedi/rasta/issues)

<br/>

<p>
  <b>"Choose your major, now smarter."</b><br/>
  A decision-support system designed to curate valid university-major combinations and generate an optimal 150-choice preference list for Iranian National University Entrance Exam (Konkur) candidates.
</p>

</div>

---

## 📌 Problem Statement

In the Iranian National University Entrance Examination (Konkur), graduates must assemble a ranked preference list containing up to **150 academic choices**. Candidates invariably evaluate choices across two orthogonal dimensions:
1. **Institution & Geography:** Academic reputation, research ranking, faculty prestige, living costs, and geographical distance.
2. **Field of Study (Major):** Career prospects, curriculum relevance, and personal aptitude.

Traditional counseling methods and manual sorting introduce three systemic points of failure:
* **Non-Existent Combinations:** Candidates routinely include invalid pairs that are not offered in official catalogs (e.g., *Psychology at Sharif University of Technology*).
* **Compensatory Scoring Bias:** Additive linear averages allow a high institutional score to compensate for an undesirable major, unintentionally placing candidates into disciplines they dislike.
* **Clerical Errors:** Manual rearrangement of 150 items on paper or spreadsheets results in misplaced priority codes and permanent misallocation.

---

## 💡 Algorithmic Model & Mathematics

Rasta resolves this by decoupling institutional ranking from discipline preferences, evaluating candidate choices over a **filtered bipartite graph** and a **multiplicative utility function**.

### 1. Pruning Matrix (Boolean Validation Grid)
The Cartesian product of selected universities $U$ and majors $M$ is evaluated against an authoritative validation matrix $V[u, m]$:

$$V[u, m] = \begin{cases} 1 & \text{if combination exists in official catalog} \\ 0 & \text{if invalid / pruned} \end{cases}$$

Candidate pairs where $V[u, m] = 0$ are pruned prior to ranking.

### 2. Preference Utility Function (Cobb-Douglas Model)
To prevent the flaws of linear averaging, Rasta uses a multiplicative utility function where a zero or near-zero preference in any essential attribute heavily dampens the overall score:

$$U(u, m) = (R_m)^\alpha \cdot (R_u)^\beta \cdot (C_{\text{city}(u)})^\gamma$$

* $R_m \in [1, 10]$: Subjective user rating for major $m$
* $R_u \in [1, 10]$: Subjective user rating for university $u$
* $C_{\text{city}(u)} \in [1, 10]$: Desirability factor for the host city of university $u$
* $\alpha, \beta, \gamma \in [0, 1]$: Candidate priority weights satisfying $\alpha + \beta + \gamma = 1$

---

## ✨ System Features

* **Multi-Role Collaborative Ecosystem:**
  * Multi-tenant architecture supporting Super Administrators, Educational Centers (Institutes), Institute-Affiliated Candidates, and Independent Applicants (`داوطلب آزاد`)[cite: 2, 3].
  * Unique institutional invite codes (`invite_code`) allowing schools and counseling centers to manage student cohorts without shared credentials[cite: 2, 8].
* **20-Slot Scenario Engine (سامانه چینش‌های ۲۰گانه):**
  * Up to 20 customizable, isolated ranking scenarios per student with custom naming, instant cloning, and baseline preservation[cite: 2, 3].
  * Collaborative live synchronization between counselors and applicants powered by 1.5-second delta-polling[cite: 2, 3].
  * Optimistic concurrency control using incremental version tags and lease timestamps (`locked_until`) to eliminate write collisions during shared counseling sessions[cite: 2, 3].
* **Algorithmic Utility Ranking & Weights Lab:**
  * Multi-criteria preference modeling evaluating field of study ratings ($R_m$), university prestige ($R_u$), and city desirability factors ($C_{\text{city}}$) under constrained priority weights ($\alpha + \beta + \gamma = 1$)[cite: 1, 2].
  * Dynamic penalty discounting for admission semester selection ($\lambda_{\text{term}}$ for Bahman entry) and regional service commitment bonds ($\lambda_{\text{commit}}$)[cite: 2].
  * Dedicated interactive Weights Lab (`/dev/weights-lab/`) for real-time mathematical simulation, weight distribution testing, and discount coefficient calibration[cite: 2, 5].
* **Modern Authentication & Unified Access Control:**
  * Dual-channel authentication supporting bcrypt-hashed passwords and pattern-based SMS OTP verifications[cite: 2, 3].
  * Secure stateless bearer token sessions (`auth_tokens`) with 30-day life cycles[cite: 2, 3].
  * Viewport-constrained modal interface with internal kinetic scrolling, two-column form compaction, and automatic Persian/Arabic digit normalization[cite: 4, 5].
  * Role-aware dynamic navigation header with session-aware dropdown menus and automated workspace routing[cite: 7, 8].
* **Administration & Governance Dashboard (`/management/admin/`):**
  * Responsive Super Administrator workspace featuring aggregate platform metrics and active connection telemetry[cite: 2, 3].
  * Complete management workflows for user role modifications, password resets, and institute provisioning with one-click invite code copying[cite: 2, 3, 5].
  * Standardized Persian digit rendering, search filtering, and integrated developer tooling links[cite: 2, 5].
* **Frontend Ergonomics & Accessibility:**
  * Zero external JavaScript framework dependencies; engineered entirely in native ES6+[cite: 1, 2].
  * Native RTL typography using local variable Vazirmatn Round-Dots (`Vazirmatn-RD`)[cite: 2].
  * Custom SVG chevrons, tactile elevation physics, and full `@media (prefers-reduced-motion: reduce)` compliance[cite: 1, 6, 7].

---

## 🏗️ Technical Architecture

* **Presentation & Client Layer (`/`, `/management`, `/dev`, `/includes`):**
  * Modular ES6+ service modules (`auth.js`, `core.js`) managing authentication handshakes, session state, and reactive UI interactions[cite: 2, 5].
  * Native Apache Server-Side Includes (SSI) architecture (`header.html`, `footer.html`, `favicons.html`) ensuring modular page shell composition without client-side rendering lag[cite: 1, 3, 8].
  * Centralized design system (`css/global.css`, `landing.css`) with uniform CSS design tokens, modern form controls, and RTL-balanced optical alignments[cite: 1, 4, 6].
* **Persistence & Hybrid Data Model (`/data`):**
  * **Relational ACID Store (`data/rasta.sqlite`):** High-concurrency SQLite database operating in Write-Ahead Logging (`PRAGMA journal_mode = WAL`) with busy timeouts, managing `users`, `institutes`, `scenario_slots`, `sms_otps`, `auth_tokens`, and `presence`[cite: 2, 3, 5].
  * **Authoritative Catalogs (`data/*.json`):** Static datasets (`universities.json`, `majors_math.json`, `majors_experimental.json`, `majors_humanities.json`) extracted deterministically from official Sanjesh vector PDFs[cite: 2, 3].
* **Backend REST API (`api.php`):**
  * Zero-dependency PHP backend service (PHP 8.0+) structured with clean separation of schema, auth guards, and REST endpoint dispatchers[cite: 1, 2].
  * Strict Anti-IDOR scoping guards (`resolveTargetStudentId`), role enforcement middleware (`Auth::requireRole`), and atomic transaction execution[cite: 2, 3].
  * Concurrency endpoints providing lightweight 1.5-second delta-polling responses, optimistic lock acquisition, and in-database presence tracking[cite: 2, 3, 5].
* **Server Infrastructure & Routing (`.htaccess`, `router.php`):**
  * Hardened Apache/LiteSpeed configuration enforcing HTTPS, disabling directory browsing, and explicitly denying HTTP downloads of `.sqlite`, `.db`, `.wal`, and `.shm` files[cite: 2, 3].
  * Internal URL rewrite rules proxying `/api/*` requests directly to `api.php` while preserving query parameters[cite: 2, 3].
  * Static MIME caching for web fonts and SVG assets paired with zero-cache expiration headers on dynamic JSON responses[cite: 2].
  * Built-in local development router (`router.php`) for execution via the standard PHP built-in web server[cite: 1].

---

## 🚀 Quickstart

### Prerequisites
* [PHP](https://www.php.net/) (v8.0 or higher)
* Web server: Apache (with `mod_rewrite` and `mod_include`) or PHP CLI for local development.

### Running Locally
```bash
# 1. Clone repository
git clone https://github.com/smabedi/rasta.git
cd rasta

# 2. Start the built-in development server
php -S 127.0.0.1:8000 router.php
```

The application will be running locally at:
```text
http://127.0.0.1:8000
```

---

## 🛡️ Administrative & Annotation Workflow

1. Navigate to `/management/admin/` on first launch to configure the master administrator account.
2. The administrator creates dedicated editor profiles for academic advisors or annotators.
3. Annotators authenticate at `/management/major-matrix/` and toggle combinations to match Sanjesh catalogs.
4. Clicking **Save Changes** commits the payload directly to the server's disk storage under a safe ASCII identifier, with client-side JSON export available at any time.

---

## 🤝 Contributing

Contributions to improve ranking heuristics, expand regional catalogs, or enhance UI ergonomics are welcome:
1. Fork the repository (`Fork`).
2. Create a dedicated feature branch (`git checkout -b feature/RankingOptimization`).
3. Commit your changes (`git commit -m 'feat: Enhance matrix serialization'`).
4. Push to the branch (`git push origin feature/RankingOptimization`).
5. Open a **Pull Request**.

---

## 👨‍💻 Author

**Seyed Mehdi Abedi**
* Portfolio: [smabedi.ir](https://smabedi.ir)
* GitHub: [@smabedi](https://github.com/smabedi)

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (GNU AGPLv3)**.

* You are free to inspect, run, modify, and distribute this software.
* Under the network clause of the AGPLv3, anyone providing a modified version of this software as a networked service (SaaS or hosted platform) must provide the complete source code of that modified version to all users under the same AGPLv3 terms.
* Proprietary, closed-source commercial exploitation by commercial counseling agencies without open distribution is prohibited.