import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import path from "node:path";

const VIRTUAL_ADAPTER = /radmin|tailscale|vpn|vethernet|virtual|docker|wsl|loopback/i;
const PHYSICAL_ADAPTER = /wi-?fi|wlan|ethernet/i;

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith("10.") || address.startsWith("192.168.")) return true;
  const match = /^172\.(\d+)\./.exec(address);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

const candidates = Object.entries(networkInterfaces())
  .flatMap(([name, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => ({ name, address: entry.address }))
  )
  .filter((candidate) => isPrivateIpv4(candidate.address) && !VIRTUAL_ADAPTER.test(candidate.name))
  .sort((left, right) =>
    Number(PHYSICAL_ADAPTER.test(right.name)) - Number(PHYSICAL_ADAPTER.test(left.name))
  );

const hostname = candidates[0]?.address ?? "0.0.0.0";
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

console.log(`[UnivAI] Next dev LAN host: ${hostname}`);

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "--hostname", hostname, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
);

child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
