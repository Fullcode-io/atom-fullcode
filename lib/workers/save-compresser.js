const pako = require('pako');
const getRepoInfo = require('git-repo-info');

let systemInfo = null

const saveCompresser = (input, sendMessage, progress) => {

  process.on('disconnect', process.exit)

  if (typeof input === 'object') {
    systemInfo = input
  }
  else {
    sendMessage('save-compresser started');

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
    sendMessage(payload)
    let gzippedPayload = pako.gzip(JSON.stringify(payload), { to: 'string' })
    // sendMessage(gzippedPayload)
  }

}

module.exports = saveCompresser;
