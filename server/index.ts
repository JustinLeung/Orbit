import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sendEmailRoute from './routes/send-email.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json())

app.get('/healthz', (_req, res) => {
  res.send('ok')
})

app.use('/api/send-email', sendEmailRoute)

const distPath = path.resolve(__dirname, '../dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`Orbit server listening on ${port}`)
})
