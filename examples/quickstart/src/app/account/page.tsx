import { signOut, withAuth } from '@workos-inc/authkit-nextjs';

export default async function AccountPage() {
  const { user } = await withAuth({ ensureSignedIn: true });

  async function handleSignOut() {
    'use server';
    await signOut();
  }

  return (
    <main>
      <h1>Account details</h1>
      <dl>
        <dt>First name</dt>
        <dd>{user.firstName ?? ''}</dd>
        <dt>Last name</dt>
        <dd>{user.lastName ?? ''}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Id</dt>
        <dd>{user.id}</dd>
      </dl>
      <form action={handleSignOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
