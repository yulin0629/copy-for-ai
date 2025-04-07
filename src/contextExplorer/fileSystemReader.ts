// src/contextExplorer/fileSystemReader.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ignore from 'ignore';

/**
 * 負責讀取和過濾檔案系統中的檔案
 */
export class FileSystemReader {
    private _outputChannel: vscode.OutputChannel;
    private _ignoreFilter: ignore.Ignore | null = null;
    private _gitignoreLoaded: boolean = false;
    private _workspacePath: string = '';

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
    }

    /**
     * 輸出日誌
     */
    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileSystemReader] ${message}`);
    }

    /**
     * 輸出錯誤日誌
     */
    private _logError(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileSystemReader] 錯誤: ${message}`);
        if (error) {
            const details = error instanceof Error ? `${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}` : String(error);
            this._outputChannel.appendLine(`詳細資訊: ${details}`);
        }
    }

    /**
     * 載入 .gitignore 過濾器
     */
    public async loadGitignoreFilter(workspacePath: string): Promise<void> {
        this._workspacePath = workspacePath;
        this._gitignoreLoaded = false;
        this._ignoreFilter = null;

        try {
            const gitignorePath = path.join(workspacePath, '.gitignore');

            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                const ig = ignore.default();

                content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .forEach(pattern => ig.add(pattern));

                this._log(`已載入 .gitignore 過濾器，包含 ${content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length} 個規則`);
                this._ignoreFilter = ig;
                this._gitignoreLoaded = true;
            } else {
                 this._log('.gitignore 檔案不存在，不載入過濾器');
            }
        } catch (error) {
            this._logError('載入 .gitignore 過濾器失敗', error);
            this._gitignoreLoaded = false;
            this._ignoreFilter = null;
        }
    }

    /**
     * 根據 .gitignore 過濾檔案
     */
    private _filterFilesByGitignore(files: vscode.Uri[]): vscode.Uri[] {
        if (!this._gitignoreLoaded || !this._ignoreFilter || !this._workspacePath) {
            return files;
        }

        const ignoreFilter = this._ignoreFilter; // 確保在 filter 函數中引用正確的 filter
        const workspacePath = this._workspacePath;

        return files.filter(file => {
            const relativePath = path.relative(workspacePath, file.fsPath).replace(/\\/g, '/');
            // ignore 函式庫需要相對路徑，且不能以 / 開頭，除非是根目錄下的檔案
            const normalizedPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
            const shouldIgnore = ignoreFilter.ignores(normalizedPath);
            // this._log(`檢查 Gitignore: ${normalizedPath} -> ${shouldIgnore ? '忽略' : '保留'}`);
            return !shouldIgnore;
        });
    }

    /**
     * 檢查是否為文字檔案 (根據副檔名)
     */
    public isTextFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        // 排除常見二進制檔案類型
        const binaryExtensions = [
            '.exe', '.dll', '.so', '.dylib', '.obj', '.o', '.bin',
            '.zip', '.tar', '.gz', '.7z', '.rar', '.jar', '.vsix',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp', '.svg', // SVG 雖然是文字，但通常不加入 context
            '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.webm',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.lock', // 例如 package-lock.json, yarn.lock, composer.lock
            '.sqlite', '.db', // 資料庫檔案
            '.woff', '.woff2', '.ttf', '.otf', '.eot' // 字型檔案
        ];

        // 檢查是否為已知的二進制副檔名
        if (binaryExtensions.includes(ext)) {
            return false;
        }

        // 檢查是否為無副檔名或特殊檔案 (例如 .gitignore, Dockerfile)
        if (ext === '' || ext === '.' || filePath.includes(path.sep + '.')) {
             // 允許常見的無副檔名設定檔
             const basename = path.basename(filePath).toLowerCase();
             const allowedNoExt = ['.gitignore', 'dockerfile', 'license', 'readme'];
             if (allowedNoExt.includes(basename)) {
                 return true;
             }
             // 預設情況下，無副檔名或隱藏檔案可能不是純文字，保守處理
             // return false; // 或者可以嘗試讀取一小部分判斷，但會增加複雜度
        }

        // 預設視為文字檔案
        return true;
    }

    /**
     * 獲取工作區內符合條件的檔案列表
     * @param workspaceFolder 工作區資料夾
     * @param excludePatterns VS Code 設定的排除模式
     * @param followGitignore 是否遵循 .gitignore
     */
    public async findWorkspaceFiles(
        workspaceFolder: vscode.WorkspaceFolder,
        excludePatterns: string[],
        followGitignore: boolean
    ): Promise<vscode.Uri[]> {
        const workspacePath = workspaceFolder.uri.fsPath;
        this._workspacePath = workspacePath; // 更新 workspacePath

        // 載入 .gitignore (如果需要)
        if (followGitignore) {
            await this.loadGitignoreFilter(workspacePath);
        } else {
            this._gitignoreLoaded = false;
            this._ignoreFilter = null;
            this._log('已停用 .gitignore 過濾');
        }

        // 組合排除模式 (用於 vscode.workspace.findFiles)
        const vscodeExcludePattern = excludePatterns.length > 0 ? `{${excludePatterns.join(',')}}` : undefined;
        this._log(`使用 VS Code 排除模式: ${vscodeExcludePattern || '無'}`);

        try {
            // 1. 使用 VS Code API 查找檔案，應用設定中的排除模式
            const pattern = new vscode.RelativePattern(workspaceFolder, '**/*');
            let files = await vscode.workspace.findFiles(pattern, vscodeExcludePattern);
            this._log(`VS Code findFiles 找到 ${files.length} 個檔案`);

            // 2. 應用 .gitignore 過濾 (如果啟用)
            if (followGitignore && this._gitignoreLoaded) {
                const beforeCount = files.length;
                files = this._filterFilesByGitignore(files);
                this._log(`應用 .gitignore 過濾後剩餘 ${files.length} 個檔案 (排除了 ${beforeCount - files.length} 個)`);
            }

            // 3. 過濾掉非文字檔案
            const textFiles = files.filter(file => this.isTextFile(file.fsPath));
            this._log(`過濾非文字檔案後剩餘 ${textFiles.length} 個檔案`);

            return textFiles;
        } catch (error) {
            this._logError('查找工作區檔案時出錯', error);
            return [];
        }
    }

    /**
     * 檢查檔案是否被忽略 (基於 .gitignore)
     * 注意：此方法只檢查 .gitignore，不檢查 VS Code 的 excludePatterns
     * @param filePath 絕對檔案路徑
     * @returns 是否被 .gitignore 忽略
     */
    public isIgnoredByGitignore(filePath: string): boolean {
        if (!this._gitignoreLoaded || !this._ignoreFilter || !this._workspacePath) {
            return false; // 如果 gitignore 未載入，則不認為是被忽略
        }
        const relativePath = path.relative(this._workspacePath, filePath).replace(/\\/g, '/');
        const normalizedPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
        return this._ignoreFilter.ignores(normalizedPath);
    }

    // getter for gitignoreLoaded status
    public get isGitignoreLoaded(): boolean {
        return this._gitignoreLoaded;
    }

    // getter for workspacePath
    public get workspacePath(): string {
        return this._workspacePath;
    }
}