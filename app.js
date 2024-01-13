import { exec } from 'child_process'
import { encode as encodeSilk } from 'silk-wasm'
import { randomUUID } from 'crypto'
import express from 'express'
import { fileTypeFromBuffer } from 'file-type'
import fs from 'fs'
import http from 'http'
import sizeOf from 'image-size'
import multer from 'multer'
import Cfg from './lib/config.js'
import './lib/init.js'

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
      const type = req.headers.type
      let silk = req.headers.silk
      silk = silk === 'undefined' ? undefined : (silk === 'false' ? false : silk)
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

        let extension
        let contentType

        /** 检查请求头，是否为云转码的语音 */
        if (silk) {
          const FileAudio = await this.getAudio(buffer)
          if (FileAudio.ok) {
            buffer = FileAudio.data
            extension = 'silk'
            contentType = 'audio/silk'
          } else {
            res.status(500).json({ status: 'failed', message: '云转码失败' })
            logger.error(`[错误][POST]  [IP：${ip}] => [Token：${Token}] => [返回：云转码失败]`)
            return logger.error(FileAudio.data)
          }
        } else if (type === 'audio') {
          extension = 'silk'
          contentType = 'audio/silk'
        } else {
          /** 获取文件类型，响应头 */
          const FileType = await this.getType(buffer)
          extension = FileType.FileType
          contentType = FileType.contentType
        }

        /** 先赋值 */
        let data = {
          status: 'ok',
          buffer,
          File: {
            size,
            extension,
            token: UUID,
            originalname,
            contentType,
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

  /** 语音云转码 */
  async getAudio (file) {
    const _path = process.cwd() + '/data/'
    const mp3 = _path + `${Date.now()}.mp3`
    const pcm = _path + `${Date.now()}.pcm`

    /** buffer转mp3 */
    fs.writeFileSync(mp3, file)
    /** mp3 转 pcm */
    await this.runFfmpeg(mp3, pcm)
    logger.mark('mp3 => pcm 完成!')
    logger.mark('pcm => silk 进行中!')

    try {
      /** pcm 转 silk */
      const data = await encodeSilk(fs.readFileSync(pcm), 48000)
      logger.mark('pcm => silk 完成!')
      /** 删除初始mp3文件 */
      fs.unlink(mp3, () => { })
      /** 删除pcm文件 */
      fs.unlink(pcm, () => { })
      return { ok: true, data: data?.data || data }
    } catch (error) {
      return { ok: false, data: error }
    }
  }

  /** ffmpeg转码 转为pcm */
  async runFfmpeg (input, output) {
    let cm
    let ret = await new Promise((resolve, reject) => exec('ffmpeg -version', { windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout, stderr })))
    return new Promise((resolve, reject) => {
      if (ret.stdout) {
        cm = 'ffmpeg'
      } else {
        cm = Cfg.ffmpeg_path || null
      }

      if (!cm) {
        throw new Error('未检测到 ffmpeg ，无法进行转码，请正确配置环境变量或手动前往 config.yaml 进行配置')
      }

      exec(`${cm} -i "${input}" -f s16le -ar 48000 -ac 1 "${output}"`, async (error, stdout, stderr) => {
        if (error) {
          logger.error(`执行错误: ${error}`)
          reject(error)
          return
        }
        resolve()
      }
      )
    })
  }
}

export default new Server()
