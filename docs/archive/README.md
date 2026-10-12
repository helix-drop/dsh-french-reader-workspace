# 已归档的过程文档

这里是 2026-10-09 及更早、已经写进本仓库的交接、审计和实机复测。每份文件开头有归档标记。里面的行号、缺陷清单和界面描述对应当时的提交，不能当作现在的面板说明。

当前还在用的说明：

- [插件 README](../../packages/french-close-reading/README.md)：怎么构建、浏览器调试入口、客户端约束。
- [音频规格](../../packages/french-close-reading/AUDIO.md)：朗读和变位发音的契约。实现已经落地。
- [验收流水](../../packages/french-close-reading/VERIFICATION.md)：包内逐次验收记录。新的真机证据仍写在这里。

没有进这个 git 仓库的本机笔记在 `<本机工作区>/archive/french-close-reading/`。那一批包含 10 月 7 日的前端移植和后端交接，以及 10 月 10 日的音频收尾、第八轮真机和变位抓取修复。

## 本目录 `process/`

| 文件 | 当时的作用 |
|---|---|
| `FRONTEND_CHANGES.md` | 2026-10-08 的前端交付说明。书架仍在本机 `localStorage`，键名还可以对照代码；文中「发音保持禁用」，以及把查词、讨论放在句子栏里，已经不是现在的界面。 |
| `french-computer-use-v0.1.2-2026-10-09.md` | v0.1.2 原生复测。仓库这一份隐去了本机记录编号；带编号的原稿在本机归档目录。 |
| `french-computer-use-round3-2026-10-09.md` | 第三轮原生复测。 |
| `french-user-journey-deepseek-v41-flash-2026-10-09.md` | 第四轮真实阅读。 |
| `DSH-法语精读插件-v0.1.2-全链路功能缺陷审计-2026-10-09.md` | 以提交 `067c275` 为基线的静态审计。 |
| `DSH-法语精读-v0.1.2-第四轮源码复审及实施指南-2026-10-09.md` | 针对第四轮的修改指南，行号对提交 `9e39143`。后来的提交已经改过这些路径。 |
| `french-computer-use-round5-2026-10-09.md` | 第五轮实机复测。 |
| `french-round5-interface-investigation-2026-10-09.md` | 第五轮六项故障的接口调查。 |
| `french-computer-use-round6-2026-10-09.md` | 第六轮真实使用复测。 |

工作区根目录里和上表同内容的副本已经删掉，只保留这一份。
