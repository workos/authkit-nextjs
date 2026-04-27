import { getSignUpUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { sanitizeReturnTo } from '@/lib/auth-context';

interface RequestWithNextUrl extends Request {
  nextUrl?: URL;
}

export const GET = async (request: RequestWithNextUrl) => {
  const returnTo = sanitizeReturnTo(request.nextUrl?.searchParams.get('returnTo'));
  const signUpUrl = await getSignUpUrl({ returnTo });

  return redirect(signUpUrl);
};
