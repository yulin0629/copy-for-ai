// src/contextExplorer/stateManager.ts
import * as vscode from 'vscode';
import { ExplorerState, Snippet } from './types'; // 引入 Snippet

/**
 * Context Explorer 狀態管理類
 * 負責統一管理檔案選擇狀態和程式碼片段的保存和讀取
 */
export class StateManager {
    private static readonly STATE_KEY = 'contextExplorer.state';

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * 獲取當前狀態
     * @returns 檔案瀏覽器狀態
     */
    public getState(): ExplorerState {
        // 提供包含 snippets 的預設值
        const defaultState: ExplorerState = {
            selectionState: {},
            expandedFolders: {},
            snippets: []
        };
        const state = this.context.workspaceState.get<ExplorerState>(StateManager.STATE_KEY, defaultState);
        // 確保舊狀態也有 snippets 屬性
        if (!state.snippets) {
            state.snippets = [];
        }
        return state;
    }

    /**
     * 更新整體狀態
     * @param state 新的狀態
     */
    public updateState(state: ExplorerState): Thenable<void> {
        return this.context.workspaceState.update(StateManager.STATE_KEY, state);
    }

    /**
     * 更新單個檔案的選擇狀態
     * @param filePath 檔案路徑
     * @param isSelected 是否選中
     */
    public updateFileSelection(filePath: string, isSelected: boolean): Thenable<void> {
        const state = this.getState();
        const relativePath = vscode.workspace.asRelativePath(filePath);

        state.selectionState[relativePath] = isSelected;

        return this.updateState(state);
    }

    /**
     * 展開檔案的所有父資料夾
     * @param filePath 檔案路徑
     */
    public expandParentFolders(filePath: string): Thenable<void> {
        const state = this.getState();
        const relativePath = vscode.workspace.asRelativePath(filePath);
        const parts = relativePath.split(/[\/\\]/);

        let parentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
            parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
            state.expandedFolders[parentPath] = true;
        }

        return this.updateState(state);
    }

    /**
     * 更新檔案選擇狀態並展開父資料夾
     * @param filePath 檔案路徑
     * @param isSelected 是否選中
     */
    public async selectFileAndExpandParents(filePath: string, isSelected: boolean): Promise<ExplorerState> {
        const state = this.getState();
        const relativePath = vscode.workspace.asRelativePath(filePath);

        // 更新選擇狀態
        state.selectionState[relativePath] = isSelected;

        // 如果是選中，則展開父資料夾
        if (isSelected) {
            const parts = relativePath.split(/[\/\\]/);
            let parentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
                state.expandedFolders[parentPath] = true;
            }
        }

        // 保存狀態
        await this.updateState(state);

        // 返回更新後的狀態
        return state;
    }

    /**
     * 批量更新檔案選擇狀態
     * @param filePaths 檔案路徑列表
     * @param isSelected 是否選中
     */
    public async selectFilesAndExpandParents(filePaths: string[], isSelected: boolean): Promise<ExplorerState> {
        const state = this.getState();

        for (const filePath of filePaths) {
            const relativePath = vscode.workspace.asRelativePath(filePath);

            // 更新選擇狀態
            state.selectionState[relativePath] = isSelected;

            // 如果是選中，則展開父資料夾
            if (isSelected) {
                const parts = relativePath.split(/[\/\\]/);
                let parentPath = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
                    state.expandedFolders[parentPath] = true;
                }
            }
        }

        // 保存狀態
        await this.updateState(state);

        // 返回更新後的狀態
        return state;
    }

    // --- Snippet Management ---

    /**
     * 添加一個程式碼片段
     * @param snippet 要添加的片段物件
     */
    public async addSnippet(snippet: Snippet): Promise<ExplorerState> {
        const state = this.getState();
        // 確保 snippets 陣列存在
        if (!Array.isArray(state.snippets)) {
            state.snippets = [];
        }
        state.snippets.push(snippet);

        // *** 關鍵：將新片段的 ID 添加到 selectionState 中，標記為選中 ***
        // 注意：這會將檔案路徑和片段 ID 混合在 selectionState 中
        if (!state.selectionState) { // 確保 selectionState 存在
            state.selectionState = {};
        }
        state.selectionState[snippet.id] = true;

        await this.updateState(state);
        return state; // 返回包含新片段且已標記選中的狀態
    }

    /**
     * 根據 ID 移除一個程式碼片段
     * @param snippetId 要移除的片段 ID
     */
    public async removeSnippet(snippetId: string): Promise<ExplorerState> {
        const state = this.getState();
        state.snippets = state.snippets.filter(s => s.id !== snippetId);

        // *** 關鍵：如果片段被移除，也要從 selectionState 中移除其選中標記 ***
        if (state.selectionState) {
            delete state.selectionState[snippetId];
        }

        await this.updateState(state);
        return state;
    }

    /**
     * 根據 ID 獲取一個程式碼片段
     * @param snippetId 片段 ID
     * @returns 片段物件或 undefined
     */
    public getSnippetById(snippetId: string): Snippet | undefined {
        const state = this.getState();
        return state.snippets.find(s => s.id === snippetId);
    }
}