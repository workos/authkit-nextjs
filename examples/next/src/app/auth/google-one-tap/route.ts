import { handleGoogleOneTap } from '@workos-inc/authkit-nextjs';

export const POST = handleGoogleOneTap({ returnPathname: '/account' });
