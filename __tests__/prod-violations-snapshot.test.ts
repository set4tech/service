import { describe, it, expect } from 'vitest';

/**
 * Production violations snapshot test
 *
 * This test calls the production database directly to ensure the get_assessment_report
 * RPC function returns consistent results. If violations change unexpectedly, this test
 * will fail and alert us to potential regressions.
 *
 * To update snapshots after intentional changes:
 * 1. Run the queries manually to get new expected values
 * 2. Update the EXPECTED_VIOLATIONS object below
 */

// Production connection string - read from env or use default
const PROD_CONNECTION =
  process.env.PROD_DATABASE_URL ||
  'postgresql://postgres.grosxzvvmhakkxybeuwu:beiajs3%26%21%21jfSJAB12@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

interface ViolationSnapshot {
  check_id: string;
  code_section_number: string;
  effective_status: string;
}

// Snapshot of expected violations per assessment (captured 2024-12-02)
const EXPECTED_VIOLATIONS: Record<string, ViolationSnapshot[]> = {
  'dd3e90be-5200-4d17-a5ac-27530a45be5e': [
    {
      check_id: '03f6391b-3f50-439a-81cc-035e4210a74e',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '1472d74a-6f91-4ee1-819d-8994e241108f',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '1fc5007d-6279-42ad-b269-9e47ed097691',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '2370c287-40e3-44b7-87c5-4fb12e5ef39a',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '2a930651-2a5b-4335-967c-f5e7bbe9e150',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '2f937d1c-7d2e-45cd-a034-cb22f867ac73',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '411b8c66-cd69-4e08-a462-595b3f08d104',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '59366c45-abff-49ad-ad92-2692a996ad15',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '5aad038f-b90b-46a4-bb82-0662a2375d6b',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '5bcfe04c-3d75-4c79-96e8-825148ea6b7b',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '607bac45-d589-48e1-a6a5-54fe18d15405',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '6a55abdc-ceaa-4fa8-8987-e514660bab4b',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '6aadc041-6fff-448b-a979-aff385fe670d',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '71ef1e32-116c-4db6-8f3c-378da1c7b17c',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '7dc716aa-a06b-4016-a619-9452c170acfc',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '82fbcd0c-7f0a-41fe-b2e6-841044653447',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '8430194a-1706-4f30-a3b3-0528e48d81d5',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '8f2d831b-cf81-4632-98dc-1b3ad0a4099b',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '934ec5d0-4ea2-4d09-9886-7f56e5df3473',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '981e74d5-ccf6-4b8b-a61b-7680487d28dc',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'a28c5e7f-befc-4ca7-a8f7-89f66615339c',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'b5038129-9646-471b-b157-63b09bf10e23',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'b6faaf85-be37-4a15-9531-aa4e9780dd58',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'bc0ac882-1ca5-4f28-b53b-2a642853bf02',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'c7c87016-52a1-4543-a155-61381a7bba65',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'cd419cf2-e608-4b3d-8500-25324219ebd3',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'd1fb7445-0dad-482f-8a93-6e08ecbc62c9',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'd45b4585-3b0c-4677-8f97-c6cd623e38f6',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'd7f3b326-f116-4919-9d7c-82b2a5601a8c',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'dc8a5a2a-7f7f-4ff1-a87a-4f5a59172323',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'dfc7eba7-f318-43cb-acac-cadade45e973',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'f67a3042-d5e8-4cb2-b5b9-e7a6b87f56cc',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'fa45a72c-4f2e-434f-a5b1-2e987a0a7c07',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
  ],
  'f6cd10b4-74d5-4326-a2a3-3d0d989c4f64': [
    {
      check_id: '062b9cca-3200-4467-9e7d-b98b00862dda',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '1e6d1dd2-4116-4eb1-b080-d7cac0228405',
      code_section_number: '1132A.5',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '1f24f6ca-88cf-4c1f-9c59-fc45faa8621d',
      code_section_number: '1132A.1',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '1ff1a310-7657-476a-8c89-81bcc29292f2',
      code_section_number: '1126A.3.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '29855f3b-d7f1-46dc-be29-bfceb993fcaa',
      code_section_number: '1126A.3.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '312a1e84-dc76-4d5c-a082-c034284e20cb',
      code_section_number: '1126A.3.2.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '31666ff6-31a5-4343-bf73-b1729c803998',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '37e9d889-781f-49f0-a354-3f3705661875',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '39bea777-7f4a-4e09-8123-c32c1d4459e5',
      code_section_number: '1126A.3.4.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '3f29ad71-e6e1-4f23-b7ee-7b34a80b6d0c',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '40861aaa-f3ed-40cb-9846-c274c000060c',
      code_section_number: '1132A.5',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '40e1a793-c99c-41ef-81e7-d63916b31c3f',
      code_section_number: '1126A.3.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '41ecc8fe-f4db-4be1-a6b8-3cd4538a58ac',
      code_section_number: '1126A.3.4.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: '47cf2a96-fd85-4958-96f7-a765000902f8',
      code_section_number: '1126A.3.4.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: '48175f16-8c20-4aea-8c72-4bc1cb192b89',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '483c126c-029e-4af3-a73e-df175f547a8a',
      code_section_number: '1126A.3.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '4ae3245e-b50d-437c-9916-c54d0d7679e5',
      code_section_number: '1126A.3.4.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '51e588d4-17df-4c6f-abc5-b04c3cc27f3d',
      code_section_number: '1126A.3.2.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '601f5681-4620-4d03-80e6-2c0329369ca5',
      code_section_number: '1126A.3.4.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '6d89fc74-c953-4202-97ad-8840fa02c9b8',
      code_section_number: '1132A.3',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '6e205d6f-35c0-48d8-84b5-c3a4b0cbc88d',
      code_section_number: '1132A.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '6f99f0ed-a05b-4180-921b-2f6329f1aa44',
      code_section_number: '1126A.3.2.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '75ace617-93ba-4169-b6c2-9ad9bad2ce58',
      code_section_number: '1126A.3.4.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '7c6e31cf-e6f8-49a2-baea-13c70ded0c51',
      code_section_number: '1126A.3.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '7ff2e05d-6991-494a-9b3e-79ce2730e32c',
      code_section_number: '1126A.3.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '80037f5d-db3b-4298-8a0a-b75a31c257d6',
      code_section_number: '1132A.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '817a1bfd-61ce-4fc3-ab24-e6b329d3bda3',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '846abcd3-0890-4707-be48-a31eed5cdb6b',
      code_section_number: '1126A.3.4.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: '89f77e7a-62f0-479b-9800-014486aef9a8',
      code_section_number: '1126A.3.4.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '94cc3e1d-99e5-4061-aeb6-addb40e0ce77',
      code_section_number: '1126A.3.4.5',
      effective_status: 'non_compliant',
    },
    {
      check_id: '9e56f651-8b91-4f45-9d18-4cd86f4c5f89',
      code_section_number: '1126A.1',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '9eb837b9-1bd5-4bcf-9a23-cbd7118b6183',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'a4e962e8-5336-4d7f-bf7e-a893e3540fc2',
      code_section_number: '1126A.3.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'a54d0f44-c35a-426b-95f2-9cbfe7e8f054',
      code_section_number: '1126A.3.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'a5e99646-f6e5-4ad8-86bb-791825cd7122',
      code_section_number: '1126A.3.4.5',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'ac4433ea-002d-47b2-8219-2364b36f52db',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'b477db4e-cfdf-4500-9574-0bd64d7cf840',
      code_section_number: '1132A.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'b8154edc-3fee-437e-aaa8-ec1f14b997ec',
      code_section_number: '1126A.3.4.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'ba99abbb-51ed-4ee4-80e3-288aae671dae',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'bb7007ef-3911-4112-b78f-44940843321c',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'c04d6202-6aa3-43bc-8db3-4fdb4b3ccd60',
      code_section_number: '1132A.10',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'c4298a24-5352-48ac-b270-78106cc27cf3',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'c4d2fa3d-c3a0-466c-868a-edf28420d071',
      code_section_number: '1132A.2',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'c7782da8-4ec5-4614-a0a8-fa926df9a357',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'cca7efe9-c11f-4f97-987d-f0a092b26f23',
      code_section_number: '1126A.3.4.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'd58ed3aa-0c3e-4d83-a21b-f2a548aa6f0b',
      code_section_number: '1126A.3.2.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'dfed0638-0ab8-4d90-aa5f-bc95f94143c8',
      code_section_number: '1126A.1',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'eeea6c37-1a83-4386-b391-3e249052a21a',
      code_section_number: '1132A.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'f111a8a0-485d-4453-bb11-a6cee33ede95',
      code_section_number: '1132A',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'f7bb0393-9bdf-4329-bb07-daf3b099af6e',
      code_section_number: '1126A.3.4.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'f9a291c2-4b81-449f-adbc-728ea7c5b0c5',
      code_section_number: '1126A.3.2.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'fa37d0eb-d739-4cbb-a95e-4619f7e648d2',
      code_section_number: '1126A.3.2.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'ff1a01cc-8920-4137-929f-41bca762c105',
      code_section_number: '1126A.3.4.4',
      effective_status: 'non_compliant',
    },
  ],
  '3869242d-bfc0-488f-891a-91e2ab86f309': [
    {
      check_id: '2fed197e-9c53-4e7d-b62d-e4e74a9a6c2f',
      code_section_number: '11B-247.1.2.5',
      effective_status: 'insufficient_information',
    },
    {
      check_id: '47158328-9f45-47a8-9196-1bda2cc64d2f',
      code_section_number: '11B-309.4',
      effective_status: 'insufficient_information',
    },
    {
      check_id: '728cdecb-4b37-4a2f-8933-cd97cec7e4df',
      code_section_number: '11B-703.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: '74c72984-e27b-4d92-8aa8-afbe1b4e97b4',
      code_section_number: '11B-404.2.8.1',
      effective_status: 'insufficient_information',
    },
    {
      check_id: '7cef7c52-60b6-4548-be1c-5a18a2b64a63',
      code_section_number: '11B-603.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: '8a8aa141-0da9-4932-88c7-caa89e9f5740',
      code_section_number: '11B-603.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'd2df13f3-f9a0-4518-b541-a89e44eebc7e',
      code_section_number: '11B-703.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'dab66d8e-7c7a-4d4b-a5b1-68ad3590c307',
      code_section_number: '11B-216.4.2',
      effective_status: 'insufficient_information',
    },
  ],
  '3b543619-6080-46f3-9187-7760eb83cea0': [
    {
      check_id: '1a53c6db-a427-45d4-bba6-8d0d27b3b8b9',
      code_section_number: '11B-206.2.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: '598bf5fd-1a50-4987-8e41-bd09f69e937b',
      code_section_number: '11B-206.5.1',
      effective_status: 'non_compliant',
    },
    {
      check_id: '60083ed0-f357-4ee2-929d-06605b31869d',
      code_section_number: '11B-206.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '69501bbf-7f86-488f-809d-5df885d7b27f',
      code_section_number: '11B-404.3',
      effective_status: 'non_compliant',
    },
    {
      check_id: '696f5b06-3eef-403d-9482-cb7d6a2e327a',
      code_section_number: '11B-603.2',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '76853669-cc7f-4197-acb0-535186e7508c',
      code_section_number: '11B-603.2',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '89fad9eb-c72d-451f-86c7-b8e33fe10c2f',
      code_section_number: '11B-202.4',
      effective_status: 'needs_more_info',
    },
    {
      check_id: '96544344-21f1-45ab-9e08-b0accceebd1b',
      code_section_number: '11B-202.4',
      effective_status: 'non_compliant',
    },
    {
      check_id: '969d69be-7363-4815-ab6b-2533f3fd218c',
      code_section_number: '11B-202.4',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'c059da2d-7aa1-491a-9742-0749d0c7b10f',
      code_section_number: '11B-202.4',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'd21387e3-2fe0-4d3f-8395-d8f65e0825b0',
      code_section_number: '11B-202.4',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'e9ece944-7496-4aa4-9f33-1bf59774c898',
      code_section_number: '11B-304.4',
      effective_status: 'needs_more_info',
    },
    {
      check_id: 'f88b6d43-6ecd-42d6-839c-9512113443ed',
      code_section_number: '11B-304.4',
      effective_status: 'needs_more_info',
    },
  ],
  '1c26cec6-080d-4725-8d09-c13feb518c47': [
    {
      check_id: '1c00d847-54ee-4cb3-b205-a5adb5e6bba2',
      code_section_number: '11B-503.2',
      effective_status: 'non_compliant',
    },
    {
      check_id: 'a7ed2b54-18e4-4d8b-95eb-1898e8f821d8',
      code_section_number: '11B-216.10',
      effective_status: 'non_compliant',
    },
  ],
};

async function fetchViolationsFromProd(assessmentId: string): Promise<ViolationSnapshot[]> {
  const { execSync } = await import('child_process');

  const query = `SELECT json_agg(json_build_object('check_id', check_id, 'code_section_number', code_section_number, 'effective_status', effective_status) ORDER BY check_id) FROM get_assessment_report('${assessmentId}')`;

  const result = execSync(`PGSSLMODE=require psql "${PROD_CONNECTION}" -t -A -c "${query}"`, {
    encoding: 'utf-8',
    timeout: 30000,
  }).trim();

  if (!result || result === '' || result === 'null') {
    return [];
  }

  return JSON.parse(result);
}

describe('Production Violations Snapshot', () => {
  describe('Violations consistency checks', () => {
    Object.entries(EXPECTED_VIOLATIONS).forEach(([assessmentId, expectedViolations]) => {
      it(`Assessment ${assessmentId} should have ${expectedViolations.length} violations`, async () => {
        const actualViolations = await fetchViolationsFromProd(assessmentId);

        // Check count first
        expect(actualViolations.length).toBe(expectedViolations.length);

        // Check each violation matches
        const actualIds = actualViolations.map(v => v.check_id).sort();
        const expectedIds = expectedViolations.map(v => v.check_id).sort();
        expect(actualIds).toEqual(expectedIds);

        // Check section numbers and statuses
        for (const expected of expectedViolations) {
          const actual = actualViolations.find(v => v.check_id === expected.check_id);
          expect(actual).toBeDefined();
          expect(actual?.code_section_number).toBe(expected.code_section_number);
          expect(actual?.effective_status).toBe(expected.effective_status);
        }
      });
    });
  });

  // Quick count-only test that always runs
  it('should be able to query prod database', async () => {
    // Just verify we can connect - this test is lightweight
    const { execSync } = await import('child_process');
    const result = execSync(`PGSSLMODE=require psql "${PROD_CONNECTION}" -t -A -c "SELECT 1"`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();
    expect(result).toBe('1');
  });
});
