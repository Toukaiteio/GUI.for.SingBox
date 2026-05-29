//go:build !windows

package bridge

func (a *App) OpenDevTools() FlagResult {
	return FlagResult{false, "OpenDevTools is only implemented on Windows. Use the platform DevTools shortcut instead."}
}
