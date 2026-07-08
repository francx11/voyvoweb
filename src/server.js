const { PORT } = require('./config');
const { createApp } = require('./app');

const server = createApp().listen(PORT, () => {
  console.log(`🍕  Voy Volando · http://localhost:${PORT}`);
  console.log(`🔧  Admin panel  · http://localhost:${PORT}/admin`);
});

// Graceful shutdown: Railway sends SIGTERM on redeploy — finish in-flight
// requests instead of cutting them off.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} recibido, cerrando servidor...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
