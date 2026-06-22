import React, { useState, useRef, useEffect } from 'react'
import {
  Card,
  Input,
  Button,
  Typography,
  Space,
  Avatar,
  Spin,
  Tag,
  Divider,
  message,
  Steps,
  Collapse,
  Progress,
  Tooltip,
  Row,
  Col,
  Badge,
  Switch,
  Popconfirm,
  Modal,
} from 'antd'
import {
  RobotOutlined,
  UserOutlined,
  SendOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ApiOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import './AIAssistant.css'
import { chatStream, listSessions, createSession, getSessionMessages, deleteSession, getDashboardSummary } from '../api/client'

const { TextArea } = Input
const { Title, Text, Paragraph } = Typography

const AIAssistant = () => {
  let currentUser = {}
  try {
    currentUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
  } catch (e) {}
  const isAdmin = currentUser?.role === 'admin'

  // 从本地存储恢复会话，避免页面切换后丢失
  const STORAGE_KEY = 'aiAssistantMessages'
  const initialMessages = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // 还原 timestamp
        return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
      }
    } catch {}
    return [
      {
        id: 1,
        type: 'ai',
        content:
          '您好！我是基于RAG技术的AI人事助手。我可以帮您查询员工信息、解答人事政策、分析数据等。我通过检索增强生成技术，能够从知识库中检索相关信息并生成准确回答。有什么可以帮您的吗？',
        timestamp: new Date(),
      },
    ]
  })()
  const [messages, setMessages] = useState(initialMessages)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [ragProcess, setRagProcess] = useState(null)
  const [showRagDetail, setShowRagDetail] = useState({})
  const [ragDetailVisible, setRagDetailVisible] = useState(false)
  const [ragDetailItems, setRagDetailItems] = useState([])
  const [ragDetailTitle, setRagDetailTitle] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [useRAG, setUseRAG] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 将会话持久化到本地，防止切换页面丢失
  useEffect(() => {
    const MAX_STORE = 100
    try {
      const serializable = messages
        .slice(-MAX_STORE)
        .map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }))

      const save = () => {
        try {
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            requestIdleCallback(() => {
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
              } catch {}
            })
          } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
          }
        } catch {}
      }

      const id = setTimeout(save, 250)
      return () => clearTimeout(id)
    } catch {}
  }, [messages])

  // 创建新会话（后端持久化，可选）
  const startNewSession = async () => {
    if (!isAdmin) {
      setSessionId(null)
      return
    }
    try {
      const data = await createSession('新会话')
      if (data.id) setSessionId(data.id)
      // 刷新会话列表
      const rows = await listSessions()
      setSessions(rows)
    } catch {
      // 后端不可用时也允许前端新会话，仅清空本地
      setSessionId(null)
    }
  }

  // 新建会话：清空当前消息并可选请求后端创建
  const handleNewConversation = async () => {
    await startNewSession()
    const welcome = {
      id: 1,
      type: 'ai',
      content:
        '新的会话已开始。我会基于检索增强生成（RAG）回答您的问题。请描述您要咨询的内容。',
      timestamp: new Date(),
    }
    setMessages([welcome])
    localStorage.removeItem(STORAGE_KEY)
  }

  // 加载会话列表
  const loadSessions = async () => {
    if (!isAdmin) {
      setSessions([])
      return
    }
    try {
      const rows = await listSessions()
      setSessions(rows)
    } catch {}
  }

  const handleDeleteSession = async (id) => {
    if (!isAdmin) return
    try {
      await deleteSession(id)
      message.success('会话已删除')
      // 如果当前正在查看的会话被删除，则重置为初始状态
      if (sessionId === id) {
        setSessionId(null)
        setMessages(initialMessages)
        localStorage.removeItem(STORAGE_KEY)
      }
      // 刷新会话列表
      await loadSessions()
    } catch (err) {
      console.error('删除会话失败', err)
      message.error('删除会话失败')
    }
  }

  useEffect(() => {
    if (isAdmin) loadSessions()
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoadingDashboard(true)
      const data = await getDashboardSummary()
      setDashboard(data)
    } catch (e) {
      console.error('加载仪表盘数据失败', e)
    } finally {
      setLoadingDashboard(false)
    }
  }

  // 选择会话并加载消息
  const selectSession = async (id) => {
    if (!isAdmin) return
    try {
      setSessionId(id)
      const msgs = await getSessionMessages(id)
      const restored = msgs.map((m, idx) => ({
        id: idx + 1,
        type: m.role === 'user' ? 'user' : 'ai',
        content: m.content,
        timestamp: new Date(m.timestamp || Date.now()),
      }))
      setMessages(restored.length ? restored : initialMessages)
    } catch {}
  }

  const buildHistory = (msgs) =>
    msgs
      .filter((m) => m.type === 'user' || m.type === 'ai')
      .slice(-12)
      .map((m) => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }))

  const handleSend = async () => {
    if (!inputValue.trim()) {
      message.warning('请输入您的问题')
      return
    }

    const question = inputValue.trim()
    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: question,
      timestamp: new Date(),
    }
    const aiPlaceholderId = messages.length + 2

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setLoading(true)
    setRagProcess(useRAG ? { step: 1, status: 'process', message: '正在检索知识库...' } : null)

    try {
      const history = buildHistory(messages)
      const result = await chatStream(
        question,
        sessionId,
        { useRAG, history },
        {
          onMeta: (meta) => {
            if (!useRAG) return
            const docs = (meta.sources || []).map((s) => ({
              name: s.name,
              score: s.relevance || 0,
            }))
            setRagProcess({
              step: 2,
              status: 'process',
              message: `检索到 ${meta.rag?.retrievedChunks ?? docs.length} 个相关片段`,
              details: {
                retrievedDocs: docs,
                similarity: meta.rag?.similarityScore,
                contextTokens: meta.rag?.contextTokens,
              },
            })
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === aiPlaceholderId)
              const placeholder = {
                id: aiPlaceholderId,
                type: 'ai',
                content: '',
                timestamp: new Date(),
                sources: meta.sources,
                ragDetails: meta.rag,
              }
              return exists ? prev : [...prev, placeholder]
            })
          },
          onToken: (_token, accumulated) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === aiPlaceholderId ? { ...m, content: accumulated } : m))
            )
          },
        }
      )

      if (result.sessionId && !sessionId) setSessionId(result.sessionId)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiPlaceholderId
            ? {
                ...m,
                content: result.answer,
                sources: result.sources,
                ragDetails: { ...result.rag, items: result.rag?.items },
              }
            : m
        )
      )
      setRagProcess(useRAG ? { step: 3, status: 'finish', message: '回答生成完成' } : null)
      loadDashboard()
    } catch (err) {
      const backendErr = err?.message || '未知错误'
      message.error('问答失败，请检查 RAG 服务与密钥配置')
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== aiPlaceholderId)
        return [
          ...filtered,
          {
            id: aiPlaceholderId,
            type: 'ai',
            content: `问答失败：${backendErr}\n\n请检查 RAG 服务（8000）、Qdrant（6333）及 API Key 配置。`,
            timestamp: new Date(),
          },
        ]
      })
    } finally {
      setLoading(false)
      setTimeout(() => setRagProcess(null), 800)
    }
  }


  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <Space>
          <Avatar
            size={48}
            icon={<RobotOutlined />}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          />
          <div>
            <Title level={2} style={{ margin: 0 }}>
              RAG智能助手
            </Title>
            <Text type="secondary">基于检索增强生成技术的智能人事问答系统</Text>
          </div>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card className="chat-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space>
                <Tag color={useRAG ? 'purple' : 'blue'}>
                  {useRAG ? '模式：RAG增强' : '模式：普通聊天'}
                </Tag>
              </Space>
              <Space>
                <Text>使用知识库</Text>
                <Switch checked={useRAG} onChange={(v) => setUseRAG(v)} />
              </Space>
            </div>
            <div className="messages-list">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-item ${msg.type === 'user' ? 'user-message' : 'ai-message'}`}
                >
                  <div className="message-avatar">
                    {msg.type === 'user' ? (
                      <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                    ) : (
                      <Avatar
                        icon={<RobotOutlined />}
                        style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        }}
                      />
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-bubble">
                      <Paragraph className="message-text">
                        {msg.content || (loading && msg.type === 'ai' ? <Spin size="small" /> : '')}
                      </Paragraph>
                    </div>
                    {msg.sources && (
                      <div className="message-sources">
                        <Text type="secondary" style={{ fontSize: 12, fontWeight: 'bold' }}>
                          📚 RAG检索来源：
                        </Text>
                        {msg.sources.map((source, idx) => (
                          <Tooltip
                            key={idx}
                            title={`相似度: ${(source.relevance * 100).toFixed(0)}%`}
                          >
                            <Tag
                              color={source.relevance > 0.9 ? 'green' : source.relevance > 0.8 ? 'blue' : 'orange'}
                              style={{ marginLeft: 4, cursor: 'pointer' }}
                              onClick={() => {
                                // 从 msg.ragDetails.items 中筛选该来源的段落并展示
                                const items = (msg.ragDetails?.items || []).filter((it) => it.name === source.name)
                                setRagDetailItems(items)
                                setRagDetailTitle(`${source.name} - 检索片段`)
                                setRagDetailVisible(true)
                              }}
                            >
                              {source.name}
                              {source.relevance && ` (${(source.relevance * 100).toFixed(0)}%)`}
                            </Tag>
                          </Tooltip>
                        ))}
                      </div>
                    )}
                    {msg.ragDetails && (
                      <Collapse
                        ghost
                        size="small"
                        style={{ marginTop: 8 }}
                        onChange={(keys) => {
                          setShowRagDetail((prev) => ({
                            ...prev,
                            [msg.id]: keys.length > 0,
                          }))
                        }}
                        items={[
                          {
                            key: 'detail',
                            label: (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                🔍 查看RAG检索详情
                              </Text>
                            ),
                            children: (
                              <div className="rag-details">
                                <Row gutter={16}>
                                  <Col span={12}>
                                    <Text strong>检索到的文档片段：</Text>
                                    <div>{msg.ragDetails.retrievedChunks} 个</div>
                                  </Col>
                                  <Col span={12}>
                                    <Text strong>平均相似度：</Text>
                                    <div>{(msg.ragDetails.similarityScore * 100).toFixed(1)}%</div>
                                  </Col>
                                  <Col span={12}>
                                    <Text strong>上下文Token数：</Text>
                                    <div>{msg.ragDetails.contextTokens}</div>
                                  </Col>
                                  <Col span={12}>
                                    <Text strong>生成Token数：</Text>
                                    <div>{msg.ragDetails.responseTokens}</div>
                                  </Col>
                                </Row>
                              </div>
                            ),
                          },
                        ]}
                      />
                    )}
                    <div className="message-time">
                      {msg.timestamp.toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
              {loading && ragProcess && useRAG && (
                <Card
                  size="small"
                  style={{
                    margin: '16px 0',
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                    border: '1px solid rgba(102, 126, 234, 0.3)',
                  }}
                >
                  <div style={{ padding: 12 }}>
                    <Text strong>RAG 检索</Text>
                    <br />
                    <Text type="secondary">{ragProcess.message}</Text>
                    {ragProcess.details?.similarity != null && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          平均相似度 {(ragProcess.details.similarity * 100).toFixed(1)}%
                          {ragProcess.details.contextTokens != null &&
                            ` · 上下文约 ${ragProcess.details.contextTokens} tokens`}
                        </Text>
                      </div>
                    )}
                  </div>
                  {ragProcess.details?.retrievedDocs?.length > 0 && (
                    <div style={{ padding: '0 12px 12px' }}>
                      {ragProcess.details.retrievedDocs.map((doc, idx) => (
                        <Tag key={idx} color="blue" style={{ marginTop: 4 }}>
                          {doc.name} (相似度: {((doc.score || 0) * 100).toFixed(0)}%)
                        </Tag>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              <div ref={messagesEndRef} />
            </div>

              <Modal
                title={ragDetailTitle}
                open={ragDetailVisible}
                onCancel={() => setRagDetailVisible(false)}
                footer={null}
                width={800}
              >
                <div style={{ maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {ragDetailItems.length === 0 && <Text type="secondary">未找到片段</Text>}
                  {ragDetailItems.map((it, idx) => (
                    <div key={idx} style={{ marginBottom: 12, padding: 8, borderBottom: '1px dashed #eee' }}>
                      <Text strong>块 #{it.chunk_index} · 相似度 {(it.score * 100).toFixed(1)}%</Text>
                      <div style={{ marginTop: 8 }}>{it.text}</div>
                    </div>
                  ))}
                </div>
              </Modal>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 12 }}>
              <Space style={{ marginBottom: 8 }}>
                <Button size="small" onClick={handleNewConversation}>新建会话</Button>
              </Space>
            </div>

            <div className="input-area">
              <TextArea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="输入您的问题，RAG系统将自动检索相关知识库并生成回答..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ marginBottom: 12 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={loading}
                block
                size="large"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                }}
              >
                发送（{useRAG ? 'RAG 流式' : '普通聊天'}）
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="RAG系统状态" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>向量数据库连接</Text>
                <Badge
                  status={dashboard ? (dashboard.rag?.vectorIndexTotal > 0 ? 'success' : 'error') : 'processing'}
                  text={dashboard ? (dashboard.rag?.vectorIndexTotal > 0 ? '已连接' : '未连接') : (loadingDashboard ? '加载中' : '未知')}
                  style={{ float: 'right' }}
                />
              </div>
              <div>
                <Text>知识库文档数</Text>
                <Text strong style={{ float: 'right' }}>{dashboard ? `${dashboard.rag?.knowledgeDocs ?? dashboard.knowledgeDocs ?? 0} 个` : (loadingDashboard ? '加载中' : '—')}</Text>
              </div>
              <div>
                <Text>向量索引总量（向量数）</Text>
                <Text strong style={{ float: 'right' }}>{dashboard ? `${dashboard.rag?.vectorIndexTotal ?? 0}` : (loadingDashboard ? '加载中' : '—')}</Text>
              </div>
              <div>
                <Text>今日检索次数</Text>
                <Text strong style={{ float: 'right' }}>{dashboard ? `${dashboard.rag?.todaySearchCount ?? 0} 次` : (loadingDashboard ? '加载中' : '—')}</Text>
              </div>
              <div>
                <Text>平均响应时间</Text>
                <Text strong style={{ float: 'right' }}>{dashboard && dashboard.rag?.avgResponseTime ? `${dashboard.rag.avgResponseTime}s` : (loadingDashboard ? '加载中' : '—')}</Text>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Button size="small" onClick={loadDashboard} loading={loadingDashboard}>刷新</Button>
              </div>
            </Space>
          </Card>
          {isAdmin && (
            <Card title="会话列表" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {sessions.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Button style={{ flex: 1, textAlign: 'left' }} onClick={() => selectSession(s.id)}>
                      {s.title || '未命名会话'}
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{new Date(s.created_at).toLocaleString('zh-CN')}</Text>
                    </Button>
                    <Popconfirm title="确认删除该会话？" onConfirm={() => handleDeleteSession(s.id)} okText="删除" cancelText="取消">
                      <Button danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <Text type="secondary">暂无会话，点击“新建会话”开始。</Text>
                )}
              </Space>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}

export default AIAssistant
