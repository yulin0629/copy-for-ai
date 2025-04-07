// src/contextExplorer/types.ts
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

/**
 * 表示檔案樹中的節點（檔案或資料夾）
 */
export interface TreeNode {
    type: 'file' | 'folder' | 'root';
    name: string;
    path: string; // 相對路徑
    uri?: string; // 檔案的 vscode.Uri 字串
    fsPath?: string; // 檔案的絕對檔案系統路徑
    estimatedTokens?: number;
    children?: TreeNode[];
}