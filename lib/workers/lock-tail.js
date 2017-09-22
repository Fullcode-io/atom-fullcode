
const lockFile = require('proper-lockfile');
const Tail = require('always-tail');
const rotator = require('logrotator').rotator;
const pako = require('pako');


const home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
const lockPath = home + '/.nighthawk/logs/nighthawk';

module.exports = function(input, sendMessage, progress) {
  sendMessage('lock-tail started');
  let tail = null;
  let logCacher = null;

  process.on('disconnect', () => process.exit());

  tailLogFile = () => {
    tail = new Tail(home + '/.nighthawk/logs/session.log');
    let lines = [];
    let batchDate = null;
    tail.on('line', function (line) {
      sendMessage(line);
      batchDate = batchDate || new Date;
      lines.push(line);
    });

    rotator.register(home + '/.nighthawk/logs/session.log',
      { schedule: '5m', size: '5m', compress: true, count: 2 }
    );

    logCacher = setInterval( () => {
      sendMessage('tailing');
      if (lines.length) {
        sendMessage(`${lines.length} lines logged:`)
        sendMessage(lines[0])
        let payload = { type: 'logs', data: lines, userID: 'luiz-n', timestamp: batchDate };
        // streamToKinesis(payload);
        sendMessage(payload)
        let gzipped = pako.gzip(JSON.stringify(payload), { to: 'string' })
        sendMessage(gzipped)
        lines = [];
        batchDate = null;
      } else if (!tail) {
        clearInterval(logCacher);
      }
    }, 4000);

    tail.on('error', (error) => {
      sendMessage(error);

    });
  }

  setInterval(() => {
    lockFile.lock(lockPath, { stale: 5000, realpath: false, updateDelay: 1000 }, (err) => {
      if (err) {
        sendMessage(err.code)
        return
      }

      tailLogFile();
      sendMessage('Took over lock file');
    });
  }, 5000);
};
