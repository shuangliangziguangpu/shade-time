import { createShadeServer } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT must be an integer from 1 to 65535');
const server = createShadeServer();
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用；请设置其他 PORT 后重试。` : '本地服务启动失败。');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`ShadeTime phase 0: http://127.0.0.1:${port}`));
