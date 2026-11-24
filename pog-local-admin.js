(() => {
'use strict';

// 管理者パスワードのSHA-256ハッシュ（変更する場合はClaudeに依頼してください）
// パスワード「dahama」
const ADMIN_PASSWORD_HASH = '6ac37f0d3be79cc3d0133033a5c7d3ff360c6c471939cd155817a7f782a4d0d3';

// GitHubリポジトリ設定
const GITHUB_OWNER = 'fujimoto-pog';
const GITHUB_REPO = 'fujimoto-POG.github.io';
const GITHUB_WORKFLOW = 'update-results.yml';

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const isAuthenticated = () => sessionStorage.getItem('pog-admin-auth') === 'true';

const originalFetch = window.fetch.bind(window);
window.fetch = async function(url, options) {
  const urlStr = typeof url === 'string' ? url : url.toString();

  if (urlStr.includes('/api/pog/status')) {
    if (isAuthenticated()) {
      return new Response(JSON.stringify({
        canUpdate: true,
        signedIn: true,
        currentBoard: true,
        canManageParticipants: false,
        canCheckNextHorseNames: false
      }), {status: 200, headers: {'Content-Type': 'application/json'}});
    } else {
      return new Response(JSON.stringify({signedIn: false}),
        {status: 200, headers: {'Content-Type': 'application/json'}});
    }
  }

  if (urlStr.includes('/api/pog/backlog') && !urlStr.includes('preview') && !urlStr.includes('apply')) {
    return new Response(JSON.stringify({days: []}),
      {status: 200, headers: {'Content-Type': 'application/json'}});
  }

  if (urlStr.includes('/api/pog/') && !urlStr.includes('pog-data.json')) {
    return new Response(JSON.stringify({
      error: 'この操作はGitHub Actionsで自動実行されます。'
    }), {status: 503, headers: {'Content-Type': 'application/json'}});
  }

  return originalFetch(url, options);
};

async function triggerGitHubActions(token) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`;
  const resp = await originalFetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ref: 'main'}),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${resp.status}`);
  }
  return true;
}

async function getWorkflowRuns(token) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=1`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await originalFetch(url, {headers});
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.workflow_runs?.[0] || null;
}

function setupGitHubActionsPanel() {
  const container = document.getElementById('organizer-update');
  if (!container) return;
  if (document.getElementById('pog-github-actions-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'pog-github-actions-panel';
  panel.style.cssText = 'margin:1em 0; padding:1em; border:1px solid #ddd; border-radius:6px; background:#f9f9f9;';

  panel.innerHTML = `
    <h4 style="margin:0 0 0.5em">🤖 JRA成績の自動更新</h4>
    <p style="margin:0 0 0.75em; font-size:0.9em; color:#555;">
      毎週月・火曜日の朝8時にGitHub Actionsが自動でNetKeibaから成績を取得し、更新します。
    </p>
    <div id="pog-ga-status" style="margin-bottom:0.75em; font-size:0.9em;"></div>
    <div id="pog-ga-token-section">
      <details>
        <summary style="cursor:pointer; font-size:0.9em; color:#0066cc;">手動で今すぐ更新する</summary>
        <div style="margin-top:0.75em;">
          <p style="font-size:0.85em; color:#666; margin:0 0 0.5em;">
            GitHubのPersonal Access Token (PAT) を入力すると、今すぐ更新を実行できます。<br>
            PATはブラウザのみに保存され、外部には送信しません。
          </p>
          <label style="display:block; margin-bottom:0.5em; font-size:0.9em;">
            GitHub PAT
            <input type="password" id="pog-ga-token-input"
              placeholder="ghp_xxxx..."
              style="display:block; width:100%; padding:0.4em; margin-top:0.25em; box-sizing:border-box; border:1px solid #ccc; border-radius:4px; font-family:monospace; font-size:0.85em;">
          </label>
          <button type="button" id="pog-ga-trigger-btn" class="pog-admin-link"
            style="padding:0.4em 1em; cursor:pointer; font-size:0.9em;">
            今すぐ更新を実行
          </button>
          <span id="pog-ga-trigger-msg" style="margin-left:0.75em; font-size:0.85em;"></span>
        </div>
      </details>
    </div>
    <p style="margin:0.5em 0 0; font-size:0.8em;">
      <a href="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions" target="_blank" rel="noopener">
        GitHub Actionsの実行履歴を確認 →
      </a>
    </p>
  `;

  container.insertBefore(panel, container.firstChild);

  const savedToken = (() => {
    try { return localStorage.getItem('pog-github-pat') || ''; } catch { return ''; }
  })();
  const tokenInput = panel.querySelector('#pog-ga-token-input');
  if (savedToken) tokenInput.value = savedToken;

  const statusEl = panel.querySelector('#pog-ga-status');
  async function updateStatus() {
    const token = tokenInput.value.trim() || savedToken;
    const run = await getWorkflowRuns(token || null);
    if (run) {
      const updatedAt = new Date(run.updated_at).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'});
      const statusLabel = run.status === 'completed'
        ? (run.conclusion === 'success' ? '✅ 成功' : `❌ ${run.conclusion}`)
        : `⏳ ${run.status}`;
      statusEl.textContent = `最終実行: ${updatedAt} — ${statusLabel}`;
    } else {
      try {
        const r = await originalFetch('./pog-data.json', {cache: 'no-store'});
        const d = await r.json();
        if (d.checkedAt) statusEl.textContent = `最終更新: ${d.checkedAt}`;
      } catch { statusEl.textContent = ''; }
    }
  }
  updateStatus();

  const triggerBtn = panel.querySelector('#pog-ga-trigger-btn');
  const triggerMsg = panel.querySelector('#pog-ga-trigger-msg');
  triggerBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      triggerMsg.style.color = 'red';
      triggerMsg.textContent = 'PATを入力してください';
      return;
    }
    triggerBtn.disabled = true;
    triggerMsg.style.color = '#555';
    triggerMsg.textContent = '実行中…';
    try {
      await triggerGitHubActions(token);
      try { localStorage.setItem('pog-github-pat', token); } catch {}
      triggerMsg.style.color = 'green';
      triggerMsg.textContent = '✅ 開始しました。数分後にGitHub Actionsで確認してください。';
      setTimeout(updateStatus, 5000);
    } catch (e) {
      triggerMsg.style.color = 'red';
      triggerMsg.textContent = `エラー: ${e.message}`;
    } finally {
      triggerBtn.disabled = false;
    }
  });
}

function setupLoginForm() {
  const signinEl = document.getElementById('organizer-signin');
  if (!signinEl) return;

  signinEl.innerHTML = '';
  signinEl.hidden = false;

  const form = document.createElement('form');
  form.id = 'admin-login-form';
  form.style.cssText = 'margin:1em 0; max-width:320px;';

  const passLabel = document.createElement('label');
  passLabel.style.cssText = 'display:block; margin-bottom:0.75em;';
  passLabel.innerHTML = 'パスワード';
  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.id = 'admin-password';
  passInput.style.cssText = 'display:block; width:100%; padding:0.5em; margin-top:0.25em; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;';
  passInput.required = true;
  passLabel.appendChild(passInput);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = '管理者としてログイン';
  submitBtn.className = 'pog-admin-link';
  submitBtn.style.cssText = 'display:inline-block; padding:0.5em 1.25em; cursor:pointer;';

  const errorMsg = document.createElement('p');
  errorMsg.id = 'admin-login-error';
  errorMsg.textContent = 'パスワードが違います';
  errorMsg.style.cssText = 'color:red; display:none; margin-top:0.5em;';

  form.appendChild(passLabel);
  form.appendChild(submitBtn);
  form.appendChild(errorMsg);
  signinEl.appendChild(form);

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const password = passInput.value;
    const hash = await sha256(password);

    if (hash === ADMIN_PASSWORD_HASH) {
      sessionStorage.setItem('pog-admin-auth', 'true');
      window.location.reload();
    } else {
      errorMsg.style.display = 'block';
    }
  });
}

if (isAuthenticated()) {
  const toolsPanel = document.getElementById('admin-tools');
  if (toolsPanel) toolsPanel.hidden = false;

  window.addEventListener('pog-editor-ready', () => {
    setTimeout(setupGitHubActionsPanel, 100);
  });
  setTimeout(setupGitHubActionsPanel, 1500);
} else {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLoginForm);
  } else {
    setupLoginForm();
  }
  setTimeout(setupLoginForm, 500);
}

})();
