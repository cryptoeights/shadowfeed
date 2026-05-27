#!/usr/bin/env node
// CLI entry point for @shadowfeed/provider-sdk.
//
// Commands:
//   shadowfeed verify --endpoint <url> --secret <secret>

import { runVerify } from './verify.js';

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== undefined && arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === 'verify') {
    const flags = parseArgs(rest);

    const endpoint = flags['endpoint'];
    const secret = flags['secret'] ?? process.env['SHADOWFEED_PARTNER_SECRET'];

    if (!endpoint) {
      process.stderr.write('Usage: shadowfeed verify --endpoint <url> [--secret <secret>]\n');
      process.stderr.write('       secret can also be set via SHADOWFEED_PARTNER_SECRET env var\n');
      process.exit(1);
    }
    if (!secret) {
      process.stderr.write('Error: --secret or SHADOWFEED_PARTNER_SECRET is required\n');
      process.exit(1);
    }

    await runVerify({
      endpoint,
      secret,
      partnerName: flags['partner-name'],
    });
    return;
  }

  process.stdout.write('shadowfeed — ShadowFeed Provider SDK CLI\n\n');
  process.stdout.write('Commands:\n');
  process.stdout.write('  verify    Verify your provider endpoint is correctly configured\n\n');
  process.stdout.write('Run `shadowfeed <command> --help` for details.\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
