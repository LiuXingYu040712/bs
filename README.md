# Admin Management System (HR + AI + RAG)

本项目是一个基于 React + Vite 的人事管理系统，并集成了基于 RAG 的 AI 助手与知识库管理（Mock 后端）。

## 结构
- 前端：`Vite + React + Ant Design`
- 后端（Mock）：`Express` 提供基础接口（RAG 配置 / 知识库 / 聊天）
- 容器：`Dockerfile`、`docker-compose.yml` 支持前后端一键启动

## 运行（本地）
```powershell
cd "c:\Users\刘星宇\Desktop\新建文件夹 (3)"
npm install
# 启动后端
npm run dev:server
# 另开一个终端，启动前端
npm run dev
```

或一键前后端（PowerShell 后台作业）：
```powershell
npm run dev:all
```

访问：
- 前端：`http://localhost:3000`（Vite 实际端口以输出为准）
- 后端：`http://localhost:8080`

## 运行（Docker Compose）
```powershell
cd "c:\Users\刘星宇\Desktop\新建文件夹 (3)"
docker compose up --build
```

## 前端对接后端
- 配置环境变量：`VITE_API_BASE`（Dockerfile 默认 `http://localhost:8080`）
- API 封装：`src/api/client.js`
	- `chat(question)`：AI 助手聊天接口
	- `getRagConfig()` / `saveRagConfig(cfg)`：RAG 配置读取与保存
	- `listKnowledgeDocs()`：知识库文档列表

## 后续扩展
- 接入真实向量数据库（Qdrant/Milvus）与嵌入模型（OpenAI/自研）
- 为 `EmployeeManagement` 页面接入后端增删改查接口与持久化
- 增加 `.env` 管理密钥与配置、安全与鉴权
# AI人事管理系统

一个基于 React + Vite + Ant Design 构建的现代化人事管理系统，集成大模型与RAG技术，提供智能人事管理服务。

## 功能特性

- 🤖 **AI智能助手** - 基于RAG技术的智能问答系统，可查询员工信息、解答人事政策
- 🎨 **精美UI设计** - 基于 Ant Design 5.x，采用渐变色彩和动画效果
- 📱 **响应式布局** - 完美支持移动端和桌面端
- 🚀 **快速开发** - 基于 Vite 构建工具，热更新快速
- 👥 **员工管理** - 完整的员工信息管理，包括部门、职位、级别等
- 📊 **数据概览** - 实时人事数据统计和分析
- 💼 **招聘管理** - 职位发布、简历管理、面试跟踪
- 📅 **考勤管理** - 考勤记录、出勤统计、日历视图
- 💰 **薪资管理** - 薪资计算、报表导出、统计分析
- ⚙️ **系统设置** - 灵活的配置选项
- 🌙 **主题切换** - 支持暗色/亮色主题切换

## 技术栈

- React 18
- Vite 5
- Ant Design 5
- React Router 6

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
├── src/
│   ├── components/        # 组件目录
│   │   └── Layout/       # 布局组件
│   ├── pages/            # 页面目录
│   │   ├── Dashboard.jsx      # 仪表板
│   │   ├── UserManagement.jsx # 用户管理
│   │   ├── DataManagement.jsx # 数据管理
│   │   ├── Settings.jsx       # 系统设置
│   │   └── Login.jsx         # 登录页面
│   ├── App.jsx           # 主应用组件
│   ├── main.jsx          # 入口文件
│   └── index.css         # 全局样式
├── index.html            # HTML 模板
├── vite.config.js        # Vite 配置
└── package.json          # 项目配置
```

## 页面说明

- **登录页面** (`/login`): AI人事管理系统登录入口
- **数据概览** (`/dashboard`): 人事数据统计和可视化分析
- **员工管理** (`/employees`): 员工信息的增删改查，包括部门、职位、级别管理
- **AI智能助手** (`/ai-assistant`): 基于RAG技术的智能问答，可查询人事相关信息
- **招聘管理** (`/recruitment`): 职位发布、简历管理、面试进度跟踪
- **考勤管理** (`/attendance`): 考勤记录查询、出勤统计、日历视图
- **薪资管理** (`/salary`): 薪资计算、报表导出、统计分析
- **系统设置** (`/settings`): 系统配置和参数设置

## AI功能说明

### RAG智能助手
- 基于检索增强生成（RAG）技术
- 可查询员工信息、人事政策、薪资标准等
- 支持多轮对话和上下文理解
- 显示参考来源，保证信息准确性

## 开发说明

本项目使用 Ant Design 作为 UI 组件库，提供了丰富的组件和样式。所有页面都采用了响应式设计，可以在不同设备上良好显示。

## License

MIT

