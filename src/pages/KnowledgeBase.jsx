import React, { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Upload,
  message,
  Input,
  Progress,
  Modal,
  Row,
  Col,
  Statistic,
  Tooltip,
  Popconfirm,
  Divider,
  Alert,
} from 'antd'
import {
  UploadOutlined,
  DeleteOutlined,
  SearchOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { ingestTextFile, listKnowledgeDocs, getDocContent, deleteKnowledgeDoc } from '../api/client'

const { Title, Text } = Typography
const { Search } = Input

const KnowledgeBase = () => {
  const [dataSource, setDataSource] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const docs = await listKnowledgeDocs()
        const mapped = docs.map((d, idx) => ({
          key: String(idx + 1),
          id: d.id,
          name: d.name,
          type: d.type || d.name.split('.').pop().toUpperCase(),
          size: d.size || '-',
          status: d.status || '已索引',
          chunks: d.chunks ?? 0,
          vectors: d.vectors ?? 0,
          uploadTime: d.uploadTime || '-',
          indexTime: d.indexTime || '-',
          similarity: d.similarity ?? 0.9,
        }))
        setDataSource(mapped)
      } catch (e) {
        setLoadError('加载知识库失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const [isModalVisible, setIsModalVisible] = useState(false)
  const [viewingDoc, setViewingDoc] = useState(null)

  const columns = [
    {
      title: '文档ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: '文档名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name, record) => (
        <Space>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <Button
            type="link"
            onClick={() => {
              setViewingDoc(record)
              setIsModalVisible(true)
            }}
          >
            {name}
          </Button>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => {
        const colorMap = {
          PDF: 'red',
          DOCX: 'blue',
          XLSX: 'green',
          Markdown: 'purple',
        }
        return <Tag color={colorMap[type] || 'default'}>{type}</Tag>
      },
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status, record) => {
        if (status === '已索引') {
          return (
            <Tag icon={<CheckCircleOutlined />} color="success">
              {status}
            </Tag>
          )
        } else if (status === '索引中') {
          return (
            <div>
              <Tag icon={<SyncOutlined spin />} color="processing">
                {status}
              </Tag>
              <Progress
                percent={record.progress}
                size="small"
                style={{ marginTop: 4, width: 80 }}
              />
            </div>
          )
        }
        return <Tag color="default">{status}</Tag>
      },
    },
    {
      title: '文档块数',
      dataIndex: 'chunks',
      key: 'chunks',
      width: 100,
      render: (chunks) => (
        <Tooltip title="文档被分割成的块数量">
          <Tag color="cyan">{chunks} 块</Tag>
        </Tooltip>
      ),
    },
    {
      title: '向量数量',
      dataIndex: 'vectors',
      key: 'vectors',
      width: 100,
      render: (vectors, record) => (
        <Tooltip title="已生成的向量嵌入数量">
          <Tag color="purple">
            {vectors} / {record.chunks}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '平均相似度',
      dataIndex: 'similarity',
      key: 'similarity',
      width: 120,
      render: (similarity) => {
        if (similarity === 0) return <Text type="secondary">-</Text>
        const percent = (similarity * 100).toFixed(1)
        return (
          <Progress
            type="circle"
            percent={parseFloat(percent)}
            size={50}
            format={() => `${percent}%`}
            strokeColor={similarity > 0.9 ? '#52c41a' : similarity > 0.8 ? '#1890ff' : '#faad14'}
          />
        )
      },
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="查看详情">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => {
                setViewingDoc(record)
                setIsModalVisible(true)
              }}
            />
          </Tooltip>
          <Tooltip title="查看内容">
            <Button
              type="link"
              onClick={async () => {
                try {
                  const res = await getDocContent(record.id)
                  Modal.info({
                    title: `文档内容：${record.name}`,
                    width: 800,
                    content: (
                      <div style={{ maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {res.content || '（无内容或尚未向量化）'}
                      </div>
                    ),
                  })
                } catch (e) {
                  message.error(e?.response?.data?.error || '获取文档内容失败')
                }
              }}
            >
              查看内容
            </Button>
          </Tooltip>
          <Tooltip title="重新索引">
            <Button type="link" icon={<SyncOutlined />} />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个文档吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                setLoading(true)
                await deleteKnowledgeDoc(record.id)
                // 成功后刷新列表，确保返回后不再出现
                const docs = await listKnowledgeDocs()
                const mapped = docs.map((d, idx) => ({
                  key: String(idx + 1),
                  id: d.id,
                  name: d.name,
                  type: d.type || d.name.split('.').pop().toUpperCase(),
                  size: d.size || '-',
                  status: d.status || '已索引',
                  chunks: d.chunks ?? 0,
                  vectors: d.vectors ?? 0,
                  uploadTime: d.uploadTime || '-',
                  indexTime: d.indexTime || '-',
                  similarity: d.similarity ?? 0.9,
                }))
                setDataSource(mapped)
                message.success('删除成功')
              } catch (e) {
                message.error(e?.response?.data?.error || '删除失败')
              } finally {
                setLoading(false)
              }
            }}
          >
            <Tooltip title="删除">
              <Button type="link" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const stats = [
    {
      title: '总文档数',
      value: dataSource.length,
      prefix: <FileTextOutlined />,
      color: '#1890ff',
    },
    {
      title: '已索引文档',
      value: dataSource.filter((item) => item.status === '已索引').length,
      prefix: <CheckCircleOutlined />,
      color: '#52c41a',
    },
    {
      title: '总文档块数',
      value: dataSource.reduce((sum, item) => sum + item.chunks, 0),
      prefix: <DatabaseOutlined />,
      color: '#722ed1',
    },
    {
      title: '总向量数',
      value: dataSource.reduce((sum, item) => sum + item.vectors, 0),
      prefix: <DatabaseOutlined />,
      color: '#faad14',
    },
  ]

  const handleUpload = async (file) => {
    try {
      setLoading(true)
      const id = `KB${String(Date.now()).slice(-6)}`
      const name = file.name
      const type = (file.name.split('.').pop() || 'txt').toUpperCase()
      await ingestTextFile(id, name, file, type)
      message.success('上传并入库成功，已生成向量')
      const docs = await listKnowledgeDocs()
      const mapped = docs.map((d, idx) => ({
        key: String(idx + 1),
        id: d.id,
        name: d.name,
        type: d.type || d.name.split('.').pop().toUpperCase(),
        size: d.size || '-',
        status: '已索引',
        chunks: d.chunks ?? 0,
        vectors: d.vectors ?? 0,
        uploadTime: d.uploadTime || new Date().toLocaleString('zh-CN'),
        indexTime: d.indexTime || '-',
        similarity: d.similarity ?? 0.9,
      }))
      setDataSource(mapped)
    } catch (e) {
      console.error(e)
      const errMsg = e?.response?.data?.error || e?.message || '上传或入库失败'
      message.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

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
        <div>
          <Title level={2} style={{ margin: 0 }}>
            RAG知识库管理
          </Title>
          <Text type="secondary">管理向量数据库中的文档和知识库</Text>
        </div>
        <Space>
          <Upload
            accept=".txt,.md,.pdf,.docx"
            beforeUpload={async (file) => {
              await handleUpload(file)
              return false
            }}
            showUploadList={false}
          >
            <Button type="primary" icon={<UploadOutlined />}>
              上传文档
            </Button>
          </Upload>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={<span style={{ color: stat.color }}>{stat.prefix}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card loading={loading}>
        {loadError && (
          <Alert type="error" message={loadError} showIcon style={{ marginBottom: 12 }} />
        )}
        <div style={{ marginBottom: 16 }}>
          <Search
            placeholder="搜索文档名称、类型"
            allowClear
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
          />
        </div>
        <Table
          columns={columns}
          dataSource={dataSource}
          locale={{
            emptyText: (
              <div>
                <div style={{ marginBottom: 8 }}>暂无数据</div>
                <div style={{ color: '#999' }}>如果后端未返回数据，请检查接口或稍后重试。</div>
              </div>
            ),
          }}
          pagination={{
            total: dataSource.length,
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          scroll={{ x: 1500 }}
        />
      </Card>

      <Modal
        title="文档详情"
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          setViewingDoc(null)
        }}
        footer={null}
        width={800}
      >
        {viewingDoc && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Text strong>文档名称：</Text>
                <div>{viewingDoc.name}</div>
              </Col>
              <Col span={12}>
                <Text strong>文档类型：</Text>
                <div>
                  <Tag>{viewingDoc.type}</Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text strong>文档大小：</Text>
                <div>{viewingDoc.size}</div>
              </Col>
              <Col span={12}>
                <Text strong>索引状态：</Text>
                <div>
                  <Tag
                    color={viewingDoc.status === '已索引' ? 'success' : 'processing'}
                  >
                    {viewingDoc.status}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text strong>文档块数：</Text>
                <div>{viewingDoc.chunks} 块</div>
              </Col>
              <Col span={12}>
                <Text strong>向量数量：</Text>
                <div>
                  {viewingDoc.vectors} / {viewingDoc.chunks}
                </div>
              </Col>
            </Row>
            <Divider />
            <div>
              <Text strong>RAG处理流程：</Text>
              <ol style={{ marginTop: 8 }}>
                <li>文档上传 → 文档解析</li>
                <li>文本分块 → 生成 {viewingDoc.chunks} 个文档块</li>
                <li>向量化 → 生成 {viewingDoc.vectors} 个向量嵌入</li>
                <li>索引构建 → 存入向量数据库</li>
                <li>检索就绪 → 可用于RAG检索</li>
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default KnowledgeBase

