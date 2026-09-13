/**
 * Reactive state store for History Dashboard
 */

export const state = {
  rawArtifacts: [],
  displayedArtifacts: [],
  selectedIds: new Set(),
  pendingDeletionIds: [],
  isDeleting: false,
  deleteAbortController: null,
  currentViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('open_artifacts_view_mode')) || 'table',

  // Version timeline state
  versionCache: new Map(),
  versionLoading: new Set(),
  expandedIds: new Set(),
  comparePicks: new Map(),
  pendingTtlId: null,
};
