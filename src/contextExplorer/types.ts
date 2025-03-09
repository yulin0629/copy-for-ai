/**
 * Context Explorer 狀態類型定義
 */

/**
 * 檔案瀏覽器持久化狀態
 * 這些狀態會保存在 workspaceState 中，跨會話保存
 */
export interface ExplorerState {
    selectionState: Record<string, boolean>;
    expandedFolders: Record<string, boolean>;
}

/**
 * WebView UI 狀態
 * 這些狀態只在 WebView 中保存，不跨會話保存
 */
export interface WebViewState {
    filter: string;
    showSelectedOnly: boolean;
    sessionId: string;
} 