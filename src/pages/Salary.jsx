import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Row,
  Col,
  Statistic,
  Progress,
} from 'antd'
import { SearchOutlined, EditOutlined, DollarOutlined, ExportOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { listSalaries, updateSalary } from '../api/client'

const { Title } = Typography
const { Search } = Input

const Salary = () => {
  const [dataSource, setDataSource] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'))

  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form] = Form.useForm()

  const columns = [
    {
      title: '员工ID',
      dataIndex: 'employeeId',
      key: 'employeeId',
      width: 100,
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
      title: '基本工资',
      dataIndex: 'baseSalary',
      key: 'baseSalary',
      width: 120,
      render: (value) => `¥${value.toLocaleString()}`,
    },
    {
      title: '绩效奖金',
      dataIndex: 'performance',
      key: 'performance',
      width: 120,
      render: (value) => `¥${value.toLocaleString()}`,
    },
    {
      title: '其他奖金',
      dataIndex: 'bonus',
      key: 'bonus',
      width: 120,
      render: (value) => `¥${value.toLocaleString()}`,
    },
    {
      title: '应发总额',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      render: (value) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          ¥{value.toLocaleString()}
        </span>
      ),
    },
    {
      title: '扣除税额',
      dataIndex: 'tax',
      key: 'tax',
      width: 120,
      render: (value) => `¥${value.toLocaleString()}`,
    },
    {
      title: '实发工资',
      dataIndex: 'actual',
      key: 'actual',
      width: 120,
      render: (value) => (
        <span style={{ fontWeight: 'bold', color: '#52c41a' }}>
          ¥{value.toLocaleString()}
        </span>
      ),
    },
    {
      title: '月份',
      dataIndex: 'month',
      key: 'month',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
        >
          编辑
        </Button>
      ),
    },
  ]

  const handleEdit = (record) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalVisible(true)
  }

  const handleModalOk = () => {
    form.validateFields().then((values) => {
      if (!editingRecord) return
      const payload = {
        baseSalary: Number(values.baseSalary || 0),
        performance: Number(values.performance || 0),
        bonus: Number(values.bonus || 0),
      }
      updateSalary(editingRecord.id, payload)
        .then((resp) => {
          const { total, tax, actual } = resp
          setDataSource((prev) =>
            prev.map((it) => (it.id === editingRecord.id ? { ...it, ...payload, total, tax, actual } : it))
          )
          setIsModalVisible(false)
          form.resetFields()
        })
        .catch(() => {})
    })
  }

  const totalStats = useMemo(() => {
    const totalSalary = dataSource.reduce((sum, item) => sum + (item.total || 0), 0)
    const totalTax = dataSource.reduce((sum, item) => sum + (item.tax || 0), 0)
    const totalActual = dataSource.reduce((sum, item) => sum + (item.actual || 0), 0)
    const avgSalary = dataSource.length ? Math.round(totalActual / dataSource.length) : 0
    return { totalSalary, totalTax, totalActual, avgSalary }
  }, [dataSource])

  useEffect(() => {
    setLoading(true)
    listSalaries(selectedMonth)
      .then((rows) => {
        const mapped = rows.map((r) => ({
          ...r,
          key: r.id,
        }))
        setDataSource(mapped)
      })
      .catch(() => setDataSource([]))
      .finally(() => setLoading(false))
  }, [selectedMonth])

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
          薪资管理
        </Title>
        <Space>
          <Select
            placeholder="选择月份"
            style={{ width: 150 }}
            value={selectedMonth}
            onChange={(v) => setSelectedMonth(v)}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const m = dayjs().subtract(i, 'month').format('YYYY-MM')
              return (
                <Select.Option key={m} value={m}>
                  {m}
                </Select.Option>
              )
            })}
          </Select>
          <Search
            placeholder="搜索员工"
            allowClear
            style={{ width: 250 }}
            prefix={<SearchOutlined />}
          />
          <Button icon={<ExportOutlined />}>导出报表</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="应发总额"
              value={totalStats.totalSalary}
              prefix={<DollarOutlined />}
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="扣除税额"
              value={totalStats.totalTax}
              prefix={<DollarOutlined />}
              precision={0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="实发总额"
              value={totalStats.totalActual}
              prefix={<DollarOutlined />}
              precision={0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均薪资"
              value={totalStats.avgSalary}
              prefix={<DollarOutlined />}
              precision={0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
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
        title="编辑薪资"
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
        }}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="baseSalary"
                label="基本工资"
                rules={[{ required: true, message: '请输入基本工资' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  prefix="¥"
                  min={0}
                  precision={0}
                  placeholder="请输入基本工资"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="performance"
                label="绩效奖金"
                rules={[{ required: true, message: '请输入绩效奖金' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  prefix="¥"
                  min={0}
                  precision={0}
                  placeholder="请输入绩效奖金"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="bonus"
            label="其他奖金"
            rules={[{ required: true, message: '请输入其他奖金' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="¥"
              min={0}
              precision={0}
              placeholder="请输入其他奖金"
            />
          </Form.Item>
          <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 4 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#666' }}>应发总额：</span>
              <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
                ¥
                {(form.getFieldValue('baseSalary') || 0) +
                  (form.getFieldValue('performance') || 0) +
                  (form.getFieldValue('bonus') || 0)}
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#666' }}>扣除税额（10%）：</span>
              <span style={{ fontWeight: 'bold', color: '#ff4d4f' }}>
                ¥
                {Math.round(
                  ((form.getFieldValue('baseSalary') || 0) +
                    (form.getFieldValue('performance') || 0) +
                    (form.getFieldValue('bonus') || 0)) *
                    0.1
                )}
              </span>
            </div>
            <div>
              <span style={{ color: '#666' }}>实发工资：</span>
              <span style={{ fontWeight: 'bold', color: '#52c41a' }}>
                ¥
                {(form.getFieldValue('baseSalary') || 0) +
                  (form.getFieldValue('performance') || 0) +
                  (form.getFieldValue('bonus') || 0) -
                  Math.round(
                    ((form.getFieldValue('baseSalary') || 0) +
                      (form.getFieldValue('performance') || 0) +
                      (form.getFieldValue('bonus') || 0)) *
                      0.1
                  )}
              </span>
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default Salary

