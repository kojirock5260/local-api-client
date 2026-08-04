/**
 * サービスワーカー。ツールバーのアイコンを押したらサイドパネルを開く、それだけ。
 *
 * 常駐して何かを監視したり、通信したりはしない。
 * ここに処理を足すと権限を追加したくなるので、原則として増やさない。
 *
 * 失敗しても拡張自体は動くので、握りつぶさずログに出すだけにしてある。
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.error(e));
