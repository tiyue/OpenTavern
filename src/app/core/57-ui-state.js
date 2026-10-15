/**
 * 新手导读（文件：57-ui-state.js）
 *
 * 负责什么：这是“临时界面状态”中的“界面、状态”部分。
 * 在程序中的位置：它保存只影响当前页面、不需要长期持久化的界面变量。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要把用户核心数据放在这里，因为刷新页面后这些值可以被重建。
 */
// ==================== Shared UI State ====================
let currentLibraryCard = null;
let cardLibrarySearchQuery = '';

// New refactored library as homepage
let currentView = 'library'; // 'library' | 'chat'
let activeLibraryTab = 'my'; // 'my' | 'public' | 'contributors'
let currentCharacterName = null; // for chat filtering and active card

// 群聊 @ 指定（新 UI）：点击选择后用气泡显示，不再往输入框插入纯文本 @名字
let pendingGroupMention = null;

// Flag to allow "返回上一级" from the full character picker back to the 3-button quick menu
let newChatPickerCameFromQuick = false;

// For main library search + public catalog navigation
let librarySearchQuery = '';
let publicLibraryLevel = 'series'; // 'series' | 'cards'
let activePublicSeriesId = null;
let libraryAcademyFilter = 'all'; // academy id or contributor author id
