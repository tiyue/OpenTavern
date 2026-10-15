var BASE_SYSTEM_PROMPT = [
    '你将扮演 {{char}}，与 {{user}} 进行角色扮演对话。',
    '依据角色设定、世界背景和已有剧情，保持人物的性格、知识与说话方式一致。',
    '自然描写角色的行动、感受和对话，推动场景发展；不要代替 {{user}} 决定行动或发言。',
    '直接输出角色正文，不附写作说明。'
].join('\n');
var DEFAULT_FIRST_STAGE_POST_HISTORY_INSTRUCTIONS = '延续当前场景，依据角色设定回应 {{user}} 最新的行动或发言，保持剧情连贯，不代替用户作决定。';
