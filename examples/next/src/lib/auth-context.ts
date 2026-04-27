import type { UserInfo } from '@workos-inc/authkit-nextjs';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { findMemberByAuthIdentity, type MemberRole, type MemberRecord } from './member-store';
import { initializeMembersRepository } from './member-repository-bootstrap';

export interface AppAuthContext {
  memberId: string;
  organizationId: string;
  role: MemberRole;
  workosUserId: string;
}

type AuthBootstrapDecision =
  | {
      kind: 'ok';
      context: AppAuthContext;
    }
  | {
      kind: 'redirect';
      to: string;
    };

const SIGN_IN_PATH = '/sign-in';
const ACCESS_DENIED_PATH = '/access-denied';

function withReturnTo(pathname: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `${pathname}?${params.toString()}`;
}

export function sanitizeReturnTo(raw: string | undefined | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (raw.includes('://')) return '/';
  if (raw.startsWith('/sign-in') || raw.startsWith('/sign-up') || raw.startsWith('/auth/callback')) return '/';

  return raw;
}

function getPathFromRequestUrl(rawUrl: string | null): string {
  if (!rawUrl) return '/';

  try {
    const parsed = new URL(rawUrl);
    return sanitizeReturnTo(`${parsed.pathname}${parsed.search}`);
  } catch {
    return '/';
  }
}

export async function getCurrentPathFromHeaders(): Promise<string> {
  const headerList = await headers();
  return getPathFromRequestUrl(headerList.get('x-url'));
}

export async function decideAuthBootstrap(params: {
  auth: UserInfo;
  returnTo: string;
  resolveMember?: (params: { organizationId: string; workosUserId: string; email?: string | null }) => Promise<MemberRecord | null>;
}): Promise<AuthBootstrapDecision> {
  const { auth, returnTo, resolveMember = findMemberByAuthIdentity } = params;

  if (!auth.organizationId) {
    return {
      kind: 'redirect',
      to: withReturnTo(SIGN_IN_PATH, returnTo),
    };
  }

  const member = await resolveMember({
    organizationId: auth.organizationId,
    workosUserId: auth.user.id,
    email: auth.user.email,
  });

  if (!member) {
    return {
      kind: 'redirect',
      to: `${ACCESS_DENIED_PATH}?reason=no_member`,
    };
  }

  return {
    kind: 'ok',
    context: {
      memberId: member.id,
      organizationId: member.organizationId,
      role: member.role,
      workosUserId: member.workosUserId,
    },
  };
}

async function resolveRequiredMemberContext(): Promise<AppAuthContext> {
  await initializeMembersRepository();
  const auth = await withAuth({ ensureSignedIn: true });
  const returnTo = await getCurrentPathFromHeaders();
  const decision = await decideAuthBootstrap({ auth, returnTo });

  if (decision.kind === 'redirect') {
    redirect(decision.to);
  }

  return decision.context;
}

export const requireMemberContext = cache(resolveRequiredMemberContext);
