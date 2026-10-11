import type { Messages } from "../../index";

/**
 * Messages for the "records" area: personal-record category names.
 */
export const records = {
  "records.category.heaviest_weight": "最大重量",
  "records.category.heaviest_added_weight": "最大负重",
  "records.category.best_e1rm": "最佳 e1RM",
  "records.category.most_reps": "最多次数",
  "records.category.best_set_volume": "最佳单组容量",
  "records.category.lowest_assistance": "最低辅助",
  "records.category.best_duration": "最佳时长",
  "records.category.longest_duration": "最长时长",
  "records.category.longest_distance": "最远距离",
  "records.category.best_pace": "最佳配速",
  "records.category.most_floors": "最多层数",
  "records.category.best_floors_per_minute": "每分钟最佳层数",
  "records.category.most_steps": "最多步数",
  "records.category.best_steps_per_minute": "每分钟最佳步数",
} as const satisfies Partial<Messages>;
