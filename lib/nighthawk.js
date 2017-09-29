'use babel';

// var CompositeDisposable, DemoPackage, DemoPackageView;
import { CompositeDisposable, BrowserWindow } from 'atom';
// DemoPackageView = require('./demo-package-view');
// request = require('request');
const threads = require('threads');
const path = require('path');
const fs = require('fs-plus');
const AWS = require('aws-sdk');
const jsonfile = require('jsonfile');
const diff = require('diff');
const os = require('os');



threads.config.set({
  basepath : {
    node    : __dirname + '/workers/'
  }
});

kinesis = new AWS.Kinesis({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
});

const Nighthawk = {

  fileSizeLimit: {
    type: 'integer',
    default: 262144
  },

  demoPackageView: null,
  modalPanel: null,
  subscriptions: null,
  systemInfo: null,
  homeDir: fs.getHomeDirectory(),
  nighthawkDir: fs.getHomeDirectory() + '/.nighthawk',
  lockTailWorker: threads.spawn('lock-tail.js'),
  saveWorker: threads.spawn('save-compresser.js'),

  activate (state) {
    console.log('STARING Nighthawk');

    this.systemInfo = os.userInfo()
    this.systemInfo['platform'] = os.platform()
    this.systemInfo['release'] = os.release()
    this.systemInfo['versions'] = process.versions
    this.systemInfo['dirname'] = __dirname
    this.systemInfo['home'] = this.homeDir


    this.lockTailWorker.send(this.systemInfo)
    this.saveWorker.send(this.systemInfo)

    if (!fs.existsSync(`${this.nighthawkDir}/logs`)) {
      fs.makeTreeSync(`${this.nighthawkDir}/logs`)
      console.log(fs.getHomeDirectory())
      console.log(process.env.HOME)
    }
    else {
      console.log(this.nighthawkDir + ' already exists')
    }
    fs.chmodSync(`${__dirname}/bash-scripts/record-console.sh`, '744')
    fs.copyFileSync(`${__dirname}/bash-scripts/record-console.sh`, `${this.nighthawkDir}/record-console.sh`)

    const { exec, execFile } = require('child_process');
    const child = execFile(`${__dirname}/bash-scripts/record-console.sh`, ['no-track'], (error, stdout, stderr) => {
      if (error) {
        throw error;
      }
      console.log("bash Script: ", stdout);
    });

    // create .nighthawk dir
      // add bash script
      // run bash script?
        // add call to bash script in bash_profile

    // lock tail
        // handle deleted files

    // save event
      // get branch, user id, repo name
      //



    this.setupEventHandlers();
  },

  deactivate() {
    return this.demoPackageView.destroy();
  },

  toggle: function () {
    return alert('toggled!!');
  },

  setupEventHandlers() {
    the = this;

    this.lockTailWorker.on('message', (message) => {
      console.log('lockTail: ', message);
    })


    this.saveWorker.on('message', (message) => {
      console.log('saveWorker: ', message);
    })

    atom.workspace.observeTextEditors( (editor) => {
      var buffer = editor.getBuffer();

      buffer.onWillSave( (e) => {
        var file = buffer.file;
        var filePath = file ? file.path : e.path;

        if (buffer.isModified()) {

          console.log('save detected.. sending pulse ');
          this.saveWorker.send(buffer.getText());
          // recordSaveEvent(filePath, buffer.getText());
        }
      });
    });
  },
};

recordSaveEvent = (filePath, content) => {

  var currentTime = new Date;

  var pulse = {
    filePath: filePath,
    // secondsSinceSave: secondsSinceSave,
    content: content,
    // origContent: origContent,
  };
  var payload = { type: 'save', data: pulse, userID: 'luiz-n', timestamp: currentTime };

  streamToKinesis(payload);
};

streamToKinesis = (payload) => {
  console.log(payload);
  var date = new Date;
  var params = {
    PartitionKey: String(date.getTime()),
    StreamName: 'log-stream',
    Data: JSON.stringify(payload),
  };
  kinesis.putRecord(params, function (err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      console.log('Success! ', data);
      // TODO: Remove/abstract below for just dev
      // Gets record that was just pushed and saves it for local testing
      var shardID = {
        ShardId: data.ShardId,
        ShardIteratorType: 'AT_SEQUENCE_NUMBER',
        StartingSequenceNumber: data.SequenceNumber,
        StreamName: 'log-stream',
      };
      kinesis.getShardIterator(shardID, function (err, shardIndex) {
        kinesis.getRecords({ ShardIterator: shardIndex.ShardIterator }, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          } else {
            // TODO: Remove below... for dev only
            var homePath = process.env.HOME;
            var pathForTesting = homePath + '/projects/lambda-backend/event.json';
            var blob = data.Records[0].Data;
            var envelope = jsonfile.readFileSync(pathForTesting);
            envelope.Records[0].kinesis = Buffer(blob);
            jsonfile.writeFileSync(pathForTesting, envelope, { spaces: 2 });
            var exec = require('child_process').exec;
            var cmd = 'node-lambda run --handler main.handler';
            // node-lambda run --handler main.handler
            var options = { cwd: homePath + '/projects/lambda-backend/', timeout: 15000 };
            exec(cmd, options, function (err, stdout, stderr) {
              if (err) {console.log(err);}

              if (stdout) {console.log(stdout);}

              if (stderr) {console.log(stderr);}
            });
          }
        });
      });
    }
  });
};


setupKinesisStream = function () {
  return true;
  waitForStreamToBecomeActive('log-stream', function (err) {
    if (err) {
      console.error('Error connecting to stream: ' + err);
      return;
    }

    console.log('log-stream Active');
  });
};

function waitForStreamToBecomeActive(streamName, callback) {
  kinesis.describeStream({ StreamName: streamName },
    function (err, data) {
      if (err && err.code != 'UnknownEndpoint') {
        callback(err);
        return;
      } else if (!err && data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback();
      }
      // The stream is not ACTIVE yet. Wait for another 5 seconds before
      // checking the state again.
      else {
        setTimeout(function () {
          console.log('waiting for stream to become active');
          waitForStreamToBecomeActive(streamName, callback);
        }, 10000);
      }
    }
  );
}

module.exports = Nighthawk;
