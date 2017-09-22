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
  savedFiles: {},
  lastFile: null,
  tail: null,
  logCacher: null,
  lockPath: process.env.HOME + '/.nighthawk/logs/nighthawk',
  activate (state) {
    console.log('activated!');
    var options = {
        client_id: 'your_client_id',
        client_secret: 'your_client_secret',
        scopes: ["user:email"] // Scopes limit access for OAuth tokens.
    };

    threads.spawn('lock-tail.js')
    .send('init')
      .on('message', function(message) {
        console.log('lockTail: ', message);
        if (typeof message === 'object') {
          console.log(JSON.stringify(message).length)
        }
        else {
          console.log(message.length)
        }
      })

    // // Build the OAuth consent page URL
    // var authWindow = new BrowserWindow({ width: 800, height: 600, show: false, 'node-integration': false });
    // var githubUrl = 'https://github.com/login/oauth/authorize?';
    // var authUrl = githubUrl + 'client_id=' + options.client_id + '&scope=' + options.scopes;
    // authWindow.loadURL(authUrl);
    // authWindow.show();
    this.setupEventHandlers();
  },

  // onWillDispatch: function(event) {
  //   console.log('dispatched event: ', event);
  // },

  deactivate() {
    return this.demoPackageView.destroy();
  },

  toggle: function () {
    return alert('toggled!!');
  },

  // keep checking lock file
  // tail log file
  //    compress & send log outputs
  // compress & send save outputs


  setupEventHandlers() {
    the = this;

    // atom.commands.onDidDispatch(function(event) {
    //   console.log('dispatched event: ', event);
    //
    //   if (event.type === 'tree:remove') {
    //     console.log('dispatched event: ', event);
    //   }
    // }),

    atom.workspace.observeTextEditors( (editor) => {
      var buffer = editor.getBuffer();

      buffer.onWillSave( (e) => {
        var file = buffer.file;
        var filePath = file ? file.path : e.path;
        // var savedFile = this.savedFiles[filePath];

        if (buffer.isModified()) {

          console.log('save detected.. sending pulse ');

          recordSaveEvent(filePath, buffer.getText());
          this.lastFile = filePath;
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
