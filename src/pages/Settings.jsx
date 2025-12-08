import React, { useEffect, useRef, useState } from 'react'
import {
  Card,
  Form,
  Input,
  Switch,
  Button,
  Select,
  Typography,
  Divider,
  message,
  Space,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { getSettings, saveSettings } from '../api/client'

const { Title } = Typography
const { TextArea } = Input

const Settings = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const dirtyRef = useRef(false)

  // 加载持久化设置（本地存储作为兜底），并监听未保存离开提示
  useEffect(() => {
    // 优先从后端拉取设置，失败时回退本地存储
    getSettings()
      .then((s) => {
        if (s && typeof s === 'object') {
          form.setFieldsValue(s)
        }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem('app.settings')
          if (raw) {
            const saved = JSON.parse(raw)
            form.setFieldsValue(saved)
          }
        } catch {}
      })

    const beforeUnload = (e) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])

  // 监听表单变更以标记未保存
  const onValuesChange = () => {
    dirtyRef.current = true
  }

  const onFinish = (values) => {
    setLoading(true)
    saveSettings(values)
      .then((resp) => {
        message.success('设置保存成功')
        try {
          localStorage.setItem('app.settings', JSON.stringify(resp.settings || values))
        } catch {}
        dirtyRef.current = false
      })
      .catch(() => {
        message.warning('后端保存失败，已暂存到本地')
        try {
          localStorage.setItem('app.settings', JSON.stringify(values))
        } catch {}
        dirtyRef.current = false
      })
      .finally(() => setLoading(false))
  }

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        系统设置
      </Title>

      <Card title="基本设置" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          onValuesChange={onValuesChange}
          initialValues={{
            siteName: '管理系统',
            siteDescription: '这是一个功能强大的管理系统',
            language: 'zh-CN',
            timezone: 'Asia/Shanghai',
          }}
        >
          <Form.Item
            name="siteName"
            label="站点名称"
            rules={[{ required: true, message: '请输入站点名称' }]}
          >
            <Input placeholder="请输入站点名称" />
          </Form.Item>

          <Form.Item name="siteDescription" label="站点描述">
            <TextArea
              rows={4}
              placeholder="请输入站点描述"
              maxLength={200}
              showCount
            />
          </Form.Item>

          <Form.Item name="language" label="语言设置">
            <Select>
              <Select.Option value="zh-CN">简体中文</Select.Option>
              <Select.Option value="zh-TW">繁体中文</Select.Option>
              <Select.Option value="en-US">English</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="timezone" label="时区设置">
            <Select>
              <Select.Option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</Select.Option>
              <Select.Option value="America/New_York">
                America/New_York (UTC-5)
              </Select.Option>
              <Select.Option value="Europe/London">Europe/London (UTC+0)</Select.Option>
            </Select>
          </Form.Item>

          <Divider />

          <Form.Item label="功能开关">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item name="emailNotification" valuePropName="checked" noStyle>
                <Switch /> 邮件通知
              </Form.Item>
              <Form.Item name="smsNotification" valuePropName="checked" noStyle>
                <Switch /> 短信通知
              </Form.Item>
              <Form.Item name="autoBackup" valuePropName="checked" noStyle>
                <Switch /> 自动备份
              </Form.Item>
              <Form.Item name="maintenanceMode" valuePropName="checked" noStyle>
                <Switch /> 维护模式
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={loading}
            >
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="安全设置">
        <Form layout="vertical">
          <Form.Item label="密码策略">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item name="minPasswordLength" noStyle>
                <Input
                  addonBefore="最小长度"
                  type="number"
                  defaultValue={8}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item name="requireUppercase" valuePropName="checked" noStyle>
                <Switch /> 要求大写字母
              </Form.Item>
              <Form.Item name="requireNumbers" valuePropName="checked" noStyle>
                <Switch /> 要求数字
              </Form.Item>
              <Form.Item name="requireSpecialChars" valuePropName="checked" noStyle>
                <Switch /> 要求特殊字符
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item>
            <Button type="primary">保存安全设置</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Settings

