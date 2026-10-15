/**
 * 新手导读（文件：34-state-init.js）
 *
 * 负责什么：这是“应用状态初始化”中的“状态、初始化”部分。
 * 在程序中的位置：它读取保存的数据、修复旧格式，并保证至少有一个可用会话。
 * 从哪里开始看：主要从 `initState(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化发生在界面可用之前，异常必须转成安全默认状态而不是中断启动。
 */
// 状态初始化入口：加载持久化数据、规范化旧快照并建立首个可用会话。
/**
 * 启动时把“硬盘中的旧数据”恢复成“程序现在可以使用的内存状态”。
 *
 * 输入：无。数据由 StorageService 从浏览器存储中读取。
 * 返回：Promise<void>。因为读取存储是异步操作，调用者必须等待它完成再渲染界面。
 *
 * 执行顺序：
 * 1. 读取最合适的已保存快照，并记录是否发生过存储迁移。
 * 2. 把快照字段复制进全局 state，同时记录实际使用的存储后端。
 * 3. 为旧版本缺失的设置补默认值，并应用主题、API Key 保存策略等启动选项。
 * 4. 迁移角色注册表，确保当前会话有效，最后记录云同步比较基线。
 *
 * 这个顺序不能随意交换：例如还没恢复会话就计算云同步基线，会把空状态误认为最新数据。
 */
async function initState() {
    var migrationResult = { backend: 'opfs', attempted: false, success: false };
    var saved = await loadInitialStateSnapshot();

    applySavedStateSnapshot(saved);
    logInitialStateLoadResult(saved, migrationResult);

    migrationResult.backend = StorageService.getBackend();
    state._storageMigration = migrationResult;

    ensureStateSettingDefaults();
    applyStartupUiPreferences();
    applyApiKeyPersistencePolicy();
    Object.values(state.conversations || {}).forEach(normalizeConversation);
    migrateCharacterRegistryOnStartup();
    ensureActiveConversationOnStartup();
    if (typeof syncActiveConversationUserPersona === 'function') syncActiveConversationUserPersona();
    if (typeof rememberCloudSyncConversationBaseline === 'function') {
        rememberCloudSyncConversationBaseline();
    }
}
