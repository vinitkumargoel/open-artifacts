/**
 * /api/artifacts/bulk-delete — bulk delete (POST).
 *
 * GET and DELETE mirror the Hono router's fall-through: those methods matched
 * the /api/artifacts/:uuid routes with uuid = 'bulk-delete' (an invalid UUID),
 * so they behave exactly like a lookup/delete on a malformed ID.
 */
import { handleBulkDelete, handleGetOne, handleDeleteOne } from '../../../lib/artifacts.js';

export const prerender = false;

export async function POST({ request }) {
  return handleBulkDelete(request);
}

export async function GET({ request }) {
  return handleGetOne(request, 'bulk-delete');
}

export async function DELETE({ request }) {
  return handleDeleteOne(request, 'bulk-delete');
}
