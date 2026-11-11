/** Eight intents a coding-session user commonly types next, each with eight fixed replies. */
export interface Mode {
  id: string;
  label: string;
  criteria: string;
  replies: readonly string[];
}

export const MODES: readonly Mode[] = [
  {
    id: "continue",
    label: "继续执行",
    criteria: "Proceed with the current work without new analysis or confirmation.",
    replies: [
      "继续",
      "接着做",
      "按你的建议执行",
      "继续推进，不用等我确认",
      "把这个做完",
      "往下做，遇到阻塞再说",
      "按既定方案继续，完成后再汇报",
      "继续，需要我决定的地方再停",
    ],
  },
  {
    id: "plan",
    label: "先分析再动手",
    criteria: "Analyze, plan, or explain before changing anything.",
    replies: [
      "先分析再动手，别急着改代码",
      "先给方案和风险，我确认后再实现",
      "先梳理现状和不确定点",
      "先说清楚你打算怎么做，再开始",
      "拆成步骤，逐项确认",
      "先定位根因，再决定怎么修",
      "先评估影响范围，再给实施方式",
      "先讲清取舍，再选一个",
    ],
  },
  {
    id: "correct",
    label: "纠偏质疑",
    criteria: "Challenge or correct the assistant's premise, evidence, or conclusion.",
    replies: [
      "不对，先检查你的前提",
      "确定吗？再核实一遍",
      "这不是我要的效果，说明原因",
      "请反驳我，找出我判断里的漏洞",
      "你漏了一个关键约束",
      "先说事实依据，别急着下结论",
      "这个结论证据不足，重新查",
      "停下来，我们把需求重新对齐",
    ],
  },
  {
    id: "simplify",
    label: "简化收敛",
    criteria: "Reduce complexity, over-engineering, or scope.",
    replies: [
      "简化一下，别过度设计",
      "用最小改动实现",
      "去掉不必要的抽象",
      "复用现有结构，不要另起一套",
      "这段太复杂，写直白一点",
      "先做能用的最小版本",
      "别加防御性代码",
      "删掉中间产物，只留最终方案",
    ],
  },
  {
    id: "status",
    label: "进度状态",
    criteria: "Ask about progress, current state, blockers, or remaining work.",
    replies: [
      "做到哪了？一句话说进度",
      "还在跑吗？",
      "先说说当前状态和阻塞",
      "还剩几步，大概多久",
      "卡住了就说，别硬撑",
      "把已完成和未完成列一下",
      "先给我看中间结果",
      "现在什么情况？",
    ],
  },
  {
    id: "verify",
    label: "验证交付",
    criteria: "Require verification, testing, or delivery evidence.",
    replies: [
      "跑一下最小验证",
      "确认原问题已复现并修复",
      "把测试结果贴出来",
      "检查有没有遗漏的调用方",
      "验证完再提交",
      "看实际输出，不要只看类型检查",
      "确认没有引入回归",
      "做完自己 review 一遍",
    ],
  },
  {
    id: "style",
    label: "表达方式",
    criteria: "Change how the answer is written: language, length, or format.",
    replies: [
      "用中文回答",
      "说人话，别绕",
      "简短一点，直接给结论",
      "先给结论，再给依据",
      "别写套话，说重点",
      "用清单列出来",
      "不要重复我说过的话",
      "解释具体一点，给例子",
    ],
  },
  {
    id: "feedback",
    label: "确认反馈",
    criteria: "Acknowledge, approve, thank, or give brief evaluative feedback.",
    replies: [
      "可以，就这样",
      "收到",
      "谢谢，辛苦",
      "这版可以，继续下一步",
      "不错，保持这个方向",
      "没问题，按这个来",
      "这次做得对，记住这个方式",
      "先这样，我看看",
    ],
  },
];

/** The single closed-set question sent to JEV: one option per mode. */
export const QUESTION = {
  id: "next_request",
  instructions: "Which single request is the user most likely to type next, given this coding session?",
  criteria: Object.fromEntries(MODES.map((mode) => [mode.id, mode.criteria])),
};
