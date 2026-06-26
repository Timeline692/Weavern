#  织识 Weavern

> 编织知识，织网识海 —— 纯本地多模态知识库管理工具

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Tech](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20TypeScript-6366f1)

##  功能

| | |
|---|---|
|  **多方式导入** | 拖拽文件/文件夹、按钮选择、剪贴板粘贴 |
|  **多格式预览** | TXT · Markdown · HTML · DOCX · PDF · 图片 · 视频 |
|  **分屏编辑** | Markdown 文件左编辑右实时预览，TXT 直接编辑 |
|  **高亮 + 笔记** | 选中文字即高亮，添加笔记后悬浮查看 |
|  **全文搜索** | 标题 + 内容搜索，结果高亮，按分类/标签/类型筛选 |
|  **分类树** | 无限层级，可拖拽排序 |
|  **标签系统** | 多标签管理，按标签快速筛选 |
|  **星标收藏** | 重要条目标星，侧边栏一键筛选 |
|  **暗色模式** | 全局切换，夜间阅读舒适 |
|  **键盘快捷键** | `Ctrl+N` 新建 · `Ctrl+S` 保存 · `Delete` 删除 · `Esc` 退出 |
|  **可调面板** | 三栏宽度自由拖拽调整 |
|  **拖拽排序** | 条目卡片长按拖拽重新排序 |
|  **写时复制** | 编辑文件时自动复制到 `_edited/`，原始文件不动 |
|  **纯本地** | 所有数据储存在你指定的文件夹，零网络请求 |

##  快速开始

```bash
# 安装依赖（国内用户建议设置镜像）
npm install

# 开发模式启动
npm run dev

# 打包为安装程序
npm run package
```

> 首次启动选择一个文件夹作为知识库根目录，所有文件和数据将保存在该文件夹中。

##  技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Vite 6 |
| UI | Ant Design 5 |
| 状态管理 | Zustand |
| 数据库 | sql.js (SQLite WASM) |
| 搜索 | SQLite LIKE + 片段高亮 |
| 文档解析 | mammoth (DOCX) · marked (MD) · cheerio (HTML) |
| 打包 | electron-builder |

##  项目结构

```
src/
├── main/           # Electron 主进程
│   ├── index.ts        # 窗口创建
│   ├── database.ts     # SQLite 数据层
│   ├── file-manager.ts # 文件导入/解析
│   ├── ipc-handlers.ts # IPC 通信
│   └── preload.ts      # 安全桥接
├── renderer/       # React 前端
│   ├── components/
│   │   ├── Sidebar.tsx      # 分类树 + 标签 + 星标
│   │   ├── ItemList.tsx     # 条目列表（排序/批量/拖拽）
│   │   ├── PreviewPanel.tsx # 多格式预览 + 高亮 + 笔记 + 编辑
│   │   ├── Toolbar.tsx      # 搜索 + 导入 + 新建 + 暗色
│   │   └── DragDropOverlay.tsx
│   ├── store.ts      # Zustand 状态
│   └── App.tsx       # 三栏可拖拽布局
└── shared/
    └── types.ts      # 全量类型定义
```

## 本项目由**Vibe Coding**方式开发——**能工智人**提供创意

##  许可

MIT License
