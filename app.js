import './lib/init.js'
import { randomUUID } from 'crypto'
import express from 'express'
import { fileTypeFromBuffer } from 'file-type'
import fs from 'fs'
import http from 'http'
import sizeOf from 'image-size'
import multer from 'multer'
import Cfg from './lib/config.js'

class Server {
  constructor () {
    /** 临时文件 */
    this.File = new Map()
    /** 启动HTTP服务器 */
    this.server()
  }

  async server () {
    const app = express()

    /** 处理multipart/form-data请求 */
    const upload = multer({ storage: multer.memoryStorage() })

    /** POST请求 接收文件 */
    app.post('/api/upload', upload.single('file'), async (req, res) => {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
      const Token = req.headers.token || null

      if (!req.headers['content-type'].startsWith('multipart/form-data')) {
        logger.error(`[请求格式错误][POST]  [IP：${ip}] => [Token：${Token}] => [返回：已拒绝]`)
        res.status(400).json({ status: 'failed', message: '请求格式错误' })
      }

      logger.info(`[收到请求][POST] [IP：${ip}] => [Token：${Token}]`)

      if (!Token || Token !== Cfg.token) {
        logger.error(`[请求Token错误][POST]  [IP：${ip}] => [Token：${Token}] => [返回：已拒绝]`)
        return res.status(500).json({ status: 'failed', message: 'token错误' })
      }

      try {
        /** 获取buffer */
        let { buffer, size, originalname } = req.file
        /** 生成一个临时token */
        const UUID = randomUUID()
        /** 获取文件类型，响应头 */
        const { extension, contentType } = await this.getType(buffer)

        /** 先赋值 */
        let data = {
          status: 'ok',
          buffer,
          File: {
            size,
            extension,
            token: UUID,
            originalname,
            contentType: originalname === 'audio' ? 'audio/silk' : contentType,
            url: Cfg.baseUrl.replace(/\/$/, '') + `/api/File?token=${UUID}`
          }
        }

        /** 如果是图片，计算一下宽高 */
        if (contentType.includes('image')) {
          const image = sizeOf(buffer)
          data.File = { ...data.File, ...image }
        }

        /** 保存 */
        this.File.set(UUID, data)
        /** 定时删除 */
        setTimeout(() => {
          this.File.delete(UUID)
          logger.debug(`[定时任务] [删除过期文件] => [Key：${UUID}]`)
        }, (Cfg.ExpirationTime || 30) * 1000)
        logger.info(`[完成请求][POST] [IP：${ip}] => [Token：${Token}] => [Key：${UUID}]`)
        logger.debug(data.File)
        res.status(200).json(data.File)
      } catch (error) {
        res.status(500).json({ status: 'failed', message: '哎呀，报错了捏' })
        logger.error(`[未知错误][POST]  [IP：${ip}] => [Token：${Token}] => [返回：未知错误]`)
        logger.error(error)
      }
    })

    /** Get请求 返回文件 */
    app.get('/api/File', async (req, res) => {
      const ip = req.ip
      const { token } = req.query

      logger.info(`[收到请求][GET] [IP：${ip}] => [Token：${token || JSON.stringify(req.query)}]`)

      try {
        /** 提取对应的文件 */
        const data = this.File.get(token)
        if (data) {
          res.setHeader('Content-Type', data?.File?.contentType || 'image/png')
          res.setHeader('Content-Disposition', 'inline')
          res.send(data.buffer)
          logger.info(`[请求完成][GET] [IP：${ip}] => [Token：${token}] => [文件：${data?.File?.contentType}]`)
          logger.debug(data.File)
        } else {
          res.setHeader('Content-Type', 'image/png')
          res.setHeader('Content-Disposition', 'inline')
          res.send(fs.readFileSync(Cfg.File404))
          logger.info(`[请求完成][GET] [IP：${ip}] => [Token：${token}] => [文件：${Cfg.File404}]`)
        }
      } catch (error) {
        res.status(500).json({ status: 'failed', message: '哎呀，报错了捏' })
        logger.error(`[未知错误][GET]  [IP：${ip}] => [Token：${token}] => [返回：未知错误]`)
        logger.error(error)
      }
    })

    http.createServer(app, '0.0.0.0').listen(Cfg.port, () => logger.info(`HTTP服务器已启动：${Cfg.baseUrl || `http://127.0.0.1:${Cfg.port})`}`))
  }

  /** 获取文件后缀和Content-Type */
  async getType (buffer) {
    try {
      const { mime, ext } = await fileTypeFromBuffer(buffer)
      return { extension: ext, contentType: mime }
    } catch (error) {
      logger.error('获取格式错误，默认返回txt')
      logger.debug(error)
      return { extension: 'txt', contentType: 'application/octet-stream' }
    }
  }
}

export default new Server()
