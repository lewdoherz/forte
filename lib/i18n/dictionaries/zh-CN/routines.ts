import type { Messages } from "../../index";

/**
 * Messages for the "routines" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * Typed against `Partial<Messages>`: an unknown or misspelled key is still
 * rejected here, while global completeness is enforced by `zh-CN/index.ts`.
 */
export const routines = {
  "routines.create": "新建训练计划",
  "routines.edit": "编辑训练计划",

  "routines.list.empty": "还没有训练计划。新建一个来安排你的训练。",
  "routines.list.noExercises": "暂无动作",

  "routines.detail.back": "← 训练计划",
  "routines.detail.noExercises": "此训练计划还没有动作。",
  "routines.detail.startWorkout": "开始训练",
  "routines.detail.createdBy": "创建者：{name}",

  "routines.superset": "超级组",
  "routines.supersetBadge": "超级组",

  "routines.summary.title": "训练计划概览",
  "routines.summary.cardTitle": "概览",
  "routines.summary.open": "打开训练计划概览",
  "routines.summary.exercises": "动作数",
  "routines.summary.totalSets": "总组数",
  "routines.summary.estimatedDuration": "预计时长",
  "routines.summary.muscleDistribution": "肌肉分布",
  "routines.summary.empty": "添加动作以查看训练计划涉及的肌肉。",

  "routines.editor.name": "名称",
  "routines.editor.notes": "备注",
  "routines.editor.notesOptional": "备注（选填）",
  "routines.editor.exercises": "动作",
  "routines.editor.library": "动作库",
  "routines.editor.emptyLibraryHint": "从动作库添加动作开始编排。",
  "routines.editor.unknownExercise": "动作",
  "routines.editor.restLabel": "组间休息（{unit}）",
  "routines.editor.setType": "组类型",
  "routines.editor.addSet": "+ 添加一组",
  "routines.editor.removeSet": "移除该组",
  "routines.editor.dragHandle": "拖动以调整动作顺序",
  "routines.editor.dragTitle": "拖动调整顺序",
  "routines.editor.moveUp": "上移动作",
  "routines.editor.moveDown": "下移动作",
  "routines.editor.removeExercise": "移除动作",
  "routines.editor.removeFromSuperset": "取消超级组",
  "routines.editor.groupWithNext": "与下一个动作组成超级组",
  "routines.editor.ungroup": "取消组合",
  "routines.editor.supersetShort": "+超级组",
  "routines.editor.nameRequired": "请输入名称。",

  "routines.setType.warmup": "热身",
  "routines.setType.normal": "常规",
  "routines.setType.failure": "力竭",
  "routines.setType.dropset": "递减组",

  "routines.target.weight": "重量（公斤）",
  "routines.target.reps": "次数",
  "routines.target.duration": "时长（秒）",
  "routines.target.distance": "距离（米）",
  "routines.target.floors": "层数",
  "routines.target.steps": "步数",

  "routines.targetHeading.weight_reps": "重量与次数",
  "routines.targetHeading.bodyweight_reps": "次数",
  "routines.targetHeading.bodyweight_weighted": "附加重量与次数",
  "routines.targetHeading.bodyweight_assisted": "辅助重量与次数",
  "routines.targetHeading.reps_only": "次数",
  "routines.targetHeading.duration": "时长",
  "routines.targetHeading.weight_duration": "重量与时长",
  "routines.targetHeading.distance_duration": "距离与时长",
  "routines.targetHeading.short_distance_weight": "距离与重量",
  "routines.targetHeading.floors_duration": "层数与时长",
  "routines.targetHeading.steps_duration": "步数与时长",

  "routines.shared.heading": "分享的训练计划",
  "routines.shared.noSets": "未设置组。",
  "routines.shared.setColumn": "组",
  "routines.shared.sharedBy": "分享者：{name}",
  "routines.shared.anonymous": "一位 forte 用户",
  "routines.shared.readOnly": "这是他人训练计划的只读视图，无法编辑。",

  "routines.actions": "训练计划操作",
  "routines.duplicate": "复制",
  "routines.duplicating": "复制中…",
  "routines.deleteConfirm": "删除此训练计划？此操作无法撤销。",

  "routines.share.copy": "复制分享链接",
  "routines.share.revoke": "撤销分享链接",
  "routines.share.copied": "公开链接已复制到剪贴板。",
  "routines.share.revoked": "分享链接已撤销。",
  "routines.share.copyFailed": "复制链接失败。",
  "routines.share.createFailed": "创建分享链接失败。",
  "routines.share.revokeFailed": "撤销链接失败。",

  "routines.error.invalidInput": "输入无效。",
  "routines.error.invalidRoutine": "训练计划无效。",
  "routines.error.notFound": "该训练计划已不存在。",
  "routines.error.notAllowedModify": "你没有修改此训练计划的权限。",
  "routines.error.notAllowedDelete": "你没有删除此训练计划的权限。",
  "routines.error.invalidExercise": "有一个或多个动作不可用。",
  "routines.error.saveFailed": "保存训练计划失败。",
  "routines.error.duplicateFailed": "复制训练计划失败。",
  "routines.error.deleteFailed": "删除训练计划失败。",

  "routines.validation.nameRequired": "请输入名称",
  "routines.validation.nameTooLong": "名称过长",
  "routines.validation.weightInvalid": "重量必须为非负数",
} as const satisfies Partial<Messages>;
