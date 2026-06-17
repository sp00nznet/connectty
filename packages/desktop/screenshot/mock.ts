/**
 * Mock `window.connectty` for marketing screenshots.
 *
 * Implements the same surface as packages/tauri/src-frontend/connectty-api.ts,
 * but every call returns believable FAKE data — no backend, no real hosts.
 * Terminal output is synthesized and pushed through the onEvent callbacks so
 * xterm renders a realistic-looking session.
 *
 * Nothing here touches the network or the filesystem; it is safe to ship the
 * rendered PNGs as documentation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const iso = (daysAgo = 0, hoursAgo = 0) =>
  new Date(Date.UTC(2026, 5, 17, 14, 0, 0) - daysAgo * 864e5 - hoursAgo * 36e5).toISOString();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const groups = [
  { id: 'g-prod', name: 'Production', color: '#ef4444', membershipType: 'static', createdAt: iso(120), updatedAt: iso(2) },
  { id: 'g-stage', name: 'Staging', color: '#f59e0b', membershipType: 'static', createdAt: iso(120), updatedAt: iso(2) },
  { id: 'g-db', name: 'Databases', color: '#3b82f6', membershipType: 'static', createdAt: iso(120), updatedAt: iso(2) },
  { id: 'g-net', name: 'Network', color: '#10b981', membershipType: 'static', createdAt: iso(120), updatedAt: iso(2) },
];

const credentials = [
  { id: 'c-deploy', name: 'deploy (SSH key)', type: 'privateKey', username: 'deploy', autoAssignPatterns: ['*.prod.acme.io'], createdAt: iso(200), updatedAt: iso(10), usedBy: ['s-web1', 's-web2', 's-api1'] },
  { id: 'c-root', name: 'root (password)', type: 'password', username: 'root', autoAssignPatterns: ['10.20.*'], createdAt: iso(200), updatedAt: iso(40), usedBy: ['s-db1', 's-db2'] },
  { id: 'c-admin', name: 'ACME\\administrator', type: 'domain', username: 'administrator', domain: 'ACME', autoAssignPatterns: ['*.corp.acme.io'], createdAt: iso(180), updatedAt: iso(15), usedBy: ['s-win1'] },
  { id: 'c-agent', name: 'SSH Agent', type: 'agent', username: 'sp00nz', createdAt: iso(90), updatedAt: iso(5), usedBy: [] },
];

const connections = [
  { id: 's-web1', name: 'web-01', hostname: 'web-01.prod.acme.io', port: 22, connectionType: 'ssh', osType: 'linux', username: 'deploy', credentialId: 'c-deploy', tags: ['nginx', 'edge'], group: 'g-prod', description: 'Primary edge / reverse proxy', healthStatus: 'online', createdAt: iso(120), updatedAt: iso(1), lastConnectedAt: iso(0, 2) },
  { id: 's-web2', name: 'web-02', hostname: 'web-02.prod.acme.io', port: 22, connectionType: 'ssh', osType: 'linux', username: 'deploy', credentialId: 'c-deploy', tags: ['nginx', 'edge'], group: 'g-prod', healthStatus: 'online', createdAt: iso(120), updatedAt: iso(1), lastConnectedAt: iso(0, 5) },
  { id: 's-api1', name: 'api-01', hostname: 'api-01.prod.acme.io', port: 22, connectionType: 'ssh', osType: 'linux', username: 'deploy', credentialId: 'c-deploy', tags: ['node', 'api'], group: 'g-prod', healthStatus: 'online', createdAt: iso(120), updatedAt: iso(1) },
  { id: 's-api2', name: 'api-02', hostname: 'api-02.prod.acme.io', port: 22, connectionType: 'ssh', osType: 'linux', username: 'deploy', credentialId: 'c-deploy', tags: ['node', 'api'], group: 'g-prod', healthStatus: 'degraded', createdAt: iso(120), updatedAt: iso(1) },
  { id: 's-k8s1', name: 'k8s-node-1', hostname: '10.20.4.11', port: 22, connectionType: 'ssh', osType: 'linux', username: 'core', credentialId: 'c-root', tags: ['k8s', 'worker'], group: 'g-prod', healthStatus: 'online', createdAt: iso(80), updatedAt: iso(1) },
  { id: 's-db1', name: 'pg-primary', hostname: '10.20.8.21', port: 22, connectionType: 'ssh', osType: 'linux', username: 'postgres', credentialId: 'c-root', tags: ['postgres', 'primary'], group: 'g-db', healthStatus: 'online', createdAt: iso(160), updatedAt: iso(1) },
  { id: 's-db2', name: 'pg-replica', hostname: '10.20.8.22', port: 22, connectionType: 'ssh', osType: 'linux', username: 'postgres', credentialId: 'c-root', tags: ['postgres', 'replica'], group: 'g-db', healthStatus: 'online', createdAt: iso(160), updatedAt: iso(1) },
  { id: 's-stage1', name: 'stage-app', hostname: 'app.stage.acme.io', port: 22, connectionType: 'ssh', osType: 'linux', username: 'ubuntu', credentialId: 'c-deploy', tags: ['app'], group: 'g-stage', healthStatus: 'online', createdAt: iso(60), updatedAt: iso(1) },
  { id: 's-win1', name: 'win-jump', hostname: 'jump.corp.acme.io', port: 3389, connectionType: 'rdp', osType: 'windows', username: 'administrator', credentialId: 'c-admin', tags: ['jumpbox', 'rdp'], group: 'g-prod', healthStatus: 'online', createdAt: iso(140), updatedAt: iso(1) },
  { id: 's-sw1', name: 'core-switch', hostname: '10.0.0.1', port: 22, connectionType: 'ssh', osType: 'linux', username: 'admin', credentialId: 'c-root', tags: ['cisco', 'l3'], group: 'g-net', healthStatus: 'online', createdAt: iso(300), updatedAt: iso(1) },
  { id: 's-fw1', name: 'edge-fw', hostname: '10.0.0.2', port: 22, connectionType: 'ssh', osType: 'linux', username: 'admin', credentialId: 'c-root', tags: ['firewall'], group: 'g-net', healthStatus: 'online', createdAt: iso(300), updatedAt: iso(1) },
  { id: 's-ser1', name: 'rack-console', hostname: '/dev/ttyUSB0', port: 0, connectionType: 'serial', osType: 'linux', tags: ['console', 'oob'], group: 'g-net', serialSettings: { baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1, flowControl: 'none' }, healthStatus: 'online', createdAt: iso(300), updatedAt: iso(1) },
];

const providers = [
  { id: 'p-vmw', name: 'vCenter (DC-East)', type: 'esxi', enabled: true, autoDiscover: true, discoverInterval: 3600, lastDiscoveryAt: iso(0, 1), config: { host: 'vcenter.dc-east.acme.io', username: 'svc-discovery@vsphere.local' }, createdAt: iso(200), updatedAt: iso(0, 1) },
  { id: 'p-prox', name: 'Proxmox Cluster', type: 'proxmox', enabled: true, autoDiscover: true, discoverInterval: 3600, lastDiscoveryAt: iso(0, 3), config: { host: 'pve.lab.acme.io', node: 'pve-01' }, createdAt: iso(150), updatedAt: iso(0, 3) },
  { id: 'p-aws', name: 'AWS (us-east-1)', type: 'aws', enabled: true, autoDiscover: true, discoverInterval: 1800, lastDiscoveryAt: iso(0, 0), config: { region: 'us-east-1' }, createdAt: iso(180), updatedAt: iso(0, 0) },
  { id: 'p-gcp', name: 'GCP (acme-prod)', type: 'gcp', enabled: true, autoDiscover: false, lastDiscoveryAt: iso(1), config: { projectId: 'acme-prod' }, createdAt: iso(90), updatedAt: iso(1) },
  { id: 'p-az', name: 'Azure (Sub-Prod)', type: 'azure', enabled: false, autoDiscover: false, config: { subscriptionId: '8f3a…d21c' }, createdAt: iso(70), updatedAt: iso(20) },
  { id: 'p-bf', name: 'BigFix Root', type: 'bigfix', enabled: true, autoDiscover: true, discoverInterval: 7200, lastDiscoveryAt: iso(0, 6), config: { host: 'bigfix.corp.acme.io' }, createdAt: iso(220), updatedAt: iso(0, 6) },
];

const discoveredHosts = [
  { id: 'd1', providerId: 'p-aws', providerHostId: 'i-0a1b2c3d', name: 'prod-cache-1', hostname: 'ec2-3-91-22-10.compute-1.amazonaws.com', privateIp: '10.30.1.10', publicIp: '3.91.22.10', osType: 'linux', osName: 'Amazon Linux 2023', state: 'running', metadata: { instanceType: 't3.medium', az: 'us-east-1a' }, tags: { Role: 'cache', Env: 'prod' }, discoveredAt: iso(0, 0), lastSeenAt: iso(0, 0), imported: false },
  { id: 'd2', providerId: 'p-aws', providerHostId: 'i-0e4f5a6b', name: 'prod-worker-1', hostname: 'ec2-54-160-8-4.compute-1.amazonaws.com', privateIp: '10.30.2.21', publicIp: '54.160.8.4', osType: 'linux', osName: 'Ubuntu 24.04', state: 'running', metadata: { instanceType: 'c6i.xlarge', az: 'us-east-1b' }, tags: { Role: 'worker', Env: 'prod' }, discoveredAt: iso(0, 0), lastSeenAt: iso(0, 0), imported: false },
  { id: 'd3', providerId: 'p-aws', providerHostId: 'i-0c7d8e9f', name: 'prod-worker-2', hostname: 'ec2-44-201-3-9.compute-1.amazonaws.com', privateIp: '10.30.2.22', publicIp: '44.201.3.9', osType: 'linux', osName: 'Ubuntu 24.04', state: 'running', metadata: { instanceType: 'c6i.xlarge', az: 'us-east-1c' }, tags: { Role: 'worker', Env: 'prod' }, discoveredAt: iso(0, 0), lastSeenAt: iso(0, 0), imported: false },
  { id: 'd4', providerId: 'p-aws', providerHostId: 'i-0123abcd', name: 'bastion', hostname: 'ec2-3-88-1-2.compute-1.amazonaws.com', privateIp: '10.30.0.5', publicIp: '3.88.1.2', osType: 'linux', osName: 'Amazon Linux 2023', state: 'running', metadata: { instanceType: 't3.micro', az: 'us-east-1a' }, tags: { Role: 'bastion', Env: 'prod' }, discoveredAt: iso(0, 0), lastSeenAt: iso(0, 0), imported: true, connectionId: 's-api1' },
  { id: 'd5', providerId: 'p-aws', providerHostId: 'i-0fed4321', name: 'analytics-1', hostname: 'ec2-100-24-9-3.compute-1.amazonaws.com', privateIp: '10.30.5.40', publicIp: '100.24.9.3', osType: 'linux', osName: 'Ubuntu 22.04', state: 'stopped', metadata: { instanceType: 'r6i.large', az: 'us-east-1b' }, tags: { Role: 'analytics', Env: 'prod' }, discoveredAt: iso(0, 0), lastSeenAt: iso(0, 1), imported: false },
  { id: 'd6', providerId: 'p-aws', providerHostId: 'i-0aa11bb2', name: 'win-build', hostname: 'ec2-18-2-3-4.compute-1.amazonaws.com', privateIp: '10.30.6.7', publicIp: '18.2.3.4', osType: 'windows', osName: 'Windows Server 2022', state: 'running', metadata: { instanceType: 'm5.large', az: 'us-east-1a' }, tags: { Role: 'ci', Env: 'prod' }, discoveredAt: iso(0, 0), lastSeenAt: iso(0, 0), imported: false },
];

const localShells = [
  { id: 'bash', name: 'bash', path: '/bin/bash' },
  { id: 'zsh', name: 'zsh', path: '/usr/bin/zsh' },
  { id: 'fish', name: 'fish', path: '/usr/bin/fish' },
  { id: 'sh', name: 'sh', path: '/bin/sh' },
  { id: 'pwsh', name: 'PowerShell', path: '/usr/bin/pwsh' },
];

const settings = {
  minimizeToTray: true,
  closeToTray: false,
  startMinimized: false,
  terminalTheme: 'sync',
  defaultShell: 'bash',
};

const savedCommands = [
  { id: 'cmd-uptime', name: 'Check uptime & load', command: 'uptime', category: 'Health', targetOS: 'linux', createdAt: iso(40), updatedAt: iso(2) },
  { id: 'cmd-disk', name: 'Disk usage', command: 'df -h /', category: 'Health', targetOS: 'linux', createdAt: iso(40), updatedAt: iso(2) },
  { id: 'cmd-patch', name: 'Apply security updates', command: 'sudo apt-get update && sudo apt-get -y upgrade', category: 'Maintenance', targetOS: 'linux', createdAt: iso(30), updatedAt: iso(2) },
  { id: 'cmd-restart-nginx', name: 'Restart nginx', command: 'sudo systemctl restart nginx', category: 'Services', targetOS: 'linux', createdAt: iso(20), updatedAt: iso(2) },
];

const MIN = 60000;
const ago = (mins: number) => Date.now() - mins * MIN; // relativeTime() expects an epoch
const aiSessions = [
  { id: 'ai-1', agent: 'claude', title: 'Add Tauri paneling + sidebar collapse', project: 'connectty', cwd: '/home/sp00nz/connectty', gitBranch: 'feature/sidebar-collapse-and-paneling', messageCount: 142, toolCount: 318, lastPrompt: 'push it to main branch. can we consolidate the branches and merge what we can?', lastActivity: '2m ago', lastActivityMs: ago(2), status: 'active', filePath: '/home/sp00nz/.claude/projects/connectty/ai-1.jsonl' },
  { id: 'ai-2', agent: 'claude', title: 'Fix Linux build of the Tauri 2 app', project: 'connectty', cwd: '/home/sp00nz/connectty', gitBranch: 'feature/sidebar-collapse-and-paneling', messageCount: 64, toolCount: 121, lastPrompt: 'the libudev link step fails — can you wire up the install-linux-deps script?', lastActivity: '38m ago', lastActivityMs: ago(38), status: 'idle', filePath: '/home/sp00nz/.claude/projects/connectty/ai-2.jsonl' },
  { id: 'ai-3', agent: 'copilot', title: 'Refactor media scanner', project: 'nedflix', cwd: '/home/sp00nz/nedflix', gitBranch: 'main', messageCount: 28, toolCount: 47, lastPrompt: 'extract the fixture-driven screenshot harness into its own module', lastActivity: '1h ago', lastActivityMs: ago(64), status: 'idle', filePath: '/home/sp00nz/.copilot/session-state/ai-3.json' },
  { id: 'ai-4', agent: 'claude', title: 'termshot palette tuning', project: 'termshot', cwd: '/home/sp00nz/termshot', gitBranch: 'main', messageCount: 19, toolCount: 33, lastPrompt: 'quantize all frames to one shared palette so the gif stays under 40kb', lastActivity: '3h ago', lastActivityMs: ago(182), status: 'idle', filePath: '/home/sp00nz/.claude/projects/termshot/ai-4.jsonl' },
  { id: 'ai-5', agent: 'claude', title: 'partrevive: GPT-recovery demo', project: 'partrevive', cwd: '/home/sp00nz/partrevive', gitBranch: 'main', messageCount: 51, toolCount: 88, lastPrompt: 'render the restore walkthrough as an animated gif for the readme', lastActivity: 'yesterday', lastActivityMs: ago(1490), status: 'idle', filePath: '/home/sp00nz/.claude/projects/partrevive/ai-5.jsonl' },
];

const aiTranscript = [
  { role: 'user', text: 'push it to main branch. can we consolidate the branches and merge what we can?', timestamp: iso(0, 0) },
  { role: 'assistant', text: 'Here’s the picture: feature/sidebar-collapse-and-paneling is 8 ahead, 0 behind main — a clean fast-forward. No open PRs; all 13 claude/* branches are already merged. Fast-forwarding main and deleting the stale branches now.', timestamp: iso(0, 0) },
  { role: 'user', text: 'is the readme missing features? can you capture new screenshots?', timestamp: iso(0, 0) },
  { role: 'assistant', text: 'Yes — 6 features shipped recently are undocumented (AI session monitoring, command palette, tab groups, named layouts, undo-close, status dots). Updating the README and building a fixture-driven screenshot pipeline.', timestamp: iso(0, 0) },
];

const aiPromptMatches = [
  { sessionId: 'ai-1', title: 'Add Tauri paneling + sidebar collapse', project: 'connectty', cwd: '/home/sp00nz/connectty', filePath: aiSessions[0].filePath, snippet: '…build a fixture-driven screenshot pipeline that mocks window.connectty and captures each screen…', timestamp: iso(0, 0) },
  { sessionId: 'ai-3', title: 'Refactor media scanner', project: 'nedflix', cwd: '/home/sp00nz/nedflix', filePath: aiSessions[2].filePath, snippet: '…extract the fixture-driven screenshot harness into its own module so connectty can reuse it…', timestamp: iso(0, 1) },
  { sessionId: 'ai-4', title: 'termshot palette tuning', project: 'termshot', cwd: '/home/sp00nz/termshot', filePath: aiSessions[3].filePath, snippet: '…the screenshot is fake-but-faithful: colors come from you, so match the real program output…', timestamp: iso(2) },
];

// SFTP listings -------------------------------------------------------------
const fdir = (name: string, perms = 'drwxr-xr-x', owner = 'deploy') => ({ name, path: '/srv/www/' + name, size: 4096, isDirectory: true, isSymlink: false, permissions: perms, owner, group: owner, modifiedAt: iso(3), accessedAt: iso(1) });
const ffile = (name: string, size: number, perms = '-rw-r--r--', owner = 'deploy') => ({ name, path: '/srv/www/' + name, size, isDirectory: false, isSymlink: false, permissions: perms, owner, group: owner, modifiedAt: iso(2), accessedAt: iso(1) });

const remoteFiles = [
  fdir('assets'), fdir('config'), fdir('logs'), fdir('releases'),
  { name: 'current', path: '/srv/www/current', size: 18, isDirectory: false, isSymlink: true, permissions: 'lrwxrwxrwx', owner: 'deploy', group: 'deploy', modifiedAt: iso(2), accessedAt: iso(1) },
  ffile('.env', 412, '-rw-------'), ffile('docker-compose.yml', 2841), ffile('deploy.sh', 1903, '-rwxr-xr-x'),
  ffile('nginx.conf', 6620), ffile('package.json', 1284), ffile('package-lock.json', 248510), ffile('README.md', 8210),
];
const localFiles = [
  { name: '..', path: '/home/sp00nz', size: 4096, isDirectory: true, isSymlink: false, permissions: 'drwxr-xr-x', owner: 'sp00nz', group: 'sp00nz', modifiedAt: iso(1), accessedAt: iso(0) },
  { name: 'dist', path: '/home/sp00nz/build/dist', size: 4096, isDirectory: true, isSymlink: false, permissions: 'drwxr-xr-x', owner: 'sp00nz', group: 'sp00nz', modifiedAt: iso(0, 2), accessedAt: iso(0) },
  { name: 'app.tar.gz', path: '/home/sp00nz/build/app.tar.gz', size: 18472013, isDirectory: false, isSymlink: false, permissions: '-rw-r--r--', owner: 'sp00nz', group: 'sp00nz', modifiedAt: iso(0, 1), accessedAt: iso(0) },
  { name: 'release-notes.md', path: '/home/sp00nz/build/release-notes.md', size: 3120, isDirectory: false, isSymlink: false, permissions: '-rw-r--r--', owner: 'sp00nz', group: 'sp00nz', modifiedAt: iso(0, 1), accessedAt: iso(0) },
];

// ---------------------------------------------------------------------------
// Terminal output synthesis
// ---------------------------------------------------------------------------

const E = '\x1b['; // CSI
const reset = `${E}0m`;
const c = (code: string, s: string) => `${E}${code}m${s}${reset}`;
const green = (s: string) => c('38;5;78', s);
const cyan = (s: string) => c('38;5;80', s);
const yellow = (s: string) => c('38;5;221', s);
const blue = (s: string) => c('38;5;75', s);
const gray = (s: string) => c('38;5;245', s);
const red = (s: string) => c('38;5;203', s);
const bold = (s: string) => c('1', s);

function prompt(user: string, host: string, path: string) {
  return `${green(user + '@' + host)}:${blue(path)}$ `;
}

// Lines streamed into an SSH session after "connect".
function sshScript(host: string): string[] {
  const p = (path: string) => prompt('deploy', host, path);
  return [
    '',
    gray('Last login: Wed Jun 17 13:58:02 2026 from 10.0.0.42'),
    bold(` Welcome to ${host} `) + gray('(Ubuntu 24.04.1 LTS  6.8.0-40-generic x86_64)'),
    '',
    `  ${gray('System load:')}  0.18        ${gray('Processes:')}        214`,
    `  ${gray('Usage of /:')}   46.2% of 78G  ${gray('Users logged in:')}  1`,
    `  ${gray('Memory usage:')} 31%          ${gray('IPv4 for eth0:')}    ${host.startsWith('web') ? '10.20.1.5' : '10.20.2.7'}`,
    '',
    p('~') + 'systemctl status nginx --no-pager',
    `${green('●')} nginx.service - A high performance web server and a reverse proxy server`,
    `     ${gray('Loaded:')} loaded (/lib/systemd/system/nginx.service; enabled; preset: enabled)`,
    `     ${gray('Active:')} ${green('active (running)')} since Mon 2026-06-15 09:12:41 UTC; 2 days ago`,
    `   ${gray('Main PID:')} 1043 (nginx)`,
    `      ${gray('Tasks:')} 9 (limit: 9417)`,
    `     ${gray('Memory:')} 24.8M`,
    '',
    p('~') + 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
    `${bold('NAMES')}            ${bold('STATUS')}              ${bold('PORTS')}`,
    `web              Up 2 days           0.0.0.0:443->443/tcp`,
    `api              Up 2 days           0.0.0.0:3000->3000/tcp`,
    `redis            Up 2 days (healthy) 6379/tcp`,
    '',
    p('~') + 'tail -n 3 /var/log/nginx/access.log',
    gray('203.0.113.7 - - [17/Jun/2026:13:59:41] "GET /api/health HTTP/2.0" 200 18'),
    gray('198.51.100.3 - - [17/Jun/2026:13:59:43] "GET / HTTP/2.0" 200 5821'),
    gray('203.0.113.7 - - [17/Jun/2026:13:59:44] "POST /api/login HTTP/2.0" 200 412'),
    '',
    p('~') + `${E}5m█${reset}`,
  ];
}

function localShellScript(): string[] {
  const p = (path: string) => prompt('sp00nz', 'workstation', path);
  return [
    p('~/connectty') + 'git status -sb',
    cyan('## feature/sidebar-collapse-and-paneling...origin/feature/sidebar-collapse-and-paneling'),
    p('~/connectty') + 'npm run build -w @connectty/shared',
    gray('> @connectty/shared@2.0.0 build'),
    gray('> tsc -p tsconfig.json'),
    green('✓') + ' built in 1.4s',
    p('~/connectty') + `${E}5m█${reset}`,
  ];
}

function topPaneScript(host: string): string[] {
  const p = (path: string) => prompt('deploy', host, path);
  return [
    p('~') + 'htop -C',
    `  ${gray('1')}  [${green('|||||')}${gray('              ')}] 18%   ${gray('5')}  [${green('|||')}${gray('                ')}] 11%`,
    `  ${gray('2')}  [${green('||||||||')}${gray('           ')}] 31%   ${gray('6')}  [${green('||')}${gray('                 ')}] 7%`,
    `  ${gray('Mem')}[${green('||||||')}${yellow('||')}${gray('         ')}] 2.4G/8.0G`,
    `  ${gray('Swp')}[${gray('                   ')}] 0K/2.0G`,
    '',
    `  ${bold('PID USER     CPU% MEM%   TIME+  COMMAND')}`,
    `  1043 deploy    8.1  1.2  2h12:04  nginx: worker`,
    `  2210 deploy    4.5  3.8  1h47:22  node /srv/api`,
    `  3398 deploy    1.2  0.6  0h31:10  redis-server`,
  ];
}

// ---------------------------------------------------------------------------
// Event plumbing
// ---------------------------------------------------------------------------

let sshCb: ((id: string, ev: any) => void) | null = null;
let serialCb: ((id: string, ev: any) => void) | null = null;
let shellCb: ((id: string, ev: any) => void) | null = null;
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

function stream(cb: (id: string, ev: any) => void, id: string, lines: string[]) {
  // Emit "connected" then the canned output. A short stagger reads like a live
  // session without being slow enough to matter for a still capture.
  cb(id, { type: 'connected' });
  let i = 0;
  const tick = () => {
    if (i >= lines.length || !cb) return;
    cb(id, { type: 'data', data: lines[i] + '\r\n' });
    i += 1;
    setTimeout(tick, 12);
  };
  // Start well after handleConnect() has registered the session and the pane
  // has mounted + opened its xterm, so no output is dropped.
  setTimeout(tick, 650);
}

const noopUnsub = () => {};
const asyncNoop = async () => {};

// ---------------------------------------------------------------------------
// The mock API
// ---------------------------------------------------------------------------

export const mockApi: any = {
  connections: {
    list: async () => connections,
    get: async (id: string) => connections.find((x) => x.id === id) || null,
    create: async (conn: any) => ({ id: nextId('s'), tags: [], createdAt: iso(), updatedAt: iso(), ...conn }),
    update: asyncNoop,
    delete: asyncNoop,
  },
  credentials: {
    list: async () => credentials,
    get: async (id: string) => credentials.find((x) => x.id === id) || null,
    create: async (cr: any) => ({ id: nextId('c'), usedBy: [], createdAt: iso(), updatedAt: iso(), ...cr }),
    update: asyncNoop,
    delete: asyncNoop,
  },
  groups: {
    list: async () => groups,
    create: async (g: any) => ({ id: nextId('g'), createdAt: iso(), updatedAt: iso(), ...g }),
    update: asyncNoop,
    delete: asyncNoop,
    getConnectionsForGroup: async (gid: string) => connections.filter((x) => x.group === gid),
  },
  ssh: {
    connect: async (connectionId: string) => {
      const id = nextId('ssh');
      const conn = connections.find((x) => x.id === connectionId);
      if (sshCb) stream(sshCb, id, sshScript(conn?.name || 'web-01'));
      return id;
    },
    disconnect: asyncNoop,
    write: asyncNoop,
    resize: asyncNoop,
    onEvent: (cb: any) => { sshCb = cb; return noopUnsub; },
  },
  localShell: {
    getAvailable: async () => localShells,
    spawn: async (shellId: string) => {
      const id = nextId('sh');
      if (shellCb) stream(shellCb, id, shellId === 'top' ? topPaneScript('web-02') : localShellScript());
      return id;
    },
    write: asyncNoop,
    resize: asyncNoop,
    kill: asyncNoop,
    onEvent: (cb: any) => { shellCb = cb; return noopUnsub; },
  },
  settings: { get: async () => settings, save: asyncNoop, set: async (p: any) => ({ ...settings, ...p }) },
  app: { platform: async () => 'linux', version: async () => '2.0.0' },
  providers: {
    list: async () => providers,
    get: async (id: string) => providers.find((x) => x.id === id) || null,
    create: async (p: any) => ({ id: nextId('p'), createdAt: iso(), updatedAt: iso(), ...p }),
    update: asyncNoop,
    delete: asyncNoop,
    test: async () => true,
    testConfig: async () => true,
    discover: async (id: string) => ({ providerId: id, providerName: providers.find((p) => p.id === id)?.name || 'AWS', success: true, hosts: discoveredHosts, discoveredAt: iso() }),
    sync: async (id: string) => ({ providerId: id, success: true, newHosts: discoveredHosts.slice(0, 3), removedHosts: [], existingHosts: discoveredHosts.slice(3), changedHosts: [], summary: '3 new, 3 unchanged', discoveredAt: iso() }),
    getDiscoveredHosts: async () => discoveredHosts,
  },
  profiles: {
    list: async () => [{ id: 'default', name: 'Default', isDefault: true }],
    getActive: async () => ({ id: 'default', name: 'Default', isDefault: true }),
    create: async (name: string) => ({ id: nextId('prof'), name, isDefault: false }),
    switchTo: asyncNoop,
    switch: asyncNoop,
    delete: asyncNoop,
    getConnections: async () => [],
    updateConnections: asyncNoop,
    getDefaultSessionState: async () => null,
    setDefaultSessionState: asyncNoop,
    onSwitched: () => noopUnsub,
  },
  sftp: {
    connect: async () => nextId('sftp'),
    disconnect: asyncNoop,
    listRemote: async () => remoteFiles,
    listLocal: async () => localFiles,
    upload: async () => true,
    download: async () => true,
    mkdir: asyncNoop, rmdir: asyncNoop, unlink: asyncNoop, rename: asyncNoop, chmod: asyncNoop,
    stat: async () => remoteFiles[0],
    homePath: async () => '/srv/www',
    sessions: async () => [],
    getTempDir: async () => '/tmp',
    selectLocalFolder: async () => '/home/sp00nz/build',
    selectLocalFile: async () => ['/home/sp00nz/build/app.tar.gz'],
    selectSaveLocation: async () => '/home/sp00nz/build/download.bin',
    onProgress: () => noopUnsub,
  },
  rdp: {
    connect: async () => ({ sessionId: nextId('rdp'), embedded: true }),
    disconnect: asyncNoop, sendKey: asyncNoop, sendMouse: asyncNoop, sendWheel: asyncNoop,
    isAvailable: async () => true,
    onEvent: () => noopUnsub,
    launchExternal: asyncNoop,
  },
  serial: {
    connect: async () => {
      const id = nextId('ser');
      if (serialCb) stream(serialCb, id, ['', gray('Connected to /dev/ttyUSB0 @ 115200 8N1'), '', 'core-switch> show version', gray('Cisco IOS Software, Version 17.9.4a'), 'core-switch> ' + `${E}5m█${reset}`]);
      return id;
    },
    disconnect: asyncNoop, write: asyncNoop,
    listPorts: async () => [{ path: '/dev/ttyUSB0', manufacturer: 'FTDI' }, { path: '/dev/ttyUSB1', manufacturer: 'Prolific' }],
    onEvent: (cb: any) => { serialCb = cb; return noopUnsub; },
  },
  commands: {
    list: async () => savedCommands,
    get: async (id: string) => savedCommands.find((x) => x.id === id) || null,
    create: async (cmd: any) => ({ id: nextId('cmd'), createdAt: iso(), updatedAt: iso(), ...cmd }),
    update: asyncNoop, delete: asyncNoop,
    execute: async () => ({ executionId: nextId('exec'), targetCount: 6 }),
    cancel: async () => true,
    history: async () => [],
    getExecution: async () => null,
    getResults: async () => null,
    clearHistory: async () => true,
    onProgress: () => noopUnsub,
    onComplete: () => noopUnsub,
  },
  sync: {
    push: asyncNoop, pull: asyncNoop, connect: asyncNoop, disconnect: asyncNoop,
    upload: asyncNoop, download: async () => [], importConfig: asyncNoop,
    getAccounts: async () => [],
    exportData: async () => ({}), importData: asyncNoop, exportToFile: asyncNoop, importFromFile: asyncNoop, cloudSync: asyncNoop, cloudRestore: asyncNoop,
  },
  import: { file: async () => ({ imported: 0 }) },
  export: { file: asyncNoop },
  discovered: {
    list: async () => discoveredHosts,
    import: async () => [],
    importAll: async () => [],
    importSelected: async () => [],
  },
  connectionsBulk: { getByProvider: async () => [], deleteByProvider: async () => 0 },
  sessionStates: {
    list: async () => [], get: async () => null,
    create: async (s: any) => ({ id: nextId('ss'), ...s }), update: asyncNoop, delete: asyncNoop,
  },
  window: { setTitleBarOverlay: async () => true, minimize: asyncNoop },
  aiSessions: {
    list: async () => aiSessions,
    transcript: async () => aiTranscript,
    searchPrompts: async () => aiPromptMatches,
    watchStart: asyncNoop,
    onUpdate: () => noopUnsub,
  },
};

(window as any).connectty = mockApi;
