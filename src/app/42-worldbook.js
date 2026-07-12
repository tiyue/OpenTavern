/**
 * 新手导读（文件：42-worldbook.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `createDefaultWIEntry(uid)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== World Info (World Book) Entry Defaults ====================
// Full SillyTavern-compatible implementation (all documented fields supported in UI + core activation)

function createDefaultWIEntry(uid) {
    uid = uid != null ? uid : Date.now();
    return {
        uid: uid,
        key: [],
        keysecondary: [],
        comment: 'New Entry ' + uid,
        content: '',
        constant: false,
        vectorized: false,
        selective: true,
        selectiveLogic: 0,           // 0=AND ANY, 1=AND ALL, 2=NOT ANY, 3=NOT ALL
        order: 100,
        position: WI_POS.AFTER_CHAR,
        disable: false,
        ignoreBudget: false,
        excludeRecursion: false,
        preventRecursion: false,
        delayUntilRecursion: false,
        probability: 100,
        useProbability: true,
        depth: 4,
        outletName: '',
        group: '',
        groupOverride: false,        // prioritize inclusion
        groupWeight: 100,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: false,
        automationId: '',
        role: WI_ROLE.SYSTEM,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        triggers: [],
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario: false,
        matchCreatorNotes: false,
        characterFilter: { isExclude: false, names: [], tags: [] },
        extensions: createDefaultWIEntryExtensions()
    };
}
