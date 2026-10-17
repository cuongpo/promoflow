import '../env.mjs';
import { handleApi } from '../api-routes.mjs';

export default async function handler(request, response) {
  const input = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body;
  await handleApi(String(request.query.route || ''), request.method, input, response);
}
