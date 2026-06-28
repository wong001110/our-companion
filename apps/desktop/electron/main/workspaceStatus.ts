import os from 'node:os';

export type WorkspaceStatusMetrics = {
  cpuUsage?: number;
  memoryUsage?: number;
  memoryTotal?: number;
  memoryUsed?: number;
  gpuStatus?: string;
  batteryPercent?: number;
  batteryCharging?: boolean;
  networkOnline?: boolean;
  uptime?: number;
  platform?: string;
  hostname?: string;
  cpuModel?: string;
  cpuCores?: number;
  arch?: string;
};

export type WorkspaceSummary = {
  cpu: 'low' | 'medium' | 'high' | 'unknown';
  memory: 'low' | 'medium' | 'high' | 'unknown';
  battery: 'charging' | 'normal' | 'low' | 'unknown';
  network: 'online' | 'offline' | 'unknown';
};

export type WorkspaceStatusSnapshot = {
  metrics: WorkspaceStatusMetrics;
  summary: WorkspaceSummary;
  lastUpdatedAt: number;
  availableMetrics: string[];
  unavailableMetrics: string[];
};

function getAverageCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  return Math.round((1 - totalIdle / totalTick) * 100);
}

function getMemoryMetrics(): { usage: number; total: number; used: number } {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { usage: Math.round((used / total) * 100), total, used };
}

function classifyCpuusage(pct: number): 'low' | 'medium' | 'high' {
  if (pct < 30) return 'low';
  if (pct < 70) return 'medium';
  return 'high';
}

function classifyMemory(pct: number): 'low' | 'medium' | 'high' {
  if (pct < 50) return 'low';
  if (pct < 80) return 'medium';
  return 'high';
}

export function collectWorkspaceStatus(): WorkspaceStatusSnapshot {
  const available: string[] = [];
  const unavailable: string[] = [];
  const metrics: WorkspaceStatusMetrics = {};

  try {
    metrics.cpuUsage = getAverageCpuUsage();
    available.push('cpuUsage');
  } catch {
    unavailable.push('cpuUsage');
  }

  try {
    const mem = getMemoryMetrics();
    metrics.memoryUsage = mem.usage;
    metrics.memoryTotal = mem.total;
    metrics.memoryUsed = mem.used;
    available.push('memoryUsage', 'memoryTotal', 'memoryUsed');
  } catch {
    unavailable.push('memoryUsage');
  }

  try {
    metrics.uptime = os.uptime();
    available.push('uptime');
  } catch {
    unavailable.push('uptime');
  }

  try {
    metrics.platform = os.platform();
    metrics.hostname = os.hostname();
    metrics.arch = os.arch();
    const cpus = os.cpus();
    if (cpus.length > 0) {
      metrics.cpuModel = cpus[0].model;
      metrics.cpuCores = cpus.length;
    }
    available.push('platform', 'hostname', 'arch');
  } catch {
    unavailable.push('platform');
  }

  try {
    metrics.networkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    available.push('networkOnline');
  } catch {
    unavailable.push('networkOnline');
  }

  const summary: WorkspaceSummary = {
    cpu: metrics.cpuUsage !== undefined ? classifyCpuusage(metrics.cpuUsage) : 'unknown',
    memory: metrics.memoryUsage !== undefined ? classifyMemory(metrics.memoryUsage) : 'unknown',
    battery: 'unknown',
    network: metrics.networkOnline !== undefined ? (metrics.networkOnline ? 'online' : 'offline') : 'unknown',
  };

  return {
    metrics,
    summary,
    lastUpdatedAt: Date.now(),
    availableMetrics: available,
    unavailableMetrics: unavailable,
  };
}
