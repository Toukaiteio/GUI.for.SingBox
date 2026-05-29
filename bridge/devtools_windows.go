//go:build windows

package bridge

import (
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

const (
	vkControl       = 0x11
	vkShift         = 0x10
	vkF12           = 0x7B
	keyeventfKeyUp  = 0x0002
	keyEventDelayMs = 50
)

var (
	modUser32      = windows.NewLazySystemDLL("user32.dll")
	procKeybdEvent = modUser32.NewProc("keybd_event")
)

func (a *App) OpenDevTools() FlagResult {
	runtime.WindowShow(a.Ctx)
	time.Sleep(100 * time.Millisecond)

	pressKey(vkControl)
	pressKey(vkShift)
	pressKey(vkF12)
	time.Sleep(keyEventDelayMs * time.Millisecond)
	releaseKey(vkF12)
	releaseKey(vkShift)
	releaseKey(vkControl)

	return FlagResult{true, "Success"}
}

func pressKey(key uintptr) {
	procKeybdEvent.Call(key, 0, 0, 0)
}

func releaseKey(key uintptr) {
	procKeybdEvent.Call(key, 0, keyeventfKeyUp, 0)
}
