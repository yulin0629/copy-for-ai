// src/contextExplorer/contextExplorerWebviewHandler.ts
import * as vscode from 'vscode';
import { ContextExplorerService } from './contextExplorerService';
import { ExplorerState, TreeNode, Snippet } from './types';

/**
 * 處理 Context Explorer WebView 的互動
 */
export class ContextExplorerWebviewHandler {
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _service?: ContextExplorerService;

    constructor(context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        this._context = context;
    }

    /**
     * 設置 Service 引用 (避免循環依賴)
     */
    public setService(service: ContextExplorerService): void {
        this._service = service;
    }

    /**
     * 設置 WebView 實例
     */
    public setView(view: vscode.WebviewView): void {
        this._view = view;
        this._configureWebview();
    }

    /**
     * 清除 WebView 實例
     */
    public clearView(): void {
        this._view = undefined;
    }

    /**
     * 配置 WebView
     */
    private _configureWebview(): void {
        if (!this._view) return;

        const webview = this._view.webview; // Use a local variable for clarity

        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                // 允許載入 media 目錄下的資源 (main.js, styles.css)
                vscode.Uri.joinPath(this._extensionUri, 'dist', 'media', 'contextExplorer'),
                // *** 移除 Codicons 的 dist 目錄 ***
                // vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
            ]
        };

        webview.html = this._getWebviewContent(webview); // Pass webview instance

        webview.onDidReceiveMessage(
            (message) => this._handleMessage(message),
            undefined,
            this._context.subscriptions
        );
    }

    /**
     * 處理來自 WebView 的消息
     */
    private async _handleMessage(message: any): Promise<void> {
        if (!this._service) {
            // ... (錯誤處理)
            return;
        }
        this._service.log(`[WebviewHandler] Received message: ${JSON.stringify(message)}`);

        try {
            switch (message.command) {
                case 'getFiles':
                    this._service.log('[WebviewHandler] Handling getFiles command...');
                    const initialData = await this._service.getInitialData();
                     await this.initialize(
                         initialData.files,
                         initialData.savedState,
                         initialData.tokenLimit,
                         initialData.sessionId
                     );
                    this._service.log('[WebviewHandler] Finished handling getFiles command.');
                    break;

                // **** 添加 saveState 的處理 ****
                case 'saveState':
                    this._service.log('[WebviewHandler] Handling saveState command...');
                    if (message.state) {
                        // 確保只傳遞 selectionState 和 expandedFolders
                        const stateToSave: Pick<ExplorerState, 'selectionState' | 'expandedFolders'> = {
                            selectionState: message.state.selectionState || {},
                            expandedFolders: message.state.expandedFolders || {}
                        };
                        await this._service.saveWebViewState(stateToSave);
                    } else {
                        this._service.logError('[WebviewHandler] saveState command received without state data');
                    }
                    this._service.log('[WebviewHandler] Finished handling saveState command.');
                    break;

                case 'copyToClipboard':
                    this._service.log('[WebviewHandler] Handling copyToClipboard command...');
                    this._service.log(`[WebviewHandler] Files to copy: ${JSON.stringify(message.selectedFiles)}`);
                    this._service.log(`[WebviewHandler] Snippets to copy: ${JSON.stringify(message.selectedSnippets)}`);
                    await this._service.copySelectedItemsToClipboard(message.selectedFiles || [], message.selectedSnippets || []);
                    this._service.log('[WebviewHandler] Finished handling copyToClipboard command.');
                    break;
                case 'viewSnippet':
                    this._service.log('[WebviewHandler] Handling viewSnippet command...');
                    await this._service.viewSnippet(message.snippetId);
                    this._service.log('[WebviewHandler] Finished handling viewSnippet command.');
                    break;
                case 'removeSnippet':
                    this._service.log('[WebviewHandler] Handling removeSnippet command...');
                    await this._service.removeSnippet(message.snippetId);
                    this._service.log('[WebviewHandler] Finished handling removeSnippet command.');
                    break;
                case 'viewFile':
                    this._service.log('[WebviewHandler] Handling viewFile command...');
                    if (message.filePath) {
                        await this._service.viewFile(message.filePath);
                    } else {
                        this._service.logError('[WebviewHandler] viewFile command received without filePath');
                    }
                    this._service.log('[WebviewHandler] Finished handling viewFile command.');
                    break;
                default:
                    this._service.log(`[WebviewHandler] Received unknown command: ${message.command}`);
                    break;
            }
        } catch (error) {
            this._service.logError('[WebviewHandler] Error processing message', error);
            // 考慮向 WebView 發送錯誤
            // this.sendCopyStatus('failed', { error: `處理命令 ${message.command} 時發生內部錯誤` });
        }
    }

    /**
     * 初始化 WebView 內容
     */
    public async initialize(files: TreeNode[], savedState: ExplorerState, tokenLimit: number, sessionId: string): Promise<void> {
        if (!this._view) return;
        this._view.webview.postMessage({
            command: 'initialize',
            files,
            savedState, // savedState 現在包含 snippets
            tokenLimit,
            sessionId
        });
    }

    /**
     * 更新 WebView 中的檔案列表
     */
    public updateFiles(files: TreeNode[], reason?: string): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            command: 'updateFiles',
            files,
            reason
        });
    }

    /**
     * 更新 WebView 中的 Token 上限
     */
    public updateTokenLimit(tokenLimit: number): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            command: 'updateTokenLimit',
            tokenLimit
        });
    }

    /**
     * 更新 WebView 中的狀態 (例如從右鍵選單添加檔案/片段後)
     * 這個方法現在會傳遞完整的 ExplorerState
     */
    public updateState(state: ExplorerState): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            command: 'updateState',
            state // 傳遞完整的狀態物件
        });
    }

    /**
     * 向 WebView 發送複製狀態
     */
    public sendCopyStatus(status: 'started' | 'completed' | 'failed', data?: any): void {
        if (!this._view) return;
        // data 可能包含 fileCount, snippetCount, totalTokens 或 error
        this._view.webview.postMessage({
            command: 'copyStatus',
            status,
            ...data
        });
    }

    /**
     * 獲取 WebView 的 HTML 內容
     */
    private _getWebviewContent(webview: vscode.Webview): string {
        // 生成資源的正確 URI
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'media', 'contextExplorer', 'main.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'media', 'contextExplorer', 'styles.css'));
        // *** 移除 codiconsUri ***
        // const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));

        const nonce = this._getNonce();

        // CSP 保持不變 (font-src 仍然需要，因為 VS Code 可能會注入自己的字體)
        return /* html */`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="
                    default-src 'none';
                    style-src ${webview.cspSource};
                    font-src ${webview.cspSource};
                    script-src 'nonce-${nonce}';
                    connect-src 'none';
                    img-src 'none';
                    media-src 'none';
                    object-src 'none';
                    frame-src 'none';
                ">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesUri}" rel="stylesheet">
                <!-- *** 移除 codiconsUri 連結 *** -->
                <title>Copy for AI - Explorer</title>
            </head>
            <body>
                <div class="container">
                    <!-- 標題列 -->
                    <header class="header">
                        <h1>Copy for AI - Explorer</h1>
                    </header>

                    <!-- 篩選框 -->
                    <div class="filter-box">
                        <div class="search-container">
                            <span class="search-icon"></span> <!-- Icon added via CSS ::before -->
                            <input type="text" id="filter-input" placeholder="搜尋檔案或片段...">
                            <button id="clear-filter" class="clear-button" title="清除搜尋">
                                <!-- Icon set via JS innerHTML -->
                            </button>
                        </div>
                        <div class="options-container">
                            <div class="show-selected-container">
                                <input type="checkbox" id="show-selected-only">
                                <label for="show-selected-only">僅顯示已選取</label>
                            </div>
                            <!-- 可以考慮加一個按鈕來切換是否顯示片段 -->
                        </div>
                    </div>

                    <!-- 內容區塊 (包含檔案樹和片段列表) -->
                    <div class="content-area">
                        <!-- 檔案樹區塊 (可摺疊) -->
                        <details class="collapsible-section" id="files-section" open>
                            <summary class="section-header">
                                <span class="expand-icon"></span> <!-- Icon added via CSS ::before -->
                                <span>檔案列表</span>
                            </summary>
                            <div class="file-list-container" id="file-list-container">
                                <div id="file-list" class="file-list">
                                    <!-- File tree content -->
                                </div>
                            </div>
                        </details>

                        <!-- 片段列表區塊 (可摺疊) -->
                        <details class="collapsible-section" id="snippets-section" open>
                             <summary class="section-header">
                                <span class="expand-icon"></span> <!-- Icon added via CSS ::before -->
                                <span>程式碼片段</span>
                            </summary>
                            <div class="snippet-list-container" id="snippet-list-container">
                                <div id="snippet-list" class="snippet-list">
                                    <!-- Snippet list content -->
                                </div>
                            </div>
                        </details>
                    </div>

                    <!-- 底部摘要列 -->
                    <div class="footer">
                        <div class="summary">
                            <div class="summary-text">
                                <span id="selected-count">已勾選 0 個項目</span>
                                <span id="tokens-count">預估 0 tokens</span>
                            </div>
                            <div id="progress-container" class="progress-container" style="display: none;">
                                <div id="progress-bar" class="progress-bar"></div>
                                <span id="progress-percentage" class="progress-percentage">0%</span>
                            </div>
                        </div>
                        <button id="copy-button" class="copy-button" disabled>
                            <!-- Icon and text set via JS innerHTML -->
                            📋 複製到剪貼簿
                        </button>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    /**
     * 生成用於安全策略的隨機值
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}