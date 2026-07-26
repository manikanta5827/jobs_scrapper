/**
 * dashboard_html.ts
 * Self-contained static Web Dashboard HTML for candidates to view matched jobs for their User UUID.
 * Features:
 * - Match Quality Dropdown (≥ 70%, ≥ 80%, ≥ 90%)
 * - Date Range Filters (From / To Date)
 * - Server-Side Pagination (50 items/page default)
 * - Premium Glassmorphism UI with Loading Animations
 */

export const DASHBOARD_HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Candidate Jobs Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 30, 49, 0.75);
      --card-hover: rgba(30, 41, 69, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-blue: #38bdf8;
      --accent-indigo: #6366f1;
      --accent-purple: #a855f7;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --input-bg: #131b2e;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(56, 189, 248, 0.12) 0px, transparent 50%);
      background-attachment: fixed;
      color: var(--text-main);
      min-height: 100vh;
      padding: 2rem 1.5rem;
    }

    /* Keyframe Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulseGlow {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    .spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: var(--accent-blue);
      animation: spin 0.8s linear infinite;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      animation: fadeIn 0.4s ease-out;
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
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo) 50%, var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.25rem;
    }

    .logo-group p {
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .user-badge {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      padding: 0.6rem 1.2rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      color: var(--accent-blue);
      font-weight: 600;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
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
      backdrop-filter: blur(16px);
      border-radius: 1rem;
      padding: 1.25rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-3px);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .stat-title {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--text-main);
    }

    /* Controls Bar */
    .controls-bar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 1rem;
      padding: 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
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
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .filter-input, .select-input {
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.6rem;
      padding: 0.5rem 0.8rem;
      color: var(--text-main);
      font-size: 0.875rem;
      outline: none;
      transition: all 0.2s;
    }

    .filter-input:focus, .select-input:focus {
      border-color: var(--accent-indigo);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 220px;
    }

    .search-box input {
      width: 100%;
      padding-left: 2.25rem;
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      width: 1rem;
      height: 1rem;
      color: var(--text-muted);
    }

    /* Buttons */
    .btn {
      padding: 0.55rem 1.2rem;
      border-radius: 0.6rem;
      border: none;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent-indigo), #4f46e5);
      color: white;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99, 102, 241, 0.45); }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }

    /* Table Container */
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(15, 23, 42, 0.5);
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 1.1rem 1.25rem;
      border-bottom: 1px solid var(--card-border);
      font-size: 0.9rem;
      vertical-align: middle;
    }

    tr:hover {
      background-color: var(--card-hover);
    }

    .job-title {
      font-weight: 700;
      color: var(--text-main);
    }

    .company-name {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .score-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.8rem;
    }

    .score-high {
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .score-mid {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    /* States */
    .loading-state, .error-state, .empty-state {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--text-muted);
    }

    .loading-state p { margin-top: 1rem; }

    .error-title {
      color: var(--accent-red);
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem;
      border-top: 1px solid var(--card-border);
      font-size: 0.875rem;
      color: var(--text-muted);
      flex-wrap: wrap;
      gap: 1rem;
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-group">
        <h1>Matched Jobs Dashboard</h1>
        <p>Curated AI-matched job postings with quality and date range filters</p>
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

        <!-- Single Match Quality Dropdown (≥ 70%, ≥ 80%, ≥ 90%) -->
        <div class="filter-group">
          <label for="minScoreSelect">Match Quality:</label>
          <select id="minScoreSelect" class="select-input" onchange="applyFilters()">
            <option value="70" selected>&ge; 70% (All Matched)</option>
            <option value="80">&ge; 80% (Great Matches)</option>
            <option value="90">&ge; 90% (Top Matches)</option>
          </select>
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

        <button class="btn btn-primary" id="btnFilter" onclick="applyFilters()">Filter</button>
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
        <p>No matched jobs found for the selected filter criteria.</p>
        <p style="font-size: 0.8rem5; margin-top: 0.5rem; color: var(--text-muted);">Try adjusting your Match Quality dropdown or date range.</p>
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
        const minScore = parseInt(document.getElementById('minScoreSelect').value, 10) || 70;
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;

        const apiBaseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.indexOf('/dashboard'));
        let url = \`\${apiBaseUrl}/users/\${userId}/jobs?page=\${page}&limit=\${limit}&minScore=\${minScore}&maxScore=100\`;

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
      document.getElementById('minScoreSelect').value = '70';
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
        const link = job.jobLink || job.job_link || '#';
        const createdAt = job.createdAt || job.created_at || new Date().toISOString();

        const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        const scoreClass = score >= 85 ? 'score-high' : 'score-mid';

        tr.innerHTML = \`
          <td style="color: var(--text-muted); font-size: 0.85rem;">\${offsetIndex + index + 1}</td>
          <td>
            <div class="job-title">\${escapeHtml(title)}</div>
          </td>
          <td><span class="company-name">\${escapeHtml(company)}</span></td>
          <td style="color: var(--text-muted);">\${escapeHtml(location)}</td>
          <td>
            <span class="score-badge \${scoreClass}">
              ★ \${score}%
            </span>
          </td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">\${formattedDate}</td>
          <td>
            <a href="\${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
              View Job ↗
            </a>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function filterLocalJobs() {
      const query = document.getElementById('searchInput').value.toLowerCase().trim();
      if (!query) {
        renderTable(currentJobs);
        return;
      }

      const filtered = currentJobs.filter(job => {
        const title = (job.jobTitle || job.job_title || '').toLowerCase();
        const company = (job.companyName || job.company_name || '').toLowerCase();
        const location = (job.location || '').toLowerCase();
        return title.includes(query) || company.includes(query) || location.includes(query);
      });

      renderTable(filtered);
    }

    function extractTitleFromUrl(url) {
      if (!url) return null;
      try {
        const match = url.match(/\\/jobs\\/view\\/([^\\/\\?]+)/i);
        if (match && match[1]) {
          return match[1].replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
        }
      } catch (e) {}
      return null;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    loadUserJobs(1);
  </script>
</body>
</html>
`;
