const { state } = require("./state");

function sendStatus(status) {
  state.lastStatus = status;
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("status", status);
  }
}

module.exports = { sendStatus };
