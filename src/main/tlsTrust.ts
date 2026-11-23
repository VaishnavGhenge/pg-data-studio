// Which CAs a TLS connection trusts. Node's default store has no Amazon RDS
// CA, so RDS instances failed with "self-signed certificate in certificate
// chain" unless the user pasted a bundle. RDS hosts now also trust the RDS
// roots shipped in rdsCaBundle.ts. Node's public roots stay included because
// passing `ca` replaces the default store, and RDS Proxy endpoints use
// public (ACM) certificates.

import { rootCertificates } from "node:tls";

const RDS_HOST = /\.rds\.amazonaws\.com$/i;

export function isRdsHost(host: string): boolean {
  return RDS_HOST.test(host.trim().replace(/\.$/, ""));
}

/** The `ca` option for a TLS connection, or undefined for Node's defaults. */
export function trustedCa(
  host: string,
  userCa: string | undefined,
  rdsBundle: string,
): string[] | undefined {
  const custom = userCa?.trim();
  if (isRdsHost(host)) return [...rootCertificates, rdsBundle, ...(custom ? [custom] : [])];
  return custom ? [custom] : undefined;
}
