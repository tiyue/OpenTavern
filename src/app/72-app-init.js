/**
 * 新手导读（文件：72-app-init.js）
 *
 * 负责什么：这是“应用启动流程”中的“应用、初始化”部分。
 * 在程序中的位置：它按顺序准备存储、状态、界面和后台任务，最终让页面可交互。
 * 从哪里开始看：主要从 `init(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：启动步骤存在先后依赖，不能在状态加载完成前渲染依赖用户数据的界面。
 */
// ==================== Initialize ====================
async function init() {
    cacheDom();
    await initializeStorageAndState();
    bindEvents();
    applyInitialLanguageState();
    applyTranslations();
    renderAll();
    showInitialLibraryView();
    updateStartupInputAvailability();
    migrateActiveConversationFirstMessage();
    scheduleAnnouncementModal();
}

installAppDebugGlobals();
startApp();
