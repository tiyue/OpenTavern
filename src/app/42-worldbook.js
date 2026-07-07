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
