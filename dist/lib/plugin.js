"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const through2 = require('through2');
const split = require('split2');
const PluginError = require("plugin-error");
const pkginfo = require('pkginfo')(module); // project package.json info into module.exports
const PLUGIN_NAME = module.exports.name;
const loglevel = require("loglevel");
const log = loglevel.getLogger(PLUGIN_NAME); // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn'));
/* This is a model gulp-etl plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ),
but with an additional feature: it accepts a configObj as its first parameter */
function handlelines(configObj, newHandlers) {
    let propsToAdd = configObj.propsToAdd;
    // handleLine could be the only needed piece to be replaced for most gulp-etl plugins
    const defaultHandleLine = (lineObj) => {
        for (let propName in propsToAdd) {
            lineObj[propName] = propsToAdd[propName];
        }
        return lineObj;
    };
    const defaultFinishHandler = () => {
        log.info("The handler has officially ended!");
    };
    const defaultStartHandler = () => {
        log.info("The handler has officially started!");
    };
    const handleLine = newHandlers && newHandlers.transformCallback ? newHandlers.transformCallback : defaultHandleLine;
    const finishHandler = newHandlers && newHandlers.finishCallback ? newHandlers.finishCallback : defaultFinishHandler;
    let startHandler = newHandlers && newHandlers.startCallback ? newHandlers.startCallback : defaultStartHandler;
    let transformer = through2.obj(); // new transform stream, in object mode
    // // since we're in object mode, dataLine comes as a string. Since we're counting on split
    // // to have already been called upstream, dataLine will be a single line at a time
    transformer._transform = function (dataLine, encoding, callback) {
        let returnErr = null;
        try {
            let dataObj;
            if (dataLine.trim() != "")
                dataObj = JSON.parse(dataLine);
            let handledObj = handleLine(dataObj);
            if (handledObj) {
                let handledLine = JSON.stringify(handledObj);
                log.debug(handledLine);
                this.push(handledLine + '\n');
            }
        }
        catch (err) {
            returnErr = new PluginError(PLUGIN_NAME, err);
        }
        callback(returnErr);
    };
    // creating a stream through which each file will pass
    // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
    const strm = through2.obj(function (file, encoding, cb) {
        const self = this;
        let returnErr = null;
        if (file.isNull()) {
            // return empty file
            return cb(returnErr, file);
        }
        else if (file.isBuffer()) {
            // strArray will hold file.contents, split into lines
            const strArray = file.contents.toString().split(/\r?\n/);
            let tempLine;
            let resultArray = [];
            // we'll call handleLine on each line
            for (let dataIdx in strArray) {
                try {
                    let lineObj;
                    if (strArray[dataIdx].trim() != "")
                        lineObj = JSON.parse(strArray[dataIdx]);
                    tempLine = handleLine(lineObj);
                    if (tempLine) {
                        resultArray.push(JSON.stringify(tempLine) + '\n');
                    }
                }
                catch (err) {
                    returnErr = new PluginError(PLUGIN_NAME, err);
                }
            }
            let data = resultArray.join('');
            log.debug(data);
            file.contents = Buffer.from(data);
            finishHandler();
            // send the transformed file through to the next gulp plugin, and tell the stream engine that we're done with this file
            cb(returnErr, file);
        }
        else if (file.isStream()) {
            file.contents = file.contents
                // split plugin will split the file into lines
                .pipe(split())
                .pipe(transformer)
                .on('finish', function () {
                // using finish event here instead of end since this is a Transform stream   https://nodejs.org/api/stream.html#stream_events_finish_and_end
                //the 'finish' event is emitted after stream.end() is called and all chunks have been processed by stream._transform()
                //this is when we want to pass the file along
                log.debug('finished');
                finishHandler();
            })
                .on('error', function (err) {
                log.error(err);
                self.emit('error', new PluginError(PLUGIN_NAME, err));
            });
            // after our stream is set up (not necesarily finished) we call the callback
            log.debug('calling callback');
            cb(returnErr, file);
        }
    });
    startHandler();
    return strm;
}
exports.handlelines = handlelines;
//# sourceMappingURL=plugin.js.map