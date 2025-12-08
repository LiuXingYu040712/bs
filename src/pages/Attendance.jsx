import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  DatePicker,
  Select,
  Row,
  Col,
  Statistic,
  Calendar,
  Badge,
} from 'antd'
import { SearchOutlined, ExportOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { getAttendanceToday, getAttendanceByDate, upsertAttendance } from '../api/client'
import { message } from 'antd'

const { Title } = Typography
const { RangePicker } = DatePicker

const Attendance = () => {
  const [dataSource, setDataSource] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(dayjs())
  useEffect(() => {
    // 标记查询条件变更为未保存（如果页面存在手动打卡表单时可更具体处理）
    window.__setDirty && window.__setDirty(true)
    return () => {
      window.__setDirty && window.__setDirty(false)
    }
  }, [])

  const fetchDate = (d) => {
    const dateStr = d.format('YYYY-MM-DD')
    setLoading(true)
    getAttendanceByDate(dateStr)
      .then((rows) => {
        // 将后端简化的记录映射为页面展示结构（这里不含 checkIn/out 等演示字段）
        setDataSource(rows.map((r, idx) => ({
          key: r.id || `${dateStr}-${idx}`,
          employeeId: r.employee_id,
          name: r.employee_id, // 可选：联表返回姓名，这里简化显示 ID
          department: '-',
          date: r.date,
          status: r.status === 'present' ? '正常' : '请假',
          late: false,
          earlyLeave: false,
          workHours: r.status === 'present' ? 8.0 : 0,
        })))
      })
      .catch(() => {
        message.error('加载考勤数据失败')
        setDataSource([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDate(selectedDate)
  }, [selectedDate])

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
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '签到时间',
      dataIndex: 'checkIn',
      key: 'checkIn',
      width: 120,
    },
    {
      title: '签退时间',
      dataIndex: 'checkOut',
      key: 'checkOut',
      width: 120,
    },
    {
      title: '工作时长',
      dataIndex: 'workHours',
      key: 'workHours',
      width: 120,
      render: (hours) => `${hours} 小时`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status, record) => {
        if (record.late && record.earlyLeave) {
          return <Tag color="red">迟到+早退</Tag>
        } else if (record.late) {
          return <Tag color="orange">迟到</Tag>
        } else if (record.earlyLeave) {
          return <Tag color="orange">早退</Tag>
        } else {
          return <Tag color="green">正常</Tag>
        }
      },
    },
  ]

  const getListData = (value) => {
    const dateStr = value.format('YYYY-MM-DD')
    const dayData = dataSource.filter((item) => item.date === dateStr)
    return dayData || []
  }

  const dateCellRender = (value) => {
    const listData = getListData(value)
    return (
      <ul className="events">
        {listData.map((item) => (
          <li key={item.key}>
            <Badge
              status={item.status === '正常' ? 'success' : 'error'}
              text={`${item.name}: ${item.status}`}
            />
          </li>
        ))}
      </ul>
    )
  }

  const stats = useMemo(() => {
    const list = dataSource
    const total = list.length
    const normal = list.filter((x) => x.status === '正常').length
    const avgHours = total ? (list.reduce((s, x) => s + (x.workHours || 0), 0) / total).toFixed(1) : '0.0'
    return [
      { title: '当日记录', value: total },
      { title: '正常出勤', value: normal },
      { title: '平均工作时长', value: avgHours, suffix: '小时' },
    ]
  }, [dataSource])

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
          考勤管理
        </Title>
        <Space>
          <RangePicker />
          <Select
            placeholder="选择部门"
            style={{ width: 150 }}
            allowClear
          >
            <Select.Option value="技术部">技术部</Select.Option>
            <Select.Option value="销售部">销售部</Select.Option>
            <Select.Option value="行政部">行政部</Select.Option>
          </Select>
          <Button icon={<SearchOutlined />} onClick={() => fetchDate(selectedDate)}>查询</Button>
          <Button icon={<ExportOutlined />}>导出</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                suffix={stat.suffix}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="考勤日历" style={{ marginBottom: 16 }}>
            <Calendar
              dateCellRender={dateCellRender}
              value={selectedDate}
              onSelect={(v) => setSelectedDate(v)}
              style={{ border: '1px solid #f0f0f0', borderRadius: 4 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="考勤记录">
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
              scroll={{ x: 1000 }}
            />
          </Card>
        </Col>
      </Row>

      <style>{`
        .events {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .events .ant-badge-status {
          width: 100%;
          overflow: hidden;
          font-size: 12px;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  )
}

export default Attendance

