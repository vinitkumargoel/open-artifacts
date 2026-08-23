/**
 * /api/artifacts/:uuid — metadata lookup (GET) and single delete (DELETE).
 */
import { handleGetOne, handleDeleteOne } from '../../../lib/artifacts.js';

export const prerender = false;

export async function GET({ request, params }) {
  return handleGetOne(request, params.uuid);
}

export async function DELETE({ request, params }) {
  return handleDeleteOne(request, params.uuid);
}
