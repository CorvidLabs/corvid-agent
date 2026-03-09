#!/usr/bin/env bun
/**
 * benchmark-system.ts — Measure system resource usage for corvid-agent components
 *
 * Usage:
 *   bun scripts/benchmark-system.ts [--json] [--component <name>]
 *
 * Components:
 *   system     — Host RAM, CPU, disk (always included)
 *   server     — corvid-agent server RSS (requires running server)
 *   localnet   — AlgoKit localnet Docker containers
 *   ollama     — Ollama process memory
 *   deps       — node_modules and database disk usage
 *
 * Without --component, all components are measured.
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/747
 */

import { existsSync, statSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SystemInfo {
  platform: string;
  arch: string;
  totalMemoryGB: number;
  freeMemoryGB: number;
  cpuModel: string;
  cpuCores: number;
  tier: string;
  tierAdvice: string;
}

interface ComponentMetrics {
  name: string;
  status: "running" | "not_running" | "not_installed";
  memoryMB?: number;
  diskMB?: number;
  details?: string;
}

interface BenchmarkResult {
  timestamp: string;
  system: SystemInfo;
  components: ComponentMetrics[];
  totalUsedMB: number;
  recommendations: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function exec(cmd: string): string {
  try {
    const result = Bun.spawnSync(["sh", "-c", cmd], { timeout: 10_000 });
    return result.stdout.toString().trim();
  } catch {
    return "";
  }
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function getTotalMemoryMB(): number {
  const platform = process.platform;
  if (platform === "darwin") {
    const bytes = parseInt(exec("sysctl -n hw.memsize"), 10);
    return bytes / (1024 * 1024);
  }
  if (platform === "linux") {
    const line = exec("grep MemTotal /proc/meminfo");
    const kb = parseInt(line.replace(/[^0-9]/g, ""), 10);
    return kb / 1024;
  }
  // Windows (WSL reports as linux; native Windows via powershell)
  const ps = exec(
    'powershell -Command "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"'
  );
  if (ps) return parseInt(ps, 10) / (1024 * 1024);
  return 0;
}

function getFreeMemoryMB(): number {
  const platform = process.platform;
  if (platform === "darwin") {
    // vm_stat gives pages; page size is 16384 on ARM, 4096 on Intel
    const pageSize = parseInt(exec("sysctl -n hw.pagesize"), 10) || 4096;
    const vmstat = exec("vm_stat");
    const free =
      parseInt(vmstat.match(/Pages free:\s+(\d+)/)?.[1] || "0", 10) * pageSize;
    const inactive =
      parseInt(vmstat.match(/Pages inactive:\s+(\d+)/)?.[1] || "0", 10) *
      pageSize;
    return (free + inactive) / (1024 * 1024);
  }
  if (platform === "linux") {
    const line = exec("grep MemAvailable /proc/meminfo");
    const kb = parseInt(line.replace(/[^0-9]/g, ""), 10);
    return kb / 1024;
  }
  return 0;
}

function getCPUInfo(): { model: string; cores: number } {
  const platform = process.platform;
  if (platform === "darwin") {
    return {
      model: exec("sysctl -n machdep.cpu.brand_string"),
      cores: parseInt(exec("sysctl -n hw.ncpu"), 10),
    };
  }
  if (platform === "linux") {
    const model = exec("grep 'model name' /proc/cpuinfo | head -1")
      .split(":")
      .pop()
      ?.trim() || "Unknown";
    const cores = parseInt(exec("nproc"), 10);
    return { model, cores };
  }
  return { model: "Unknown", cores: 1 };
}

function getTier(totalGB: number): { tier: string; advice: string } {
  if (totalGB < 8)
    return {
      tier: "Below Minimum",
      advice:
        "Not recommended. corvid-agent may run in CLI-only mode with Claude API, but expect frequent swapping.",
    };
  if (totalGB < 16)
    return {
      tier: "Minimum (8 GB)",
      advice:
        "CLI agent only with Claude API. No Docker, no Ollama, lightweight editor. Expect tight margins.",
    };
  if (totalGB < 32)
    return {
      tier: "Recommended (16 GB)",
      advice:
        "Single agent + IDE works well. Use TestNet instead of localnet. Skip Ollama. Close unused browser tabs.",
    };
  if (totalGB < 64)
    return {
      tier: "Comfortable (32 GB)",
      advice:
        "Full stack — localnet + IDE + Docker + browser. Ollama with small models (8B). Room to breathe.",
    };
  return {
    tier: "Unlimited (64 GB+)",
    advice:
      "Everything works — localnet, Ollama (70B+), multi-agent, IDE, browser, all at once.",
  };
}

// ─── Component Measurers ────────────────────────────────────────────────────

function measureServer(): ComponentMetrics {
  // Check if corvid-agent server is running on port 3000
  const health = exec("curl -sf http://localhost:3000/api/health 2>/dev/null");
  if (!health) {
    return { name: "corvid-agent server", status: "not_running" };
  }

  // Find server process RSS
  let memoryMB = 0;
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux") {
    // Look for bun process running server/index.ts
    const pids = exec("pgrep -f 'bun.*server/index'");
    if (pids) {
      for (const pid of pids.split("\n")) {
        const rss = exec(`ps -o rss= -p ${pid.trim()}`);
        if (rss) memoryMB += parseInt(rss, 10) / 1024;
      }
    }
  }

  return {
    name: "corvid-agent server",
    status: "running",
    memoryMB: Math.round(memoryMB),
    details: memoryMB > 0 ? `RSS: ${formatMB(memoryMB)}` : "Running (could not measure RSS)",
  };
}

function measureLocalnet(): ComponentMetrics {
  // Check for Docker
  if (!exec("command -v docker")) {
    return { name: "AlgoKit localnet", status: "not_installed" };
  }

  // Look for AlgoKit localnet containers
  const containers = exec(
    'docker ps --format "{{.Names}}\t{{.ID}}" --filter "name=algokit" 2>/dev/null'
  );
  if (!containers) {
    return {
      name: "AlgoKit localnet",
      status: "not_running",
      details: "Docker available but no localnet containers found",
    };
  }

  // Measure container memory
  let totalMB = 0;
  const parts: string[] = [];
  const stats = exec(
    'docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" --filter "name=algokit" 2>/dev/null'
  );
  if (stats) {
    for (const line of stats.split("\n")) {
      const [name, usage] = line.split("\t");
      if (name && usage) {
        // Parse "123.4MiB / 7.77GiB" format
        const match = usage.match(/([\d.]+)(MiB|GiB)/);
        if (match) {
          const val = parseFloat(match[1]);
          const mb = match[2] === "GiB" ? val * 1024 : val;
          totalMB += mb;
          parts.push(`${name}: ${formatMB(mb)}`);
        }
      }
    }
  }

  return {
    name: "AlgoKit localnet",
    status: "running",
    memoryMB: Math.round(totalMB),
    details: parts.join(", ") || `Total: ${formatMB(totalMB)}`,
  };
}

function measureOllama(): ComponentMetrics {
  if (!exec("command -v ollama")) {
    return { name: "Ollama", status: "not_installed" };
  }

  // Check if Ollama is running
  const models = exec("curl -sf http://localhost:11434/api/tags 2>/dev/null");
  if (!models) {
    return { name: "Ollama", status: "not_running" };
  }

  // Measure Ollama process RSS
  let memoryMB = 0;
  const pids = exec("pgrep -f ollama");
  if (pids) {
    for (const pid of pids.split("\n")) {
      const rss = exec(`ps -o rss= -p ${pid.trim()}`);
      if (rss) memoryMB += parseInt(rss, 10) / 1024;
    }
  }

  // Check running models
  const running = exec("curl -sf http://localhost:11434/api/ps 2>/dev/null");
  let modelInfo = "";
  if (running) {
    try {
      const data = JSON.parse(running);
      if (data.models?.length) {
        modelInfo = data.models
          .map(
            (m: { name: string; size: number }) =>
              `${m.name} (${formatMB(m.size / (1024 * 1024))})`
          )
          .join(", ");
      }
    } catch {}
  }

  return {
    name: "Ollama",
    status: "running",
    memoryMB: Math.round(memoryMB),
    details: modelInfo
      ? `Loaded models: ${modelInfo}`
      : `RSS: ${formatMB(memoryMB)}`,
  };
}

function measureDeps(): ComponentMetrics {
  const root = join(import.meta.dir, "..");
  let diskMB = 0;
  const parts: string[] = [];

  // node_modules
  const nmPath = join(root, "node_modules");
  if (existsSync(nmPath)) {
    const size = exec(`du -sm "${nmPath}" 2>/dev/null`);
    if (size) {
      const mb = parseInt(size, 10);
      diskMB += mb;
      parts.push(`node_modules: ${formatMB(mb)}`);
    }
  }

  // Database
  const dbPath = join(root, "corvid-agent.db");
  if (existsSync(dbPath)) {
    const mb = statSync(dbPath).size / (1024 * 1024);
    diskMB += mb;
    parts.push(`database: ${formatMB(mb)}`);

    // WAL file
    const walPath = dbPath + "-wal";
    if (existsSync(walPath)) {
      const walMB = statSync(walPath).size / (1024 * 1024);
      diskMB += walMB;
      parts.push(`WAL: ${formatMB(walMB)}`);
    }
  }

  // Client dist
  const clientDist = join(root, "client", "dist");
  if (existsSync(clientDist)) {
    const size = exec(`du -sm "${clientDist}" 2>/dev/null`);
    if (size) {
      const mb = parseInt(size, 10);
      diskMB += mb;
      parts.push(`client dist: ${formatMB(mb)}`);
    }
  }

  return {
    name: "Disk usage",
    status: "running",
    diskMB: Math.round(diskMB),
    details: parts.join(", "),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

function run(): BenchmarkResult {
  const totalMB = getTotalMemoryMB();
  const freeMB = getFreeMemoryMB();
  const totalGB = totalMB / 1024;
  const cpu = getCPUInfo();
  const { tier, advice } = getTier(totalGB);

  const system: SystemInfo = {
    platform: process.platform,
    arch: process.arch,
    totalMemoryGB: parseFloat(totalGB.toFixed(1)),
    freeMemoryGB: parseFloat((freeMB / 1024).toFixed(1)),
    cpuModel: cpu.model,
    cpuCores: cpu.cores,
    tier,
    tierAdvice: advice,
  };

  const components: ComponentMetrics[] = [];

  // Determine which components to measure
  const args = process.argv.slice(2);
  const componentArg = args.indexOf("--component");
  const selectedComponent =
    componentArg >= 0 ? args[componentArg + 1] : undefined;

  const shouldMeasure = (name: string) =>
    !selectedComponent || selectedComponent === name;

  if (shouldMeasure("server")) components.push(measureServer());
  if (shouldMeasure("localnet")) components.push(measureLocalnet());
  if (shouldMeasure("ollama")) components.push(measureOllama());
  if (shouldMeasure("deps")) components.push(measureDeps());

  const totalUsedMB = components.reduce(
    (sum, c) => sum + (c.memoryMB || 0),
    0
  );

  // Generate recommendations
  const recommendations: string[] = [];
  if (totalGB < 16) {
    recommendations.push(
      "Consider using TestNet instead of localnet to save ~3-4 GB of RAM"
    );
    recommendations.push(
      "Use a lightweight editor instead of VS Code with many extensions"
    );
    recommendations.push(
      "Avoid running Ollama locally — use Claude API instead"
    );
  }
  if (totalGB < 32) {
    recommendations.push(
      "Close browser DevTools and unused tabs when running the full stack"
    );
  }
  if (
    process.platform === "linux" &&
    exec("grep -q microsoft /proc/version 2>/dev/null && echo yes") === "yes"
  ) {
    recommendations.push(
      "WSL2 detected — set memory limit in ~/.wslconfig to prevent Windows from over-allocating"
    );
    recommendations.push(
      "Consider using Docker Desktop's WSL2 backend memory limit (Settings → Resources)"
    );
  }

  const running = components.filter((c) => c.status === "running");
  if (running.length > 0 && totalUsedMB > totalMB * 0.7) {
    recommendations.push(
      "Running components use >70% of total RAM — consider stopping unused services"
    );
  }

  return {
    timestamp: new Date().toISOString(),
    system,
    components,
    totalUsedMB,
    recommendations,
  };
}

// ─── Output ─────────────────────────────────────────────────────────────────

const result = run();
const jsonMode = process.argv.includes("--json");

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║     corvid-agent System Benchmark         ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  console.log("System");
  console.log("──────");
  console.log(`  Platform:     ${result.system.platform} (${result.system.arch})`);
  console.log(`  CPU:          ${result.system.cpuModel} (${result.system.cpuCores} cores)`);
  console.log(`  Total RAM:    ${result.system.totalMemoryGB} GB`);
  console.log(`  Free RAM:     ${result.system.freeMemoryGB} GB`);
  console.log(`  Tier:         ${result.system.tier}`);
  console.log(`  Advice:       ${result.system.tierAdvice}`);
  console.log();

  console.log("Components");
  console.log("──────────");
  for (const c of result.components) {
    const status =
      c.status === "running"
        ? "✓"
        : c.status === "not_running"
          ? "○"
          : "✗";
    let line = `  ${status} ${c.name}`;
    if (c.memoryMB !== undefined) line += ` — RAM: ${formatMB(c.memoryMB)}`;
    if (c.diskMB !== undefined) line += ` — Disk: ${formatMB(c.diskMB)}`;
    console.log(line);
    if (c.details) console.log(`    ${c.details}`);
  }
  console.log();

  if (result.recommendations.length > 0) {
    console.log("Recommendations");
    console.log("───────────────");
    for (const r of result.recommendations) {
      console.log(`  • ${r}`);
    }
    console.log();
  }
}
