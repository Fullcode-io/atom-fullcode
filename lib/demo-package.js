var CompositeDisposable, DemoPackage, DemoPackageView;

DemoPackageView = require('./demo-package-view');
// request = require('request');
path = require('path');
Tail = require('always-tail');
fs = require('fs');
lockFile = require('proper-lockfile');
AWS = require('aws-sdk');
rotator = require('logrotator').rotator;
jsonfile = require('jsonfile');
// AWS.config = {
//   region: 'us-east-1',
//   update: {
//     accessKeyId: 'AKIAJZFFA4GSBZF6Z3CA',
//     secretAccessKey: '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'
//   }
// }
kinesis = new AWS.Kinesis({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
});


CompositeDisposable = require('atom').CompositeDisposable;

var DemoPackage = {
  demoPackageView: null,
  modalPanel: null,
  subscriptions: null,
  savedFiles: {},
  lastFile: null,
  lockPath: process.env.HOME + '/.nighthawk/sessions/test-lock',
  activate: function(state) {
    console.log('activated!');
    setupKinesisStream();
    // checkBashProfiles();
    // lockFile.lock(this.lockPath, {}, function(err) {
    //   if (err) {
    //     console.log(err);
    //   }
    //   else {
    //     keepLockFileFromExpiring(this.lockPath);
    //     setupKinesisStream();
    //     tailErrorLog();
    //   }
    // })
    this.setupEventHandlers();
  },
  deactivate: function() {
    lockFile.unlock(this.lockPath, function (er) {
      if (err) {
        alert('error! ', err);
        console.log(err);
      }
    })
    return this.demoPackageView.destroy();
  },
  toggle: function() {
    return alert('toggled!!');
  },

  setupEventHandlers: function() {
    the = this;
    setInterval(function(){
      lockFile.lock(the.lockPath, {stale: 5000}, function(error) {
        if (error) {
          // console.log(error);
          return;
        }
        // TODO: remove log
        console.log("Lock file missing or expired.. taking over streaming");
        tailErrorLog();
        keepLockFileFromExpiring(the.lockPath);
      })
    }, 5000);

    atom.workspace.observeTextEditors(function(editor) {
      var buffer = editor.getBuffer();


      buffer.onWillSave(function(e) {
        var file = buffer.file;
        var filePath = file ? file.path : null
        var savedFile = the.savedFiles[filePath];
        if (savedFile && buffer.isModified()) {
          var now = Date.now()
          var lastTouch = now - savedFile.atime;
          var fiveMins = 300000
          var secondsSinceSave = savedFile.secondsSinceSave
          secondsSinceSave = lastTouch < fiveMins ? secondsSinceSave + lastTouch/1000 : secondsSinceSave
          console.log("save detected.. sending pulse ", secondsSinceSave);
          sendPulse(file, Math.round(secondsSinceSave));
          savedFile.atime = now
          savedFile.secondsSinceSave = 0
          the.lastFile = filePath
        }
      })

      buffer.onDidStopChanging(function(e) {
        var file = buffer.file;
        var filePath = file ? file.path : null
        if (filePath) {
          var now = Date.now()
          var savedFile = the.savedFiles[filePath]
          if (!savedFile) {
            the.savedFiles[filePath] = {
              atime: now,
              secondsSinceSave: 0
            };
          }
          else {
            var lastTouch = now - savedFile.atime;
            var fiveMins = 300000
            if (lastTouch < fiveMins && the.lastFile === filePath) {
              savedFile.secondsSinceSave += lastTouch/1000;
            }
            savedFile.atime = now;
          }
          the.lastFile = filePath;
        }
      })
    })
  }
};

keepLockFileFromExpiring = function(path) {
  setInterval(function(){
    console.log("~!~!streaming~!~!");
    // TODO: remove this
  },5000)
}

sendPulse = function(file, secondsSinceSave) {
  if (!file || !file.path) {
    return;
  }
  var currentTime = new Date;
  var currentFile = file.path;
  if ((currentFile == null) || currentFile === undefined) {
    return;
  }
  var pulse = {
    filePath: currentFile,
    secondsSinceSave: secondsSinceSave
  };
  var payload = {type: "save", data: pulse, userID: 'luiz-n', timestamp: currentTime};
  streamToKinesis(payload);
}

tailErrorLog = function() {
  var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE
  var tail = new Tail(home+"/.nighthawk/sessions/studentLogger.log")
  var lines = [];
  tail.on("line", function(line) {
    console.log(line);
    lines.push(line);
  });

  rotator.register(home+'/.nighthawk/sessions/studentLogger.log',
    {schedule: '5m', size: '5m', compress: true, count: 2}
  );

  setInterval(function(){
    if (lines.length) {
      var payload = {type: "logs", data: lines, userID: 'luiz-n', timestamp: new Date};
      streamToKinesis(payload);
      lines = [];
    }
  }, 2000);

  tail.on("error", function(error) {
    console.log('ERROR: ', error);
  });
}

streamToKinesis = function(payload) {
  console.log(payload);
  var date = new Date;
  var params = {
    PartitionKey: String(date.getTime()),
    StreamName: "log-stream",
    Data: JSON.stringify(payload),
  };
  kinesis.putRecord(params, function(err, data) {
    if (err) {
      console.log(err, err.stack)
    }
    else {
      console.log("Success! ", data);
      // TODO: Remove/abstract below for just dev
      // Gets record that was just pushed and saves it for local testing
      var shardID = {
        "ShardId": data.ShardId,
        "ShardIteratorType": "AT_SEQUENCE_NUMBER",
        "StartingSequenceNumber": data.SequenceNumber,
        "StreamName": "log-stream"
      };
      kinesis.getShardIterator(shardID, function(err, shardIndex) {
        kinesis.getRecords({ShardIterator: shardIndex.ShardIterator}, function(err, data) {
          if (err) {
            console.log(err, err.stack);
          }
          else {
            // TODO: Remoe below... for dev

            var pathForTesting = process.env.HOME+'/projects/lambda-backend/event.json';
            var blob = data.Records[0].Data;
            var envelope = jsonfile.readFileSync(pathForTesting);
            envelope.Records[0].kinesis = Buffer(blob);
            jsonfile.writeFileSync(pathForTesting, envelope, {spaces: 2});
          }
        });
      })
    }
  })
}

setupKinesisStream = function() {
  waitForStreamToBecomeActive("log-stream", function(err) {
    if (err) {
      console.error('Error connecting to stream: ' + err);
      return;
    }
    console.log('log-stream Active');
  });
}

function waitForStreamToBecomeActive(streamName, callback) {
  kinesis.describeStream({StreamName : streamName},
    function(err, data) {
      if (err && err.code != "UnknownEndpoint") {
        callback(err);
        return;
      }

      else if (!err && data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback();
      }
      // The stream is not ACTIVE yet. Wait for another 5 seconds before
      // checking the state again.
      else {
        setTimeout(function() {
          console.log('waiting for stream to become active')
          waitForStreamToBecomeActive(streamName, callback);
        }, 10000);
      }
    }
  );
}

module.exports = DemoPackage;
