import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rules = [
  ['telecom', 'isp'], ['communications', 'isp'], ['broadband', 'isp'], ['internet', 'isp'], ['fiber', 'isp'], ['fibre', 'isp'], ['isp', 'isp'],
  ['mobile', 'mobile'], ['cellular', 'mobile'], ['wireless', 'mobile'], ['dialog', 'mobile'], ['mobitel', 'mobile'], ['airtel', 'mobile'], ['hutch', 'mobile'],
  ['slt', 'isp'], ['sri lanka telecom', 'isp'], ['verizon', 'isp'], ['comcast', 'isp'], ['vodafone', 'mobile'], ['orange', 'isp'], ['bt', 'isp'], ['sky broadband', 'isp'],
  ['amazon', 'cloud'], ['aws', 'cloud'], ['google cloud', 'cloud'], ['google llc', 'cloud'], ['microsoft', 'cloud'], ['azure', 'cloud'], ['cloudflare', 'cloud'],
  ['digitalocean', 'cloud'], ['linode', 'cloud'], ['akamai', 'cloud'], ['fastly', 'cloud'], ['hetzner', 'cloud'], ['ovh', 'cloud'], ['hosting', 'cloud'],
  ['data center', 'cloud'], ['datacenter', 'cloud'], ['vpn', 'vpn'], ['proxy', 'proxy'], ['tor', 'proxy'], ['anonymizer', 'proxy'],
];

async function main() {
  await prisma.networkClassifierRule.createMany({
    data: rules.map(([pattern, networkType], index) => ({
      id: `network_rule_seed_${pattern.replace(/[^a-z0-9]+/gi, '_')}`,
      name: `${pattern} keyword`,
      pattern,
      matchType: 'keyword',
      networkType,
      isLeadNetwork: false,
      priority: index + 10,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  if (process.env.NODE_ENV === 'development') {
    await prisma.companyIpMapping.createMany({
      data: [{
        companyName: 'ABC Manufacturing Ltd',
        companyDomain: 'abcmanufacturing.com',
        ipRange: '203.0.113.0/24',
        source: 'manual',
        confidence: 'high',
        notes: 'Development sample mapping',
        isActive: true,
      }],
      skipDuplicates: true,
    });
  }

  // eslint-disable-next-line no-console
  console.log('Company intelligence seed completed.');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
