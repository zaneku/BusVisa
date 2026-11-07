(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 5;
  const state = { token: '', cursor: '0', complete: false, page: 0, rows: [], busy: false, seenInviteIds: new Set() };
  const loginPanel = $('login-panel');
  const workspace = $('workspace');
  const rowHost = $('invite-rows');
  const time = (value) => value === 0 ? '永久有效' : new Date(value * 1000).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

  function showError(message) {
    const error = $('global-error');
    error.textContent = message;
    error.hidden = !message;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${state.token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    if (response.status === 401) throw new Error('管理员密钥不正确或已失效。');
    if (response.status === 429) throw new Error('尝试次数过多，请 15 分钟后重试。');
    if (response.status === 503) throw new Error('管理服务暂不可用，请检查 Netlify 管理密钥配置。');
    if (!response.ok) throw new Error(`请求失败（${response.status}）。`);
    return response.status === 204 ? null : response.json();
  }

  function statusOf(invite) {
    if (invite.disabled) return ['已停用', 'disabled'];
    if (invite.expiresAt !== 0 && invite.expiresAt <= Date.now() / 1000) return ['已过期', 'expired'];
    if (invite.uses >= invite.maxUses) return ['已用完', 'used'];
    return ['有效', 'active'];
  }

  function rowFor(invite) {
    const row = document.createElement('tr');
    row.dataset.inviteId = invite.id;
    row.dataset.createdAt = String(invite.createdAt || 0);
    row.dataset.expiresAt = String(invite.expiresAt);
    const id = document.createElement('td');
    id.className = 'id-cell';
    id.textContent = invite.id;
    const usage = document.createElement('td');
    usage.textContent = `${invite.uses} / ${invite.maxUses}`;
    const expiry = document.createElement('td');
    expiry.textContent = time(invite.expiresAt);
    const statusCell = document.createElement('td');
    const [label, className] = statusOf(invite);
    const status = document.createElement('span');
    status.className = `status ${className}`;
    status.textContent = label;
    statusCell.append(status);
    const actionCell = document.createElement('td');
    actionCell.className = 'table-actions';
    if (!invite.disabled && (invite.expiresAt === 0 || invite.expiresAt > Date.now() / 1000)) {
      const button = document.createElement('button');
      button.className = 'danger-button';
      button.type = 'button';
      button.textContent = '停用';
      button.addEventListener('click', () => disableInvite(invite.id, button));
      actionCell.append(button);
    } else {
      actionCell.textContent = '—';
    }
    const noteCell = document.createElement('td');
    const noteForm = document.createElement('form');
    noteForm.className = 'note-editor';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'note-input';
    noteInput.maxLength = 200;
    noteInput.value = invite.note || '';
    noteInput.setAttribute('aria-label', `邀请码 ${invite.id.slice(0, 8)} 的备注`);
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'quiet-button note-save';
    saveButton.textContent = '保存';
    saveButton.setAttribute('aria-live', 'polite');
    noteInput.addEventListener('input', () => { saveButton.textContent = '保存'; });
    noteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const note = noteInput.value.trim();
      if (note.length > 200) {
        showError('备注最多 200 个字符。');
        return;
      }
      noteInput.disabled = true;
      saveButton.disabled = true;
      saveButton.textContent = '保存中…';
      showError('');
      try {
        await api(`/api/admin/invites/${invite.id}/note`, {
          method: 'POST',
          body: JSON.stringify({ note })
        });
        invite.note = note;
        noteInput.value = note;
        saveButton.textContent = '已保存';
      } catch (error) {
        showError(error.message);
        saveButton.textContent = '重试';
      } finally {
        noteInput.disabled = false;
        saveButton.disabled = false;
      }
    });
    noteForm.append(noteInput, saveButton);
    noteCell.append(noteForm);
    row.append(id, noteCell, usage, expiry, statusCell, actionCell);
    return row;
  }

  function sortRows(rows) {
    const byExpiry = $('invite-sort').value === 'expiry';
    rows.sort((a, b) => {
      if (byExpiry) {
        const aExpiry = Number(a.dataset.expiresAt) === 0 ? Infinity : Number(a.dataset.expiresAt);
        const bExpiry = Number(b.dataset.expiresAt) === 0 ? Infinity : Number(b.dataset.expiresAt);
        if (aExpiry !== bExpiry) return bExpiry - aExpiry;
      }
      return Number(b.dataset.createdAt) - Number(a.dataset.createdAt) || a.dataset.inviteId.localeCompare(b.dataset.inviteId);
    });
  }

  function renderPage() {
    const start = state.page * PAGE_SIZE;
    rowHost.replaceChildren(...state.rows.slice(start, start + PAGE_SIZE));
    const pageCount = Math.max(1, Math.ceil(state.rows.length / PAGE_SIZE));
    $('list-count').textContent = state.rows.length
      ? `第 ${start + 1}–${Math.min(start + PAGE_SIZE, state.rows.length)} 条${state.complete ? ` · 共 ${state.rows.length} 条` : ''}`
      : '暂无邀请码记录';
    $('page-number').textContent = state.complete
      ? `第 ${state.page + 1} / ${pageCount} 页`
      : `第 ${state.page + 1} 页`;
    $('empty-state').hidden = state.rows.length > 0;
    $('previous-page').disabled = state.busy || state.page === 0;
    $('next-page').disabled = state.busy || (state.complete && start + PAGE_SIZE >= state.rows.length);
    $('refresh-button').disabled = state.busy;
    $('invite-sort').disabled = state.busy;
  }

  async function loadInvites(reset = false, targetPage = state.page) {
    if (state.busy) return false;
    state.busy = true;
    renderPage();
    showError('');
    const token = state.token;
    try {
      const rows = reset ? [] : state.rows.slice();
      const seenIds = new Set(reset ? [] : state.seenInviteIds);
      let cursor = reset ? '0' : state.cursor;
      let complete = reset ? false : state.complete;
      const page = reset ? 0 : targetPage;
      // Read and deduplicate the full snapshot before sorting across pages.
      while (!complete) {
        const result = await api(`/api/admin/invites?cursor=${encodeURIComponent(cursor)}`);
        if (token !== state.token) return false;
        for (const invite of result.invites) {
          if (seenIds.has(invite.id)) continue;
          seenIds.add(invite.id);
          rows.push(rowFor(invite));
        }
        cursor = result.cursor;
        complete = cursor === '0';
      }
      sortRows(rows);
      state.rows = rows;
      state.seenInviteIds = seenIds;
      state.cursor = cursor;
      state.complete = complete;
      state.page = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
      return true;
    } catch (error) {
      showError(error.message);
      if (error.message.startsWith('管理员密钥')) logout();
      return false;
    } finally {
      state.busy = false;
      renderPage();
    }
  }

  async function disableInvite(id, button) {
    if (!window.confirm('停用此邀请码？已有会话之后也无法继续访问受限资源。')) return;
    button.disabled = true;
    showError('');
    try {
      await api(`/api/admin/invites/${id}/disable`, { method: 'POST', body: '{}' });
      await loadInvites(true);
    } catch (error) {
      showError(error.message);
      button.disabled = false;
    }
  }

  function logout() {
    state.token = '';
    state.cursor = '0';
    state.complete = false;
    state.page = 0;
    state.rows = [];
    state.seenInviteIds.clear();
    rowHost.replaceChildren();
    workspace.hidden = true;
    loginPanel.hidden = false;
    $('top-actions').hidden = true;
    $('admin-token').value = '';
    $('login-notice').textContent = '';
    $('created-result').hidden = true;
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.busy) return;
    state.token = $('admin-token').value;
    state.busy = true;
    $('login-button').disabled = true;
    $('login-notice').textContent = '';
    try {
      loginPanel.hidden = true;
      workspace.hidden = false;
      $('top-actions').hidden = false;
      state.busy = false;
      const loaded = await loadInvites(true);
      if (!loaded) {
        const message = $('global-error').textContent;
        logout();
        $('login-notice').textContent = message;
      }
    } catch {
      logout();
      $('login-notice').textContent = '管理服务暂不可用，请稍后重试。';
    } finally {
      state.busy = false;
      $('login-button').disabled = false;
    }
  });

  $('permanent').addEventListener('change', () => {
    $('valid-days').disabled = $('permanent').checked;
    $('valid-days').required = !$('permanent').checked;
  });

  $('create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const maxUses = Number($('max-uses').value);
    const validDays = Number($('valid-days').value);
    const permanent = $('permanent').checked;
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10000 ||
        (!permanent && (!Number.isSafeInteger(validDays) || validDays < 1 || validDays > 365))) {
      showError('激活次数需为 1–10000，有效天数需为 1–365。');
      return;
    }
    $('create-button').disabled = true;
    showError('');
    try {
      const created = await api('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ maxUses, ...(permanent ? { permanent: true } : { validDays }), note: $('invite-note').value.trim() })
      });
      $('created-code').textContent = created.code;
      $('created-meta').textContent = `${created.expiresAt === 0 ? '永久有效' : `有效至 ${time(created.expiresAt)}`} · 激活上限 ${created.maxUses} 次`;
      $('created-result').hidden = false;
      await loadInvites(true);
    } catch (error) {
      showError(error.message);
    } finally {
      $('create-button').disabled = false;
    }
  });

  $('copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('created-code').textContent);
      $('copy-code').textContent = '已复制';
      setTimeout(() => { $('copy-code').textContent = '复制'; }, 1500);
    } catch {
      showError('无法访问剪贴板，请手动选择并复制邀请码。');
    }
  });

  $('refresh-button').addEventListener('click', () => loadInvites(true));
  $('invite-sort').addEventListener('change', () => {
    sortRows(state.rows);
    state.page = 0;
    renderPage();
  });
  $('previous-page').addEventListener('click', () => {
    if (state.page > 0) loadInvites(false, state.page - 1);
  });
  $('next-page').addEventListener('click', () => loadInvites(false, state.page + 1));
  $('logout-button').addEventListener('click', logout);
})();
