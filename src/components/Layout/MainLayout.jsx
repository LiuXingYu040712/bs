import React, { useEffect, useRef, useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Badge, theme } from 'antd'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  RobotOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
  CalendarOutlined,
  DollarOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons'
import './MainLayout.css'

const { Header, Sider, Content } = Layout

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // 可扩展：上报日志
    console.error('Route error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div>
          <h3>页面加载出现错误</h3>
          <div style={{ color: '#999' }}>请刷新页面或返回其它菜单</div>
        </div>
      )
    }
    return this.props.children
  }
}

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const dirtyRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '数据概览',
    },
    {
      key: '/employees',
      icon: <TeamOutlined />,
      label: '员工管理',
    },
    {
      key: '/ai-assistant',
      icon: <RobotOutlined />,
      label: 'RAG智能助手',
    },
    {
      key: '/knowledge-base',
      icon: <DatabaseOutlined />,
      label: '知识库管理',
    },
    {
      key: '/rag-config',
      icon: <ThunderboltOutlined />,
      label: 'RAG配置',
    },
    {
      key: '/recruitment',
      icon: <FileSearchOutlined />,
      label: '招聘管理',
    },
    {
      key: '/attendance',
      icon: <CalendarOutlined />,
      label: '考勤管理',
    },
    {
      key: '/salary',
      icon: <DollarOutlined />,
      label: '薪资管理',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ]

  const userMenuItems = [
    {
      key: 'profile',
      label: '个人资料',
      icon: <UserOutlined />,
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      danger: true,
    },
  ]

  const handleMenuClick = ({ key }) => {
    // 简单的全局离开拦截：若有未保存更改则提示（各页面可通过 window.__setDirty(true/false) 控制）
    if (dirtyRef.current) {
      const ok = window.confirm('当前页面有未保存的修改，确定要离开吗？')
      if (!ok) return
      dirtyRef.current = false
    }
    navigate(key)
  }

  const handleUserMenuClick = ({ key }) => {
    if (key === 'logout') {
      if (dirtyRef.current) {
        const ok = window.confirm('当前页面有未保存的修改，确定要退出吗？')
        if (!ok) return
        dirtyRef.current = false
      }
      navigate('/login')
    }
  }

  // 提供全局方法供页面标记未保存状态
  useEffect(() => {
    window.__setDirty = (v) => {
      dirtyRef.current = !!v
    }
    const beforeUnload = (e) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      delete window.__setDirty
    }
  }, [])

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
        theme={darkMode ? 'dark' : 'light'}
      >
        <div className="logo">
          {!collapsed ? (
            <div className="logo-text">
              <RobotOutlined style={{ marginRight: 8 }} />
              AI人事系统
            </div>
          ) : (
            <div className="logo-icon">
              <RobotOutlined />
            </div>
          )}
        </div>
        <Menu
          theme={darkMode ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'all 0.2s' }}>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: 'trigger',
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: 18, cursor: 'pointer' },
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              onClick={() => setDarkMode(!darkMode)}
              style={{ cursor: 'pointer', fontSize: 18 }}
            >
              {darkMode ? <SunOutlined /> : <MoonOutlined />}
            </div>
            <Badge count={5} size="small">
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
            </Badge>
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: handleUserMenuClick,
              }}
              placement="bottomRight"
            >
              <Avatar
                style={{ backgroundColor: '#1890ff', cursor: 'pointer' }}
                icon={<UserOutlined />}
              />
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout

