'use client';

import NextLink from 'next/link';
import { Button, Flex, Heading, Text } from '@radix-ui/themes';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { SignInButton } from './components/sign-in-button';

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <Flex direction="column" align="center" gap="2">
      {user ? (
        <>
          <Heading size="8">Welcome back{user?.firstName && `, ${user?.firstName}`}</Heading>
          <Text size="5" color="gray">
            You are now authenticated into the application
          </Text>
          <Flex align="center" gap="3" mt="4">
            <Button asChild size="3" variant="soft">
              <NextLink href="/account">View account</NextLink>
            </Button>
            <SignInButton large />
          </Flex>
        </>
      ) : (
        <>
          <Heading size="8">AuthKit authentication example</Heading>
          <Text size="5" color="gray" mb="4">
            Sign in to view your account details
          </Text>
          <SignInButton large />
        </>
      )}
    </Flex>
  );
}
