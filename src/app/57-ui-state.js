// ==================== Shared UI State ====================
let currentLibraryCard = null;
let cardLibrarySearchQuery = '';

// New refactored library as homepage
let currentView = 'library'; // 'library' | 'chat'
let activeLibraryTab = 'my'; // 'my' | 'public'
let currentCharacterName = null; // for chat filtering and active card

// 群聊 @ 指定（新 UI）：点击选择后用气泡显示，不再往输入框插入纯文本 @名字
let pendingGroupMention = null;

// Flag to allow "返回上一级" from the full character picker back to the 3-button quick menu
let newChatPickerCameFromQuick = false;

// For main library search + filter (moved from old left sidebar library)
let librarySearchQuery = '';
let libraryFilter = 'all'; // 'all' | 'male' | 'female'
