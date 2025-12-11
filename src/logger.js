const pino = require("pino");
const { isTestEnv } = require("./config");

const logger = pino({
  level: isTestEnv ? "silent" : "info",
  transport: isTestEnv
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});

module.exports = logger;
