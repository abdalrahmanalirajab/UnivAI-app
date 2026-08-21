import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import path from "path";

const localIpv4Hosts = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((entry) => entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set(["127.0.0.1", ...localIpv4Hosts, "192.168.1.6"])],
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
