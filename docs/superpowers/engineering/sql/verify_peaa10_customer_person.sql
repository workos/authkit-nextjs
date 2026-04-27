-- PEAA-10 executable verification harness
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/superpowers/engineering/sql/verify_peaa10_customer_person.sql

\echo '[PEAA-10] Starting customer/person verification harness'

BEGIN;

-- Stable IDs for deterministic verification.
-- Separate organization used for cross-org negative checks.
INSERT INTO members (id, organization_id, workos_user_id, email, name, role)
VALUES
  ('90000000-0000-4000-8000-000000000001', 'org_verify_peaa10', 'user_verify_admin', 'verify.admin@peazy.test', 'Verify Admin', 'admin'),
  ('90000000-0000-4000-8000-000000000002', 'org_verify_peaa10_other', 'user_verify_other', 'verify.other@peazy.test', 'Verify Other', 'admin')
ON CONFLICT DO NOTHING;

-- Positive: create customer with same-org owner.
DO $$
DECLARE
  v_customer customers;
BEGIN
  v_customer := create_customer_record(
    'org_verify_peaa10',
    'Verification Customer',
    '90000000-0000-4000-8000-000000000001'::uuid,
    'https://verify.example',
    'active',
    'active',
    'Created by verification harness'
  );

  IF v_customer.organization_id <> 'org_verify_peaa10' THEN
    RAISE EXCEPTION 'customer org mismatch';
  END IF;
END;
$$;

-- Negative: reject cross-org owner.
DO $$
BEGIN
  PERFORM create_customer_record(
    'org_verify_peaa10',
    'Should Fail Owner Scope',
    '90000000-0000-4000-8000-000000000002'::uuid,
    NULL,
    'active',
    'active',
    NULL
  );

  RAISE EXCEPTION 'expected cross-org owner rejection did not occur';
EXCEPTION
  WHEN OTHERS THEN
    IF POSITION('same organization' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
END;
$$;

-- Positive: create person linked to valid customer.
DO $$
DECLARE
  v_customer_id uuid;
  v_person people;
BEGIN
  SELECT id
  INTO v_customer_id
  FROM customers
  WHERE organization_id = 'org_verify_peaa10'
    AND name = 'Verification Customer'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'verification customer not found';
  END IF;

  v_person := create_person_record(
    'org_verify_peaa10',
    v_customer_id,
    'Pat',
    'Verifier',
    'pat.verifier@peazy.test',
    NULL,
    'CS Lead',
    'champion',
    'strong',
    'PEAA-10 verification person'
  );

  IF v_person.organization_id <> 'org_verify_peaa10' THEN
    RAISE EXCEPTION 'person org mismatch';
  END IF;
END;
$$;

-- Negative: reject person creation against foreign org customer.
DO $$
DECLARE
  v_other_customer_id uuid;
BEGIN
  INSERT INTO customers (id, organization_id, name, lifecycle_stage, status)
  VALUES (
    '90000000-0000-4000-8000-000000000101',
    'org_verify_peaa10_other',
    'Other Org Customer',
    'active',
    'active'
  )
  ON CONFLICT DO NOTHING;

  v_other_customer_id := '90000000-0000-4000-8000-000000000101'::uuid;

  PERFORM create_person_record(
    'org_verify_peaa10',
    v_other_customer_id,
    'Cross',
    'Org',
    NULL,
    NULL,
    NULL,
    'unknown',
    'unknown',
    NULL
  );

  RAISE EXCEPTION 'expected foreign-org customer rejection did not occur';
EXCEPTION
  WHEN OTHERS THEN
    IF POSITION('customer not found for organization' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
END;
$$;

-- Negative: notes require linked_object_type and linked_object_id together.
DO $$
DECLARE
  v_customer_id uuid;
BEGIN
  SELECT id INTO v_customer_id
  FROM customers
  WHERE organization_id = 'org_verify_peaa10'
    AND name = 'Verification Customer'
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO notes (
    organization_id,
    customer_id,
    title,
    body,
    linked_object_type,
    linked_object_id
  )
  VALUES (
    'org_verify_peaa10',
    v_customer_id,
    'Invalid note pair',
    'Should fail',
    'customer',
    NULL
  );

  RAISE EXCEPTION 'expected note link pair check rejection did not occur';
EXCEPTION
  WHEN OTHERS THEN
    IF POSITION('notes_link_pair_check' IN SQLERRM) = 0
      AND POSITION('note linked object must exist in same organization and customer scope' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
END;
$$;

-- Positive: list/detail read primitives return data.
DO $$
DECLARE
  v_customer_id uuid;
  v_list_count integer;
  v_people_count integer;
BEGIN
  SELECT id INTO v_customer_id
  FROM customers
  WHERE organization_id = 'org_verify_peaa10'
    AND name = 'Verification Customer'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT COUNT(*)
  INTO v_list_count
  FROM get_customers_with_metrics('org_verify_peaa10', NULL, 50, 0);

  SELECT COUNT(*)
  INTO v_people_count
  FROM get_customer_people('org_verify_peaa10', v_customer_id);

  IF v_list_count < 1 THEN
    RAISE EXCEPTION 'expected at least one customer row in metrics view';
  END IF;

  IF v_people_count < 1 THEN
    RAISE EXCEPTION 'expected at least one person row in customer people view';
  END IF;
END;
$$;

ROLLBACK;

\echo '[PEAA-10] Verification harness passed (all assertions succeeded, transaction rolled back)'
