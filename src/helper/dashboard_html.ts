/**
 * dashboard_html.ts
 * Self-contained static Web Dashboard HTML for candidates to view matched jobs for their User UUID.
 * Features:
 * - Match Quality Dropdown (≥ 70%, ≥ 80%, ≥ 90%)
 * - Date Range Filters (From / To Date)
 * - Server-Side Pagination (50 items/page default)
 * - Semi-White / Alabaster Enterprise SaaS UI (Pure white tables, soft slate background, crisp SVGs)
 */

export const DASHBOARD_HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Candidate Jobs Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Semi-White / Alabaster Enterprise SaaS Palette */
      --bg-app: #f4f5f7;
      --bg-surface: #ffffff;
      --bg-surface-hover: #f8fafc;
      --bg-elevated: #f1f5f9;
      --border-color: #e2e8f0;
      --border-hover: #cbd5e1;
      
      /* Crisp Functional Accents */
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #059669;
      --success-bg: #ecfdf5;
      --success-border: #a7f3d0;
      --warning: #d97706;
      --danger: #dc2626;
      
      /* Text */
      --text-main: #0f172a;
      --text-secondary: #475569;
      --text-tertiary: #64748b;
      
      --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04);

      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font-sans); }

    body {
      background-color: var(--bg-app);
      color: var(--text-main);
      min-height: 100vh;
      padding: 24px 32px;
      line-height: 1.5;
      font-size: 14px;
    }

    /* Keyframe Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes rowFadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(0, 0, 0, 0.15);
      border-radius: 50%;
      border-top-color: var(--primary);
      animation: spin 0.7s linear infinite;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      animation: fadeIn 0.25s ease-out;
    }

    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .logo-group h1 {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.01em;
    }

    .logo-group p {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .user-badge {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 18px 20px;
      box-shadow: var(--shadow-sm);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .stat-card:hover {
      border-color: var(--border-hover);
      box-shadow: var(--shadow-md);
    }

    .stat-title {
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-main);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }

    /* Controls Bar */
    .controls-bar {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 600;
    }

    .filter-input, .select-input {
      background: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 7px 12px;
      color: var(--text-main);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }

    .filter-input:focus, .select-input:focus {
      border-color: var(--primary);
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 220px;
    }

    .search-box input {
      width: 100%;
      padding-left: 32px;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 15px;
      height: 15px;
      color: var(--text-tertiary);
      pointer-events: none;
    }

    /* Buttons */
    .btn {
      padding: 7px 14px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-elevated);
      color: var(--text-main);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      text-decoration: none;
    }

    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn:hover:not(:disabled) {
      background: #e2e8f0;
      border-color: var(--border-hover);
    }

    .btn-primary {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .btn-primary:hover:not(:disabled) { 
      background: var(--primary-hover);
      border-color: var(--primary-hover);
    }

    /* Table Container ("Tabler Format") */
    .table-container {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow-x: auto;
      box-shadow: var(--shadow-sm);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    th {
      background: #f8fafc;
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      white-space: nowrap;
    }

    td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-main);
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }

    tbody tr {
      transition: background-color 0.15s ease;
    }

    tbody tr:hover {
      background-color: var(--bg-surface-hover);
    }

    .job-title {
      font-weight: 600;
      color: var(--text-main);
      font-size: 13px;
    }

    .company-name {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .mono-cell {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .score-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .score-high {
      background: var(--success-bg);
      color: var(--success);
      border: 1px solid var(--success-border);
    }

    .score-mid {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }

    /* Skeleton Row Loader */
    .skeleton-bar {
      height: 14px;
      background: #e2e8f0;
      border-radius: 4px;
    }

    /* States */
    .error-state, .empty-state {
      padding: 48px 24px;
      text-align: center;
      color: var(--text-secondary);
    }

    .error-title {
      color: var(--danger);
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      border-top: 1px solid var(--border-color);
      font-size: 13px;
      color: var(--text-secondary);
      flex-wrap: wrap;
      gap: 12px;
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-group">
        <h1>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          <span>Matched Jobs Dashboard</span>
        </h1>
        <p>Curated AI-matched job postings with quality and date range filters</p>
      </div>
      <div class="user-badge" id="userBadge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <span>ID: Loading...</span>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Total Filtered Jobs</div>
        <div class="stat-value" id="statTotalJobs">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Page Matches</div>
        <div class="stat-value" id="statPageCount" style="color: #2563eb;">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Current Page</div>
        <div class="stat-value" id="statCurrentPage" style="font-size: 22px;">-</div>
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

        <!-- Single Match Quality Dropdown -->
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
        <button class="btn" onclick="resetFilters()">Reset</button>
      </div>
    </div>

    <!-- Jobs Table Container ("Tabler Format") -->
    <div class="table-container">
      <div id="errorState" class="error-state" style="display: none;">
        <div class="error-title">Failed to Load Jobs</div>
        <p id="errorMessage">Unable to fetch jobs for this user ID.</p>
      </div>

      <div id="emptyState" class="empty-state" style="display: none;">
        <p style="font-size: 14px; color: var(--text-main); font-weight: 600;">No matched jobs found for the selected filter criteria.</p>
        <p style="font-size: 13px; margin-top: 6px; color: var(--text-secondary);">Try adjusting your Match Quality dropdown or date range.</p>
      </div>

      <table id="jobsTable">
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
          <!-- Skeleton Rows shown during load -->
        </tbody>
      </table>

      <!-- Pagination Footer -->
      <div id="paginationBar" class="pagination-bar" style="display: none;">
        <span id="paginationInfo">Showing 0-0 of 0 jobs</span>
        <div class="pagination-controls">
          <button class="btn" id="btnPrevPage" onclick="changePage(-1)" disabled>&laquo; Prev</button>
          <span id="pageIndicator" style="font-weight: 600; padding: 0 6px;">Page 1 of 1</span>
          <button class="btn" id="btnNextPage" onclick="changePage(1)" disabled>Next &raquo;</button>
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
    document.getElementById('userBadge').innerHTML = \`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> <span>ID: \${userId}</span>\`;

    function renderSkeletonRows() {
      const tbody = document.getElementById('jobsTbody');
      tbody.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><div class="skeleton-bar" style="width: 20px;"></div></td>
          <td><div class="skeleton-bar" style="width: 220px;"></div></td>
          <td><div class="skeleton-bar" style="width: 150px;"></div></td>
          <td><div class="skeleton-bar" style="width: 120px;"></div></td>
          <td><div class="skeleton-bar" style="width: 65px;"></div></td>
          <td><div class="skeleton-bar" style="width: 85px;"></div></td>
          <td><div class="skeleton-bar" style="width: 75px;"></div></td>
        \`;
        tbody.appendChild(tr);
      }
    }

    async function loadUserJobs(page = 1) {
      document.getElementById('jobsTable').style.display = 'table';
      renderSkeletonRows();
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

        if (currentJobs.length === 0) {
          document.getElementById('jobsTable').style.display = 'none';
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
        document.getElementById('jobsTable').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
        document.getElementById('errorMessage').innerText = err.message || 'Invalid or missing user ID.';
      }
    }

    function updateStats(total, countOnPage, page, maxPages) {
      document.getElementById('statTotalJobs').innerText = total.toLocaleString();
      document.getElementById('statPageCount').innerText = countOnPage.toLocaleString();
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
        tr.style.animation = \`rowFadeIn 0.2s ease-out \${index * 0.01}s forwards\`;
        
        const title = job.jobTitle || job.job_title || extractTitleFromUrl(job.jobLink) || 'LinkedIn Job Posting';
        const company = job.companyName || job.company_name || 'Direct Employer';
        const location = job.location || 'Remote / Unspecified';
        const score = job.aiScore || job.ai_score || 0;
        const link = job.jobLink || job.job_link || '#';
        const createdAt = job.createdAt || job.created_at || job.postedAt || job.posted_at || new Date().toISOString();

        const dateObj = new Date(createdAt);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const formattedTime = dateObj.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        const scoreClass = score >= 85 ? 'score-high' : 'score-mid';

        tr.innerHTML = \`
          <td class="mono-cell">\${offsetIndex + index + 1}</td>
          <td>
            <div class="job-title">\${escapeHtml(title)}</div>
          </td>
          <td><span class="company-name">\${escapeHtml(company)}</span></td>
          <td style="color: var(--text-secondary);">\${escapeHtml(location)}</td>
          <td>
            <span class="score-badge \${scoreClass}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              \${score}%
            </span>
          </td>
          <td class="mono-cell">
            <div style="font-weight: 600; color: var(--text-main);">\${formattedDate}</div>
            <div style="font-size: 11px; color: var(--text-tertiary);">\${formattedTime}</div>
          </td>
          <td>
            <a href="\${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="btn" style="padding: 5px 10px; font-size: 12px;">
              <span>View</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
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
