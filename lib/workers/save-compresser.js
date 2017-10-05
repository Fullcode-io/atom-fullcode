'use babel';
process.on('disconnect', process.exit);

const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');

var systemInfo = null
var pendingFile = null
var pendingText = null
var sendMessage = null
var timestamp = null
var input = null

const sendSaveEvent = debounce( async () => {
    sendMessage(`sending content for ${pendingFile}`)
    let gitInfo = getRepoInfo(systemInfo.dirname)
    let payload = {
      type: 'save',
      data: input,
      timestamp: timestamp,
      gitInfo,
      systemInfo
    }
    let gzippedPayload = pako.gzip(JSON.stringify(payload), { to: 'string' })
    sendMessage(payload)
    pendingFile = null
    pendingText = null
    // sendMessage(gzippedPayload)
}, 15000)

const saveCompresser = (inputContent, messageHandler, progress) => {
  sendMessage = messageHandler
  input = inputContent

  if (input.systemInfo) {
    sendMessage('init saveWorker')
    systemInfo = input.systemInfo
  }
  else {
    timestamp = new Date
    // pendingText could be an empty string so check for null explicitly
    if (input.filePath !== pendingFile && pendingText !== null) {
      sendSaveEvent.flush()
      pendingFile = input.filePath
      pendingText = input.text
      sendSaveEvent()
    }
    else {
      pendingText = input.text
      sendSaveEvent()
    }
  }
}

module.exports = saveCompresser;
