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
  Upload,
  Input,
  Select,
  DatePicker,
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
import * as api from '../api/client'
const { listPositions, createPosition, updatePosition, deletePosition, getEmployees, postApplication, listApplications, deleteApplication, baseURL, getApplication, updateApplication, createInterview, listInterviews } = api
import { message } from 'antd'

const { Title } = Typography
const { TextArea } = Input

const Recruitment = () => {
  const [dataSource, setDataSource] = useState([])
  const [loading, setLoading] = useState(false)
   const isAdmin = (() => {
     try {
       if (typeof window === 'undefined') return false
       const u = JSON.parse(localStorage.getItem('auth_user') || '{}')
       return u && u.role === 'admin'
     } catch (e) {
       return false
     }
   })()

  const fetchPositions = () => {
    setLoading(true)
    listPositions()
      .then((rows) => {
        // 后端使用 status = 'open'|'closed'，前端需要展示为中文。
        // 保留原始状态到 `rawStatus`，并将展示字段写入 `status`。
        setDataSource(
          rows.map((r) => ({
            ...r,
            position: r.title || r.position,
            rawStatus: r.status,
            status: r.status === 'open' ? '招聘中' : r.status === 'closed' ? '已关闭' : r.status,
            candidates: Number(r.candidates) || 0,
            key: r.id,
          }))
        )
      })
      .catch(() => {
        message.error('加载职位列表失败')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPositions()
  }, [])

  // 简单实时：轮询更新职位列表（每 15 秒）
  useEffect(() => {
    // 仅在页面可见时轮询；不可见时暂停，切换回可见时立即刷新一次并恢复轮询
    let timer = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        fetchPositions()
      }, 60000)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const handleVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        stop()
      } else {
        // 切回可见时立即刷新一次，然后恢复轮询
        fetchPositions()
        start()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
      // 根据当前可见性决定是否启动轮询
      if (!document.hidden) start()
    }

    return () => {
      stop()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form] = Form.useForm()
  useEffect(() => () => { window.__setDirty && window.__setDirty(false) }, [])

  // 查看部门员工相关状态
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [viewDept, setViewDept] = useState('')
  const [deptEmployees, setDeptEmployees] = useState([])
  const [deptApplications, setDeptApplications] = useState([])
  const [loadingDeptApplications, setLoadingDeptApplications] = useState(false)
  const [loadingDeptEmployees, setLoadingDeptEmployees] = useState(false)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')

  const employeeColumns = [
    { title: '员工ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '职位', dataIndex: 'position', key: 'position', width: 140 },
    { title: '级别', dataIndex: 'level', key: 'level', width: 100 },
    {
      title: '联系方式', key: 'contact', width: 200, render: (_, record) => (
        <div>
          <div>{record.email}</div>
          <div>{record.phone}</div>
        </div>
      ),
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
    { title: '入职日期', dataIndex: 'joinDate', key: 'joinDate', width: 120 },
  ]
 

  // 查看对应部门的投递简历（由“查看”操作触发）
  const handleView = async (record) => {
    setViewDept(record.department)
    setLoadingDeptApplications(true)
    try {
      // 从当前 dataSource 中找出属于该部门的所有职位
      const positionsInDept = (dataSource || []).filter((p) => p.department === record.department)
      const appsByPosition = await Promise.all(
        positionsInDept.map(async (p) => {
          try {
            const list = await listApplications(p.id)
            return (list || []).map((a) => ({ ...a, positionId: p.id, positionTitle: p.position || p.title }))
          } catch (e) {
            return []
          }
        })
      )
      const aggregated = appsByPosition.flat().map((a) => ({ ...a, key: a.id }))
      setDeptApplications(aggregated)
      setViewModalVisible(true)
    } catch (err) {
      message.error('获取投递简历失败')
    } finally {
      setLoadingDeptApplications(false)
    }
  }

  // 应聘者投递简历相关状态
  const [appModalVisible, setAppModalVisible] = useState(false)
  const [appPosition, setAppPosition] = useState(null)
  const [appForm] = Form.useForm()

  // 编辑候选人（管理员）
  const [editAppModalVisible, setEditAppModalVisible] = useState(false)
  const [editApp, setEditApp] = useState(null)
  const [editForm] = Form.useForm()

  const handleOpenApply = (record) => {
    setAppPosition(record)
    appForm.resetFields()
    setAppModalVisible(true)
  }

  const handleSubmitApplication = () => {
    appForm.validateFields().then(async (values) => {
        try {
          const formData = new FormData()
          formData.append('name', values.name)
          formData.append('email', values.email)
          formData.append('phone', values.phone)
          const resumeList = values.resume || []
          if (resumeList && resumeList.length > 0) {
            const f = resumeList[0].originFileObj || resumeList[0].originFile || resumeList[0]
            formData.append('resume', f)
          }
          await postApplication(appPosition.id, formData)
        message.success('投递成功，感谢你的应聘')
        setAppModalVisible(false)
        fetchPositions()
      } catch (err) {
        message.error('投递失败')
      }
    })
  }

  const handleDeleteApplication = (record) => {
    Modal.confirm({
      title: '确认删除简历',
      content: `确定删除候选人 ${record.name} 的投递记录及文件吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteApplication(record.id)
          message.success('删除成功')
          setDeptApplications((prev) => prev.filter((a) => a.id !== record.id))
          fetchPositions()
        } catch (err) {
          message.error('删除失败')
        }
      },
    })
  }

  const handleEditApplication = async (record) => {
    try {
      // 获取更完整的信息与面试记录
      const data = await getApplication(record.id)
      setEditApp(data)
      editForm.setFieldsValue({
        status: data.status || 'applied',
        interviewer: data.interviewer || '',
        interview_time: data.interview_time || null,
        notes: data.notes || '',
      })
      setEditAppModalVisible(true)
    } catch (e) {
      message.error('加载候选人失败')
    }
  }

  const handleSaveEditApplication = async () => {
    try {
      const values = await editForm.validateFields()
      // interview_time 可能是 moment 对象或字符串
      let itime = values.interview_time || null
      if (itime && itime.toISOString) itime = itime.toISOString()
      await updateApplication(editApp.id, {
        status: values.status,
        interviewer: values.interviewer,
        interview_time: itime,
        notes: values.notes,
      })
      message.success('更新成功')
      setEditAppModalVisible(false)
      // 重新刷新当前部门的申请列表与职位列表
      fetchPositions()
      if (viewDept) {
        // 触发查看刷新
        const positionsInDept = (dataSource || []).filter((p) => p.department === viewDept)
        const appsByPosition = await Promise.all(
          positionsInDept.map(async (p) => {
            try {
              const list = await listApplications(p.id)
              return (list || []).map((a) => ({ ...a, positionId: p.id, positionTitle: p.position || p.title }))
            } catch (e) {
              return []
            }
          })
        )
        setDeptApplications(appsByPosition.flat().map((a) => ({ ...a, key: a.id })))
      }
    } catch (e) {
      message.error('保存失败')
    }
  }

  const handleCreateInterview = async (payload) => {
    try {
      await createInterview(editApp.id, payload)
      message.success('面试已创建')
      // 刷新面试记录在编辑面板中
      const updated = await getApplication(editApp.id)
      setEditApp(updated)
    } catch (e) {
      message.error('创建面试失败')
    }
  }

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
    // 已移除：面试数、Offer数、进度、发布日期、截止日期
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="middle">
          {isAdmin && (
            <Button type="link" icon={<EyeOutlined />} size="small" onClick={() => handleView(record)}>
              查看
            </Button>
          )}
          <Button type="link" size="small" onClick={() => handleOpenApply(record)}>
            投递简历
          </Button>
          {isAdmin && (
            <Button
              type="link"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          )}
          {isAdmin && record.status === '招聘中' && (
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
    // 新建默认状态为 '招聘中'
    form.setFieldsValue({ status: '招聘中' })
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingRecord(record)
    // record.status 是展示用的中文，填入表单以便编辑
    form.setFieldsValue({ ...record, status: record.status })
    setIsModalVisible(true)
  }

  const handleClose = async (key) => {
    const target = dataSource.find((x) => x.key === key)
    if (!target) return
    try {
      // 发送给后端的 status 需要是 'closed'
      await updatePosition(target.id, {
        title: target.position || target.title,
        department: target.department,
        status: 'closed',
        requirements: target.requirements,
      })
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
        // 表单中使用中文展示状态，提交时转换为后端的 'open'/'closed'
        status: values.status === '招聘中' ? 'open' : 'closed',
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
    // 已移除：总面试数、总Offer数
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
         {isAdmin && (
           <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
             发布新职位
           </Button>
         )}
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
            <Col span={8}>
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
            <Col span={4}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select>
                  <Select.Option value="招聘中">招聘中</Select.Option>
                  <Select.Option value="已关闭">已关闭</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          {/* 已移除：发布日期与截止日期字段 */}
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

      <Modal
        title={editApp ? `编辑候选人：${editApp.name}` : '编辑候选人'}
        open={editAppModalVisible}
        onOk={handleSaveEditApplication}
        onCancel={() => setEditAppModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="status" label="当前状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select>
              <Select.Option value="applied">应聘中</Select.Option>
              <Select.Option value="phone-screen">电话筛选</Select.Option>
              <Select.Option value="interview">面试中</Select.Option>
              <Select.Option value="offer">已发 Offer</Select.Option>
              <Select.Option value="hired">已录用</Select.Option>
              <Select.Option value="rejected">已拒绝</Select.Option>
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="interviewer" label="面试官">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="interview_time" label="面试时间">
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={4} />
          </Form.Item>

          <div style={{ marginTop: 8 }}>
            <Title level={5} style={{ margin: 0 }}>面试安排</Title>
            <div style={{ marginTop: 8 }}>
              <Button type="dashed" onClick={async () => {
                // 以表单内的 interviewer 和 interview_time 创建一次面试（简易方式）
                const vals = editForm.getFieldsValue()
                let itime = vals.interview_time || null
                if (itime && itime.toISOString) itime = itime.toISOString()
                await handleCreateInterview({ interviewer: vals.interviewer, time: itime, mode: 'online' })
              }}>创建面试</Button>
            </div>
            {editApp && editApp.interviews && editApp.interviews.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Table size="small" dataSource={editApp.interviews} pagination={false} rowKey="id" columns={[
                  { title: '面试ID', dataIndex: 'id', key: 'id' },
                  { title: '面试官', dataIndex: 'interviewer', key: 'interviewer' },
                  { title: '时间', dataIndex: 'time', key: 'time' },
                  { title: '形式', dataIndex: 'mode', key: 'mode' },
                  { title: '结果', dataIndex: 'outcome', key: 'outcome' },
                ]} />
              </div>
            )}
          </div>
        </Form>
      </Modal>

      <Modal
        title={appPosition ? `投递：${appPosition.position}` : '投递简历'}
        open={appModalVisible}
        onOk={handleSubmitApplication}
        onCancel={() => setAppModalVisible(false)}
        okText="提交"
        cancelText="取消"
      >
        <Form form={appForm} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: false }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="resume"
            label="简历（PDF/DOC）"
            valuePropName="fileList"
            getValueFromEvent={(e) => {
              if (Array.isArray(e)) return e
              return (e && e.fileList) ? e.fileList : []
            }}
          >
            <Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.doc,.docx">
              <Button>选择文件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`部门：${viewDept} 的投递简历`}
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={null}
        width={900}
      >
        <Table
          columns={[
            { title: '候选ID', dataIndex: 'id', key: 'id', width: 120 },
            { title: '姓名', dataIndex: 'name', key: 'name', width: 140 },
            { title: '邮箱', dataIndex: 'email', key: 'email', width: 180 },
            { title: '电话', dataIndex: 'phone', key: 'phone', width: 140 },
            { title: '职位', dataIndex: 'positionTitle', key: 'positionTitle', width: 180 },
            { title: '提交日期', dataIndex: 'submitDate', key: 'submitDate', width: 140 },
            {
              title: '简历', dataIndex: 'resume_path', key: 'resume_path', width: 160,
              render: (val, record) => {
                if (!val) return '无'
                // 使用后端预览接口展示（支持 PDF 内嵌和 docx->HTML 转换）
                const previewUrl = `${baseURL.replace(/\/$/, '')}/api/applications/${record.id}/resume/preview`
                return (
                  <Space>
                    <Button size="small" type="link" onClick={() => {
                      setPreviewSrc(previewUrl)
                      setPreviewModalVisible(true)
                    }}>预览</Button>
                    <a
                      href={val.startsWith('http') ? val : `/${val}`}
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.href = val.startsWith('http') ? val : `/${val}`
                      }}
                      download
                    >
                      下载
                    </a>
                  </Space>
                )
              }
            },
            { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
            {
              title: '操作', key: 'action', width: 120,
              render: (_, record) => (
                <Space>
                  {isAdmin ? (
                    <>
                      <Button size="small" type="link" onClick={() => handleEditApplication(record)}>编辑</Button>
                      <Button size="small" danger type="link" onClick={() => handleDeleteApplication(record)}>删除</Button>
                    </>
                  ) : (
                    <span style={{ color: '#999' }}>无</span>
                  )}
                </Space>
              ),
            },
          ]}
          dataSource={deptApplications}
          loading={loadingDeptApplications}
          pagination={{ pageSize: 8 }}
          rowKey="id"
        />
      </Modal>

      <Modal
        title="简历预览"
        open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)}
        footer={null}
        width={800}
        styles={{ body: { padding: 0 } }}
      >
        {previewSrc ? (
          <iframe
            src={previewSrc}
            title="简历预览"
            style={{ width: '100%', height: '640px', border: 0 }}
          />
        ) : (
          <div style={{ padding: 16 }}>无预览内容</div>
        )}
      </Modal>
    </div>
  )
}

export default Recruitment

