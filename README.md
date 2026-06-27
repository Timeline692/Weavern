# 织识 (Weavern)

> 编织知识，织网识海 —— 纯本地多模态知识库管理工具

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Tech](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20TypeScript-6366f1)

## 功能

| | |
|---|---|
| 多方式导入 | 拖拽文件/文件夹、按钮选择、剪贴板粘贴 |
| 多格式预览 | TXT / Markdown / HTML / DOCX / PDF / 图片 / 视频 |
| 分屏编辑 | Markdown 文件左编辑右实时预览，TXT 直接编辑 |
| 高亮 + 笔记 | 选中文字即高亮，添加笔记后悬浮查看 |
| 全文搜索 | 标题 + 内容搜索，结果高亮，按分类/标签/类型筛选 |
| 分类树 | 无限层级，可拖拽排序 |
| 标签系统 | 多标签管理，按标签快速筛选 |
| 星标收藏 | 重要条目标星，侧边栏一键筛选 |
| 暗色模式 | 全局切换，夜间阅读舒适 |
| Vim 全键盘操作 | Normal/Insert 模态，手不离主键盘完成所有操作 |
| 可调面板 | 三栏宽度自由拖拽调整 |
| 拖拽排序 | 条目卡片长按拖拽重新排序 |
| 写时复制 | 编辑文件时自动复制到 `_edited/`，原始文件不动 |
| 纯本地 | 所有数据储存在你指定的文件夹，零网络请求 |
| 开机自启 | 打包安装后首次启动默认开启，可在关于中开关 |

---

## 想想Vim会怎么做

启动后默认处于 **Normal** 模式（顶部栏右侧显示 `N`）。当光标位于输入框时自动进入 **Insert** 模式（显示 `I`），Esc 键返回 Normal。

```
导航                       操作                   模式/全局
h   聚焦左侧面板(侧栏)      i     进入编辑          f     阅读模式
l   聚焦右侧面板(预览)      s     保存(编辑模式)    t     暗色模式
j   下一项                  Space  切换星标         m     折叠侧栏
k   上一项                  r     重命名           v     批量模式
gg  跳到第一个              dd    删除当前项       V     全选+批量模式
G   跳到最后一个            c     新建文件         /     聚焦搜索
Enter 确认/打开             a     新建分类/标签    n/N   下/上个搜索结果
Ctrl+d/u 翻半页(预览区)     Ctrl+o 导入文件        +/-    字号大小
                            ?     打开帮助         Esc   取消/退出/清除
```

> 顶部栏右侧实时显示当前模式和聚焦面板：`N LIST` / `N SIDEBAR` / `N PREVIEW` / `I`。

## 快速开始

```bash
# 安装依赖（国内用户建议设置镜像）
npm install

# 开发模式启动
npm run dev

# 打包为安装程序
npm run package
```

> 首次启动选择一个文件夹作为知识库根目录，所有文件和数据将保存在该文件夹中。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Vite 6 |
| UI | Ant Design 5 |
| 状态管理 | Zustand |
| 数据库 | sql.js (SQLite WASM) |
| 搜索 | SQLite LIKE + 片段高亮 |
| 文档解析 | mammoth (DOCX) / marked (MD) / cheerio (HTML) |
| 打包 | electron-builder |

## 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── index.ts           # 窗口创建
│   ├── database.ts        # SQLite 数据层
│   ├── file-manager.ts    # 文件导入/解析
│   ├── ipc-handlers.ts    # IPC 通信
│   └── preload.ts         # 安全桥接
├── renderer/          # React 前端
│   ├── components/
│   │   ├── Sidebar.tsx         # 分类树 + 标签 + 星标
│   │   ├── ItemList.tsx        # 条目列表（排序/批量/拖拽）
│   │   ├── PreviewPanel.tsx    # 多格式预览 + 高亮 + 笔记 + 编辑
│   │   ├── Toolbar.tsx         # 搜索 + 导入 + 新建 + 暗色
│   │   ├── VimIndicator.tsx    # Vim 模式指示器
│   │   └── DragDropOverlay.tsx # 拖拽导入覆盖层
│   ├── hooks/
│   │   └── useVimKeybindings.ts # Vim 键位逻辑
│   ├── store.ts         # Zustand 状态
│   └── App.tsx          # 三栏可拖拽布局
└── shared/
    └── types.ts         # 全量类型定义
```

## 本项目由 Vibe Coding 方式开发 —— 能工智人提供创意

## 许可

MIT License
