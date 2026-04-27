import { notFound } from 'next/navigation';
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Separator,
  Table,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import { requireMemberContext } from '@/lib/auth-context';
import { getCustomerDetailPanelData } from '@/lib/customer-person-store';
import { createPersonForCustomerAction, deletePersonAction, updateCustomerAction } from '../actions';

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const [{ customerId }, context] = await Promise.all([params, requireMemberContext()]);
  const detail = getCustomerDetailPanelData({ organizationId: context.organizationId, customerId });

  if (!detail) {
    notFound();
  }

  return (
    <Flex direction="column" gap="5" width="100%" maxWidth="1000px">
      <Flex direction="column" gap="2">
        <Heading size="8">{detail.customer.name}</Heading>
        <Text color="gray">Customer detail panel with embedded people CRUD.</Text>
      </Flex>

      <Card size="3">
        <form action={updateCustomerAction}>
          <input type="hidden" name="customerId" value={detail.customer.id} />
          <Flex direction="column" gap="3">
            <Heading size="4">Update customer</Heading>
            <Flex gap="3" wrap="wrap">
              <Box width="280px">
                <Text size="2">Name</Text>
                <TextField.Root name="name" defaultValue={detail.customer.name} required />
              </Box>
              <Box width="280px">
                <Text size="2">Website</Text>
                <TextField.Root name="website" defaultValue={detail.customer.website ?? ''} />
              </Box>
              <Box width="220px">
                <Text size="2">Lifecycle stage</Text>
                <TextField.Root name="lifecycleStage" defaultValue={detail.customer.lifecycleStage} />
              </Box>
              <Box width="220px">
                <Text size="2">Status</Text>
                <TextField.Root name="status" defaultValue={detail.customer.status} />
              </Box>
            </Flex>
            <Box>
              <Text size="2">Description</Text>
              <TextArea name="description" defaultValue={detail.customer.description ?? ''} />
            </Box>
            <Flex justify="between" align="center">
              <Flex gap="2">
                <Badge>{detail.customer.lifecycleStage}</Badge>
                <Badge color={detail.customer.status === 'active' ? 'green' : 'gray'}>{detail.customer.status}</Badge>
              </Flex>
              <Button type="submit">Save customer</Button>
            </Flex>
          </Flex>
        </form>
      </Card>

      <Separator size="4" />

      <Card size="3">
        <form action={createPersonForCustomerAction}>
          <input type="hidden" name="customerId" value={detail.customer.id} />
          <Flex direction="column" gap="3">
            <Heading size="4">Add person</Heading>
            <Flex gap="3" wrap="wrap">
              <Box width="220px">
                <Text size="2">First name</Text>
                <TextField.Root name="firstName" required />
              </Box>
              <Box width="220px">
                <Text size="2">Last name</Text>
                <TextField.Root name="lastName" required />
              </Box>
              <Box width="260px">
                <Text size="2">Email</Text>
                <TextField.Root name="email" type="email" />
              </Box>
              <Box width="200px">
                <Text size="2">Role</Text>
                <TextField.Root name="role" defaultValue="unknown" />
              </Box>
              <Box width="200px">
                <Text size="2">Relationship</Text>
                <TextField.Root name="relationshipStatus" defaultValue="unknown" />
              </Box>
            </Flex>
            <Flex justify="end">
              <Button type="submit">Create person</Button>
            </Flex>
          </Flex>
        </form>
      </Card>

      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Relationship</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {detail.people.map((person) => (
            <Table.Row key={person.id}>
              <Table.RowHeaderCell>{`${person.firstName} ${person.lastName}`}</Table.RowHeaderCell>
              <Table.Cell>
                <Badge>{person.role}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge color="gray">{person.relationshipStatus}</Badge>
              </Table.Cell>
              <Table.Cell>{person.email ?? '—'}</Table.Cell>
              <Table.Cell>
                <form action={deletePersonAction}>
                  <input type="hidden" name="personId" value={person.id} />
                  <input type="hidden" name="customerId" value={detail.customer.id} />
                  <Button type="submit" variant="soft" color="red" size="1">
                    Remove
                  </Button>
                </form>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
