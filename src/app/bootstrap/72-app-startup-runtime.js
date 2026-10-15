/**
 * 新手导读（文件：72-app-startup-runtime.js）
 *
 * 负责什么：这是“应用启动流程”中的“应用、启动、运行流程”部分。
 * 在程序中的位置：它按顺序准备存储、状态、界面和后台任务，最终让页面可交互。
 * 从哪里开始看：主要从 `installAppDebugGlobals(无参数)`、`refreshStartupStorageStatus(无参数)`、`runFallbackInitialization(err)`、`startApp(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：启动步骤存在先后依赖，不能在状态加载完成前渲染依赖用户数据的界面。
 */
// ==================== App Startup Runtime ====================
function installAppDebugGlobals() {
    window.debugStorage = async function() {
        var info = await StorageService.getStorageInfo();
        console.log('[Storage Debug]', { backend: StorageService.getBackend(), ...info });
        return info;
    };
}

function refreshStartupStorageStatus() {
    if (typeof updateStorageInfo === 'function') {
        updateStorageInfo();
    } else if (typeof updateStorageStatusUI === 'function') {
        updateStorageStatusUI();
    }
}

function runFallbackInitialization(err) {
    console.error('[App] Initialization failed:', err);
    try {
        cacheDom();
        bindEvents();
        if (typeof updateStorageStatusUI === 'function') {
            updateStorageStatusUI();
        }
    } catch (e) {
        console.error('Fallback initialization failed:', e);
    }
}

/**
 * 页面脚本加载完毕后的最终启动入口。
 *
 * init() 会依次准备存储、恢复状态、缓存 DOM、绑定事件并首次渲染。成功后刷新存储状态并按需
 * 提醒用户备份；失败则进入 runFallbackInitialization()，尽量让基础界面和事件仍可使用，
 * 同时把原始错误保留在控制台供排查。这里不返回给业务层结果，启动由 Promise 回调继续推进。
 */
function startApp() {
    init().then(function() {
        refreshStartupStorageStatus();
        showBackupReminderIfNeeded();
        startLocalResourceManager();
    }).catch(runFallbackInitialization);
}

// 启动完成后异步安装/检查本地资源与后台更新，不 await 远端清单，也不阻塞本地界面。
function startLocalResourceManager() {
    if (typeof LocalResourceManager === 'undefined' || !LocalResourceManager) return;
    try {
        Promise.resolve(LocalResourceManager.start()).catch(function(error) {
            console.warn('[Offline] 本地资源管理启动失败（不影响联机使用）:', error);
        });
    } catch (error) {
        console.warn('[Offline] 本地资源管理启动异常（不影响联机使用）:', error);
    }
}
