# 贡献指南 (Contributing to Conductor)

首先，**感谢**你愿意为 Conductor 出力！🎉

Conductor 是一个 AI 原生的研发流程编排平台，目前处于立项阶段，欢迎任何形式的参与：想法、设计、代码、文档、反馈。

## 🙌 参与方式

- **交流想法**：开一个 Discussion 或 Issue，描述你的场景与诉求。
- **反馈问题**：通过 Issue 报告 bug 或提出改进建议。
- **贡献代码 / 文档**：从带 `good first issue` 标签的 Issue 开始。
- **设计讨论**：参与架构与范围的讨论，帮助我们厘清边界。

## 🌿 开发流程（项目进入实现阶段后适用）

1. **Fork** 本仓库并克隆到本地。
2. 基于 `main` 创建分支：
   ```bash
   git checkout -b feat/your-feature
   ```
3. 保持分支聚焦：一个分支只做一件事。
4. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
   ```
   feat: 新功能
   fix: 修复 bug
   docs: 文档
   refactor: 重构
   test: 测试
   chore: 杂项
   ```
5. 推送并发起 Pull Request，在 PR 中说明**动机**与**变更内容**。

## ✅ 提交前检查清单

- [ ] 代码风格与现有约定一致
- [ ] 必要的测试已补充并通过
- [ ] 文档已同步更新（README / ROADMAP / 相关设计文档）
- [ ] 提交信息清晰，符合 Conventional Commits
- [ ] 不引入密钥、凭据等敏感信息

## 🧩 关于 AI 生成代码

Conductor 本身就是 AI 原生项目，我们欢迎借助 AI 工具完成的贡献，但请：

- 确保你**理解并能为提交的代码负责**；
- 在 PR 描述中简要说明使用了哪些 AI 工具 / skills；
- 保证通过项目的测试与审查标准。

## 🤝 行为准则

参与本项目即代表你同意遵守 [行为准则](./CODE_OF_CONDUCT.md)。请始终保持尊重与友善。

## 📄 License

贡献的内容将遵循 [MIT License](./LICENSE) 发布。
