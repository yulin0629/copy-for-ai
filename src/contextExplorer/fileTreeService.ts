// src/contextExplorer/fileTreeService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeNode } from './types'; // 從 types 導入 TreeNode
import { FileSystemReader } from './fileSystemReader';
import { FileTreeBuilder } from './fileTreeBuilder';
import { FileInfoReader } from './fileInfoReader';

/**
 * 檔案樹服務類 (重構後)
 * 協調 FileSystemReader, FileTreeBuilder, FileInfoReader
 * 提供統一的介面給 ContextExplorerService
 */
export class FileTreeService {
    private _outputChannel: vscode.OutputChannel;
    private _fileSystemReader: FileSystemReader;
    private _fileTreeBuilder: FileTreeBuilder;
    private _fileInfoReader: FileInfoReader;

    // 保留一些狀態，因為它們與 getWorkspaceFiles 的參數相關
    private _excludePatterns: string[] = [];
    private _followGitignore: boolean = true;
    private _workspacePath: string = '';

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
        this._fileSystemReader = new FileSystemReader(outputChannel);
        this._fileTreeBuilder = new FileTreeBuilder(outputChannel);
        this._fileInfoReader = new FileInfoReader(outputChannel);
        this._log('FileTreeService 已初始化');
    }

    /**
     * 輸出日誌到輸出頻道
     */
    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileTreeService] ${message}`);
    }

    /**
     * 輸出錯誤到輸出頻道
     */
    private _logError(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileTreeService] 錯誤: ${message}`);
        if (error) {
            const details = error instanceof Error ? `${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}` : String(error);
            this._outputChannel.appendLine(`詳細資訊: ${details}`);
        }
    }

    /**
     * 獲取工作區檔案樹
     */
    public async getWorkspaceFiles(): Promise<TreeNode[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this._log('無工作區資料夾，無法取得檔案');
            return [];
        }
        const workspaceFolder = workspaceFolders[0]; // 假設只有一個工作區
        this._workspacePath = workspaceFolder.uri.fsPath;

        // 獲取最新設定
        const config = vscode.workspace.getConfiguration('copyForAI');
        // 提供預設值，避免 undefined
        this._excludePatterns = config.get<string[]>('contextExplorer.excludePatterns', []) || [];
        this._followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);

        this._log(`開始獲取工作區檔案: ${this._workspacePath}`);
        this._log(`排除模式: ${JSON.stringify(this._excludePatterns)}`);
        this._log(`遵循 .gitignore: ${this._followGitignore}`);

        try {
            // 1. 使用 FileSystemReader 查找符合條件的檔案 URI
            const fileUris = await this._fileSystemReader.findWorkspaceFiles(
                workspaceFolder,
                this._excludePatterns,
                this._followGitignore
            );

            if (fileUris.length === 0) {
                this._log('未找到符合條件的檔案');
                // 即使沒有檔案，也回傳一個根節點，讓 UI 顯示專案名稱
                 const rootNode: TreeNode = {
                     type: 'root',
                     name: path.basename(this._workspacePath) || '專案根目錄',
                     path: '/',
                     fsPath: this._workspacePath,
                     children: [],
                     estimatedTokens: 0
                 };
                 return [rootNode];
            }

            // 2. 使用 FileTreeBuilder 將 URI 列表轉換為樹狀結構
            const fileTree = this._fileTreeBuilder.buildTree(fileUris, workspaceFolder.uri);

            // 3. 建立最終的根節點
            const rootNode: TreeNode = {
                type: 'root',
                name: path.basename(this._workspacePath) || '專案根目錄',
                path: '/', // 根節點的相對路徑
                fsPath: this._workspacePath,
                children: fileTree,
                // 根節點的 token 由其子節點遞迴計算得到
                estimatedTokens: this._fileTreeBuilder['_calculateFolderTokens'](fileTree) // 調用 builder 的內部方法計算總和
            };

            this._log(`工作區檔案樹建立完成，根節點: ${rootNode.name}, Tokens: ${rootNode.estimatedTokens}`);
            return [rootNode]; // 回傳包含單一根節點的陣列

        } catch (error) {
            this._logError('獲取工作區檔案樹時出錯', error);
            // 發生錯誤時回傳一個空的根節點
            const rootNode: TreeNode = {
                 type: 'root',
                 name: path.basename(this._workspacePath) || '專案根目錄 (錯誤)',
                 path: '/',
                 fsPath: this._workspacePath,
                 children: [],
                 estimatedTokens: 0
             };
            return [rootNode];
        }
    }

    /**
     * 讀取檔案內容 (委派給 FileInfoReader)
     * 假設從 Service 調用時 filePath 總是絕對路徑
     */
    public readFileContent(filePath: string): string | null {
        // **移除** 不必要的 isAbsolute 檢查和 path.join
        // 驗證一下傳入的是否真的是絕對路徑（以防萬一）
        if (!path.isAbsolute(filePath)) {
             this._logError(`readFileContent: 收到非預期的相對路徑 ${filePath}，無法處理`);
             return null;
        }
        // 直接將絕對路徑傳遞給 FileInfoReader
        return this._fileInfoReader.readFileContent(filePath);
    }

    /**
     * 估算檔案的 tokens 數量 (委派給 FileTreeBuilder)
     * 假設從 Service 調用時 filePath 總是絕對路徑
     */
    public estimateTokens(filePath: string): number {
        // **移除** 不必要的 isAbsolute 檢查和 path.join
        if (!path.isAbsolute(filePath)) {
            this._logError(`estimateTokens: 收到非預期的相對路徑 ${filePath}，返回 0`);
            return 0;
        }
       // 直接將絕對路徑傳遞給 FileTreeBuilder
       return this._fileTreeBuilder.estimateTokens(filePath);
   }

    /**
     * 根據檔案路徑獲取語言 ID (委派給 FileInfoReader)
     */
    public getLanguageId(filePath: string): string {
        // getLanguageId 通常使用相對路徑或檔名即可，無需轉換
        return this._fileInfoReader.getLanguageId(filePath);
    }

    /**
     * 檢查是否為文字檔案 (委派給 FileSystemReader)
     * 假設從 Service 調用時 filePath 總是絕對路徑
     */
    public isTextFile(filePath: string): boolean {
        // **移除** 不必要的 isAbsolute 檢查和 path.join
         if (!path.isAbsolute(filePath)) {
             this._logError(`isTextFile: 收到非預期的相對路徑 ${filePath}，返回 false`);
             return false;
         }
        // 直接將絕對路徑傳遞給 FileSystemReader
        return this._fileSystemReader.isTextFile(filePath);
    }

    /**
     * 檢查檔案是否被忽略 (綜合 VSCode 設定和 .gitignore)
     * @param filePath 檔案路徑（絕對路徑）
     * @returns 如果檔案應該被忽略，則返回 true，否則返回 false
     */
    public isIgnoredFile(filePath: string): boolean {
        // 這個方法內部邏輯保持不變，因為它本來就需要處理絕對路徑
        if (!filePath || !this._workspacePath) return false;

        if (!path.isAbsolute(filePath)) {
            this._log(`[警告] isIgnoredFile: 收到相對路徑 ${filePath}，嘗試轉換`);
             filePath = path.join(this._workspacePath, filePath);
        }

        // 1. 檢查 VS Code 排除模式 (需要 glob 匹配)
        const relativePath = vscode.workspace.asRelativePath(filePath);
        // ... (保留 glob 匹配邏輯)

        // 2. 檢查 .gitignore (如果啟用)
        if (this._followGitignore) {
            if (this._fileSystemReader.isIgnoredByGitignore(filePath)) {
                 this._log(`檔案 ${relativePath} 符合 .gitignore 規則`);
                 return true;
            }
        }

        return false;
    }
}