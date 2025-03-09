import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { formatOutput } from '../formatter';
import { FileTreeService, TreeNode } from './fileTreeService';

/**
 * Context Explorer 視圖提供者
 * 實現單一 WebView 介面，提供檔案選取與複製功能
 */
export class ContextExplorerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copy-for-ai.contextExplorer';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _fileSystemWatcher?: vscode.FileSystemWatcher;
    private _outputChannel: vscode.OutputChannel;
    private _fileTreeService: FileTreeService;
    private _sessionId: string;

    constructor(context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        this._context = context;
        // 創建輸出頻道
        this._outputChannel = vscode.window.createOutputChannel('Copy For AI');
        // 初始化文件樹服務
        this._fileTreeService = new FileTreeService(this._outputChannel);
        this._setupFileWatcher();
        this._log('Context Explorer 已初始化');
        
        // 生成新的會話 ID
        this._sessionId = this._generateSessionId();
        this._log(`已生成新的會話 ID: ${this._sessionId}`);
        
        // 監聽配置變更
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('copyForAI.tokenLimit')) {
                this._updateTokenLimit();
            }
        }, null, this._context.subscriptions);
    }

    /**
     * 生成唯一的會話 ID
     */
    private _generateSessionId(): string {
        return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 15);
    }

    private _updateTokenLimit(): void {
        if (!this._view) {
            this._logError('更新 Token Limit 失敗: WebView 尚未建立');
            return;
        }
        
        const config = vscode.workspace.getConfiguration('copyForAI');
        const tokenLimit = config.get<number>('tokenLimit', 0);
        
        this._view.webview.postMessage({
            command: 'updateTokenLimit',
            tokenLimit: tokenLimit
        });
        
        this._log('已通知 WebView 更新 Token Limit: ' + tokenLimit);
    }

    /**
     * 公開方法：刷新檔案列表
     * 用於外部組件調用，例如從命令中觸發
     */
    public refreshFiles(): Promise<void> {
        this._log('從外部命令觸發檔案列表刷新');
        return this._refreshFiles();
    }

    /**
     * 將檔案添加到選取清單中
     * @param filePaths 要添加的檔案路徑數組
     */
    public async addFilesToSelection(filePaths: string[]): Promise<void> {
        if (!this._view) {
            this._logError('添加檔案失敗: WebView 尚未建立');
            return;
        }

        try {
            // 將路徑轉換為檔案資訊
            const fileInfo = filePaths.map(filePath => {
                // 檢查檔案是否存在
                const exists = fs.existsSync(filePath);
                const isDirectory = exists ? fs.lstatSync(filePath).isDirectory() : false;
                
                return {
                    fsPath: filePath,
                    relativePath: vscode.workspace.asRelativePath(filePath, false),
                    isDirectory
                };
            });

            // 發送檔案路徑到 WebView 進行選取
            this._view.webview.postMessage({
                command: 'addFilesToSelection',
                files: fileInfo
            });

            this._log(`已發送 ${filePaths.length} 個檔案到 WebView 選取`);
        } catch (error) {
            this._logError('添加檔案到選取時出錯', error);
        }
    }

    /**
     * 輸出日誌到輸出頻道
     */
    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * 輸出錯誤到輸出頻道
     */
    private _logError(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] 錯誤: ${message}`);
        if (error) {
            if (error instanceof Error) {
                this._outputChannel.appendLine(`詳細資訊: ${error.message}`);
                if (error.stack) {
                    this._outputChannel.appendLine(`堆疊追蹤: ${error.stack}`);
                }
            } else {
                this._outputChannel.appendLine(`詳細資訊: ${String(error)}`);
            }
        }
        // 自動顯示輸出頻道
        this._outputChannel.show(true);
    }

    /**
     * 設置檔案系統監視器
     */
    private _setupFileWatcher(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this._log('無工作區資料夾，檔案監視器未啟動');
            return;
        }

        // 監視檔案變化
        const filePattern = new vscode.RelativePattern(workspaceFolders[0], '**/*');
        this._fileSystemWatcher = vscode.workspace.createFileSystemWatcher(filePattern);

        // 檔案新增時更新視圖
        this._fileSystemWatcher.onDidCreate(() => {
            this._log('檔案系統變化: 新檔案創建');
            this._refreshFiles();
        });

        // 檔案更改時更新視圖
        this._fileSystemWatcher.onDidChange(() => {
            this._log('檔案系統變化: 檔案內容更新');
            this._refreshFiles();
        });

        // 檔案刪除時更新視圖
        this._fileSystemWatcher.onDidDelete(() => {
            this._log('檔案系統變化: 檔案刪除');
            this._refreshFiles();
        });

        // 將監視器添加到訂閱清單，以便在擴展停用時正確處理
        this._context.subscriptions.push(this._fileSystemWatcher);
        this._log('檔案監視器已啟動');
    }

    /**
     * 創建與初始化 WebView 視圖
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        // 設置 WebView 選項
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // 設置 WebView HTML 內容
        webviewView.webview.html = this._getWebviewContent(webviewView.webview);
        this._log('WebView 視圖已創建');

        // 處理從 WebView 接收的訊息
        webviewView.webview.onDidReceiveMessage(
            (message) => this._handleMessage(message),
            undefined,
            this._context.subscriptions
        );

        // 初始化 WebView
        this._initializeWebView();

        // 視圖可見性變更時保留狀態
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._log('WebView 變為可見，恢復狀態');
                this._initializeWebView();
                
                // 設置拖放處理
                this._setupDragAndDrop(webviewView);
            }
        });
    }

    /**
     * 設置拖放處理
     * 由於 VS Code WebView 的安全限制，拖放功能需要特殊處理
     */
    private _setupDragAndDrop(webviewView: vscode.WebviewView): void {
        // 注意：由於 VS Code WebView 限制，完整拖放功能需要額外 API 支持
        this._log('拖放 API 設置中 - 注意目前 WebView 對拖放的支援有限');
    }

    /**
     * 獲取 WebView 的 HTML 內容
     */
    private _getWebviewContent(webview: vscode.Webview): string {
        // 獲取資源的 URI
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'contextExplorer', 'styles.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'contextExplorer', 'main.js')
        );

        // 安全性設定
        const nonce = this._getNonce();

        // HTML 頁面內容
        return /* html */`
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
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
                        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none" />
                            <line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                        </svg>
                        <input type="text" id="filter-input" placeholder="搜尋檔案...">
                        <button id="clear-filter" class="clear-button">✕</button>
                    </div>
                    <div class="options-container">
                        <div class="show-selected-container">
                            <input type="checkbox" id="show-selected-only">
                            <label for="show-selected-only">僅顯示已選取</label>
                        </div>
                    </div>
                </div>
                
                <!-- 檔案列表區塊 -->
                <div class="file-list-container" id="drop-target">
                    <div id="file-list" class="file-list"></div>
                </div>
                
                <!-- 拖放提示覆蓋層 -->
                <div id="drag-overlay" class="drag-overlay">
                    <div class="drag-message">拖曳至此處添加檔案</div>
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
     * 初始化 WebView
     */
    private async _initializeWebView(): Promise<void> {
        if (!this._view) {
            this._logError('初始化 WebView 失敗: WebView 尚未建立');
            return;
        }
    
        try {
            // 獲取工作區檔案
            const workspaceFiles = await this._fileTreeService.getWorkspaceFiles();
            this._log(`已載入 ${workspaceFiles.length} 個頂層項目`);
            
            // 獲取先前保存的選取狀態 - 只保存選取和展開狀態，不包含篩選狀態
            const savedState = this._context.workspaceState.get('contextExplorer.state', {
                selectionState: {},
                expandedFolders: {}
            });
            
            // 獲取設定值
            const config = vscode.workspace.getConfiguration('copyForAI');
            const tokenLimit = config.get<number>('tokenLimit', 0);
            
            // 將檔案、狀態和會話 ID 發送到 WebView
            this._view.webview.postMessage({
                command: 'initialize',
                files: workspaceFiles,
                savedState: {
                    selectionState: savedState.selectionState || {},
                    expandedFolders: savedState.expandedFolders || {}
                    // 不包含 filter 和 showSelectedOnly 
                },
                tokenLimit: tokenLimit,
                sessionId: this._sessionId // 傳遞會話 ID
            });
            
            this._log('WebView 初始化完成');
        } catch (error) {
            this._logError('WebView 初始化失敗', error);
        }
    }

    /**
     * 處理來自 WebView 的訊息
     */
    private async _handleMessage(message: any): Promise<void> {
        this._log(`收到 WebView 訊息: ${message.command}`);
        
        switch (message.command) {
            case 'getFiles':
                await this._refreshFiles();
                break;
            
            case 'saveState':
                // 保存選取和展開狀態
                this._context.workspaceState.update('contextExplorer.state', message.state);
                this._log('已儲存 WebView 狀態');
                break;
            
            case 'copyToClipboard':
                this._log(`收到複製請求，選取的檔案: ${message.selectedFiles.length} 個`);
                await this._copySelectedFilesToClipboard(message.selectedFiles);
                break;
                
            case 'openSettings':
                // 修改為開啟所有擴展設定，而不只是 excludePatterns
                vscode.commands.executeCommand('workbench.action.openSettings', 'copyForAI');
                break;
            
            case 'handleDroppedFiles':
                // 處理從 WebView 接收的拖放檔案請求
                // 由於技術限制，這裡只是一個佔位，實際拖放需要 VS Code API 增強
                this._log('收到拖放檔案請求，但目前 WebView 對拖放支援有限');
                break;
                
            default:
                this._log(`未知的 WebView 訊息指令: ${message.command}`);
                break;
        }
    }

    /**
     * 刷新檔案列表
     */
    private async _refreshFiles(): Promise<void> {
        if (!this._view) {
            this._logError('刷新檔案列表失敗: WebView 尚未建立');
            return;
        }

        try {
            // 獲取最新檔案列表
            const workspaceFiles = await this._fileTreeService.getWorkspaceFiles();
            
            // 發送到 WebView
            this._view.webview.postMessage({
                command: 'updateFiles',
                files: workspaceFiles
            });
            
            this._log('檔案列表已刷新');
        } catch (error) {
            this._logError('刷新檔案列表失敗', error);
        }
    }

    /**
     * 複製選取的檔案到剪貼簿
     */
    private async _copySelectedFilesToClipboard(selectedFiles: string[]): Promise<void> {
        if (!this._view) {
            this._logError('複製檔案失敗: WebView 尚未建立');
            return;
        }

        // 檢查選取的檔案列表
        if (!selectedFiles || selectedFiles.length === 0) {
            this._logError('沒有選取任何檔案');
            // 通知 WebView 複製失敗
            this._view.webview.postMessage({
                command: 'copyStatus',
                status: 'failed',
                error: '沒有選取任何檔案'
            });
            return;
        }

        this._log(`開始複製 ${selectedFiles.length} 個檔案到剪貼簿`);
        
        // 通知 WebView 複製開始
        this._view.webview.postMessage({
            command: 'copyStatus',
            status: 'started'
        });

        try {
            // 獲取所有選取檔案的內容
            const contents: { path: string; content: string }[] = [];
            let totalTokens = 0;

            // 顯示進度通知
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "複製檔案內容...",
                cancellable: false
            }, async (progress) => {
                const total = selectedFiles.length;
                
                for (let i = 0; i < selectedFiles.length; i++) {
                    const filePath = selectedFiles[i];
                    const fileName = path.basename(filePath);
                    this._log(`處理檔案 (${i+1}/${total}): ${filePath}`);
                    
                    progress.report({ 
                        message: `(${i+1}/${total}) ${fileName}`,
                        increment: 100 / total
                    });
                    
                    const fileContent = this._fileTreeService.readFileContent(filePath);
                    if (fileContent) {
                        contents.push({
                            path: vscode.workspace.asRelativePath(filePath),
                            content: fileContent
                        });
                        
                        totalTokens += this._fileTreeService.estimateTokens(filePath);
                        this._log(`已讀取檔案: ${filePath}, 大小: ${fileContent.length} 字元`);
                    }
                }
            });

            // 檢查是否成功讀取到內容
            if (contents.length === 0) {
                this._logError('沒有成功讀取任何檔案內容');
                // 通知 WebView 複製失敗
                this._view.webview.postMessage({
                    command: 'copyStatus',
                    status: 'failed',
                    error: '沒有成功讀取任何檔案內容'
                });
                return;
            }

            // 格式化內容
            const config = vscode.workspace.getConfiguration('copyForAI');
            const outputFormat = config.get<string>('outputFormat', 'markdown');
            this._log(`使用輸出格式: ${outputFormat}, 格式化 ${contents.length} 個檔案`);

            let formattedContent = '';
            for (const { path, content } of contents) {
                // 確定檔案的語言ID
                const languageId = this._fileTreeService.getLanguageId(path);
                
                // 使用現有的格式化功能
                const formattedFile = formatOutput({
                    format: outputFormat as any,
                    filePath: path,
                    startLine: 1,
                    endLine: content.split('\n').length,
                    languageId: languageId,
                    code: content
                });
                
                formattedContent += formattedFile + '\n\n';
                this._log(`已格式化檔案: ${path}`);
            }

            // 複製到剪貼簿
            await vscode.env.clipboard.writeText(formattedContent);
            this._log('已將格式化內容複製到剪貼簿');

            // 通知 WebView 複製完成
            this._view.webview.postMessage({
                command: 'copyStatus',
                status: 'completed',
                fileCount: contents.length,
                totalTokens: totalTokens
            });

            // 顯示通知
            vscode.window.showInformationMessage(
                `已複製 ${contents.length} 個檔案到剪貼簿 (共 ${totalTokens} tokens)`
            );
        } catch (error) {
            this._logError('複製檔案時出錯', error);
            
            // 通知 WebView 複製失敗
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'copyStatus',
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error)
                });
            }

            vscode.window.showErrorMessage(`複製檔案失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
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