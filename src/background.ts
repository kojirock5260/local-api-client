/**
 * サービスワーカー。ツールバーのアイコンかショートカットでサイドパネルを開く、それだけ。
 *
 * 常駐して何かを監視したり、通信したりはしない。
 * ここに処理を足すと権限を追加したくなるので、原則として増やさない。
 *
 * 失敗しても拡張自体は動くので、握りつぶさずログに出すだけにしてある。
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.error(e));

// manifest の commands に書いたショートカット。`sidePanel.open` はユーザー操作の
// 直後にしか呼べないが、コマンドはそれに当たる。Chrome 116 以上が必要。
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "open-panel") return;
  const windowId = tab?.windowId;
  const opening =
    windowId !== undefined
      ? chrome.sidePanel.open({ windowId })
      : chrome.windows.getLastFocused().then((w) => chrome.sidePanel.open({ windowId: w.id! }));
  opening.catch((e) => console.error(e));
});
