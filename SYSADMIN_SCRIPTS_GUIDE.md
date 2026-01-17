# Sysadmin Helper Scripts

Connectty includes 25+ pre-loaded helper scripts for common system administration tasks. These scripts are automatically populated when you first launch Connectty and are available in the Saved Commands library.

## Table of Contents

1. [Overview](#overview)
2. [Script Categories](#script-categories)
3. [Script Details](#script-details)
4. [Usage Examples](#usage-examples)
5. [Best Practices](#best-practices)

---

## Overview

### What Are Sysadmin Helper Scripts?

These are pre-configured, battle-tested scripts that handle common sysadmin tasks:

- **Hardware hot plug detection** (CPU, memory, storage, network)
- **System maintenance** (cleanup, log rotation, reboot checks)
- **Service monitoring** (status checks, failed services)
- **Security auditing** (user sessions, firewall status)
- **Performance monitoring** (top processes, resource usage)
- **Network troubleshooting** (DNS cache, interface refresh)

### Features

✅ **Cross-platform** - Windows and Linux versions for most scripts
✅ **Instant availability** - Auto-populated on first launch
✅ **Categorized** - Organized by function (Storage, Network, Security, etc.)
✅ **Tagged** - Easy to search and filter
✅ **Production-ready** - Safe, tested commands
✅ **No installation required** - Works with standard OS tools

---

## Script Categories

### 1. Storage (4 scripts)
- Rescan storage devices (hot plug detection)
- Clean temporary files
- Disk usage analysis

### 2. Hardware (4 scripts)
- Detect new CPU cores
- Detect new memory (RAM)
- Online hot-added hardware

### 3. Network (6 scripts)
- Refresh network interfaces
- Clear DNS cache
- Network troubleshooting

### 4. Services (2 scripts)
- Service status overview
- Failed service detection

### 5. Maintenance (4 scripts)
- Log rotation check
- Temporary file cleanup
- Pending reboot detection
- System cleanup

### 6. Security (4 scripts)
- Active user sessions
- Login history
- Firewall status
- Security auditing

### 7. Monitoring (5 scripts)
- Top processes by CPU
- Top processes by memory
- System resource summary
- Performance overview

---

## Script Details

### Storage Scripts

#### 1. Rescan Storage Devices (Linux)
**Purpose:** Detect newly added storage devices without reboot
**Category:** Storage
**Tags:** hardware, storage, hotplug, disk

```bash
echo "Rescanning SCSI hosts..."
for host in /sys/class/scsi_host/host*/scan; do
  echo "- - -" > "$host" 2>/dev/null
done
echo "Rescanning block devices..."
for device in /sys/class/scsi_device/*/device/rescan; do
  echo 1 > "$device" 2>/dev/null
done
sleep 2
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL
```

**When to use:**
- After hot-plugging a new disk
- After adding storage in a VM
- When a new SAN LUN is mapped

#### 2. Rescan Storage Devices (Windows)
**Purpose:** Detect newly added storage devices without reboot
**Category:** Storage
**Tags:** hardware, storage, hotplug, disk

```powershell
Write-Host "Rescanning storage devices..."
"rescan" | diskpart
Start-Sleep -Seconds 2
Get-Disk | Format-Table -AutoSize Number,FriendlyName,OperationalStatus,TotalSize,PartitionStyle
```

**When to use:**
- After adding a new disk to VM
- After hot-plugging storage
- After SAN reconfiguration

---

### Hardware Scripts

#### 3. Detect New CPU Cores (Linux)
**Purpose:** Online newly hot-plugged CPU cores
**Category:** Hardware
**Tags:** hardware, cpu, hotplug, cores

**When to use:**
- After increasing CPU count in VM
- After hot-adding CPU cores
- To verify CPU core detection

#### 4. Detect New Memory (Linux)
**Purpose:** Online newly hot-added memory blocks
**Category:** Hardware
**Tags:** hardware, memory, hotplug, ram

**When to use:**
- After hot-adding memory in VM
- After memory upgrade
- To verify memory detection

#### 5. Detect New Memory (Windows)
**Purpose:** Display detailed memory information
**Category:** Hardware
**Tags:** hardware, memory, ram

**When to use:**
- To verify memory configuration
- After adding RAM
- For capacity planning

---

### Network Scripts

#### 6. Refresh Network Interfaces (Linux)
**Purpose:** Detect new network interfaces
**Category:** Network
**Tags:** network, interfaces, hotplug, networking

```bash
echo "Reloading network drivers..."
modprobe -r -a $(lsmod | grep -E "^(e1000|vmxnet3|ixgbe|i40e)" | awk '{print $1}') 2>/dev/null
sleep 1
modprobe -a e1000 vmxnet3 ixgbe i40e 2>/dev/null
sleep 2
echo -e "\nNetwork Interfaces:"
ip -br addr show
echo -e "\nRouting Table:"
ip route show
```

**When to use:**
- After adding network interface in VM
- After hot-plugging network card
- When interface is not detected

#### 7. Refresh Network Interfaces (Windows)
**Purpose:** Restart network adapters
**Category:** Network
**Tags:** network, interfaces, networking

**When to use:**
- Network connectivity issues
- After adding network adapter
- To refresh DHCP lease

#### 8. Clear DNS Cache (Linux)
**Purpose:** Flush DNS resolver cache
**Category:** Network
**Tags:** network, dns, cache, troubleshooting

**When to use:**
- DNS resolution issues
- After DNS server changes
- Stale DNS entries

#### 9. Clear DNS Cache (Windows)
**Purpose:** Flush DNS resolver cache
**Category:** Network
**Tags:** network, dns, cache, troubleshooting

```powershell
Write-Host "Clearing DNS cache..."
ipconfig /flushdns
Write-Host "`nDNS Cache Contents:"
Get-DnsClientCache | Select-Object -First 10 Entry,RecordName,Data | Format-Table -AutoSize
```

**When to use:**
- DNS resolution problems
- After DNS changes
- Website not loading

---

### Maintenance Scripts

#### 10. Clean Temporary Files (Linux)
**Purpose:** Remove temporary files and free disk space
**Category:** Maintenance
**Tags:** cleanup, disk, maintenance, storage

**What it cleans:**
- `/tmp` files older than 7 days
- `/var/tmp` files older than 10 days
- Journal logs older than 7 days
- APT/YUM package cache

**When to use:**
- Low disk space
- Regular maintenance
- Before system backup

#### 11. Clean Temporary Files (Windows)
**Purpose:** Remove temporary files and free disk space
**Category:** Maintenance
**Tags:** cleanup, disk, maintenance, storage

**What it cleans:**
- `%TEMP%` directory
- `C:\Windows\Temp` directory

**When to use:**
- Low disk space
- System slowdown
- Regular cleanup

#### 12. Log Rotation Check (Linux)
**Purpose:** Check log sizes and force rotation
**Category:** Maintenance
**Tags:** logs, maintenance, disk, rotation

**When to use:**
- Logs consuming too much space
- Regular maintenance
- Before log analysis

#### 13. Check Pending Reboots (Linux)
**Purpose:** Check if system requires reboot
**Category:** Maintenance
**Tags:** reboot, updates, kernel, maintenance

**Checks:**
- `/var/run/reboot-required` file
- Kernel version mismatch
- Failed systemd services

**When to use:**
- After kernel updates
- Before maintenance window
- Compliance checking

#### 14. Check Pending Reboots (Windows)
**Purpose:** Check if system requires reboot
**Category:** Maintenance
**Tags:** reboot, updates, windows, maintenance

**Checks:**
- Windows Update reboot required
- Component servicing pending
- Pending file rename operations

**When to use:**
- After Windows Updates
- Before maintenance
- Patch compliance

---

### Services Scripts

#### 15. Service Status Overview (Linux)
**Purpose:** Display status of critical services
**Category:** Services
**Tags:** services, monitoring, systemd, status

**Services checked:**
- sshd/ssh
- systemd-networkd/NetworkManager
- docker
- kubelet
- postgresql/mysql
- nginx/apache2/httpd

**When to use:**
- Health checks
- After service restart
- Troubleshooting

#### 16. Service Status Overview (Windows)
**Purpose:** Display status of critical services
**Category:** Services
**Tags:** services, monitoring, status

**Services checked:**
- WinRM
- DNS Client
- Windows Time
- Event Log
- SQL Server/MySQL
- IIS/Docker

**When to use:**
- Health checks
- Service troubleshooting
- After updates

---

### Security Scripts

#### 17. Active User Sessions (Linux)
**Purpose:** Display all active user sessions
**Category:** Security
**Tags:** users, sessions, security, monitoring

**Shows:**
- Currently logged in users
- All active sessions
- Recent login history (last 20)

**When to use:**
- Security auditing
- Suspicious activity
- Before system maintenance

#### 18. Active User Sessions (Windows)
**Purpose:** Display all active user sessions
**Category:** Security
**Tags:** users, sessions, security, monitoring

**Shows:**
- Currently logged in users
- Recent login events (last 20)
- Login source IPs

**When to use:**
- Security auditing
- Compliance checks
- User tracking

#### 19. Firewall Status (Linux)
**Purpose:** Display firewall status and rules
**Category:** Security
**Tags:** firewall, security, network, rules

**Supports:**
- UFW (Ubuntu)
- FirewallD (RHEL/CentOS)
- IPTables (generic)

**When to use:**
- Security auditing
- Connectivity troubleshooting
- Compliance checks

#### 20. Firewall Status (Windows)
**Purpose:** Display Windows Firewall status
**Category:** Security
**Tags:** firewall, security, network, rules

**Shows:**
- Firewall profile status (Domain, Private, Public)
- Enabled inbound rules

**When to use:**
- Security checks
- Troubleshooting connectivity
- Compliance verification

---

### Monitoring Scripts

#### 21. Top Processes by CPU (Linux)
**Purpose:** Display top CPU-consuming processes
**Category:** Monitoring
**Tags:** monitoring, cpu, processes, performance

**When to use:**
- High CPU usage
- Performance troubleshooting
- Capacity planning

#### 22. Top Processes by Memory (Linux)
**Purpose:** Display top memory-consuming processes
**Category:** Monitoring
**Tags:** monitoring, memory, processes, performance

**When to use:**
- High memory usage
- Out of memory issues
- Memory leak detection

#### 23. Top Processes (Windows)
**Purpose:** Display top resource-consuming processes
**Category:** Monitoring
**Tags:** monitoring, cpu, memory, processes, performance

**Shows:**
- Top 10 by CPU
- Top 10 by memory

**When to use:**
- Performance issues
- High resource usage
- Process identification

#### 24. System Resource Summary (Linux)
**Purpose:** Comprehensive resource overview
**Category:** Monitoring
**Tags:** monitoring, resources, system, overview

**Displays:**
- CPU information
- Memory usage
- Disk usage
- Disk I/O
- Network interfaces
- Load average
- Top processes

**When to use:**
- Quick health check
- Before maintenance
- Performance baseline

#### 25. System Resource Summary (Windows)
**Purpose:** Comprehensive resource overview
**Category:** Monitoring
**Tags:** monitoring, resources, system, overview

**Displays:**
- CPU details
- Memory usage
- Disk space
- Network adapters
- Top processes

**When to use:**
- System health check
- Performance overview
- Capacity planning

---

## Usage Examples

### Example 1: Hot Plug New Disk in VM

**Scenario:** You added a new disk to a VM while it's running

**Steps:**
1. Add disk in hypervisor
2. Run "Rescan Storage Devices" script
3. Verify disk is detected with `lsblk` output
4. Partition and format as needed

**Script to use:**
- Linux: "Rescan Storage Devices" (Storage category)
- Windows: "Rescan Storage Devices" (Storage category)

### Example 2: Troubleshoot DNS Issues

**Scenario:** Websites not loading, DNS resolution failing

**Steps:**
1. Run "Clear DNS Cache" script
2. Verify DNS configuration from output
3. Test resolution again
4. If still failing, check DNS server settings

**Script to use:**
- Linux: "Clear DNS Cache" (Network category)
- Windows: "Clear DNS Cache" (Network category)

### Example 3: Investigate High CPU Usage

**Scenario:** Server running slow, high CPU usage reported

**Steps:**
1. Run "Top Processes by CPU" script
2. Identify top consumers
3. Investigate suspicious processes
4. Kill or restart as needed

**Script to use:**
- Linux: "Top Processes by CPU" (Monitoring category)
- Windows: "Top Processes by CPU/Memory" (Monitoring category)

### Example 4: Pre-Maintenance Health Check

**Scenario:** Before scheduled maintenance, verify system health

**Steps:**
1. Run "System Resource Summary"
2. Run "Service Status Overview"
3. Run "Check Pending Reboots"
4. Run "Active User Sessions" to check for active users
5. Proceed with maintenance if all clear

**Scripts to use:**
1. "System Resource Summary" (Monitoring)
2. "Service Status Overview" (Services)
3. "Check Pending Reboots" (Maintenance)
4. "Active User Sessions" (Security)

### Example 5: Free Up Disk Space

**Scenario:** Low disk space alert

**Steps:**
1. Run "System Resource Summary" to identify full partitions
2. Run "Log Rotation Check" to rotate large logs
3. Run "Clean Temporary Files" to remove temp files
4. Verify space reclaimed

**Scripts to use:**
1. "System Resource Summary" (Monitoring)
2. "Log Rotation Check" (Maintenance)
3. "Clean Temporary Files" (Maintenance)

### Example 6: Security Audit

**Scenario:** Monthly security audit required

**Steps:**
1. Run "Active User Sessions" to check logged-in users
2. Run "Firewall Status" to verify firewall enabled
3. Review login history for suspicious activity
4. Document findings

**Scripts to use:**
1. "Active User Sessions" (Security)
2. "Firewall Status" (Security)

---

## Best Practices

### 1. Regular Execution

**Recommended Schedule:**

| Script | Frequency | When |
|--------|-----------|------|
| System Resource Summary | Daily | Morning health check |
| Service Status Overview | Daily | After deployments |
| Active User Sessions | Daily | Security monitoring |
| Clean Temporary Files | Weekly | Sunday maintenance |
| Log Rotation Check | Weekly | Before backups |
| Check Pending Reboots | Weekly | Patch Tuesday + 2 days |
| Firewall Status | Monthly | Security audit |

### 2. Use with Bulk Commands

These scripts work great with Connectty's bulk command feature:

```typescript
// Run system summary on all production servers
await window.connectty.commands.execute({
  commandName: 'System Resource Summary',
  command: '...script content...',
  targetOS: 'linux',
  filter: {
    groupIds: ['prod-servers-group'],
  },
});
```

### 3. Assign Scripts to Groups

Assign relevant scripts to server groups:

**Example:**
- **Database Servers:** Assign "Top Processes by Memory", "Clean Temporary Files"
- **Web Servers:** Assign "Service Status Overview", "Active User Sessions"
- **Development VMs:** Assign "Rescan Storage Devices", "Detect New Memory"

### 4. Combine with Scheduled Tasks

Use OS schedulers to run scripts automatically:

**Linux (cron):**
```bash
# Run system summary daily at 8 AM
0 8 * * * /path/to/connectty-cli execute "System Resource Summary" --host prod-web-01
```

**Windows (Task Scheduler):**
```powershell
# Schedule weekly cleanup
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-File C:\cleanup.ps1'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am
Register-ScheduledTask -TaskName "Weekly Cleanup" -Action $action -Trigger $trigger
```

### 5. Document Custom Modifications

If you modify these scripts:
1. Create a new version with descriptive name
2. Document changes in description
3. Tag with "custom" tag
4. Keep original for reference

### 6. Test Before Bulk Execution

Always test scripts on a single host before running on groups:

1. Run on dev/test server first
2. Verify output is as expected
3. Check for errors or warnings
4. Then deploy to production group

### 7. Monitor Script Output

Look for these indicators in output:

**Good signs:**
- ✓ Services running
- ✓ No reboot required
- ✓ Normal resource usage

**Warning signs:**
- ⚠ High CPU/memory usage
- ⚠ Reboot required
- ⚠ Services stopped
- ⚠ Firewall disabled

**Critical issues:**
- ❌ Failed services
- ❌ Disk space critical
- ❌ Unknown users logged in
- ❌ Firewall rules misconfigured

### 8. Create Runbooks

Combine scripts into runbooks for common scenarios:

**Example: "New VM Setup Runbook"**
1. Rescan Storage Devices
2. Detect New Memory
3. Detect New CPU Cores
4. Refresh Network Interfaces
5. Service Status Overview
6. System Resource Summary

**Example: "Weekly Maintenance Runbook"**
1. Check Pending Reboots
2. Log Rotation Check
3. Clean Temporary Files
4. Service Status Overview
5. Active User Sessions

### 9. Security Considerations

**Safe to run:**
- All monitoring scripts (read-only)
- Service status checks
- Resource summaries

**Requires caution:**
- Clean Temporary Files (deletes data)
- Log Rotation (modifies logs)
- Refresh Network Interfaces (may disrupt connectivity)

**Requires root/admin:**
- Rescan hardware devices
- Online CPU/memory
- Service management
- Firewall configuration

### 10. Troubleshooting

**If script fails:**

1. **Permission denied**
   - Run with sudo/admin privileges
   - Check file permissions

2. **Command not found**
   - Verify required tools installed
   - Check PATH environment
   - Install missing packages

3. **No output**
   - Check OS compatibility (Linux vs Windows)
   - Verify script matches OS type
   - Check for silent failures

4. **Partial output**
   - Some features may require root
   - Some tools may not be installed
   - Expected behavior for minimal systems

---

## Summary

The sysadmin helper scripts provide:

✅ **25+ pre-loaded scripts** for common tasks
✅ **Cross-platform** support (Linux & Windows)
✅ **Auto-populated** on first launch
✅ **Categorized** and **tagged** for easy discovery
✅ **Production-ready** - safe and tested
✅ **Bulk execution** compatible
✅ **Group assignment** capable

These scripts save time and reduce errors in daily system administration tasks, from hardware hot plug detection to security auditing and performance monitoring.

Access them via:
- Saved Commands library in Connectty
- Bulk command execution
- Script Manager plugin (when enabled)
- Group-assigned scripts

Happy administering! 🚀
