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
  Modal,
  Form,
  Input,
  message,
  Divider,
  Popconfirm,
} from 'antd'
import { SearchOutlined, PlusOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  listAttendance,
  upsertAttendance,
  deleteAttendance,
  getEmployees,
  getMyAttendance,
  punchMyAttendance,
  listMyAttendanceExceptions,
  createMyAttendanceException,
  listAttendanceExceptions,
  reviewAttendanceException,
} from '../api/client'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// 状态码转中文展示
const parseStatusText = (status) => {
  const map = {
    present: '出勤',
    leave: '请假',
    absent: '缺勤',
    business_trip: '出差',
  }
  return map[status] || status || '未知'
}

// 考勤结果码转中文展示
const parseResultText = (result) => {
  const map = {
    normal: '正常',
    late: '迟到',
    early_leave: '早退',
    late_early: '迟到+早退',
    leave: '请假',
    absent: '缺勤',
    business_trip: '出差',
    abnormal: '异常',
  }
  return map[result] || result || '未知'
}

// 结果状态映射为标签颜色
const resultColor = (result) => {
  if (result === 'normal') return 'green'
  if (result === 'late' || result === 'early_leave') return 'orange'
  if (result === 'late_early' || result === 'abnormal' || result === 'absent') return 'red'
  if (result === 'leave') return 'gold'
  if (result === 'business_trip') return 'blue'
  return 'default'
}

// 后端字段统一映射为前端展示字段
const mapAttendanceRow = (row) => ({
  key: row.id || `${row.date}-${row.employee_id}`,
  id: row.id,
  employeeId: row.employee_id,
  name: row.name || row.employee_id,
  department: row.department || '未分配',
  date: row.date,
  status: row.status,
  statusText: parseStatusText(row.status),
  attendanceResult: row.attendance_result,
  attendanceResultText: parseResultText(row.attendance_result),
  attendanceType: row.attendance_type || 'office',
  checkIn: row.check_in || '-',
  checkOut: row.check_out || '-',
  workHours: row.work_hours != null ? Number(row.work_hours) : 0,
  breakMinutes: Number(row.break_minutes || 0),
  lateMinutes: Number(row.late_minutes || 0),
  earlyLeaveMinutes: Number(row.early_leave_minutes || 0),
  overtimeMinutes: Number(row.overtime_minutes || 0),
  punchSource: row.punch_source || '-',
  note: row.note || '',
})

// 考勤页面：管理员与员工双视角
const Attendance = () => {
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState([])
  const [employees, setEmployees] = useState([])
  const [filters, setFilters] = useState({
    range: [dayjs().startOf('month'), dayjs()],
    department: undefined,
    status: undefined,
    attendanceResult: undefined,
    attendanceType: undefined,
    keyword: '',
  })

  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [form] = Form.useForm()

  const [myLoading, setMyLoading] = useState(false)
  const [myEmployee, setMyEmployee] = useState(null)
  const [myToday, setMyToday] = useState(null)
  const [myRows, setMyRows] = useState([])
  const [myMonthStats, setMyMonthStats] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [punching, setPunching] = useState(false)

  const [myExceptions, setMyExceptions] = useState([])
  const [exceptionModalVisible, setExceptionModalVisible] = useState(false)
  const [exceptionForm] = Form.useForm()

  const [adminExceptions, setAdminExceptions] = useState([])
  const [adminExceptionLoading, setAdminExceptionLoading] = useState(false)

  let currentUser = {}
  try {
    currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  } catch (e) {}
  const isAdmin = currentUser?.role === 'admin'

  // 管理端：加载员工列表（用于下拉选择）
  const loadEmployees = async () => {
    if (!isAdmin) return
    try {
      const rows = await getEmployees()
      setEmployees(rows || [])
    } catch (e) {
      setEmployees([])
    }
  }

  // 管理端：加载考勤列表（支持筛选）
  const loadAdminAttendance = async () => {
    if (!isAdmin) return
    try {
      setLoading(true)
      const params = {
        startDate: filters.range?.[0]?.format('YYYY-MM-DD'),
        endDate: filters.range?.[1]?.format('YYYY-MM-DD'),
        department: filters.department,
        status: filters.status,
        attendanceResult: filters.attendanceResult,
        attendanceType: filters.attendanceType,
        keyword: filters.keyword?.trim() || undefined,
      }
      const rows = await listAttendance(params)
      setDataSource((rows || []).map(mapAttendanceRow))
    } catch (e) {
      message.error('加载考勤数据失败')
      setDataSource([])
    } finally {
      setLoading(false)
    }
  }

  // 管理端：加载待审批异常申请
  const loadAdminExceptions = async () => {
    if (!isAdmin) return
    try {
      setAdminExceptionLoading(true)
      const rows = await listAttendanceExceptions({ status: 'pending' })
      setAdminExceptions(rows || [])
    } catch (e) {
      setAdminExceptions([])
    } finally {
      setAdminExceptionLoading(false)
    }
  }

  // 员工端：加载本人考勤与统计
  const loadMyAttendance = async () => {
    if (isAdmin) return
    try {
      setMyLoading(true)
      const endDate = dayjs().format('YYYY-MM-DD')
      const startDate = dayjs().subtract(29, 'day').format('YYYY-MM-DD')
      const data = await getMyAttendance({ startDate, endDate })
      setMyEmployee(data?.employee || null)
      setMyToday(data?.today || null)
      setMyRows((data?.rows || []).map((row) => mapAttendanceRow({ ...row, name: data?.employee?.name, department: data?.employee?.department })))
      setMyMonthStats(data?.monthStats || null)
      setPolicy(data?.policy || null)
    } catch (e) {
      message.error(e?.response?.data?.error || '加载个人考勤失败')
      setMyRows([])
      setMyToday(null)
      setMyMonthStats(null)
    } finally {
      setMyLoading(false)
    }
  }

  // 员工端：加载本人异常申请
  const loadMyExceptions = async () => {
    if (isAdmin) return
    try {
      const rows = await listMyAttendanceExceptions()
      setMyExceptions(rows || [])
    } catch (e) {
      setMyExceptions([])
    }
  }

  // 首次进入：按角色加载数据
  useEffect(() => {
    if (isAdmin) {
      loadEmployees()
      loadAdminAttendance()
      loadAdminExceptions()
    } else {
      loadMyAttendance()
      loadMyExceptions()
    }
  }, [])

  // 管理端：打开新增考勤弹窗
  const openCreateModal = () => {
    setEditingRow(null)
    form.setFieldsValue({
      date: dayjs().format('YYYY-MM-DD'),
      status: 'present',
      attendanceType: 'office',
      breakMinutes: 60,
      checkIn: undefined,
      checkOut: undefined,
      note: '',
    })
    setIsModalVisible(true)
  }

  // 管理端：打开编辑考勤弹窗
  const openEditModal = (row) => {
    setEditingRow(row)
    form.setFieldsValue({
      employeeId: row.employeeId,
      date: row.date,
      status: row.status,
      attendanceType: row.attendanceType,
      breakMinutes: row.breakMinutes,
      checkIn: row.checkIn === '-' ? undefined : row.checkIn,
      checkOut: row.checkOut === '-' ? undefined : row.checkOut,
      note: row.note,
    })
    setIsModalVisible(true)
  }

  // 管理端：提交考勤新增/更新
  const submitAttendance = async (values) => {
    try {
      const date = values.date
      const employeeId = values.employeeId
      const payload = {
        id: editingRow?.id || `ATT-${date}-${employeeId}`,
        employee_id: employeeId,
        date,
        status: values.status,
        attendance_type: values.attendanceType,
        break_minutes: values.breakMinutes,
        check_in: values.checkIn || null,
        check_out: values.checkOut || null,
        note: values.note || null,
      }
      await upsertAttendance(payload)
      message.success(editingRow ? '考勤记录已更新' : '考勤记录添加成功')
      setIsModalVisible(false)
      form.resetFields()
      loadAdminAttendance()
    } catch (e) {
      message.error(e?.response?.data?.error || '保存考勤记录失败')
    }
  }

  // 管理端：删除考勤记录
  const handleDeleteAttendance = async (row) => {
    try {
      await deleteAttendance(row.id)
      message.success('考勤记录已删除')
      loadAdminAttendance()
    } catch (e) {
      message.error(e?.response?.data?.error || '删除考勤记录失败')
    }
  }

  // 员工端：签到/签退
  const handlePunch = async (type) => {
    try {
      setPunching(true)
      await punchMyAttendance(type)
      message.success(type === 'check_in' ? '签到成功' : '签退成功')
      loadMyAttendance()
    } catch (e) {
      const status = e?.response?.status
      const errMsg = e?.response?.data?.error || '打卡失败'
      if (status === 409) message.warning(errMsg)
      else message.error(errMsg)
      loadMyAttendance()
    } finally {
      setPunching(false)
    }
  }

  // 员工端：提交异常/补卡申请
  const submitMyException = async (values) => {
    try {
      await createMyAttendanceException({
        date: values.date,
        type: values.type,
        reason: values.reason,
        expected_check_in: values.expectedCheckIn || null,
        expected_check_out: values.expectedCheckOut || null,
      })
      message.success('异常申请已提交')
      setExceptionModalVisible(false)
      exceptionForm.resetFields()
      loadMyExceptions()
    } catch (e) {
      message.error(e?.response?.data?.error || '提交失败')
    }
  }

  // 管理端：审批异常申请
  const reviewException = async (id, action) => {
    try {
      await reviewAttendanceException(id, { action, review_note: action === 'approved' ? '审批通过' : '审批驳回' })
      message.success(action === 'approved' ? '已批准' : '已驳回')
      loadAdminExceptions()
      loadAdminAttendance()
    } catch (e) {
      message.error(e?.response?.data?.error || '审批失败')
    }
  }

  // 管理端：考勤统计汇总
  const adminStats = useMemo(() => {
    const total = dataSource.length
    const normal = dataSource.filter((x) => x.attendanceResult === 'normal').length
    const late = dataSource.filter((x) => x.lateMinutes > 0).length
    const early = dataSource.filter((x) => x.earlyLeaveMinutes > 0).length
    const overtimeH = Math.round((dataSource.reduce((s, x) => s + Number(x.overtimeMinutes || 0), 0) / 60) * 10) / 10
    return [
      { title: '记录总数', value: total },
      { title: '正常', value: normal },
      { title: '迟到次数', value: late },
      { title: '早退次数', value: early },
      { title: '累计加班(小时)', value: overtimeH },
    ]
  }, [dataSource])

  const adminColumns = [
    { title: '员工ID', dataIndex: 'employeeId', key: 'employeeId', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '部门', dataIndex: 'department', key: 'department', width: 120, render: (v) => <Tag>{v}</Tag> },
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'attendanceType', key: 'attendanceType', width: 90, render: (v) => <Tag>{v === 'remote' ? '远程' : '现场'}</Tag> },
    { title: '签到', dataIndex: 'checkIn', key: 'checkIn', width: 90 },
    { title: '签退', dataIndex: 'checkOut', key: 'checkOut', width: 90 },
    { title: '工时', dataIndex: 'workHours', key: 'workHours', width: 80, render: (v) => `${v || 0}h` },
    { title: '休息', dataIndex: 'breakMinutes', key: 'breakMinutes', width: 80, render: (v) => `${v}m` },
    { title: '迟到', dataIndex: 'lateMinutes', key: 'lateMinutes', width: 80, render: (v) => `${v}m` },
    { title: '早退', dataIndex: 'earlyLeaveMinutes', key: 'earlyLeaveMinutes', width: 80, render: (v) => `${v}m` },
    { title: '加班', dataIndex: 'overtimeMinutes', key: 'overtimeMinutes', width: 80, render: (v) => `${v}m` },
    { title: '结果', dataIndex: 'attendanceResultText', key: 'attendanceResultText', width: 120, render: (_, r) => <Tag color={resultColor(r.attendanceResult)}>{r.attendanceResultText}</Tag> },
    { title: '来源', dataIndex: 'punchSource', key: 'punchSource', width: 90 },
    { title: '备注', dataIndex: 'note', key: 'note', width: 180, ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(row)}>编辑</Button>
          <Popconfirm title="确认删除该考勤记录？" onConfirm={() => handleDeleteAttendance(row)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const myColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'attendanceType', key: 'attendanceType', width: 90, render: (v) => <Tag>{v === 'remote' ? '远程' : '现场'}</Tag> },
    { title: '签到', dataIndex: 'checkIn', key: 'checkIn', width: 90 },
    { title: '签退', dataIndex: 'checkOut', key: 'checkOut', width: 90 },
    { title: '工时', dataIndex: 'workHours', key: 'workHours', width: 80, render: (v) => `${v || 0}h` },
    { title: '迟到', dataIndex: 'lateMinutes', key: 'lateMinutes', width: 80, render: (v) => `${v}m` },
    { title: '早退', dataIndex: 'earlyLeaveMinutes', key: 'earlyLeaveMinutes', width: 80, render: (v) => `${v}m` },
    { title: '加班', dataIndex: 'overtimeMinutes', key: 'overtimeMinutes', width: 80, render: (v) => `${v}m` },
    { title: '结果', dataIndex: 'attendanceResultText', key: 'attendanceResultText', width: 120, render: (_, r) => <Tag color={resultColor(r.attendanceResult)}>{r.attendanceResultText}</Tag> },
    { title: '备注', dataIndex: 'note', key: 'note', width: 180 },
  ]

  const myExceptionColumns = [
    { title: '申请日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
    { title: '补签到', dataIndex: 'expected_check_in', key: 'expected_check_in', width: 90, render: (v) => v || '-' },
    { title: '补签退', dataIndex: 'expected_check_out', key: 'expected_check_out', width: 90, render: (v) => v || '-' },
    { title: '原因', dataIndex: 'reason', key: 'reason' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (v) => <Tag color={v === 'approved' ? 'green' : (v === 'rejected' ? 'red' : 'gold')}>{v}</Tag> },
  ]

  const adminExceptionColumns = [
    { title: '员工', dataIndex: 'name', key: 'name', width: 120 },
    { title: '部门', dataIndex: 'department', key: 'department', width: 120 },
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
    { title: '补签到', dataIndex: 'expected_check_in', key: 'expected_check_in', width: 90, render: (v) => v || '-' },
    { title: '补签退', dataIndex: 'expected_check_out', key: 'expected_check_out', width: 90, render: (v) => v || '-' },
    { title: '原因', dataIndex: 'reason', key: 'reason' },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) => (
        <Space>
          <Popconfirm title="确认通过该申请？" onConfirm={() => reviewException(row.id, 'approved')}>
            <Button size="small" type="primary">通过</Button>
          </Popconfirm>
          <Popconfirm title="确认驳回该申请？" onConfirm={() => reviewException(row.id, 'rejected')}>
            <Button size="small" danger>驳回</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!isAdmin) {
    const canCheckIn = !myToday?.check_in
    const canCheckOut = !!myToday?.check_in && !myToday?.check_out

    return (
      <div>
        <Title level={2} style={{ marginTop: 0 }}>我的考勤</Title>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Card loading={myLoading}>
              <Statistic title="今日考勤结果" value={parseResultText(myToday?.attendance_result || myToday?.status || 'abnormal')} prefix={<ClockCircleOutlined />} />
              <div style={{ marginTop: 12 }}><Text type="secondary">员工：</Text><Text>{myEmployee?.name || currentUser?.username || '-'}</Text></div>
              <div><Text type="secondary">班次：</Text><Text>{policy ? `${policy.shiftStart} - ${policy.shiftEnd}` : '09:00 - 18:00'}</Text></div>
              <div><Text type="secondary">容错：</Text><Text>{policy?.graceMinutes ?? 10} 分钟</Text></div>
            </Card>
          </Col>
          <Col xs={24} md={16}>
            <Card loading={myLoading} title="今日打卡">
              <Space wrap>
                <Button type="primary" disabled={!canCheckIn} loading={punching} onClick={() => handlePunch('check_in')}>签到</Button>
                <Button disabled={!canCheckOut} loading={punching} onClick={() => handlePunch('check_out')}>签退</Button>
                <Text>签到：{myToday?.check_in || '-'}</Text>
                <Text>签退：{myToday?.check_out || '-'}</Text>
                <Text>工时：{myToday?.work_hours ?? 0}h</Text>
                <Text>迟到：{myToday?.late_minutes ?? 0}m</Text>
                <Text>加班：{myToday?.overtime_minutes ?? 0}m</Text>
              </Space>
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="本月正常" value={myMonthStats?.normalDays ?? 0} /></Card></Col>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="本月迟到" value={myMonthStats?.lateTimes ?? 0} /></Card></Col>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="本月早退" value={myMonthStats?.earlyLeaveTimes ?? 0} /></Card></Col>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="本月加班(小时)" value={myMonthStats?.overtimeHours ?? 0} /></Card></Col>
        </Row>

        <Card title="近30天个人考勤记录" style={{ marginBottom: 16 }}>
          <Table rowKey="key" columns={myColumns} dataSource={myRows} loading={myLoading} scroll={{ x: 1100 }} pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }} />
        </Card>

        <Card
          title="异常申请（补卡/请假）"
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setExceptionModalVisible(true)}>提交申请</Button>}
        >
          <Table rowKey="id" columns={myExceptionColumns} dataSource={myExceptions} pagination={{ pageSize: 8 }} />
        </Card>

        <Modal
          title="提交考勤异常申请"
          open={exceptionModalVisible}
          onCancel={() => setExceptionModalVisible(false)}
          footer={null}
        >
          <Form form={exceptionForm} layout="vertical" onFinish={submitMyException} initialValues={{ date: dayjs().format('YYYY-MM-DD'), type: '补卡' }}>
            <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}><Input type="date" /></Form.Item>
            <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
              <Select>
                <Select.Option value="补卡">补卡</Select.Option>
                <Select.Option value="请假">请假</Select.Option>
                <Select.Option value="出差">出差</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="expectedCheckIn" label="补签到时间"><Input type="time" /></Form.Item>
            <Form.Item name="expectedCheckOut" label="补签退时间"><Input type="time" /></Form.Item>
            <Form.Item name="reason" label="申请原因" rules={[{ required: true, message: '请填写申请原因' }]}><Input.TextArea rows={4} /></Form.Item>
            <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
              <Space>
                <Button onClick={() => setExceptionModalVisible(false)}>取消</Button>
                <Button htmlType="submit" type="primary">提交</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>考勤管理</Title>
        <Space wrap>
          <RangePicker value={filters.range} onChange={(v) => setFilters((s) => ({ ...s, range: v }))} />
          <Select placeholder="部门" allowClear style={{ width: 130 }} value={filters.department} onChange={(v) => setFilters((s) => ({ ...s, department: v }))}
            options={[...new Set((employees || []).map((e) => e.department).filter(Boolean))].map((d) => ({ label: d, value: d }))}
          />
          <Select placeholder="出勤状态" allowClear style={{ width: 130 }} value={filters.status} onChange={(v) => setFilters((s) => ({ ...s, status: v }))}
            options={[{ label: '出勤', value: 'present' }, { label: '请假', value: 'leave' }, { label: '缺勤', value: 'absent' }, { label: '出差', value: 'business_trip' }]}
          />
          <Select placeholder="考勤结果" allowClear style={{ width: 140 }} value={filters.attendanceResult} onChange={(v) => setFilters((s) => ({ ...s, attendanceResult: v }))}
            options={[{ label: '正常', value: 'normal' }, { label: '迟到', value: 'late' }, { label: '早退', value: 'early_leave' }, { label: '迟到+早退', value: 'late_early' }]}
          />
          <Select placeholder="打卡类型" allowClear style={{ width: 120 }} value={filters.attendanceType} onChange={(v) => setFilters((s) => ({ ...s, attendanceType: v }))}
            options={[{ label: '现场', value: 'office' }, { label: '远程', value: 'remote' }]}
          />
          <Input placeholder="员工姓名/工号" style={{ width: 180 }} value={filters.keyword} onChange={(e) => setFilters((s) => ({ ...s, keyword: e.target.value }))} />
          <Button icon={<SearchOutlined />} onClick={loadAdminAttendance}>查询</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新增记录</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {adminStats.map((it) => (
          <Col xs={24} sm={12} md={8} lg={4} key={it.title}><Card><Statistic title={it.title} value={it.value} /></Card></Col>
        ))}
      </Row>

      <Card title="考勤记录" style={{ marginBottom: 16 }}>
        <Table rowKey="key" columns={adminColumns} dataSource={dataSource} loading={loading} scroll={{ x: 1800 }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }} />
      </Card>

      <Card title="待审批异常申请">
        <Table rowKey="id" columns={adminExceptionColumns} dataSource={adminExceptions} loading={adminExceptionLoading} pagination={{ pageSize: 8 }} />
      </Card>

      <Modal title={editingRow ? '编辑考勤记录' : '新增考勤记录'} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={submitAttendance}>
          <Form.Item name="employeeId" label="员工" rules={[{ required: true, message: '请选择员工' }]}>
            <Select disabled={!!editingRow} placeholder="选择员工">
              {employees.map((emp) => <Select.Option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}><Input type="date" /></Form.Item>
          <Form.Item name="status" label="出勤状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select>
              <Select.Option value="present">出勤</Select.Option>
              <Select.Option value="leave">请假</Select.Option>
              <Select.Option value="absent">缺勤</Select.Option>
              <Select.Option value="business_trip">出差</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="attendanceType" label="打卡类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select>
              <Select.Option value="office">现场</Select.Option>
              <Select.Option value="remote">远程</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="breakMinutes" label="休息时长(分钟)"><Input type="number" /></Form.Item>
          <Form.Item name="checkIn" label="签到时间"><Input type="time" /></Form.Item>
          <Form.Item name="checkOut" label="签退时间"><Input type="time" /></Form.Item>
          <Form.Item name="note" label="备注"><Input /></Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Attendance
