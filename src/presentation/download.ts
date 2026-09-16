/**
 * Blob をファイルとしてダウンロードさせる。
 *
 * 拡張に downloads 権限を足したくないので、`<a download>` のクリックで落とす。
 * 保存先はブラウザの設定に従う（既定ではダウンロードフォルダ）。
 *
 * @param filename 保存するファイル名
 * @param blob 中身
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // 使い終わった URL を解放しないと、パネルを開いている間ずっとメモリに残る。
  URL.revokeObjectURL(url);
}
