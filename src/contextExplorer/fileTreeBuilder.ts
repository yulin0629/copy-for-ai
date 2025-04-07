// src/contextExplorer/fileTreeBuilder.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TreeNode } from './types'; // 從 types 導入 TreeNode

/**
 * 負責將檔案列表轉換為樹狀結構並計算 Token
 */
export class FileTreeBuilder {
    private _outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
    }

    /**
     * 輸出日誌
     */
    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileTreeBuilder] ${message}`);
    }

    /**
     * 輸出錯誤日誌
     */
    private _logError(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileTreeBuilder] 錯誤: ${message}`);
        if (error) {
            const details = error instanceof Error ? `${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}` : String(error);
            this._outputChannel.appendLine(`詳細資訊: ${details}`);
        }
    }

    /**
     * 估算檔案的 tokens 數量
     */
    public estimateTokens(filePath: string): number {
        try {
            // 確保檔案存在且可讀
            if (!fs.existsSync(filePath)) {
                 this._log(`估算 Token 失敗：檔案不存在 ${filePath}`);
                 return 0;
            }
            const stats = fs.statSync(filePath);
            // 忽略非常大的檔案，避免讀取過多內容或估算錯誤
            if (stats.size > 5 * 1024 * 1024) { // 5MB 限制
                this._log(`檔案 ${path.basename(filePath)} 過大 (${(stats.size / (1024*1024)).toFixed(2)}MB)，Token 估算為 0`);
                return 0;
            }
            const fileSize = stats.size;
            // 簡單估算：大約 4 個位元組 (bytes) ~= 1 個 token (基於 OpenAI 的觀察)
            // 這是一個非常粗略的估計，實際值取決於語言和內容
            return Math.ceil(fileSize / 4);
        } catch (error) {
            this._logError(`估算檔案 tokens 出錯：${filePath}`, error);
            return 0;
        }
    }

    /**
     * 計算資料夾內所有檔案的 tokens 總和 (遞迴)
     */
    private _calculateFolderTokens(items: TreeNode[]): number {
        let totalTokens = 0;
        for (const item of items) {
            if (item.type === 'file' && typeof item.estimatedTokens === 'number') {
                totalTokens += item.estimatedTokens;
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                // 遞迴計算子資料夾的 tokens，並將結果加到父資料夾的 estimatedTokens
                const childrenTokens = this._calculateFolderTokens(item.children);
                item.estimatedTokens = childrenTokens; // 更新資料夾節點的 token 估算值
                totalTokens += childrenTokens;
            }
        }
        return totalTokens;
    }

    /**
     * 將扁平的檔案 URI 列表轉換為樹狀結構
     * @param files 檔案 URI 列表
     * @param rootUri 工作區根目錄 URI
     * @returns TreeNode 陣列
     */
    public buildTree(files: vscode.Uri[], rootUri: vscode.Uri): TreeNode[] {
        const rootPath = rootUri.fsPath;
        // 使用物件作為中間表示形式，方便快速查找父節點
        // 鍵是相對路徑，值是 TreeNode
        const treeMap: Record<string, TreeNode> = {};

        for (const file of files) {
            const absolutePath = file.fsPath;
            // 確保使用相對於 rootUri 的路徑，並統一用 '/'
            const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, '/');
            const parts = relativePath.split('/');

            let currentLevelPath = '';
            let parentNode: TreeNode | undefined = undefined;

            // 逐層建立資料夾節點
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                const previousPath = currentLevelPath;
                currentLevelPath = currentLevelPath ? `${currentLevelPath}/${part}` : part;

                if (!treeMap[currentLevelPath]) {
                    const folderNode: TreeNode = {
                        type: 'folder',
                        name: part,
                        path: currentLevelPath,
                        fsPath: path.join(rootPath, currentLevelPath),
                        children: [],
                        estimatedTokens: 0 // 初始化為 0
                    };
                    treeMap[currentLevelPath] = folderNode;

                    // 將新建立的資料夾節點添加到其父節點的 children 中
                    if (previousPath) {
                        parentNode = treeMap[previousPath];
                        if (parentNode && parentNode.children) {
                            parentNode.children.push(folderNode);
                        }
                    } else {
                        // 如果沒有 previousPath，表示這是頂層資料夾
                        // 頂層節點稍後會從 treeMap 中提取
                    }
                }
                 parentNode = treeMap[currentLevelPath]; // 更新 parentNode 指向當前資料夾
            }

            // 建立檔案節點
            const fileName = parts[parts.length - 1];
            const fileNode: TreeNode = {
                type: 'file',
                name: fileName,
                path: relativePath, // 檔案的相對路徑
                fsPath: absolutePath, // 檔案的絕對路徑
                uri: file.toString(), // 檔案的 URI
                estimatedTokens: this.estimateTokens(absolutePath)
            };

            // 將檔案節點添加到其父資料夾的 children 中
            const parentPath = parts.slice(0, parts.length - 1).join('/');
            parentNode = treeMap[parentPath]; // 獲取正確的父資料夾節點

            if (parentNode && parentNode.children) {
                 parentNode.children.push(fileNode);
            } else {
                 // 如果沒有父資料夾 (即檔案在根目錄下)，直接將其視為頂層節點
                 treeMap[relativePath] = fileNode; // 使用檔案的相對路徑作為 key
            }
        }

        // 從 treeMap 中提取所有頂層節點 (沒有父節點的資料夾和根目錄下的檔案)
        const rootNodes: TreeNode[] = [];
        for (const node of Object.values(treeMap)) {
            const isTopLevel = node.path.indexOf('/') === -1; // 檢查是否為頂層路徑
            if (isTopLevel) {
                rootNodes.push(node);
            }
             // 同時對每個資料夾的子節點進行排序
             if (node.type === 'folder' && node.children) {
                 this._sortChildren(node.children);
             }
        }

        // 計算所有資料夾的 Token 總和 (從根節點開始遞迴)
        this._calculateFolderTokens(rootNodes);

        // 對頂層節點進行排序
        this._sortChildren(rootNodes);

        this._log(`建立檔案樹完成，包含 ${rootNodes.length} 個頂層節點`);
        return rootNodes;
    }

    /**
     * 對子節點進行排序：資料夾優先，然後按名稱字母順序
     */
    private _sortChildren(children: TreeNode[]): void {
        children.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name); // 同類型按名稱排序
            }
            return a.type === 'folder' ? -1 : 1; // 資料夾排前面
        });
    }
}