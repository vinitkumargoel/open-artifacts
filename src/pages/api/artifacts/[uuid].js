/**
 * /api/artifacts/:uuid — metadata lookup (GET), retention / sharing change (PATCH),
 * and single delete (DELETE).
 */
import { handleGetOne, handleDeleteOne, handleUpdate } from '../../../lib/artifacts.js';

export const prerender = false;

export async function GET({ request, params }) {
  return handleGetOne(request, params.uuid);
}

export async function PATCH({ request, params }) {
  return handleUpdate(request, params.uuid);
}

export async function DELETE({ request, params }) {
  return handleDeleteOne(request, params.uuid);
}
