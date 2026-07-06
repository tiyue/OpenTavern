// ==================== Auto Summarization Runtime ====================
function isUnderContextPressure(messageCount) {
    var contextMax = state.settings.contextLength || 20;
    return messageCount > contextMax;
}

/**
 * 自动总结核心逻辑（修复版 - 批次大小现在会随阈值变化）
 *
 * 问题根因（已修复）：
 * - 原来 targetKeep ≈ threshold*0.65 + 小 buffer=2 ，触发条件很容易让 "本次要总结的条数" 刚好落在 <4 guard 上。
 * - 硬编码 if (toSummarize.length < 4) 导致无论用户把阈值设成 10 / 20 / 50 ，每次自动总结都只处理 4 条消息。
 * - 批次太小 + 频繁触发，体验很差。
 *
 * 新逻辑：
 * - 触发阈值更直接：当未总结的尾部长度超过 threshold 的一定比例 + 一个随阈值缩放的 minBatch 时才触发。
 * - minBatch 随用户阈值变化（小阈值给 6+，大阈值给更多），确保总结的“消息数量”不再固定为 4。
 * - 仍然会把尾部裁到合理的 targetKeep 附近，而不是一次吃太多。
 * - 兜底条件保留（用于中途改阈值场景）。
 */
function autoSummarize() {
    if (!state.settings.summaryEnabled) return;

    var conv = getActiveConv();
    if (!conv) return;

    var allRegular = conv.messages.filter(function(m) { return m.role !== 'system'; });
    if (allRegular.length < 6) return;

    var threshold = state.settings.summaryThreshold || 12;

    // === 主路径：轻量计算（基于历史总结的 lastCovered）===
    var lastCovered = getMaxSummaryCoveredEnd(conv.summaries || []);
    var currentVisibleCount = Math.max(0, allRegular.length - lastCovered - 1);

    // 目标：总结后保留的最近原始消息条数（随阈值缩放，但基数较低，确保批次大小会随阈值明显变化）
    // 调低系数后，即使走 fallback 路径， batch ≈ threshold - targetKeep 也会是合理大小（而非固定4）
    var targetKeep = Math.max(4, Math.floor(threshold * 0.38));

    // 最小总结批次大小：随阈值缩放（小阈值至少5-6条，大阈值给更多）
    // 例如：阈值=10 → ~5-6；12→~6-7；20→~8-10；30→~12；50→~18+
    var minSummarizeBatch = Math.max(5, Math.floor(threshold * 0.38));

    var shouldSummarize = false;

    // 主条件：未总结尾部明显超过 (保留量 + 最小批次)，才值得做一次像样的总结
    if (currentVisibleCount > targetKeep + minSummarizeBatch) {
        shouldSummarize = true;
    }

    // 兜底条件（中途修改阈值后、或 context 压力下强制检查）
    // 使用 getActualVisibleCountForSummary() 尽量贴近用户在 token bar 看到的数字
    if (!shouldSummarize) {
        var actualVisible = getActualVisibleCountForSummary();
        if (actualVisible >= threshold) {
            shouldSummarize = true;
        }
    }

    if (!shouldSummarize) {
        return;
    }

    // 计算本次要覆盖的结束位置：让未总结的尾部只剩下 targetKeep 条左右
    var newCoveredEnd = allRegular.length - targetKeep - 1;

    if (newCoveredEnd <= lastCovered) return;

    var toSummarize = allRegular.slice(lastCovered + 1, newCoveredEnd + 1);

    // 安全兜底（正常情况下因为触发条件 + 调参，长度会明显大于 4）
    if (toSummarize.length < 5) return;

    performSummarization(toSummarize, lastCovered + 1, newCoveredEnd, function() {
        renderTokenBar();
    });
}

// 辅助函数：获取当前所有总结中最大的 coveredEnd
function getMaxSummaryCoveredEnd(summaries) {
    var max = -1;
    if (!summaries || summaries.length === 0) return max;

    summaries.forEach(function(s) {
        if (typeof s.coveredEnd === 'number' && s.coveredEnd > max) {
            max = s.coveredEnd;
        }
    });
    return max;
}

/**
 * 轻量版“当前实际可见消息数”计算（用于自动总结兜底判断）
 * 
 * 目的：
 * - 尽量接近用户在界面底部看到的 “Context: X msgs” 数字
 * - 比 buildMessagesForAPI() 轻很多（不构建完整 system prompt、世界书、群聊逻辑）
 * - 解决“中途修改总结阈值后，即使界面显示数字很高也完全不触发”的问题
 */
function getActualVisibleCountForSummary() {
    var conv = getActiveConv();
    if (!conv) return 0;

    var regularMsgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    var lastCovered = getMaxSummaryCoveredEnd(conv.summaries || []);

    // 先按历史总结裁剪
    var visible = (lastCovered >= 0)
        ? Math.max(0, regularMsgs.length - lastCovered - 1)
        : regularMsgs.length;

    // 再模拟 buildMessagesForAPI 里的 contextLength 硬截断（用户实际看到的就是这个数字）
    var max = state.settings.contextLength || 20;
    if (visible > max) {
        visible = max;
    }
    return visible;
}
