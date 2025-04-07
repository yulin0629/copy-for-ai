// src/contextExplorer/contextExplorerWebviewHandler.ts
import * as vscode from 'vscode';
import { ContextExplorerService } from './contextExplorerService';
import { ExplorerState, TreeNode } from './types';

/**
 * 處理 Context Explorer WebView 的互動
 */
export class ContextExplorerWebviewHandler {
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _service?: ContextExplorerService; // 引用 Service 來處理後端邏輯

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

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._view.webview.html = this._getWebviewContent(this._view.webview);

        this._view.webview.onDidReceiveMessage(
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
            console.error('ContextExplorerService 未設置');
            return;
        }

        try {
            switch (message.command) {
                case 'getFiles':
                    await this._service.refreshFiles('從 WebView 請求');
                    break;
                case 'saveState':
                    await this._service.saveWebViewState(message.state);
                    break;
                case 'copyToClipboard':
                    await this._service.copySelectedFilesToClipboard(message.selectedFiles);
                    break;
                default:
                    this._service.log(`收到未知命令: ${message.command}`);
                    break;
            }
        } catch (error) {
            this._service.logError('處理 WebView 消息失敗', error);
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
            savedState,
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
     * 更新 WebView 中的狀態 (例如從右鍵選單添加檔案後)
     */
    public updateState(state: ExplorerState): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            command: 'updateState',
            state
        });
    }

    /**
     * 向 WebView 發送複製狀態
     */
    public sendCopyStatus(status: 'started' | 'completed' | 'failed', data?: any): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            command: 'copyStatus',
            status,
            ...data // 包含 fileCount, totalTokens 或 error
        });
    }

    /**
     * 獲取 WebView 的 HTML 內容
     */
    private _getWebviewContent(webview: vscode.Webview): string {
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'media', 'contextExplorer', 'styles.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'media', 'contextExplorer', 'main.js')
        );
        const nonce = this._getNonce();

        return /* html */`
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesUri}" rel="stylesheet">
                <title>Copy for AI - File Explorer</title>
            </head>
            <body>
                <div class="container">
                    <!-- 標題列 -->
                    <header class="header">
                        <h1>Copy for AI - File Explorer</h1>
                    </header>

                    <!-- 篩選框 -->
                    <div class="filter-box">
                        <div class="search-container">
                            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M10.7427 10.7427C11.5694 9.91597 12.0001 8.75646 12.0001 7.50003C12.0001 5.01472 9.98534 3.00003 7.50003 3.00003C5.01472 3.00003 3.00003 5.01472 3.00003 7.50003C3.00003 9.98534 5.01472 12.0001 7.50003 12.0001C8.75646 12.0001 9.91597 11.5694 10.7427 10.7427L13.6465 13.6465C13.8418 13.8418 14.1583 13.8418 14.3536 13.6465C14.5489 13.4512 14.5489 13.1347 14.3536 12.9394L11.4498 10.0356C11.3998 9.9856 11.3431 9.94295 11.2818 9.90891L10.7427 10.7427ZM11.0001 7.50003C11.0001 9.43303 9.43303 11.0001 7.50003 11.0001C5.56703 11.0001 4.00003 9.43303 4.00003 7.50003C4.00003 5.56703 5.56703 4.00003 7.50003 4.00003C9.43303 4.00003 11.0001 5.56703 11.0001 7.50003Z"/>
                            </svg>
                            <input type="text" id="filter-input" placeholder="搜尋檔案...">
                            <button id="clear-filter" class="clear-button" title="清除搜尋">✕</button>
                        </div>
                        <div class="options-container">
                            <div class="show-selected-container">
                                <input type="checkbox" id="show-selected-only">
                                <label for="show-selected-only">僅顯示已選取</label>
                            </div>
                        </div>
                    </div>

                    <!-- 檔案列表區塊 -->
                    <div class="file-list-container">
                        <div id="file-list" class="file-list">
                            <!-- Content will be rendered here by JavaScript -->
                        </div>
                    </div>

                    <!-- 底部摘要列 -->
                    <div class="footer">
                        <div class="summary">
                            <div class="summary-text">
                                <span id="selected-count">0 files selected</span>
                                <span id="tokens-count">0 tokens estimated</span>
                            </div>
                            <div id="progress-container" class="progress-container" style="display: none;">
                                <div id="progress-bar" class="progress-bar"></div>
                                <span id="progress-percentage" class="progress-percentage">0%</span>
                            </div>
                        </div>
                        <button id="copy-button" class="copy-button" disabled>複製到剪貼簿</button>
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