// Mock for baileys module
const DisconnectReason = {
  loggedOut: 401,
  connectionClosed: 428,
  connectionLost: 408,
  connectionReplaced: 440,
  timedOut: 408,
  badSession: 500,
  restartRequired: 515
};

const makeWASocket = jest.fn(() => ({
  ev: {
    on: jest.fn()
  },
  sendMessage: jest.fn(),
  logout: jest.fn()
}));

const useMultiFileAuthState = jest.fn(async () => ({
  state: {},
  saveCreds: jest.fn()
}));

module.exports = {
  default: makeWASocket,
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState
};
