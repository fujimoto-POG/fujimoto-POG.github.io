(() => {
'use strict';

// 管理者パスワードのSHA-256ハッシュ（変更する場合はClaudeに依頼してください）
// パスワード「dahama」
const ADMIN_PASSWORD_HASH = '6ac37f0d3be79cc3d0133033a5c7d3ff360c6c471939cd155817a7f782a4d0d3';

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const isAuthenticated = () => sessionStorage.getItem('pog-admin-auth') === 'true';

// fetchをオーバーライドしてAPIコールをローカルで処理
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

  // その他の管理APIはClaudeへ誘導
  if (urlStr.includes('/api/pog/') && !urlStr.includes('pog-data.json')) {
    return new Response(JSON.stringify({
      error: 'この操作はClaudeで実行できます。チャットで変更内容をお知らせください。'
    }), {status: 503, headers: {'Content-Type': 'application/json'}});
  }

  return originalFetch(url, options);
};

// ログインフォームのセットアップ
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
  errorMsg.textContent = 'メールアドレスまたはパスワードが違います';
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

// 認証済みの場合は管理パネルを表示
if (isAuthenticated()) {
  const toolsPanel = document.getElementById('admin-tools');
  if (toolsPanel) toolsPanel.hidden = false;
} else {
  // pog-admin.jsがsigninEl.hidden=falseにするのを待つ
  window.addEventListener('pog-editor-ready', () => {});
  // 少し後にフォームをセットアップ（DOMが準備完了後）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLoginForm);
  } else {
    setupLoginForm();
  }
  // pog-admin.jsが表示した後に再チェック
  setTimeout(setupLoginForm, 500);
}

})();
