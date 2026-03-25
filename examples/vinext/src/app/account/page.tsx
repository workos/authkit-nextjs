'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { Text, Heading, TextField, Flex, Box } from '@radix-ui/themes';

export default function AccountPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  const userFields = [
    ['First name', user?.firstName],
    ['Last name', user?.lastName],
    ['Email', user?.email],
    ['Id', user?.id],
  ].filter(([, value]) => value);

  return (
    <>
      <Flex direction="column" gap="2" mb="7">
        <Heading size="8" align="center">
          Account details
        </Heading>
        <Text size="5" align="center" color="gray">
          Below are your account details
        </Text>
      </Flex>

      <Flex direction="column" justify="center" gap="3" width="400px">
        {userFields.map(([label, value]) => (
          <Flex asChild align="center" gap="6" key={String(label)}>
            <label>
              <Text weight="bold" size="3" style={{ width: 100 }}>
                {label}
              </Text>

              <Box flexGrow="1">
                <TextField.Root value={String(value) || ''} readOnly />
              </Box>
            </label>
          </Flex>
        ))}
      </Flex>
    </>
  );
}
