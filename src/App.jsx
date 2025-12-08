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
import Settings from './pages/Settings'
import Login from './pages/Login'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="employees" element={<EmployeeManagement />} />
          <Route path="ai-assistant" element={<AIAssistant />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="rag-config" element={<RAGConfig />} />
          <Route path="recruitment" element={<Recruitment />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="salary" element={<Salary />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App

