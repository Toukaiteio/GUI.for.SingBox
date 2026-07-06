package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	psnet "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

const diagnosticsDirectory = "data/.cache/diagnostics"
const maxDiagnosticFileBytes int64 = 512 * 1024
const maxConnectionsPerProcess = 80

type DiagnosticCaptureOptions struct {
	Category string            `json:"category"`
	Label    string            `json:"label"`
	Metadata map[string]string `json:"metadata"`
	LogFiles []string          `json:"logFiles"`
}

type diagnosticSnapshot struct {
	Category   string            `json:"category"`
	Label      string            `json:"label"`
	CreatedAt  string            `json:"createdAt"`
	AppVersion string            `json:"appVersion"`
	OS         string            `json:"os"`
	Arch       string            `json:"arch"`
	Metadata   map[string]string `json:"metadata,omitempty"`
	Files      []string          `json:"files"`
}

type diagnosticInterface struct {
	Index        int      `json:"index"`
	MTU          int      `json:"mtu"`
	Name         string   `json:"name"`
	HardwareAddr string   `json:"hardwareAddr,omitempty"`
	Flags        []string `json:"flags"`
	Addresses    []string `json:"addresses"`
}

type diagnosticProcess struct {
	PID         int32                  `json:"pid"`
	Name        string                 `json:"name"`
	Exe         string                 `json:"exe,omitempty"`
	CreateTime  int64                  `json:"createTime,omitempty"`
	Connections []diagnosticConnection `json:"connections,omitempty"`
}

type diagnosticConnection struct {
	Family     uint32 `json:"family"`
	Type       uint32 `json:"type"`
	Status     string `json:"status,omitempty"`
	LocalAddr  string `json:"localAddr,omitempty"`
	LocalPort  uint32 `json:"localPort,omitempty"`
	RemoteAddr string `json:"remoteAddr,omitempty"`
	RemotePort uint32 `json:"remotePort,omitempty"`
}

func (a *App) CaptureDiagnosticSnapshot(options DiagnosticCaptureOptions) FlagResult {
	log.Printf("CaptureDiagnosticSnapshot: %+v", options)

	timestamp := time.Now().Format("20060102-150405.000")
	category := sanitizeDiagnosticSegment(options.Category)
	if category == "" {
		category = "general"
	}

	label := sanitizeDiagnosticSegment(options.Label)
	if label == "" {
		label = "snapshot"
	}

	dirPath := resolvePath(filepath.ToSlash(filepath.Join(diagnosticsDirectory, timestamp+"-"+category+"-"+label)))
	if err := os.MkdirAll(dirPath, os.ModePerm); err != nil {
		return FlagResult{false, err.Error()}
	}

	copiedFiles := make([]string, 0, len(options.LogFiles))
	for _, rawPath := range options.LogFiles {
		if strings.TrimSpace(rawPath) == "" {
			continue
		}

		sourcePath := resolvePath(rawPath)
		if _, err := os.Stat(sourcePath); err != nil {
			if !os.IsNotExist(err) {
				log.Printf("CaptureDiagnosticSnapshot: failed to stat %s: %v", sourcePath, err)
			}
			continue
		}

		baseName := sanitizeDiagnosticSegment(filepath.Base(sourcePath))
		if baseName == "" {
			baseName = fmt.Sprintf("log-%d.txt", len(copiedFiles)+1)
		}
		targetPath := filepath.Join(dirPath, baseName)

		if err := copyFileContents(sourcePath, targetPath); err != nil {
			log.Printf("CaptureDiagnosticSnapshot: failed to copy %s: %v", sourcePath, err)
			continue
		}

		copiedFiles = append(copiedFiles, filepath.ToSlash(targetPath))
	}

	for _, path := range captureRuntimeDiagnostics(dirPath) {
		copiedFiles = append(copiedFiles, filepath.ToSlash(path))
	}

	snapshot := diagnosticSnapshot{
		Category:   category,
		Label:      label,
		CreatedAt:  time.Now().Format(time.RFC3339),
		AppVersion: Env.AppVersion,
		OS:         Env.OS,
		Arch:       Env.ARCH,
		Metadata:   options.Metadata,
		Files:      copiedFiles,
	}

	indexPath := filepath.Join(dirPath, "metadata.json")
	indexBytes, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return FlagResult{false, err.Error()}
	}
	if err := os.WriteFile(indexPath, indexBytes, 0644); err != nil {
		return FlagResult{false, err.Error()}
	}

	return FlagResult{true, filepath.ToSlash(dirPath)}
}

func captureRuntimeDiagnostics(dirPath string) []string {
	files := make([]string, 0, 6)

	if path, err := captureNetworkInterfaces(dirPath); err != nil {
		log.Printf("CaptureDiagnosticSnapshot: failed to capture network interfaces: %v", err)
	} else {
		files = append(files, path)
	}

	if path, err := captureNetworkProcesses(dirPath); err != nil {
		log.Printf("CaptureDiagnosticSnapshot: failed to capture network processes: %v", err)
	} else {
		files = append(files, path)
	}

	if Env.OS == "windows" {
		commands := []struct {
			name string
			cmd  string
			args []string
		}{
			{"route-ipv4.txt", "route", []string{"print", "-4"}},
			{"route-ipv6.txt", "route", []string{"print", "-6"}},
			{"netsh-ipv4-interfaces.txt", "netsh", []string{"interface", "ipv4", "show", "interfaces"}},
			{"netsh-ipv6-interfaces.txt", "netsh", []string{"interface", "ipv6", "show", "interfaces"}},
		}

		for _, command := range commands {
			if path, err := captureCommandOutput(dirPath, command.name, command.cmd, command.args...); err != nil {
				log.Printf("CaptureDiagnosticSnapshot: failed to capture %s: %v", command.name, err)
			} else {
				files = append(files, path)
			}
		}
	}

	return files
}

func captureNetworkInterfaces(dirPath string) (string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	items := make([]diagnosticInterface, 0, len(interfaces))
	for _, iface := range interfaces {
		addrs, _ := iface.Addrs()
		addresses := make([]string, 0, len(addrs))
		for _, addr := range addrs {
			addresses = append(addresses, addr.String())
		}

		items = append(items, diagnosticInterface{
			Index:        iface.Index,
			MTU:          iface.MTU,
			Name:         iface.Name,
			HardwareAddr: iface.HardwareAddr.String(),
			Flags:        strings.Fields(iface.Flags.String()),
			Addresses:    addresses,
		})
	}

	return writeDiagnosticJSON(dirPath, "network-interfaces.json", items)
}

func captureNetworkProcesses(dirPath string) (string, error) {
	processes, err := process.Processes()
	if err != nil {
		return "", err
	}

	items := make([]diagnosticProcess, 0)
	for _, proc := range processes {
		name, err := proc.Name()
		if err != nil || !isDiagnosticNetworkProcess(name) {
			continue
		}

		exe, _ := proc.Exe()
		createTime, _ := proc.CreateTime()
		item := diagnosticProcess{
			PID:        proc.Pid,
			Name:       name,
			Exe:        exe,
			CreateTime: createTime,
		}

		if connections, err := psnet.ConnectionsPid("all", proc.Pid); err == nil {
			item.Connections = convertDiagnosticConnections(connections)
		}

		items = append(items, item)
	}

	return writeDiagnosticJSON(dirPath, "network-processes.json", items)
}

func isDiagnosticNetworkProcess(name string) bool {
	name = strings.ToLower(name)
	keywords := []string{
		"sing-box", "gui.for.singbox", "gui.for.cores",
		"torrent", "webtorrent", "qbittorrent", "transmission", "aria2",
		"easytier", "clash", "mihomo", "v2ray", "xray", "hysteria", "tuic",
		"openvpn", "wireguard", "tailscale", "zerotier", "tun", "tap", "vpn",
	}
	for _, keyword := range keywords {
		if strings.Contains(name, keyword) {
			return true
		}
	}
	return false
}

func convertDiagnosticConnections(connections []psnet.ConnectionStat) []diagnosticConnection {
	limit := len(connections)
	if limit > maxConnectionsPerProcess {
		limit = maxConnectionsPerProcess
	}

	items := make([]diagnosticConnection, 0, limit)
	for _, conn := range connections[:limit] {
		items = append(items, diagnosticConnection{
			Family:     conn.Family,
			Type:       conn.Type,
			Status:     conn.Status,
			LocalAddr:  conn.Laddr.IP,
			LocalPort:  conn.Laddr.Port,
			RemoteAddr: conn.Raddr.IP,
			RemotePort: conn.Raddr.Port,
		})
	}
	return items
}

func captureCommandOutput(dirPath, name, command string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, command, args...)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		err = ctx.Err()
	}

	body := fmt.Sprintf("$ %s %s\n", command, strings.Join(args, " "))
	if err != nil {
		body += fmt.Sprintf("error: %v\n", err)
	}
	body += "\n" + string(out)

	if int64(len(body)) > maxDiagnosticFileBytes {
		body = fmt.Sprintf("[truncated] only the last %d bytes were captured from %s\n\n", maxDiagnosticFileBytes, name) + body[len(body)-int(maxDiagnosticFileBytes):]
	}

	path := filepath.Join(dirPath, name)
	return path, os.WriteFile(path, []byte(body), 0644)
}

func writeDiagnosticJSON(dirPath, name string, value any) (string, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", err
	}

	path := filepath.Join(dirPath, name)
	return path, os.WriteFile(path, data, 0644)
}

func sanitizeDiagnosticSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	replacer := strings.NewReplacer(
		"\\", "-",
		"/", "-",
		":", "-",
		"*", "-",
		"?", "-",
		"\"", "-",
		"<", "-",
		">", "-",
		"|", "-",
		" ", "-",
	)
	value = replacer.Replace(value)
	value = strings.Trim(value, ".-")
	if value == "" {
		return ""
	}
	return value
}

func copyFileContents(src, dst string) error {
	data, truncated, err := readDiagnosticFile(src, maxDiagnosticFileBytes)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(dst), os.ModePerm); err != nil {
		return err
	}

	if truncated {
		prefix := fmt.Sprintf("[truncated] only the last %d bytes were captured from %s\n\n", maxDiagnosticFileBytes, filepath.Base(src))
		data = append([]byte(prefix), data...)
	}

	return os.WriteFile(dst, data, 0644)
}

func readDiagnosticFile(path string, limit int64) ([]byte, bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, false, err
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, false, err
	}

	size := stat.Size()
	if size <= limit {
		data, err := os.ReadFile(path)
		return data, false, err
	}

	offset := size - limit
	buf := make([]byte, limit)
	n, err := file.ReadAt(buf, offset)
	if err != nil && err != io.EOF {
		return nil, false, err
	}

	return buf[:n], true, nil
}
