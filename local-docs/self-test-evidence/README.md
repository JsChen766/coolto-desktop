# 自测证据目录约定

本目录供开源自测存放**本机**证据索引与脱敏日志，配合 [`oss-self-test-checklist.md`](../oss-self-test-checklist.md) 与 [`oss-gui-self-test.md`](../oss-gui-self-test.md)。

## 建议子目录

```
self-test-evidence/
  gui-smoke/          # desktop:dev 启动与设置页
  section-1/          # §1 fixture QA 日志、投递 GUI 截图说明
  section-2/          # §2 简历样本说明与日志
```

## 可提交 vs 默认可忽略

根目录 `.gitignore` 已忽略：

- `local-docs/**/*.png`
- `local-docs/**/*.pdf`
- `local-docs/**/*.docx`
- `local-docs/**/*.json`

因此截图、PDF、JSON report **默认不会入库**。推荐提交：

- 本 README
- 简短 `.md` 说明（命令、日期、结论、本机相对路径）
- 脱敏后的 `.log`（无 Key、无简历/经历全文、无 cookie）

## 禁止

- 真实 `LLM_API_KEY` / `OPENAI_API_KEY` / Bearer / cookie
- 未打码的身份证件或完整联系方式
- 将 candidate 真站误标为已验收投递的截图配文
