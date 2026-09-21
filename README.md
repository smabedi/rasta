<div align="center">

# 🏛️ Rasta

### Algorithmic Multi-Criteria Decision Engine for University & Major Ranking

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![PHP Version](https://img.shields.io/badge/PHP-%3E%3D8.0-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://www.php.net/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/smabedi/rasta/pulls)

<br/>

[**Live Demo**](https://rasta.smabedi.ir) • [**Major Matrix Validator**](https://rasta.smabedi.ir/management/major-matrix/) • [**Report Bug / Feedback**](https://github.com/smabedi/rasta/issues)

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

* **Interactive Validation Matrix (`/management/major-matrix/`):**
  * Fluid mouse drag-to-toggle interaction to mark invalid combinations across large matrices.
  * Distinct architectural diagonal hatch indicators for fast visual auditing of non-existent combinations.
  * Multi-stream support: Mathematics & Engineering, Experimental Sciences, and Humanities.
  * Dual-layer drafting: Real-time browser auto-caching (`localStorage`) coupled with server-side JSON persistence.
  * Versioned JSON snapshot exports directly from the client.
* **Role-Based Collaborator Management (`/management/admin/`):**
  * Zero-hardcoded credentials with an automated first-run master administrator setup screen.
  * Collaborator provisioning with Persian name sanitization and numeric PIN normalization.
  * Non-blocking custom modal dialogs for collaborator revocation.
* **Performance & Accessibility:**
  * Zero external JavaScript framework dependencies; built purely with native ES6+.
  * Modular Layout & Partials architecture using native Apache Server-Side Includes (SSI).
  * Staggered deblur lens entrance animations with full `@media (prefers-reduced-motion: reduce)` compliance.
  * Non-blocking glassmorphic toast notification engine.
  * Local variable Vazirmatn Round-Dots typography with dynamic layout width locking.

---

## 🏗️ Technical Architecture

* **Client Layer (`/css`, `/js`, `/management`, `/includes`):** Modular separation between authentication bridges (`core.js`), view controllers (`major-matrix.js`, `admin.js`), shared SSI partials (`header.html`, `footer.html`), and global design tokens (`global.css`).
* **Data Store (`/data`):** Normalized catalogs for universities (`universities.json`) and stream majors (`majors_*.json`), backed by versioned user matrix files under `/data/matrices/`.
* **Backend REST API (`api.php`):** Lightweight, zero-dependency PHP service providing authenticated REST endpoints for matrix persistence, collaborator management, and PIN-based auth.
* **Web Server & Routing (`.htaccess`, `router.php`):** Production Apache configuration with HTTPS enforcement, MIME caching, SSI activation, and data directory blocking (`[F]`), alongside a built-in development router for local execution.

---

## 🚀 Quickstart

### Prerequisites
* [PHP](https://www.php.net/) (v8.0 or higher)
* Web server: Apache (with `mod_rewrite` and `mod_include`) or PHP CLI for local development.

### Running Locally
```bash
# 1. Clone repository
git clone [https://github.com/smabedi/rasta.git](https://github.com/smabedi/rasta.git)
cd rasta

# 2. Start the built-in development server
php -S 127.0.0.1:8000 router.php
```

The application will be running locally at:
```text
[http://127.0.0.1:8000](http://127.0.0.1:8000)
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