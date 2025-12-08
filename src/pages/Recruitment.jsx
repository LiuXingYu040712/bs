import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Progress,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { listPositions, createPosition, updatePosition, deletePosition } from '../api/client'
import { message } from 'antd'

const { Title } = Typography
const { TextArea } = Input

const Recruitment = () => {
  const [dataSource, setDataSource] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchPositions = () => {
    setLoading(true)
    listPositions()
      .then((rows) => {
        setDataSource(rows.map((r) => ({ ...r, key: r.id })))
      })
      .catch(() => {
        message.error('加载职位列表失败')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPositions()
  }, [])

  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form] = Form.useForm()
  useEffect(() => () => { window.__setDirty && window.__setDirty(false) }, [])

  const columns = [
    {
      title: '职位ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: '职位名称',
      dataIndex: 'position',
      key: 'position',
      width: 180,
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      render: (dept) => {
        const colorMap = {
          技术部: 'blue',
          产品部: 'purple',
          市场部: 'green',
          销售部: 'orange',
        }
        return <Tag color={colorMap[dept] || 'default'}>{dept}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === '招聘中' ? 'processing' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: '简历数',
      dataIndex: 'candidates',
      key: 'candidates',
      width: 100,
    },
    {
      title: '面试数',
      dataIndex: 'interviews',
      key: 'interviews',
      width: 100,
    },
    {
      title: 'Offer数',
      dataIndex: 'offers',
      key: 'offers',
      width: 100,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (progress) => (
        <Progress percent={progress} size="small" status={progress === 100 ? 'success' : 'active'} />
      ),
    },
    {
      title: '发布日期',
      dataIndex: 'publishDate',
      key: 'publishDate',
      width: 120,
    },
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<EyeOutlined />} size="small">
            查看
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.status === '招聘中' && (
            <Button
              type="link"
              icon={<CloseCircleOutlined />}
              size="small"
              danger
              onClick={() => handleClose(record.key)}
            >
              关闭
            </Button>
          )}
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
    form.setFieldsValue({
      ...record,
      publishDate: dayjs(record.publishDate),
      deadline: dayjs(record.deadline),
    })
    setIsModalVisible(true)
  }

  const handleClose = async (key) => {
    const target = dataSource.find((x) => x.key === key)
    if (!target) return
    try {
      await updatePosition(target.id, { ...target, status: 'closed' })
      message.success('职位已关闭')
      fetchPositions()
    } catch {
      message.error('关闭失败')
    }
  }

  const handleModalOk = () => {
    form.validateFields().then(async (values) => {
      const formData = {
        title: values.position,
        department: values.department,
        status: values.status === '招聘中' ? 'open' : 'closed',
        publishDate: values.publishDate?.format('YYYY-MM-DD'),
        deadline: values.deadline?.format('YYYY-MM-DD'),
        requirements: values.requirements,
      }

      try {
        if (editingRecord) {
          await updatePosition(editingRecord.id, formData)
          message.success('职位更新成功')
          window.__setDirty && window.__setDirty(false)
        } else {
          const newId = `P${String(Date.now()).slice(-6)}`
          await createPosition({ id: newId, ...formData })
          message.success('职位创建成功')
          window.__setDirty && window.__setDirty(false)
        }
        setIsModalVisible(false)
        form.resetFields()
        fetchPositions()
      } catch {
        message.error('保存失败')
      }
    })
  }

  const stats = [
    {
      title: '招聘中职位',
      value: dataSource.filter((item) => item.status === '招聘中').length,
      prefix: null,
    },
    {
      title: '总简历数',
      value: dataSource.reduce((sum, item) => sum + item.candidates, 0),
      prefix: null,
    },
    {
      title: '总面试数',
      value: dataSource.reduce((sum, item) => sum + item.interviews, 0),
      prefix: null,
    },
    {
      title: '总Offer数',
      value: dataSource.reduce((sum, item) => sum + item.offers, 0),
      prefix: null,
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
          招聘管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          发布新职位
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={stat.prefix}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={dataSource}
          loading={loading}
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
        title={editingRecord ? '编辑职位' : '发布新职位'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
        }}
        okText="确定"
        cancelText="取消"
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFieldsChange={() => window.__setDirty && window.__setDirty(true)}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="position"
                label="职位名称"
                rules={[{ required: true, message: '请输入职位名称' }]}
              >
                <Input placeholder="请输入职位名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="department"
                label="部门"
                rules={[{ required: true, message: '请选择部门' }]}
              >
                <Select placeholder="请选择部门">
                  <Select.Option value="技术部">技术部</Select.Option>
                  <Select.Option value="产品部">产品部</Select.Option>
                  <Select.Option value="市场部">市场部</Select.Option>
                  <Select.Option value="销售部">销售部</Select.Option>
                  <Select.Option value="行政部">行政部</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="publishDate"
                label="发布日期"
                rules={[{ required: true, message: '请选择发布日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="deadline"
                label="截止日期"
                rules={[{ required: true, message: '请选择截止日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="requirements"
            label="职位要求"
            rules={[{ required: true, message: '请输入职位要求' }]}
          >
            <TextArea
              rows={4}
              placeholder="请输入职位要求、任职资格等"
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Recruitment

