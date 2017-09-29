
const lockFile = require('proper-lockfile');
const Tail = require('always-tail');
const rotator = require('logrotator').rotator;
const pako = require('pako');
const debounce = require('lodash.debounce');
const getRepoInfo = require('git-repo-info');
const fs = require('fs-plus');


const home = fs.getHomeDirectory()
const lockPath = home + '/.nighthawk/logs/nighthawk'
const logFilePath = home + '/.nighthawk/logs/session.log'
let tail = null
let lines = []
let systemInfo = null


const lockTail = (input, sendMessage, progress) => {

  process.on('disconnect', process.exit);

  if (typeof input === 'object') {
    systemInfo = input
  }

  sendMessage('lock-tail started');

  setInterval(() => {
    lockFile.lock(lockPath, { stale: 5000, realpath: false, updateDelay: 1000 }, (err) => {
      if (err) {
        if (err.code !== 'ELOCKED' && tail ) {
          tail.unwatch();
          tail = null;
          console.log('cleared tail: ', err.code)
        }
        sendMessage(err.code)
        return
      }

      _tailLogFile();
      sendMessage('Took over lock file');
    });
  }, 5000);

  const _sendLogs = debounce( () => {
    sendMessage('tailing');
    if (lines.length) {
      sendMessage(`${lines.length} lines logged:`)
      sendMessage(lines[0])
      let batchDate = new Date
      let payload = {
        type: 'logs',
        data: lines,
        timestamp: batchDate,
        systemInfo
      };
      // streamToKinesis(payload);
      sendMessage(payload)
      let gzipped = pako.gzip(JSON.stringify(payload), { to: 'string' })
      sendMessage(gzipped)
      lines = [];
      // batchDate = null;
    }
  }, 10000)

  const _tailLogFile = () => {
    tail = new Tail(logFilePath);
    let batchDate = null;
    tail.on('line', (line) => {
      lines.push(line)
      // sendMessage(line)
      if (lines.length >= 50000) {
        _sendLogs.flush()
      }
      else {
        _sendLogs()
      }
    });

    rotator.register(logFilePath,
      { schedule: '5m', size: '5m', compress: true, count: 2 }
    );

    tail.on('error', (error) => {
      sendMessage(error);

    });
  }

}

module.exports = lockTail;
