import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

function getLanIp() {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

const port = process.env.PORT || "3000";
const lanIp = getLanIp();
const appUrl = process.env.APP_URL || (lanIp ? `http://${lanIp}:${port}` : `http://localhost:${port}`);

console.log("Starting Ottomate for phone testing...");
console.log(`- Local URL: http://localhost:${port}`);
if (lanIp) {
  console.log(`- Phone URL: ${appUrl}`);
  console.log("- Connect your phone to the same Wi-Fi network and open the Phone URL.");
} else {
  console.log("- LAN IP not detected. Use localhost on this machine, or set APP_URL manually.");
}
console.log("");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCmd,
  ["run", "dev", "--", "--hostname", "0.0.0.0", "--port", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_URL: appUrl,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || appUrl,
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
