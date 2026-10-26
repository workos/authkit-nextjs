import Link from 'next/link';
import { withAuth } from '@workos-inc/authkit-nextjs';

export default async function HomePage() {
  const { user } = await withAuth();

  if (!user) {
    return (
      <main>
        <h1>AuthKit Next.js Quickstart</h1>
        <p>You are not signed in.</p>
        <a href="/login">Sign in</a>
      </main>
    );
  }

  return (
    <main>
      <h1>Welcome back{user.firstName ? `, ${user.firstName}` : ''}</h1>
      <p>You are signed in.</p>
      <Link href="/account">View account</Link>
    </main>
  );
}
