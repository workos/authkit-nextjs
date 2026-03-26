import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export const GET = async (request: NextRequest) => {
  const loginHint = request.nextUrl.searchParams.get('login_hint') ?? undefined;
  const signInUrl = await getSignInUrl({ loginHint });

  return redirect(signInUrl);
};
