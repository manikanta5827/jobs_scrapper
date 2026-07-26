// Embedded HTML content for Admin Web Dashboard
export const ADMIN_HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Console — Jobs Fetcher Platform</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 30, 49, 0.75);
      --card-hover: rgba(30, 41, 69, 0.85);
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: #6366f1;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --accent-cyan: #06b6d4;
      --accent-purple: #a855f7;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --input-bg: #131b2e;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.1) 0px, transparent 50%),
        radial-gradient(at 50% 100%, rgba(6, 182, 212, 0.1) 0px, transparent 50%);
      background-attachment: fixed;
      color: var(--text);
      padding: 24px;
      min-height: 100vh;
    }

    /* Keyframe Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes modalPop {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes pulseGlow {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
    }

    /* Top Bar & Auth Settings */
    .top-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      flex-wrap: wrap;
      gap: 16px;
      animation: fadeIn 0.4s ease-out;
    }
    
    .brand {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #a5b4fc, #6366f1 50%, #38bdf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .auth-box {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--card-bg);
      padding: 10px 18px;
      border-radius: 14px;
      border: 1px solid var(--border);
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      flex-wrap: wrap;
    }
    .auth-field { display: flex; align-items: center; gap: 8px; }
    .auth-field label { font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .auth-field input {
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 12px;
      color: #fff;
      font-size: 13px;
      outline: none;
      width: 240px;
      transition: all 0.2s;
    }
    .auth-field input:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }

    .btn-save-key {
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }
    .btn-save-key:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4); }

    /* KPI Metrics Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 18px;
      margin-bottom: 28px;
      animation: fadeIn 0.5s ease-out;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 22px;
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .kpi-card:hover { transform: translateY(-3px); border-color: rgba(255, 255, 255, 0.15); }
    .kpi-title { font-size: 12px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .kpi-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
    .kpi-sub { font-size: 12px; margin-top: 6px; font-weight: 500; }
    .text-green { color: var(--success); }
    .text-orange { color: var(--warning); }
    .text-blue { color: #38bdf8; }

    /* Navigation Tabs */
    .nav-tabs {
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

    /* Section & Cards */
    .tab-content { display: none; }
    .tab-content.active { display: block; animation: fadeIn 0.3s ease-out; }
    
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
    }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .card-title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }

    /* Tables */
    .table-container { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.4);
    }
    td { padding: 16px 18px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
    tr:hover { background-color: var(--card-hover); }

    /* Badges & Buttons */
    .badge { padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block; text-transform: uppercase; letter-spacing: 0.03em; }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-inactive { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }

    .btn {
      padding: 9px 18px;
      border-radius: 10px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      color: white;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99, 102, 241, 0.45); }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
    .btn-sm { padding: 6px 12px; font-size: 12px; border-radius: 8px; }
    .btn-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .btn-danger:hover:not(:disabled) { background: var(--danger); color: white; }

    /* Modals */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      z-index: 100;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .modal-overlay.active { display: flex; animation: fadeIn 0.2s ease-out; }
    .modal {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 20px;
      width: 100%;
      max-width: 680px;
      max-height: 90vh;
      overflow-y: auto;
      padding: 30px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      animation: modalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .modal-header { font-size: 20px; font-weight: 700; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .close-btn { cursor: pointer; color: var(--text-muted); font-size: 24px; transition: color 0.2s; }
    .close-btn:hover { color: var(--text); }

    .form-section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent-cyan);
      margin: 20px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .form-group { margin-bottom: 18px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
    .form-group input, .form-group textarea {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 11px 14px;
      color: white;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }
    .form-group input:focus, .form-group textarea:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
    }
    .form-group textarea { height: 100px; resize: vertical; }

    /* Skeleton Loading Bar */
    .skeleton-line {
      height: 16px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 25%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.05) 75%);
      background-size: 200% 100%;
      animation: pulseGlow 1.5s infinite ease-in-out;
      border-radius: 4px;
      margin: 6px 0;
    }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      color: white;
      padding: 14px 24px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.4);
      display: none;
      z-index: 200;
      animation: fadeIn 0.3s ease-out;
    }
  </style>
</head>
<body>

  <!-- Top Header & API Gateway Settings -->
  <div class="top-header">
    <div class="brand">🚀 Job Fetcher Admin Console</div>
    <div class="auth-box">
      <div class="auth-field">
        <label>API Base URL:</label>
        <input type="text" id="apiBaseInput" placeholder="https://xxxx.execute-api.ap-south-1.amazonaws.com/Prod">
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
      <div class="kpi-sub text-muted">DeepSeek + Scraper costs</div>
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
          <button class="btn btn-secondary" id="btnRefreshCandidates" onclick="loadDashboardData()">🔄 Refresh</button>
          <button class="btn btn-primary" onclick="openAddUserModal()">+ Add Candidate</button>
        </div>
      </div>
      <div class="table-container">
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
            <tr><td colspan="8" style="text-align: center; color: var(--text-muted)"><div class="skeleton-line"></div>Loading candidate records...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 2: Financial & Profit Analytics -->
  <div id="analyticsTab" class="tab-content">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Monthly Revenue & Profit Breakdown</div>
      </div>
      <div class="table-container">
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
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted)"><div class="skeleton-line"></div>Loading financial breakdown...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pricing Policy Explanation -->
    <div class="card">
      <div class="card-title" style="margin-bottom: 12px;">Pricing & Cost Structure Policy</div>
      <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6;">
        • <b>Global Default Per-Run Charge:</b> Managed via environment variable <code>DEFAULT_BILLED_RUN_COST_USD</code> (Default: <b>$0.10 USD</b> / ~₹8.50 INR per execution turn).<br>
        • <b>Custom Candidate Rate Override:</b> Can be customized per candidate via <code>customRunCostUsd</code> in candidate record.<br>
        • <b>Wallet Top-Up Rate:</b> Standard exchange rate conversion applies (1 USD = ₹100 INR).<br>
        • <b>Scraper Cost:</b> Free self-hosted microservice ($0 compute overhead).
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
      <div class="table-container">
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
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted)"><div class="skeleton-line"></div>Loading Apify key rotation pool...</td></tr>
          </tbody>
        </table>
      </div>
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
        
        <div class="form-section-title">📋 Basic Details</div>
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" id="userEmail" required maxlength="255" placeholder="candidate@example.com">
        </div>
        <div class="form-group">
          <label>Candidate Full Name</label>
          <input type="text" id="userName" maxlength="100" placeholder="John Doe">
        </div>
        <div class="form-group">
          <label>Telegram Chat ID (Optional — Auto-linked via /register ID)</label>
          <input type="text" id="userTelegramChatId" maxlength="50" placeholder="Auto-linked when candidate sends /register <id>">
        </div>

        <div class="form-section-title">📄 Resume & AI Extraction</div>
        <div class="form-group">
          <label>Resume Plain Text (50 to 15,000 characters) *</label>
          <textarea id="userResumeText" required minlength="50" maxlength="15000" placeholder="Paste full candidate resume plain text here..."></textarea>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
            <span style="font-size: 11px; color: var(--text-muted);" id="resumeCharCounter">0 / 15,000 characters</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btnAnalyzeAi" onclick="analyzeResumeWithAI()" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid #6366f1;">✨ Analyze with AI</button>
          </div>
          <span id="analyzeAiStatus" style="font-size: 12px; color: var(--success); display: block; margin-top: 6px; font-weight: 500;"></span>
        </div>

        <div class="form-section-title">🎯 Experience & Target Preferences</div>
        <div class="form-group">
          <label>Candidate Experience in Years (Required) *</label>
          <input type="number" id="userExperienceYears" min="0" max="50" value="0" required placeholder="Auto-calculated via AI or enter manually">
          <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">Jobs requiring MORE than this experience will be automatically rejected.</span>
        </div>

        <div class="form-group">
          <label>Target Locations (Optional — e.g. Bangalore, Hyderabad)</label>
          <input type="text" id="userTargetLocations" maxlength="500" placeholder="e.g. Hyderabad, Bangalore, Remote (leave empty to search all major tech cities)">
        </div>

        <div class="form-group">
          <label>Employment Type (Optional)</label>
          <input type="text" id="userEmploymentType" maxlength="100" placeholder="e.g. Full-time">
        </div>
        
        <!-- AI Extracted Profile Data -->
        <div style="border: 1px solid rgba(255, 255, 255, 0.1); padding: 16px; margin-bottom: 20px; border-radius: 12px; background: rgba(15, 23, 42, 0.6);">
          <h4 style="margin-top: 0; margin-bottom: 12px; color: #a5b4fc; font-size: 13px; font-weight: 700;">✨ AI Extracted Profile (Auto-filled on Analyze)</h4>
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
            <label>Suggested Job Titles (Comma Separated — Auto-drives search)</label>
            <textarea id="aiSuggestedJobTitles" style="height: 50px;" placeholder="Backend Developer, SDE..."></textarea>
          </div>
          <div class="form-group">
            <label>Projects (JSON Array)</label>
            <textarea id="aiProjects" style="height: 80px;" placeholder='[{"project_title": "X", "project_description": "Y"}]'></textarea>
          </div>
        </div>

        <div class="form-section-title">🔐 Exclusions & Credentials</div>
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
        
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('userModal')">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSaveUser">Save Candidate</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Top Up Wallet -->
  <div class="modal-overlay" id="topupModal">
    <div class="modal" style="max-width: 440px;">
      <div class="modal-header">
        <span>Recharge Wallet Balance</span>
        <span class="close-btn" onclick="closeModal('topupModal')">&times;</span>
      </div>
      <form onsubmit="handleTopupSubmit(event)">
        <input type="hidden" id="topupUserId">
        <div class="form-group">
          <label>Candidate</label>
          <input type="text" id="topupUserLabel" readonly style="opacity: 0.7;">
        </div>
        <div class="form-group">
          <label>Recharge Amount in INR (₹100 to ₹100,000)</label>
          <input type="number" id="topupAmountInr" min="100" max="100000" value="500" required oninput="updateTopupHint(this.value)">
          <span style="font-size: 12px; color: var(--success); display: block; margin-top: 6px; font-weight: 600;" id="topupInrHint">₹500 INR = +$5.00 USD wallet balance</span>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('topupModal')">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSubmitTopup">Add Funds</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Add Apify Key -->
  <div class="modal-overlay" id="apifyModal">
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <span>Add Apify Token</span>
        <span class="close-btn" onclick="closeModal('apifyModal')">&times;</span>
      </div>
      <form onsubmit="handleAddKeySubmit(event)">
        <div class="form-group">
          <label>Token Label / Account Name *</label>
          <input type="text" id="apifyLabel" required maxlength="100" placeholder="e.g. Account-01-FreeTier">
        </div>
        <div class="form-group">
          <label>Apify API Token (apify_api_xxxxx) *</label>
          <input type="password" id="apifyToken" required maxlength="255" placeholder="apify_api_xxxxxxxxxxxxxxxx">
        </div>
        <div class="form-group">
          <label>Subscription Renewal Day of Month (1 to 28)</label>
          <input type="number" id="apifyRenewalDay" min="1" max="28" value="1" required>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('apifyModal')">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSubmitApify">Add Token</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast"></div>

  <script>
    const INR_PER_USD = 100;

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
    let currentProfileFields = null;

    async function analyzeResumeWithAI() {
      const resumeText = document.getElementById('userResumeText').value.trim();
      const statusEl = document.getElementById('analyzeAiStatus');
      const btn = document.getElementById('btnAnalyzeAi');

      if (!resumeText || resumeText.length < 50) {
        alert('Please paste at least 50 characters of candidate resume text first!');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing...';
      statusEl.style.color = '#a5b4fc';
      statusEl.innerText = '⏳ Analyzing resume via DeepSeek AI... Please wait 5-10 seconds.';

      try {
        const res = await apiRequest('/admin/analyze-resume', 'POST', { resumeText });
        const analysis = res.analysis;
        currentProfileFields = analysis;

        if (typeof analysis.experienceYears === 'number' && !isNaN(analysis.experienceYears)) {
          document.getElementById('userExperienceYears').value = analysis.experienceYears;
        }

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

        statusEl.style.color = 'var(--success)';
        statusEl.innerText = '✓ AI Analysis Complete! Primary Domain: "' + (analysis.primaryDomain || 'N/A') + '"';
        showToast('Resume analyzed successfully by DeepSeek!');
      } catch (err) {
        statusEl.style.color = 'var(--danger)';
        statusEl.innerText = '❌ Analysis failed: ' + err.message;
        alert('Failed to analyze resume: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '✨ Analyze with AI';
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      if (apiBase) document.getElementById('apiBaseInput').value = apiBase;
      if (apiKey) document.getElementById('apiKeyInput').value = apiKey;
      
      const resumeInput = document.getElementById('userResumeText');
      if (resumeInput) {
        resumeInput.addEventListener('input', () => {
          document.getElementById('resumeCharCounter').innerText = resumeInput.value.length.toLocaleString() + ' / 15,000 characters';
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
        throw new Error('API Base URL or Secret Key not set. Please enter credentials in the header and click Connect.');
      }
      const url = apiBase + endpoint;
      const headers = {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      };

      const opts = { method, headers };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || \`HTTP Error \${res.status}\`);
      }
      return data;
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }

    async function loadDashboardData() {
      const refBtn = document.getElementById('btnRefreshCandidates');
      if (refBtn) refBtn.innerHTML = '<span class="spinner"></span> Loading...';
      try {
        await Promise.all([loadStats(), loadUsers(), loadApifyKeys()]);
      } catch (err) {
        console.error('Load error:', err);
        showToast(\`Error: \${err.message}\`);
      } finally {
        if (refBtn) refBtn.innerHTML = '🔄 Refresh';
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
              <div style="font-weight: 700;">\${u.name || 'Unnamed Candidate'}</div>
              <div style="font-size: 12px; color: var(--text-muted);">\${u.email}</div>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('/register \${u.id}')">📋 Copy Code</button>
            </td>
            <td>
              <b>$\${u.balanceUsd.toFixed(2)}</b>
              <div style="font-size: 11px; color: var(--text-muted);">≈ ₹\${balanceInr.toLocaleString('en-IN')} INR</div>
            </td>
            <td>\${u.customRunCostUsd ? '$' + u.customRunCostUsd.toFixed(2) : '<span style="color:var(--text-muted);">Default ($0.10)</span>'}</td>
            <td>
              <span class="badge \${u.isActive ? 'badge-active' : 'badge-inactive'}">\${u.isActive ? 'Active' : 'Inactive'}</span>
            </td>
            <td><b>\${u.totalRunsCount || 0}</b></td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary btn-sm" onclick="openTopupModal('\${u.id}', '\${u.email}')">💳 Top Up</button>
                <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('\${u.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteUser('\${u.id}')">🗑️</button>
              </div>
            </td>
          </tr>
          \`;
        }).join('');
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="8" style="text-align: center; color: var(--danger)">Failed to load candidates: \${err.message}</td></tr>\`;
      }
    }

    async function loadApifyKeys() {
      const tbody = document.getElementById('apifyTableBody');
      try {
        const data = await apiRequest('/apify-keys');
        const keys = data.apifyKeys || [];
        if (keys.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted)">No Apify tokens in rotation pool. Click + Add Apify Token.</td></tr>';
          return;
        }

        tbody.innerHTML = keys.map(k => \`
          <tr>
            <td style="font-size: 11px; font-family: monospace;">\${k.id.substring(0, 8)}...</td>
            <td><b>\${k.accountLabel}</b></td>
            <td style="font-family: monospace; font-size: 12px;">\${k.apiKey.substring(0, 8)}...</td>
            <td>Day \${k.monthlyResetDay} of month</td>
            <td>$\${k.accumulatedUsageUsd.toFixed(4)} / $5.00</td>
            <td>
              <span class="badge \${k.isActive ? 'badge-active' : 'badge-inactive'}">\${k.isActive ? 'Active' : 'Depleted/Disabled'}</span>
            </td>
            <td>
              <button class="btn btn-danger btn-sm" onclick="deleteApifyKey('\${k.id}')">Remove</button>
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        tbody.innerHTML = \`<tr><td colspan="7" style="text-align: center; color: var(--danger)">Failed to load Apify keys: \${err.message}</td></tr>\`;
      }
    }

    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    function openAddUserModal() {
      document.getElementById('userForm').reset();
      document.getElementById('editUserId').value = '';
      document.getElementById('userModalTitle').innerText = 'Add Candidate';
      document.getElementById('initialInrGroup').style.display = 'block';
      document.getElementById('analyzeAiStatus').innerText = '';
      document.getElementById('resumeCharCounter').innerText = '0 / 15,000 characters';
      currentProfileFields = null;
      openModal('userModal');
    }

    async function openEditUserModal(id) {
      try {
        const res = await apiRequest('/users/' + id);
        const u = res.user;
        document.getElementById('editUserId').value = u.id;
        document.getElementById('userModalTitle').innerText = 'Edit Candidate Profile';
        document.getElementById('userEmail').value = u.email;
        document.getElementById('userName').value = u.name || '';
        document.getElementById('userTelegramChatId').value = u.telegramChatId || '';
        document.getElementById('userResumeText').value = u.resumeText || '';
        document.getElementById('userExperienceYears').value = u.experienceYears ?? 0;
        document.getElementById('userTargetLocations').value = u.targetLocations || '';
        document.getElementById('userEmploymentType').value = u.employmentType || '';
        document.getElementById('initialInrGroup').style.display = 'none';

        document.getElementById('aiPrimaryDomain').value = u.primaryDomain || '';
        document.getElementById('aiCandidateSummary').value = u.candidateSummary || '';
        document.getElementById('aiKnownSkills').value = (u.knownSkills || []).join(', ');
        document.getElementById('aiEducation').value = (u.education || []).join('\\n');
        document.getElementById('aiCertifications').value = (u.certifications || []).join('\\n');
        document.getElementById('aiKeyHighlights').value = (u.keyHighlights || []).join('\\n');
        document.getElementById('aiSuggestedJobTitles').value = (u.suggestedJobTitles || []).join(', ');
        document.getElementById('aiProjects').value = u.projects ? JSON.stringify(u.projects, null, 2) : '';

        if (u.excludeTitleKeywords && Array.isArray(u.excludeTitleKeywords)) {
          document.getElementById('userExcludeKeywords').value = u.excludeTitleKeywords.join(', ');
        } else {
          document.getElementById('userExcludeKeywords').value = '';
        }

        document.getElementById('userLinkedinPersonUrn').value = u.linkedinCredentials?.personUrn || '';
        document.getElementById('userLinkedinAccessToken').value = u.linkedinCredentials?.accessToken || '';
        document.getElementById('userCustomRate').value = u.customRunCostUsd || '';

        openModal('userModal');
      } catch (err) {
        alert('Failed to fetch user details: ' + err.message);
      }
    }

    async function handleUserSubmit(e) {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveUser');
      const origText = saveBtn.innerText;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> Saving Candidate...';

      const editId = document.getElementById('editUserId').value;
      const resumeText = document.getElementById('userResumeText').value.trim();

      if (resumeText.length < 50) {
        alert('Resume plain text must be at least 50 characters!');
        saveBtn.disabled = false;
        saveBtn.innerText = origText;
        return;
      }

      const excludesRaw = document.getElementById('userExcludeKeywords').value;
      const excludeTitleKeywords = excludesRaw.split(/[\\n,]+/).map(s => s.trim()).filter(Boolean);

      const personUrn = document.getElementById('userLinkedinPersonUrn').value.trim();
      const accessToken = document.getElementById('userLinkedinAccessToken').value.trim();

      const expYears = parseInt(document.getElementById('userExperienceYears').value || '0', 10);
      const targetLocations = document.getElementById('userTargetLocations').value.trim();
      const employmentType = document.getElementById('userEmploymentType').value.trim();

      const payload = {
        email: document.getElementById('userEmail').value.trim(),
        name: document.getElementById('userName').value.trim(),
        telegramChatId: document.getElementById('userTelegramChatId').value.trim(),
        resumeText,
        experienceYears: isNaN(expYears) ? 0 : expYears,
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
        saveBtn.disabled = false;
        saveBtn.innerText = origText;
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
            saveBtn.disabled = false;
            saveBtn.innerText = origText;
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
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = origText;
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
      const submitBtn = document.getElementById('btnSubmitTopup');
      const origText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Processing...';

      const id = document.getElementById('topupUserId').value;
      const amountInr = parseFloat(document.getElementById('topupAmountInr').value);

      try {
        await apiRequest('/users/' + id, 'PUT', { amountInr });
        showToast('Wallet recharged successfully!');
        closeModal('topupModal');
        loadDashboardData();
      } catch (err) {
        alert('Top-up failed: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = origText;
      }
    }

    async function deleteUser(id) {
      if (!confirm('Are you sure you want to delete candidate ID ' + id + '? This action cannot be undone.')) return;
      try {
        await apiRequest('/users/' + id, 'DELETE');
        showToast('Candidate deleted successfully!');
        loadDashboardData();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }

    function openAddKeyModal() {
      document.getElementById('apifyLabel').value = '';
      document.getElementById('apifyToken').value = '';
      document.getElementById('apifyRenewalDay').value = '1';
      openModal('apifyModal');
    }

    async function handleAddKeySubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitApify');
      const origText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Adding Token...';

      const accountLabel = document.getElementById('apifyLabel').value.trim();
      const apiKeyVal = document.getElementById('apifyToken').value.trim();
      const monthlyResetDay = parseInt(document.getElementById('apifyRenewalDay').value, 10);

      try {
        await apiRequest('/apify-keys', 'POST', { accountLabel, apiKey: apiKeyVal, monthlyResetDay });
        showToast('Apify token added to rotation pool!');
        closeModal('apifyModal');
        loadDashboardData();
      } catch (err) {
        alert('Failed to add Apify key: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = origText;
      }
    }

    async function deleteApifyKey(id) {
      if (!confirm('Remove this Apify token from rotation pool?')) return;
      try {
        await apiRequest('/apify-keys/' + id, 'DELETE');
        showToast('Apify key removed!');
        loadDashboardData();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }
  </script>
</body>
</html>
`;
