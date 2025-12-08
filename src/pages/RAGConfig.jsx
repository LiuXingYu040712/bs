import React, { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Input,
  Switch,
  Button,
  Select,
  Typography,
  Divider,
  message,
  Space,
  InputNumber,
  Slider,
  Row,
  Col,
  Tag,
  Alert,
} from 'antd'
import {
  SaveOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const RAGConfig = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const mod = await import('../api/client')
        const cfg = await mod.getRagConfig()
        form.setFieldsValue({
          vectorModel: cfg.vectorModel || 'text-embedding-v4',
          chunkSize: cfg.chunkSize || 500,
          chunkOverlap: cfg.chunkOverlap || 50,
          topK: cfg.topK || 5,
          similarityThreshold: cfg.similarityThreshold || 0.7,
          temperature: cfg.temperature || 0.2,
          maxTokens: cfg.maxTokens || 1000,
          retrievalMode: cfg.retrievalMode || 'vector',
          rerankEnabled: cfg.rerankEnabled ?? true,
          llmProvider: cfg.llmProvider || 'dashscope',
          llmModel: cfg.llmModel || 'qwen-plus',
          vectorDatabase: 'qdrant',
        })
        setInitialLoaded(true)
      } catch (e) {
        // 保持初始默认值
        setInitialLoaded(true)
      }
    }
    load()
  }, [form])

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const mod = await import('../api/client')
      await mod.saveRagConfig(values)
      message.success('RAG配置保存成功')
    } catch (e) {
      message.error('保存失败，稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, marginBottom: 8 }}>
          RAG系统配置
        </Title>
        <Text type="secondary">
          配置检索增强生成（RAG）系统的各项参数，优化检索和生成效果
        </Text>
      </div>

      <Alert
        message="RAG技术说明"
        description="检索增强生成（RAG）通过结合信息检索和生成式AI，能够从知识库中检索相关信息并生成准确回答。配置合理的参数可以显著提升系统性能。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      {initialLoaded && (
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          vectorModel: 'text-embedding-v4',
          vectorProvider: 'dashscope',
          chunkSize: 500,
          chunkOverlap: 50,
          topK: 5,
          similarityThreshold: 0.7,
          temperature: 0.2,
          maxTokens: 1000,
          retrievalMode: 'vector',
          rerankEnabled: true,
          llmProvider: 'dashscope',
          llmModel: 'qwen-plus',
          vectorDatabase: 'qdrant',
        }}
      >
        <Card
          title={
            <Space>
              <DatabaseOutlined />
              <span>向量数据库配置</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vectorModel"
                label="向量模型"
                rules={[{ required: true, message: '请选择向量模型' }]}
              >
                <Select>
                  <Select.Option value="text-embedding-v4">DashScope text-embedding-v4 (1024)</Select.Option>
                  <Select.Option value="qwen-embedding">DashScope qwen-embedding (~1024)</Select.Option>
                  <Select.Option value="deepseek-embedding">DeepSeek Embedding (1536)</Select.Option>
                  <Select.Option value="bge-large-zh">BGE-Large-ZH (1024)</Select.Option>
                  <Select.Option value="m3e-base">M3E-Base (768)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="vectorDimension"
                label="向量维度"
                tooltip="向量嵌入的维度数，通常为1536或768"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={128}
                  max={4096}
                  defaultValue={1024}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vectorProvider"
                label="嵌入提供商"
                rules={[{ required: true, message: '请选择嵌入提供商' }]}
              >
                <Select>
                  <Select.Option value="dashscope">DashScope（阿里百炼）</Select.Option>
                  <Select.Option value="deepseek">DeepSeek</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="vectorDatabase"
            label="向量数据库类型"
            rules={[{ required: true, message: '请选择向量数据库' }]}
          >
            <Select disabled>
              <Select.Option value="qdrant">Qdrant（后端已固定）</Select.Option>
            </Select>
          </Form.Item>
        </Card>

        <Card
          title={
            <Space>
              <FileTextOutlined />
              <span>文档处理配置</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="chunkSize"
                label="文档块大小"
                tooltip="每个文档块的最大字符数"
              >
                <Slider
                  min={100}
                  max={2000}
                  step={50}
                  marks={{
                    200: '200',
                    500: '500',
                    1000: '1000',
                    2000: '2000',
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="chunkOverlap"
                label="块重叠大小"
                tooltip="相邻文档块之间的重叠字符数，有助于保持上下文连贯性"
              >
                <Slider
                  min={0}
                  max={200}
                  step={10}
                  marks={{
                    0: '0',
                    50: '50',
                    100: '100',
                    200: '200',
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="chunkStrategy"
            label="分块策略"
            rules={[{ required: true, message: '请选择分块策略' }]}
          >
            <Select>
              <Select.Option value="recursive">递归分块（推荐）</Select.Option>
              <Select.Option value="fixed">固定大小分块</Select.Option>
              <Select.Option value="semantic">语义分块</Select.Option>
              <Select.Option value="sentence">句子分块</Select.Option>
            </Select>
          </Form.Item>
        </Card>

        <Card
          title={
            <Space>
              <ThunderboltOutlined />
              <span>检索配置</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="topK"
                label="Top-K检索数量"
                tooltip="从向量数据库检索的文档块数量"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  max={20}
                  step={1}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="similarityThreshold"
                label="相似度阈值"
                tooltip="低于此阈值的文档块将被过滤"
              >
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  marks={{
                    0: '0',
                    0.5: '0.5',
                    0.7: '0.7',
                    1: '1.0',
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="retrievalMode"
            label="检索模式"
            rules={[{ required: true, message: '请选择检索模式' }]}
          >
            <Select>
              <Select.Option value="vector">向量检索</Select.Option>
              <Select.Option value="keyword">关键词检索</Select.Option>
              <Select.Option value="hybrid">混合检索（推荐）</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="rerankEnabled"
            label="重排序"
            valuePropName="checked"
            tooltip="启用重排序可以进一步提升检索结果的相关性"
          >
            <Switch />
          </Form.Item>
        </Card>

        <Card
          title={
            <Space>
              <ApiOutlined />
              <span>生成模型配置</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="llmProvider"
                label="模型提供商"
                rules={[{ required: true, message: '请选择模型提供商' }]}
              >
                <Select>
                  <Select.Option value="dashscope">DashScope（阿里百炼）</Select.Option>
                  <Select.Option value="deepseek">DeepSeek</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item
                name="llmModel"
                label="大语言模型"
                rules={[{ required: true, message: '请选择大语言模型' }]}
              >
                <Select>
                  <Select.Option value="qwen-plus">Qwen-Plus（DashScope）</Select.Option>
                  <Select.Option value="qwen2.5">Qwen2.5（DashScope）</Select.Option>
                  <Select.Option value="deepseek-chat">DeepSeek-Chat</Select.Option>
                  <Select.Option value="deepseek-reasoner">DeepSeek-Reasoner</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="temperature"
                label="Temperature（创造性）"
                tooltip="控制生成文本的随机性，值越高越有创造性"
              >
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  marks={{
                    0: '0（确定性）',
                    0.5: '0.5',
                    0.7: '0.7（推荐）',
                    1: '1（创造性）',
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="maxTokens"
            label="最大Token数"
            tooltip="生成回答的最大长度"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={100}
              max={4000}
              step={100}
            />
          </Form.Item>
        </Card>

        <Card title="高级配置" style={{ marginBottom: 16 }}>
          <Form.Item
            name="contextWindow"
            label="上下文窗口大小"
            tooltip="用于生成回答的上下文最大Token数"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={500}
              max={8000}
              step={500}
              defaultValue={4000}
            />
          </Form.Item>
          <Form.Item
            name="enableStreaming"
            label="启用流式输出"
            valuePropName="checked"
            tooltip="启用后可以实时显示生成过程"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="enableCache"
            label="启用缓存"
            valuePropName="checked"
            tooltip="缓存常见问题的回答，提升响应速度"
          >
            <Switch />
          </Form.Item>
        </Card>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={loading}
            size="large"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
            }}
          >
            保存RAG配置
          </Button>
        </Form.Item>
      </Form>
      )}
    </div>
  )
}

export default RAGConfig

