import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { Artifact } from '../models/Artifact.js';
import { isDbConnected } from './db.js';
import {
  extractTitleFromHtml,
  extractDescriptionFromHtml,
  isValidUuid4,
  parsePositiveInt
} from '../utils/sanitize.js';

// Multer Disk Storage configured to stream to temporary folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.tmpPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `upload-${uniqueSuffix}.tmp`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const isHtmlExt = /\.(html|htm)$/i.test(file.originalname);
    if (isHtmlExt || file.mimetype === 'text/html' || file.mimetype === 'application/xhtml+xml') {
      cb(null, true);
    } else {
      const err = new Error('INVALID_FILE_TYPE');
      err.code = 'INVALID_FILE_TYPE';
      cb(err);
    }
  }
}).single('file');

/**
 * Computes SHA-256 checksum and extracts HTML metadata from file.
 * @param {string} filePath
 * @returns {Promise<{ contentHash: string, fileSize: number, extractedTitle: string, extractedDesc: string }>}
 */
async function inspectHtmlFile(filePath) {
  const content = await fsPromises.readFile(filePath, 'utf-8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const stat = await fsPromises.stat(filePath);

  return {
    contentHash: hash,
    fileSize: stat.size,
    extractedTitle: extractTitleFromHtml(content),
    extractedDesc: extractDescriptionFromHtml(content)
  };
}

/**
 * Saves a sidecar meta.json file beside the artifact HTML files for disk fallback.
 * @param {string} artifactDir
 * @param {object} artifactData
 */
async function writeSidecarMeta(artifactDir, artifactData) {
  try {
    const metaPath = path.join(artifactDir, 'meta.json');
    await fsPromises.writeFile(metaPath, JSON.stringify(artifactData, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Storage] Failed to write sidecar meta.json for ${artifactData._id}:`, err);
  }
}

/**
 * Reads sidecar meta.json from disk.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function readSidecarMeta(uuid) {
  try {
    const metaPath = path.join(config.storagePath, uuid, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const raw = await fsPromises.readFile(metaPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[Storage] Failed to read sidecar meta.json for ${uuid}:`, err);
  }
  return null;
}

/**
 * Processes an uploaded artifact file and creates or versions the artifact record.
 * @param {object} params
 * @param {Express.Multer.File} params.file
 * @param {string} [params.id] - Optional UUID-4 to update
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @returns {Promise<{ artifact: object, versionNumber: number, isNew: boolean }>}
 */
export async function processArtifactUpload({ file, id, title, description }) {
  if (!file || !file.path) {
    const err = new Error('No HTML file provided.');
    err.code = 'INVALID_FILE_TYPE';
    throw err;
  }

  const tmpPath = file.path;

  try {
    const { contentHash, fileSize, extractedTitle, extractedDesc } = await inspectHtmlFile(tmpPath);

    if (fileSize === 0) {
      const err = new Error('Uploaded file is empty (0 bytes).');
      err.code = 'INVALID_FILE_TYPE';
      throw err;
    }

    let artifactId = id ? id.trim() : null;
    let targetVersion = 1;
    let isNew = true;
    let artifactRecord = null;

    if (artifactId) {
      if (!isValidUuid4(artifactId)) {
        const err = new Error('Invalid UUID-4 format for artifact ID.');
        err.code = 'INVALID_UUID_FORMAT';
        throw err;
      }

      if (isDbConnected()) {
        try {
          artifactRecord = await Artifact.findById(artifactId);
        } catch (err) {
          // ignore
        }
      }

      if (!artifactRecord) {
        const diskMeta = await readSidecarMeta(artifactId);
        if (!diskMeta) {
          const err = new Error(`Artifact with ID ${artifactId} not found.`);
          err.code = 'ARTIFACT_NOT_FOUND';
          throw err;
        }
        artifactRecord = diskMeta;
      }

      targetVersion = (artifactRecord.latestVersion || 1) + 1;
      isNew = false;
    } else {
      artifactId = crypto.randomUUID();
      targetVersion = 1;
      isNew = true;
    }

    // Determine final Title & Description
    const finalTitle = (title && title.trim()) || (artifactRecord?.title) || extractedTitle || 'Untitled Artifact';
    const finalDesc = (description && description.trim()) || (artifactRecord?.description) || extractedDesc || '';
    const versionDesc = (description && description.trim()) || (isNew ? finalDesc : `Version ${targetVersion} update`);

    // Target directory & file path
    const artifactDir = path.join(config.storagePath, artifactId);
    if (!fs.existsSync(artifactDir)) {
      await fsPromises.mkdir(artifactDir, { recursive: true });
    }

    const versionFileName = `v${targetVersion}.html`;
    const finalFilePath = path.join(artifactDir, versionFileName);
    const relativeFilePath = `artifacts/${artifactId}/${versionFileName}`;

    // Atomic Move
    await fsPromises.rename(tmpPath, finalFilePath);

    const versionEntry = {
      versionNumber: targetVersion,
      description: versionDesc.slice(0, 500),
      filePath: relativeFilePath,
      fileSize,
      contentHash,
      createdAt: new Date().toISOString()
    };

    let metaPayload = {
      _id: artifactId,
      title: finalTitle.slice(0, 120),
      description: finalDesc.slice(0, 500),
      latestVersion: targetVersion,
      viewCount: artifactRecord ? (artifactRecord.viewCount || 0) : 0,
      versions: artifactRecord ? [...(artifactRecord.versions || []), versionEntry] : [versionEntry],
      createdAt: artifactRecord ? (artifactRecord.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isDbConnected()) {
      try {
        if (isNew) {
          const newArtifact = new Artifact({
            _id: artifactId,
            title: metaPayload.title,
            description: metaPayload.description,
            latestVersion: 1,
            viewCount: 0,
            versions: [versionEntry]
          });
          const savedDoc = await newArtifact.save();
          metaPayload = savedDoc.toObject();
        } else {
          const updatedDoc = await Artifact.findByIdAndUpdate(
            artifactId,
            {
              $set: {
                title: metaPayload.title,
                description: metaPayload.description,
                latestVersion: targetVersion,
                updatedAt: new Date()
              },
              $push: {
                versions: versionEntry
              }
            },
            { new: true }
          );
          if (updatedDoc) {
            metaPayload = updatedDoc.toObject();
          }
        }
      } catch (dbErr) {
        console.error(`[Storage] DB save error for ${artifactId}:`, dbErr.message);
      }
    }

    // Always write sidecar meta.json
    await writeSidecarMeta(artifactDir, metaPayload);

    return {
      artifact: metaPayload,
      versionNumber: targetVersion,
      isNew
    };
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        await fsPromises.unlink(tmpPath);
      } catch (unlinkErr) {
        // ignore
      }
    }
    throw err;
  }
}

/**
 * Retrieves artifact metadata by UUID-4 (with DB or disk fallback).
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function getArtifactMetadata(uuid) {
  if (!isValidUuid4(uuid)) return null;

  if (isDbConnected()) {
    try {
      const doc = await Artifact.findById(uuid).lean();
      if (doc) return doc;
    } catch (err) {
      // ignore
    }
  }

  return await readSidecarMeta(uuid);
}

/**
 * Resolves absolute filepath for raw artifact rendering with path traversal guards.
 * @param {string} uuid
 * @param {number} versionNumber
 * @returns {string|null} Absolute file path or null if not found/invalid
 */
export function getArtifactFilePath(uuid, versionNumber) {
  if (!isValidUuid4(uuid)) return null;
  const ver = parsePositiveInt(versionNumber);
  if (isNaN(ver)) return null;

  const targetPath = path.join(config.storagePath, uuid, `v${ver}.html`);

  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(path.resolve(config.storagePath))) {
    return null;
  }

  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

/**
 * Deletes an artifact from database and filesystem.
 * @param {string} uuid
 * @returns {Promise<boolean>}
 */
export async function deleteArtifact(uuid) {
  if (!isValidUuid4(uuid)) return false;

  let deleted = false;

  if (isDbConnected()) {
    try {
      const res = await Artifact.findByIdAndDelete(uuid);
      if (res) deleted = true;
    } catch (err) {
      // ignore
    }
  }

  const artifactDir = path.join(config.storagePath, uuid);
  if (fs.existsSync(artifactDir)) {
    await fsPromises.rm(artifactDir, { recursive: true, force: true });
    deleted = true;
  }

  return deleted;
}

/**
 * Lists all artifacts across database and disk storage.
 * @returns {Promise<Array<object>>}
 */
export async function listAllArtifacts() {
  const artifactMap = new Map();

  // 1. Fetch from MongoDB if connected
  if (isDbConnected()) {
    try {
      const docs = await Artifact.find().sort({ updatedAt: -1, createdAt: -1 }).lean();
      for (const doc of docs) {
        if (doc && doc._id && isValidUuid4(doc._id)) {
          artifactMap.set(doc._id, doc);
        }
      }
    } catch (err) {
      console.error('[Storage] Error querying DB for all artifacts:', err);
    }
  }

  // 2. Scan disk storage directories for any sidecar meta.json (fallback / disk-only artifacts)
  try {
    if (fs.existsSync(config.storagePath)) {
      const entries = await fsPromises.readdir(config.storagePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'tmp' && isValidUuid4(entry.name)) {
          if (!artifactMap.has(entry.name)) {
            const diskMeta = await readSidecarMeta(entry.name);
            if (diskMeta && diskMeta._id) {
              artifactMap.set(diskMeta._id, diskMeta);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Storage] Error scanning disk for artifacts:', err);
  }

  // 3. Format and sort list
  const list = Array.from(artifactMap.values()).map(item => {
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
      url: `${config.baseUrl}/a/${item._id}`,
      rawUrl: `${config.baseUrl}/raw/${item._id}/${latestVer}`,
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

/**
 * Bulk deletes artifacts by their UUIDs.
 * @param {string[]} ids
 * @returns {Promise<{ deletedCount: number, deletedIds: string[], failedIds: string[] }>}
 */
export async function bulkDeleteArtifacts(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedCount: 0, deletedIds: [], failedIds: [] };
  }

  const validIds = Array.from(
    new Set(
      ids
        .filter(id => typeof id === 'string' && isValidUuid4(id.trim()))
        .map(id => id.trim())
    )
  );

  const deletedIds = [];
  const failedIds = [];

  for (const id of validIds) {
    try {
      const ok = await deleteArtifact(id);
      if (ok) {
        deletedIds.push(id);
      } else {
        failedIds.push(id);
      }
    } catch (err) {
      console.error(`[Storage] Failed to delete artifact ${id}:`, err);
      failedIds.push(id);
    }
  }

  return {
    deletedCount: deletedIds.length,
    deletedIds,
    failedIds
  };
}
