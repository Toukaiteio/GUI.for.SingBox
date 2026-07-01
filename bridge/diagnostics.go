package bridge

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const diagnosticsDirectory = "data/.cache/diagnostics"
const maxDiagnosticFileBytes int64 = 512 * 1024

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
