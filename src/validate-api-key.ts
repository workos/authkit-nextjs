import 'server-only';

import { getWorkOSWithApiKey } from './workos.js';
import { headers } from 'next/headers';

export async function validateApiKey() {
  const workos = getWorkOSWithApiKey('validateApiKey');
  const headersList = await headers();
  const authorizationHeader = headersList.get('authorization');
  if (!authorizationHeader) {
    return { apiKey: null };
  }

  const value = authorizationHeader.match(/Bearer\s+(.*)/i)?.[1];
  if (!value) {
    return { apiKey: null };
  }

  return workos.apiKeys.createValidation({ value });
}
