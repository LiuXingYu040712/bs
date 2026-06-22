import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import Dashboard from './pages/Dashboard'
import EmployeeManagement from './pages/EmployeeManagement'
import AIAssistant from './pages/AIAssistant'
import KnowledgeBase from './pages/KnowledgeBase'
import RAGConfig from './pages/RAGConfig'
import Recruitment from './pages/Recruitment'
import Attendance from './pages/Attendance'
import Salary from './pages/Salary'
import Feedback from './pages/Feedback'
import Login from './pages/Login'
import Register from './pages/Register'
import ProfileCenter from './pages/ProfileCenter'

function App() {
  return (
    <Router>
      <Routes>
        {/* 登录页路由 */}
        <Route path="/login" element={<Login />} />
        {/* 注册页路由 */}
        <Route path="/register" element={<Register />} />
        {/* 应用主布局路由（承载各业务页面） */}
        <Route path="/" element={<MainLayout />}>
          {/* 默认重定向到仪表盘 */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          {/* 仪表盘/数据概览 */}
          <Route path="dashboard" element={<Dashboard />} />
          {/* 员工管理 */}
          <Route path="employees" element={<EmployeeManagement />} />
          {/* 智能问答助手 */}
          <Route path="ai-assistant" element={<AIAssistant />} />
          {/* 知识库管理 */}
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          {/* RAG 配置管理 */}
          <Route path="rag-config" element={<RAGConfig />} />
          {/* 考勤管理 */}
          <Route path="attendance" element={<Attendance />} />
          {/* 意见反馈 */}
          <Route path="feedback" element={<Feedback />} />
          {/* 个人信息中心 */}
          <Route path="profile" element={<ProfileCenter />} />
          {/* 薪资管理 */}
          <Route path="salary" element={<Salary />} />
          {/* 招聘管理 */}
          <Route path="recruitment" element={<Recruitment />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App

