'use server';

import { getWorkOS } from './workos.js';
import { headers } from 'next/headers';

export async function validateApiKey() {
  const headersList = await headers();
  const authorizationHeader = headersList.get('authorization');
  if (!authorizationHeader) {
    return { apiKey: null };
  }

  const value = authorizationHeader.match(/Bearer\s+(.*)/)?.[1];
  if (!value) {
    return { apiKey: null };
  }

  const response = await getWorkOS().apiKeys.validateApiKey({ value });
  return response;
}
