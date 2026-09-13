import { state } from './state.js';
import { escapeHtml, formatBytes, formatRelativeDate } from '../common.js';

const DAY_MS = 86400000;

export function setViewMode(mode) {
  state.currentViewMode = mode;
  try {
    localStorage.setItem('open_artifacts_view_mode', mode);
  } catch (_) {}

  const btnTable = document.getElementById('btnViewTable');
  const btnGrid = document.getElementById('btnViewGrid');
  const tableWrap = document.getElementById('tableViewWrap');
  const gridWrap = document.getElementById('gridViewWrap');

  if (mode === 'table') {
    if (btnTable) btnTable.classList.add('active');
    if (btnGrid) btnGrid.classList.remove('active');
    if (state.displayedArtifacts.length > 0) {
      if (tableWrap) tableWrap.style.display = 'block';
      if (gridWrap) gridWrap.style.display = 'none';
    }
  } else {
    if (btnTable) btnTable.classList.remove('active');
    if (btnGrid) btnGrid.classList.add('active');
    if (state.displayedArtifacts.length > 0) {
      if (tableWrap) tableWrap.style.display = 'none';
      if (gridWrap) gridWrap.style.display = 'grid';
    }
  }
}

export function updateStats(list) {
  const statCount = document.getElementById('statArtifactsCount');
  const statVers = document.getElementById('statVersionsCount');
  const statStorage = document.getElementById('statStorageSize');

  if (statCount) statCount.textContent = list.length;
  const totalVersions = list.reduce((acc, a) => acc + (a.versionCount || a.latestVersion || 1), 0);
  if (statVers) statVers.textContent = totalVersions;
  const totalBytes = list.reduce((acc, a) => acc + (a.totalSize || a.fileSize || 0), 0);
  if (statStorage) statStorage.textContent = formatBytes(totalBytes);
}

export function expiryInfo(item) {
  const parsed = item && item.expiresAt ? Date.parse(item.expiresAt) : NaN;
  if (!Number.isFinite(parsed)) {
    return { label: 'Never', cls: 'pill-expiry-never', title: 'Kept indefinitely — no expiry set.', days: Infinity };
  }
  const days = Math.ceil((parsed - Date.now()) / DAY_MS);
  const when = new Date(parsed).toLocaleString();
  if (days <= 0) return { label: 'Expired', cls: 'pill-expiry-soon', title: 'Expired on ' + when, days: days };
  if (days <= 3) return { label: days + 'd left', cls: 'pill-expiry-soon', title: 'Expires ' + when, days: days };
  if (days <= 7) return { label: days + 'd left', cls: 'pill-expiry-warn', title: 'Expires ' + when, days: days };
  return { label: days + 'd left', cls: '', title: 'Expires ' + when, days: days };
}

export function expiryPillHtml(item) {
  const info = expiryInfo(item);
  return '<button type="button" class="pill-badge pill-expiry ' + info.cls + '"'
    + ' title="' + escapeHtml(info.title) + ' — click to change retention"'
    + " onclick=\"openTtlModal('" + escapeHtml(item.id) + "')\">"
    + escapeHtml(info.label) + '</button>';
}

export function highlightRow(id, isSelected) {
  const row = document.getElementById('row-' + id);
  if (row) row.classList.toggle('selected', isSelected);
  const card = document.getElementById('card-' + id);
  if (card) card.classList.toggle('selected', isSelected);
}

export function updateSelectionUI() {
  const count = state.selectedIds.size;
  const total = state.displayedArtifacts.length;
  const countText = document.getElementById('selectionCountText');
  const deleteBtn = document.getElementById('bulkDeleteBtn');
  const deleteBtnText = document.getElementById('bulkDeleteBtnText');
  const masterCheckbox = document.getElementById('masterCheckbox');

  if (countText) countText.textContent = count + (count === 1 ? ' artifact selected' : ' artifacts selected');
  if (deleteBtn) deleteBtn.disabled = count === 0;
  if (deleteBtnText) deleteBtnText.textContent = count > 0 ? 'Delete Selected (' + count + ')' : 'Delete Selected';

  if (masterCheckbox) {
    if (total === 0 || count === 0) {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = false;
    } else if (count === total) {
      masterCheckbox.checked = true;
      masterCheckbox.indeterminate = false;
    } else {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = true;
    }
  }
}

export function mountVersionRow(id) {
  const row = document.getElementById('row-' + id);
  if (!row) return;

  const btn = document.getElementById('vtoggle-' + id);
  if (btn) btn.classList.add('open');

  let panelRow = document.getElementById('vrow-' + id);
  if (!panelRow) {
    panelRow = document.createElement('tr');
    panelRow.className = 'version-row';
    panelRow.id = 'vrow-' + id;
    panelRow.innerHTML = '<td colspan="8"><div class="vpanel" id="vpanel-' + id + '"></div></td>';
    row.insertAdjacentElement('afterend', panelRow);
  }

  renderVersionPanel(id);
  if (!state.versionCache.has(id)) {
    if (window.loadVersionDetail) window.loadVersionDetail(id);
  }
}

export function comparePickHint(id, versionCount) {
  const pair = (state.comparePicks.get(id) || []).slice().sort((a, b) => a - b);
  if (pair.length === 2) {
    return '<a class="action-btn" href="/a/' + escapeHtml(id) + '/diff?from=' + pair[0] + '&amp;to=' + pair[1]
      + '" target="_blank">Compare v' + pair[0] + ' &harr; v' + pair[1] + '</a>';
  }
  return versionCount > 1
    ? 'Tick two versions to compare an arbitrary pair.'
    : 'Publish another version to unlock diffs.';
}

export function syncComparePicks(id) {
  const host = document.getElementById('vpanel-' + id);
  if (!host) return;

  const picks = state.comparePicks.get(id) || [];
  const items = host.querySelectorAll('.vtl-item');
  items.forEach(el => {
    const picked = picks.indexOf(Number(el.dataset.version)) !== -1;
    el.classList.toggle('picked', picked);
    const box = el.querySelector('input[type=checkbox]');
    if (box) box.checked = picked;
  });

  const hintEl = host.querySelector('.vpanel-hint');
  if (hintEl) hintEl.innerHTML = comparePickHint(id, items.length);
}

export function renderVersionPanel(id) {
  const host = document.getElementById('vpanel-' + id);
  if (!host) return;

  const detail = state.versionCache.get(id);
  if (!detail) {
    host.innerHTML = '<div class="vpanel-msg"><span class="spinner" style="width:13px;height:13px;border-width:2px;"></span><span>Loading version history&hellip;</span></div>';
    return;
  }
  if (detail.error) {
    host.innerHTML = '<div class="vpanel-msg error">' + escapeHtml(detail.error)
      + ' <button type="button" class="btn-text" onclick="retryVersionDetail(\'' + escapeHtml(id) + '\')">Retry</button></div>';
    return;
  }

  const versions = (detail.versions || []).slice().sort((a, b) => b.versionNumber - a.versionNumber);
  const picks = state.comparePicks.get(id) || [];

  const rows = versions.map((v, i) => {
    const prev = versions[i + 1];
    const identical = prev && prev.contentHash && v.contentHash && prev.contentHash === v.contentHash;
    const picked = picks.indexOf(v.versionNumber) !== -1;

    let deltaHtml = '<span class="vtl-delta same">&mdash;</span>';
    if (identical) {
      deltaHtml = '<span class="vtl-delta same" title="Byte-identical to v' + prev.versionNumber + '">identical</span>';
    } else if (prev) {
      const delta = (v.fileSize || 0) - (prev.fileSize || 0);
      if (delta > 0) deltaHtml = '<span class="vtl-delta up">+' + escapeHtml(formatBytes(delta)) + '</span>';
      else if (delta < 0) deltaHtml = '<span class="vtl-delta down">&minus;' + escapeHtml(formatBytes(-delta)) + '</span>';
      else deltaHtml = '<span class="vtl-delta same">&plusmn;0</span>';
    }

    return '<div class="vtl-item' + (picked ? ' picked' : '') + '" data-version="' + v.versionNumber + '">'
      + '<label class="vtl-pick" title="Tick to select for a diff comparison">'
      + '<input type="checkbox" ' + (picked ? 'checked ' : '')
      + 'onchange="toggleComparePick(\'' + escapeHtml(id) + '\', ' + v.versionNumber + ', this.checked)">'
      + '</label>'
      + '<span class="vtl-num">v' + v.versionNumber + '</span>'
      + '<span class="vtl-desc ' + (v.description ? '' : 'muted') + '" title="' + escapeHtml(v.description || '') + '">'
      + escapeHtml(v.description || 'No release note') + '</span>'
      + '<span class="vtl-size">' + escapeHtml(formatBytes(v.fileSize || 0)) + '</span>'
      + deltaHtml
      + '<span class="vtl-date" title="' + escapeHtml(v.createdAt ? new Date(v.createdAt).toLocaleString() : '') + '">'
      + escapeHtml(formatRelativeDate(v.createdAt)) + '</span>'
      + '<span class="vtl-actions">'
      + '<a class="action-btn" href="/a/' + escapeHtml(id) + '/v/' + v.versionNumber + '" target="_blank" title="Open version ' + v.versionNumber + '">Open</a>'
      + (prev
          ? '<a class="action-btn" href="/a/' + escapeHtml(id) + '/diff?from=' + prev.versionNumber + '&amp;to=' + v.versionNumber
            + '" target="_blank" title="Compare with v' + prev.versionNumber + '">Diff v' + prev.versionNumber + '&rarr;v' + v.versionNumber + '</a>'
          : '')
      + '</span>'
      + '</div>';
  }).join('');

  host.innerHTML = '<div class="vpanel-head">'
    + '<span class="vpanel-title">Version history &bull; ' + versions.length + ' version' + (versions.length === 1 ? '' : 's') + '</span>'
    + '<span class="vpanel-hint">' + comparePickHint(id, versions.length) + '</span>'
    + '</div><div class="vtl">' + rows + '</div>';
}

export function renderArtifacts() {
  const tableWrap = document.getElementById('tableViewWrap');
  const gridWrap = document.getElementById('gridViewWrap');
  const empty = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptySub = document.getElementById('emptySub');
  const tableBody = document.getElementById('tableBody');
  const searchInput = document.getElementById('searchInput');

  if (!tableWrap || !gridWrap || !empty || !tableBody) return;

  if (state.displayedArtifacts.length === 0) {
    tableWrap.style.display = 'none';
    gridWrap.style.display = 'none';
    empty.style.display = 'flex';

    const hasSearch = searchInput && searchInput.value.trim();
    if (hasSearch) {
      if (emptyTitle) emptyTitle.textContent = 'No matching artifacts';
      if (emptySub) emptySub.textContent = 'Try adjusting your search query or clear the filter.';
    } else {
      if (emptyTitle) emptyTitle.textContent = 'No artifacts found';
      if (emptySub) emptySub.textContent = 'No published artifacts exist on this server yet. Create your first interactive application in Studio Publisher.';
    }
    updateSelectionUI();
    return;
  }

  empty.style.display = 'none';

  // 1. Render Table
  tableBody.innerHTML = state.displayedArtifacts.map(item => {
    const isSelected = state.selectedIds.has(item.id);
    const latestVer = item.latestVersion || 1;
    const verCount = item.versionCount || latestVer;
    const sizeStr = formatBytes(item.fileSize || item.totalSize || 0);
    const relDate = formatRelativeDate(item.updatedAt || item.createdAt);
    const fullDate = (item.updatedAt || item.createdAt) ? new Date(item.updatedAt || item.createdAt).toLocaleString() : '';

    return `
      <tr class="${isSelected ? 'selected' : ''}" id="row-${escapeHtml(item.id)}">
        <td class="col-check">
          <input type="checkbox" class="checkbox-custom row-checkbox" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} onchange="toggleItemSelection('${escapeHtml(item.id)}', this.checked)">
        </td>
        <td>
          <div class="item-title-wrap">
            <a href="/a/${escapeHtml(item.id)}" class="item-title-link" target="_blank">${escapeHtml(item.title || 'Untitled Artifact')}</a>
            ${item.description ? `<div class="item-desc" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</div>` : ''}
          </div>
        </td>
        <td class="col-hide-mobile">
          <span class="uuid-badge" onclick="copyText('${escapeHtml(item.id)}', 'UUID copied')" title="Click to copy UUID">
            <span>${escapeHtml(item.id.slice(0, 8))}...</span>
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
          </span>
        </td>
        <td>
          ${verCount > 1
            ? `<button type="button" class="pill-badge pill-version pill-expandable" id="vtoggle-${escapeHtml(item.id)}" onclick="toggleVersionTimeline('${escapeHtml(item.id)}')" title="Show version history and compare">
                 <svg class="pill-caret" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg>
                 <span>v${escapeHtml(String(latestVer))} &bull; ${verCount} vers</span>
               </button>`
            : `<span class="pill-badge pill-version">v${escapeHtml(String(latestVer))}</span>`}
        </td>
        <td class="col-hide-mobile">
          <span class="pill-badge">${escapeHtml(sizeStr)}</span>
        </td>
        <td class="date-cell" title="${escapeHtml(fullDate)}">
          <div>${escapeHtml(relDate)}</div>
          <div class="date-sub col-hide-mobile">${escapeHtml(fullDate.split(',')[0])}</div>
        </td>
        <td class="col-hide-mobile">${expiryPillHtml(item)}</td>
        <td class="actions-cell">
          <div class="row-actions">
            <a href="/a/${escapeHtml(item.id)}" target="_blank" class="action-btn" title="Open App in viewer">Open &rarr;</a>
            <a href="/upload" onclick="openStudioWithId('${escapeHtml(item.id)}'); return false;" class="action-btn" title="Publish new version">+ Ver</a>
            <button type="button" class="action-btn action-btn-danger" onclick="openSingleDeleteModal('${escapeHtml(item.id)}')" title="Delete artifact permanently">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Re-attach any version timelines that were open before this re-render.
  for (const id of Array.from(state.expandedIds)) {
    if (document.getElementById('row-' + id)) mountVersionRow(id);
    else state.expandedIds.delete(id);
  }

  // 2. Render Grid
  gridWrap.innerHTML = state.displayedArtifacts.map(item => {
    const isSelected = state.selectedIds.has(item.id);
    const latestVer = item.latestVersion || 1;
    const sizeStr = formatBytes(item.fileSize || item.totalSize || 0);
    const relDate = formatRelativeDate(item.updatedAt || item.createdAt);

    return `
      <div class="artifact-card ${isSelected ? 'selected' : ''}" id="card-${escapeHtml(item.id)}">
        <div class="card-top">
          <input type="checkbox" class="checkbox-custom" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} onchange="toggleItemSelection('${escapeHtml(item.id)}', this.checked)">
          <span style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="pill-badge pill-version">v${escapeHtml(String(latestVer))}</span>
            ${expiryPillHtml(item)}
          </span>
        </div>

        <div>
          <a href="/a/${escapeHtml(item.id)}" target="_blank" class="card-title">${escapeHtml(item.title || 'Untitled Artifact')}</a>
        </div>

        <div class="card-desc">${escapeHtml(item.description || 'No description provided.')}</div>

        <div class="card-meta-row">
          <span class="uuid-badge" onclick="copyText('${escapeHtml(item.id)}', 'UUID copied')">${escapeHtml(item.id.slice(0, 8))}...</span>
          <span>${escapeHtml(sizeStr)} &bull; ${escapeHtml(relDate)}</span>
        </div>

        <div class="card-footer-actions">
          <a href="/a/${escapeHtml(item.id)}" target="_blank" class="action-btn">Open &rarr;</a>
          <button type="button" class="action-btn action-btn-danger" onclick="openSingleDeleteModal('${escapeHtml(item.id)}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  setViewMode(state.currentViewMode);
  updateSelectionUI();
}
