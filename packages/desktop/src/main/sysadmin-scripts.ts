/**
 * Sysadmin Helper Scripts
 * Collection of useful scripts for system administrators
 */

import type { SavedCommand } from '@connectty/shared';

export const sysadminScripts: Omit<SavedCommand, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // 1. Rescan Storage Devices (Linux)
  {
    name: 'Rescan Storage Devices',
    description: 'Detect newly added storage devices and partitions without reboot (hot plug)',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Rescanning SCSI hosts..."; for host in /sys/class/scsi_host/host*/scan; do echo "- - -" > "$host" 2>/dev/null; done; echo "Rescanning block devices..."; for device in /sys/class/scsi_device/*/device/rescan; do echo 1 > "$device" 2>/dev/null; done; sleep 2; lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL',
    category: 'Storage',
    tags: ['hardware', 'storage', 'hotplug', 'disk'],
  },

  // 2. Rescan Storage Devices (Windows)
  {
    name: 'Rescan Storage Devices',
    description: 'Detect newly added storage devices and partitions without reboot (hot plug)',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Rescanning storage devices..."; "rescan" | diskpart; Start-Sleep -Seconds 2; Get-Disk | Format-Table -AutoSize Number,FriendlyName,OperationalStatus,TotalSize,PartitionStyle',
    category: 'Storage',
    tags: ['hardware', 'storage', 'hotplug', 'disk'],
  },

  // 3. Detect New CPU Cores (Linux)
  {
    name: 'Detect New CPU Cores',
    description: 'Online newly hot-plugged CPU cores and display CPU information',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Checking for offline CPUs..."; for cpu in /sys/devices/system/cpu/cpu[0-9]*; do if [ -f "$cpu/online" ]; then status=$(cat "$cpu/online"); if [ "$status" -eq 0 ]; then cpuname=$(basename "$cpu"); echo "Bringing $cpuname online..."; echo 1 > "$cpu/online" 2>/dev/null && echo "$cpuname is now online" || echo "Failed to online $cpuname"; fi; fi; done; echo -e "\\nCPU Summary:"; lscpu | grep -E "^CPU\\(s\\)|^On-line|^Off-line|^Thread|^Core|^Socket|Model name"',
    category: 'Hardware',
    tags: ['hardware', 'cpu', 'hotplug', 'cores'],
  },

  // 4. Detect New Memory (Linux)
  {
    name: 'Detect New Memory',
    description: 'Online newly hot-added memory blocks and display memory information',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Checking for offline memory blocks..."; for mem in /sys/devices/system/memory/memory[0-9]*; do if [ -f "$mem/state" ]; then state=$(cat "$mem/state"); if [ "$state" = "offline" ]; then memname=$(basename "$mem"); echo "Bringing $memname online..."; echo online > "$mem/state" 2>/dev/null && echo "$memname is now online" || echo "Failed to online $memname"; fi; fi; done; echo -e "\\nMemory Summary:"; free -h',
    category: 'Hardware',
    tags: ['hardware', 'memory', 'hotplug', 'ram'],
  },

  // 5. Detect New Memory (Windows)
  {
    name: 'Detect New Memory',
    description: 'Display detailed memory information including hot-add capable slots',
    type: 'inline',
    targetOS: 'windows',
    command: 'Get-CimInstance Win32_PhysicalMemory | Format-Table -AutoSize DeviceLocator,Capacity,Speed,Manufacturer,PartNumber; Write-Host "`nTotal System Memory:"; Get-CimInstance Win32_ComputerSystem | Select-Object @{Name="Total RAM (GB)";Expression={[math]::Round($_.TotalPhysicalMemory/1GB,2)}} | Format-Table -AutoSize',
    category: 'Hardware',
    tags: ['hardware', 'memory', 'ram'],
  },

  // 6. Refresh Network Interfaces (Linux)
  {
    name: 'Refresh Network Interfaces',
    description: 'Detect new network interfaces and display current network configuration',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Reloading network drivers..."; modprobe -r -a $(lsmod | grep -E "^(e1000|vmxnet3|ixgbe|i40e)" | awk \'{print $1}\') 2>/dev/null; sleep 1; modprobe -a e1000 vmxnet3 ixgbe i40e 2>/dev/null; sleep 2; echo -e "\\nNetwork Interfaces:"; ip -br addr show; echo -e "\\nRouting Table:"; ip route show',
    category: 'Network',
    tags: ['network', 'interfaces', 'hotplug', 'networking'],
  },

  // 7. Refresh Network Interfaces (Windows)
  {
    name: 'Refresh Network Interfaces',
    description: 'Restart network adapters and display current network configuration',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Restarting network adapters..."; Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Restart-NetAdapter -Confirm:$false; Start-Sleep -Seconds 3; Write-Host "`nNetwork Adapters:"; Get-NetAdapter | Format-Table -AutoSize Name,InterfaceDescription,Status,LinkSpeed; Write-Host "`nIP Configuration:"; Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"} | Format-Table -AutoSize InterfaceAlias,IPAddress,PrefixLength',
    category: 'Network',
    tags: ['network', 'interfaces', 'networking'],
  },

  // 8. Clear DNS Cache (Linux)
  {
    name: 'Clear DNS Cache',
    description: 'Flush DNS resolver cache and restart DNS services',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Clearing DNS cache..."; if systemctl is-active systemd-resolved &>/dev/null; then systemctl restart systemd-resolved && echo "systemd-resolved restarted"; elif systemctl is-active nscd &>/dev/null; then systemctl restart nscd && echo "nscd restarted"; else echo "No DNS cache service found"; fi; if command -v resolvectl &>/dev/null; then resolvectl flush-caches && echo "DNS cache flushed"; fi; echo -e "\\nDNS Configuration:"; cat /etc/resolv.conf',
    category: 'Network',
    tags: ['network', 'dns', 'cache', 'troubleshooting'],
  },

  // 9. Clear DNS Cache (Windows)
  {
    name: 'Clear DNS Cache',
    description: 'Flush DNS resolver cache',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Clearing DNS cache..."; ipconfig /flushdns; Write-Host "`nDNS Cache Contents:"; Get-DnsClientCache | Select-Object -First 10 Entry,RecordName,Data | Format-Table -AutoSize',
    category: 'Network',
    tags: ['network', 'dns', 'cache', 'troubleshooting'],
  },

  // 10. Clean Temporary Files (Linux)
  {
    name: 'Clean Temporary Files',
    description: 'Remove temporary files and free up disk space',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Disk usage before cleanup:"; df -h / /tmp /var 2>/dev/null | grep -v "Filesystem"; echo -e "\\nCleaning temporary files..."; find /tmp -type f -atime +7 -delete 2>/dev/null; find /var/tmp -type f -atime +10 -delete 2>/dev/null; if command -v journalctl &>/dev/null; then journalctl --vacuum-time=7d 2>/dev/null && echo "Journal logs vacuumed"; fi; if command -v apt-get &>/dev/null; then apt-get clean 2>/dev/null && echo "APT cache cleaned"; fi; if command -v yum &>/dev/null; then yum clean all 2>/dev/null && echo "YUM cache cleaned"; fi; echo -e "\\nDisk usage after cleanup:"; df -h / /tmp /var 2>/dev/null | grep -v "Filesystem"',
    category: 'Maintenance',
    tags: ['cleanup', 'disk', 'maintenance', 'storage'],
  },

  // 11. Clean Temporary Files (Windows)
  {
    name: 'Clean Temporary Files',
    description: 'Remove temporary files and free up disk space',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Disk usage before cleanup:"; Get-PSDrive C | Select-Object Used,Free | Format-Table -AutoSize; Write-Host "`nCleaning temporary files..."; Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue; Write-Host "Temporary files cleaned"; Write-Host "`nDisk usage after cleanup:"; Get-PSDrive C | Select-Object Used,Free | Format-Table -AutoSize',
    category: 'Maintenance',
    tags: ['cleanup', 'disk', 'maintenance', 'storage'],
  },

  // 12. Service Status Check (Linux)
  {
    name: 'Service Status Overview',
    description: 'Display status of critical system services',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "System Service Status:"; echo "=================="; services="sshd ssh systemd-networkd NetworkManager docker kubelet postgresql mysql nginx apache2 httpd"; for svc in $services; do if systemctl list-unit-files | grep -q "^$svc.service"; then status=$(systemctl is-active $svc 2>/dev/null || echo "inactive"); printf "%-20s: %s\\n" "$svc" "$status"; fi; done; echo -e "\\nFailed Services:"; systemctl list-units --state=failed --no-pager',
    category: 'Services',
    tags: ['services', 'monitoring', 'systemd', 'status'],
  },

  // 13. Service Status Check (Windows)
  {
    name: 'Service Status Overview',
    description: 'Display status of critical system services',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "System Service Status:`n=================="; $services = @("WinRM","RpcSs","Dnscache","W32Time","EventLog","MSSQLSERVER","MySQL","W3SVC","Docker"); foreach ($svc in $services) { $service = Get-Service -Name $svc -ErrorAction SilentlyContinue; if ($service) { Write-Host ("{0,-20}: {1}" -f $service.DisplayName,$service.Status) } }; Write-Host "`nStopped Automatic Services:"; Get-Service | Where-Object {$_.StartType -eq "Automatic" -and $_.Status -ne "Running"} | Select-Object -First 10 DisplayName,Status | Format-Table -AutoSize',
    category: 'Services',
    tags: ['services', 'monitoring', 'status'],
  },

  // 14. Log Rotation Check (Linux)
  {
    name: 'Log Rotation Check',
    description: 'Check log sizes and force rotation if needed',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Large Log Files (>100MB):"; find /var/log -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | awk \'{print $5, $9}\'; echo -e "\\nLog Directory Usage:"; du -sh /var/log/* 2>/dev/null | sort -hr | head -10; if command -v logrotate &>/dev/null; then echo -e "\\nForcing log rotation..."; logrotate -f /etc/logrotate.conf 2>/dev/null && echo "Log rotation completed" || echo "Log rotation failed (requires root)"; fi',
    category: 'Maintenance',
    tags: ['logs', 'maintenance', 'disk', 'rotation'],
  },

  // 15. Active User Sessions (Linux)
  {
    name: 'Active User Sessions',
    description: 'Display all active user sessions and login history',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Currently Logged In Users:"; w; echo -e "\\nAll Active Sessions:"; who -a; echo -e "\\nRecent Logins:"; last -n 20',
    category: 'Security',
    tags: ['users', 'sessions', 'security', 'monitoring'],
  },

  // 16. Active User Sessions (Windows)
  {
    name: 'Active User Sessions',
    description: 'Display all active user sessions and login events',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Currently Logged In Users:"; query user 2>$null; if ($LASTEXITCODE -ne 0) { Get-CimInstance Win32_ComputerSystem | Select-Object UserName | Format-Table -AutoSize }; Write-Host "`nRecent Login Events (Last 20):"; Get-EventLog -LogName Security -InstanceId 4624 -Newest 20 -ErrorAction SilentlyContinue | Select-Object TimeGenerated,@{Name="User";Expression={$_.ReplacementStrings[5]}},@{Name="Source";Expression={$_.ReplacementStrings[18]}} | Format-Table -AutoSize',
    category: 'Security',
    tags: ['users', 'sessions', 'security', 'monitoring'],
  },

  // 17. Top Processes by CPU (Linux)
  {
    name: 'Top Processes by CPU',
    description: 'Display top CPU-consuming processes',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Top 15 Processes by CPU Usage:"; ps aux --sort=-%cpu | head -16 | awk \'NR==1 {print $0} NR>1 {printf "%-10s %5s %5s %10s %s\\n", $1, $3, $4, $11, $12}\'',
    category: 'Monitoring',
    tags: ['monitoring', 'cpu', 'processes', 'performance'],
  },

  // 18. Top Processes by Memory (Linux)
  {
    name: 'Top Processes by Memory',
    description: 'Display top memory-consuming processes',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Top 15 Processes by Memory Usage:"; ps aux --sort=-%mem | head -16 | awk \'NR==1 {print $0} NR>1 {printf "%-10s %5s %5s %10s %s\\n", $1, $3, $4, $11, $12}\'',
    category: 'Monitoring',
    tags: ['monitoring', 'memory', 'processes', 'performance'],
  },

  // 19. Top Processes (Windows)
  {
    name: 'Top Processes by CPU/Memory',
    description: 'Display top resource-consuming processes',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Top 10 Processes by CPU:"; Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 ProcessName,CPU,WorkingSet,Id | Format-Table -AutoSize; Write-Host "`nTop 10 Processes by Memory:"; Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 ProcessName,@{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB,2)}},CPU,Id | Format-Table -AutoSize',
    category: 'Monitoring',
    tags: ['monitoring', 'cpu', 'memory', 'processes', 'performance'],
  },

  // 20. Firewall Status (Linux)
  {
    name: 'Firewall Status',
    description: 'Display firewall status and active rules',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Firewall Status:"; if command -v ufw &>/dev/null; then echo "=== UFW Status ==="; ufw status verbose; elif command -v firewall-cmd &>/dev/null; then echo "=== FirewallD Status ==="; firewall-cmd --state && firewall-cmd --list-all; elif command -v iptables &>/dev/null; then echo "=== IPTables Status ==="; iptables -L -n -v | head -30; else echo "No firewall found"; fi',
    category: 'Security',
    tags: ['firewall', 'security', 'network', 'rules'],
  },

  // 21. Firewall Status (Windows)
  {
    name: 'Firewall Status',
    description: 'Display Windows Firewall status and profiles',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Windows Firewall Status:"; Get-NetFirewallProfile | Select-Object Name,Enabled | Format-Table -AutoSize; Write-Host "`nFirewall Rules (Inbound - Enabled):"; Get-NetFirewallRule -Direction Inbound -Enabled True | Select-Object -First 15 DisplayName,Action,Profile | Format-Table -AutoSize',
    category: 'Security',
    tags: ['firewall', 'security', 'network', 'rules'],
  },

  // 22. System Resource Summary (Linux)
  {
    name: 'System Resource Summary',
    description: 'Comprehensive overview of system resources (CPU, memory, disk, network)',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "=== SYSTEM RESOURCE SUMMARY ==="; echo -e "\\n--- CPU ---"; lscpu | grep -E "Model name|CPU\\(s\\)|Thread|Core|Socket"; echo -e "\\n--- Memory ---"; free -h; echo -e "\\n--- Disk Usage ---"; df -h | grep -v "tmpfs\\|devtmpfs"; echo -e "\\n--- Disk I/O ---"; iostat -x 1 2 2>/dev/null | tail -n +3 || echo "iostat not available"; echo -e "\\n--- Network Interfaces ---"; ip -s link show | grep -A1 "^[0-9]"; echo -e "\\n--- Load Average ---"; uptime; echo -e "\\n--- Top 5 Processes ---"; ps aux --sort=-%cpu | head -6',
    category: 'Monitoring',
    tags: ['monitoring', 'resources', 'system', 'overview'],
  },

  // 23. System Resource Summary (Windows)
  {
    name: 'System Resource Summary',
    description: 'Comprehensive overview of system resources (CPU, memory, disk, network)',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "=== SYSTEM RESOURCE SUMMARY ===`n"; Write-Host "--- CPU ---"; Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed | Format-List; Write-Host "`n--- Memory ---"; Get-CimInstance Win32_OperatingSystem | Select-Object @{Name="Total RAM (GB)";Expression={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}},@{Name="Free RAM (GB)";Expression={[math]::Round($_.FreePhysicalMemory/1MB,2)}} | Format-List; Write-Host "`n--- Disk Usage ---"; Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null} | Select-Object Name,@{Name="Used(GB)";Expression={[math]::Round($_.Used/1GB,2)}},@{Name="Free(GB)";Expression={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize; Write-Host "`n--- Network Adapters ---"; Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object Name,LinkSpeed,Status | Format-Table -AutoSize; Write-Host "`n--- Top 5 Processes ---"; Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 ProcessName,CPU,@{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB,2)}} | Format-Table -AutoSize',
    category: 'Monitoring',
    tags: ['monitoring', 'resources', 'system', 'overview'],
  },

  // 24. Check Pending Reboots (Linux)
  {
    name: 'Check Pending Reboots',
    description: 'Check if system requires reboot (kernel updates, systemd)',
    type: 'inline',
    targetOS: 'linux',
    command: 'echo "Checking for pending reboots..."; if [ -f /var/run/reboot-required ]; then echo "⚠ REBOOT REQUIRED"; cat /var/run/reboot-required.pkgs 2>/dev/null; else echo "✓ No reboot required"; fi; echo -e "\\nCurrent Kernel: $(uname -r)"; if [ -f /boot/vmlinuz ]; then installed=$(ls -t /boot/vmlinuz-* 2>/dev/null | head -1 | sed "s/.*vmlinuz-//"); echo "Latest Installed Kernel: $installed"; fi; echo -e "\\nSystemd Needs Restart:"; systemctl --state=failed --no-pager; systemctl list-units --state=failed --no-pager | grep -q "0 loaded" || echo "Some services need restart"',
    category: 'Maintenance',
    tags: ['reboot', 'updates', 'kernel', 'maintenance'],
  },

  // 25. Check Pending Reboots (Windows)
  {
    name: 'Check Pending Reboots',
    description: 'Check if system requires reboot (Windows Updates, pending file renames)',
    type: 'inline',
    targetOS: 'windows',
    command: 'Write-Host "Checking for pending reboots...`n"; $rebootPending = $false; if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired") { Write-Host "⚠ Windows Update requires reboot"; $rebootPending = $true }; if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending") { Write-Host "⚠ Component servicing requires reboot"; $rebootPending = $true }; if (Test-Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\PendingFileRenameOperations") { Write-Host "⚠ Pending file rename operations"; $rebootPending = $true }; if (-not $rebootPending) { Write-Host "✓ No reboot required" }; Write-Host "`nLast Boot Time:"; Get-CimInstance Win32_OperatingSystem | Select-Object LastBootUpTime | Format-List',
    category: 'Maintenance',
    tags: ['reboot', 'updates', 'windows', 'maintenance'],
  },
];
