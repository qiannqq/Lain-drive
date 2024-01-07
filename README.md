![Lain-plugin](https://socialify.git.ci/Zyy955/Lain-drive/image?description=1&font=KoHo&forks=1&issues=1&language=1&logo=https://cdn.jsdelivr.net/gh/Zyy955/imgs/img/202312120000234.jpg&name=1&owner=1&pattern=Plus&pulls=1&stargazers=1&theme=Light)

## 简介

需安装NodeJs

临时文件云盘API，给该死的QQBot使用

支持图片、语音、视频

搭配 [Lain-plugin](https://gitee.com/Zyy955/Lain-plugin) 使用，TRSS暂未适配。

## 1.安装插件

Gitee：
```
// 还没有
git clone --depth=1 https://gitee.com/Zyy955/Lain-drive
```

Github：
```
git clone --depth=1 https://github.com/Zyy955/Lain-drive
```

## 1.1安装pnpm ，已安装的可以跳过

```
npm --registry=https://registry.npmmirror.com install pnpm -g
```

## 2.安装依赖

```
pnpm install
```

## 使用方法

请求接口：`/api/upload`
```javascript
import fetch, { File, FormData } from 'node-fetch'

async function POST (file) {
  const url = 'http://127.0.0.1:2957/api/upload'
  file = await Bot.Buffer(file) // Bot.Buffer由Lain-plugin提供，如未安装，自行将文件转为buffer
  const formData = new FormData()
  formData.append('file', new File([file], 'image'))
  let res = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      token: '2957'
    }
  })

  return await res.json()
}

console.log(await POST('./test.jpg'))
```
响应：

```json
{
  "extension": "jpg",   // 文件类型
  "type": "jpg",        // 文件类型
  "width": 1080,        // 图像宽度，仅图像有此字段
  "height": 1080,       // 图像高度，仅图像有此字段
  "size": 87637,        // 文件大小
  "contentType": "image/jpeg",      // 文件的MIME类型
  "token": "48806962-7103-4388-b486-f27faa6ca512",      // token
  "url": "http://127.0.0.1:2957/api/File?token=48806962-7103-4388-b486-f27faa6ca512",   // 直链地址
}
```

结束!

## Lain-plugin插件如何使用

复制代码，丢到`./plugins/example`

```javascript
import fetch, { File, FormData } from 'node-fetch'

// 请求token
const token = '2957'
// 请求接口
const url = 'http://127.0.0.1:2957/api/upload'

/** 视频 */
Bot.videoToUrl = async function (file) {
  return await uploadFile('video', file)
}

/** 语音 */
Bot.audioToUrl = async function (file) {
  return await uploadFile('audio', file)
}

/** 图床 */
Bot.imageToUrl = async (file) => {
  return await uploadFile('image', file)
}

/** 上传文件 */
async function uploadFile (type, file) {
  file = await Bot.Buffer(file)
  const formData = new FormData()
  formData.append('file', new File([file], type))
  let res = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: { token }
  })

  if (res.ok) {
    const { url, width, height } = await res.json()
    if (type === 'image') return { url, width, height }
    return url
  } else {
    const error = `云盘请求错误：${await res.json()}`
    throw error
  }
}
```

## 关于

<details><summary>最后求个爱发电~您的支持是我更新的动力</summary>

![爱发电](https://cdn.jsdelivr.net/gh/Zyy955/imgs/img/202308271209508.jpeg)

</details>

## 访问量

![Visitor Count](https://profile-counter.glitch.me/Zyy955-Lain-drive/count.svg)
