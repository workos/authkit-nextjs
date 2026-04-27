import NextLink from 'next/link';
import { Button, Flex, Heading, Text } from '@radix-ui/themes';

export default function AccessDeniedPage() {
  return (
    <Flex direction="column" gap="4" align="center">
      <Heading size="8">Access denied</Heading>
      <Text size="4" color="gray" align="center" style={{ maxWidth: 420 }}>
        You are signed in, but no member record exists for the active organization in this environment.
      </Text>
      <Button asChild variant="soft" size="3">
        <NextLink href="/sign-in?returnTo=/">Return to sign in</NextLink>
      </Button>
    </Flex>
  );
}
