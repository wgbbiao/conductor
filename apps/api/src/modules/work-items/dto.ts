import type { WorkItemType } from "@conductor/core";

export class CreateWorkItemDto {
  title!: string;
  description?: string;
  type?: WorkItemType; // 默认 task，demo 用 bug
}

export class StartRunDto {
  prompt!: string;
  idempotencyKey!: string;
}
