import mongoose from 'mongoose';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VersionSchema = new mongoose.Schema({
  versionNumber: {
    type: Number,
    required: true,
    min: 1
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 1
  },
  contentHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const ArtifactSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    match: UUID_V4_REGEX
  },
  title: {
    type: String,
    required: true,
    maxlength: 120,
    default: 'Untitled Artifact'
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  latestVersion: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  viewCount: {
    type: Number,
    default: 0
  },
  versions: {
    type: [VersionSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  bufferCommands: false
});

ArtifactSchema.index({ createdAt: -1 });

export const Artifact = mongoose.models.Artifact || mongoose.model('Artifact', ArtifactSchema);
export default Artifact;
