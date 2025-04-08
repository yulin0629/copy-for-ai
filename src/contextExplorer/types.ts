// src/contextExplorer/types.ts
/**
 * Context Explorer 狀態類型定義
 */

/**
 * 表示程式碼片段的資料結構
 */
export interface Snippet {
    id: string; // 唯一 ID
    filePath: string; // 絕對路徑
    relativePath: string; // 相對路徑
    startLine: number;
    endLine: number;
    code: string; // 片段的原始程式碼
    languageId: string;
    estimatedTokens: number;
    // 可選：儲存分析後的結構和引用，以便複製時使用
    structure?: string;
    imports?: string;
    // 勾選狀態，由前端管理，不持久化到 workspaceState
    // selected?: boolean; // 改為在 WebView 的 state 中管理
}


/**
 * 檔案瀏覽器持久化狀態
 * 這些狀態會保存在 workspaceState 中，跨會話保存
 */
export interface ExplorerState {
    selectionState: Record<string, boolean>; // 檔案勾選狀態 { relativePath: boolean }
    expandedFolders: Record<string, boolean>; // 資料夾展開狀態 { relativePath: boolean }
    snippets: Snippet[]; // 儲存的程式碼片段列表
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