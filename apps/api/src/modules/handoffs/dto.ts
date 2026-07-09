/** 审批复议入参。decidedBy 不在此处，改由 JWT 守卫注入的 req.user.userId（P1.5 对齐） */
export class DecideHandoffDto {
  reason?: string;
}
