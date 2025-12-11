// Global app state
let sock = null;
let qrCodeData = null;
let isConnected = false;

function getState() {
  return { sock, qrCodeData, isConnected };
}

function setState(newState) {
  if (newState.sock !== undefined) sock = newState.sock;
  if (newState.qrCodeData !== undefined) qrCodeData = newState.qrCodeData;
  if (newState.isConnected !== undefined) isConnected = newState.isConnected;
}

function getSock() {
  return sock;
}

function setSock(newSock) {
  sock = newSock;
}

function getQrCodeData() {
  return qrCodeData;
}

function setQrCodeData(data) {
  qrCodeData = data;
}

function getIsConnected() {
  return isConnected;
}

function setIsConnected(connected) {
  isConnected = connected;
}

module.exports = {
  getState,
  setState,
  getSock,
  setSock,
  getQrCodeData,
  setQrCodeData,
  getIsConnected,
  setIsConnected,
};
