import * as vscode from 'vscode';
import * as path from 'path';
import { formatOutput } from '../formatter';
import { FileTreeService, TreeNode } from './fileTreeService';
import { StateManager } from './stateManager';

/**
 * Context Explorer 視圖提供者
 * 實現單一 WebView 介面，提供檔案選取與複製功能
 */
export class ContextExplorerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copy-for-ai.contextExplorer';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _fileSystemWatcher: vscode.FileSystemWatcher | undefined;
    private _watcherListeners: vscode.Disposable[] = [];
    private _gitignoreWatcher: vscode.FileSystemWatcher | undefined;
    private _gitignoreListeners: vscode.Disposable[] = [];
    private _outputChannel: vscode.OutputChannel;
    private _fileTreeService: FileTreeService;
    private _sessionId: string;
    private _stateManager: StateManager;

    constructor(context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        this._context = context;
        // 創建輸出頻道
        this._outputChannel = vscode.window.createOutputChannel('Copy For AI');
        // 初始化文件樹服務
        this._fileTreeService = new FileTreeService(this._outputChannel);
        // 初始化狀態管理器
        this._stateManager = new StateManager(context);
        this._log('Context Explorer 已初始化');
        
        // 生成新的會話 ID
        this._sessionId = this._generateSessionId();
        this._log(`已生成新的會話 ID: ${this._sessionId}`);
        
        // 監聽配置變更
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('copyForAI.tokenLimit')) {
                this._updateTokenLimit();
            }
            
            // 當設定變更時，重新建立 FileSystemWatcher
            if (e.affectsConfiguration('copyForAI.contextExplorer.excludePatterns') || 
                e.affectsConfiguration('copyForAI.contextExplorer.followGitignore')) {
                this._log('排除設定已變更，重新載入...');
                
                // 如果正在監聽，則停止再重新啟動
                if (this._watcherListeners.length > 0) {
                    this._stopWatching();
                    this._startWatching();
                }
                
                // 重新刷新檔案列表
                this._refreshFiles('排除設定已變更');
            }
        }, null, this._context.subscriptions);

        // *** 新增：確保在擴充功能停用時清理監聽器 ***
        context.subscriptions.push(vscode.Disposable.from(...this._watcherListeners));
        context.subscriptions.push(vscode.Disposable.from(...this._gitignoreListeners));
        context.subscriptions.push({ dispose: () => this._stopWatching() }); // 確保停止監聽
        context.subscriptions.push({ dispose: () => this._stopGitignoreWatching() }); // 清理 gitignore 監聽
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
        return this._refreshFiles('從使用者命令觸發');
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

    }

    /**
     * 啟動檔案系統監聽
     */
    private _startWatching(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this._log('無工作區資料夾，無法啟動監聽');
            return;
        }
        
        const workspacePath = workspaceFolders[0].uri.fsPath;

        // *** 確保停止之前的監聽器 ***
        this._stopWatching();
        
        // *** 新增：取得排除設定 ***
        const config = vscode.workspace.getConfiguration('copyForAI');
        const userExcludePatterns = config.get<string[]>('contextExplorer.excludePatterns', []);
        const followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);

        // *** 新增：組合排除模式 ***
        // 預設排除模式 + 用戶設定的排除模式
        const allExcludePatterns = [
            '**/node_modules/**', 
            '**/.git/**', 
            '**/dist/**', 
            '**/build/**', 
            '**/bin/**',
            ...userExcludePatterns 
        ];
        const excludePattern = allExcludePatterns.length > 0 ? `{${allExcludePatterns.join(',')}}` : undefined;

        this._log(`啟動檔案監聽器，排除模式: ${excludePattern || '無'}`);
        
        // 創建檔案系統監聽器
        this._fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspacePath, '**/*'), 
            false, // 不忽略創建事件
            false, // 不忽略變更事件
            false  // 不忽略刪除事件
        );
        
        // 監聽檔案創建事件
        this._watcherListeners.push(
            this._fileSystemWatcher.onDidCreate(uri => {
                this._log(`檔案已創建: ${uri.fsPath}`);
                if (!this._shouldIgnoreFile(uri.fsPath)) {
                    this._refreshFiles(`檔案創建: ${vscode.workspace.asRelativePath(uri)}`);
                } else {
                    this._log(`忽略創建事件 (符合排除規則): ${uri.fsPath}`);
                }
            })
        );
        
        // 監聽檔案變更事件
        this._watcherListeners.push(
            this._fileSystemWatcher.onDidChange(uri => {
                this._log(`檔案已變更: ${uri.fsPath}`);
                if (!this._shouldIgnoreFile(uri.fsPath)) {
                    this._refreshFiles(`檔案變更: ${vscode.workspace.asRelativePath(uri)}`);
                } else {
                    this._log(`忽略變更事件 (符合排除規則): ${uri.fsPath}`);
                }
            })
        );
        
        // 監聽檔案刪除事件
        this._watcherListeners.push(
            this._fileSystemWatcher.onDidDelete(uri => {
                this._log(`檔案已刪除: ${uri.fsPath}`);
                // 對於刪除事件，我們仍然需要刷新，除非能確定該檔案在刪除前已被排除
                if (!this._shouldIgnoreFile(uri.fsPath)) {
                    this._refreshFiles(`檔案刪除: ${vscode.workspace.asRelativePath(uri)}`);
                } else {
                    this._log(`忽略刪除事件 (符合排除規則): ${uri.fsPath}`);
                }
            })
        );
        
        this._context.subscriptions.push(this._fileSystemWatcher);
        this._log('檔案監聽器已啟動');

        // 同步啟動/停止 .gitignore 監聽
        if (followGitignore) {
            this._ensureGitignoreWatcher();
        } else {
            this._stopGitignoreWatching();
        }
    }

    /**
     * 檢查檔案是否應該被忽略
     * @param filePath 檔案路徑
     * @returns 如果檔案應該被忽略，則返回 true，否則返回 false
     */
    private _shouldIgnoreFile(filePath: string): boolean {
        // 使用 FileTreeService 的 isIgnoredFile 方法來檢查檔案是否應該被忽略
        return this._fileTreeService.isIgnoredFile(filePath);
    }

    /**
     * 停止檔案系統監聽的方法
     */
    private _stopWatching(): void {
        this._log('停止檔案監聽器...');
        this._watcherListeners.forEach(listener => listener.dispose());
        this._watcherListeners = [];
        
        // 同時停止 .gitignore 監聽
        this._stopGitignoreWatching();
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

        // *** 修改：只有在視圖可見時才初始化和啟動監聽 ***
        if (webviewView.visible) {
            this._initializeWebView();
            this._startWatching();
        }

        // 視圖可見性變更時保留狀態
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._initializeWebView();
                this._startWatching();
            } else {
                this._stopWatching();
            }
        });
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
                <div class="file-list-container">
                    <div id="file-list" class="file-list"></div>
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
            
            // 使用狀態管理器獲取保存的狀態
            const savedState = this._stateManager.getState();
            
            // 獲取設定值
            const config = vscode.workspace.getConfiguration('copyForAI');
            const tokenLimit = config.get<number>('tokenLimit', 0);
            
            // 將檔案、狀態和會話 ID 發送到 WebView
            this._view.webview.postMessage({
                command: 'initialize',
                files: workspaceFiles,
                savedState,
                tokenLimit: tokenLimit,
                sessionId: this._sessionId
            });
            
            this._log('WebView 初始化完成');
        } catch (error) {
            this._logError('WebView 初始化失敗', error);
        }
    }

    /**
     * 處理來自 WebView 的消息
     */
    private async _handleMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'getFiles':
                    // 重新載入檔案列表
                    await this._refreshFiles();
                    break;
                    
                case 'saveState':
                    // 使用狀態管理器保存狀態
                    await this._stateManager.updateState(message.state);
                    this._log('已儲存 WebView 狀態');
                    break;
                    
                case 'copyToClipboard':
                    // 複製選中的檔案
                    await this._copySelectedFilesToClipboard(message.selectedFiles);
                    break;
                    
                default:
                    this._log(`收到未知命令: ${message.command}`);
                    break;
            }
        } catch (error) {
            this._logError('處理 WebView 消息失敗', error);
        }
    }

    /**
     * 刷新檔案列表
     * @param reason 刷新原因（可選）
     */
    private async _refreshFiles(reason?: string): Promise<void> {
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
                files: workspaceFiles,
                reason: reason
            });
            
            this._log(`檔案列表已刷新${reason ? ': ' + reason : ''}`);
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

    /**
     * 添加檔案到 Context Explorer 選擇列表
     * @param filePath 檔案路徑
     */
    public async addFileToExplorer(filePath: string): Promise<void> {
        try {
            // 使用狀態管理器更新檔案選擇狀態並展開父資料夾
            const updatedState = await this._stateManager.selectFileAndExpandParents(filePath, true);
            
            // 如果 WebView 已經啟動，則發送消息更新 UI
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'updateState',
                    state: updatedState
                });
            }
            
            this._log(`已添加檔案到選擇列表: ${vscode.workspace.asRelativePath(filePath)}`);
            vscode.window.showInformationMessage(`已添加 ${path.basename(filePath)} 到 Copy For AI Explorer`);
        } catch (error) {
            this._logError('添加檔案到選擇列表失敗', error);
            vscode.window.showErrorMessage(`添加檔案失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 添加資料夾下所有檔案到 Context Explorer 選擇列表
     * @param folderPath 資料夾路徑
     */
    public async addFolderToExplorer(folderPath: string): Promise<void> {
        try {
            // 顯示進度指示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在添加資料夾中的檔案...",
                cancellable: false
            }, async (progress) => {
                // 確保 FileTreeService 已初始化
                if (!this._fileTreeService) {
                    this._logError('FileTreeService 未初始化');
                    return;
                }
                
                // 獲取資料夾下所有檔案
                const folderUri = vscode.Uri.file(folderPath);
                const folderPattern = new vscode.RelativePattern(folderUri, '**/*');
                const files = await vscode.workspace.findFiles(folderPattern);
                
                // 過濾並只保留文字檔案
                const textFiles = files.filter(file => this._fileTreeService.isTextFile(file.fsPath));
                
                // 準備檔案路徑列表
                const filePaths = textFiles.map(file => file.fsPath);
                
                // 更新進度
                for (let i = 0; i < filePaths.length; i++) {
                    progress.report({ 
                        message: `(${i+1}/${filePaths.length}) ${path.basename(filePaths[i])}`,
                        increment: 100 / filePaths.length
                    });
                }
                
                // 使用狀態管理器批量更新檔案選擇狀態
                const updatedState = await this._stateManager.selectFilesAndExpandParents(filePaths, true);
                
                // 如果 WebView 已經啟動，則發送消息更新 UI
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'updateState',
                        state: updatedState
                    });
                }
                
                const relativeFolder = vscode.workspace.asRelativePath(folderPath);
                this._log(`已添加資料夾 ${relativeFolder} 下的 ${textFiles.length} 個檔案到選擇列表`);
                vscode.window.showInformationMessage(`已添加 ${path.basename(folderPath)} 資料夾下的 ${textFiles.length} 個檔案到 Copy For AI Explorer`);
            });
        } catch (error) {
            this._logError('添加資料夾到選擇列表失敗', error);
            vscode.window.showErrorMessage(`添加資料夾失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 創建 .gitignore 監聽器
     */
    private _ensureGitignoreWatcher(): void {
        if (this._gitignoreWatcher) {
            return; // 已經創建
        }
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }
        
        // 設定是否要監聽 .gitignore
        const config = vscode.workspace.getConfiguration('copyForAI');
        const followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);
        
        if (!followGitignore) {
            return; // 如果設定不跟隨 .gitignore，則不需要監聽
        }
        
        // 監聽每個工作區資料夾中的 .gitignore 檔案變更
        for (const folder of workspaceFolders) {
            const gitignorePattern = new vscode.RelativePattern(folder, '.gitignore');
            this._gitignoreWatcher = vscode.workspace.createFileSystemWatcher(gitignorePattern);
            
            // 將 watcher 本身加入 subscriptions
            this._context.subscriptions.push(this._gitignoreWatcher);
            
            // 監聽 .gitignore 檔案變更
            this._gitignoreListeners.push(this._gitignoreWatcher.onDidChange((uri) => {
                this._log(`.gitignore 檔案已變更: ${uri.fsPath}`);
                
                // 重新刷新檔案列表，會重新載入 .gitignore 規則
                this._refreshFiles('.gitignore 規則已更新');
            }));
            
            // 監聽 .gitignore 檔案建立
            this._gitignoreListeners.push(this._gitignoreWatcher.onDidCreate((uri) => {
                this._log(`.gitignore 檔案已建立: ${uri.fsPath}`);
                
                // 重新刷新檔案列表
                this._refreshFiles('.gitignore 檔案已建立');
            }));
            
            // 監聽 .gitignore 檔案刪除
            this._gitignoreListeners.push(this._gitignoreWatcher.onDidDelete((uri) => {
                this._log(`.gitignore 檔案已刪除: ${uri.fsPath}`);
                
                // 重新刷新檔案列表
                this._refreshFiles('.gitignore 檔案已刪除');
            }));
            
            this._log(`.gitignore 檔案監視器已創建: ${folder.uri.fsPath}`);
        }
    }

    /**
     * 停止 .gitignore 監聽
     */
    private _stopGitignoreWatching(): void {
        this._log('停止 .gitignore 監聽器...');
        this._gitignoreListeners.forEach(listener => listener.dispose());
        this._gitignoreListeners = [];
        
        if (this._gitignoreWatcher) {
            this._gitignoreWatcher.dispose();
            this._gitignoreWatcher = undefined;
        }
    }
}