import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Statistic, Table, Tag, Progress, Typography, Avatar, Space, Badge, Button } from 'antd'
import {
  ArrowUpOutlined,
  TeamOutlined,
  DollarOutlined,
  CalendarOutlined,
  FileSearchOutlined,
  RobotOutlined,
  UserOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import './Dashboard.css'

const { Title, Text } = Typography

const Dashboard = () => {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    recentEmployees: [],
    departments: [],
    rag: { todaySearchCount: 0, knowledgeDocs: 0, vectorIndexTotal: 0 },
    todayAttendanceRate: null,
    recruitmentOpenPositions: null,
    salaryTotalCurrentMonth: null,
  })
  const [positions, setPositions] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    import('../api/client')
      .then(({ getDashboardSummary, listPositions }) => Promise.all([getDashboardSummary(), listPositions()]))
      .then(([data, pos]) => {
        if (!mounted) return
        setSummary({
          totalEmployees: data.totalEmployees ?? 0,
          recentEmployees: data.recentEmployees ?? [],
          departments: data.departments ?? [],
          rag: data.rag ?? { todaySearchCount: 0, knowledgeDocs: 0, vectorIndexTotal: 0, avgResponseTime: null },
          todayAttendanceRate: data.todayAttendanceRate ?? null,
          recruitmentOpenPositions: data.recruitmentOpenPositions ?? null,
          salaryTotalCurrentMonth: data.salaryTotalCurrentMonth ?? null,
        })
        setPositions((pos || []).map((p) => ({ ...p, key: p.id })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const columns = [
    {
      title: '员工',
      key: 'employee',
      render: (_, record) => (
        <Space>
          <Avatar
            size={32}
            icon={<UserOutlined />}
            style={{
              background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
            }}
          >
            {record.name.charAt(0)}
          </Avatar>
          <div>
            <div>{record.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.department}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === '在职' ? 'green' : status === '试用期' ? 'orange' : 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: '入职时间',
      dataIndex: 'joinDate',
      key: 'joinDate',
    },
  ]

  const dataSource = (summary.recentEmployees || []).map((e, idx) => ({
    key: e.id || String(idx),
    name: e.name,
    department: e.department,
    position: e.position,
    status: e.status,
    joinDate: e.joinDate,
  }))

  return (
    <div className="dashboard">
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, display: 'inline-block', marginRight: 16 }}>
          人事数据概览
        </Title>
      </div>

      {/* RAG系统统计 */}
      <Card
        title={
          <Space>
            <ThunderboltOutlined style={{ color: '#667eea' }} />
            <span>RAG系统使用统计</span>
          </Space>
        }
        style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)' }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="今日RAG检索次数"
              loading={loading}
              value={summary.rag?.todaySearchCount ?? 0}
              prefix={<DatabaseOutlined style={{ color: '#667eea' }} />}
              valueStyle={{ color: '#667eea' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="知识库文档数"
              loading={loading}
              value={summary.rag?.knowledgeDocs ?? 0}
              prefix={<FileTextOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="向量索引总数"
              loading={loading}
              value={summary.rag?.vectorIndexTotal ?? 0}
              prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            {/* 平均响应时间已移除 */}
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>总员工数</span>}
              loading={loading}
              value={summary.totalEmployees}
              prefix={<TeamOutlined style={{ color: 'white' }} />}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>本月薪资总额</span>}
              loading={loading}
              value={summary.salaryTotalCurrentMonth ?? '-'}
              prefix={<DollarOutlined style={{ color: 'white' }} />}
              precision={0}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>今日出勤率</span>}
              loading={loading}
              value={summary.todayAttendanceRate ?? '-'}
              prefix={<CalendarOutlined style={{ color: 'white' }} />}
              precision={1}
              valueStyle={{ color: '#fff' }}
              suffix={typeof summary.todayAttendanceRate === 'number' ? '%' : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>招聘中职位</span>}
              loading={loading}
              value={summary.recruitmentOpenPositions ?? '-'}
              prefix={<FileSearchOutlined style={{ color: 'white' }} />}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="最近入职员工" style={{ height: '100%' }}>
            <Table
              dataSource={dataSource}
              columns={columns}
              pagination={false}
              size="small"
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="部门分布" style={{ height: '100%' }}>
            {(summary.departments || []).map((d, idx) => (
              <div key={idx} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>{d.name}</span>
                  <span>{d.count}人 ({d.percent}%)</span>
                </div>
                <Progress percent={Number(d.percent) || 0} strokeColor="#1890ff" />
              </div>
            ))}
            {(!summary.departments || summary.departments.length === 0) && (
              <Text type="secondary">暂无数据</Text>
            )}
          </Card>
        </Col>
      </Row>

      
    </div>
  )
}

export default Dashboard

