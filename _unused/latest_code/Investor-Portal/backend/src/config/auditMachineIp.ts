/**
 * Primary IPv4 of the host running the API (SOC audit: which server processed the request).
 *
 * Override with SOC_AUDIT_MACHINE_IP when the process runs behind Docker/Kubernetes and
 * os.networkInterfaces() does not reflect the address you want stored.
 */

import * as os from "node:os";

let cached: string | null = null;

function isIpv4(family: string | number): boolean {
  return family === "IPv4" || family === 4;
}

export function getAuditMachineIp(): string {
  if (cached !== null) return cached;
  const fromEnv = process.env.SOC_AUDIT_MACHINE_IP?.trim();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }
  const nets = os.networkInterfaces();
  for (const key of Object.keys(nets)) {
    const entries = nets[key];
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && isIpv4(entry.family)) {
        cached = entry.address;
        return cached;
      }
    }
  }
  cached = "";
  return cached;
}
