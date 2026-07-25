/**
 * dashboard_html.ts
 * Self-contained static Web Dashboard HTML for candidates to view matched jobs for their User UUID.
 * Includes Date Range Filtering, Score Bounds (Min Score & Max Score), and Items-Per-Page Selector.
 */

export const DASHBOARD_HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Candidate Jobs Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --card-border: rgba(255, 255, 255, 0.1);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-blue: #38bdf8;
      --accent-indigo: #6366f1;
      --accent-green: #22c55e;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(56, 189, 248, 0.15) 0px, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 2rem 1.5rem;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-group h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.25rem;
    }

    .logo-group p {
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .user-badge {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      padding: 0.6rem 1.2rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      color: var(--accent-blue);
      font-weight: 500;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 1rem;
      padding: 1.25rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .stat-title {
      color: var(--text-muted);
      font-size: 0.825rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-main);
    }

    /* Controls Bar */
    .controls-bar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 1rem;
      padding: 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      width: 100%;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .filter-group label {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 500;
      white-space: nowrap;
    }

    .filter-input {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      color: var(--text-main);
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .filter-input:focus {
      border-color: var(--accent-blue);
    }

    .number-input {
      width: 70px;
      text-align: center;
    }

    .select-input {
      background: rgba(15, 23, 42, 0.6);
      color: var(--text-main);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      outline: none;
      cursor: pointer;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.2s, background 0.2s;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent-indigo), var(--accent-blue));
      color: #fff;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--card-border);
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .search-box {
      flex: 1;
      min-width: 220px;
      position: relative;
    }

    .search-box input {
      width: 100%;
      padding-left: 2.2rem;
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      width: 15px;
      height: 15px;
    }

    /* Table Container */
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 1rem;
      overflow-x: auto;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9rem;
    }

    th {
      background: rgba(15, 23, 42, 0.6);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--card-border);
      white-space: nowrap;
    }

    td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.03);
    }

    .job-title-cell {
      font-weight: 600;
      color: var(--text-main);
      max-width: 320px;
    }

    .job-title-link {
      color: var(--text-main);
      text-decoration: none;
      transition: color 0.2s;
    }

    .job-title-link:hover {
      color: var(--accent-blue);
      text-decoration: underline;
    }

    .company-cell {
      color: var(--text-muted);
      font-weight: 500;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-score-high {
      background: rgba(34, 197, 94, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .badge-score-med {
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent-amber);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .btn-apply {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: linear-gradient(135deg, var(--accent-indigo), var(--accent-blue));
      color: #fff;
      text-decoration: none;
      padding: 0.45rem 0.9rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }

    .btn-apply:hover {
      opacity: 0.9;
    }

    /* Pagination Footer */
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.25rem;
      background: rgba(15, 23, 42, 0.4);
      border-top: 1px solid var(--card-border);
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .loading-state, .empty-state, .error-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-muted);
    }

    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top: 3px solid var(--accent-blue);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-title {
      color: var(--accent-red);
      font-weight: 600;
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }

    @media (max-width: 768px) {
      body {
        padding: 1rem;
      }
      header {
        flex-direction: column;
        align-items: flex-start;
      }
      .controls-bar {
        flex-direction: column;
        align-items: stretch;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-group">
        <h1>Matched Jobs Dashboard</h1>
        <p>Curated AI-matched job postings with flexible score range and date filters</p>
      </div>
      <div class="user-badge" id="userBadge">Candidate ID: Loading...</div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Total Filtered Jobs</div>
        <div class="stat-value" id="statTotalJobs">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Page Matches</div>
        <div class="stat-value" id="statPageCount" style="color: var(--accent-blue);">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Current Page</div>
        <div class="stat-value" id="statCurrentPage" style="font-size: 1.5rem;">-</div>
      </div>
    </div>

    <!-- Filters Bar -->
    <div class="controls-bar">
      <div class="filter-row">
        <!-- Live Search -->
        <div class="search-box">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input type="text" id="searchInput" class="filter-input" placeholder="Search page results..." onkeyup="filterLocalJobs()">
        </div>

        <!-- AI Match Score Bounds -->
        <div class="filter-group">
          <label for="minScore">Min Score %:</label>
          <input type="number" id="minScore" class="filter-input number-input" min="0" max="100" value="70">
        </div>

        <div class="filter-group">
          <label for="maxScore">Max Score %:</label>
          <input type="number" id="maxScore" class="filter-input number-input" min="0" max="100" value="100">
        </div>

        <!-- Date Bounds -->
        <div class="filter-group">
          <label for="fromDate">From:</label>
          <input type="date" id="fromDate" class="filter-input">
        </div>

        <div class="filter-group">
          <label for="toDate">To:</label>
          <input type="date" id="toDate" class="filter-input">
        </div>

        <!-- Page Size (Limit) -->
        <div class="filter-group">
          <label for="limitSelect">Per Page:</label>
          <select id="limitSelect" class="select-input" onchange="applyFilters()">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
          </select>
        </div>

        <button class="btn btn-primary" onclick="applyFilters()">Filter</button>
        <button class="btn btn-secondary" onclick="resetFilters()">Reset</button>
      </div>
    </div>

    <!-- Jobs Table Container -->
    <div class="table-container">
      <div id="loadingState" class="loading-state">
        <div class="spinner"></div>
        <p>Loading matched jobs...</p>
      </div>

      <div id="errorState" class="error-state" style="display: none;">
        <div class="error-title">Failed to Load Jobs</div>
        <p id="errorMessage">Unable to fetch jobs for this user ID.</p>
      </div>

      <div id="emptyState" class="empty-state" style="display: none;">
        <p>No matched jobs found for the selected filter bounds.</p>
        <p style="font-size: 0.8rem; margin-top: 0.5rem; color: var(--text-muted);">Try broadening your score range or date filters.</p>
      </div>

      <table id="jobsTable" style="display: none;">
        <thead>
          <tr>
            <th>#</th>
            <th>Job Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>AI Match</th>
            <th>Discovered At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="jobsTbody">
        </tbody>
      </table>

      <!-- Pagination Footer -->
      <div id="paginationBar" class="pagination-bar" style="display: none;">
        <span id="paginationInfo">Showing 0-0 of 0 jobs</span>
        <div class="pagination-controls">
          <button class="btn btn-secondary" id="btnPrevPage" onclick="changePage(-1)" disabled>&laquo; Prev</button>
          <span id="pageIndicator" style="font-weight: 600; padding: 0 0.5rem;">Page 1 of 1</span>
          <button class="btn btn-secondary" id="btnNextPage" onclick="changePage(1)" disabled>Next &raquo;</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentPage = 1;
    let totalPages = 1;
    let totalJobsCount = 0;
    let currentJobs = [];

    // Set max date limit on date pickers to today
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('fromDate').setAttribute('max', todayStr);
    document.getElementById('toDate').setAttribute('max', todayStr);

    function getUserIdFromPath() {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const dashIdx = pathParts.indexOf('dashboard');
      if (dashIdx !== -1 && pathParts[dashIdx + 1]) {
        return pathParts[dashIdx + 1];
      }
      return pathParts[pathParts.length - 1];
    }

    const userId = getUserIdFromPath();
    document.getElementById('userBadge').innerText = \`Candidate ID: \${userId}\`;

    async function loadUserJobs(page = 1) {
      document.getElementById('loadingState').style.display = 'block';
      document.getElementById('jobsTable').style.display = 'none';
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('errorState').style.display = 'none';
      document.getElementById('paginationBar').style.display = 'none';

      try {
        const limit = parseInt(document.getElementById('limitSelect').value, 10) || 50;
        const minScore = parseInt(document.getElementById('minScore').value, 10) ?? 70;
        const maxScore = parseInt(document.getElementById('maxScore').value, 10) ?? 100;
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;

        const apiBaseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.indexOf('/dashboard'));
        let url = \`\${apiBaseUrl}/users/\${userId}/jobs?page=\${page}&limit=\${limit}&minScore=\${minScore}&maxScore=\${maxScore}\`;

        if (fromDate) url += \`&fromDate=\${encodeURIComponent(fromDate)}\`;
        if (toDate) url += \`&toDate=\${encodeURIComponent(toDate)}\`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(\`Server returned status \${response.status}\`);
        }

        const data = await response.json();
        currentJobs = data.jobs || [];
        totalJobsCount = data.total || 0;
        currentPage = data.page || page;
        totalPages = data.totalPages || 1;

        document.getElementById('loadingState').style.display = 'none';

        if (currentJobs.length === 0) {
          document.getElementById('emptyState').style.display = 'block';
          updateStats(0, 0, currentPage, totalPages);
          return;
        }

        updateStats(totalJobsCount, currentJobs.length, currentPage, totalPages);
        renderTable(currentJobs);
        updatePaginationBar(limit);
        document.getElementById('jobsTable').style.display = 'table';
        document.getElementById('paginationBar').style.display = 'flex';
      } catch (err) {
        console.error('Error fetching user jobs:', err);
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
        document.getElementById('errorMessage').innerText = err.message || 'Invalid or missing user ID.';
      }
    }

    function updateStats(total, countOnPage, page, maxPages) {
      document.getElementById('statTotalJobs').innerText = total;
      document.getElementById('statPageCount').innerText = countOnPage;
      document.getElementById('statCurrentPage').innerText = \`\${page} / \${maxPages}\`;
    }

    function updatePaginationBar(limit) {
      const start = totalJobsCount > 0 ? (currentPage - 1) * limit + 1 : 0;
      const end = Math.min(currentPage * limit, totalJobsCount);
      document.getElementById('paginationInfo').innerText = \`Showing \${start}-\${end} of \${totalJobsCount} matched jobs\`;
      document.getElementById('pageIndicator').innerText = \`Page \${currentPage} of \${totalPages}\`;

      document.getElementById('btnPrevPage').disabled = currentPage <= 1;
      document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
    }

    function changePage(delta) {
      const newPage = currentPage + delta;
      if (newPage >= 1 && newPage <= totalPages) {
        loadUserJobs(newPage);
      }
    }

    function applyFilters() {
      currentPage = 1;
      loadUserJobs(1);
    }

    function resetFilters() {
      document.getElementById('minScore').value = 70;
      document.getElementById('maxScore').value = 100;
      document.getElementById('fromDate').value = '';
      document.getElementById('toDate').value = '';
      document.getElementById('searchInput').value = '';
      document.getElementById('limitSelect').value = '50';
      currentPage = 1;
      loadUserJobs(1);
    }

    function renderTable(jobs) {
      const tbody = document.getElementById('jobsTbody');
      tbody.innerHTML = '';
      const limit = parseInt(document.getElementById('limitSelect').value, 10) || 50;
      const offsetIndex = (currentPage - 1) * limit;

      jobs.forEach((job, index) => {
        const tr = document.createElement('tr');
        
        const title = job.jobTitle || job.job_title || extractTitleFromUrl(job.jobLink) || 'LinkedIn Job Posting';
        const company = job.companyName || job.company_name || 'Direct Employer';
        const location = job.location || 'Remote / Unspecified';
        const score = job.aiScore || job.ai_score || 0;
        
        let scoreBadgeClass = 'badge-score-med';
        if (score >= 80) scoreBadgeClass = 'badge-score-high';

        const seenAtFormatted = job.seenAt 
          ? new Date(job.seenAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
          : 'Recently';

        tr.innerHTML = \`
          <td style="color: var(--text-muted);">\${offsetIndex + index + 1}</td>
          <td class="job-title-cell">
            <a href="\${escapeHtml(job.jobLink)}" target="_blank" rel="noopener noreferrer" class="job-title-link">
              \${escapeHtml(title)}
            </a>
          </td>
          <td class="company-cell">\${escapeHtml(company)}</td>
          <td style="color: var(--text-muted);">\${escapeHtml(location)}</td>
          <td>
            <span class="badge \${scoreBadgeClass}">\${score}% Match</span>
          </td>
          <td style="color: var(--text-muted); font-size: 0.825rem; white-space: nowrap;">\${seenAtFormatted}</td>
          <td>
            <a href="\${escapeHtml(job.jobLink)}" target="_blank" rel="noopener noreferrer" class="btn-apply">
              Apply
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function filterLocalJobs() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      if (!q) {
        renderTable(currentJobs);
        return;
      }

      const filtered = currentJobs.filter(j => {
        const title = (j.jobTitle || j.job_title || '').toLowerCase();
        const company = (j.companyName || j.company_name || '').toLowerCase();
        const location = (j.location || '').toLowerCase();
        return title.includes(q) || company.includes(q) || location.includes(q);
      });

      renderTable(filtered);
    }

    function extractTitleFromUrl(url) {
      if (!url) return '';
      try {
        const parts = url.split('/view/')[1] || url.split('/jobs/view/')[1];
        if (parts) {
          const slug = parts.split('/')[0];
          return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      } catch (e) {}
      return '';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Initialize on page load
    loadUserJobs(1);
  </script>
</body>
</html>`;
