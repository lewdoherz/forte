import type { Messages } from "../../index";

/**
 * Messages for the "exercises" area: the library panel, its filter, the
 * create/edit form and the body heatmap.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`.
 *
 * The per-`ExerciseType` labels are not here: `lib/exercise-types.ts` owns them
 * (over the `metrics` area's keys), so a persisted code and its wording stay in
 * one place.
 */
export const exercises = {
  "exercises.select.title": "选择动作",
  "exercises.select.description": "点击动作即可查看其统计数据。",

  "exercises.library.title": "动作库",
  "exercises.library.ariaLabel": "动作库",
  "exercises.library.newExercise": "+ 自定义动作",
  "exercises.library.customBadge": "自定义",
  "exercises.library.empty": "未找到动作。",

  "exercises.picker.emptyFiltered": "没有符合条件的动作。",
  "exercises.picker.empty": "暂无可选动作。",

  "exercises.filter.searchLabel": "搜索动作",
  "exercises.filter.allEquipment": "全部器械",
  "exercises.filter.allMuscles": "全部肌群",

  "exercises.field.image": "添加图片",
  "exercises.field.name": "动作名称",
  "exercises.field.type": "动作类型",
  "exercises.field.durationRecord": "时长记录",
  "exercises.field.equipment": "器械",
  "exercises.field.muscle": "肌群",
  "exercises.field.primaryMuscle": "主要肌群",
  "exercises.field.secondaryMuscles": "其他肌群",
  "exercises.field.howTo": "动作要领",

  "exercises.form.imageHint": "该动作图片的链接。留空则不显示图片。",
  "exercises.form.durationRecordHint": "哪种计时成绩计为记录。仅影响以时长计量的动作。",
  "exercises.form.selectEquipment": "选择器械",
  "exercises.form.selectMuscle": "选择肌群",

  "exercises.durationDirection.higher": "时间越长越好",
  "exercises.durationDirection.lower": "时间越短越好",
  "exercises.durationDirection.none": "不计时长记录",

  "exercises.create.title": "创建动作",
  "exercises.edit.title": "编辑动作",

  "exercises.delete.confirm": "删除该动作？此操作无法撤销。",

  /* Zod and server-action messages. They reach the form as `state.error`, so
     they belong to the area that renders them. */
  "exercises.validation.titleRequired": "请填写动作名称",
  "exercises.validation.titleTooLong": "动作名称过长",
  "exercises.validation.primaryMuscleRequired": "请选择主要肌群",
  "exercises.validation.equipmentRequired": "请选择器械",
  "exercises.validation.secondaryMusclesTooMany": "选择的其他肌群过多",
  "exercises.validation.howToTooLong": "动作要领过长",
  "exercises.validation.imageUrlTooLong": "图片链接过长",
  "exercises.validation.imageUrlInvalid": "请输入有效的图片链接",

  "exercises.error.invalidInput": "输入无效。",
  "exercises.error.invalidExercise": "动作无效。",
  "exercises.error.createFailed": "创建动作失败。",
  "exercises.error.updateFailed": "更新动作失败。",
  "exercises.error.notAuthorized": "你没有编辑该动作的权限。",

  "exercises.heatmap.front": "正面",
  "exercises.heatmap.back": "背面",
  "exercises.heatmap.empty": "暂无肌群数据。",
} as const satisfies Partial<Messages>;
