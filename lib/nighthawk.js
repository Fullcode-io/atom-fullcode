'use babel';

// var CompositeDisposable, DemoPackage, DemoPackageView;
import { CompositeDisposable, BrowserWindow } from 'atom';
// DemoPackageView = require('./demo-package-view');
// request = require('request');
const threads = require('threads');
const path = require('path');
const fs = require('fs-extra');
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
  homeDir: os.homedir(),
  nighthawkDir: os.homedir() + '/.nighthawk',
  lockTailWorker: threads.spawn('lock-tail.js'),
  saveWorker: threads.spawn('save-compresser.js'),

  async activate (state) {
    console.log('STARING Nighthawk');

    this.systemInfo = os.userInfo()
    this.systemInfo['platform'] = os.platform()
    this.systemInfo['release'] = os.release()
    this.systemInfo['versions'] = process.versions
    this.systemInfo['dirname'] = __dirname
    this.systemInfo['home'] = this.homeDir

    let isWindows = /^win/.test(process.platform)
    if (!isWindows) {
      let scriptsInstalled = await this.install_script()
      if (scriptsInstalled) {
        // init lockTailWorker
        this.lockTailWorker.send(this.systemInfo)
      }
    }
    // init saveWorker
    this.saveWorker.send({systemInfo: this.systemInfo})

    this.setupEventHandlers()
  },

  async install_script() {
    let scriptCall = `${os.EOL}# This asks to start nighthawk in current process if not already running${os.EOL}. ${this.homeDir}/.nighthawk/nighthawk.sh${os.EOL}`
    try {
      await fs.ensureDir(`${this.nighthawkDir}/logs`)
      await fs.copy(`${__dirname}/bash-scripts/nighthawk.sh`, `${this.nighthawkDir}/nighthawk.sh`)
      // create .bashrc file if necessary and add nighthawk.sh script if not already present
      await fs.ensureFile(`${this.homeDir}/.bashrc`)
      let bashrc = await fs.readFile(`${this.homeDir}/.bashrc`, {encoding: 'utf8'})
      if (!bashrc.includes("/.nighthawk/nighthawk.sh")) {
        await fs.appendFile(`${this.homeDir}/.bashrc`, scriptCall)
      }

      // login shells don't call .bashrc by default when opening up a new terminal session but
      // the nighthawk.sh script has to run inside of bashrc. This code creates a
      // profile file if necessary and then adds a line to call ./bashrc
      let bashProfile = await fs.pathExists(`${this.homeDir}/.bash_profile`) ? '.bash_profile' : null
      let bashLogin = await fs.pathExists(`${this.homeDir}/.bash_login`) ? '.bash_login' : null
      let profile = await fs.pathExists(`${this.homeDir}/.profile`) ? '.profile' : null

      let profileType = bashProfile || bashLogin || profile || '.bash_profile'

      await fs.ensureFile(`${this.homeDir}/${profileType}`)
      let systemProfile = await fs.readFile(`${this.homeDir}/${profileType}`, {encoding: 'utf8'})
      let callBashrc = `${os.EOL}# Nighthawk requires .bashrc to be sourced when auto-starting in MacOS${os.EOL}[ -s $HOME/.bashrc ] && . $HOME/.bashrc${os.EOL}`

      if (!systemProfile.includes(callBashrc) && !systemProfile.includes("/.bashrc")) {
        await fs.appendFile(`${this.homeDir}/${profileType}`, callBashrc)
      }

      return true
    } catch (e) {
      if (e) {
        console.log(e)
        alert(`There was an error setting up Nighthawk scripts on your sytem. This will only prevent terminal recording (not save events):${os.EOL}${os.EOL}${e}`)
        return false
      }
    }
  },

  deactivate() {
    // return this.demoPackageView.destroy();
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
          this.saveWorker.send({filePath: filePath, text: buffer.getText()});
        }
      });
    });
  },
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
