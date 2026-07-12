/**
 * 新手导读（文件：42-worldbook-entry-defaults.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书、条目、默认值”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `createDefaultWIEntryExtensions(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== World Info Entry Extension Defaults ====================
function createDefaultWIEntryExtensions() {
    return {
        position: WI_POS.AFTER_CHAR,
        depth: 4,
        role: WI_ROLE.SYSTEM,
        probability: 100,
        useProbability: true,
        outlet_name: '',
        group: '',
        group_override: false,
        group_weight: 100,
        scan_depth: null,
        case_sensitive: null,
        match_whole_words: null,
        use_group_scoring: false,
        automation_id: '',
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        exclude_recursion: false,
        prevent_recursion: false,
        delay_until_recursion: false,
        match_persona_description: false,
        match_character_description: false,
        match_character_personality: false,
        match_character_depth_prompt: false,
        match_scenario: false,
        match_creator_notes: false,
        triggers: [],
        ignore_budget: false
    };
}
