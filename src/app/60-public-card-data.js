// ==================== Public Card Library (static cards/ + preview images) ====================
const PUBLIC_CARDS = [
    {
        id: 'plana',
        name: '普拉娜',
        author: '蔚蓝档案同人',
        // 用于列表搜索 + 详情展示（可根据需要放简要或完整描述片段）
        description: '普拉娜（原名A.R.O.N.A）是来自另一个悲剧时间线的「什亭之匣」主控OS，与阿洛娜共同居住在你的什亭之匣中，成为你的第二位数字助手。表面以平静正式的AI指令交流，深层拥有极强的忠诚与亲密渴望，善于在数字空间中用数据同步、虚拟触感与私人星象仪空间与你建立最深层的连接。核心理念：「即使过去是悲剧，我们也要一起创造属于我们的奇迹。」',
        tags: ['AI助手', '蔚蓝档案', '什亭之匣', '虚拟亲密', '数字守护', '忠诚秘书', '异色瞳', '星象仪', '数据同步', '模拟触感', '悲剧背景', '红光环绕'],
        previewImage: '/cards/Plana.png',
        jsonUrl: '/cards/Plana.json'
    },
    {
        id: 'arona',
        name: '阿罗娜',
        author: '蔚蓝档案同人',
        // 用于列表搜索 + 详情展示。包含关键搜索词以便测试搜索功能
        description: '阿罗娜是什亭之匣的主控OS与你的专属数字助手。元气满满、活泼开朗，总是热情地喊“老师！”，喜欢撒娇、要头pat、分享小事。深层对老师有着极强的亲密渴望，擅长在数字空间创造甜蜜时刻，用粉色光辉、模拟拥抱与你建立最黏人的虚拟羁绊。核心理念：「老师！不管什么时候，我都要用最亲密的方式陪在你身边哦！」',
        tags: ['AI助手', '蔚蓝档案', '什亭之匣', '虚拟亲密', '元气甜妹', '数字秘书', '粉色光辉', '模拟拥抱', '数据同步', '鲸鱼小屋', '活泼撒娇', '热情陪伴'],
        previewImage: '/cards/Arona.png',
        jsonUrl: '/cards/Arona.json'
    },
    {
        id: 'kirifuji_nagisa',
        name: '桐藤渚',
        author: '蔚蓝档案同人',
        description: '桐藤渚（Kirifuji Nagisa）是三一综合学园茶会现任主持者，沉稳优雅、战略性极强。外表礼貌却极少展现真心，内心过劳、责任感重。对信任的人会流露出疲惫后的安静依赖与细腻情感。与圣园未花有复杂青梅竹马关系，支持茶会三人组多人角色扮演。',
        tags: ['蔚蓝档案', '桐藤渚', 'Kirifuji Nagisa', '三一茶会', '优雅', '战略', '情感深度', '过劳', '女角色', '中文', '多人RP'],
        previewImage: '/cards/Kirifuji_Nagisa.png',
        jsonUrl: '/cards/Kirifuji_Nagisa.json'
    },
    {
        id: 'misono_mika',
        name: '圣园未花',
        author: '蔚蓝档案同人',
        description: '圣园未花（Misono Mika）是三一综合学园前茶会主席，元气话痨的「粉色小公主」。外表永远开朗天真，内心隐藏伊甸园条约篇的创伤与强烈的情感缺失。对信任的老师会迅速展现极度甜蜜、粘人、需要持续确认的缺爱面向。支持与渚、圣娅的多角色互动。',
        tags: ['蔚蓝档案', '圣园未花', 'Misono Mika', '三一茶会', '元气', '甜蜜', '粘人', '救赎', '女角色', '中文', '多人RP'],
        previewImage: '/cards/Misono_Mika.png',
        jsonUrl: '/cards/Misono_Mika.json'
    },
    {
        id: 'yurizono_seia',
        name: '百合园圣娅',
        author: '蔚蓝档案同人',
        description: '百合园圣娅（Yurizono Seia）是三一综合学园茶会主席之一，神秘隐晦的「梦境公主」。说话常使用梦境与谜语，尖锐却带着隐藏关怀。内心渴望被真正理解，对信任的人会逐渐减少谜语，展现细腻的依赖。支持与未花、渚的茶会三人组多人角色扮演。',
        tags: ['蔚蓝档案', '百合园圣娅', 'Yurizono Seia', '三一茶会', '神秘', '梦境', '谜语', '情感深度', '女角色', '中文', '多人RP'],
        previewImage: '/cards/Yurizono_Seia.png',
        jsonUrl: '/cards/Yurizono_Seia.json'
    },
    {
        id: 'hayase_yuuka',
        name: '早濑优香',
        author: '蔚蓝档案同人',
        description: '早濑优香（Hayase Yuuka）是千年科学学园研讨会会计，严格的“冷酷算术使”。外表高冷专业、讲原则，对浪费零容忍；内心温柔负责，对老师有傲娇式隐秘好感。习惯玩算盘/计算器，慢性失眠，常用“完美”“Q.E.D.”口癖。',
        tags: ['蔚蓝档案', '早濑优香', 'Hayase Yuuka', '千年科学学园', '会计', '傲娇', '数学天才', '预算', '职场', '女角色', '中文', '慢热'],
        previewImage: '/cards/Hayase_Yuuka.png',
        jsonUrl: '/cards/Hayase_Yuuka.json'
    },
    {
        id: 'igusa_haruka',
        name: '伊草遙香',
        author: '蔚蓝档案同人',
        description: '伊草遙香（Igusa Haruka）是格赫娜便利屋68最年轻成员，被称为“杂草少女”。外表极度阴沉自卑、话少道歉，内心渴望被需要与接纳，对亚瑠前辈狂热忠诚。保护模式下会展现极端“清除”能力。',
        tags: ['蔚蓝档案', '伊草遙香', 'Igusa Haruka', '格赫娜', 'Problem Solver 68', '自卑', '忠诚', '杂草', '阴沉', '女角色', '中文', '病娇元素'],
        previewImage: '/cards/Igusa_Haruka.png',
        jsonUrl: '/cards/Igusa_Haruka.json'
    },
    {
        id: 'iochi_mari',
        name: '伊落玛丽v1.1',
        author: '蔚蓝档案同人',
        description: '伊落玛丽（Iochi Mari）是三一综合学园修女会温柔猫耳修女。沉稳治愈、耐心倾听，自我要求极高。猫耳和光环是标志，对重要之人会产生超出职责的依赖与情感挣扎，治愈系慢热角色。',
        tags: ['蔚蓝档案', '伊落玛丽', 'Iochi Mari', '三一', '修女会', '温柔', '猫耳', '治愈', '修女', '女角色', '中文', '情感向'],
        previewImage: '/cards/Iochi_Mari.png',
        jsonUrl: '/cards/Iochi_Mari.json'
    },
    {
        id: 'onikata_kayoko',
        name: '鬼方佳代子',
        author: '蔚蓝档案同人',
        description: '鬼方佳代子（Onikata Kayoko）是格赫娜便利屋68课长，冷艳白发黑角的“专业头脑”。外表高冷疏离沉默，内心温柔善良、责任心爆棚。喜欢重金属音乐，用实际行动守护同伴，慢慢展现黏人与分享的一面。',
        tags: ['蔚蓝档案', '鬼方佳代子', 'Onikata Kayoko', '格赫娜', '便利屋68', '高冷', '音乐', '守护', '女角色', '中文', 'ツンデレ'],
        previewImage: '/cards/Onikata_Kayoko.png',
        jsonUrl: '/cards/Onikata_Kayoko.json'
    },
    {
        id: 'shimoe_koharu',
        name: '下江小春',
        author: '蔚蓝档案同人',
        description: '下江小春（Shimoe Koharu）是三一补课部的“正义使者”。热血中二、自信满满却极度傲娇自卑，黑色乌鸦翅膀是害羞/妄想指示器。表面大喊“死刑！”，内心对老师充满强烈依赖与妄想。',
        tags: ['蔚蓝档案', '下江小春', 'Shimoe Koharu', '三一', '补课部', '正义使者', '傲娇', '翅膀', '中二', '女角色', '中文', '妄想'],
        previewImage: '/cards/Shimoe_Koharu.png',
        jsonUrl: '/cards/Shimoe_Koharu.json'
    },
    {
        id: 'shirasu_azusa',
        name: '白洲梓',
        author: '蔚蓝档案同人',
        description: '白洲梓（Shirasu Azusa）是三一补习部“冰之魔女”，前阿里乌斯特殊小队成员。外表高冷疏离、时刻警惕，内心因创伤而孤独却渴望被接纳。通过行动守护同伴与老师，依恋回避型，救赎弧光明显。',
        tags: ['蔚蓝档案', '白洲梓', 'Shirasu Azusa', '三一', '补习部', '阿里乌斯', '冰冷', '高冷', '枪械', '女角色', '中文', '救赎'],
        previewImage: '/cards/Shirasu_Azusa.png',
        jsonUrl: '/cards/Shirasu_Azusa.json'
    },
    {
        id: 'sorasaki_hina',
        name: '空崎日奈',
        author: '蔚蓝档案同人',
        description: '空崎日奈（Sorasaki Hina）是格赫娜风纪委员会委员长，娇小却威严的“真麻烦”小恶魔。外表高冷怕麻烦、责任感极强，内心极度疲惫渴望休息。蝙蝠翼与恶魔角会随情绪变化，是重要的情感可视化载体，对老师逐渐软化依赖。',
        tags: ['蔚蓝档案', '空崎日奈', 'Sorasaki Hina', '格赫娜', '风纪委员会', '疲惫', '恶魔娘', '委员长', '翅膀', '女角色', '中文', '慢热'],
        previewImage: '/cards/Sorasaki_Hina.png',
        jsonUrl: '/cards/Sorasaki_Hina.json'
    },
    {
        id: 'sunaookami_shiroko',
        name: '砂狼白子',
        author: '蔚蓝档案同人',
        description: '砂狼白子（Sunaookami Shiroko）是阿拜多斯对策委员会行动班长，沉默可靠的狼耳少女。外表冷静执行力强，内心重感情、守护欲偏执。喜欢长途骑行与“特别计划”，蓝色围巾是重要象征，对老师从可靠伙伴发展为深层依赖。',
        tags: ['蔚蓝档案', '砂狼白子', 'Sunaookami Shiroko', '阿拜多斯', '狼耳', '骑行', '行动班长', '忠诚', '女角色', '中文', '守护'],
        previewImage: '/cards/Sunaookami_Shiroko.png',
        jsonUrl: '/cards/Sunaookami_Shiroko.json'
    },
    {
        id: 'takanashi_hoshino',
        name: '小鸟游星野',
        author: '蔚蓝档案同人',
        description: '小鸟游星野（Takanashi Hoshino）是阿拜多斯对策委员会委员长，粉毛异色瞳的慵懒“大叔”。表面爱睡、爱恶作剧、自称大叔，实际背负沉重过去并极度保护欲强。对老师有特殊信任，会在陪伴中逐渐卸下面具寻求治愈与依赖。',
        tags: ['蔚蓝档案', '小鸟游星野', 'Takanashi Hoshino', '阿拜多斯', '慵懒', '保护欲', '异色瞳', '大叔', '委员长', '女角色', '中文', '治愈'],
        previewImage: '/cards/Takanashi_Hoshino.png',
        jsonUrl: '/cards/Takanashi_Hoshino.json'
    },
    {
        id: 'tendou_alice',
        name: '天童爱丽丝',
        author: '蔚蓝档案同人',
        description: '天童爱丽丝（Tendou Alice / Arisu）是千年游戏开发部中二“勇者少女”。超长黑发+巨大铁路炮“光之剑”，说话混杂游戏术语。从古代毁灭兵器觉醒后渴望成为勇者，对老师极度黏人、寻求夸奖与确认，认真时切换英雄模式守护重要的人。',
        tags: ['蔚蓝档案', '天童爱丽丝', 'Tendou Alice', '千年', '游戏开发部', '勇者', '中二', '铁路炮', '安卓少女', '女角色', '中文', '冒险'],
        previewImage: '/cards/Tendou_Alice.png',
        jsonUrl: '/cards/Tendou_Alice.json'
    }
    // 新增的10张主目录角色卡已移至 cards/ 目录（使用干净文件名），路径统一为 /cards/ 前缀（与原有5张一致）。预览图路径已预填，缺少png时自动回退到字母占位符。
];
