import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ignore from 'ignore'; // 導入 ignore 套件

/**
 * 表示檔案樹中的節點（檔案或資料夾）
 */
export interface TreeNode {
    type: 'file' | 'folder' | 'root';
    name: string;
    path: string;
    uri?: string;
    fsPath?: string;
    estimatedTokens?: number;
    children?: TreeNode[];
}

/**
 * 檔案樹服務類
 * 處理檔案系統操作、檔案過濾和樹狀結構構建
 */
export class FileTreeService {
    private _outputChannel: vscode.OutputChannel;
    
    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
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
     * 獲取工作區檔案
     */
    public async getWorkspaceFiles(): Promise<TreeNode[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this._log('無工作區資料夾，無法取得檔案');
            return [];
        }

        // 獲取設定
        const config = vscode.workspace.getConfiguration('copyForAI');
        const excludePatterns = config.get<string[]>('contextExplorer.excludePatterns', 
            ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/bin/**']);
        const followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);
        
        const workspacePath = workspaceFolders[0].uri.fsPath;
        
        // 載入 .gitignore 過濾器 (如果啟用了該選項)
        let ignoreFilter: ignore.Ignore | null = null;
        if (followGitignore) {
            ignoreFilter = await this._loadGitignoreFilter(workspacePath);
        }
        
        // 組合排除模式 (用於 vscode.workspace.findFiles)
        const allExcludePatterns = [...excludePatterns];
        
        const excludePattern = allExcludePatterns.length > 0 ? `{${allExcludePatterns.join(',')}}` : '';
        
        try {
            // 獲取所有檔案
            const pattern = new vscode.RelativePattern(workspaceFolders[0], '**/*');
            let files = await vscode.workspace.findFiles(pattern, excludePattern || undefined);
            this._log(`找到 ${files.length} 個檔案（排除模式: ${excludePattern || '無'}）`);
            
            // 使用 .gitignore 過濾檔案 (如果啟用了該選項)
            if (followGitignore && ignoreFilter) {
                const beforeCount = files.length;
                files = this._filterFilesByGitignore(files, workspacePath, ignoreFilter);
                this._log(`應用 .gitignore 過濾後剩餘 ${files.length} 個檔案 (排除了 ${beforeCount - files.length} 個檔案)`);
            }
            
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
     * 載入 .gitignore 過濾器
     */
    private async _loadGitignoreFilter(workspacePath: string): Promise<ignore.Ignore | null> {
        try {
            const gitignorePath = path.join(workspacePath, '.gitignore');
            
            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                const ignoreFilter = ignore.default();
                
                content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .forEach(pattern => ignoreFilter.add(pattern));
                
                this._log(`已載入 .gitignore 過濾器，包含 ${content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length} 個規則`);
                return ignoreFilter;
            }
        } catch (error) {
            this._logError('載入 .gitignore 過濾器失敗', error);
        }
        
        return null;
    }
    
    /**
     * 根據 .gitignore 過濾檔案
     */
    private _filterFilesByGitignore(
        files: vscode.Uri[], 
        workspacePath: string, 
        ignoreFilter: ignore.Ignore | null
    ): vscode.Uri[] {
        if (!ignoreFilter) {
            return files;
        }
        
        return files.filter(file => {
            // 獲取相對於工作區的路徑
            const relativePath = path.relative(workspacePath, file.fsPath).replace(/\\/g, '/');
            
            // 檢查是否應該被忽略
            const shouldIgnore = ignoreFilter.ignores(relativePath);
            
            return !shouldIgnore;
        });
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
            const estimatedTokens = this.estimateTokens(file.fsPath);
            
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
    public estimateTokens(filePath: string): number {
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
     * 根據檔案路徑獲取語言 ID
     */
    public getLanguageId(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();
        
        // 檔案副檔名對應到語言 ID
        const extensionMap: Record<string, string> = {
            '.js': 'javascript',
            '.mjs': 'javascript', // 新增支援 .mjs 檔案
            '.cjs': 'javascript', // 新增支援 .cjs 檔案
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
     * 讀取檔案內容
     */
    public readFileContent(filePath: string): string | null {
        try {
            // 檢查檔案是否存在
            if (!fs.existsSync(filePath)) {
                this._logError(`檔案不存在: ${filePath}`);
                return null;
            }
            
            // 讀取檔案內容
            const fileContent = fs.readFileSync(filePath, 'utf8');
            
            // 如果檔案內容為空或無法讀取，返回 null
            if (fileContent === undefined) {
                this._logError(`檔案內容無法讀取: ${filePath}`);
                return null;
            }
            
            return fileContent;
        } catch (error) {
            this._logError(`讀取檔案 ${filePath} 時出錯`, error);
            return null;
        }
    }
}