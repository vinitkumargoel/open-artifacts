/**
 * Formats raw artifact metadata records (Mongo docs or meta.json objects) into
 * the public shape served by GET /api/artifacts, sorted newest first.
 * Shared by the Express (disk/Mongo) and Cloudflare Worker (R2) backends.
 *
 * @param {Array<object>} items - Raw artifact records with _id/versions/etc.
 * @param {string} baseUrl - Origin used to build absolute url/rawUrl fields
 * @returns {Array<object>}
 */
export function formatArtifactList(items, baseUrl) {
  const list = items.map(item => {
    const versions = Array.isArray(item.versions) ? item.versions : [];
    const latestVer = item.latestVersion || (versions.length > 0 ? Math.max(...versions.map(v => v.versionNumber || 1)) : 1);
    const totalSize = versions.reduce((sum, v) => sum + (v.fileSize || 0), 0);
    const latestVersionObj = versions.find(v => v.versionNumber === latestVer) || versions[versions.length - 1];
    const latestSize = latestVersionObj?.fileSize || (versions.length > 0 ? versions[0].fileSize : 0);

    return {
      id: item._id,
      title: item.title || 'Untitled Artifact',
      description: item.description || '',
      latestVersion: latestVer,
      versionCount: versions.length || latestVer || 1,
      viewCount: item.viewCount || 0,
      fileSize: latestSize,
      totalSize,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      // null / absent means "never expires" — see isExpired() in storage.js.
      ttlDays: item.ttlDays ?? null,
      expiresAt: item.expiresAt || null,
      url: `${baseUrl}/a/${item._id}`,
      rawUrl: `${baseUrl}/raw/${item._id}/${latestVer}`,
      versions: versions.map(v => ({
        versionNumber: v.versionNumber,
        description: v.description || '',
        fileSize: v.fileSize || 0,
        createdAt: v.createdAt || null
      }))
    };
  });

  // Sort by updatedAt descending (newest first)
  list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  return list;
}

export default formatArtifactList;
