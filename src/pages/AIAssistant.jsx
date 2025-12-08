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
} from '@ant-design/icons'
import './AIAssistant.css'
import { chat, listSessions, createSession, getSessionMessages } from '../api/client'

const { TextArea } = Input
const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse

const AIAssistant = () => {
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
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [useRAG, setUseRAG] = useState(true)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 将会话持久化到本地，防止切换页面丢失
  useEffect(() => {
    try {
      const serializable = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
    } catch {}
  }, [messages])

  // 创建新会话（后端持久化，可选）
  const startNewSession = async () => {
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
    try {
      const rows = await listSessions()
      setSessions(rows)
    } catch {}
  }

  useEffect(() => {
    loadSessions()
  }, [])

  // 选择会话并加载消息
  const selectSession = async (id) => {
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

  const simulateRAGProcess = (question) => {
    return new Promise((resolve) => {
      // 步骤1: 问题理解
      setTimeout(() => {
        setRagProcess({
          step: 1,
          status: 'process',
          message: '正在理解您的问题...',
          details: {
            intent: '查询员工信息',
            entities: ['员工数量', '部门分布'],
          },
        })
      }, 300)

      // 步骤2: 向量检索
      setTimeout(() => {
        setRagProcess({
          step: 2,
          status: 'process',
          message: '正在从向量数据库检索相关信息...',
          details: {
            queryVector: '已生成查询向量',
            topK: 5,
            similarity: 0.85,
          },
        })
      }, 600)

      // 步骤3: 文档检索
      setTimeout(() => {
        setRagProcess({
          step: 3,
          status: 'process',
          message: '正在检索相关文档片段...',
          details: {
            retrievedDocs: [
              { name: '员工手册.pdf', score: 0.92, chunk: '第3章第2节' },
              { name: '人事政策2024.docx', score: 0.88, chunk: '第1章第5节' },
              { name: '组织架构.xlsx', score: 0.85, chunk: 'Sheet1' },
            ],
          },
        })
      }, 900)

      // 步骤4: 上下文构建
      setTimeout(() => {
        setRagProcess({
          step: 4,
          status: 'process',
          message: '正在构建上下文...',
          details: {
            contextLength: 1250,
            tokens: 156,
          },
        })
      }, 1200)

      // 步骤5: 生成回答
      setTimeout(() => {
        setRagProcess({
          step: 5,
          status: 'finish',
          message: '回答生成完成',
          details: {
            model: 'GPT-4',
            tokensUsed: 234,
            responseTime: '1.2s',
          },
        })
        resolve()
      }, 1500)
    })
  }

  const handleSend = async () => {
    if (!inputValue.trim()) {
      message.warning('请输入您的问题')
      return
    }

    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    }

    setMessages([...messages, userMessage])
    setInputValue('')
    setLoading(true)
    setRagProcess({ step: 0, status: 'wait' })

    try {
      // 模拟RAG处理过程（前端可视化），仅在启用RAG时展示
      if (useRAG) {
        await simulateRAGProcess(inputValue)
      }
      // 后端聊天接口
      const data = await chat(inputValue, sessionId, { useRAG })
      const aiMessage = {
        id: messages.length + 2,
        type: 'ai',
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources,
        ragDetails: data.rag,
      }
      // 如果后端自动创建了会话，则保存返回的 sessionId，便于后续查看历史
      if (data.sessionId && !sessionId) setSessionId(data.sessionId)
      setMessages((prev) => [...prev, aiMessage])
    } catch (err) {
      message.error('调用后端接口失败，使用本地模拟回答')
      const aiResponse = generateAIResponse(inputValue)
      const retrievedSources = [
        { name: '员工手册.pdf', relevance: 0.92, page: 15 },
        { name: '人事政策2024.docx', relevance: 0.88, section: '第1章' },
        { name: '组织架构.xlsx', relevance: 0.85 },
      ]
      const aiMessage = {
        id: messages.length + 2,
        type: 'ai',
        content: aiResponse,
        timestamp: new Date(),
        sources: retrievedSources,
        ragDetails: {
          queryVector: true,
          retrievedChunks: 5,
          similarityScore: 0.87,
          contextTokens: 156,
          responseTokens: 234,
        },
      }
      setMessages((prev) => [...prev, aiMessage])
    } finally {
      setLoading(false)
      setRagProcess(null)
    }
  }

  const generateAIResponse = (question) => {
    const lowerQuestion = question.toLowerCase()
    
    if (lowerQuestion.includes('员工') || lowerQuestion.includes('人员')) {
      return '根据RAG检索到的信息，目前公司共有员工156人，其中技术部门45人，销售部门38人，行政部门28人，其他部门45人。最近一个月新入职员工12人，离职员工3人。\n\n这些数据来自员工数据库和最新的组织架构文档，检索相似度达到0.87，信息准确可靠。'
    } else if (lowerQuestion.includes('薪资') || lowerQuestion.includes('工资')) {
      return '根据人事政策文档（RAG检索相似度0.92），公司薪资结构包括基本工资、绩效奖金、年终奖等。具体薪资标准根据岗位级别和绩效考核结果确定。平均薪资水平较去年同期增长8.5%。\n\n详细政策请参考《人事政策2024.docx》第1章第5节。'
    } else if (lowerQuestion.includes('考勤') || lowerQuestion.includes('请假')) {
      return '根据考勤系统数据和员工手册（检索自第3章第2节），本月平均出勤率为96.2%。请假类型包括年假、病假、事假等。年假政策：员工入职满一年后可享受10天年假，每增加一年工龄增加1天，最多20天。'
    } else if (lowerQuestion.includes('招聘') || lowerQuestion.includes('面试')) {
      return '当前有8个岗位正在招聘中，包括前端工程师、产品经理、市场专员等。本月已收到简历156份，完成面试32场，已发出offer 5份。\n\n招聘数据实时更新，通过RAG技术整合了招聘系统、简历库和面试记录。'
    } else {
      return '我已经通过RAG技术检索了相关的人事文档和数据库，但这个问题需要更多信息。您可以尝试询问更具体的问题，比如"公司有多少员工？"、"薪资政策是什么？"等。\n\nRAG系统已检索了5个相关文档片段，但相似度较低（0.65），建议您提供更具体的关键词。'
    }
  }

  const quickQuestions = [
    '公司有多少员工？各部门分布如何？',
    '薪资政策是什么？如何计算绩效奖金？',
    '请假流程是怎样的？年假如何申请？',
    '当前有哪些岗位在招聘？招聘进度如何？',
  ]

  const ragSteps = [
    {
      title: '问题理解',
      icon: <SearchOutlined />,
      description: '分析用户意图和关键实体',
    },
    {
      title: '向量检索',
      icon: <DatabaseOutlined />,
      description: '在向量数据库中搜索相似内容',
    },
    {
      title: '文档检索',
      icon: <FileTextOutlined />,
      description: '检索相关文档片段',
    },
    {
      title: '上下文构建',
      icon: <ApiOutlined />,
      description: '构建增强上下文',
    },
    {
      title: '生成回答',
      icon: <CheckCircleOutlined />,
      description: '基于检索内容生成回答',
    },
  ]

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
        <Space>
          <Badge status="processing" text="RAG引擎运行中" />
          <Tag icon={<ThunderboltOutlined />} color="purple" style={{ fontSize: 14, padding: '4px 12px' }}>
            向量数据库已连接
          </Tag>
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
                      {msg.content.split('\n').map((line, idx) => (
                        <Paragraph key={idx} style={{ margin: 0 }}>
                          {line}
                        </Paragraph>
                      ))}
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
                      >
                        <Panel
                          header={
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              🔍 查看RAG检索详情
                            </Text>
                          }
                          key="detail"
                        >
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
                        </Panel>
                      </Collapse>
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
              {loading && (
                <>
                  <div className="message-item ai-message">
                    <div className="message-avatar">
                      <Avatar
                        icon={<RobotOutlined />}
                        style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        }}
                      />
                    </div>
                    <div className="message-content">
                      <div className="message-bubble">
                        <Spin size="small" /> 正在通过RAG技术检索相关信息...
                      </div>
                    </div>
                  </div>
                  {ragProcess && (
                    <Card
                      size="small"
                      style={{
                        margin: '16px 0',
                        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                        border: '1px solid rgba(102, 126, 234, 0.3)',
                      }}
                    >
                      <Steps
                        current={ragProcess.step}
                        status={ragProcess.status}
                        size="small"
                        items={ragSteps}
                      />
                      {ragProcess.details && (
                        <div style={{ marginTop: 16, padding: 12, background: 'white', borderRadius: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {ragProcess.message}
                          </Text>
                          {ragProcess.details.retrievedDocs && (
                            <div style={{ marginTop: 8 }}>
                              {ragProcess.details.retrievedDocs.map((doc, idx) => (
                                <Tag key={idx} color="blue" style={{ marginTop: 4 }}>
                                  {doc.name} (相似度: {(doc.score * 100).toFixed(0)}%)
                                </Tag>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div className="quick-questions">
              <Space style={{ marginBottom: 8 }}>
                <Button size="small" onClick={handleNewConversation}>新建会话</Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                快速提问：
              </Text>
              {quickQuestions.map((q, idx) => (
                <Button
                  key={idx}
                  size="small"
                  type="dashed"
                  onClick={() => setInputValue(q)}
                  style={{ marginRight: 8, marginBottom: 8 }}
                >
                  {q}
                </Button>
              ))}
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
                发送（RAG检索）
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="RAG系统状态" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>向量数据库连接</Text>
                <Badge status="processing" text="正常" style={{ float: 'right' }} />
              </div>
              <div>
                <Text>知识库文档数</Text>
                <Text strong style={{ float: 'right' }}>156 个</Text>
              </div>
              <div>
                <Text>向量索引状态</Text>
                <Badge status="success" text="已索引" style={{ float: 'right' }} />
              </div>
              <div>
                <Text>今日检索次数</Text>
                <Text strong style={{ float: 'right' }}>234 次</Text>
              </div>
              <div>
                <Text>平均响应时间</Text>
                <Text strong style={{ float: 'right' }}>1.2s</Text>
              </div>
            </Space>
          </Card>
          <Card title="会话列表" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {sessions.map((s) => (
                <Button key={s.id} block onClick={() => selectSession(s.id)}>
                  {s.title || '未命名会话'}
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{new Date(s.created_at).toLocaleString('zh-CN')}</Text>
                </Button>
              ))}
              {sessions.length === 0 && (
                <Text type="secondary">暂无会话，点击“新建会话”开始。</Text>
              )}
            </Space>
          </Card>
          <Card title="RAG工作流程">
            <Steps
              direction="vertical"
              size="small"
              items={ragSteps.map((step, idx) => ({
                title: step.title,
                description: step.description,
                icon: step.icon,
              }))}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default AIAssistant
