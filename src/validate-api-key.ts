import { getWorkOS } from "./workos.js";
import { NextRequest } from "next/server.js";

export async function validateApiKey(req: NextRequest) {
  console.log('req', req);
  const authorizationHeader = req.headers.get('authorization');
  console.log('authorizationHeader', authorizationHeader);
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