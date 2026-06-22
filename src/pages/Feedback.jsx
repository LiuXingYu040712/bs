import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Typography,
  Form,
  Input,
  Button,
  Space,
  Table,
  Tag,
  Select,
  message,
} from 'antd'
import {
  submitFeedback,
  listMyFeedback,
  listFeedback,
  markFeedbackRead,
  markAllFeedbackRead,
} from '../api/client'

const { Title, Text } = Typography

const Feedback = () => {
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState(undefined)
  const [formKey, setFormKey] = useState(0)

  let currentUser = {}
  try {
    currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  } catch (e) {}
  const isAdmin = currentUser?.role === 'admin'

  const loadData = async () => {
    try {
      setLoading(true)
      if (isAdmin) {
        const list = await listFeedback(statusFilter)
        setRows(list || [])
      } else {
        const list = await listMyFeedback()
        setRows(list || [])
      }
    } catch (e) {
      message.error(e?.response?.data?.error || '加载意见消息失败')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [isAdmin, statusFilter])

  const unreadCount = useMemo(
    () => (rows || []).filter((r) => r.status === 'unread').length,
    [rows]
  )

  const onSubmit = async (values) => {
    try {
      setSubmitting(true)
      await submitFeedback(values.content)
      message.success('意见已提交')
      setFormKey((k) => k + 1)
      loadData()
    } catch (e) {
      message.error(e?.response?.data?.error || '提交意见失败')
    } finally {
      setSubmitting(false)
    }
  }

  const onMarkRead = async (id) => {
    try {
      await markFeedbackRead(id)
      message.success('已标记为已读')
      loadData()
    } catch (e) {
      message.error(e?.response?.data?.error || '操作失败')
    }
  }

  const onMarkAllRead = async () => {
    try {
      await markAllFeedbackRead()
      message.success('已全部标记为已读')
      loadData()
    } catch (e) {
      message.error(e?.response?.data?.error || '操作失败')
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <Title level={3}>意见箱</Title>
        <Card style={{ marginBottom: 16 }}>
          <Form key={formKey} layout="vertical" onFinish={onSubmit}>
            <Form.Item
              name="content"
              label="意见内容"
              rules={[{ required: true, message: '请输入意见内容' }]}
            >
              <Input.TextArea rows={5} maxLength={2000} showCount placeholder="请输入你的意见或建议" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交意见
            </Button>
          </Form>
        </Card>

        <Card title="我提交的意见">
          <Table
            rowKey="id"
            loading={loading}
            dataSource={rows}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: '提交时间',
                dataIndex: 'created_at',
                width: 180,
                render: (v) => (v ? String(v).replace('T', ' ').slice(0, 19) : '-'),
              },
              {
                title: '内容',
                dataIndex: 'content',
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (v) => <Tag color={v === 'read' ? 'green' : 'orange'}>{v === 'read' ? '已读' : '未读'}</Tag>,
              },
            ]}
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>意见消息</Title>
        <Space>
          <Text type="secondary">未读 {unreadCount} 条</Text>
          <Select
            allowClear
            placeholder="按状态筛选"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { label: '未读', value: 'unread' },
              { label: '已读', value: 'read' },
            ]}
          />
          <Button onClick={loadData}>刷新</Button>
          <Button type="primary" ghost onClick={onMarkAllRead} disabled={unreadCount === 0}>全部已读</Button>
        </Space>
      </Space>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: '提交人',
              key: 'employee_name',
              width: 180,
              render: (_, r) => r.employee_name || r.username || r.user_id || '-',
            },
            {
              title: '部门',
              dataIndex: 'department',
              width: 120,
              render: (v) => v || '-',
            },
            {
              title: '内容',
              dataIndex: 'content',
            },
            {
              title: '提交时间',
              dataIndex: 'created_at',
              width: 180,
              render: (v) => (v ? String(v).replace('T', ' ').slice(0, 19) : '-'),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (v) => <Tag color={v === 'read' ? 'green' : 'orange'}>{v === 'read' ? '已读' : '未读'}</Tag>,
            },
            {
              title: '操作',
              key: 'actions',
              width: 120,
              render: (_, r) => (
                <Button type="link" disabled={r.status === 'read'} onClick={() => onMarkRead(r.id)}>
                  标记已读
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

export default Feedback
