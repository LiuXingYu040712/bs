import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Form, Input, message, Row, Space, Typography } from 'antd'
import { getMyProfile, updateMyProfile } from '../api/client'
import { Navigate } from 'react-router-dom'

const { Title, Text } = Typography

const ProfileCenter = () => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [form] = Form.useForm()

  let currentUser = {}
  try {
    currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  } catch (e) {}
  const isAdmin = currentUser?.role === 'admin'

  if (isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  const loadProfile = async () => {
    try {
      setLoading(true)
      const data = await getMyProfile()
      const nextUser = data?.user || null
      const nextEmp = data?.employee || null
      setUser(nextUser)
      setEmployee(nextEmp)
      form.setFieldsValue({
        email: nextEmp?.email || nextUser?.email || '',
        phone: nextEmp?.phone || '',
        address: nextEmp?.address || '',
        emergency_contact: nextEmp?.emergency_contact || '',
        emergency_phone: nextEmp?.emergency_phone || '',
        bio: nextEmp?.bio || '',
      })
    } catch (e) {
      message.error(e?.response?.data?.error || '加载个人信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const data = await updateMyProfile(values)
      setUser(data?.user || null)
      setEmployee(data?.employee || null)
      try {
        const raw = localStorage.getItem('auth_user')
        const obj = raw ? JSON.parse(raw) : {}
        const merged = { ...(obj || {}), ...(data?.user || {}) }
        localStorage.setItem('auth_user', JSON.stringify(merged))
      } catch (e) {}
      message.success('个人信息已保存')
    } catch (e) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.error || '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          个人信息中心
        </Title>
      </Space>

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card loading={loading} title="账号与任职信息" style={{ marginBottom: 16 }}>
            {!employee ? (
              <Alert
                type="warning"
                showIcon
                message="当前账号未关联员工档案"
                description="你仍可更新账号邮箱，但员工档案字段需管理员先在员工管理中完成关联。"
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
              <Descriptions.Item label="用户名">{user?.username || '-'}</Descriptions.Item>
              <Descriptions.Item label="角色">{user?.role || '-'}</Descriptions.Item>
              <Descriptions.Item label="员工ID">{employee?.id || '-'}</Descriptions.Item>
              <Descriptions.Item label="姓名">{employee?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="部门">{employee?.department || '-'}</Descriptions.Item>
              <Descriptions.Item label="职位">{employee?.position || '-'}</Descriptions.Item>
              <Descriptions.Item label="级别">{employee?.level || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{employee?.status || '-'}</Descriptions.Item>
              <Descriptions.Item label="入职日期">{employee?.joinDate || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card loading={loading} title="可编辑信息">
            <Form form={form} layout="vertical" onValuesChange={() => window.__setDirty && window.__setDirty(true)}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  { pattern: /^$|^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
                ]}
              >
                <Input placeholder="请输入手机号" />
              </Form.Item>
              <Form.Item name="address" label="联系地址">
                <Input placeholder="请输入联系地址" />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="emergency_contact" label="紧急联系人">
                    <Input placeholder="请输入紧急联系人" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="emergency_phone"
                    label="紧急联系人电话"
                    rules={[
                      { pattern: /^$|^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
                    ]}
                  >
                    <Input placeholder="请输入紧急联系人电话" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="bio" label="个人简介">
                <Input.TextArea rows={4} maxLength={300} showCount placeholder="请输入个人简介" />
              </Form.Item>
              <Space>
                <Button type="primary" loading={saving} onClick={onSave}>
                  保存
                </Button>
                <Button onClick={loadProfile}>重置</Button>
              </Space>
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">提示：只有你本人和管理员可查看你的个人资料。</Text>
              </div>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default ProfileCenter