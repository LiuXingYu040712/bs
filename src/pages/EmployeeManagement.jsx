import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Input,
  Space,
  Tag,
  Popconfirm,
  message,
  Modal,
  Form,
  Select,
  Typography,
  Card,
  Row,
  Col,
  Avatar,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
} from '@ant-design/icons'
import { getEmployees, addEmployee, updateEmployee, deleteEmployee } from '../api/client'

const { Title } = Typography
const { Search } = Input

const EmployeeManagement = () => {
  const [dataSource, setDataSource] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchEmployees()
    // 页面重新可见时强制刷新，避免回退后看到旧数据
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchEmployees()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const data = await getEmployees()
      setDataSource(data.map(item => ({ ...item, key: item.id })))
    } catch (error) {
      message.error('获取员工列表失败')
    } finally {
      setLoading(false)
    }
  }


  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form] = Form.useForm()
  useEffect(() => () => { window.__setDirty && window.__setDirty(false) }, [])

  const columns = [
    {
      title: '员工ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: '头像',
      dataIndex: 'avatar',
      key: 'avatar',
      width: 80,
      render: (_, record) => (
        <Avatar
          size={40}
          icon={<UserOutlined />}
          style={{
            background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
          }}
        >
          {record.name.charAt(0)}
        </Avatar>
      ),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      render: (dept) => {
        const colorMap = {
          技术部: 'blue',
          销售部: 'green',
          行政部: 'orange',
          市场部: 'purple',
        }
        return <Tag color={colorMap[dept] || 'default'}>{dept}</Tag>
      },
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
      width: 150,
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level) => <Tag color="cyan">{level}</Tag>,
    },
    {
      title: '联系方式',
      key: 'contact',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <div>
            <MailOutlined style={{ marginRight: 4 }} />
            {record.email}
          </div>
          <div>
            <PhoneOutlined style={{ marginRight: 4 }} />
            {record.phone}
          </div>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === '在职' ? 'green' : status === '试用期' ? 'orange' : 'red'}>
          {status}
        </Tag>
      ),
    },
    {
      title: '入职日期',
      dataIndex: 'joinDate',
      key: 'joinDate',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="编辑">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个员工吗？"
            onConfirm={() => handleDelete(record.key)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="link" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalVisible(true)
  }

  const handleDelete = async (key) => {
    try {
      await deleteEmployee(key)
      message.success('删除成功')
      // 乐观更新：先更新本地，再从后端确认
      setDataSource((prev) => prev.filter((item) => item.id !== key))
      fetchEmployees()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleModalOk = () => {
    form.validateFields().then(async (values) => {
      try {
        if (editingRecord) {
          await updateEmployee(editingRecord.id, { ...editingRecord, ...values })
          message.success('更新成功')
          window.__setDirty && window.__setDirty(false)
        } else {
          // 简单的 ID 生成逻辑，实际项目中应由后端生成或使用 UUID
          const newId = `E${String(dataSource.length + 1).padStart(3, '0')}`
          const newEmployee = {
            id: values.id || newId,
            ...values,
            joinDate: values.joinDate || new Date().toISOString().split('T')[0],
          }
          await addEmployee(newEmployee)
          message.success('添加成功')
          window.__setDirty && window.__setDirty(false)
        }
        setIsModalVisible(false)
        form.resetFields()
        fetchEmployees()
      } catch (error) {
        message.error('操作失败')
      }
    })
  }

  const handleModalCancel = () => {
    setIsModalVisible(false)
    form.resetFields()
  }

  const stats = [
    { title: '总员工数', value: dataSource.length, color: '#1890ff' },
    {
      title: '在职员工',
      value: dataSource.filter((item) => item.status === '在职').length,
      color: '#52c41a',
    },
    {
      title: '试用期',
      value: dataSource.filter((item) => item.status === '试用期').length,
      color: '#faad14',
    },
    {
      title: '部门数',
      value: new Set(dataSource.map((item) => item.department)).size,
      color: '#722ed1',
    },
  ]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          员工管理
        </Title>
        <Space>
          <Search
            placeholder="搜索员工姓名、部门、职位"
            allowClear
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加员工
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 'bold',
                    color: stat.color,
                    marginBottom: 8,
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ color: '#666' }}>{stat.title}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={{
            total: dataSource.length,
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      <Modal
        title={editingRecord ? '编辑员工' : '添加员工'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFieldsChange={() => window.__setDirty && window.__setDirty(true)}
        >
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="department"
                label="部门"
                rules={[{ required: true, message: '请选择部门' }]}
              >
                <Select placeholder="请选择部门">
                  <Select.Option value="技术部">技术部</Select.Option>
                  <Select.Option value="销售部">销售部</Select.Option>
                  <Select.Option value="行政部">行政部</Select.Option>
                  <Select.Option value="市场部">市场部</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="position"
                label="职位"
                rules={[{ required: true, message: '请输入职位' }]}
              >
                <Input placeholder="请输入职位" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="level"
                label="级别"
                rules={[{ required: true, message: '请选择级别' }]}
              >
                <Select placeholder="请选择级别">
                  <Select.Option value="P3">P3</Select.Option>
                  <Select.Option value="P4">P4</Select.Option>
                  <Select.Option value="P5">P5</Select.Option>
                  <Select.Option value="P6">P6</Select.Option>
                  <Select.Option value="P7">P7</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select placeholder="请选择状态">
                  <Select.Option value="在职">在职</Select.Option>
                  <Select.Option value="试用期">试用期</Select.Option>
                  <Select.Option value="离职">离职</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
          >
            <Input placeholder="请输入手机号" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default EmployeeManagement

