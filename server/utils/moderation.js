// 使用DeepSeek API进行内容审查
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "sk-932bbf2b5ce64c4f92fbaeb9117436f8";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

/**
 * 内容审核函数 - 增强版本
 * @param {string} content - 需要审核的内容
 * @param {string} contentType - 内容类型: 'post' 或 'comment'
 * @returns {Promise<string>} - 返回 'Published' 或 'PendingReview'
 */
async function moderateContent(content, contentType = 'post') {
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === "sk-932bbf2b5ce64c4f92fbaeb9117436f8") {
        console.warn("DeepSeek API key not configured or using default. Using quick content check.");
        return quickContentCheck(content);
    }
    
    // 首先使用快速检查
    const quickResult = quickContentCheck(content);
    if (quickResult === 'Published') {
        console.log("快速检查通过，内容可直接发布");
        return 'Published';
    }
    
    console.log("快速检查未通过，进行AI深度审核...");
    
    try {
        const systemPrompt = `你是一个物理学习论坛的内容审核助手。请严格分析以下内容是否符合学术论坛规范：

审核标准：
1. 是否包含骚扰、仇恨言论、人身攻击或不文明用语（如脏话、侮辱性词汇）
2. 是否包含与物理学习无关的垃圾信息、广告或推广内容
3. 是否涉及学术不端行为（如要求提供考试答案、作业代写等）
4. 是否包含过度娱乐化、不严肃的内容（如"膜拜巨佬"等过度吹捧）
5. 是否包含政治敏感、违法违规内容
6. 是否包含可能破坏学术氛围的网络流行语或非正式表达
7. 是否包含个人信息泄露风险的内容

特别注意拦截以下内容：
- 任何形式的脏话、粗俗语言（如FUCK、傻逼等）
- 过度娱乐化的表达（如"膜拜巨佬"、"666"等）
- 与物理学习完全无关的闲聊、灌水
- 任何形式的广告、推广信息
- 涉及考试作弊、作业代写的内容

请只回复"APPROVE"或"REVIEW"，不需要其他解释：
- 如果内容专业、严肃、符合学术规范，回复"APPROVE"
- 如果内容可能违反上述任何一条规则，回复"REVIEW"`;

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: content.substring(0, 4000) // 限制长度
                    }
                ],
                temperature: 0.1,
                max_tokens: 10
            })
        });

        if (!response.ok) {
            console.error(`API请求失败，状态码: ${response.status}`);
            throw new Error(`API请求失败，状态码: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices[0].message.content.trim();
        
        console.log("DeepSeek审核结果:", result);
        
        if (result === "APPROVE") {
            return "Published";
        } else {
            return "PendingReview";
        }
    } catch (error) {
        console.error("内容审核失败:", error);
        // 如果API调用失败，将内容标记为待审核以确保安全
        return "PendingReview";
    }
}

/**
 * 批量审核内容
 * @param {Array} contents - 内容数组，每个元素为 {content: string, type: string}
 * @returns {Promise<Array>} - 审核结果数组
 */
async function moderateContents(contents) {
    const results = [];
    
    for (const item of contents) {
        try {
            const result = await moderateContent(item.content, item.type);
            results.push({
                content: item.content,
                type: item.type,
                status: result
            });
        } catch (error) {
            console.error(`审核内容失败: ${item.content.substring(0, 50)}...`, error);
            results.push({
                content: item.content,
                type: item.type,
                status: "PendingReview"
            });
        }
    }
    
    return results;
}

/**
 * 快速内容检查（本地规则，不调用API）
 * @param {string} content - 需要检查的内容
 * @returns {string} - 返回 'Published' 或 'PendingReview'
 */
function quickContentCheck(content) {
    const blockedPatterns = [
        /fuck|shit|damn|asshole/i, // 英文脏话
        /傻逼|操|妈的|日|狗屁|放屁/i, // 中文脏话
        /膜拜|巨佬|666|yyds/i, // 过度娱乐化
        /代写|代考|作弊|助攻/i, // 学术不端
        /微信|电话|手机号|\d{11}/, // 个人信息
        /广告|推广|加群|扫码/i // 广告
    ];
    
    for (const pattern of blockedPatterns) {
        if (pattern.test(content)) {
            console.log("快速检查发现违规内容:", pattern);
            return "PendingReview";
        }
    }
    
    return "Published";
}

// 添加审核API路由
const express = require('express');
const moderationRouter = express.Router();

moderationRouter.post('/moderate', async (req, res) => {
    const { content } = req.body;
    
    if (!content) {
        return res.status(400).json({ error: '内容不能为空' });
    }
    
    try {
        const status = await moderateContent(content);
        res.json({ 
            success: true,
            status: status,
            message: status === 'Published' ? '内容审核通过' : '内容需要人工审核'
        });
    } catch (error) {
        console.error('审核API错误:', error);
        res.status(500).json({ 
            success: false,
            error: '审核服务暂时不可用',
            status: 'PendingReview' // 失败时默认设为待审核
        });
    }
});

module.exports = {
    moderateContent,
    moderateContents,
    quickContentCheck,
    moderationRouter
};