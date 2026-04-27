import { requireMemberContext } from '@/lib/auth-context';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireMemberContext();
  return children;
}
