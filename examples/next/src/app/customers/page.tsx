import NextLink from 'next/link';
import { Badge, Box, Button, Card, Flex, Heading, Separator, Table, Text, TextField, TextArea } from '@radix-ui/themes';
import { requireMemberContext } from '@/lib/auth-context';
import { listCustomers } from '@/lib/customer-person-store';
import { createCustomerAction, deleteCustomerAction } from './actions';

export default async function CustomersPage() {
  const context = await requireMemberContext();
  const customers = listCustomers({ organizationId: context.organizationId });

  return (
    <Flex direction="column" gap="5" width="100%" maxWidth="1100px">
      <Flex direction="column" gap="2">
        <Heading size="8">Customers</Heading>
        <Text color="gray">Manage organization-scoped customer records and open the detail panel for people CRUD.</Text>
      </Flex>

      <Card size="3">
        <form action={createCustomerAction}>
          <Flex direction="column" gap="3">
            <Heading size="4">Create customer</Heading>
            <Flex gap="3" wrap="wrap">
              <Box width="280px">
                <Text size="2">Name</Text>
                <TextField.Root name="name" placeholder="Acme Aerospace" required />
              </Box>
              <Box width="280px">
                <Text size="2">Website</Text>
                <TextField.Root name="website" placeholder="https://example.com" />
              </Box>
              <Box width="220px">
                <Text size="2">Lifecycle stage</Text>
                <TextField.Root name="lifecycleStage" defaultValue="active" />
              </Box>
              <Box width="220px">
                <Text size="2">Status</Text>
                <TextField.Root name="status" defaultValue="active" />
              </Box>
            </Flex>
            <Box>
              <Text size="2">Description</Text>
              <TextArea name="description" placeholder="Optional context" />
            </Box>
            <Flex justify="end">
              <Button type="submit">Create customer</Button>
            </Flex>
          </Flex>
        </form>
      </Card>

      <Separator size="4" />

      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Lifecycle</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Updated</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {customers.map((customer) => (
            <Table.Row key={customer.id}>
              <Table.RowHeaderCell>
                <Flex direction="column" gap="1">
                  <Text weight="medium">{customer.name}</Text>
                  {customer.website ? (
                    <Text asChild color="gray" size="1">
                      <a href={customer.website} rel="noreferrer" target="_blank">
                        {customer.website}
                      </a>
                    </Text>
                  ) : null}
                </Flex>
              </Table.RowHeaderCell>
              <Table.Cell>
                <Badge>{customer.lifecycleStage}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge color={customer.status === 'active' ? 'green' : 'gray'}>{customer.status}</Badge>
              </Table.Cell>
              <Table.Cell>{new Date(customer.updatedAt).toLocaleString()}</Table.Cell>
              <Table.Cell>
                <Flex gap="2">
                  <Button asChild variant="soft" size="1">
                    <NextLink href={`/customers/${customer.id}`}>Detail</NextLink>
                  </Button>
                  <form action={deleteCustomerAction}>
                    <input type="hidden" name="customerId" value={customer.id} />
                    <Button type="submit" variant="soft" color="red" size="1">
                      Delete
                    </Button>
                  </form>
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
