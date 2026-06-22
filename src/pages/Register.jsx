import React from 'react'
import { Form, Input, Button, Card, Typography, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './Login.css'
import { authRegister } from '../api/client'

const { Title } = Typography

const Register = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const onFinish = (values) => {
    authRegister(values)
      .then((data) => {
        if (data?.token) {
          localStorage.setItem('auth_token', data.token)
          localStorage.setItem('auth_user', JSON.stringify(data.user || {}))
          message.success('注册并登录成功')
          setTimeout(() => navigate('/recruitment'), 400)
        } else {
          message.error('注册失败')
        }
      })
      .catch((e) => {
        message.error(e?.response?.data?.error || e.message || '注册失败')
      })
  }

  return (
    <div className="login-container">
      <Card className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={2}>创建账号</Title>
        </div>
        <Form form={form} name="register" onFinish={onFinish} autoComplete="off" size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}> 
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="email" rules={[{ type: 'email', message: '请输入有效邮箱' }]}> 
            <Input placeholder="邮箱（选填）" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}> 
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              注册并登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Register
