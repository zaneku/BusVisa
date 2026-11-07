(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { token: '', cursor: '0', count: 0, busy: false, seenInviteIds: new Set() };
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
    row.append(id, usage, expiry, statusCell, actionCell);
    return row;
  }

  function updateListLabel() {
    $('list-count').textContent = state.count ? `已载入 ${state.count} 条记录` : '暂无邀请码记录';
    $('empty-state').hidden = state.count > 0;
    $('load-more').hidden = state.cursor === '0';
  }

  async function loadInvites(reset = false) {
    if (state.busy) return false;
    state.busy = true;
    $('load-more').disabled = true;
    showError('');
    try {
      if (reset) {
        state.cursor = '0';
        state.count = 0;
        state.seenInviteIds.clear();
        rowHost.replaceChildren();
      }
      const result = await api(`/api/admin/invites?cursor=${encodeURIComponent(state.cursor)}`);
      const uniqueInvites = result.invites.filter((invite) => {
        if (state.seenInviteIds.has(invite.id)) return false;
        state.seenInviteIds.add(invite.id);
        return true;
      });
      const rows = uniqueInvites.map(rowFor);
      rowHost.append(...rows);
      state.count += uniqueInvites.length;
      state.cursor = result.cursor;
      updateListLabel();
      return true;
    } catch (error) {
      showError(error.message);
      if (error.message.startsWith('管理员密钥')) logout();
      return false;
    } finally {
      state.busy = false;
      $('load-more').disabled = false;
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
    state.count = 0;
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
        body: JSON.stringify({ maxUses, ...(permanent ? { permanent: true } : { validDays }) })
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
  $('load-more').addEventListener('click', () => loadInvites(false));
  $('logout-button').addEventListener('click', logout);
})();
