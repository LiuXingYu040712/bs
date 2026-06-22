import React from 'react'
import { Form, Input, Button, Card, Typography, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import './Login.css'
import { authLogin } from '../api/client'

const { Title } = Typography

const Login = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const onFinish = (values) => {
    authLogin(values)
      .then((data) => {
        if (data?.token) {
          localStorage.setItem('auth_token', data.token)
          localStorage.setItem('auth_user', JSON.stringify(data.user || {}))
          message.success('登录成功')
          setTimeout(() => {
            try {
              const role = (data.user && data.user.role) || (JSON.parse(localStorage.getItem('auth_user') || '{}').role)
              if (role === 'admin') navigate('/dashboard')
              else if (role === 'assistant') navigate('/attendance')
              else navigate('/recruitment')
            } catch (e) {
              navigate('/recruitment')
            }
          }, 400)
        } else {
          message.error('登录失败')
        }
      })
      .catch((e) => {
        message.error(e?.response?.data?.error || e.message || '登录失败')
      })
  }

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <Title level={3} style={{ textAlign: 'center', marginBottom: 8, color: '#333' }}>
            登录
          </Title>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div style={{ color: '#666', fontSize: '14px' }}>没有账号？ <Link to="/register">注册</Link></div>
          <div style={{ color: '#999', fontSize: '12px' }}>默认账号: admin / 密码: admin123</div>
        </div>
      </Card>
    </div>
  )
}

export default Login

