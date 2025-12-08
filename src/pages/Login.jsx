import React from 'react'
import { Form, Input, Button, Card, Typography, message, Tag } from 'antd'
import { UserOutlined, LockOutlined, RobotOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './Login.css'

const { Title } = Typography

const Login = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const onFinish = (values) => {
    console.log('Login values:', values)
    message.success('登录成功')
    setTimeout(() => {
      navigate('/dashboard')
    }, 500)
  }

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <RobotOutlined style={{ fontSize: 48, color: '#667eea', marginBottom: 16 }} />
          </div>
          <Title level={2} style={{ textAlign: 'center', marginBottom: 8 }}>
            AI人事管理系统
          </Title>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: 8 }}>
            基于大模型与RAG技术
          </p>
          <Tag icon={<RobotOutlined />} color="purple" style={{ marginBottom: 32 }}>
            智能人事助手
          </Tag>
        </div>
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#999' }}>
          <p>默认账号: admin / 密码: admin</p>
        </div>
      </Card>
    </div>
  )
}

export default Login

