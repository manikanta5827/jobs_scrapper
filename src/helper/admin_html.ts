// Embedded HTML content for Admin Web Dashboard
export const ADMIN_HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard — Multi-Tenant Job Fetcher</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 29, 45, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; }

    /* Top Bar & Auth Settings */
    .top-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
    .brand { font-size: 22px; font-weight: 700; background: linear-gradient(135deg, #a5b4fc, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    
    .auth-box { display: flex; align-items: center; gap: 10px; background: var(--card-bg); padding: 10px 16px; border-radius: 12px; border: 1px solid var(--border); flex-wrap: wrap; }
    .auth-field { display: flex; align-items: center; gap: 6px; }
    .auth-field label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
    .auth-field input { background: #1f2937; border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 13px; outline: none; width: 260px; }
    .btn-save-key { background: var(--primary); color: white; border: none; padding: 7px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-save-key:hover { background: var(--primary-hover); }

    /* KPI Metrics Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 20px; backdrop-filter: blur(12px); }
    .kpi-title { font-size: 13px; color: var(--text-muted); font-weight: 500; margin-bottom: 8px; }
    .kpi-value { font-size: 26px; font-weight: 700; }
    .kpi-sub { font-size: 12px; margin-top: 6px; }
    .text-green { color: var(--success); }
    .text-orange { color: var(--warning); }
    .text-blue { color: #60a5fa; }

    /* Navigation Tabs */
    .nav-tabs { display: flex; gap: 12px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
    .tab-btn { background: transparent; border: none; color: var(--text-muted); padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

    /* Section & Cards */
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 24px; margin-bottom: 24px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .card-title { font-size: 18px; font-weight: 600; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
    tr:hover { background-color: rgba(255, 255, 255, 0.02); }

    /* Badges & Buttons */
    .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-inactive { background: rgba(239, 68, 68, 0.15); color: var(--danger); }

    .btn { padding: 8px 16px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); color: var(--text); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 6px; }
    .btn-danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .btn-danger:hover { background: var(--danger); color: white; }

    /* Modals */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 100; justify-content: center; align-items: center; }
    .modal-overlay.active { display: flex; }
    .modal { background: #111827; border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; padding: 28px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .modal-header { font-size: 18px; font-weight: 600; margin-bottom: 20px; display: flex; justify-content: space-between; }
    .close-btn { cursor: pointer; color: var(--text-muted); font-size: 20px; }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
    .form-group input, .form-group textarea { width: 100%; background: #1f2937; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: white; font-size: 14px; outline: none; }
    .form-group textarea { height: 100px; resize: vertical; }

    /* Interactive URL Chip Items */
    .url-chip-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .url-chip-item { display: flex; align-items: center; justify-content: space-between; background: #1f2937; border: 1px solid var(--border); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-family: monospace; word-break: break-all; }
    .url-chip-item .remove-url-btn { color: var(--danger); cursor: pointer; font-size: 14px; margin-left: 8px; font-family: sans-serif; font-weight: bold; background: none; border: none; }
    .url-chip-item .remove-url-btn:hover { color: #f87171; }

    /* Toast Notification */
    #toast { position: fixed; bottom: 24px; right: 24px; background: var(--primary); color: white; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 14px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); display: none; z-index: 200; }
  </style>
</head>
<body>

  <!-- Top Header & API Gateway Settings -->
  <div class="top-header">
    <div class="brand">🚀 Job Fetcher Admin Console</div>
    <div class="auth-box">
      <div class="auth-field">
        <label>API Base URL:</label>
        <input type="text" id="apiBaseInput" placeholder="https://xxxx.execute-api.us-east-1.amazonaws.com/Prod">
      </div>
      <div class="auth-field">
        <label>Secret Key:</label>
        <input type="password" id="apiKeyInput" placeholder="Enter ADMIN_API_KEY">
      </div>
      <button class="btn-save-key" onclick="saveSettings()">Connect</button>
    </div>
  </div>

  <!-- KPI Analytics Grid -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">TOTAL CANDIDATES</div>
      <div class="kpi-value" id="kpiUsers">0</div>
      <div class="kpi-sub text-blue" id="kpiActiveUsers">0 active users</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">BILLED REVENUE (USD)</div>
      <div class="kpi-value text-green" id="kpiRevenue">$0.00</div>
      <div class="kpi-sub text-muted" id="kpiRevenueInr">≈ ₹0 INR</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">ACTUAL COST (INFRA + LLM)</div>
      <div class="kpi-value text-orange" id="kpiCost">$0.00</div>
      <div class="kpi-sub text-muted">DeepSeek + Apify costs</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">NET PROFIT</div>
      <div class="kpi-value text-green" id="kpiProfit">$0.00</div>
      <div class="kpi-sub text-green" id="kpiMargin">0% margin</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">EXECUTED TURNS</div>
      <div class="kpi-value" id="kpiTurns">0</div>
      <div class="kpi-sub text-muted">Total scraper runs</div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs">
    <button class="tab-btn active" onclick="switchTab('candidatesTab', this)">Candidate Management</button>
    <button class="tab-btn" onclick="switchTab('analyticsTab', this)">Profit Analytics</button>
    <button class="tab-btn" onclick="switchTab('apifyTab', this)">Apify Key Rotation</button>
  </div>

  <!-- TAB 1: Candidates Management -->
  <div id="candidatesTab" class="tab-content active">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Candidates Ledger</div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onclick="loadDashboardData()">🔄 Refresh</button>
          <button class="btn btn-primary" onclick="openAddUserModal()">+ Add Candidate</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Candidate Email / Name</th>
            <th>Registration Command</th>
            <th>Wallet Balance</th>
            <th>Per-Run Rate</th>
            <th>Status</th>
            <th>Runs</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="usersTableBody">
          <tr><td colspan="8" style="text-align: center; color: var(--text-muted)">Loading candidate records...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- TAB 2: Financial & Profit Analytics -->
  <div id="analyticsTab" class="tab-content">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Monthly Revenue & Profit Breakdown</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Executed Runs</th>
            <th>Billed Revenue ($)</th>
            <th>Actual Cost ($)</th>
            <th>Net Profit ($)</th>
            <th>Margin %</th>
          </tr>
        </thead>
        <tbody id="monthlyTableBody">
          <tr><td colspan="6" style="text-align: center; color: var(--text-muted)">Loading financial breakdown...</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Pricing Policy Explanation -->
    <div class="card">
      <div class="card-title" style="margin-bottom: 12px;">Pricing & Cost Structure Policy</div>
      <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6;">
        • <b>Global Default Per-Run Charge:</b> Managed via environment variable <code>DEFAULT_BILLED_RUN_COST_USD</code> (Default: <b>$0.10 USD</b> / ~₹8.50 INR per execution turn).<br>
        • <b>Custom Candidate Rate Override:</b> Can be customized per candidate via <code>customRunCostUsd</code> in candidate record.<br>
        • <b>Wallet Top-Up Rate:</b> Standard exchange rate conversion applies (1 USD = ₹100 INR).<br>
        • <b>Apify Scraping Cost:</b> $0.00 (uses 20-account rotated free monthly credits).
      </p>
    </div>
  </div>

  <!-- TAB 3: Apify Key Rotation Manager -->
  <div id="apifyTab" class="tab-content">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Apify Token Rotation Pool</div>
        <button class="btn btn-primary" onclick="openAddKeyModal()">+ Add Apify Token</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Token Name</th>
            <th>API Key</th>
            <th>Subscription Renewal</th>
            <th>Accumulated Usage ($)</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="apifyTableBody">
          <tr><td colspan="7" style="text-align: center; color: var(--text-muted)">Loading Apify key rotation pool...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- MODAL: Add / Edit Candidate -->
  <div class="modal-overlay" id="userModal">
    <div class="modal">
      <div class="modal-header">
        <span id="userModalTitle">Add Candidate</span>
        <span class="close-btn" onclick="closeModal('userModal')">&times;</span>
      </div>
      <form id="userForm" onsubmit="handleUserSubmit(event)">
        <input type="hidden" id="editUserId">
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" id="userEmail" required maxlength="255" placeholder="candidate@example.com">
        </div>
        <div class="form-group">
          <label>Candidate Full Name</label>
          <input type="text" id="userName" maxlength="100" placeholder="John Doe">
        </div>
        <div class="form-group">
          <label>Telegram Chat ID (Optional — Candidate links via /register ID)</label>
          <input type="text" id="userTelegramChatId" maxlength="50" placeholder="Auto-linked when candidate sends /register <id>">
        </div>
        <div class="form-group">
          <label>Resume Plain Text (50 to 15,000 characters) *</label>
          <textarea id="userResumeText" required minlength="50" maxlength="15000" placeholder="Paste full candidate resume plain text here..."></textarea>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 11px; color: var(--text-muted);" id="resumeCharCounter">0 / 15,000 characters</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btnAnalyzeAi" onclick="analyzeResumeWithAI()" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid #6366f1;">✨ Analyze with AI</button>
          </div>
          <span id="analyzeAiStatus" style="font-size: 12px; color: var(--success); display: block; margin-top: 6px; font-weight: 500;"></span>
        </div>

        <div class="form-group">
          <label>Candidate Experience in Years (Required) *</label>
          <input type="number" id="userExperienceYears" min="0" max="50" value="0" required placeholder="e.g. 0 for fresher, 2 for 2 years, 5 for 5 years">
          <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">Jobs requiring MORE than this experience will be automatically rejected.</span>
        </div>

        <div class="form-group">
          <label>Target Job Titles (Optional — Comma Separated)</label>
          <input type="text" id="userTargetRoles" maxlength="500" placeholder="e.g. QA Engineer, SDET, Backend Developer">
        </div>

        <div class="form-group">
          <label>Target Locations (Optional)</label>
          <input type="text" id="userTargetLocations" maxlength="500" placeholder="e.g. Hyderabad, Bangalore, Remote">
        </div>

        <div class="form-group">
          <label>Employment Type (Optional)</label>
          <input type="text" id="userEmploymentType" maxlength="100" placeholder="e.g. Full-time">
        </div>
        
        <!-- AI Extracted Profile Data -->
        <div style="border: 1px solid #334155; padding: 12px; margin-bottom: 16px; border-radius: 6px; background: rgba(30, 41, 59, 0.5);">
          <h4 style="margin-top: 0; margin-bottom: 12px; color: #94a3b8; font-size: 13px;">AI Extracted Profile (Auto-filled)</h4>
          <div class="form-group">
            <label>Primary Domain</label>
            <input type="text" id="aiPrimaryDomain" placeholder="e.g. Backend Engineering">
          </div>
          <div class="form-group">
            <label>Candidate Summary</label>
            <textarea id="aiCandidateSummary" style="height: 60px;" placeholder="Brief summary..."></textarea>
          </div>
          <div class="form-group">
            <label>Known Skills (Comma Separated)</label>
            <textarea id="aiKnownSkills" style="height: 50px;" placeholder="Node.js, TypeScript, AWS..."></textarea>
          </div>
          <div class="form-group">
            <label>Education (One per line)</label>
            <textarea id="aiEducation" style="height: 50px;" placeholder="B.Tech in Computer Science..."></textarea>
          </div>
          <div class="form-group">
            <label>Certifications (One per line)</label>
            <textarea id="aiCertifications" style="height: 50px;" placeholder="AWS Certified Solutions Architect..."></textarea>
          </div>
          <div class="form-group">
            <label>Key Highlights (One per line)</label>
            <textarea id="aiKeyHighlights" style="height: 50px;" placeholder="Scaled system to 1M users..."></textarea>
          </div>
          <div class="form-group">
            <label>Suggested Job Titles (Comma Separated)</label>
            <textarea id="aiSuggestedJobTitles" style="height: 50px;" placeholder="Backend Developer, SDE..."></textarea>
          </div>
          <div class="form-group">
            <label>Projects (JSON Array)</label>
            <textarea id="aiProjects" style="height: 80px;" placeholder='[{"project_title": "X", "project_description": "Y"}]'></textarea>
          </div>
        </div>

        <!-- Interactive LinkedIn Search URLs Add/Remove Component -->
        <div class="form-group">
          <label id="searchUrlCounterLabel">LinkedIn Search URLs (Min 1, Max 4 URLs) *</label>
          <div style="display: flex; gap: 8px;">
            <input type="url" id="newSearchUrlInput" placeholder="https://www.linkedin.com/jobs/search?keywords=Backend..." style="flex: 1;">
            <button type="button" class="btn btn-secondary" onclick="addLinkedInUrl()" style="white-space: nowrap;">+ Add URL</button>
          </div>
          <div id="urlChipsContainer" class="url-chip-list"></div>
        </div>

        <div class="form-group">
          <label>Exclude Title Keywords (Comma Separated — Auto-filled via AI)</label>
          <textarea id="userExcludeKeywords" style="height: 60px;" placeholder="e.g. Senior, Lead, Principal, Manager, Staff, Architect, Frontend"></textarea>
        </div>
        <div class="form-group">
          <label>LinkedIn Person URN (Optional for auto-posting)</label>
          <input type="text" id="userLinkedinPersonUrn" maxlength="100" placeholder="urn:li:person:xxxxx">
        </div>
        <div class="form-group">
          <label>LinkedIn Access Token (Optional for auto-posting)</label>
          <input type="password" id="userLinkedinAccessToken" maxlength="1000" placeholder="LinkedIn OAuth Access Token">
        </div>
        <div class="form-group" id="initialInrGroup">
          <label>Initial Balance Top-Up (₹100 to ₹100,000 INR)</label>
          <input type="number" id="userInitialInr" min="100" max="100000" value="500" placeholder="500">
        </div>
        <div class="form-group">
          <label>Custom Per-Run Rate Override ($0.01 to $10.00 USD)</label>
          <input type="number" step="0.01" min="0.01" max="10.00" id="userCustomRate" placeholder="Default: $0.10">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('userModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Candidate</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Top Up Wallet -->
  <div class="modal-overlay" id="topupModal">
    <div class="modal">
      <div class="modal-header">
        <span>Recharge Candidate Wallet</span>
        <span class="close-btn" onclick="closeModal('topupModal')">&times;</span>
      </div>
      <form onsubmit="handleTopupSubmit(event)">
        <input type="hidden" id="topupUserId">
        <div class="form-group">
          <label>Candidate</label>
          <input type="text" id="topupUserLabel" readonly style="background: #111827;">
        </div>
        <div class="form-group">
          <label>Recharge Amount (₹10 to ₹100,000 INR) *</label>
          <input type="number" id="topupAmountInr" min="10" max="100000" value="500" required placeholder="500" oninput="updateTopupHint(this.value)">
          <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;" id="topupInrHint">₹500 INR = +$5.88 USD wallet balance</span>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('topupModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Confirm Recharge</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Add Apify Key -->
  <div class="modal-overlay" id="apifyModal">
    <div class="modal">
      <div class="modal-header">
        <span>Add Apify Token</span>
        <span class="close-btn" onclick="closeModal('apifyModal')">&times;</span>
      </div>
      <form onsubmit="handleApifySubmit(event)">
        <div class="form-group">
          <label>Token Name</label>
          <input type="text" id="apifyName" maxlength="100" placeholder="Account Token #1">
        </div>
        <div class="form-group">
          <label>Apify API Token Key *</label>
          <input type="text" id="apifyKey" required minlength="5" maxlength="255" placeholder="apify_api_xxxxx">
        </div>
        <div class="form-group">
          <label>Subscription Renewal Date *</label>
          <input type="date" id="apifyDate" required>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('apifyModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Token</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast"></div>

  <script>
    const INR_PER_USD = 100; // Central exchange rate variable (1 USD = 85 INR)

    // Currency conversion helpers
    function convertUsdToInr(usdAmount) {
      return Math.round((usdAmount || 0) * INR_PER_USD);
    }

    function convertInrToUsd(inrAmount) {
      if (!inrAmount || inrAmount <= 0) return 0;
      return parseFloat((inrAmount / INR_PER_USD).toFixed(2));
    }

    function updateTopupHint(inrVal) {
      const usd = convertInrToUsd(parseFloat(inrVal || 0));
      document.getElementById('topupInrHint').innerText = '₹' + (inrVal || 0) + ' INR = +$' + usd.toFixed(2) + ' USD wallet balance';
    }

    let apiBase = localStorage.getItem('ADMIN_API_BASE') || window.location.origin + window.location.pathname.replace(/\\/(admin\\.html|admin)?$/, '');
    let apiKey = localStorage.getItem('ADMIN_API_KEY') || '';
    let addedUrlsList = []; // Interactive state array for LinkedIn search URLs
    let currentProfileFields = null; // Holds extracted AI profile fields object

    async function analyzeResumeWithAI() {
      const resumeText = document.getElementById('userResumeText').value.trim();
      const statusEl = document.getElementById('analyzeAiStatus');
      const btn = document.getElementById('btnAnalyzeAi');

      if (!resumeText || resumeText.length < 50) {
        alert('Please paste at least 50 characters of candidate resume text first!');
        return;
      }

      btn.disabled = true;
      statusEl.style.color = '#a5b4fc';
      statusEl.innerText = '⏳ Analyzing resume via DeepSeek AI... Please wait 5-10 seconds.';

      try {
        const res = await apiRequest('/admin/analyze-resume', 'POST', { resumeText });
        const analysis = res.analysis;
        currentProfileFields = analysis;

        document.getElementById('aiPrimaryDomain').value = analysis.primaryDomain || '';
        document.getElementById('aiCandidateSummary').value = analysis.candidateSummary || '';
        document.getElementById('aiKnownSkills').value = (analysis.knownSkills || []).join(', ');
        document.getElementById('aiEducation').value = (analysis.education || []).join('\\n');
        document.getElementById('aiCertifications').value = (analysis.certifications || []).join('\\n');
        document.getElementById('aiKeyHighlights').value = (analysis.keyHighlights || []).join('\\n');
        document.getElementById('aiSuggestedJobTitles').value = (analysis.suggestedJobTitles || []).join(', ');
        document.getElementById('aiProjects').value = analysis.projects ? JSON.stringify(analysis.projects, null, 2) : '';

        if (analysis.excludeTitleKeywords && Array.isArray(analysis.excludeTitleKeywords)) {
          document.getElementById('userExcludeKeywords').value = analysis.excludeTitleKeywords.join(', ');
        }

        const currentRoles = document.getElementById('userTargetRoles').value.trim();
        if (!currentRoles && analysis.suggestedJobTitles && Array.isArray(analysis.suggestedJobTitles)) {
          document.getElementById('userTargetRoles').value = analysis.suggestedJobTitles.join(', ');
        }

        statusEl.style.color = 'var(--success)';
        statusEl.innerText = '✓ AI Analysis Complete! Primary Domain: "' + (analysis.primaryDomain || 'N/A') + '"';
        showToast('Resume analyzed successfully by DeepSeek!');
      } catch (err) {
        statusEl.style.color = 'var(--danger)';
        statusEl.innerText = '❌ Analysis failed: ' + err.message;
        alert('Failed to analyze resume: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      if (apiBase) document.getElementById('apiBaseInput').value = apiBase;
      if (apiKey) document.getElementById('apiKeyInput').value = apiKey;
      
      const resumeInput = document.getElementById('userResumeText');
      if (resumeInput) {
        resumeInput.addEventListener('input', () => {
          document.getElementById('resumeCharCounter').innerText = resumeInput.value.length + ' / 15,000 characters';
        });
      }

      // Enter key handler for quick URL adding
      const urlInput = document.getElementById('newSearchUrlInput');
      if (urlInput) {
        urlInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addLinkedInUrl();
          }
        });
      }

      if (apiBase && apiKey) {
        loadDashboardData();
      }
    });

    function saveSettings() {
      apiBase = document.getElementById('apiBaseInput').value.trim().replace(/\\/+$/, '');
      apiKey = document.getElementById('apiKeyInput').value.trim();

      if (!apiBase || !apiKey) {
        alert('Please enter both your API Base URL and Secret Key!');
        return;
      }

      localStorage.setItem('ADMIN_API_BASE', apiBase);
      localStorage.setItem('ADMIN_API_KEY', apiKey);
      showToast('Settings saved & connected!');
      loadDashboardData();
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    function copyToClipboard(str) {
      navigator.clipboard.writeText(str);
      showToast(\`Copied to clipboard: \${str}\`);
    }

    async function apiRequest(endpoint, method = 'GET', body = null) {
      if (!apiBase || !apiKey) {
        throw new Error('Please enter API Base URL and Secret Key in the connection bar!');
      }

      const cleanBase = apiBase.replace(/\\/+$/, '');
      const url = cleanBase + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);

      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey
        }
      };

      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(url, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || err.message || \`HTTP \${res.status}\`);
      }
      return await res.json();
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }

    async function loadDashboardData() {
      try {
        await Promise.all([loadStats(), loadUsers(), loadApifyKeys()]);
      } catch (err) {
        console.error('Load error:', err);
        showToast(\`Error: \${err.message}\`);
      }
    }

    async function loadStats() {
      try {
        const data = await apiRequest('/stats');
        const s = data.stats;
        document.getElementById('kpiUsers').innerText = s.totalUsersCount;
        document.getElementById('kpiActiveUsers').innerText = \`\${s.activeUsersCount} active users\`;
        document.getElementById('kpiRevenue').innerText = \`$\${s.totalBilledRevenueUsd.toFixed(2)}\`;
        document.getElementById('kpiRevenueInr').innerText = \`≈ ₹\${convertUsdToInr(s.totalBilledRevenueUsd).toLocaleString('en-IN')} INR\`;
        document.getElementById('kpiCost').innerText = \`$\${s.totalActualCostUsd.toFixed(4)}\`;
        document.getElementById('kpiProfit').innerText = \`$\${s.totalProfitUsd.toFixed(2)}\`;
        
        const margin = s.totalBilledRevenueUsd > 0 ? ((s.totalProfitUsd / s.totalBilledRevenueUsd) * 100).toFixed(1) : '0';
        document.getElementById('kpiMargin').innerText = \`\${margin}% profit margin\`;
        document.getElementById('kpiTurns').innerText = s.totalRunsCount;

        // Render Monthly Table
        const mBody = document.getElementById('monthlyTableBody');
        if (!s.monthlyStats || s.monthlyStats.length === 0) {
          mBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted)">No monthly stats recorded yet</td></tr>';
          return;
        }

        mBody.innerHTML = s.monthlyStats.map(m => \`
          <tr>
            <td><b>\${m.month}</b></td>
            <td>\${m.runsCount}</td>
            <td>$\${m.billedRevenueUsd.toFixed(2)}</td>
            <td>$\${m.actualCostUsd.toFixed(4)}</td>
            <td class="text-green"><b>$\${m.netProfitUsd.toFixed(2)}</b></td>
            <td><span class="badge badge-active">\${m.billedRevenueUsd > 0 ? ((m.netProfitUsd / m.billedRevenueUsd) * 100).toFixed(1) : 0}%</span></td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Stats error:', err);
      }
    }

    async function loadUsers() {
      const tbody = document.getElementById('usersTableBody');
      try {
        const data = await apiRequest('/users');
        const usersList = data.users || [];
        if (usersList.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted)">No candidates registered yet. Click + Add Candidate to onboard.</td></tr>';
          return;
        }

        tbody.innerHTML = usersList.map(u => {
          const balanceInr = convertUsdToInr(u.balanceUsd);
          return \`
          <tr>
            <td style="font-size: 11px; font-family: monospace;">\${u.id.substring(0, 8)}...</td>
            <td>
              <b>\${u.name || 'Unnamed Candidate'}</b><br>
              <span style="font-size: 12px; color: var(--text-muted)">\${u.email}</span>
            </td>
            <td>
              <code style="font-size: 11px; background: #1f2937; padding: 2px 6px; border-radius: 4px;">/register \${u.id}</code>
              <button class="btn btn-secondary btn-sm" style="margin-left: 4px; padding: 2px 6px; font-size: 10px;" onclick="copyToClipboard('/register \${u.id}')">📋 Copy</button>
            </td>
            <td>
              <b style="color: \${u.balanceUsd < 0.1 ? 'var(--danger)' : 'var(--success)'}">$\${u.balanceUsd.toFixed(2)}</b>
              <span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">(~₹\${balanceInr})</span>
              <button class="btn btn-secondary btn-sm" style="margin-left: 6px;" onclick="openTopupModal('\${u.id}', '\${u.email}')">+ Top Up</button>
            </td>
            <td>\${u.customRunCostUsd ? \`$\${u.customRunCostUsd.toFixed(2)}\` : '<span style="color: var(--text-muted)">Default ($0.10)</span>'}</td>
            <td>
              <span class="badge \${u.isActive ? 'badge-active' : 'badge-inactive'}">\${u.telegramChatId ? (u.isActive ? 'ACTIVE' : 'PAUSED') : 'PENDING LINK'}</span>
            </td>
            <td>\${u.totalRunsCount || 0}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary btn-sm" onclick="triggerUserRun('\${u.id}')">▶ Run</button>
                <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('\${u.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteUser('\${u.id}', '\${u.email}')">🗑️</button>
              </div>
            </td>
          </tr>
        \`;
        }).join('');
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="8" style="color: var(--danger)">Failed to load candidates: \${err.message}\`;
      }
    }

    async function loadApifyKeys() {
      const tbody = document.getElementById('apifyTableBody');
      try {
        const data = await apiRequest('/apify-keys');
        const keys = data.keys || [];
        if (keys.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted)">No Apify tokens in rotation pool.</td></tr>';
          return;
        }

        tbody.innerHTML = keys.map(k => \`
          <tr>
            <td>#\${k.id}</td>
            <td><b>\${k.name || 'Apify Token'}</b></td>
            <td><code>\${k.apiKey.substring(0, 8)}...\${k.apiKey.substring(k.apiKey.length - 4)}</code></td>
            <td>\${k.subscriptionStartDate}</td>
            <td>$\${(k.usageCost || 0).toFixed(2)} / $5.00</td>
            <td>
              <span class="badge \${k.usageCost < 5.0 ? 'badge-active' : 'badge-inactive'}">
                \${k.usageCost < 5.0 ? 'ACTIVE' : 'EXHAUSTED'}
              </span>
            </td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary btn-sm" onclick="resetApifyUsage(\${k.id})">Reset $0</button>
                <button class="btn btn-danger btn-sm" onclick="deleteApifyKey(\${k.id})">🗑️</button>
              </div>
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="7" style="color: var(--danger)">Failed to load Apify keys: \${err.message}</td></tr>\`;
      }
    }

    // Modal Helpers
    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    // ─── Interactive LinkedIn URL Component Helpers ─────────────────────────────
    function renderUrlChips() {
      const container = document.getElementById('urlChipsContainer');
      const label = document.getElementById('searchUrlCounterLabel');
      label.innerText = \`LinkedIn Search URLs (\${addedUrlsList.length} / 4 added) *\`;

      if (addedUrlsList.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: var(--text-muted); padding: 4px 0;">No LinkedIn URLs added yet. Paste URL above and click + Add URL.</span>';
        return;
      }

      container.innerHTML = addedUrlsList.map((url, idx) => \`
        <div class="url-chip-item">
          <span>🔗 \${url}</span>
          <button type="button" class="remove-url-btn" onclick="removeLinkedInUrl(\${idx})" title="Remove URL">&times;</button>
        </div>
      \`).join('');
    }

    function addLinkedInUrl() {
      const input = document.getElementById('newSearchUrlInput');
      const rawUrl = input.value.trim();

      if (!rawUrl) {
        alert('Please paste a valid LinkedIn search URL!');
        return;
      }

      if (!/^https?:\\/\\/.+/i.test(rawUrl)) {
        alert('Invalid URL format! URL must start with http:// or https://');
        return;
      }

      if (addedUrlsList.length >= 4) {
        alert('Maximum 4 LinkedIn search URLs allowed per candidate!');
        return;
      }

      if (addedUrlsList.includes(rawUrl)) {
        alert('This LinkedIn search URL has already been added!');
        return;
      }

      addedUrlsList.push(rawUrl);
      input.value = ''; // Reset input placeholder for next URL
      renderUrlChips();
    }

    function removeLinkedInUrl(idx) {
      addedUrlsList.splice(idx, 1);
      renderUrlChips();
    }

    function openAddUserModal() {
      document.getElementById('userModalTitle').innerText = 'Add Candidate';
      document.getElementById('editUserId').value = '';
      document.getElementById('userForm').reset();
      document.getElementById('initialInrGroup').style.display = 'block';
      document.getElementById('resumeCharCounter').innerText = '0 / 15,000 characters';
      document.getElementById('analyzeAiStatus').innerText = '';
      
      currentProfileFields = null;
      addedUrlsList = []; // Reset URLs array
      renderUrlChips();
      openModal('userModal');
    }

    async function openEditUserModal(id) {
      document.getElementById('userModalTitle').innerText = 'Edit Candidate Profile';
      document.getElementById('editUserId').value = id;
      document.getElementById('initialInrGroup').style.display = 'none';

      const user = await apiRequest('/users/' + id).then(res => res.user);
      document.getElementById('userEmail').value = user.email;
      document.getElementById('userName').value = user.name || '';
      document.getElementById('userTelegramChatId').value = user.telegramChatId || '';
      document.getElementById('userResumeText').value = user.resumeText || '';
      document.getElementById('resumeCharCounter').innerText = (user.resumeText || '').length + ' / 15,000 characters';
      
      document.getElementById('userExperienceYears').value = user.experienceYears ?? 0;
      document.getElementById('userEmploymentType').value = user.employmentType || '';

      currentProfileFields = {
        primaryDomain: user.primaryDomain,
        candidateSummary: user.candidateSummary,
        knownSkills: user.knownSkills,
        education: user.education,
        projects: user.projects,
        certifications: user.certifications,
        keyHighlights: user.keyHighlights,
        suggestedJobTitles: user.suggestedJobTitles
      };

      document.getElementById('aiPrimaryDomain').value = user.primaryDomain || '';
      document.getElementById('aiCandidateSummary').value = user.candidateSummary || '';
      document.getElementById('aiKnownSkills').value = (user.knownSkills || []).join(', ');
      document.getElementById('aiEducation').value = (user.education || []).join('\\n');
      document.getElementById('aiCertifications').value = (user.certifications || []).join('\\n');
      document.getElementById('aiKeyHighlights').value = (user.keyHighlights || []).join('\\n');
      document.getElementById('aiSuggestedJobTitles').value = (user.suggestedJobTitles || []).join(', ');
      document.getElementById('aiProjects').value = user.projects ? JSON.stringify(user.projects, null, 2) : '';

      const statusEl = document.getElementById('analyzeAiStatus');
      if (user.primaryDomain || (user.knownSkills && user.knownSkills.length > 0)) {
        statusEl.style.color = 'var(--success)';
        statusEl.innerText = '✓ Saved AI Profile Active (' + (user.primaryDomain || 'Loaded') + ')';
      } else {
        statusEl.innerText = '';
      }

      // Load candidate's existing URLs into interactive list
      addedUrlsList = [...(user.linkedinSearchUrls || [])];
      renderUrlChips();

      document.getElementById('userExcludeKeywords').value = (user.excludeTitleKeywords || []).join(', ');
      
      const creds = user.linkedinCredentials || {};
      document.getElementById('userLinkedinPersonUrn').value = creds.personUrn || '';
      document.getElementById('userLinkedinAccessToken').value = creds.accessToken || '';

      document.getElementById('userCustomRate').value = user.customRunCostUsd || '';
      openModal('userModal');
    }

    async function handleUserSubmit(e) {
      e.preventDefault();
      const editId = document.getElementById('editUserId').value;
      const resumeText = document.getElementById('userResumeText').value.trim();

      // Validate resume length (min 50, max 15,000 characters)
      if (resumeText.length < 50 || resumeText.length > 15000) {
        alert('Resume plain text must be between 50 and 15,000 characters long! (Current length: ' + resumeText.length + ')');
        return;
      }

      // Check if user typed a URL into input box without clicking + Add URL button
      const pendingUrl = document.getElementById('newSearchUrlInput').value.trim();
      if (pendingUrl && /^https?:\\/\\/.+/i.test(pendingUrl) && addedUrlsList.length < 4 && !addedUrlsList.includes(pendingUrl)) {
        addedUrlsList.push(pendingUrl);
        document.getElementById('newSearchUrlInput').value = '';
        renderUrlChips();
      }

      // Validate search URLs count (min 1, max 4 URLs)
      if (addedUrlsList.length < 1 || addedUrlsList.length > 4) {
        alert('Please add between 1 and 4 LinkedIn search URLs! (Currently added: ' + addedUrlsList.length + ')');
        return;
      }

      const excludesRaw = document.getElementById('userExcludeKeywords').value;
      const excludeTitleKeywords = excludesRaw.split(/[\\n,]+/).map(s => s.trim()).filter(Boolean);

      const personUrn = document.getElementById('userLinkedinPersonUrn').value.trim();
      const accessToken = document.getElementById('userLinkedinAccessToken').value.trim();

      const expYears = parseInt(document.getElementById('userExperienceYears').value || '0', 10);
      const targetRoles = document.getElementById('userTargetRoles').value.trim();
      const targetLocations = document.getElementById('userTargetLocations').value.trim();
      const employmentType = document.getElementById('userEmploymentType').value.trim();

      const payload = {
        email: document.getElementById('userEmail').value.trim(),
        name: document.getElementById('userName').value.trim(),
        telegramChatId: document.getElementById('userTelegramChatId').value.trim(),
        resumeText,
        linkedinSearchUrls: addedUrlsList,
        experienceYears: isNaN(expYears) ? 0 : expYears,
        targetRoles: targetRoles || undefined,
        targetLocations: targetLocations || undefined,
        employmentType: employmentType || undefined,
        customRunCostUsd: document.getElementById('userCustomRate').value ? parseFloat(document.getElementById('userCustomRate').value) : null
      };

      const aiKnownSkills = document.getElementById('aiKnownSkills').value.split(',').map(s => s.trim()).filter(Boolean);
      const aiEducation = document.getElementById('aiEducation').value.split(/[\\n,]+/).map(s => s.trim()).filter(Boolean);
      const aiCertifications = document.getElementById('aiCertifications').value.split(/[\\n,]+/).map(s => s.trim()).filter(Boolean);
      const aiKeyHighlights = document.getElementById('aiKeyHighlights').value.split(/[\\n,]+/).map(s => s.trim()).filter(Boolean);
      const aiSuggestedJobTitles = document.getElementById('aiSuggestedJobTitles').value.split(',').map(s => s.trim()).filter(Boolean);
      
      let aiProjects = undefined;
      try {
        const rawProj = document.getElementById('aiProjects').value.trim();
        if (rawProj) aiProjects = JSON.parse(rawProj);
      } catch (e) {
        alert('Invalid JSON in AI Projects field!');
        return;
      }

      Object.assign(payload, {
        primaryDomain: document.getElementById('aiPrimaryDomain').value.trim() || undefined,
        candidateSummary: document.getElementById('aiCandidateSummary').value.trim() || undefined,
        knownSkills: aiKnownSkills.length ? aiKnownSkills : undefined,
        education: aiEducation.length ? aiEducation : undefined,
        certifications: aiCertifications.length ? aiCertifications : undefined,
        keyHighlights: aiKeyHighlights.length ? aiKeyHighlights : undefined,
        suggestedJobTitles: aiSuggestedJobTitles.length ? aiSuggestedJobTitles : undefined,
        projects: aiProjects
      });

      if (excludeTitleKeywords.length > 0) {
        payload.excludeTitleKeywords = excludeTitleKeywords;
      }

      if (personUrn || accessToken) {
        payload.linkedinCredentials = { personUrn, accessToken };
      }

      try {
        if (editId) {
          await apiRequest('/users/' + editId, 'PUT', payload);
          showToast('Candidate profile updated successfully!');
        } else {
          const initInr = parseFloat(document.getElementById('userInitialInr').value || '500');
          if (initInr < 100 || initInr > 100000) {
            alert('Initial recharge amount must be between ₹100 and ₹100,000 INR!');
            return;
          }
          payload.initialInr = initInr;
          const res = await apiRequest('/users', 'POST', payload);
          const u = res.user;
          alert('Candidate created successfully!\\n\\nCandidate ID: ' + u.id + '\\nEmail: ' + u.email + '\\n\\nCandidate Telegram Command:\\n/register ' + u.id);
        }
        closeModal('userModal');
        loadDashboardData();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    function openTopupModal(id, email) {
      document.getElementById('topupUserId').value = id;
      document.getElementById('topupUserLabel').value = email + ' (' + id.substring(0, 8) + ')';
      updateTopupHint(500);
      openModal('topupModal');
    }

    async function handleTopupSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('topupUserId').value;
      const amountInr = parseFloat(document.getElementById('topupAmountInr').value);

      if (amountInr < 10 || amountInr > 100000) {
        alert('Recharge amount must be between ₹10 and ₹100,000 INR!');
        return;
      }

      try {
        await apiRequest(\`/users/\${id}/topup\`, 'POST', { amountInr });
        showToast('Wallet recharged!');
        closeModal('topupModal');
        loadDashboardData();
      } catch (err) {
        alert(\`Error: \${err.message}\`);
      }
    }

    async function confirmDeleteUser(id, email) {
      if (!confirm(\`Are you sure you want to delete candidate \${email}?\`)) return;
      try {
        await apiRequest(\`/users/\${id}\`, 'DELETE');
        showToast('Candidate deleted!');
        loadDashboardData();
      } catch (err) {
        alert(\`Error: \${err.message}\`);
      }
    }

    async function triggerUserRun(userId) {
      try {
        await apiRequest('/run', 'POST', { targetUserId: userId, lookbackHours: 12 });
        showToast(\`Run dispatched for Candidate \${userId.substring(0, 8)}!\`);
      } catch (err) {
        alert(\`Error: \${err.message}\`);
      }
    }

    function openAddKeyModal() {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('apifyDate').value = today;
      openModal('apifyModal');
    }

    async function handleApifySubmit(e) {
      e.preventDefault();
      const payload = {
        name: document.getElementById('apifyName').value || 'Apify Token',
        apiKey: document.getElementById('apifyKey').value.trim(),
        subscriptionStartDate: document.getElementById('apifyDate').value
      };
      try {
        await apiRequest('/apify-keys', 'POST', payload);
        showToast('Apify Token added!');
        closeModal('apifyModal');
        loadDashboardData();
      } catch (err) {
        alert(\`Error: \${err.message}\`);
      }
    }

    async function resetApifyUsage(id) {
      try {
        await apiRequest(\`/apify-keys/\${id}\`, 'PUT', { usageCost: 0 });
        showToast('Usage cost reset to $0!');
        loadDashboardData();
      } catch (err) {
        alert(\`Error: \${err.message}\`);
      }
    }

    async function deleteApifyKey(id) {
      if (!confirm('Are you sure you want to remove this token from the rotation pool?')) return;
      try {
        await apiRequest(\`/apify-keys/\${id}\`, 'DELETE');
        showToast('Token deleted!');
        loadDashboardData();
      } catch (err) {
        alert(\`Error: \${err.message}\`);
      }
    }
  </script>
</body>
</html>`;
