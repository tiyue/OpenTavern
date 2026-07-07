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
