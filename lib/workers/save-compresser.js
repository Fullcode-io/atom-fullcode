const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const debounce = require('lodash.debounce');

let systemInfo = null
let pendingFile = null
let pendingText = null
let sendMessage = null
let input = null

const _sendSaveEvent = debounce( () => {
    sendMessage(`sending content for ${pendingFile}`)
    let batchDate = new Date
    let gitInfo = getRepoInfo(__dirname)
    let payload = {
      type: 'save',
      data: input,
      timestamp: batchDate,
      gitInfo: {
        author: gitInfo.author,
        branch: gitInfo.branch,
        root: gitInfo.root,
        dirName: __dirname
      },
      systemInfo
    };
    let gzippedPayload = pako.gzip(JSON.stringify(payload), { to: 'string' })
    sendMessage(payload)
    pendingFile = null
    pendingText = null
    // sendMessage(gzippedPayload)
}, 10000)

const saveCompresser = (inputContent, messageHandler, progress) => {
  sendMessage = messageHandler
  input = inputContent

  if (input.systemInfo) {
    systemInfo = input.systemInfo
  }
  else {
    if (input.filePath !== pendingFile) {
      if (pendingText && pendingFile) {
        _sendSaveEvent.flush()
      }
      pendingFile = input.filePath
      pendingText = input.text
      _sendSaveEvent()
    }
    else {
      pendingText = input.text
      _sendSaveEvent()
    }
  }

}

module.exports = saveCompresser;
