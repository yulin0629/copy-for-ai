import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { formatOutput } from '../formatter';
import * as gitignore from 'ignore'; // 需添加此依賴

/**
 * 表示檔案樹中的節點（檔案或資料夾）
 */
interface TreeNode {
    type: 'file' | 'folder' | 'root';
    name: string;
    path: string;
    uri?: string;
    fsPath?: string;
    estimatedTokens?: number;
    children?: TreeNode[];
}

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
    private _gitignorePatterns?: string[];

    constructor(context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        this._context = context;
        // 創建輸出頻道
        this._outputChannel = vscode.window.createOutputChannel('Copy For AI');
        this._setupFileWatcher();
        this._log('Context Explorer 已初始化');
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
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M10.442 10.442a1 1 0 0 1 1.415 0l3.85 3.85a1 1 0 0 1-1.414 1.415l-3.85-3.85a1 1 0 0 1 0-1.415z" fill="currentColor"/>
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM6.5 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" fill="currentColor"/>
                        </svg>
                        <input type="text" id="filter-input" placeholder="搜尋檔案...">
                        <button id="clear-filter" class="clear-button">✕</button>
                    </div>
                    <div class="options-container">
                        <div class="show-selected-container">
                            <input type="checkbox" id="show-selected-only">
                            <label for="show-selected-only">僅顯示已選取</label>
                        </div>
                        <button id="configure-button" class="configure-button" title="設定排除規則">
                            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.3-.5-.3-.8 1.3-2-.8-.8-2 1.3-.8-.3z" fill="currentColor"/>
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="currentColor"/>
                            </svg>
                        </button>
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
            const workspaceFiles = await this._getWorkspaceFiles();
            this._log(`已載入 ${workspaceFiles.length} 個頂層項目`);
            
            // 獲取先前保存的選取狀態
            const savedState = this._context.workspaceState.get('contextExplorer.state', {
                selectionState: {},
                expandedFolders: {}
            });
            
            // 獲取設定值
            const config = vscode.workspace.getConfiguration('copyForAI');
            const tokenLimit = config.get<number>('tokenLimit', 0);
            
            // 將檔案和狀態發送到 WebView
            this._view.webview.postMessage({
                command: 'initialize',
                files: workspaceFiles,
                savedState: savedState,
                tokenLimit: tokenLimit
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
                // 開啟設定編輯器
                vscode.commands.executeCommand('workbench.action.openSettings', 'copyForAI.contextExplorer.excludePatterns');
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
            const workspaceFiles = await this._getWorkspaceFiles();
            
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
     * 讀取 .gitignore 檔案
     */
    private async _loadGitIgnore(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        try {
            const gitignorePath = path.join(workspaceFolders[0].uri.fsPath, '.gitignore');
            
            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                return content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
            }
        } catch (error) {
            this._logError('讀取 .gitignore 失敗', error);
        }
        
        return [];
    }

    /**
     * 獲取工作區檔案
     */
    private async _getWorkspaceFiles(): Promise<TreeNode[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this._log('無工作區資料夾，無法取得檔案');
            return [];
        }

        // 獲取設定
        const config = vscode.workspace.getConfiguration('copyForAI');
        const excludePatterns = config.get<string[]>('contextExplorer.excludePatterns', 
            ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/bin/**']);
        
        // 載入 .gitignore 檔案
        const gitignorePatterns = await this._loadGitIgnore();
        this._log(`.gitignore 包含 ${gitignorePatterns.length} 個規則`);
        
        // 組合排除模式
        const allExcludePatterns = [...excludePatterns, ...gitignorePatterns.map(p => `**/${p}`)];
        const excludePattern = `{${allExcludePatterns.join(',')}}`;
        
        try {
            // 獲取所有檔案
            const pattern = new vscode.RelativePattern(workspaceFolders[0], '**/*');
            const files = await vscode.workspace.findFiles(pattern, excludePattern);
            this._log(`找到 ${files.length} 個檔案（排除模式: ${excludePattern}）`);
            
            // 過濾二進制檔案和其他非文字檔案
            const textFiles = files.filter(file => this._isTextFile(file.fsPath));
            this._log(`過濾後剩餘 ${textFiles.length} 個文字檔案`);
            
            // 轉換為樹狀結構
            const fileTree = this._filesToTree(textFiles, workspaceFolders[0].uri);
            
            // 添加根目錄節點
            const rootNode: TreeNode = {
                type: 'root',
                name: path.basename(workspaceFolders[0].uri.fsPath) || '專案根目錄',
                path: '/',
                fsPath: workspaceFolders[0].uri.fsPath,
                children: fileTree,
                estimatedTokens: this._calculateFolderTokens(fileTree)
            };
            
            return [rootNode];
        } catch (error) {
            this._logError('獲取工作區檔案時出錯', error);
            return [];
        }
    }

    /**
     * 檢查是否為文字檔案
     */
    private _isTextFile(filePath: string): boolean {
        // 檢查副檔名，排除常見二進制檔案類型
        const ext = path.extname(filePath).toLowerCase();
        const binaryExtensions = [
            '.exe', '.dll', '.so', '.dylib', '.obj', '.o', '.bin',
            '.zip', '.tar', '.gz', '.7z', '.rar', '.jar',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
            '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.webm',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
        ];
        
        return !binaryExtensions.includes(ext);
    }

    /**
     * 將檔案轉換為樹狀結構
     */
    private _filesToTree(files: vscode.Uri[], rootUri: vscode.Uri): TreeNode[] {
        // 使用物件作為中間表示形式
        const folderMap: Record<string, {
            node: TreeNode;
            children: Record<string, TreeNode>;
        }> = {};
        
        // 建立樹狀結構
        for (const file of files) {
            const relativePath = vscode.workspace.asRelativePath(file, false);
            const parts = relativePath.split(path.sep);
            
            let currentPath = '';
            
            // 確保每一層路徑都創建對應的資料夾節點
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                currentPath = currentPath ? `${currentPath}${path.sep}${part}` : part;
                
                if (!folderMap[currentPath]) {
                    folderMap[currentPath] = {
                        node: {
                            type: 'folder',
                            name: part,
                            path: currentPath,
                            children: []
                        },
                        children: {}
                    };
                }
            }
            
            // 處理檔案
            const fileName = parts[parts.length - 1];
            const filePath = parts.join(path.sep);
            const parentPath = parts.slice(0, parts.length - 1).join(path.sep);
            
            // 估算檔案 tokens
            const estimatedTokens = this._estimateTokens(file.fsPath);
            
            // 建立檔案節點
            const fileNode: TreeNode = {
                type: 'file',
                name: fileName,
                path: filePath,
                fsPath: file.fsPath,
                uri: file.toString(),
                estimatedTokens
            };
            
            // 將檔案加入到父資料夾
            if (parentPath) {
                folderMap[parentPath].children[fileName] = fileNode;
            } else {
                // 處理根目錄下的檔案
                if (!folderMap['root']) {
                    folderMap['root'] = {
                        node: {
                            type: 'folder',
                            name: 'root',
                            path: '',
                            children: []
                        },
                        children: {}
                    };
                }
                folderMap['root'].children[fileName] = fileNode;
            }
        }
        
        // 將資料夾樹狀結構轉換為陣列
        const result: TreeNode[] = [];
        
        // 轉換為最終的樹狀結構
        for (const [folderPath, folder] of Object.entries(folderMap)) {
            const childrenArray: TreeNode[] = Object.values(folder.children);
            folder.node.children = childrenArray;
        }
        
        // 為每個資料夾建立正確的父子關係
        for (const [folderPath, folder] of Object.entries(folderMap)) {
            const parts = folderPath.split(path.sep);
            
            if (parts.length === 1) {
                // 頂層資料夾直接加入結果
                if (folderPath !== 'root') {
                    result.push(folder.node);
                }
            } else {
                // 將子資料夾加入到父資料夾
                const parentPath = parts.slice(0, parts.length - 1).join(path.sep);
                if (folderMap[parentPath]) {
                    const parentNode = folderMap[parentPath].node;
                    if (parentNode.children) {
                        parentNode.children.push(folder.node);
                    }
                }
            }
        }
        
        // 加入根目錄下的檔案
        if (folderMap['root']) {
            const rootFiles = Object.values(folderMap['root'].children);
            result.push(...rootFiles);
        }
        
        // 計算每個資料夾的 tokens
        for (const [folderPath, folder] of Object.entries(folderMap)) {
            if (folder.node.children && folder.node.children.length > 0) {
                folder.node.estimatedTokens = this._calculateFolderTokens(folder.node.children);
            }
        }
        
        // 先資料夾後檔案排序
        result.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });
        
        return result;
    }

    /**
     * 計算資料夾的 tokens 總和
     */
    private _calculateFolderTokens(items: TreeNode[]): number {
        let totalTokens = 0;
        
        for (const item of items) {
            if (item.type === 'file' && item.estimatedTokens) {
                totalTokens += item.estimatedTokens;
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                totalTokens += this._calculateFolderTokens(item.children);
            }
        }
        
        return totalTokens;
    }

    /**
     * 估算檔案的 tokens 數量
     */
    private _estimateTokens(filePath: string): number {
        try {
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;
            
            // 簡單估算：大約 4 個字元等於 1 個 token
            // 實際情況可能會更複雜，需要根據語言和內容來計算
            return Math.ceil(fileSize / 4);
        } catch (error) {
            this._logError(`估算檔案 tokens 出錯：${filePath}`, error);
            return 0;
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
                    
                    try {
                        // 檢查檔案是否存在
                        if (!fs.existsSync(filePath)) {
                            this._logError(`檔案不存在: ${filePath}`);
                            continue;
                        }
                        
                        // 讀取檔案內容
                        const fileContent = fs.readFileSync(filePath, 'utf8');
                        
                        // 如果檔案內容為空或無法讀取，跳過
                        if (!fileContent) {
                            this._logError(`檔案內容為空或無法讀取: ${filePath}`);
                            continue;
                        }
                        
                        contents.push({
                            path: vscode.workspace.asRelativePath(filePath),
                            content: fileContent
                        });
                        
                        totalTokens += this._estimateTokens(filePath);
                        this._log(`已讀取檔案: ${filePath}, 大小: ${fileContent.length} 字元`);
                    } catch (error) {
                        this._logError(`讀取檔案 ${filePath} 時出錯`, error);
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
                const languageId = this._getLanguageId(path);
                
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
     * 根據檔案路徑獲取語言 ID
     */
    private _getLanguageId(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();
        
        // 檔案副檔名對應到語言 ID
        const extensionMap: Record<string, string> = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascriptreact',
            '.tsx': 'typescriptreact',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cs': 'csharp',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.rs': 'rust',
            '.kt': 'kotlin',
            '.md': 'markdown',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.xml': 'xml',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.sh': 'shellscript',
        };
        
        return extensionMap[extension] || 'plaintext';
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