'use babel';
process.on('disconnect', process.exit);

const lockFile = require('proper-lockfile');
const Tail = require('always-tail');
const rotator = require('logrotator').rotator;
const pako = require('pako');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const os = require('os')

const home = os.homedir()
const lockPath = home + '/.nighthawk/logs/nighthawk'
const logFilePath = home + '/.nighthawk/logs/session.log'
var tail = null
var lines = []
var firstTimestamp = null
var systemInfo = null
var sendMessage = null

var fileSizeLimit = { type: 'integer', default: 262144 }

const sendLogs = debounce( () => {
  sendMessage('tailing');
  if (lines.length) {
    sendMessage(`${lines.length} lines logged:`)
    sendMessage(lines[0])
    let payload = {
      type: 'logs',
      data: lines,
      firstTimestamp: firstTimestamp,
      lastTimestamp: new Date,
      systemInfo
    };
    sendMessage(payload)
    let gzipped = pako.gzip(JSON.stringify(payload), { to: 'string' })
    // sendMessage(gzipped)
    lines = [];
    firstTimestamp = null;
  }
}, 15000)

const lockTail = (input, messageHandler, progress) => {
  sendMessage = messageHandler

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

      tailLogFile();
      sendMessage('Took over lock file');
    });
  }, 5000);

  var tailLogFile = () => {
    tail = new Tail(logFilePath);
    tail.on('line', (line) => {
      firstTimestamp = firstTimestamp || new Date
      lines.push(line)
      // sendMessage(line)
      if (lines.length >= 50000) {
        sendLogs.flush()
      }
      else {
        sendLogs()
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
